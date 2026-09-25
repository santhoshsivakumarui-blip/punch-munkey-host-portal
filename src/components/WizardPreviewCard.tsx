import { useAtomValue } from 'jotai';
import { Panel, Chip, Button } from '@jfc/ui-web';
import { sessionAtom } from '../lib/atoms';
import type { BasicsFormValues, LocationFormValues, StaffFormValues } from '../schemas/wizard';
import type { MenuItemDraft } from '../lib/wizardDraft';

export interface WizardPreviewData {
  basics?: Partial<BasicsFormValues>;
  location?: Partial<LocationFormValues>;
  menu?: { items: MenuItemDraft[]; alcoholCapPerGuest: number };
  staff?: Partial<StaffFormValues>;
}

function formatDate(dateISO?: string): string {
  if (!dateISO) return '';
  const d = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatTime(t?: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const d = new Date();
  d.setHours(h, m ?? 0);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

/**
 * A live "what guests will see" mock of the event card being assembled,
 * shown alongside every wizard step — same title/area+date/price hierarchy
 * as the guest app's Discover card (jfc-guest-app's `(tabs)/index.tsx`),
 * so a host can anticipate the guest-facing result rather than trusting a
 * plain form blindly. Takes a merge of the saved draft and the current
 * step's live (unsaved) form values, so it updates as the host types, not
 * just after each step's submit — see each wizard page's own call site for
 * how that merge is built.
 */
export function WizardPreviewCard({ basics, location, menu, staff }: WizardPreviewData) {
  const { user } = useAtomValue(sessionAtom);
  const dateLabel = formatDate(basics?.dateISO);
  const timeLabel = basics?.startTime ? formatTime(basics.startTime) : '';
  const whenLabel = [dateLabel, timeLabel].filter(Boolean).join(', ');
  const whereLabel = location?.area || 'Area not set';
  const requiresApproval = basics?.eventType ? basics.eventType !== 'club' : false;

  return (
    <div style={{ position: 'sticky', top: 20 }}>
      <span className="text text-overline tone-secondary">Guests will see</span>
      <Panel pad style={{ marginTop: 8, background: 'var(--chrome-base)', border: 'none' }}>
        {basics?.coverImageUrl?.trim() ? (
          <div style={{ height: 104, borderRadius: 16, marginBottom: 14, background: `var(--chrome-raised) center/cover no-repeat url("${basics.coverImageUrl}")` }} />
        ) : (
          <div style={{ height: 104, borderRadius: 16, marginBottom: 14, background: 'var(--chrome-raised)' }} />
        )}

        <div
          className="text text-display-s"
          style={{ color: 'var(--chrome-text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {basics?.title?.trim() || 'Untitled night'}
        </div>
        <div className="text text-body-s" style={{ color: 'var(--chrome-text)', marginTop: 3 }}>
          {whereLabel}{whenLabel ? ` · ${whenLabel}` : ''}
        </div>

        {basics?.description?.trim() ? (
          <p className="text text-body-s" style={{ color: 'var(--chrome-text)', marginTop: 10, lineHeight: 1.5 }}>
            {basics.description}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
          {basics?.priceRupees ? <Chip tone="accent">₹{basics.priceRupees}+</Chip> : null}
          {user?.kyhState === 'verified' ? <Chip tone="positive">Verified host</Chip> : null}
          {basics?.capacity ? <Chip tone="dark">{basics.capacity} capacity</Chip> : null}
          {staff?.ratioRule ? <Chip tone="dark">{staff.ratioRule}</Chip> : null}
          {location?.revealHoursBefore ? <Chip tone="dark">Address in {location.revealHoursBefore}h</Chip> : null}
        </div>

        <Button variant="primary" block style={{ marginTop: 14 }}>
          {requiresApproval ? 'Request to book' : 'Buy now'}
        </Button>
      </Panel>

      {location?.venueName || staff?.doorStaff || menu?.items?.length ? (
        <Panel pad style={{ marginTop: 12 }}>
          <span className="text text-overline tone-secondary">Internal only · not shown to guests</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {location?.venueName ? (
              <div className="text text-body-s tone-secondary">Venue · <span className="tone-primary">{location.venueName}</span></div>
            ) : null}
            {menu?.items && menu.items.length > 0 ? (
              <div className="text text-body-s tone-secondary">
                Menu · <span className="tone-primary">{menu.items.length} item{menu.items.length === 1 ? '' : 's'}</span>, alcohol cap {menu.alcoholCapPerGuest}/guest
              </div>
            ) : null}
            {staff?.doorStaff ? (
              <div className="text text-body-s tone-secondary">Door staff · <span className="tone-primary">{staff.doorStaff}</span></div>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
