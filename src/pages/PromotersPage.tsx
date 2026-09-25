import { useAtomValue } from 'jotai';
import { Page, PageHeader, Panel, Chip, DataTable, Skeleton } from '@jfc/ui-web';
import { promotersLoadable } from '../lib/atoms';
import { useToastOnError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { PromoterReferral } from '../lib/types';

/**
 * `1i` — host-and-earn dashboard. Real: `GET /hosts/me/promoters`
 * (event-service, over `promoter_referrals`). `referredGuests`/`volumePaise`
 * come back `null` — no purchase has ever been attributed to a promoter's
 * referral anywhere in this codebase, so there's no real count/volume to
 * show, and "commission owed" has nothing to compute from. Shown as "not
 * tracked yet" rather than a fabricated 0 or ₹0. `commissionRate` and
 * `expiresAt` ARE real per-referral columns, so those render for real.
 */
export default function PromotersPage() {
  const loadable = useAtomValue(promotersLoadable);
  useToastOnError(loadable, 'Could not load your promoters.');

  return (
    <Page>
      <PageHeader title="Host-and-earn" subtitle="Promoters who bring guests to your nights." />
      <Panel variant="tint" pad style={{ maxWidth: 640 }}>
        <span className="text text-title" style={{ fontWeight: 500 }}>Commission override</span>
        <p className="text text-body-s tone-secondary" style={{ marginTop: 4, marginBottom: 0 }}>
          Set per promoter, deducted from your net — never from tax or the platform fee — on any host volume they bring in.
        </p>
      </Panel>
      <div style={{ marginTop: 16 }}>
        {loadable.state === 'loading' ? (
          <Skeleton height={120} radius={16} />
        ) : (
          <Panel>
            <DataTable<PromoterReferral>
              columns={[
                { key: 'phone', header: 'Promoter', width: '1.4fr', accessor: (r) => r.phoneE164 ?? '', render: (r) => <span className="mono">{r.phoneE164 ?? r.promoterId.slice(0, 8)}</span> },
                { key: 'rate', header: 'Commission rate', width: '1fr', align: 'right', accessor: (r) => r.commissionRate, render: (r) => <span className="num">{(r.commissionRate * 100).toFixed(1)}%</span> },
                {
                  key: 'referred',
                  header: 'Guests referred',
                  width: '1fr',
                  align: 'right',
                  accessor: (r) => r.referredGuests ?? -1,
                  render: (r) => (r.referredGuests != null ? <span className="num">{r.referredGuests}</span> : <span className="tone-secondary">not tracked yet</span>),
                },
                {
                  key: 'volume',
                  header: 'Volume',
                  width: '1fr',
                  align: 'right',
                  accessor: (r) => r.volumePaise ?? -1,
                  render: (r) => (r.volumePaise != null ? <span className="num">{formatINR(r.volumePaise / 100)}</span> : <span className="tone-secondary">—</span>),
                },
                {
                  key: 'status',
                  header: 'Status',
                  width: '1fr',
                  render: (r) => (
                    <Chip tone={r.active ? 'positive' : 'muted'}>{r.active ? 'active' : `expired ${new Date(r.expiresAt).toLocaleDateString('en-IN')}`}</Chip>
                  ),
                },
              ]}
              rows={loadable.state === 'hasData' ? loadable.data : []}
              rowKey={(r) => r.id}
              emptyMessage="No promoters yet."
            />
          </Panel>
        )}
      </div>
    </Page>
  );
}
