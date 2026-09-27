/** Mirrors of the backend response shapes this portal calls — see
 * punch-munkey-services/services/{event,payments,safety,notification,ticketing}-service
 * for the source of truth. Kept local, same reasoning as every other
 * cross-repo boundary in this platform (no shared workspace package for
 * API types). */

export type EventState = 'draft' | 'in_review' | 'on_sale' | 'sold_out' | 'doors_open' | 'postponed' | 'cancelled' | 'closed';

export type FnbCategory = 'food' | 'bar' | 'smoke';

export type HostDocumentType = 'gov_id' | 'liquor_licence' | 'venue_photo' | 'fire_noc';

/**
 * `POST`/`GET /hosts/me/documents` (identity-service) — real now; previously
 * a disabled file input on sign-up with no backend at all. `viewUrl` is a
 * fresh 15-minute S3 presigned URL each time this is fetched, never a
 * stored/public link — `null` only if this deployment has no storage
 * configured yet (identity-service's `S3_BUCKET` unset), not a claim the
 * file is missing.
 */
export interface HostDocument {
  id: string;
  hostId: string;
  docType: HostDocumentType;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  viewUrl: string | null;
}

/**
 * `GET /hosts/me/promoters` (event-service). `referredGuests`/`volumePaise`
 * are `null`, not `0` — nothing in this codebase attributes a purchase to a
 * promoter's referral yet, so there's no real count/volume to report; `0`
 * would falsely claim "tracked, and it's zero." `phoneE164` is the only
 * real identity a promoter has (no dedicated profile table, unlike guests'
 * handle or hosts' displayName) — resolved server-side via
 * identity-service's `/internal/users/:id`, so it can be `null` too if that
 * lookup fails.
 */
export interface PromoterReferral {
  id: string;
  promoterId: string;
  phoneE164: string | null;
  commissionRate: number;
  expiresAt: string;
  active: boolean;
  referredGuests: number | null;
  volumePaise: number | null;
}

export interface FnbItem {
  id: string;
  name: string;
  category: FnbCategory;
  pricePaise: number;
  stockInitial: number | null;
  stockRemaining: number | null;
  redemptions: Record<string, number>;
}

export interface FnbBilling {
  food: number;
  bar: number;
  smoke: number;
  total: number;
}

export interface FnbStockResponse {
  data: FnbItem[];
  billing: FnbBilling;
}

/** `GET /events/:id/fnb/invoice` — one row per unit ordered, the line-item
 * ledger `fnb/stock`'s per-category totals are made of. `category` is
 * `null` only if the item behind this redemption was deleted since (no
 * delete route exists yet, so purely defensive). `guestHandle` is `null`
 * when the pass's holder couldn't be resolved (identity-service
 * unreachable, or the lookup itself failed) — not a claim the redemption
 * has no guest. */
export interface FnbInvoiceLine {
  id: string;
  itemId: string;
  itemName: string;
  category: FnbCategory | null;
  amountPaise: number;
  state: 'confirmed' | 'unconfirmed' | 'voided';
  guestHandle: string | null;
  scannedAt: string;
  confirmedAt: string | null;
}

/** `GET /fnb/items/:id` — the per-item detail entry `/inventory/items/:id`
 * renders. `history` is this one item's own redemption line items. */
export interface FnbItemDetail {
  id: string;
  eventId: string;
  name: string;
  category: FnbCategory;
  pricePaise: number;
  stockInitial: number | null;
  stockRemaining: number | null;
  history: { id: string; amountPaise: number; state: 'confirmed' | 'unconfirmed' | 'voided'; guestHandle: string | null; scannedAt: string }[];
}

export interface Supplier {
  id: string;
  hostId: string;
  name: string;
  category: FnbCategory | null;
  contactPhone: string | null;
  gstin: string | null;
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  name: string;
  category: FnbCategory;
  quantity: number;
  unitCostPaise: number;
  restockFnbItemId: string | null;
}

export interface PurchaseOrder {
  id: string;
  hostId: string;
  supplierId: string;
  supplierName: string;
  state: 'ordered' | 'received' | 'cancelled';
  totalPaise: number;
  orderedAt: string;
  receivedAt: string | null;
  notes: string | null;
  items: PurchaseOrderItem[];
}

/** `GET`/`PATCH /hosts/me/tax-config`. Every rate is host-set — see
 * fnb-service's schema.ts comment on why bar excise/VAT default to 0
 * (state-specific, no universal default exists) while food/smoke GST get
 * commonly-cited starting points. Rates come back as strings — Drizzle
 * returns a `numeric` column as a string, not a number (same reasoning as
 * `HostProfile.reliability` in host-portal's own api.ts) — `Number(...)`
 * at the call site, don't assume a numeric type here. */
export interface TaxConfig {
  hostId: string;
  foodGstPercent: string;
  barExcisePercent: string;
  barVatPercent: string;
  smokeGstPercent: string;
  smokeCessPercent: string;
  serviceChargePercent: string;
  gstin: string | null;
  updatedAt: string;
}

export interface AccountingSummary {
  eventId: string;
  categories: { category: FnbCategory; revenuePaise: number; rateLabel: string; taxPaise: number }[];
  totalRevenuePaise: number;
  totalTaxPaise: number;
  serviceChargePaise: number;
  netPaise: number;
}

export interface EventRecord {
  id: string;
  code: string;
  venueId: string;
  hostId: string;
  title: string;
  state: EventState;
  doorsAt: string;
  endsAt: string;
  revealAt: string;
  pricePaise: number;
  capacity: number;
  minRatioWomen: string | null;
  minRating: string | null;
  requiresApproval: boolean;
  coverImageUrl: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  postponedTo: string | null;
}

export interface PayoutRecord {
  id: string;
  hostId: string;
  eventId: string;
  grossPaise: number;
  feePaise: number;
  tdsPaise: number;
  gstPaise: number;
  /** Disputed/chargeback money withheld from this payout — the fee-split
   * invariant is net = gross − fee − TDS − GST − held, so this line has to
   * be shown whenever it's non-zero or the host's numbers won't reconcile.
   * Returned by `GET /hosts/me/payouts` (payments-service `payouts.held_paise`). */
  heldPaise: number;
  netPaise: number;
  state: string;
  scheduledFor: string;
  paidAt: string | null;
}

export interface TaxMonth {
  month: string;
  grossPaise: number;
  feePaise: number;
  tdsPaise: number;
  gstPaise: number;
  netPaise: number;
  payoutCount: number;
}

/** `GET`/`POST /hosts/me/bank` (payments-service). `accountNumber` comes
 * back masked (`••••1234`) from both — this route never returns the real
 * number after the initial submit either. `gstin` is `null` for a host
 * with none on file (common for an 'individual' entity type), not an
 * empty string. */
export interface BankDetails {
  hostId: string;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  gstin: string | null;
  updatedAt: string;
}

export interface DisputeRecord {
  id: string;
  passId: string;
  state: 'open' | 'evidence_filed' | 'won' | 'lost';
  reasonCode: string | null;
  amountPaise: number;
  raisedAt: string;
  evidenceUrl: string | null;
}

export interface GuestRow {
  passId: string;
  code: string;
  handle: string | null;
  rating: string | null;
  state: string;
  scannedAt: string | null;
  /** The guest's onboarding profile, self-declared; null = not filled in. */
  preferredName: string | null;
  gender: 'woman' | 'man' | 'non_binary' | null;
  attendingAs: 'couple' | 'solo' | null;
  /** For the host's judgement, never auto-declined: 'solo_man', 'profile_incomplete'. */
  flags: string[];
}

/** Live passes by holders' self-declared gender vs. the women-ratio rule. */
export interface GuestRatio {
  minRequired: string | number | null;
  women: number;
  others: number;
  /** Most passes anyone other than women can hold (null = no rule). */
  othersCap: number | null;
}

/** `GET /events/:id/host-threads` (event-service) — one row per guest who's
 * messaged this event's host, newest-message-first. */
export interface HostThreadSummary {
  guestId: string;
  handle: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderKind: 'guest' | 'host';
}

/** `GET/POST /events/:id/host-threads/:guestId(/messages)` (event-service). */
export interface HostThreadMessage {
  id: string;
  eventId: string;
  guestId: string;
  senderKind: 'guest' | 'host';
  body: string;
  createdAt: string;
}

/** `GET /hosts/me/transfers` (ticketing-service) — scoped to transfers
 * actually waiting on this host's decision (recipient already accepted,
 * host hasn't decided yet), not every transfer against the host's events. */
export interface PendingTransfer {
  id: string;
  eventId: string;
  passCode: string;
  toPhoneE164: string;
  requestedAt: string;
}

export interface NotificationItem {
  id: string;
  category: 'safety' | 'entry' | 'money' | 'event' | 'social' | 'marketing';
  channel: string;
  title: string;
  body: string;
  state: string;
  createdAt: string;
  readAt: string | null;
}

export interface HostReview {
  id: string;
  eventId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createdAt: string;
  guestHandle: string;
}

export interface HostReviewsSummary {
  average: number | null;
  total: number;
  breakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface HostReviewsResponse {
  summary: HostReviewsSummary;
  data: HostReview[];
  total: number;
}

/** `GET /hosts/me/safety-score` (safety-service). `score` is `null` until
 * this host has at least one admitted guest to measure against — see the
 * route's own doc comment for the exact formula and why it was defined as
 * a judgment call rather than a pre-existing spec. */
export interface HostSafetyScore {
  score: number | null;
  incidentsPerHundredGuests: number;
  totalGuests: number;
  totalIncidents: number;
}

export interface PairedDevice {
  device: { id: string; label: string; kind: 'door' | 'bar'; hostId: string };
  deviceToken: string;
}

/** `POST /hosts/me/invites` (ticketing-service). `token` is what
 * `/invite/:token` is built from — this portal owns the link shape, the
 * service only owns the token itself. */
export interface StaffInviteCreated {
  token: string;
  label: string;
  kind: 'door' | 'bar';
  expiresAt: string;
}

/** `GET /invites/:token` — public, pre-auth. `hostDisplayName` is `null`
 * only if identity-service was unreachable when this was fetched, not a
 * claim the host has no name. */
export interface StaffInviteInfo {
  label: string;
  kind: 'door' | 'bar';
  hostDisplayName: string | null;
  expired: boolean;
  used: boolean;
}

/** `GET /devices` (ticketing-service, host-authenticated) — the durable
 * roster DevicesPage now shows instead of just what was paired in the
 * current browser session. */
export interface DeviceRecord {
  id: string;
  label: string;
  kind: 'door' | 'bar';
  pairedAt: string;
}
