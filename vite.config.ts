import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Injects a production-strength CSP + referrer-policy meta tag into the
 * built `index.html` only — mirrors punch-munkey-admin-portal/punch-munkey-support-portal's
 * identical plugin. See punch-munkey-support-portal/vite.config.ts for the full
 * reasoning (dev-server HMR needs `unsafe-eval`/`ws:`; the built static
 * bundle doesn't, and framing-related headers can't be set via <meta> at
 * all, so those three belong at the hosting layer instead).
 */
function productionSecurityHeaders(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return {
    name: 'punch-munkey-production-security-headers',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n` +
          `    <meta name="referrer" content="strict-origin-when-cross-origin" />\n` +
          '  </head>',
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), productionSecurityHeaders()],
  server: {
    // Pinned, not left to Vite's default-5173-then-increment behavior:
    // punch-munkey-host-app's "More" tab (app/(host)/(tabs)/more.tsx) hardcodes
    // `http://localhost:5173` as its fallback HOST_PORTAL_URL, assuming
    // this app owns that port. Without a fixed port here, whichever of
    // host/support/admin-portal happened to start first claimed 5173 —
    // if that was support-portal, every link in host-app's More menu
    // silently opened support-portal instead. `strictPort` turns a port
    // collision into a loud startup error instead of a silent, wrong port.
    port: 5173,
    strictPort: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    },
  },
});
