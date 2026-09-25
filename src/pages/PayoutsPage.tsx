import { useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader, StatGrid, StatTile, Panel, PanelTitle, LedgerRow, Chip, Button, EmptyState, Skeleton } from '@jfc/ui-web';
import { payoutsLoadable } from '../lib/atoms';
import { useToastOnError } from '../lib/toastError';
import { formatINR } from '../lib/format';

// `2o` — payouts & escrow ledger. `GET /hosts/me/payouts`. Escrow releases
// 12 hours after doors close, minus anything disputed — the design's third
// invariant; nothing here implies a payout before `paidAt` is set.
export default function PayoutsPage() {
  const navigate = useNavigate();
  const loadable = useAtomValue(payoutsLoadable);
  useToastOnError(loadable, 'Could not load your payouts.');

  const payoutAccountAction = <Button variant="outline" onClick={() => navigate('/payout-account')}>Payout account</Button>;

  if (loadable.state === 'loading') {
    return (
      <Page>
        <PageHeader title="Payouts & escrow" actions={payoutAccountAction} />
        <Skeleton height={100} radius={16} />
        <Skeleton height={200} radius={16} />
      </Page>
    );
  }

  if (loadable.state === 'hasError') {
    return (
      <Page>
        <PageHeader title="Payouts & escrow" actions={payoutAccountAction} />
        <EmptyState icon="alert" title="Couldn't load payouts" body="Check your connection and reload the page." />
      </Page>
    );
  }

  const payouts = loadable.data;
  const held = payouts.filter((p) => p.state !== 'paid').reduce((sum, p) => sum + p.netPaise, 0);
  const released = payouts.filter((p) => p.state === 'paid').reduce((sum, p) => sum + p.netPaise, 0);

  return (
    <Page>
      <PageHeader title="Payouts & escrow" subtitle="Every payout traces back to a ledger row." actions={payoutAccountAction} />
      <StatGrid>
        <StatTile label="Held in escrow" value={formatINR(Math.round(held / 100))} note={`${payouts.filter((p) => p.state !== 'paid').length} pending`} />
        <StatTile label="Released, total" value={formatINR(Math.round(released / 100))} noteTone="positive" />
        <StatTile label="Payouts on record" value={String(payouts.length)} />
      </StatGrid>
      <Panel pad style={{ marginTop: 16 }}>
        <PanelTitle>Ledger</PanelTitle>
        {payouts.length === 0 ? (
          <EmptyState icon="calendar" title="No payouts yet" body="One shows up here 12 hours after your first event's doors close." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {payouts.map((p) => (
              <LedgerRow
                key={p.id}
                direction="credit"
                description={`Payout · gross ${formatINR(Math.round(p.grossPaise / 100))}, fee ${formatINR(Math.round(p.feePaise / 100))}, TDS ${formatINR(Math.round(p.tdsPaise / 100))}, GST ${formatINR(Math.round(p.gstPaise / 100))}${p.heldPaise > 0 ? `, held ${formatINR(Math.round(p.heldPaise / 100))}` : ''}`}
                reference={p.state === 'paid' ? `paid ${new Date(p.paidAt!).toLocaleDateString('en-IN')}` : `scheduled ${new Date(p.scheduledFor).toLocaleDateString('en-IN')}`}
                amount={formatINR(Math.round(p.netPaise / 100))}
              />
            ))}
          </div>
        )}
        <Chip tone="muted">Paid 12 hours after doors close, minus anything disputed.</Chip>
      </Panel>
    </Page>
  );
}
