import { useMemo, useState } from 'react';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import { Page, PageHeader, Panel, Chip, Button, Select, EmptyState, DataTable, ReasonField, ReplyComposer, MessageBubble, useToast } from '@jfc/ui-web';
import {
  approveGuestAtom,
  declineGuestAtom,
  eventGuestsAtom,
  eventHostThreadAtom,
  eventHostThreadsAtom,
  eventsLoadable,
  sendHostThreadMessageAtom,
  transferHostDecisionAtom,
  transfersAtom,
  transfersLoadable,
} from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';
import type { GuestRow, HostThreadMessage, HostThreadSummary, PendingTransfer } from '../lib/types';

type Tab = 'transfers' | 'screening' | 'messages';

const EMPTY_THREADS_ATOM = atom({ state: 'hasData' as const, data: [] as HostThreadSummary[] });
const EMPTY_THREAD_ATOM = atom({ state: 'hasData' as const, data: [] as HostThreadMessage[] });
// A no-op refresh target for when no event/guest is selected yet — same
// zero-argument setter shape as atomWithRefresh's own refresh function, so
// `refreshThreads()`/`refreshThread()` below can be called unconditionally.
const NULL_REFRESH_ATOM = atom(null, () => {});

/**
 * `7g` transfers + `1h` screening & ratio — one "Requests" sidebar item in
 * the design (both mockups highlight it with the same badge count).
 * Screening is real: `GET /events/:id/guests` (event-service) plus
 * `POST .../approve` / `.../decline` — per-event, so this page needs one
 * selected first (defaults to the first on-sale/in-review event; there's
 * no cross-event "all my pending requests" endpoint). Transfers is now
 * real too: `GET /hosts/me/transfers` (ticketing-service) lists transfers
 * where the recipient has accepted and this host hasn't decided yet —
 * `POST /transfers/:id/host-decision` was always real, it just had no list
 * to drive it before.
 */
export default function RequestsPage() {
  const [tab, setTab] = useState<Tab>('screening');
  const toast = useToast();
  const eventsL = useAtomValue(eventsLoadable);
  useToastOnError(eventsL, 'Could not load your events.');

  const candidateEvents = eventsL.state === 'hasData' ? eventsL.data.filter((e) => e.state === 'on_sale' || e.state === 'in_review' || e.state === 'sold_out') : [];
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const activeEventId = selectedEventId ?? candidateEvents[0]?.id ?? null;
  const activeEvent = candidateEvents.find((e) => e.id === activeEventId) ?? null;

  // Re-created only when the selected event changes — `eventGuestsAtom` is
  // a factory (one atom per event id), so this must be memoized rather
  // than called fresh every render, which would otherwise create a new
  // atom (and a new subscription) on every render. No event selected yet
  // (host has no on-sale/in-review events) skips the fetch entirely rather
  // than hitting the API with a placeholder id.
  const guestsLoadableAtom = useMemo(
    () =>
      activeEventId
        ? loadable(eventGuestsAtom(activeEventId))
        : atom({ state: 'hasData' as const, data: { guests: [], screening: { minRating: null, requiresApproval: false, minRatioWomen: null }, capacity: 0, capacityHeld: 0 } }),
    [activeEventId],
  );
  const guestsLoadableValue = useAtomValue(guestsLoadableAtom);
  useToastOnError(guestsLoadableValue, 'Could not load screening requests.');

  const approveGuest = useSetAtom(approveGuestAtom);
  const declineGuest = useSetAtom(declineGuestAtom);
  const [decliningPassId, setDecliningPassId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busyPassId, setBusyPassId] = useState<string | null>(null);

  async function handleApprove(passId: string) {
    if (!activeEventId || busyPassId) return;
    setBusyPassId(passId);
    try {
      await approveGuest({ eventId: activeEventId, passId });
      toast.show('Approved.', { tone: 'positive' });
    } catch (err) {
      showApiError(toast, err, 'Could not approve this guest.');
    } finally {
      setBusyPassId(null);
    }
  }

  async function handleDecline(passId: string) {
    if (!activeEventId || !declineReason.trim() || busyPassId) return;
    setBusyPassId(passId);
    try {
      await declineGuest({ eventId: activeEventId, passId, reason: declineReason.trim() });
      toast.show('Declined and refunded.', { tone: 'positive' });
      setDecliningPassId(null);
      setDeclineReason('');
    } catch (err) {
      showApiError(toast, err, 'Could not decline this guest.');
    } finally {
      setBusyPassId(null);
    }
  }

  // Messages tab — every guest thread for the active event, plus the
  // selected one's full history. Same per-id memoized-atom-factory pattern
  // as `guestsLoadableAtom` above, but also keeps the underlying
  // atomWithRefresh instance (not just its `loadable()` wrapper) so sending
  // a message can trigger a real refresh — `guestsLoadableAtom` above never
  // needed that since nothing in this page's `handleApprove`/`handleDecline`
  // currently re-fetches it either.
  const { threadsAtom, threadsLoadableAtom } = useMemo(() => {
    if (!activeEventId) return { threadsAtom: null, threadsLoadableAtom: EMPTY_THREADS_ATOM };
    const a = eventHostThreadsAtom(activeEventId);
    return { threadsAtom: a, threadsLoadableAtom: loadable(a) };
  }, [activeEventId]);
  const threadsL = useAtomValue(threadsLoadableAtom);
  const refreshThreads = useSetAtom(threadsAtom ?? NULL_REFRESH_ATOM);

  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const { threadAtom, threadLoadableAtom } = useMemo(() => {
    if (!activeEventId || !selectedGuestId) return { threadAtom: null, threadLoadableAtom: EMPTY_THREAD_ATOM };
    const a = eventHostThreadAtom(activeEventId, selectedGuestId);
    return { threadAtom: a, threadLoadableAtom: loadable(a) };
  }, [activeEventId, selectedGuestId]);
  const threadL = useAtomValue(threadLoadableAtom);
  const refreshThread = useSetAtom(threadAtom ?? NULL_REFRESH_ATOM);

  const sendThreadMessage = useSetAtom(sendHostThreadMessageAtom);
  const [messageDraft, setMessageDraft] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  async function handleSendMessage() {
    if (!activeEventId || !selectedGuestId || !messageDraft.trim() || sendingMessage) return;
    setSendingMessage(true);
    try {
      await sendThreadMessage({ eventId: activeEventId, guestId: selectedGuestId, body: messageDraft.trim() });
      setMessageDraft('');
      refreshThread();
      refreshThreads();
    } catch (err) {
      showApiError(toast, err, 'Could not send that message.');
    } finally {
      setSendingMessage(false);
    }
  }

  const transfersL = useAtomValue(transfersLoadable);
  useToastOnError(transfersL, 'Could not load pending transfers.');
  const refreshTransfers = useSetAtom(transfersAtom);
  const decideTransfer = useSetAtom(transferHostDecisionAtom);
  const [busyTransferId, setBusyTransferId] = useState<string | null>(null);

  async function handleTransferDecision(id: string, approve: boolean) {
    if (busyTransferId) return;
    setBusyTransferId(id);
    try {
      await decideTransfer({ id, approve });
      toast.show(approve ? 'Transfer approved.' : 'Transfer declined.', { tone: 'positive' });
      refreshTransfers();
    } catch (err) {
      showApiError(toast, err, 'Could not record that decision.');
    } finally {
      setBusyTransferId(null);
    }
  }

  return (
    <Page>
      <PageHeader
        title={activeEvent ? `Requests · ${activeEvent.title}` : 'Requests'}
        actions={
          <>
            {candidateEvents.length > 1 ? (
              <Select
                value={activeEventId ?? ''}
                onChange={setSelectedEventId}
                options={candidateEvents.map((e) => ({ value: e.id, label: e.title }))}
                ariaLabel="Event"
                style={{ height: 32, width: 'auto', minWidth: 180 }}
              />
            ) : null}
            <Button variant={tab === 'screening' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('screening')}>Screening</Button>
            <Button variant={tab === 'transfers' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('transfers')}>Transfers</Button>
            <Button variant={tab === 'messages' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('messages')}>Messages</Button>
          </>
        }
      />

      {tab === 'transfers' ? (
        <Panel>
          <DataTable<PendingTransfer>
            loading={transfersL.state === 'loading'}
            columns={[
              {
                key: 'event',
                header: 'Event',
                width: '1.4fr',
                accessor: (t) => (eventsL.state === 'hasData' ? (eventsL.data.find((e) => e.id === t.eventId)?.title ?? t.eventId) : t.eventId),
              },
              { key: 'passCode', header: 'Pass', width: '1fr', accessor: (t) => t.passCode, render: (t) => <span className="mono">{t.passCode}</span> },
              { key: 'toPhone', header: 'New holder', width: '1fr', accessor: (t) => t.toPhoneE164, render: (t) => <span className="mono">{t.toPhoneE164}</span> },
              { key: 'requestedAt', header: 'Requested', width: '1fr', sortable: true, accessor: (t) => t.requestedAt, render: (t) => new Date(t.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) },
              {
                key: 'actions',
                header: '',
                width: '1.2fr',
                align: 'right',
                render: (t) => (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button variant="outline" size="sm" disabled={busyTransferId === t.id} onClick={() => handleTransferDecision(t.id, false)}>Decline</Button>
                    <Button variant="primary" size="sm" disabled={busyTransferId === t.id} onClick={() => handleTransferDecision(t.id, true)}>Approve</Button>
                  </div>
                ),
              },
            ]}
            rows={transfersL.state === 'hasData' ? transfersL.data : []}
            rowKey={(t) => t.id}
            emptyMessage="No transfers waiting on you right now."
          />
        </Panel>
      ) : tab === 'messages' ? (
        !activeEventId ? (
          <EmptyState icon="calendar" title="No event selected" body="Pick an event above to see guests who've messaged you about it." />
        ) : (
          <div className="two-col" style={{ gridTemplateColumns: '340px 1fr', gap: 24 }}>
            <Panel>
              <DataTable<HostThreadSummary>
                loading={threadsL.state === 'loading'}
                columns={[
                  {
                    key: 'guest',
                    header: 'Guest',
                    width: '1.4fr',
                    accessor: (t) => t.handle ?? '',
                    render: (t) => <span style={{ fontWeight: t.guestId === selectedGuestId ? 600 : 400 }}>{t.handle ?? 'Unclaimed pass'}</span>,
                  },
                  { key: 'lastMessage', header: 'Last message', width: '2fr', accessor: (t) => t.lastMessage, render: (t) => (t.lastMessage.length > 40 ? `${t.lastMessage.slice(0, 40)}…` : t.lastMessage) },
                  {
                    key: 'actions',
                    header: '',
                    width: '0.8fr',
                    align: 'right',
                    render: (t) => (
                      <Button variant={t.guestId === selectedGuestId ? 'primary' : 'outline'} size="sm" onClick={() => setSelectedGuestId(t.guestId)}>
                        Open
                      </Button>
                    ),
                  },
                ]}
                rows={threadsL.state === 'hasData' ? threadsL.data : []}
                rowKey={(t) => t.guestId}
                emptyMessage="No guests have messaged you about this event yet."
              />
            </Panel>
            <Panel pad style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 420 }}>
              {!selectedGuestId ? (
                <EmptyState icon="comment-discussion" title="Pick a guest" body="Select a thread on the left to read and reply." />
              ) : (
                <>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                    {threadL.state === 'hasData' && threadL.data.length === 0 ? (
                      <EmptyState icon="comment-discussion" title="Nothing here yet" body="This guest hasn't sent a message yet." />
                    ) : (
                      threadL.state === 'hasData'
                        ? threadL.data.map((m) => <MessageBubble key={m.id} direction={m.senderKind === 'host' ? 'outgoing' : 'incoming'} text={m.body} />)
                        : null
                    )}
                  </div>
                  <ReplyComposer
                    value={messageDraft}
                    onChange={setMessageDraft}
                    tags={[]}
                    onRemoveTag={() => {}}
                    visibilityNote="This guest sees your reply."
                    onSend={handleSendMessage}
                    sendDisabled={!messageDraft.trim() || sendingMessage}
                    placeholder="Write a reply…"
                  />
                </>
              )}
            </Panel>
          </div>
        )
      ) : !activeEventId ? (
        <EmptyState icon="calendar" title="No event to screen" body="Publish or submit an event and its request-to-book queue will show up here." />
      ) : guestsLoadableValue.state === 'hasError' ? (
        <EmptyState icon="alert" title="Couldn't load requests" body="Check your connection and try again." />
      ) : (
        <div className="two-col" style={{ gridTemplateColumns: '1fr 300px', gap: 24 }}>
          <Panel>
            <DataTable<GuestRow>
              loading={guestsLoadableValue.state === 'loading'}
              columns={[
                {
                  key: 'handle',
                  header: 'Guest',
                  width: '1.6fr',
                  sortable: true,
                  accessor: (g) => g.handle ?? '',
                  render: (g) => (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span className="mono" style={{ width: 32, height: 32, flex: 'none', borderRadius: 999, background: 'var(--paper-tint)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                        {g.handle ? g.handle.slice(0, 4) : '····'}
                      </span>
                      <span style={{ fontWeight: 500 }}>{g.handle ?? 'Unclaimed pass'}</span>
                    </div>
                  ),
                },
                { key: 'code', header: 'Pass', width: '1fr', accessor: (g) => g.code, render: (g) => <span className="mono">{g.code}</span> },
                {
                  key: 'rating',
                  header: 'Rating',
                  width: '0.8fr',
                  sortable: true,
                  accessor: (g) => (g.rating != null ? Number(g.rating) : 0),
                  render: (g) => (g.rating != null ? `${Number(g.rating).toFixed(1)} ★` : '—'),
                },
                { key: 'state', header: 'State', width: '1fr', sortable: true, accessor: (g) => g.state },
                {
                  key: 'scannedAt',
                  header: 'Scanned',
                  width: '1fr',
                  sortable: true,
                  accessor: (g) => g.scannedAt,
                  render: (g) => (g.scannedAt ? new Date(g.scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'),
                },
                {
                  key: 'actions',
                  header: '',
                  width: '2fr',
                  align: 'right',
                  render: (g) =>
                    g.state === 'pending_approval' || g.state === 'pending_payment' || g.state === 'valid' ? (
                      decliningPassId === g.passId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240, alignItems: 'flex-end' }}>
                          <ReasonField value={declineReason} onChange={setDeclineReason} placeholder="Reason · required" />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button variant="outline-danger" size="sm" disabled={!declineReason.trim() || busyPassId === g.passId} onClick={() => handleDecline(g.passId)}>Confirm decline</Button>
                            <Button variant="outline" size="sm" onClick={() => setDecliningPassId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <Button variant="outline" size="sm" onClick={() => setDecliningPassId(g.passId)}>Decline</Button>
                          <Button variant="primary" size="sm" disabled={busyPassId === g.passId} onClick={() => handleApprove(g.passId)}>Approve</Button>
                        </div>
                      )
                    ) : (
                      <Chip tone="muted">{g.state}</Chip>
                    ),
                },
              ]}
              rows={guestsLoadableValue.state === 'hasData' ? guestsLoadableValue.data.guests : []}
              rowKey={(g) => g.passId}
              searchable
              searchPlaceholder="Search guests…"
              emptyMessage="No passes yet for this event."
            />
          </Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {guestsLoadableValue.state === 'hasData' ? (
              <>
                <Panel variant="dark" pad>
                  <div style={{ font: '500 14px var(--font-body)', marginBottom: 8 }}>Capacity</div>
                  <div style={{ font: '400 28px var(--font-display)' }}>
                    {guestsLoadableValue.data.capacityHeld}<span style={{ opacity: 0.6 }}> / {guestsLoadableValue.data.capacity}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.15)', marginTop: 10, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${guestsLoadableValue.data.capacity > 0 ? Math.min((guestsLoadableValue.data.capacityHeld / guestsLoadableValue.data.capacity) * 100, 100) : 0}%`,
                        background: 'var(--amber-base)',
                      }}
                    />
                  </div>
                </Panel>
                {/* `1h`'s room-mix percentage bar is deliberately absent —
                    it would need a holder gender field this schema has
                    never had (ratio screening's own enforcement gap, see
                    ticketing-service's purchase route comment on why
                    min_ratio_women is checked nowhere); a bar with no real
                    number behind it would be worse than not showing one. */}
              </>
            ) : null}
            {guestsLoadableValue.state === 'hasData' ? (
              <Panel pad>
                <div style={{ font: '500 14px var(--font-body)', marginBottom: 8 }}>Screening rule</div>
                <div className="text text-body-s tone-secondary">
                  {guestsLoadableValue.data.screening.requiresApproval ? 'Request-to-book — every guest waits for your decision.' : 'Open booking — no host approval required.'}
                </div>
                {guestsLoadableValue.data.screening.minRating != null ? (
                  <div className="text text-body-s tone-secondary" style={{ marginTop: 6 }}>Minimum conduct rating: {guestsLoadableValue.data.screening.minRating}</div>
                ) : null}
                {guestsLoadableValue.data.screening.minRatioWomen != null ? (
                  <div className="text text-body-s tone-secondary" style={{ marginTop: 6 }}>Minimum women ratio: {Math.round(Number(guestsLoadableValue.data.screening.minRatioWomen) * 100)}%</div>
                ) : null}
              </Panel>
            ) : null}
          </div>
        </div>
      )}
    </Page>
  );
}
