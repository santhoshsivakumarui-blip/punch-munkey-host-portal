# Logo assets

Empty until the real Punch Munkey brand files land. This is `src/`, not
`public/` — files here get imported directly into components (`import logo
from '../assets/images/logo-full.svg'`) and bundled/hashed by Vite, unlike
`public/` (see that folder's own note), which serves files byte-for-byte at
a fixed URL. Use this location for anything actually rendered inside a page
(sidebar brand mark, sign-in panel, landing page hero); `public/` is for the
favicon only.

Expected files, matching the brand sheet's own crops:

| File | Used for |
| --- | --- |
| `logo-full.svg` (or `.png`) | "Full Primary Logo" — the landing page hero (`HostLandingPage.tsx`) |
| `logo-mark.svg` (or `.png`) | "Minimalist Symbol" — small brand-mark dot currently a plain CSS circle (`.brand-mark` in `styles.css`, used in `Layout.tsx`'s sidebar and every sign-in/sign-up page's brand panel) |
| `wordmark.svg` (or `.png`) | "Horizontal Wordmark" — anywhere the full "PUNCH MUNKEY" lockup fits better than the icon + text-span combo currently used |
| `logo-mono-dark.svg` / `logo-mono-light.svg` | Single-color variations — for placement on a background where the full-color mark doesn't have enough contrast (e.g. the dark sidebar vs. a light auth panel) |

SVG preferred over PNG for anything that scales (sidebar mark, favicon-adjacent
uses) — crisp at any size, no `@2x`/`@3x` juggling.
