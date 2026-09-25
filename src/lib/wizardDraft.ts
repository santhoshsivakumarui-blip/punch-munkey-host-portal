/**
 * The 5-step event wizard is one `events` row moving through
 * `draft → in_review → on_sale` (06-screen-specs.md). Basics + Location
 * together are real now — the Location step's submit is what actually
 * calls `POST /events` (event-service/src/routes/hostEvents.ts requires
 * venue info in that same call, which the design's own step split doesn't
 * have until step 2), storing the returned `eventId`/`eventCode` here so
 * Menu/Staff/Review know which real row they're finishing. Menu and Staff
 * have no backing columns on `events` at all (no per-item menu table wired
 * to a create endpoint, no named-door-staff column) — those two stay
 * local-draft-only, flagged rather than faked as saved. Review's Publish
 * is real: `POST /events/:id/submit` then `POST /events/:id/publish`.
 */
const DRAFT_KEY = 'jfc-host-portal:event-draft';

export interface MenuItemDraft {
  name: string;
  pricePaise: number;
  includedCount?: number;
}

export interface EventWizardDraft {
  /** Set once the Location step's `POST /events` succeeds — undefined
   * before that, meaning Menu/Staff/Review have nothing real to attach to
   * yet. */
  eventId?: string;
  eventCode?: string;
  state: 'draft' | 'in_review' | 'on_sale';
  basics?: { eventType: 'private' | 'club' | 'couples'; title: string; dateISO: string; startTime: string; endTime: string; description: string; priceRupees: number; capacity: number; coverImageUrl: string };
  location?: { venueName: string; area: string; addressLine: string; gateCode: string; revealHoursBefore: number; radiusKm: number };
  menu?: { items: MenuItemDraft[]; alcoholCapPerGuest: number };
  staff?: { doorStaff: string; ratioRule: string };
  updatedAt: string;
}

export function loadDraft(): EventWizardDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as EventWizardDraft;
  } catch {
    /* fall through to a fresh draft */
  }
  return { state: 'draft', updatedAt: new Date().toISOString() };
}

export function saveDraft(patch: Partial<EventWizardDraft>): EventWizardDraft {
  const next: EventWizardDraft = { ...loadDraft(), ...patch, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  } catch {
    /* non-fatal in this thin slice — a host mid-wizard just loses resume-on-refresh */
  }
  return next;
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clean up */
  }
}
