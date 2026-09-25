import { useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import { Page, PageHeader, Panel, PanelTitle, KvRow, DataTable, StatGrid, StatTile, Chip, Button, TextField, Select, ConfirmModal, Skeleton, EmptyState, useToast } from '@jfc/ui-web';
import type { ChipTone, SelectOption } from '@jfc/ui-web';
import { eventsLoadable, voidFnbRedemptionAtom, accountingSummaryAtom, selectedBusinessEventIdAtom } from '../lib/atoms';
import { api, paths } from '../lib/api';
import { showApiError, useToastOnError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { FnbCategory, FnbInvoiceLine } from '../lib/types';

const CATEGORY_LABEL: Record<FnbCategory, string> = { food: 'Kitchen', bar: 'Bar', smoke: 'Smoke' };
const CATEGORY_FILTER_OPTIONS: SelectOption<FnbCategory | 'all'>[] = [
  { value: 'all', label: 'All counters' },
  { value: 'food', label: 'Kitchen' },
  { value: 'bar', label: 'Bar' },
  { value: 'smoke', label: 'Smoke' },
];
const STATE_TONE: Record<FnbInvoiceLine['state'], ChipTone> = { confirmed: 'positive', unconfirmed: 'warning', voided: 'muted' };
const PAGE_SIZE = 10;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Organisation-only (same `RequireOrganisation` gate as `/inventory` — App.tsx),
 * and it goes together with that page: `fnb/stock`'s billing block is the
 * per-category *total*, this is the receipt-shaped ledger those totals are
 * made of, one row per unit a guest actually ordered. `GET
 * /events/:id/fnb/invoice` (fnb-service) — new this pass, chains
 * ticketing-service's pass lookup (now returning `holderId`, not just
 * `purchaserId` — a transferred pass has a different holder than whoever
 * paid) into identity-service's handle resolution, same two-hop pattern
 * ticketing-service's own resolve-pass route already used.
 */
export default function InvoicePage() {
  const toast = useToast();
  const voidRedemption = useSetAtom(voidFnbRedemptionAtom);
  const eventsL = useAtomValue(eventsLoadable);
  const candidateEvents = eventsL.state === 'hasData' ? eventsL.data.filter((e) => e.state !== 'cancelled' && e.state !== 'closed') : [];
  // Shared with Inventory/Accounting — see selectedBusinessEventIdAtom's own comment.
  const [sharedEventId, setSharedEventId] = useAtom(selectedBusinessEventIdAtom);
  const activeEventId = candidateEvents.some((e) => e.id === sharedEventId) ? sharedEventId : (candidateEvents[0]?.id ?? null);
  const activeEvent = candidateEvents.find((e) => e.id === activeEventId) ?? null;
  const [categoryFilter, setCategoryFilter] = useState<FnbCategory | 'all'>('all');

  const [lines, setLines] = useState<FnbInvoiceLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!activeEventId) {
      setLines(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<{ data: FnbInvoiceLine[] }>(paths.eventFnbInvoice(activeEventId))
      .then((res) => {
        if (!cancelled) setLines(res.data);
      })
      .catch((err) => showApiError(toast, err, 'Could not load the invoice.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEventId, reloadTick]);

  const [voidTarget, setVoidTarget] = useState<FnbInvoiceLine | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  async function confirmVoid() {
    if (!voidTarget || !voidReason.trim() || voiding) return;
    setVoiding(true);
    try {
      await voidRedemption({ redemptionId: voidTarget.id, reason: voidReason.trim() });
      toast.show(`${voidTarget.itemName} voided.`, { tone: 'positive' });
      setVoidTarget(null);
      setReloadTick((t) => t + 1);
    } catch (err) {
      showApiError(toast, err, 'Could not void that order.');
    } finally {
      setVoiding(false);
    }
  }

  const filteredLines = useMemo(
    () => (lines ?? []).filter((l) => categoryFilter === 'all' || l.category === categoryFilter),
    [lines, categoryFilter],
  );

  const confirmedTotal = filteredLines.filter((l) => l.state === 'confirmed').reduce((sum, l) => sum + l.amountPaise, 0);
  const confirmedCount = filteredLines.filter((l) => l.state === 'confirmed').length;

  // Same factory-atom pattern as accountingSummaryAtom's other call site
  // (AccountingPage) — tied to activeEventId via useMemo so it only
  // recreates (and refetches) when the event actually changes.
  const summaryAtom = useMemo(() => loadable(accountingSummaryAtom(activeEventId ?? '__none__')), [activeEventId]);
  const summaryL = useAtomValue(summaryAtom);
  useToastOnError(summaryL, 'Could not load the tax breakdown.');

  if (eventsL.state === 'loading') {
    return (
      <Page>
        <PageHeader title="Invoice" />
        <Skeleton height={40} radius={12} />
      </Page>
    );
  }

  if (candidateEvents.length === 0) {
    return (
      <Page>
        <PageHeader title="Invoice" subtitle="Itemized food, bar & smoke orders, per night." />
        <EmptyState icon="calendar" title="No events to invoice yet" body="Build a night and take some orders first." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Invoice"
        subtitle="Itemized food, bar & smoke orders, per night."
        actions={
          <>
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={CATEGORY_FILTER_OPTIONS}
              ariaLabel="Filter by counter"
              style={{ height: 40, width: 'auto', minWidth: 150 }}
            />
            <Select
              value={activeEventId ?? ''}
              onChange={setSharedEventId}
              options={candidateEvents.map((e) => ({ value: e.id, label: e.title }))}
              ariaLabel="Event"
              style={{ height: 40, width: 'auto', minWidth: 200 }}
            />
          </>
        }
      />

      {loading || lines === null ? (
        <Skeleton height={90} radius={16} />
      ) : (
        <>
          <StatGrid>
            <StatTile label="Billed" value={formatINR(confirmedTotal / 100)} note={activeEvent?.title} />
            <StatTile label="Confirmed orders" value={String(confirmedCount)} />
            <StatTile label="Total rows" value={String(filteredLines.length)} note="incl. unconfirmed/voided" variant="dark" />
          </StatGrid>

          {summaryL.state === 'hasData' ? (
            <Panel pad style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <PanelTitle>Tax breakdown</PanelTitle>
                <Chip tone="muted">Net {formatINR(summaryL.data.netPaise / 100)}</Chip>
              </div>
              <div style={{ marginTop: 8 }}>
                {summaryL.data.categories.map((c) => (
                  <KvRow key={c.category} label={`${CATEGORY_LABEL[c.category]} — ${c.rateLabel}`} value={`${formatINR(c.revenuePaise / 100)} rev · ${formatINR(c.taxPaise / 100)} tax`} mono />
                ))}
                <KvRow label="Tax owed (total)" value={formatINR(summaryL.data.totalTaxPaise / 100)} mono />
              </div>
            </Panel>
          ) : null}

          <div style={{ marginTop: 16 }}>
            {filteredLines.length === 0 ? (
              <EmptyState icon="calendar" title="No orders yet" body="Orders taken at the bar, kitchen or smoke counter will show up here." />
            ) : (
              <DataTable<FnbInvoiceLine>
                columns={[
                  { key: 'item', header: 'Item', width: '1.6fr', sortable: true, accessor: (l) => l.itemName },
                  {
                    key: 'category',
                    header: 'Counter',
                    width: '1fr',
                    sortable: true,
                    accessor: (l) => l.category ?? '',
                    render: (l) => (l.category ? CATEGORY_LABEL[l.category] : '—'),
                  },
                  { key: 'guest', header: 'Guest', width: '1fr', sortable: true, accessor: (l) => l.guestHandle ?? '', render: (l) => l.guestHandle ?? '—' },
                  { key: 'amount', header: 'Amount', width: '1fr', align: 'right', sortable: true, accessor: (l) => l.amountPaise, render: (l) => <span className="num">{formatINR(l.amountPaise / 100)}</span> },
                  { key: 'state', header: 'Status', width: '1fr', render: (l) => <Chip tone={STATE_TONE[l.state]}>{l.state}</Chip> },
                  { key: 'time', header: 'Time', width: '1.3fr', sortable: true, accessor: (l) => l.scannedAt, render: (l) => formatDateTime(l.scannedAt) },
                  {
                    key: 'actions',
                    header: '',
                    width: '0.9fr',
                    align: 'right',
                    render: (l) =>
                      l.state === 'confirmed' ? (
                        <Button variant="outline-danger" size="sm" onClick={() => { setVoidTarget(l); setVoidReason(''); }}>
                          Void
                        </Button>
                      ) : null,
                  },
                ]}
                rows={filteredLines}
                rowKey={(l) => l.id}
                searchable
                searchPlaceholder="Search item or guest…"
                pageSize={PAGE_SIZE}
              />
            )}
          </div>
        </>
      )}

      <ConfirmModal
        open={voidTarget !== null}
        title={`Void ${voidTarget?.itemName ?? 'this order'}?`}
        body="Reverses the charge and, for a stock-tracked item, restores one unit. Logged to the audit trail."
        confirmLabel={voiding ? 'Voiding…' : 'Void'}
        danger
        confirmDisabled={voiding || !voidReason.trim()}
        onCancel={() => (voiding ? null : setVoidTarget(null))}
        onConfirm={confirmVoid}
      >
        <TextField label="Reason" placeholder="e.g. Rang up the wrong item" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
      </ConfirmModal>
    </Page>
  );
}
