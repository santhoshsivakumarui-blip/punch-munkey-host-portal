import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { loadable } from 'jotai/utils';
import { Page, PageHeader, StatGrid, StatTile, Panel, PanelTitle, BarRow, Select, Pagination, Skeleton, EmptyState } from '@punch-munkey/ui-web';
import type { SelectOption } from '@punch-munkey/ui-web';
import { hostReviewsAtom, eventsLoadable, safetyScoreLoadable, sessionAtom } from '../lib/atoms';
import { useToastOnError } from '../lib/toastError';

const STAR_FILTER_OPTIONS: SelectOption<string>[] = [
  { value: 'all', label: 'All ratings' },
  { value: '5', label: '5 ★' },
  { value: '4', label: '4 ★' },
  { value: '3', label: '3 ★' },
  { value: '2', label: '2 ★' },
  { value: '1', label: '1 ★' },
];
const PAGE_SIZE = 5;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/**
 * `7j` — ratings & safety score. `GET /hosts/me/reviews` (identity-service)
 * powers the rating StatTile and breakdown bars, with real pagination and a
 * star filter below. `GET /hosts/me/safety-score` (safety-service) is real
 * now too — see that route's own doc comment for the exact formula (a
 * judgment call: incidents per 100 admitted guests, inverted, `null` until
 * there's at least one admitted guest to measure against). Reliability is
 * real too now: `hosts.reliability` was always in `GET /hosts/me`'s
 * response, just never copied into `HostUser` (lib/atoms.ts's session
 * shape) — a mapping gap, not a missing endpoint.
 */
export default function RatingsPage() {
  const [starFilter, setStarFilter] = useState('all');
  const [page, setPage] = useState(1);
  const eventsL = useAtomValue(eventsLoadable);
  const safetyL = useAtomValue(safetyScoreLoadable);
  const { user } = useAtomValue(sessionAtom);
  const eventTitleById = useMemo(
    () => (eventsL.state === 'hasData' ? new Map(eventsL.data.map((e) => [e.id, e.title])) : new Map<string, string>()),
    [eventsL],
  );

  // Re-created per (stars, page) — same factory-atom pattern as
  // RequestsPage's eventGuestsAtom, since a plain atomWithRefresh can't
  // take fresh params per render.
  const reviewsLoadableAtom = useMemo(
    () => loadable(hostReviewsAtom({ stars: starFilter === 'all' ? 'all' : Number(starFilter), page, pageSize: PAGE_SIZE })),
    [starFilter, page],
  );
  const reviewsL = useAtomValue(reviewsLoadableAtom);
  useToastOnError(reviewsL, 'Could not load reviews.');
  useToastOnError(safetyL, 'Could not load your safety score.');

  function changeStarFilter(value: string) {
    setStarFilter(value);
    setPage(1);
  }

  const summary = reviewsL.state === 'hasData' ? reviewsL.data.summary : null;
  const breakdownTotal = summary ? summary.breakdown['5'] + summary.breakdown['4'] + summary.breakdown['3'] + summary.breakdown['2'] + summary.breakdown['1'] : 0;

  return (
    <Page>
      <PageHeader title="Ratings & safety score" />
      <StatGrid>
        <StatTile
          label="Rating"
          value={summary?.average != null ? `${summary.average.toFixed(1)} ★` : '—'}
          note={summary ? `${summary.total} review${summary.total === 1 ? '' : 's'}` : '…'}
        />
        <StatTile
          label="Safety score"
          value={safetyL.state === 'hasData' && safetyL.data.score != null ? safetyL.data.score.toFixed(2) : '—'}
          note={
            safetyL.state === 'hasData'
              ? safetyL.data.score != null
                ? `${safetyL.data.totalIncidents} incident${safetyL.data.totalIncidents === 1 ? '' : 's'} · ${safetyL.data.totalGuests} guests admitted`
                : 'No admitted guests yet'
              : safetyL.state === 'hasError'
                ? 'Could not load'
                : '…'
          }
          noteTone={safetyL.state === 'hasData' && safetyL.data.score != null && safetyL.data.score < 0.8 ? 'warning' : undefined}
        />
        <StatTile
          label="Reliability"
          value={user ? `${Math.round(Number(user.reliability) * 100)}%` : '—'}
          note="cancellation-adjusted"
          variant="dark"
        />
      </StatGrid>

      <Panel pad style={{ marginTop: 16, maxWidth: 480 }}>
        <PanelTitle>Rating breakdown</PanelTitle>
        {summary && breakdownTotal > 0 ? (
          (['5', '4', '3', '2', '1'] as const).map((s) => {
            const count = summary.breakdown[s];
            const percent = Math.round((count / breakdownTotal) * 100);
            return (
              <BarRow
                key={s}
                label={`${s} ★`}
                value={`${percent}%`}
                percent={percent}
                color={Number(s) >= 4 ? 'var(--sage-base)' : Number(s) === 3 ? 'var(--amber-base)' : 'var(--danger-strong)'}
              />
            );
          })
        ) : (
          <p className="text text-body-s tone-secondary" style={{ margin: 0 }}>No reviews yet — this fills in once guests start leaving them.</p>
        )}
      </Panel>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
        <PanelTitle>Reviews</PanelTitle>
        <Select value={starFilter} onChange={changeStarFilter} options={STAR_FILTER_OPTIONS} ariaLabel="Filter by rating" style={{ height: 36, width: 'auto', minWidth: 140 }} />
      </div>

      {reviewsL.state === 'loading' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={80} radius={14} />
          <Skeleton height={80} radius={14} />
        </div>
      ) : reviewsL.state === 'hasData' && reviewsL.data.data.length === 0 ? (
        <EmptyState
          icon="star"
          title={starFilter === 'all' ? 'No reviews yet' : 'No reviews at this rating'}
          body={starFilter === 'all' ? 'Reviews from guests will show up here after your events.' : 'Try a different rating, or clear the filter.'}
          actionLabel={starFilter === 'all' ? undefined : 'Clear filter'}
          onAction={starFilter === 'all' ? undefined : () => changeStarFilter('all')}
        />
      ) : reviewsL.state === 'hasData' ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviewsL.data.data.map((r) => (
              <Panel key={r.id} pad>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <span className="text text-title" style={{ fontWeight: 500, letterSpacing: 1 }}>{stars(r.stars)}</span>
                    <div className="text text-caption tone-secondary" style={{ marginTop: 3 }}>
                      {r.guestHandle} · {eventTitleById.get(r.eventId) ?? 'an event'} · {formatDate(r.createdAt)}
                    </div>
                  </div>
                </div>
                {r.comment ? (
                  <p className="text text-body-s" style={{ marginTop: 10, marginBottom: 0, lineHeight: 1.55 }}>{r.comment}</p>
                ) : (
                  <p className="text text-body-s tone-secondary" style={{ marginTop: 10, marginBottom: 0, fontStyle: 'italic' }}>No comment left.</p>
                )}
              </Panel>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Pagination
              page={page}
              pageCount={Math.max(Math.ceil(reviewsL.data.total / PAGE_SIZE), 1)}
              onPageChange={setPage}
              totalItems={reviewsL.data.total}
              pageSize={PAGE_SIZE}
            />
          </div>
        </>
      ) : null}
    </Page>
  );
}
