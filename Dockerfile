# Build from the monorepo root: `docker build -f punch-munkey-host-portal/Dockerfile .`
# — same reasoning as every backend service's Dockerfile (see e.g.
# punch-munkey-services/services/api-gateway/Dockerfile): this app's one workspace
# dependency, @punch-munkey/ui-web, is a sibling directory a Dockerfile scoped to
# punch-munkey-host-portal alone could never see.
#
# Unlike the backend Dockerfiles, this does NOT install from the real repo
# root package.json — that workspace list also includes punch-munkey-guest-app and
# punch-munkey-host-app (Expo/React Native apps with a large, unrelated dependency
# tree), and yarn classic requires every workspace it lists to actually be
# present. docker/root-package.json is a trimmed two-member stand-in
# (@punch-munkey/ui-web + punch-munkey-host-portal only) that resolves the exact same way for
# the one dependency this app actually has, without paying to install two
# mobile apps' worth of packages to build a static site that never touches
# them. See that file's own comment.
FROM node:20-alpine AS build
WORKDIR /app
# node:20-alpine already ships a corepack-shimmed `yarn` — `npm install -g
# yarn` collides with it (EEXIST). corepack's own `prepare` is the correct
# way to pin the exact version (matches the real repo root's
# `"packageManager": "yarn@1.22.22"`, which this trimmed build doesn't copy).
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY punch-munkey-host-portal/docker/root-package.json ./package.json
COPY punch-munkey-ui-web ./punch-munkey-ui-web
COPY punch-munkey-host-portal ./punch-munkey-host-portal
RUN yarn install

# @punch-munkey/ui-web ships compiled (`main`/`types` point at dist/ — see its own
# package.json) — punch-munkey-host-portal's own build (`tsc -b && vite build`)
# resolves it as a real published package, not source, so it has to be
# built first or `tsc -b`'s project-reference resolution and Vite's own
# module resolution both fail to find it.
RUN yarn workspace @punch-munkey/ui-web run build

# Baked in at build time (Vite inlines `import.meta.env.VITE_*` into the
# bundle — there's no reading these at container start) — see
# punch-munkey-host-portal/.env.example for what each one means and why. Defaults
# match local dev; a real deploy passes real ones via --build-arg.
ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN yarn workspace punch-munkey-host-portal run build

# The build stage's node_modules (yarn, TypeScript, Vite, every dev
# dependency of both workspaces) never needs to exist past this point —
# only punch-munkey-host-portal/dist, the static output, does. nginx serves it.
FROM nginx:1.27-alpine
COPY punch-munkey-host-portal/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/punch-munkey-host-portal/dist /usr/share/nginx/html
EXPOSE 80
