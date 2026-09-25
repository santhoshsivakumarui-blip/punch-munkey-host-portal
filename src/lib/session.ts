/**
 * Token storage — the one thing this portal's auth genuinely does
 * differently from jfc-admin-portal/jfc-support-portal. Those two portals
 * sit behind identity-service's operator session (httpOnly cookie,
 * `credentials: 'include'`, nothing for the client to hold). Host auth is a
 * different contract: `POST /hosts/apply` (identity-service's
 * src/routes/hosts.ts) returns a bearer `accessToken` directly in the JSON
 * body, checked by `trustGatewayIdentity` reading `Authorization: Bearer`.
 * There is no host equivalent of the cookie session, so this app has to
 * hold the token itself — localStorage, since a plain web app has no
 * secure-store equivalent (mirrors how little trust the token itself
 * carries: it's a bearer JWT, not a refresh-rotated session).
 */
const STORAGE_KEY = 'jfc-host-portal:token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* private browsing / storage disabled — session just won't survive a refresh */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clean up if storage never worked */
  }
}

/**
 * Written on every successful `POST /hosts/apply` (sign-up). Nothing reads
 * it back today — sign-in verifies with just phone + otp now (lib/api.ts's
 * verifyOtp), and SignUpPage always starts blank — so this is currently
 * write-only. Left in place rather than ripped out since it's a natural
 * pre-fill source if SignUpPage ever wants to resume an abandoned
 * application; not otherwise load-bearing for auth, which re-validates OTP
 * server-side regardless of anything cached here.
 */
const PROFILE_CACHE_KEY = 'jfc-host-portal:last-profile';

export interface CachedHostProfile {
  phoneE164: string;
  legalEntity: string;
  displayName: string;
}

export function getCachedProfile(): CachedHostProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedHostProfile) : null;
  } catch {
    return null;
  }
}

export function setCachedProfile(profile: CachedHostProfile): void {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    /* non-fatal — just skips the pre-fill next time */
  }
}
