/**
 * The 5-step event wizard is one `events` row moving through
 * `draft → in_review → on_sale` (06-screen-specs.md). Basics + Location
 * together are real now — the Location step's submit is what actually
 * calls `POST /events` (event-service/src/routes/hostEvents.ts requires
 * venue info in that same call, which the design's own step split doesn't
 * have until step 2), storing the returned `eventId`/`eventCode` here so
 * Menu/Staff/Review know which real row they're finishing. The Menu step
 * saves to fnb-service (PUT /events/:id/fnb/menu); the draft keeps a copy
 * only so the wizard can resume. Review's Publish is real: POST
 * /events/:id/submit then POST /events/:id/publish.
 */
const DRAFT_KEY = 'jfc-host-portal:event-draft'; // stored key: kept across the rename

export type MenuItemCategory = 'food' | 'bar' | 'smoke';

export interface MenuItemDraft {
  /** fnb-service's item id once saved; absent for an item not saved yet. */
  id?: string;
  name: string;
  pricePaise: number;
  category: MenuItemCategory;
  isAlcoholic: boolean;
  /** Units available for the night; null or absent means unlimited. */
  stockInitial?: number | null;
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
  /** addressLine/gateCode are always blank here: the exact address is kept
   * only on the server (location-service, encrypted) and loaded from there
   * when the wizard reopens, never written to this browser's storage. */
  location?: { venueName: string; area: string; addressLine: string; gateCode: string };
  menu?: { items: MenuItemDraft[]; alcoholCapPerGuest: number };
  staff?: {
    members: Array<{ name: string; role: 'door' | 'bar' }>;
    minWomenPercent: number;
    /** Invite links already created for this event's staff, so re-saving
     * the step doesn't mint a second link for the same person. */
    invites?: Array<{ name: string; role: 'door' | 'bar'; link: string; expiresAt: string }>;
  };
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
