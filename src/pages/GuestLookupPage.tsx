import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader, Chip, ListCard, EmptyState, Skeleton } from '@jfc/ui-web';
import type { ChipTone } from '@jfc/ui-web';
import { api, paths } from '../lib/api';

interface PassSearchResult {
  id: string;
  code: string;
  eventId: string;
  eventTitle: string;
  holderHandle: string;
  holderPhoneMasked: string | null;
  state: string;
  purchasedAt: string;
}

const STATE_TONE: Record<string, ChipTone> = {
  pending_payment: 'muted',
  valid: 'positive',
  transferred: 'muted',
  scanned: 'positive',
  void: 'critical',
  refunded: 'critical',
};

/**
 * Box-office/guest lookup — find a pass for one of this host's own events
 * by the holder's handle, phone, or the pass code itself. A capability this
 * portal had nowhere before (see ticketing-service's hostPasses.ts +
 * lib/searchIndex.ts for the Elasticsearch-backed query and for why the
 * phone is searchable but always shown masked here — never the full
 * number). Deliberately no client-side fallback the way EventsIndexPage's
 * search box has one: there's no "all passes" already loaded in this portal
 * to fall back to, so a query only ever reflects the live server search.
 */
export default function GuestLookupPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PassSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get<{ data: PassSearchResult[] }>(paths.hostsMePassesSearch(term))
        .then((res) => {
          if (!cancelled) {
            setResults(res.data);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('Could not search right now.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <Page>
      <PageHeader title="Guest lookup" subtitle="Find a pass for one of your own events — by handle, phone, or pass code." />

      <input
        type="search"
        className="data-table-search"
        placeholder="Search by handle, phone, or pass code…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search guests and passes"
        autoFocus
        style={{ maxWidth: 360, marginBottom: 16 }}
      />

      {!query.trim() ? (
        <EmptyState icon="search" title="Find a guest" body="Type a handle, phone number, or pass code to search your own events." />
      ) : loading && results === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={56} radius={12} />
          <Skeleton height={56} radius={12} />
        </div>
      ) : error ? (
        <EmptyState icon="alert" title="Couldn't search" body={error} />
      ) : results && results.length === 0 ? (
        <EmptyState icon="search" title="No matches" body="Try a different handle, phone number, or pass code." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(results ?? []).map((r) => (
            <ListCard
              key={r.id}
              onClick={() => navigate(`/events/${r.eventId}`)}
              top={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{r.holderHandle || 'Unnamed guest'}</span>
                  <Chip tone={STATE_TONE[r.state] ?? 'muted'}>{r.state.replace('_', ' ')}</Chip>
                </div>
              }
              sub={`${r.code} · ${r.eventTitle}${r.holderPhoneMasked ? ` · ${r.holderPhoneMasked}` : ''}`}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
