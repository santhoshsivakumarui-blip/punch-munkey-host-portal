# jfc-host-portal

JFC Host — **standalone web-only portal** (React + Vite) for the "desk" half of the
Host experience: KYH onboarding, the 5-step event wizard, screening & ratio,
transfers, payouts, disputes, ratings, promoters, notifications and staff device
pairing. The "floor" half (live dashboard, scanner, bar terminal, staff chat, SOS) is
`jfc-host-app` (Expo/React Native) — see
`../ui-ai/design_handoff_justforcpls/01-architecture.md`'s Host section for the split.

`1h` (screening) and `7g` (transfers) were briefly misrouted into `jfc-host-app` in an
earlier pass here, following `07-navigation.md`'s route tree and `06-screen-specs.md`'s
table — both docs disagree with the actual design frames, which draw both at 1180px
(desktop), not 390px. Checked directly against `designs/justforcpls - Host.dc.html`
and moved here, onto `/requests` — both screens share one "Requests" sidebar item and
pending-count badge in the design itself, so they're one page with two tabs rather
than two separate nav entries.

It is a separate repo from `jfc-admin-portal`, `jfc-support-portal`, `jfc-guest-app`
and `jfc-host-app`, but **is** an npm/Yarn workspace member alongside them and the two
shared UI libraries — see `../package.json` and the architecture doc's "Shared UI
libraries" section for why.

**Audience:** Hosts running private nights, and the staff they invite.

**Pages** (built against `ui-ai/design_handoff_justforcpls`, screens `2c 3d 3f 3g 6a
2j 2k 1g 2m 2l 5e 6b 6d 7g 1h 2o 8h 7h 7i 7j 1i 6c 2d`):
- **Landing** (`6a`) — public marketing, always reachable
- **Sign up / Sign in** (`2c`/`3d`) — phone + OTP (see Status below — not the
  email/password flow the designs assume)
- **Verify pending** (`3f`) — phone verified, KYH review in progress
- **Invite accept** (`3g`) — staff joining a host's team
- **Events** (`6b`) — the events index, this portal's authenticated home
- **Event wizard** (`2j`–`2l`, `5e`) — basics → location → menu → staff → review/publish,
  saved to a local draft at every step
- **Cancel or postpone** (`6d`)
- **Requests** (`7g` transfers + `1h` screening & ratio) — one page, two tabs
- **Payouts & escrow** (`2o`), **Payout account & tax** (`8h`)
- **Disputes & chargebacks** (`7h`), **Reports inbox** (`7i`), **Ratings & safety
  score** (`7j`)
- **Host-and-earn / Promoters** (`1i`), **Notifications** (`6c`), **Staff devices**
  (`2d`)

All pages are built against `@jfc/ui-web` — a real, live workspace dependency (see
`package.json`), not a local copy. `src/main.tsx` imports its `@jfc/ui-web/tokens.css`
for the paper-theme design tokens; `src/styles.css` holds the handful of classes
specific to Host (the wizard step indicator) that don't belong in the shared library
yet.

## Local development

Install from the **workspace root** (`../`), not from inside this folder —
`@jfc/ui-web` needs to be symlinked in by the root install:

```bash
cd ..
yarn install     # not `npm install` — see the architecture doc's note on why
cd jfc-host-portal
npm run dev
```

## Status

**Auth is real but genuinely different from the other two portals.**
`jfc-admin-portal`/`jfc-support-portal` sit behind identity-service's operator
session (httpOnly cookie). Host auth is a different contract:
`identity-service/src/routes/hosts.ts`'s own comment explains why —
`POST /hosts/apply` reuses the guest OTP flow (`POST /auth/otp/request`, then
`/hosts/apply` itself verifies the OTP) and returns a bearer JWT directly in the
response body, rather than the parallel email/password host auth the design
screens `2c`/`3d`/`3e`/`3f` assume. Two consequences worth stating plainly rather
than working around silently:

- **There is no dedicated host login endpoint** — only `/hosts/apply`, which is
  idempotent for a returning host but still requires `legalEntity`/`displayName` on
  every call. `SignInPage` asks for those two fields too (pre-filled from a local
  cache after the first successful application) — see `src/lib/api.ts` and
  `src/auth.tsx`'s doc comments.
- **`3e` (forgot/reset password) doesn't exist here** — there's no password to
  reset. Dropped rather than faked.
- The token is held in `localStorage` (`src/lib/session.ts`), not an httpOnly
  cookie — this app has to attach `Authorization: Bearer` itself on every request.

**Government ID / KYC upload (`2c`) has no backend.** `hosts.ts` says so explicitly
("Document-based KYC/KYH itself is still out of scope, same TODO as elsewhere") —
`SignUpPage`'s file input is present and disabled with that stated, not silently
accepting a file that goes nowhere.

Each page's data beyond `/hosts/apply` and `/hosts/me` is **mocked inline**, since
`jfc-services` doesn't have the rest of `04-api-surface.md`'s Host endpoints yet
(events, payouts, disputes, reports, ratings, promoters, notifications, device
pairing). The event wizard's per-step "save" is real client-side (a localStorage
draft, `src/lib/wizardDraft.ts`) but not yet the real `PATCH /events/:id` the design
calls for.

## Brand assets

`src/assets/images/` and `public/` are both empty right now — see each
folder's own README for exactly which files go where and why (`public/`
serves a file byte-for-byte at a fixed URL, so only the favicon belongs
there; everything actually rendered inside a page belongs in `src/`
instead). Once the favicon file lands in `public/`, `index.html` needs one
new `<link rel="icon">` line — there's no favicon reference there today.
