import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { Page, PageHeader, Panel, PanelTitle, KvRow, ReasonField, TextField, Button, Chip, Skeleton, useToast } from '@jfc/ui-web';
import { cancelEventAtom, postponeEventAtom, eventsLoadable, sessionAtom } from '../lib/atoms';
import { api, paths } from '../lib/api';
import { showApiError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { EventRecord } from '../lib/types';

const CANCEL_REASON_PRESETS = ['Venue issue', 'Police', 'Weather', 'Low sales'];
// Matches event-service's own RELIABILITY_CANCEL_PENALTY exactly, so the
// preview shown here before confirming is the real number the server will
// land on, not a guess — see hostEvents.ts's cancel route for the source
// of truth and why -0.05 specifically.
const RELIABILITY_CANCEL_PENALTY = 0.05;

interface DashboardPreview {
  soldOrScanned: number;
  waitlistDepth: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * `6d` — cancel or postpone, rebuilt against the actual mockup instead of
 * a generic two-button choice. Every number below is real, not styled-in:
 * refund total = sold-or-scanned passes × price (the platform's actual
 * "always full refund including fee" cancel policy — ticketing-service's
 * own POST /internal/events/:id/cancel comment), notified counts come from
 * `GET /events/:id/dashboard`, and the reliability preview matches
 * event-service's own cancel-route penalty exactly (see the constant
 * above). "Staff notified" from the mockup is dropped rather than
 * estimated — there's no per-event staff roster anywhere in this codebase
 * to count (the design-audit's own open question on `2m`/DevicesPage).
 * Scheduling-conflict detection for Postpone is real but client-side: this
 * host's own already-loaded event list, checked for another one at the
 * same venue on the same calendar day — no new backend route needed for
 * that, the data was already in hand.
 */
export default function EventCancelPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const cancelEvent = useSetAtom(cancelEventAtom);
  const postponeEvent = useSetAtom(postponeEventAtom);
  const { user } = useAtomValue(sessionAtom);
  const eventsL = useAtomValue(eventsLoadable);

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'cancel' | 'postpone'>('postpone');
  const [reason, setReason] = useState('');
  const [newDoorsAt, setNewDoorsAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([api.get<EventRecord>(paths.event(id)), api.get<{ soldOrScanned: number; waitlistDepth: number }>(paths.eventDashboard(id))])
      .then(([ev, dash]) => {
        if (cancelled) return;
        setEvent(ev);
        setDashboard({ soldOrScanned: dash.soldOrScanned, waitlistDepth: dash.waitlistDepth });
      })
      .catch((err) => showApiError(toast, err, 'Could not load this event.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const conflict = useMemo(() => {
    if (!event || !newDoorsAt || eventsL.state !== 'hasData') return null;
    const picked = new Date(newDoorsAt);
    if (Number.isNaN(picked.getTime())) return null;
    return eventsL.data.find((e) => e.id !== event.id && e.venueId === event.venueId && sameCalendarDay(new Date(e.doorsAt), picked)) ?? null;
  }, [event, newDoorsAt, eventsL]);

  const refundPaise = event && dashboard ? dashboard.soldOrScanned * event.pricePaise : 0;
  const currentReliability = user ? Number(user.reliability) : null;
  const predictedReliability = currentReliability !== null ? Math.max(0, currentReliability - RELIABILITY_CANCEL_PENALTY) : null;

  async function confirm() {
    if (!id || !reason.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (action === 'cancel') {
        await cancelEvent({ id, reason: reason.trim() });
      } else {
        if (!newDoorsAt) {
          toast.show('Pick a new date and time first.', { tone: 'warning' });
          setSubmitting(false);
          return;
        }
        await postponeEvent({ id, newDoorsAt: new Date(newDoorsAt).toISOString(), reason: reason.trim() });
      }
      setConfirmed(true);
    } catch (err) {
      showApiError(toast, err, `Could not ${action} this event.`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Page>
        <PageHeader title="Loading…" />
        <Skeleton height={160} radius={16} />
      </Page>
    );
  }

  if (confirmed) {
    return (
      <Page>
        <PageHeader title={event?.title ?? `Event ${id ?? ''}`} subtitle="Postpone first. Cancel only if you must." />
        <Panel pad style={{ maxWidth: 560 }}>
          <Chip tone="warning">{action === 'postpone' ? 'Postponed' : 'Cancelled'} — {action === 'cancel' ? 'refunds dispatching' : 'guests notified'}</Chip>
          {action === 'postpone' ? (
            <p className="text text-body-s tone-secondary" style={{ margin: '12px 0 0' }}>
              Doors, the end time and the address reveal moved with the date. Guests keep their pass for the new date or take a
              full refund from the app. Sales stay closed until you reopen them from the event page.
            </p>
          ) : null}
          <Button variant="outline" style={{ marginTop: 12 }} onClick={() => navigate(action === 'postpone' && id ? `/events/${id}` : '/events')}>
            {action === 'postpone' ? 'Back to the event' : 'Back to events'}
          </Button>
        </Panel>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title={event?.title ?? `Event ${id ?? ''}`} subtitle="Postpone first. Cancel only if you must." />

      <div className="two-col" style={{ gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <Panel pad>
          <PanelTitle>Current standing</PanelTitle>
          <KvRow label="Capacity" value={event ? String(event.capacity) : '—'} />
          <KvRow label="Price" value={event ? formatINR(event.pricePaise / 100) : '—'} mono />
          <KvRow label="Status" value={event?.state.replace('_', ' ') ?? '—'} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant={action === 'postpone' ? 'primary' : 'outline'} onClick={() => setAction('postpone')}>Postpone (recommended)</Button>
              <Button variant={action === 'cancel' ? 'outline-danger' : 'outline'} onClick={() => setAction('cancel')}>Cancel event</Button>
            </div>

            {action === 'postpone' ? (
              <>
                <TextField label="New doors-open date & time" type="datetime-local" value={newDoorsAt} onChange={(e) => setNewDoorsAt(e.target.value)} />
                {conflict ? (
                  <Panel variant="warning" pad>
                    <span className="text text-body-s" style={{ fontWeight: 500 }}>Scheduling conflict</span>
                    <p className="text text-caption tone-secondary" style={{ margin: '4px 0 0' }}>
                      You already have "{conflict.title}" at the same venue on {formatDate(conflict.doorsAt)}.
                    </p>
                  </Panel>
                ) : null}
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CANCEL_REASON_PRESETS.map((preset) => (
                  <Button key={preset} variant={reason === preset ? 'primary' : 'outline'} size="sm" onClick={() => setReason(preset)}>
                    {preset}
                  </Button>
                ))}
              </div>
            )}

            <ReasonField value={reason} onChange={setReason} placeholder="Reason · shown to affected guests and logged" />

            <Button
              variant={action === 'cancel' ? 'outline-danger' : 'primary'}
              disabled={!reason.trim() || submitting || (action === 'postpone' && !newDoorsAt)}
              onClick={confirm}
            >
              {submitting
                ? 'Working…'
                : action === 'cancel'
                  ? `Cancel and refund ${formatINR(refundPaise / 100)}`
                  : newDoorsAt
                    ? `Postpone to ${formatDate(newDoorsAt)}`
                    : 'Postpone'}
            </Button>
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel pad>
            <PanelTitle>What it costs you</PanelTitle>
            <KvRow label="Refunded to guests" value={formatINR(refundPaise / 100)} mono />
            <KvRow label="Your earnings" value="₹0" mono />
            <KvRow label="F&B stock" value="Not covered by this refund" />
            <KvRow
              label="Reliability score"
              value={currentReliability !== null && predictedReliability !== null ? `${currentReliability.toFixed(2)} → ${predictedReliability.toFixed(2)}` : '—'}
            />
          </Panel>

          <Panel pad>
            <PanelTitle>Who gets told, and when</PanelTitle>
            <KvRow label="Pass holders" value={dashboard ? String(dashboard.soldOrScanned) : '—'} />
            <KvRow label="Waitlist" value={dashboard ? String(dashboard.waitlistDepth) : '—'} />
            <p className="text text-caption tone-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              {action === 'cancel'
                ? 'Refunds dispatch immediately, and every guest holding a valid or scanned pass gets a push notification automatically.'
                : 'Every guest holding a valid or scanned pass gets a push notification with the new date automatically.'}
            </p>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
