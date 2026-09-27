import { clearToken, getToken } from './session';
import type { HostDocument, HostDocumentType } from './types';

// First fetch wrapper in this app — same request()/ApiError shape as
// punch-munkey-admin-portal/punch-munkey-support-portal's lib/api.ts, but bearer-token auth
// instead of `credentials: 'include'` (see session.ts's doc comment for why
// host auth is a different contract from operator auth).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

/**
 * Routed through api-gateway's WebSocket-upgrade relay (see api-gateway's
 * own `server.on('upgrade', ...)`) rather than event-service's own published
 * port directly — same gateway origin every other request in this file
 * uses, derived from API_BASE_URL instead of a second env var so the two
 * can't drift apart.
 */
export function eventLiveWsUrl(eventId: string, token: string): string {
  const wsBase = API_BASE_URL.replace(/^http/, 'ws');
  return `${wsBase}/api/event-service/events/${eventId}/live?token=${encodeURIComponent(token)}`;
}

export interface ApiErrorBody {
  code?: string;
  message: string;
  attemptsRemaining?: number;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    // A 401 here means the held token is gone/expired server-side (there's
    // no refresh flow) — drop it so the next render falls through to
    // sign-in instead of retrying with a token that will never work again.
    if (res.status === 401) clearToken();
    const parsed = await res.json().catch(() => null);
    const message = parsed?.error?.message ?? parsed?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, { code: parsed?.error?.code, message, attemptsRemaining: parsed?.error?.attemptsRemaining, retryAfterSeconds: parsed?.error?.retryAfterSeconds });
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// --- Real endpoints (identity-service/src/routes/{auth,hosts}.ts) ---

/** `POST /auth/otp/request` — the same guest-facing OTP issuance host
 * onboarding reuses (identity-service/src/routes/hosts.ts's own comment:
 * "reuses the same Redis-backed OTP flow guests use... rather than
 * building the parallel email/password host auth the design handoff's
 * screens 2c/3d/3e/3f imply"). SMS delivery is still TODO server-side; the
 * OTP is logged to the api-gateway console in the meantime. */
export function requestOtp(phoneE164: string): Promise<{ message: string; expiresInSeconds: number }> {
  return request('/api/identity-service/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phoneE164 }),
  });
}

export interface HostProfile {
  id: string;
  userId: string;
  legalEntity: string;
  entityType: 'individual' | 'organisation';
  displayName: string;
  kyhState: string;
  // Drizzle returns a `numeric` column as a string, not a number — real
  // column (`hosts.reliability`, drops on cancellation), always present on
  // `GET /hosts/me`'s full row; just never copied into `HostUser` before.
  reliability: string;
}

/**
 * `POST /hosts/apply` — the *only* endpoint that can create the `hosts` row
 * (legalEntity/displayName), so sign-up still goes through this. Verified
 * against identity-service's own code (its "only ever mints guest tokens"
 * comment on `/auth/otp/verify` was stale — see that route's current
 * comment) that a RETURNING host doesn't need this at all: `verifyOtp`
 * below already returns a real host-kind token from just phone + OTP. This
 * function is sign-up only now — see useSignInForm.ts for sign-in.
 */
export function applyAsHost(input: {
  phoneE164: string;
  otp: string;
  legalEntity: string;
  entityType: 'individual' | 'organisation';
  displayName: string;
}): Promise<{ accessToken: string; host: HostProfile; isNewApplication: boolean }> {
  return request('/api/identity-service/hosts/apply', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface AuthUser {
  id: string;
  kind: 'guest' | 'host' | 'operator' | 'promoter';
  phoneE164: string;
}

/**
 * `POST /auth/otp/verify` — the shared, lighter-weight verify punch-munkey-guest-app
 * also uses. For a phone that's already a host, this mints a real host-kind
 * token from just phone + OTP; no legalEntity/displayName round-trip. The
 * caller (signInWithOtpAtom) still has to check `user.kind === 'host'`
 * itself — this route happily mints a *new guest* account for a phone it's
 * never seen before (same as it does for punch-munkey-guest-app), which is the
 * wrong outcome for someone trying to sign in as a host who mistyped their
 * number or never applied — that's not this function's job to prevent.
 */
export function verifyOtp(phoneE164: string, otp: string): Promise<{ accessToken: string; user: AuthUser; isNewUser: boolean }> {
  return request('/api/identity-service/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phoneE164, otp }),
  });
}

/** `GET /hosts/me` — session restore on load, same role session restore
 * plays in punch-munkey-admin-portal/punch-munkey-support-portal's auth.tsx, just bearer-
 * token-driven instead of cookie-driven. */
export function fetchHostMe(): Promise<HostProfile> {
  return request('/api/identity-service/hosts/me');
}

// --- Generic client + every other real host-facing route this portal
// calls, in one place — see each punch-munkey-services/services/<name>/src/routes/
// *.ts for the source of truth. Mirrors punch-munkey-host-app/lib/api.ts's shape. ---

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
}

async function genericRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey } = opts;
  return request<T>(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
  });
}

/**
 * Multipart upload — the one request in this portal that can't go through
 * request()/genericRequest(), since those always send `content-type:
 * application/json`. Left `content-type` unset deliberately: the browser
 * sets `multipart/form-data; boundary=...` itself from the FormData body,
 * which fetch can only do when the header isn't pre-set.
 */
export async function uploadHostDocument(file: File, docType: HostDocumentType): Promise<HostDocument> {
  const token = getToken();
  const body = new FormData();
  body.append('docType', docType);
  body.append('document', file);
  const res = await fetch(`${API_BASE_URL}${paths.hostsMeDocuments}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  });
  if (!res.ok) {
    if (res.status === 401) clearToken();
    const parsed = await res.json().catch(() => null);
    const message = parsed?.error?.message ?? parsed?.error ?? `Upload failed (${res.status})`;
    throw new ApiError(res.status, { code: parsed?.error?.code, message });
  }
  return res.json();
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) => genericRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    genericRequest<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    genericRequest<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    genericRequest<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    genericRequest<T>(path, { ...opts, method: 'DELETE', body }),
};

export const paths = {
  hostsMeSignOutEverywhere: '/api/identity-service/hosts/me/sign-out-everywhere',
  hostsMeEvents: '/api/event-service/hosts/me/events',
  /** `?q=` — Elasticsearch-backed search over this host's own events (title/venue, any state — event-service's hostEvents.ts + lib/searchIndex.ts), relevance-ordered rather than `desc(doorsAt)`. */
  hostsMeEventsSearch: (q: string) => `/api/event-service/hosts/me/events?q=${encodeURIComponent(q)}`,
  events: '/api/event-service/events',
  event: (id: string) => `/api/event-service/events/${id}`,
  /** Exact address + gate code, stored encrypted by location-service.
   * PUT to save, GET (owning host only) to read back. */
  /** Guests scanned in at this host's earlier nights (count), for the wizard's "Announce to". */
  hostsMePastGuests: '/api/event-service/hosts/me/past-guests',
  /** Host's single continuous support conversation (compliance-service). */
  meSupportThread: '/api/compliance-service/me/support/thread',
  meSupportMessages: '/api/compliance-service/me/support/messages',
  /** Platform fee / TDS / GST-on-fee rates, as fractions (payments-service). */
  hostsMeFeeRates: '/api/payments-service/hosts/me/fee-rates',
  /** Ticket tiers (ticketing-service): GET list, POST add. */
  eventTiers: (id: string) => `/api/ticketing-service/events/${id}/tiers`,
  /** One tier: PATCH edit, DELETE stop selling. */
  eventTier: (id: string, tierId: string) => `/api/ticketing-service/events/${id}/tiers/${tierId}`,
  /** Whole menu + alcohol cap (fnb-service). GET to load, PUT to save all of it. */
  eventMenu: (id: string) => `/api/fnb-service/events/${id}/fnb/menu`,
  eventLocation: (id: string) => `/api/event-service/events/${id}/location`,
  eventDashboard: (id: string) => `/api/event-service/events/${id}/dashboard`,
  eventSubmit: (id: string) => `/api/event-service/events/${id}/submit`,
  eventPublish: (id: string) => `/api/event-service/events/${id}/publish`,
  eventCancel: (id: string) => `/api/event-service/events/${id}/cancel`,
  eventPostpone: (id: string) => `/api/event-service/events/${id}/postpone`,
  eventReopen: (id: string) => `/api/event-service/events/${id}/reopen`,
  eventPauseSales: (id: string) => `/api/event-service/events/${id}/pause-sales`,
  eventResumeSales: (id: string) => `/api/event-service/events/${id}/resume-sales`,
  eventGuests: (id: string) => `/api/event-service/events/${id}/guests`,
  eventGuestApprove: (id: string, passId: string) => `/api/event-service/events/${id}/guests/${passId}/approve`,
  eventGuestDecline: (id: string, passId: string) => `/api/event-service/events/${id}/guests/${passId}/decline`,
  eventHostThreads: (id: string) => `/api/event-service/events/${id}/host-threads`,
  eventHostThread: (id: string, guestId: string) => `/api/event-service/events/${id}/host-threads/${guestId}`,
  eventHostThreadMessages: (id: string, guestId: string) => `/api/event-service/events/${id}/host-threads/${guestId}/messages`,
  hostsMePromoters: '/api/event-service/hosts/me/promoters',

  devices: '/api/ticketing-service/devices',
  devicePair: '/api/ticketing-service/devices/pair',
  deviceUnpair: (id: string) => `/api/ticketing-service/devices/${id}`,
  hostsMeTransfers: '/api/ticketing-service/hosts/me/transfers',
  transferHostDecision: (id: string) => `/api/ticketing-service/transfers/${id}/host-decision`,
  hostsMeInvites: '/api/ticketing-service/hosts/me/invites',
  invite: (token: string) => `/api/ticketing-service/invites/${token}`,
  inviteAccept: (token: string) => `/api/ticketing-service/invites/${token}/accept`,
  /** `?q=` — box-office/guest lookup by handle or pass code, scoped to this host's own events (ticketing-service's hostPasses.ts + lib/searchIndex.ts). */
  hostsMePassesSearch: (q: string) => `/api/ticketing-service/hosts/me/passes/search?q=${encodeURIComponent(q)}`,

  // fnb-service. eventFnbStock is staff-only (real stock counts + billing
  // by category); eventFnbCreate posts to the same base path GET reads.
  eventFnbStock: (id: string) => `/api/fnb-service/events/${id}/fnb/stock`,
  eventFnbCreate: (id: string) => `/api/fnb-service/events/${id}/fnb`,
  eventFnbInvoice: (id: string) => `/api/fnb-service/events/${id}/fnb/invoice`,
  fnbItem: (id: string) => `/api/fnb-service/fnb/items/${id}`,
  fnbItemCorrectStock: (id: string) => `/api/fnb-service/fnb/items/${id}`,
  fnbRedemptionVoid: (id: string) => `/api/fnb-service/fnb/redemptions/${id}/void`,

  hostsMeSuppliers: '/api/fnb-service/hosts/me/suppliers',
  hostsMePurchaseOrders: '/api/fnb-service/hosts/me/purchase-orders',
  purchaseOrderReceive: (id: string) => `/api/fnb-service/hosts/me/purchase-orders/${id}/receive`,
  hostsMeTaxConfig: '/api/fnb-service/hosts/me/tax-config',
  accountingSummary: (eventId: string) => `/api/fnb-service/hosts/me/accounting/summary?eventId=${encodeURIComponent(eventId)}`,

  hostsMePayouts: '/api/payments-service/hosts/me/payouts',
  hostsMeBank: '/api/payments-service/hosts/me/bank',
  hostsMeTax: '/api/payments-service/hosts/me/tax',
  hostsMeDisputes: '/api/payments-service/hosts/me/disputes',
  disputeEvidence: (id: string) => `/api/payments-service/disputes/${id}/evidence`,

  hostsMeReports: '/api/safety-service/hosts/me/reports',
  reportHostResponse: (id: string) => `/api/safety-service/reports/${id}/host-response`,
  hostsMeSafetyScore: '/api/safety-service/hosts/me/safety-score',

  meNotifications: '/api/notification-service/me/notifications',
  notificationRead: (id: string) => `/api/notification-service/me/notifications/${id}/read`,

  hostsMeDocuments: '/api/identity-service/hosts/me/documents',

  hostsMeReviews: (query: { stars: number | 'all'; limit: number; offset: number }) => {
    const params = new URLSearchParams({ limit: String(query.limit), offset: String(query.offset) });
    if (query.stars !== 'all') params.set('stars', String(query.stars));
    return `/api/identity-service/hosts/me/reviews?${params.toString()}`;
  },
};
