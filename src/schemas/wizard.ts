import * as yup from 'yup';

/**
 * `2j`'s three-card type selector. `requiresApproval`/`minRating` are real,
 * PATCH-able columns on `events` (event-service/src/routes/hostEvents.ts)
 * the wizard never actually set before — picking a type now writes them for
 * real once the event exists (see WizardLocationPage's submit). `minRatioWomen`
 * (the mockup's "stag cap") is deliberately left alone here: this codebase
 * already reconciled screening/ratio enforcement onto the native app's `1h`
 * screen (07-navigation.md), and there's no settled numeric mapping from
 * "couples-only" to a specific ratio worth guessing at in a redesign pass.
 */
export type EventTypeKey = 'private' | 'club' | 'couples';

export const EVENT_TYPE_DEFAULTS: Record<EventTypeKey, { requiresApproval: boolean; minRating: number | null }> = {
  private: { requiresApproval: true, minRating: 3.0 },
  club: { requiresApproval: false, minRating: null },
  couples: { requiresApproval: true, minRating: 3.0 },
};

export interface BasicsFormValues {
  eventType: EventTypeKey;
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  description: string;
  priceRupees: number;
  capacity: number;
  /** Real, PATCH-able `events.coverImageUrl` — a URL field, not a file
   * upload: no image-hosting endpoint exists anywhere in this codebase (see
   * identity-service's KYH documents for the one place a real upload was
   * built, which is S3-backed and unrelated to event covers), so this asks
   * for a link to an already-hosted image rather than pretending to accept
   * a dropped file that has nowhere to land. */
  coverImageUrl: string;
}

// `pricePaise`/`capacity` aren't in the design's own basics step (`2j`) —
// `POST /events` (event-service/src/routes/hostEvents.ts) requires both on
// the very first real call, and there's nowhere later in the wizard that
// collects them, so they're added here rather than left with no home.
export const basicsSchema: yup.ObjectSchema<BasicsFormValues> = yup.object({
  eventType: yup.mixed<EventTypeKey>().oneOf(['private', 'club', 'couples']).required(),
  title: yup.string().trim().required('Give the night a name.'),
  dateISO: yup.string().required('Pick a date.'),
  startTime: yup.string().required('Pick a start time.'),
  endTime: yup.string().required('Pick an end time.'),
  description: yup.string().trim().required('A short description helps guests decide.'),
  priceRupees: yup.number().typeError('Enter a price in rupees.').positive('Price must be positive.').required('Set a price.'),
  capacity: yup.number().typeError('Enter a whole number.').integer().positive('Capacity must be positive.').required('Set a capacity.'),
  coverImageUrl: yup.string().trim().defined(),
});

export interface LocationFormValues {
  venueName: string;
  area: string;
  addressLine: string;
  gateCode: string;
  revealHoursBefore: number;
  /** `2k`'s "public radius" slider — decorative only, same as `addressLine`
   * and `revealHoursBefore` above it: `events` has no radius/geofence
   * column at all, so there's nothing real for this to reach. Kept, not
   * dropped, because the redesign's job is matching the screen, not
   * quietly removing the pieces with no backend yet — same call this
   * step's own pre-existing fields already made. */
  radiusKm: number;
}

export const locationSchema: yup.ObjectSchema<LocationFormValues> = yup.object({
  venueName: yup.string().trim().required('The venue name — internal, never shown to guests.'),
  area: yup.string().trim().required('Guests see this area — never the exact address.'),
  addressLine: yup.string().trim().required('The exact door — only revealed per the reveal window.'),
  gateCode: yup.string().trim().defined(),
  revealHoursBefore: yup
    .number()
    .typeError('Enter a number of hours.')
    .min(1, 'At least 1 hour before doors.')
    .max(24, 'At most 24 hours before doors.')
    .required('Set the reveal window.'),
  radiusKm: yup.number().typeError('Enter a radius in km.').min(1, 'At least 1 km.').max(5, 'At most 5 km.').required(),
});

export interface StaffFormValues {
  doorStaff: string;
  ratioRule: string;
}

export const staffSchema: yup.ObjectSchema<StaffFormValues> = yup.object({
  doorStaff: yup.string().trim().required('Name at least one door staff member.'),
  ratioRule: yup.string().trim().required('Set the screening ratio rule.'),
});
