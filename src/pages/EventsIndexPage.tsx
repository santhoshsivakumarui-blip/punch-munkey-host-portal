import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { Page, PageHeader, Panel, Chip, Button, Pagination, EmptyState, Skeleton } from '@jfc/ui-web';
import type { ChipTone } from '@jfc/ui-web';
import { eventsLoadable } from '../lib/atoms';
import { clearDraft, saveDraft } from '../lib/wizardDraft';
import { formatINR } from '../lib/format';
import { useToastOnError } from '../lib/toastError';
import { api, paths } from '../lib/api';
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

type FilterTabKey = 'all' | 'live' | 'draft' | 'past';
const FILTER_TABS: { key: FilterTabKey; label: string; match: (e: EventRecord) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'live', label: 'Live', match: (e) => e.state === 'on_sale' || e.state === 'sold_out' || e.state === 'doors_open' },
  { key: 'draft', label: 'Draft', match: (e) => e.state === 'draft' || e.state === 'in_review' },
  { key: 'past', label: 'Past', match: (e) => e.state === 'cancelled' || e.state === 'closed' || e.state === 'postponed' },
];
const PAGE_SIZE = 9;

function formatDoors(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

function primaryActionLabel(state: EventState): string {
  if (state === 'draft' || state === 'in_review') return 'Finish setup';
  if (state === 'on_sale' || state === 'sold_out' || state === 'doors_open') return 'Open live view';
  return 'View details';
}

// `6b` — was a flat DataTable; the mockup specifies image cards with a
// state-appropriate primary action and pill/count filter tabs, not a
// generic table + dropdown. What the mockup ALSO shows per-card (checked-in
// count, escrow total, missing-field callouts) is deliberately left out —
// that would mean one dashboard-shaped fetch per card just to render a
// list, which is the exact N+1 this page shouldn't do; `EventDetailPage`
// (this session's own live-ops rebuild) is where those real numbers live,
// one click away via "Open live view".
export default function EventsIndexPage() {
  const navigate = useNavigate();
  const loadable = useAtomValue(eventsLoadable);
  useToastOnError(loadable, 'Could not load your events.');
  const [tab, setTab] = useState<(typeof FILTER_TABS)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Elasticsearch-backed (title AND venue name, typo-tolerant) — see
  // lib/searchIndex.ts. `null` means "no server results yet for the
  // current search box contents" (either empty, or still debouncing/in
  // flight); the local `.includes()` filter below is used as the instant
  // fallback in that gap so a keystroke never flashes an empty list while
  // waiting on the network.
  const [searchResults, setSearchResults] = useState<EventRecord[] | null>(null);

  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<{ data: EventRecord[] }>(paths.hostsMeEventsSearch(term))
        .then((res) => {
          if (!cancelled) setSearchResults(res.data);
        })
        .catch(() => {
          // Search is an enhancement over the always-available local filter
          // below, not a hard dependency — a failed call just means this
          // keystroke stays on the local fallback instead of erroring the page.
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const events = loadable.state === 'hasData' ? loadable.data : [];
  const activeTab = FILTER_TABS.find((t) => t.key === tab) ?? FILTER_TABS[0];
  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return events.filter(activeTab.match);
    const base = searchResults ?? events.filter((e) => e.title.toLowerCase().includes(term));
    return base.filter(activeTab.match);
  }, [events, activeTab, search, searchResults]);
  const pageCount = Math.max(Math.ceil(filteredEvents.length / PAGE_SIZE), 1);
  const pageEvents = filteredEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function changeTab(key: (typeof FILTER_TABS)[number]['key']) {
    setTab(key);
    setPage(1);
  }

  function startNewEvent() {
    clearDraft();
    navigate('/events/new/basics');
  }

  // Only the fields that actually persist server-side carry over
  // (EventRecord has no eventType/description column) — a real duplicate
  // of what exists, not a fabricated full copy. Doors/last-entry times
  // reuse the source event's own clock times; the date itself is left
  // blank since "duplicate last week" means a new night, not the same one.
  function duplicateEvent(source: EventRecord) {
    clearDraft();
    const doors = new Date(source.doorsAt);
    const ends = new Date(source.endsAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    saveDraft({
      basics: {
        eventType: 'club',
        title: source.title,
        dateISO: '',
        startTime: `${pad(doors.getHours())}:${pad(doors.getMinutes())}`,
        endTime: `${pad(ends.getHours())}:${pad(ends.getMinutes())}`,
        description: '',
        priceRupees: Math.round(source.pricePaise / 100),
        capacity: source.capacity,
        coverImageUrl: source.coverImageUrl ?? '',
      },
    });
    navigate('/events/new/basics');
  }

  if (loadable.state === 'loading') {
    return (
      <Page>
        <PageHeader title="Your events" />
        <Skeleton height={40} radius={12} />
        <Skeleton height={40} radius={12} />
        <Skeleton height={40} radius={12} />
      </Page>
    );
  }

  if (loadable.state === 'hasError') {
    return (
      <Page>
        <PageHeader title="Your events" />
        <EmptyState icon="alert" title="Couldn't load your events" body="Check your connection and reload the page." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Your events"
        subtitle="One row moving through draft → in_review → on_sale, per night."
        actions={<Button variant="primary" onClick={startNewEvent}>New event</Button>}
      />

      {events.length === 0 ? (
        <EmptyState icon="calendar" title="No events yet" body="Build your first night — the wizard saves as you go." actionLabel="New event" onAction={startNewEvent} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="tabs">
              {FILTER_TABS.map((t) => (
                <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => changeTab(t.key)}>
                  {t.label} {events.filter(t.match).length}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="data-table-search"
              placeholder="Search events…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search events"
              style={{ maxWidth: 240 }}
            />
          </div>

          {filteredEvents.length === 0 ? (
            <EmptyState icon="calendar" title="No events match this filter" body="Try a different tab, or clear the search." />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {pageEvents.map((e) => (
                  <Panel key={e.id} pad style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: 120,
                        margin: '-16px -16px 12px',
                        background: e.coverImageUrl
                          ? `var(--paper-tint2) center/cover no-repeat url("${e.coverImageUrl}")`
                          : 'linear-gradient(135deg, var(--paper-tint2), var(--paper-tint))',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <Link to={e.state === 'draft' ? '/events/new/basics' : `/events/${e.id}`} style={{ color: 'var(--text-primary)', fontWeight: 500, textDecoration: 'none' }}>
                        {e.title}
                      </Link>
                      <Chip tone={STATE_TONE[e.state]}>{e.state.replace('_', ' ')}</Chip>
                    </div>
                    <div className="text text-caption tone-secondary" style={{ marginTop: 4 }}>
                      {formatDoors(e.doorsAt)} · {formatINR(e.pricePaise / 100)} · {e.capacity} cap
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Button
                        variant="primary"
                        size="sm"
                        block
                        onClick={() => navigate(e.state === 'draft' ? '/events/new/basics' : `/events/${e.id}`)}
                      >
                        {primaryActionLabel(e.state)}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => duplicateEvent(e)}>Duplicate</Button>
                    </div>
                  </Panel>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={filteredEvents.length} pageSize={PAGE_SIZE} />
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
