import { useCallback, useEffect, useState } from 'react';
import { Panel, TextField, Button, Select, Chip, useToast } from '@punch-munkey/ui-web';
import { api, paths } from '../lib/api';
import { showApiError } from '../lib/toastError';

/**
 * Ticket tiers for one event (ticketing-service `GET/POST /events/:id/tiers`,
 * `PATCH`/`DELETE /events/:id/tiers/:tierId`) — the "Tiers" half of the
 * design's "Tiers & menu" step. A tier is its own price and capacity, with
 * optional strike-through and surge pricing and menu items bundled into
 * the pass. All tiers together can't exceed the event's capacity (the
 * server checks). "Stop selling" hides a tier from new buyers; passes
 * already sold in it stay valid.
 */

export interface TierView {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  remaining: number;
  soldOut: boolean;
  pricePaise: number;
  compareAtPricePaise: number | null;
  fnbItems: Array<{ fnbItemId: string; name: string; isAlcoholic: boolean; quantity: number }>;
}

interface MenuItemOption {
  id: string;
  name: string;
  isAlcoholic: boolean;
}

interface TierForm {
  id?: string;
  name: string;
  description: string;
  priceRupees: string;
  capacity: string;
  compareAtRupees: string;
  surgeRupees: string;
  surgeThresholdPct: string;
  bundle: Array<{ fnbItemId: string; quantity: number }>;
}

const EMPTY_FORM: TierForm = { name: '', description: '', priceRupees: '', capacity: '', compareAtRupees: '', surgeRupees: '', surgeThresholdPct: '10', bundle: [] };

const SURGE_OPTIONS = [
  { value: '10', label: 'when under 10% left' },
  { value: '20', label: 'when under 20% left' },
  { value: '25', label: 'when under 25% left' },
];

const rupeesToPaise = (v: string): number | null => (v.trim() === '' ? null : Math.round(Number(v) * 100));

export function TiersPanel({ eventId, menuItems }: { eventId: string; menuItems: MenuItemOption[] }) {
  const toast = useToast();
  const [tiers, setTiers] = useState<TierView[] | null>(null);
  const [form, setForm] = useState<TierForm | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api
      .get<{ data: TierView[] }>(paths.eventTiers(eventId))
      .then((r) => setTiers(r.data))
      .catch((err) => {
        setTiers([]);
        showApiError(toast, err, 'Could not load ticket tiers.');
      });
  }, [eventId, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  function edit(tier: TierView) {
    setForm({
      id: tier.id,
      name: tier.name,
      description: tier.description ?? '',
      priceRupees: String(tier.pricePaise / 100),
      capacity: String(tier.capacity),
      compareAtRupees: tier.compareAtPricePaise === null ? '' : String(tier.compareAtPricePaise / 100),
      surgeRupees: '',
      surgeThresholdPct: '10',
      bundle: tier.fnbItems.map((f) => ({ fnbItemId: f.fnbItemId, quantity: f.quantity })),
    });
  }

  async function save() {
    if (!form || busy) return;
    const price = rupeesToPaise(form.priceRupees);
    const capacity = Number(form.capacity);
    if (!form.name.trim() || price === null || price < 0 || !Number.isInteger(capacity) || capacity < 1) {
      toast.show('A tier needs a name, a price and a capacity of at least 1.', { tone: 'warning' });
      return;
    }
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      pricePaise: price,
      capacity,
      compareAtPricePaise: rupeesToPaise(form.compareAtRupees),
      fnbItems: form.bundle.filter((b) => b.fnbItemId && b.quantity > 0),
    };
    const surge = rupeesToPaise(form.surgeRupees);
    if (surge !== null) {
      body.surgePricePaise = surge;
      body.surgeThresholdPct = Number(form.surgeThresholdPct) / 100;
    } else if (!form.id) {
      body.surgePricePaise = null;
    }
    setBusy(true);
    try {
      if (form.id) await api.patch(paths.eventTier(eventId, form.id), body);
      else await api.post(paths.eventTiers(eventId), body);
      setForm(null);
      reload();
      toast.show(form.id ? 'Tier updated.' : 'Tier added.', { tone: 'positive' });
    } catch (err) {
      showApiError(toast, err, 'Could not save this tier.');
    } finally {
      setBusy(false);
    }
  }

  async function stopSelling(tier: TierView) {
    if (!window.confirm(`Stop selling "${tier.name}"? Passes already sold stay valid.`)) return;
    try {
      await api.delete(paths.eventTier(eventId, tier.id));
      reload();
      toast.show(`"${tier.name}" is no longer on sale.`, { tone: 'positive' });
    } catch (err) {
      showApiError(toast, err, 'Could not stop selling this tier.');
    }
  }

  const itemOptions = menuItems.map((m) => ({ value: m.id, label: m.isAlcoholic ? `${m.name} (alcoholic)` : m.name }));

  return (
    <Panel pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="text text-title" style={{ fontWeight: 500 }}>Ticket tiers</span>
        {!form ? <Button size="sm" variant="outline" onClick={() => setForm({ ...EMPTY_FORM })}>+ Add tier</Button> : null}
      </div>
      <span className="text text-body-s tone-secondary">
        Optional. Without tiers, every pass sells at the event price. With tiers, guests pick one.
      </span>

      {tiers === null ? <span className="text text-body-s tone-secondary">Loading tiers…</span> : null}
      {tiers?.map((tier) => (
        <div key={tier.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--paper-border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="text text-body-s" style={{ fontWeight: 500 }}>
              {tier.name} · ₹{(tier.pricePaise / 100).toLocaleString('en-IN')}
              {tier.compareAtPricePaise ? <span className="tone-secondary"> (was ₹{(tier.compareAtPricePaise / 100).toLocaleString('en-IN')})</span> : null}
            </span>
            <span className="text text-caption tone-secondary">
              {tier.capacity - tier.remaining} sold of {tier.capacity}
              {tier.fnbItems.length ? ` · includes ${tier.fnbItems.map((f) => `${f.quantity}× ${f.name}`).join(', ')}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {tier.soldOut ? <Chip tone="warning">Sold out</Chip> : null}
            <Button size="sm" variant="outline" onClick={() => edit(tier)}>Edit</Button>
            <Button size="sm" variant="outline-danger" onClick={() => void stopSelling(tier)}>Stop selling</Button>
          </div>
        </div>
      ))}

      {form ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--paper-border)', paddingTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <TextField label="Tier name" placeholder="Couple + bar tab" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField label="Price (₹)" type="number" min={0} value={form.priceRupees} onChange={(e) => setForm({ ...form, priceRupees: e.target.value })} />
            <TextField label="Capacity" type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </div>
          <TextField label="What's included" placeholder="2 entries · regional menu" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <TextField label="Struck-through price (₹, optional)" type="number" min={0} value={form.compareAtRupees} onChange={(e) => setForm({ ...form, compareAtRupees: e.target.value })} />
            <TextField label="Surge price (₹, optional)" type="number" min={0} value={form.surgeRupees} onChange={(e) => setForm({ ...form, surgeRupees: e.target.value })} />
            <Select label="Surge applies" value={form.surgeThresholdPct} options={SURGE_OPTIONS} onChange={(v) => setForm({ ...form, surgeThresholdPct: v })} disabled={!form.surgeRupees} />
          </div>

          <span className="text text-body-s" style={{ fontWeight: 500 }}>Bundled items</span>
          {menuItems.length === 0 ? (
            <span className="text text-caption tone-secondary">Save the menu above first to bundle items into a tier.</span>
          ) : (
            <>
              {form.bundle.map((b, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
                  <Select
                    label={`Item ${i + 1}`}
                    value={b.fnbItemId}
                    options={itemOptions}
                    onChange={(v) => setForm({ ...form, bundle: form.bundle.map((x, j) => (j === i ? { ...x, fnbItemId: v } : x)) })}
                  />
                  <TextField
                    label="Quantity"
                    type="number"
                    min={1}
                    value={b.quantity}
                    onChange={(e) => setForm({ ...form, bundle: form.bundle.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.floor(Number(e.target.value))) } : x)) })}
                  />
                  <Button size="sm" variant="outline-danger" onClick={() => setForm({ ...form, bundle: form.bundle.filter((_, j) => j !== i) })}>Remove</Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setForm({ ...form, bundle: [...form.bundle, { fnbItemId: menuItems[0].id, quantity: 1 }] })}>
                + Bundle an item
              </Button>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : form.id ? 'Save tier' : 'Add tier'}</Button>
            <Button variant="outline" onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
