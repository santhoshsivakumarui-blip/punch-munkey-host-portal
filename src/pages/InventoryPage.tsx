import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Page, PageHeader, Panel, PanelTitle, StatGrid, StatTile, Chip, Button, TextField, Select, EmptyState, Skeleton, useToast } from '@punch-munkey/ui-web';
import type { ChipTone, SelectOption } from '@punch-munkey/ui-web';
import { eventsLoadable, createFnbItemAtom, selectedBusinessEventIdAtom } from '../lib/atoms';
import { api, paths } from '../lib/api';
import { showApiError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { FnbCategory, FnbItem, FnbStockResponse } from '../lib/types';

const CATEGORIES: FnbCategory[] = ['food', 'bar', 'smoke'];
const CATEGORY_LABEL: Record<FnbCategory, string> = { food: 'Kitchen', bar: 'Bar', smoke: 'Smoke' };
const CATEGORY_OPTIONS: SelectOption<FnbCategory>[] = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

// A pub/bar convention, not a backend concept — fnb_items has no low-stock
// threshold column, so this is purely a portal-side read of stockRemaining
// vs. stockInitial. 20%-of-starting-count is a reasonable default reorder
// point; a host with unlimited-stock items (both null) never sees either
// state, since there's nothing to run low on.
const LOW_STOCK_RATIO = 0.2;

function stockTone(item: FnbItem): { label: string; tone: ChipTone } | null {
  if (item.stockRemaining === null || item.stockInitial === null) return null;
  if (item.stockRemaining <= 0) return { label: 'Out of stock', tone: 'critical' };
  if (item.stockInitial > 0 && item.stockRemaining <= item.stockInitial * LOW_STOCK_RATIO) return { label: 'Low stock', tone: 'warning' };
  return null;
}

/**
 * Organisation-only (gated at the route level — see App.tsx): per-event
 * food/bar/smoke inventory overview. Each item is now a link into its own
 * `/inventory/items/:id` details entry (stock adjustment moved there,
 * along with real order history) — this page stays the category-grouped
 * overview + where new items get added, not where every action lives.
 */
export default function InventoryPage() {
  const toast = useToast();
  const eventsL = useAtomValue(eventsLoadable);
  const createFnbItem = useSetAtom(createFnbItemAtom);

  const candidateEvents = eventsL.state === 'hasData' ? eventsL.data.filter((e) => e.state !== 'cancelled' && e.state !== 'closed') : [];
  // Shared with Invoice/Accounting — Inventory/Procurement/Invoice/
  // Accounting are one connected business-operations area, now grouped
  // under the sidebar's "Business ops" branch (Sidebar.tsx). See
  // selectedBusinessEventIdAtom's own comment. Falls back to this page's
  // own first candidate when the shared selection isn't in this page's
  // (narrower) list, without overwriting it for the other pages.
  const [sharedEventId, setSharedEventId] = useAtom(selectedBusinessEventIdAtom);
  const activeEventId = candidateEvents.some((e) => e.id === sharedEventId) ? sharedEventId : (candidateEvents[0]?.id ?? null);
  const activeEvent = candidateEvents.find((e) => e.id === activeEventId) ?? null;

  const [stock, setStock] = useState<FnbStockResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!activeEventId) {
      setStock(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<FnbStockResponse>(paths.eventFnbStock(activeEventId))
      .then((res) => {
        if (!cancelled) setStock(res);
      })
      .catch((err) => showApiError(toast, err, 'Could not load inventory.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEventId, reloadTick]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<FnbCategory>('food');
  const [priceRupees, setPriceRupees] = useState('');
  const [stockCount, setStockCount] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAddItem() {
    if (!activeEventId || !name.trim() || !priceRupees || adding) return;
    setAdding(true);
    try {
      await createFnbItem({
        eventId: activeEventId,
        name: name.trim(),
        category,
        pricePaise: Math.round(Number(priceRupees) * 100),
        stockInitial: stockCount.trim() ? Number(stockCount) : undefined,
      });
      toast.show('Item added.', { tone: 'positive' });
      setName('');
      setPriceRupees('');
      setStockCount('');
      setReloadTick((t) => t + 1);
    } catch (err) {
      showApiError(toast, err, 'Could not add that item.');
    } finally {
      setAdding(false);
    }
  }

  if (eventsL.state === 'loading') {
    return (
      <Page>
        <PageHeader title="Inventory" />
        <Skeleton height={40} radius={12} />
      </Page>
    );
  }

  if (candidateEvents.length === 0) {
    return (
      <Page>
        <PageHeader title="Inventory" subtitle="Food, bar & smoke stock and billing, per night." />
        <EmptyState icon="calendar" title="No events to stock yet" body="Build a night first — inventory attaches to a specific event." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Inventory"
        subtitle="Food, bar & smoke stock and billing, per night."
        actions={
          <Select
            value={activeEventId ?? ''}
            onChange={setSharedEventId}
            options={candidateEvents.map((e) => ({ value: e.id, label: e.title }))}
            ariaLabel="Event"
            style={{ height: 40, width: 'auto', minWidth: 200 }}
          />
        }
      />

      {loading || !stock ? (
        <Skeleton height={90} radius={16} />
      ) : (
        <>
          <StatGrid>
            <StatTile label="Kitchen billed" value={formatINR(stock.billing.food / 100)} />
            <StatTile label="Bar billed" value={formatINR(stock.billing.bar / 100)} />
            <StatTile label="Smoke billed" value={formatINR(stock.billing.smoke / 100)} />
            <StatTile label="Total billed" value={formatINR(stock.billing.total / 100)} variant="dark" note={activeEvent?.title} />
          </StatGrid>

          <Panel pad style={{ marginTop: 16, maxWidth: 560 }}>
            <PanelTitle>Add an item</PanelTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <TextField label="Name" placeholder="e.g. Tandoori Platter" value={name} onChange={(e) => setName(e.target.value)} />
              <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} label="Counter" style={{ height: 40 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <TextField label="Price (₹)" type="number" min={0} value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField label="Stock (blank = unlimited)" type="number" min={0} value={stockCount} onChange={(e) => setStockCount(e.target.value)} />
                </div>
              </div>
              <Button variant="primary" disabled={!name.trim() || !priceRupees || adding} onClick={handleAddItem}>
                {adding ? 'Adding…' : 'Add item'}
              </Button>
            </div>
          </Panel>

          {CATEGORIES.map((cat) => {
            const items = stock.data.filter((item) => item.category === cat);
            return (
              <Panel pad key={cat} style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <PanelTitle>{CATEGORY_LABEL[cat]}</PanelTitle>
                  <Chip tone="muted">{formatINR(stock.billing[cat] / 100)} billed</Chip>
                </div>
                {items.length === 0 ? (
                  <p className="text text-body-s tone-secondary" style={{ margin: 0 }}>No {CATEGORY_LABEL[cat].toLowerCase()} items yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {items.map((item) => {
                      const status = stockTone(item);
                      return (
                        <Link
                          key={item.id}
                          to={`/inventory/items/${item.id}`}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(32,30,29,.08)', textDecoration: 'none', color: 'inherit' }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="text text-title" style={{ fontWeight: 500 }}>{item.name}</span>
                              {status ? <Chip tone={status.tone}>{status.label}</Chip> : null}
                            </div>
                            <div className="text text-caption tone-secondary">
                              {formatINR(item.pricePaise / 100)} · {item.stockRemaining === null ? 'unlimited stock' : `${item.stockRemaining} of ${item.stockInitial} left`} · {item.redemptions.confirmed ?? 0} sold
                            </div>
                          </div>
                          <span className="text text-caption tone-secondary">View →</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Panel>
            );
          })}
        </>
      )}
    </Page>
  );
}
