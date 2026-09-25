import { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Page, PageHeader, Panel, PanelTitle, Chip, Button, TextField, Select, DataTable, EmptyState, Skeleton, useToast } from '@jfc/ui-web';
import type { ChipTone, SelectOption } from '@jfc/ui-web';
import { suppliersLoadable, suppliersAtom, createSupplierAtom, purchaseOrdersLoadable, purchaseOrdersAtom, createPurchaseOrderAtom, receivePurchaseOrderAtom } from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { FnbCategory, PurchaseOrder } from '../lib/types';

const CATEGORIES: FnbCategory[] = ['food', 'bar', 'smoke'];
const CATEGORY_LABEL: Record<FnbCategory, string> = { food: 'Kitchen', bar: 'Bar', smoke: 'Smoke' };
const CATEGORY_OPTIONS: SelectOption<FnbCategory>[] = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
const STATE_TONE: Record<PurchaseOrder['state'], ChipTone> = { ordered: 'warning', received: 'positive', cancelled: 'muted' };

interface DraftLine {
  name: string;
  category: FnbCategory;
  quantity: string;
  unitCostRupees: string;
}

function emptyLine(): DraftLine {
  return { name: '', category: 'bar', quantity: '1', unitCostRupees: '' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * `/procurement` — the buying side inventory never had: hosts could see
 * what sold (Invoice) and what's left (Inventory), but nothing tracked
 * what was actually spent restocking a counter. Suppliers + purchase
 * orders are both real (fnb-service's routes/procurement.ts, new this
 * pass) — a PO's total is server-computed from its lines, and "receive"
 * can optionally raise a specific event's menu item's stock ceiling, not
 * just record the spend.
 */
export default function ProcurementPage() {
  const toast = useToast();
  const suppliersL = useAtomValue(suppliersLoadable);
  useToastOnError(suppliersL, 'Could not load suppliers.');
  const refreshSuppliers = useSetAtom(suppliersAtom);
  const createSupplier = useSetAtom(createSupplierAtom);

  const ordersL = useAtomValue(purchaseOrdersLoadable);
  useToastOnError(ordersL, 'Could not load purchase orders.');
  const refreshOrders = useSetAtom(purchaseOrdersAtom);
  const createOrder = useSetAtom(createPurchaseOrderAtom);
  const receiveOrder = useSetAtom(receivePurchaseOrderAtom);

  const suppliers = suppliersL.state === 'hasData' ? suppliersL.data : [];

  const [supplierName, setSupplierName] = useState('');
  const [supplierCategory, setSupplierCategory] = useState<FnbCategory | ''>('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);

  async function handleCreateSupplier() {
    if (!supplierName.trim() || creatingSupplier) return;
    setCreatingSupplier(true);
    try {
      await createSupplier({ name: supplierName.trim(), category: supplierCategory || undefined, contactPhone: supplierPhone.trim() || undefined });
      toast.show('Supplier added.', { tone: 'positive' });
      setSupplierName('');
      setSupplierCategory('');
      setSupplierPhone('');
      setShowSupplierForm(false);
      refreshSuppliers();
    } catch (err) {
      showApiError(toast, err, 'Could not add that supplier.');
    } finally {
      setCreatingSupplier(false);
    }
  }

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [placingOrder, setPlacingOrder] = useState(false);

  const validLines = lines.filter((l) => l.name.trim() && Number(l.quantity) > 0 && l.unitCostRupees.trim() !== '');
  const draftTotalPaise = validLines.reduce((sum, l) => sum + Math.round(Number(l.quantity) * Number(l.unitCostRupees) * 100), 0);

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handlePlaceOrder() {
    if (!selectedSupplierId || validLines.length === 0 || placingOrder) return;
    setPlacingOrder(true);
    try {
      await createOrder({
        supplierId: selectedSupplierId,
        notes: notes.trim() || undefined,
        items: validLines.map((l) => ({ name: l.name.trim(), category: l.category, quantity: Number(l.quantity), unitCostPaise: Math.round(Number(l.unitCostRupees) * 100) })),
      });
      toast.show('Purchase order placed.', { tone: 'positive' });
      setLines([emptyLine()]);
      setNotes('');
      refreshOrders();
    } catch (err) {
      showApiError(toast, err, 'Could not place that order.');
    } finally {
      setPlacingOrder(false);
    }
  }

  const [receivingId, setReceivingId] = useState<string | null>(null);

  async function handleReceive(order: PurchaseOrder) {
    if (receivingId) return;
    setReceivingId(order.id);
    try {
      await receiveOrder({ id: order.id });
      toast.show(`${order.supplierName} order marked received.`, { tone: 'positive' });
      refreshOrders();
    } catch (err) {
      showApiError(toast, err, 'Could not mark that order received.');
    } finally {
      setReceivingId(null);
    }
  }

  return (
    <Page>
      <PageHeader title="Procurement" subtitle="Suppliers and stock purchases — the buying side of inventory." />

      <div className="two-col" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <Panel pad>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <PanelTitle>Suppliers</PanelTitle>
            <Button variant="outline" size="sm" onClick={() => setShowSupplierForm((v) => !v)}>{showSupplierForm ? 'Cancel' : '+ Add supplier'}</Button>
          </div>
          {showSupplierForm ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              <TextField label="Name" placeholder="e.g. Spirits & Co Distributors" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
              <Select
                value={supplierCategory}
                onChange={(v) => setSupplierCategory(v as FnbCategory)}
                options={[{ value: '', label: 'Any counter' }, ...CATEGORY_OPTIONS]}
                label="Usually supplies"
                style={{ height: 40 }}
              />
              <TextField label="Contact phone (optional)" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
              <Button variant="primary" disabled={!supplierName.trim() || creatingSupplier} onClick={handleCreateSupplier}>
                {creatingSupplier ? 'Adding…' : 'Add supplier'}
              </Button>
            </div>
          ) : suppliersL.state === 'loading' ? (
            <Skeleton height={60} radius={12} />
          ) : suppliers.length === 0 ? (
            <p className="text text-body-s tone-secondary" style={{ marginTop: 8 }}>No suppliers yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {suppliers.map((s) => (
                <div key={s.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(32,30,29,.08)' }}>
                  <span className="text text-body-s" style={{ fontWeight: 500 }}>{s.name}</span>
                  <div className="text text-caption tone-secondary">{s.category ? CATEGORY_LABEL[s.category] : 'Any counter'}{s.contactPhone ? ` · ${s.contactPhone}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel pad>
          <PanelTitle>New purchase order</PanelTitle>
          {suppliers.length === 0 ? (
            <p className="text text-body-s tone-secondary" style={{ marginTop: 8 }}>Add a supplier first.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <Select
                value={selectedSupplierId}
                onChange={setSelectedSupplierId}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                label="Supplier"
                style={{ height: 40 }}
              />
              {lines.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}>
                    <TextField label={`Item ${i + 1}`} placeholder="e.g. Absolut Vodka 1L" value={line.name} onChange={(e) => updateLine(i, { name: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select value={line.category} onChange={(v) => updateLine(i, { category: v as FnbCategory })} options={CATEGORY_OPTIONS} style={{ height: 40 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField label="Qty" type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField label="Cost ea (₹)" type="number" min={0} value={line.unitCostRupees} onChange={(e) => updateLine(i, { unitCostRupees: e.target.value })} />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>+ Add item</Button>
              <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              {validLines.length > 0 ? <Chip tone="muted">Total: {formatINR(draftTotalPaise / 100)}</Chip> : null}
              <Button variant="primary" disabled={!selectedSupplierId || validLines.length === 0 || placingOrder} onClick={handlePlaceOrder}>
                {placingOrder ? 'Placing…' : 'Place order'}
              </Button>
            </div>
          )}
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        {ordersL.state === 'hasData' && ordersL.data.length === 0 ? (
          <EmptyState icon="calendar" title="No purchase orders yet" body="Orders you place will show up here." />
        ) : (
          <Panel>
            <DataTable<PurchaseOrder>
              loading={ordersL.state === 'loading'}
              columns={[
                { key: 'supplier', header: 'Supplier', width: '1.4fr', accessor: (o) => o.supplierName },
                { key: 'items', header: 'Items', width: '0.8fr', accessor: (o) => o.items.length, render: (o) => String(o.items.length) },
                { key: 'total', header: 'Total', width: '1fr', align: 'right', accessor: (o) => o.totalPaise, render: (o) => <span className="num">{formatINR(o.totalPaise / 100)}</span> },
                { key: 'state', header: 'Status', width: '1fr', render: (o) => <Chip tone={STATE_TONE[o.state]}>{o.state}</Chip> },
                { key: 'orderedAt', header: 'Ordered', width: '1.2fr', sortable: true, accessor: (o) => o.orderedAt, render: (o) => formatDate(o.orderedAt) },
                {
                  key: 'actions',
                  header: '',
                  width: '1fr',
                  align: 'right',
                  render: (o) =>
                    o.state === 'ordered' ? (
                      <Button variant="primary" size="sm" disabled={receivingId === o.id} onClick={() => handleReceive(o)}>
                        {receivingId === o.id ? 'Working…' : 'Mark received'}
                      </Button>
                    ) : null,
                },
              ]}
              rows={ordersL.state === 'hasData' ? ordersL.data : []}
              rowKey={(o) => o.id}
              pageSize={10}
              emptyMessage="No purchase orders yet."
            />
          </Panel>
        )}
      </div>
    </Page>
  );
}
