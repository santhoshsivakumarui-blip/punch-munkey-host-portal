import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { Page, PageHeader, Panel, PanelTitle, KvRow, StatGrid, StatTile, Chip, Button, TextField, ConfirmModal, DataTable, Skeleton, EmptyState, useToast } from '@punch-munkey/ui-web';
import type { ChipTone } from '@punch-munkey/ui-web';
import { correctFnbStockAtom } from '../lib/atoms';
import { api, paths } from '../lib/api';
import { showApiError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { FnbCategory, FnbItemDetail } from '../lib/types';

const CATEGORY_LABEL: Record<FnbCategory, string> = { food: 'Kitchen', bar: 'Bar', smoke: 'Smoke' };
const STATE_TONE: Record<string, ChipTone> = { confirmed: 'positive', unconfirmed: 'warning', voided: 'muted' };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * `/inventory/items/:id` — the per-item "details entry" Inventory never
 * had: everything sat in one flat overview page, with no route of its own
 * per item. `GET /fnb/items/:id` (fnb-service, new this pass) — item plus
 * its own real redemption history, not just the aggregate counts the
 * overview shows.
 */
export default function InventoryItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const correctStock = useSetAtom(correctFnbStockAtom);

  const [item, setItem] = useState<FnbItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<FnbItemDetail>(paths.fnbItem(id))
      .then((res) => {
        if (!cancelled) setItem(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setNotFound(true);
        showApiError(toast, err, 'Could not load this item.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadTick]);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustCount, setAdjustCount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  function openAdjust() {
    if (!item) return;
    setAdjustCount(String(item.stockRemaining ?? 0));
    setAdjustReason('');
    setAdjustOpen(true);
  }

  async function confirmAdjust() {
    if (!item || !adjustReason.trim() || adjusting) return;
    setAdjusting(true);
    try {
      await correctStock({ itemId: item.id, stockRemaining: Number(adjustCount), reason: adjustReason.trim() });
      toast.show('Stock updated.', { tone: 'positive' });
      setAdjustOpen(false);
      setReloadTick((t) => t + 1);
    } catch (err) {
      showApiError(toast, err, 'Could not update that stock count.');
    } finally {
      setAdjusting(false);
    }
  }

  if (loading) {
    return (
      <Page>
        <PageHeader title="Loading…" />
        <Skeleton height={90} radius={16} />
      </Page>
    );
  }

  if (notFound || !item) {
    return (
      <Page>
        <PageHeader title="Item" />
        <EmptyState icon="alert" title="Couldn't load this item" body="It may have been removed." actionLabel="Back to inventory" onAction={() => navigate('/inventory')} />
      </Page>
    );
  }

  const confirmedRevenue = item.history.filter((h) => h.state === 'confirmed').reduce((sum, h) => sum + h.amountPaise, 0);
  const confirmedCount = item.history.filter((h) => h.state === 'confirmed').length;

  return (
    <Page>
      <PageHeader
        title={item.name}
        subtitle={`${CATEGORY_LABEL[item.category]} · ${formatINR(item.pricePaise / 100)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/inventory')}>Back to inventory</Button>
            {item.stockInitial !== null ? <Button variant="primary" onClick={openAdjust}>Adjust stock</Button> : null}
          </>
        }
      />

      <StatGrid>
        <StatTile label="Sold" value={String(confirmedCount)} />
        <StatTile label="Revenue" value={formatINR(confirmedRevenue / 100)} />
        <StatTile
          label="Stock"
          value={item.stockRemaining !== null ? `${item.stockRemaining} / ${item.stockInitial}` : '∞'}
          note={item.stockRemaining !== null ? 'remaining / starting' : 'unlimited'}
          variant="dark"
        />
      </StatGrid>

      <Panel pad style={{ maxWidth: 480, marginTop: 16 }}>
        <PanelTitle>Details</PanelTitle>
        <KvRow label="Counter" value={CATEGORY_LABEL[item.category]} />
        <KvRow label="Price" value={formatINR(item.pricePaise / 100)} mono />
        <KvRow label="Stock tracking" value={item.stockInitial !== null ? 'Tracked' : 'Unlimited'} />
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Panel>
          <div className="panel-header">
            <span className="panel-header-title">Order history</span>
            <span className="panel-header-meta">{item.history.length}</span>
          </div>
          {item.history.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-secondary)', textAlign: 'center' }}>No orders for this item yet.</div>
          ) : (
            <DataTable<FnbItemDetail['history'][number]>
              columns={[
                { key: 'guest', header: 'Guest', width: '1.4fr', accessor: (h) => h.guestHandle ?? '', render: (h) => h.guestHandle ?? '—' },
                { key: 'amount', header: 'Amount', width: '1fr', align: 'right', accessor: (h) => h.amountPaise, render: (h) => <span className="num">{formatINR(h.amountPaise / 100)}</span> },
                { key: 'state', header: 'Status', width: '1fr', render: (h) => <Chip tone={STATE_TONE[h.state]}>{h.state}</Chip> },
                { key: 'time', header: 'Time', width: '1.3fr', sortable: true, accessor: (h) => h.scannedAt, render: (h) => formatDateTime(h.scannedAt) },
              ]}
              rows={item.history}
              rowKey={(h) => h.id}
              pageSize={10}
            />
          )}
        </Panel>
      </div>

      <ConfirmModal
        open={adjustOpen}
        title={`Adjust ${item.name}`}
        body="Recount, spoilage write-off, or stock brought up from the cellar — set the real current count and say why."
        confirmLabel={adjusting ? 'Saving…' : 'Save'}
        confirmDisabled={adjusting || !adjustReason.trim() || adjustCount.trim() === ''}
        onCancel={() => (adjusting ? null : setAdjustOpen(false))}
        onConfirm={confirmAdjust}
      >
        <TextField label="Current count" type="number" min={0} value={adjustCount} onChange={(e) => setAdjustCount(e.target.value)} />
        <TextField label="Reason" placeholder="e.g. Recount at close" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
      </ConfirmModal>
    </Page>
  );
}
