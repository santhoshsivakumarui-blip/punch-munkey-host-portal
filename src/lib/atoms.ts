import { atom } from 'jotai';
import { atomWithRefresh, loadable } from 'jotai/utils';
import { api, ApiError, applyAsHost, fetchHostMe, paths, requestOtp, uploadHostDocument, verifyOtp } from './api';
import { clearToken, getCachedProfile, setCachedProfile, setToken } from './session';
import type { HostProfile } from './api';
import type {
  AccountingSummary,
  BankDetails,
  DeviceRecord,
  DisputeRecord,
  EventRecord,
  GuestRow,
  HostDocument,
  HostDocumentType,
  HostReviewsResponse,
  HostThreadMessage,
  HostThreadSummary,
  HostSafetyScore,
  NotificationItem,
  PairedDevice,
  PayoutRecord,
  PendingTransfer,
  PromoterReferral,
  PurchaseOrder,
  StaffInviteCreated,
  Supplier,
  TaxConfig,
  TaxMonth,
} from './types';

export interface HostUser {
  id: string;
  legalEntity: string;
  entityType: 'individual' | 'organisation';
  displayName: string;
  kyhState: string;
  reliability: string;
}

function toHostUser(profile: HostProfile): HostUser {
  return {
    id: profile.id,
    legalEntity: profile.legalEntity,
    entityType: profile.entityType,
    displayName: profile.displayName,
    kyhState: profile.kyhState,
    reliability: profile.reliability,
  };
}

export interface SessionState {
  user: HostUser | null;
  isRestoring: boolean;
  expiredFromIdle: boolean;
}

/** The one root atom `App.tsx`'s `RequireAuth`/`PublicOnlyRoute` read —
 * replaces the old `AuthContext`. Bootstrapped once from `main.tsx`. */
export const sessionAtom = atom<SessionState>({ user: null, isRestoring: true, expiredFromIdle: false });

export const bootstrapSessionAtom = atom(null, async (_get, set) => {
  try {
    const profile = await fetchHostMe();
    set(sessionAtom, { user: toHostUser(profile), isRestoring: false, expiredFromIdle: false });
  } catch {
    set(sessionAtom, { user: null, isRestoring: false, expiredFromIdle: false });
  }
});

export const otpSentAtom = atom(false);

export const requestOtpAtom = atom(null, async (_get, set, phoneE164: string) => {
  set(otpSentAtom, false);
  await requestOtp(phoneE164);
  set(otpSentAtom, true);
});

export const signInAtom = atom(
  null,
  async (
    _get,
    set,
    input: { phoneE164: string; otp: string; legalEntity: string; entityType: 'individual' | 'organisation'; displayName: string },
  ): Promise<{ isNewApplication: boolean }> => {
    const { accessToken, host, isNewApplication } = await applyAsHost(input);
    setToken(accessToken);
    setCachedProfile({ phoneE164: input.phoneE164, legalEntity: input.legalEntity, displayName: input.displayName });
    set(sessionAtom, { user: toHostUser(host), isRestoring: false, expiredFromIdle: false });
    return { isNewApplication };
  },
);

/**
 * Sign-in path — `POST /auth/otp/verify` only (phone + otp), no
 * legalEntity/displayName round-trip. That route mints a token for ANY
 * phone (it happily provisions a fresh guest for one it's never seen), so
 * this atom is what turns "verified" into "verified as a host": on a
 * non-host `kind` it throws without ever calling setToken/mutating
 * sessionAtom — no session is created for a guest/operator number that
 * tries to sign in here, even though identity-service may already have
 * created a stray guest row for it server-side (an accepted, honest
 * side-effect of reusing shared OTP infra rather than something worth
 * hiding). On success, `/auth/otp/verify`'s response only carries the bare
 * `users` row — no legalEntity/displayName/kyhState — so this follows up
 * with `fetchHostMe()` to populate the real HostUser session state.
 */
export const signInWithOtpAtom = atom(
  null,
  async (_get, set, input: { phoneE164: string; otp: string }): Promise<void> => {
    const { accessToken, user } = await verifyOtp(input.phoneE164, input.otp);
    if (user.kind !== 'host') {
      throw new ApiError(403, {
        code: 'NOT_A_HOST',
        message: "This number isn't registered as a host yet — apply to host instead.",
      });
    }
    setToken(accessToken);
    const profile = await fetchHostMe();
    set(sessionAtom, { user: toHostUser(profile), isRestoring: false, expiredFromIdle: false });
  },
);

/**
 * Now a real "sign out everywhere," not just a local token clear — calls
 * `POST /hosts/me/sign-out-everywhere` (identity-service) first, which
 * bumps `users.sessionVersion` server-side and ends every paired door/bar
 * device's token in the same call (they carry this host's own `sv` — see
 * ticketing-service's `POST /devices/pair`). Best-effort: if the network
 * call fails, this still clears the local session either way (a host
 * shouldn't be stuck signed in on THIS device because of a dropped
 * request) — the caller shows a toast when `everywhereConfirmed` comes
 * back false, since that means only this device actually signed out.
 */
export const signOutAtom = atom(null, async (_get, set): Promise<{ everywhereConfirmed: boolean }> => {
  let everywhereConfirmed = false;
  try {
    await api.post(paths.hostsMeSignOutEverywhere);
    everywhereConfirmed = true;
  } catch {
    /* best-effort — see doc comment above */
  }
  clearToken();
  set(sessionAtom, { user: null, isRestoring: false, expiredFromIdle: false });
  return { everywhereConfirmed };
});

export const markExpiredAtom = atom(null, (_get, set) => {
  clearToken();
  set(sessionAtom, { user: null, isRestoring: false, expiredFromIdle: true });
});

export const clearExpiredFlagAtom = atom(null, (get, set) => {
  set(sessionAtom, { ...get(sessionAtom), expiredFromIdle: false });
});

export { getCachedProfile, ApiError };

// ---------------------------------------------------------------------
// Data atoms — one `atomWithRefresh` per GET this portal now makes for
// real, wrapped in `loadable()` at the call site so a page renders
// {state:'loading'|'hasData'|'hasError'} instead of needing Suspense.
// Mutations are plain write-only atoms; the calling page's own try/catch
// re-triggers a refresh and shows a toast on failure (`useToast` is a
// component-level hook, not reachable from a plain atom).
// ---------------------------------------------------------------------

export const eventsAtom = atomWithRefresh<Promise<EventRecord[]>>(async () => {
  const { data } = await api.get<{ data: EventRecord[] }>(paths.hostsMeEvents);
  return data;
});
export const eventsLoadable = loadable(eventsAtom);

export const payoutsAtom = atomWithRefresh<Promise<PayoutRecord[]>>(async () => {
  const { data } = await api.get<{ data: PayoutRecord[] }>(paths.hostsMePayouts);
  return data;
});
export const payoutsLoadable = loadable(payoutsAtom);

/** `null` when nothing's on file yet, not an error — see the route's own doc comment. */
export const bankDetailsAtom = atomWithRefresh<Promise<BankDetails | null>>(async () => api.get<BankDetails | null>(paths.hostsMeBank));
export const bankDetailsLoadable = loadable(bankDetailsAtom);

export const taxAtom = atomWithRefresh<Promise<TaxMonth[]>>(async () => {
  const { data } = await api.get<{ data: TaxMonth[] }>(paths.hostsMeTax);
  return data;
});
export const taxLoadable = loadable(taxAtom);

export const disputesAtom = atomWithRefresh<Promise<DisputeRecord[]>>(async () => {
  const { data } = await api.get<{ data: DisputeRecord[] }>(paths.hostsMeDisputes);
  return data;
});
export const disputesLoadable = loadable(disputesAtom);

export const reportsAtom = atomWithRefresh<Promise<{ id: string; eventId: string; category: string; body: string; hostResponse: string | null; filedAt: string }[]>>(
  async () => {
    const { data } = await api.get<{ data: { id: string; eventId: string; category: string; body: string; hostResponse: string | null; filedAt: string }[] }>(
      paths.hostsMeReports,
    );
    return data;
  },
);
export const reportsLoadable = loadable(reportsAtom);

export const notificationsAtom = atomWithRefresh<Promise<NotificationItem[]>>(async () => {
  const { data } = await api.get<{ data: NotificationItem[] }>(paths.meNotifications);
  return data;
});
export const notificationsLoadable = loadable(notificationsAtom);

export const hostDocumentsAtom = atomWithRefresh<Promise<HostDocument[]>>(async () => {
  const { data } = await api.get<{ data: HostDocument[] }>(paths.hostsMeDocuments);
  return data;
});
export const hostDocumentsLoadable = loadable(hostDocumentsAtom);

/** Multipart, so it bypasses api.post — see uploadHostDocument's own doc comment in api.ts. */
export const uploadHostDocumentAtom = atom(null, async (_get, _set, input: { file: File; docType: HostDocumentType }): Promise<HostDocument> =>
  uploadHostDocument(input.file, input.docType),
);

export const promotersAtom = atomWithRefresh<Promise<PromoterReferral[]>>(async () => {
  const { data } = await api.get<{ data: PromoterReferral[] }>(paths.hostsMePromoters);
  return data;
});
export const promotersLoadable = loadable(promotersAtom);

export const transfersAtom = atomWithRefresh<Promise<PendingTransfer[]>>(async () => {
  const { data } = await api.get<{ data: PendingTransfer[] }>(paths.hostsMeTransfers);
  return data;
});
export const transfersLoadable = loadable(transfersAtom);

/** Guests (screening) for one event — keyed by eventId, refetched whenever
 * the id changes (the calling page passes a fresh `eventId` param). */
export function eventGuestsAtom(eventId: string) {
  return atomWithRefresh<
    Promise<{ guests: GuestRow[]; screening: { minRating: number | null; requiresApproval: boolean; minRatioWomen: number | null }; capacity: number; capacityHeld: number }>
  >(async () => api.get(paths.eventGuests(eventId)));
}

/** Every guest thread for one event, newest-message-first — same per-eventId
 * factory-atom pattern as eventGuestsAtom above. */
export function eventHostThreadsAtom(eventId: string) {
  return atomWithRefresh<Promise<HostThreadSummary[]>>(async () => {
    const { data } = await api.get<{ data: HostThreadSummary[] }>(paths.eventHostThreads(eventId));
    return data;
  });
}

/** One guest's full thread for one event — re-created whenever either id changes. */
export function eventHostThreadAtom(eventId: string, guestId: string) {
  return atomWithRefresh<Promise<HostThreadMessage[]>>(async () => {
    const { data } = await api.get<{ data: HostThreadMessage[] }>(paths.eventHostThread(eventId, guestId));
    return data;
  });
}

/** Reviews for one (stars filter, page) combination — same re-create-the-atom-
 * on-param-change pattern as `eventGuestsAtom` above. `summary` (the
 * average + breakdown) comes back on every call regardless of the stars
 * filter — see the route's own comment for why — so it stays correct even
 * while the page below it is filtered down to one star rating. */
export function hostReviewsAtom(params: { stars: number | 'all'; page: number; pageSize: number }) {
  return atomWithRefresh<Promise<HostReviewsResponse>>(async () =>
    api.get(paths.hostsMeReviews({ stars: params.stars, limit: params.pageSize, offset: (params.page - 1) * params.pageSize })),
  );
}

export const safetyScoreAtom = atomWithRefresh<Promise<HostSafetyScore>>(async () => api.get(paths.hostsMeSafetyScore));
export const safetyScoreLoadable = loadable(safetyScoreAtom);

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------

export const submitBankDetailsAtom = atom(
  null,
  async (_get, _set, input: { accountHolderName: string; accountNumber: string; ifsc: string; gstin?: string }): Promise<BankDetails> =>
    api.post<BankDetails>(paths.hostsMeBank, input),
);

export const fileDisputeEvidenceAtom = atom(null, async (_get, _set, input: { id: string; evidenceUrl: string }) =>
  api.post(paths.disputeEvidence(input.id), { evidenceUrl: input.evidenceUrl }),
);

export const respondToReportAtom = atom(null, async (_get, _set, input: { id: string; response: string }) =>
  api.post(paths.reportHostResponse(input.id), { response: input.response }),
);

export const approveGuestAtom = atom(null, async (_get, _set, input: { eventId: string; passId: string }) =>
  api.post(paths.eventGuestApprove(input.eventId, input.passId)),
);

// Declining refunds the guest, so api-gateway requires an Idempotency-Key
// (without one every decline was rejected with 400). Stable per pass: a retry
// after a dropped response replays the first decline instead of refunding twice.
export const declineGuestAtom = atom(null, async (_get, _set, input: { eventId: string; passId: string; reason: string }) =>
  api.post(paths.eventGuestDecline(input.eventId, input.passId), { reason: input.reason }, { idempotencyKey: `decline-${input.passId}` }),
);

export const sendHostThreadMessageAtom = atom(null, async (_get, _set, input: { eventId: string; guestId: string; body: string }) =>
  api.post<HostThreadMessage>(paths.eventHostThreadMessages(input.eventId, input.guestId), { body: input.body }),
);

export const transferHostDecisionAtom = atom(null, async (_get, _set, input: { id: string; approve: boolean }) =>
  api.post(paths.transferHostDecision(input.id), { approve: input.approve }),
);

export const pairDeviceAtom = atom(null, async (_get, _set, input: { label: string; kind: 'door' | 'bar' }): Promise<PairedDevice> =>
  api.post<PairedDevice>(paths.devicePair, input),
);

/** `GET /devices` — the durable roster `DevicesPage` didn't have until this
 * route existed (see its own comment). Host-authenticated, same as pairing
 * itself — no device token involved on this side. */
export const devicesAtom = atomWithRefresh<Promise<DeviceRecord[]>>(async () => {
  const { data } = await api.get<{ data: DeviceRecord[] }>(paths.devices);
  return data;
});
export const devicesLoadable = loadable(devicesAtom);

/** `DELETE /devices/:id` — unpairing from the desk, for a device that's
 * lost, stolen, or just no longer needed, without requiring physical
 * access to it (unlike jfc-host-app's own unpair, which runs from the
 * paired device itself). Same PIN contract as that path: a `WRONG_PIN`
 * rejection is the only failure that should block a retry; anything else
 * the caller (DevicesPage) surfaces as a generic error and lets the host
 * try again. */
export const unpairDeviceAtom = atom(null, async (_get, _set, input: { id: string; pin?: string }) =>
  api.delete(paths.deviceUnpair(input.id), input.pin ? { pin: input.pin } : undefined),
);

/** `POST /hosts/me/invites` — the shareable-link third path onto a paired
 * device, alongside self-pair and paste-a-token (both already on
 * DevicesPage). See ticketing-service's `staffInvites` schema comment for
 * the full reasoning. */
export const createStaffInviteAtom = atom(null, async (_get, _set, input: { label: string; kind: 'door' | 'bar' }): Promise<StaffInviteCreated> =>
  api.post<StaffInviteCreated>(paths.hostsMeInvites, input),
);

export const markNotificationReadAtom = atom(null, async (_get, _set, id: string) => api.post(paths.notificationRead(id)));

export const cancelEventAtom = atom(null, async (_get, _set, input: { id: string; reason: string }) =>
  api.post(paths.eventCancel(input.id), { reason: input.reason }, { idempotencyKey: `cancel-${input.id}-${Date.now()}` }),
);

export const postponeEventAtom = atom(null, async (_get, _set, input: { id: string; newDoorsAt: string; reason: string }) =>
  api.post(paths.eventPostpone(input.id), { newDoorsAt: input.newDoorsAt, reason: input.reason }),
);

/** `POST /events/:id/pause-sales` / `/resume-sales` — `2n`'s "Pause sales"
 * action, real on both ends: ticketing-service's purchase route checks
 * this exact flag, not just a cosmetic toggle here. */
export const pauseSalesAtom = atom(null, async (_get, _set, eventId: string) => api.post(paths.eventPauseSales(eventId)));
export const resumeSalesAtom = atom(null, async (_get, _set, eventId: string) => api.post(paths.eventResumeSales(eventId)));

/** `POST /events/:id/fnb` — closes the create-item gap `WizardMenuPage`'s
 * own comment (and fnb-service's own schema.ts comment) flagged: items
 * used to only ever be seeded directly, never created through the API.
 * `stockInitial` omitted or undefined means unlimited, matching the
 * column's own null-means-unlimited convention server-side. */
export const createFnbItemAtom = atom(
  null,
  async (_get, _set, input: { eventId: string; name: string; category: 'food' | 'bar' | 'smoke'; pricePaise: number; stockInitial?: number }) =>
    api.post(paths.eventFnbCreate(input.eventId), {
      name: input.name,
      category: input.category,
      pricePaise: input.pricePaise,
      stockInitial: input.stockInitial,
    }),
);

/** `PATCH /fnb/items/:id` — was built server-side (04-api-surface.md: "stock
 * correction during the night") but never had a portal UI to call it from,
 * so a host could create an item but never restock or write off spoilage
 * against it in the running count except via raw API. */
export const correctFnbStockAtom = atom(null, async (_get, _set, input: { itemId: string; stockRemaining: number; reason: string }) =>
  api.patch(paths.fnbItemCorrectStock(input.itemId), { stockRemaining: input.stockRemaining, reason: input.reason }),
);

/** `POST /fnb/redemptions/:id/void` — the `voided` state has existed on
 * `fnb_redemptions` since it was first modeled, but nothing ever set it;
 * see the route's own comment for why a real bar needs this. */
export const voidFnbRedemptionAtom = atom(null, async (_get, _set, input: { redemptionId: string; reason: string }) =>
  api.post(paths.fnbRedemptionVoid(input.redemptionId), { reason: input.reason }),
);

// ---------------------------------------------------------------------
// Procurement + accounting
// ---------------------------------------------------------------------

export const suppliersAtom = atomWithRefresh<Promise<Supplier[]>>(async () => {
  const { data } = await api.get<{ data: Supplier[] }>(paths.hostsMeSuppliers);
  return data;
});
export const suppliersLoadable = loadable(suppliersAtom);

export const createSupplierAtom = atom(null, async (_get, _set, input: { name: string; category?: 'food' | 'bar' | 'smoke'; contactPhone?: string; gstin?: string }) =>
  api.post<Supplier>(paths.hostsMeSuppliers, input),
);

export const purchaseOrdersAtom = atomWithRefresh<Promise<PurchaseOrder[]>>(async () => {
  const { data } = await api.get<{ data: PurchaseOrder[] }>(paths.hostsMePurchaseOrders);
  return data;
});
export const purchaseOrdersLoadable = loadable(purchaseOrdersAtom);

export const createPurchaseOrderAtom = atom(
  null,
  async (
    _get,
    _set,
    input: { supplierId: string; notes?: string; items: { name: string; category: 'food' | 'bar' | 'smoke'; quantity: number; unitCostPaise: number }[] },
  ) => api.post<PurchaseOrder>(paths.hostsMePurchaseOrders, input),
);

export const receivePurchaseOrderAtom = atom(null, async (_get, _set, input: { id: string; restock?: Record<string, string> }) =>
  api.post<PurchaseOrder>(paths.purchaseOrderReceive(input.id), { restock: input.restock }),
);

export const taxConfigAtom = atomWithRefresh<Promise<TaxConfig>>(async () => api.get<TaxConfig>(paths.hostsMeTaxConfig));
export const taxConfigLoadable = loadable(taxConfigAtom);

/** Input here is numbers — what the PATCH route validates (0-100) and
 * what an <input type="number"> naturally produces — unlike `TaxConfig`
 * itself, whose rate fields come back as strings (Drizzle's own numeric-
 * column behavior, see that type's own comment). Two different shapes for
 * the same rates, deliberately: one for sending, one for what's returned. */
export const updateTaxConfigAtom = atom(
  null,
  async (
    _get,
    _set,
    input: Partial<{
      foodGstPercent: number;
      barExcisePercent: number;
      barVatPercent: number;
      smokeGstPercent: number;
      smokeCessPercent: number;
      serviceChargePercent: number;
      gstin: string;
    }>,
  ) => api.patch<TaxConfig>(paths.hostsMeTaxConfig, input),
);

/** Parametrized per-event, same factory-atom pattern as eventGuestsAtom/hostReviewsAtom. */
export function accountingSummaryAtom(eventId: string) {
  return atomWithRefresh<Promise<AccountingSummary>>(async () => api.get(paths.accountingSummary(eventId)));
}

/**
 * Shared across Inventory/Invoice/Accounting — Procurement too, though it
 * has no per-page event picker of its own — grouped together under the
 * sidebar's "Business ops" branch (Sidebar.tsx) as one connected business-
 * operations area. Each page used to keep its
 * own local `useState` for "which event am I looking at," so switching
 * tabs silently reset to that page's own first candidate event instead of
 * staying on the one you were just looking at. One atom, written by
 * whichever page's event picker changed it; each page still computes its
 * own effective selection as "the shared one, if it's in my own candidate
 * list, else my own first candidate" — a page with a narrower list (e.g.
 * Inventory excluding cancelled/closed events) never silently overwrites
 * a broader selection another page made.
 */
export const selectedBusinessEventIdAtom = atom<string | null>(null);

export type { DeviceRecord };
