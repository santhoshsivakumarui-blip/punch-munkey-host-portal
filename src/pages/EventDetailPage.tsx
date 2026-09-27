import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { Page, PageHeader, Panel, PanelTitle, KvRow, StatTile, StatGrid, Chip, Button, Skeleton, EmptyState, useToast } from '@punch-munkey/ui-web';
import type { ChipTone } from '@punch-munkey/ui-web';
import { api, paths, eventLiveWsUrl } from '../lib/api';
import { getToken } from '../lib/session';
import { pauseSalesAtom, resumeSalesAtom, reopenEventAtom } from '../lib/atoms';
import { showApiError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { EventRecord, EventState } from '../lib/types';

const STATE_TONE: Record<EventState, ChipTone> = {
  draft: 'muted',
  in_review: 'warning',
  on_sale: 'positive',
  sold_out: 'accent',
  doors_open: 'positive',
  postponed: 'warning',
  cancelled: 'critical',
  closed: 'muted',
};

const SCAN_RESULT_LABEL: Record<string, string> = { admitted: 'Admitted', rejected: 'Rejected', duplicate: 'Duplicate', unknown: 'Unknown' };
const SCAN_RESULT_COLOR: Record<string, string> = {
  admitted: 'var(--sage-base)',
  rejected: 'var(--danger-strong)',
  duplicate: 'var(--amber-base)',
  unknown: 'var(--text-muted)',
};

// Same reconnect-with-backoff schedule as punch-munkey-host-app's own live dashboard
// (lib/store.ts) — this portal never had a WS client before this page.
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

interface OpenIncident {
  id: string;
  code: string;
  kind: 'sos' | 'staff_raised';
  state: 'live' | 'acknowledged';
  raisedAt: string;
}

interface DashboardResponse {
  event: { id: string; code: string; title: string; state: EventState; doorsAt: string; endsAt: string; capacity: number; pricePaise: number; salesPaused: boolean; venueName: string };
  counts: Record<string, number>;
  waitlistDepth: number;
  admitted: number;
  soldOrScanned: number;
  grossPaise: number;
  doorScanCounts: Record<string, number>;
  doorRejectRate: number | null;
  openIncidents: OpenIncident[];
}

/**
 * `6b`'s missing counterpart, and now `2n`'s real live-ops console too —
 * this page used to be a static single-fetch summary (its own earlier
 * comment: "read-only standing... plus links out"). `2n` specifies 5 KPI
 * tiles, a door-throughput breakdown, an SOS banner, a "Pause sales"
 * action, and a live-updated ticker; every one of those is now backed by a
 * real route rather than faked — see event-service's dashboard route and
 * hostEvents.ts's pause/resume-sales, ticketing-service's door-scan-count
 * addition to its internal passes route, and safety-service's new
 * GET /hosts/me/incidents?eventId= (all added this pass). The one thing
 * `2n` shows that stays deliberately absent is a "surge stage" metric —
 * nothing in this codebase computes or defines one, and inventing a number
 * would be exactly the kind of fabrication this codebase avoids elsewhere
 * (compare `hosts.rating`/safety score both staying `null` until real).
 * Waitlist depth (already real) fills the 5th tile instead.
 */
export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const pauseSales = useSetAtom(pauseSalesAtom);
  const resumeSales = useSetAtom(resumeSalesAtom);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [pausing, setPausing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const reopenEvent = useSetAtom(reopenEventAtom);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([api.get<DashboardResponse>(paths.eventDashboard(id)), api.get<EventRecord>(paths.event(id))])
      .then(([dash, ev]) => {
        if (cancelled) return;
        setDashboard(dash);
        setEvent(ev);
        setLastUpdated(new Date());
      })
      .catch((err) => {
        if (cancelled) return;
        setNotFound(true);
        showApiError(toast, err, 'Could not load this event.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadTick]);

  // A dashboard reload IS the "live" refresh — no separate WS payload shape
  // to merge in, same choice punch-munkey-host-app's own live dashboard makes (its
  // ws.onmessage just calls the same `reload()` its first paint used).
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(eventLiveWsUrl(id!, token!));
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setLive(true);
      };
      ws.onmessage = (msg) => {
        try {
          const payload = JSON.parse(String(msg.data));
          if (['event.state', 'guest.declined', 'scan', 'incident'].includes(payload.type)) {
            setReloadTick((t) => t + 1);
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setLive(false);
        const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    }
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [id]);

  async function reopen() {
    if (!id || reopening) return;
    setReopening(true);
    try {
      await reopenEvent(id);
      toast.show('Back on sale for the new date.', { tone: 'positive' });
      setReloadTick((t) => t + 1);
    } catch (err) {
      showApiError(toast, err, 'Could not reopen sales.');
    } finally {
      setReopening(false);
    }
  }

  async function toggleSalesPaused() {
    if (!id || !dashboard || pausing) return;
    setPausing(true);
    try {
      if (dashboard.event.salesPaused) {
        await resumeSales(id);
        toast.show('Sales resumed.', { tone: 'positive' });
      } else {
        await pauseSales(id);
        toast.show('Sales paused — no new purchases until you resume.', { tone: 'warning' });
      }
      setReloadTick((t) => t + 1);
    } catch (err) {
      showApiError(toast, err, 'Could not update sales.');
    } finally {
      setPausing(false);
    }
  }

  if (loading) {
    return (
      <Page>
        <PageHeader title="Loading…" />
        <Skeleton height={90} radius={16} />
        <Skeleton height={160} radius={16} />
      </Page>
    );
  }

  if (notFound || !dashboard || !event) {
    return (
      <Page>
        <PageHeader title="Event" />
        <EmptyState icon="alert" title="Couldn't load this event" body="It may have been removed, or you don't have access to it." actionLabel="Back to events" onAction={() => navigate('/events')} />
      </Page>
    );
  }

  const canCancelOrPostpone = event.state !== 'cancelled' && event.state !== 'closed';
  const canPauseSales = event.state === 'on_sale' || event.state === 'sold_out' || event.state === 'doors_open';
  const scanTotal = Object.values(dashboard.doorScanCounts).reduce((a, b) => a + b, 0);

  return (
    <Page>
      <PageHeader
        title={event.title}
        subtitle={`${dashboard.event.venueName} · ${formatDateTime(event.doorsAt)}`}
        actions={
          <>
            <Chip tone={STATE_TONE[event.state]}>{event.state.replace('_', ' ')}</Chip>
            {dashboard.event.salesPaused ? <Chip tone="warning">Sales paused</Chip> : null}
            {event.state === 'draft' ? (
              <Button variant="primary" onClick={() => navigate('/events/new/basics')}>Continue editing</Button>
            ) : null}
            {canPauseSales ? (
              <Button variant={dashboard.event.salesPaused ? 'primary' : 'outline-danger'} disabled={pausing} onClick={toggleSalesPaused}>
                {pausing ? 'Working…' : dashboard.event.salesPaused ? 'Resume sales' : 'Pause sales'}
              </Button>
            ) : null}
            {event.state === 'postponed' ? (
              <Button variant="primary" disabled={reopening} onClick={reopen}>{reopening ? 'Working…' : 'Reopen sales'}</Button>
            ) : null}
            {canCancelOrPostpone ? (
              <Button variant="outline-danger" onClick={() => navigate(`/events/${id}/cancel`)}>Cancel / postpone</Button>
            ) : null}
          </>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: live ? 'var(--sage-base)' : 'var(--text-muted)', display: 'inline-block' }} />
        <span className="text text-caption tone-secondary">
          {live ? 'Live' : 'Reconnecting…'}{lastUpdated ? ` · updated ${formatClock(lastUpdated)}` : ''}
        </span>
      </div>

      {dashboard.openIncidents.length > 0 ? (
        <Panel variant="warning" pad style={{ marginBottom: 16, borderColor: 'var(--danger-strong)' }}>
          <PanelTitle>{dashboard.openIncidents.length} open incident{dashboard.openIncidents.length === 1 ? '' : 's'}</PanelTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {dashboard.openIncidents.map((inc) => (
              <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text text-body-s">{inc.code} · {inc.kind === 'sos' ? 'SOS' : 'Staff-raised'}</span>
                <Chip tone={inc.state === 'live' ? 'critical' : 'warning'}>{inc.state}</Chip>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <StatGrid>
        <StatTile label="Inside now" value={String(dashboard.admitted)} noteTone="positive" />
        <StatTile label="Sold" value={String(dashboard.soldOrScanned)} note={`of ${event.capacity} capacity`} />
        <StatTile label="Gross" value={formatINR(dashboard.grossPaise / 100)} />
        <StatTile
          label="Door reject rate"
          value={dashboard.doorRejectRate !== null ? `${Math.round(dashboard.doorRejectRate * 100)}%` : '—'}
          note={dashboard.doorRejectRate !== null ? undefined : 'no scans yet'}
        />
        <StatTile label="Waitlist" value={String(dashboard.waitlistDepth)} variant="dark" />
      </StatGrid>

      <Panel pad style={{ marginTop: 16, maxWidth: 560 }}>
        <PanelTitle>Door throughput</PanelTitle>
        {scanTotal === 0 ? (
          <p className="text text-body-s tone-secondary" style={{ margin: 0 }}>No scans yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
              {Object.entries(dashboard.doorScanCounts).map(([result, count]) =>
                count > 0 ? <div key={result} style={{ width: `${(count / scanTotal) * 100}%`, background: SCAN_RESULT_COLOR[result] }} /> : null,
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {Object.entries(dashboard.doorScanCounts).map(([result, count]) => (
                <span key={result} className="text text-caption tone-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: SCAN_RESULT_COLOR[result], display: 'inline-block' }} />
                  {SCAN_RESULT_LABEL[result]} · {count}
                </span>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel pad style={{ maxWidth: 480, marginTop: 16 }}>
        <PanelTitle>Details</PanelTitle>
        <KvRow label="Doors" value={formatDateTime(event.doorsAt)} />
        <KvRow label="Ends" value={formatDateTime(event.endsAt)} />
        <KvRow label="Capacity" value={String(event.capacity)} mono />
        <KvRow label="Event code" value={event.code} mono />
        {event.postponedTo ? <KvRow label="Postponed to" value={formatDateTime(event.postponedTo)} /> : null}
        {event.cancelledAt ? <KvRow label="Cancelled" value={`${formatDateTime(event.cancelledAt)}${event.cancelReason ? ` — ${event.cancelReason}` : ''}`} /> : null}
      </Panel>
    </Page>
  );
}
