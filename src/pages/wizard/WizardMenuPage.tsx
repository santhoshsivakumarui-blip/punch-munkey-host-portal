import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Page, Panel, TextField, Button, Chip, Select, Checkbox, useToast } from '@punch-munkey/ui-web';
import { WizardSteps } from '../../components/WizardSteps';
import { WizardTopBar } from '../../components/WizardTopBar';
import { WizardPreviewCard } from '../../components/WizardPreviewCard';
import { TiersPanel } from '../../components/TiersPanel';
import { loadDraft, saveDraft } from '../../lib/wizardDraft';
import type { MenuItemCategory, MenuItemDraft } from '../../lib/wizardDraft';
import { api, paths } from '../../lib/api';
import { showApiError } from '../../lib/toastError';

// `1g` — wizard step 3, the night's menu. Saved for real: "Next" sends the
// whole menu and the alcohol cap to fnb-service (`PUT /events/:id/fnb/menu`),
// which creates, updates and removes items in one transaction, so going
// back and re-submitting never duplicates anything. The cap is enforced by
// fnb-service at redemption (a bar terminal can't ring up an alcoholic item
// past it). Opening this step for an event that already has a menu loads
// the saved one (`GET /events/:id/fnb/menu`), so the server is the source
// of truth, not this browser's draft.
//
// "Gross potential" below is a plain price × capacity multiplication, not
// the platform-fee/GST/TDS split: that math has one real home
// (payments-service's `splitFee`), which a wizard preview shouldn't copy.

interface ServerMenu {
  items: Array<{ id: string; name: string; category: MenuItemCategory; isAlcoholic: boolean; pricePaise: number; stockInitial: number | null }>;
  alcoholCapPerPass: number | null;
}

const CATEGORY_OPTIONS: Array<{ value: MenuItemCategory; label: string }> = [
  { value: 'bar', label: 'Bar' },
  { value: 'food', label: 'Food' },
  { value: 'smoke', label: 'Smoke' },
];

const DEFAULT_ALCOHOL_CAP = 2; // Karnataka excise: 2 alcoholic servings per guest

function blankItem(): MenuItemDraft {
  return { name: '', pricePaise: 0, category: 'bar', isAlcoholic: false, stockInitial: null };
}

export default function WizardMenuPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const draft = loadDraft();
  const [items, setItems] = useState<MenuItemDraft[]>(draft.menu?.items?.length ? draft.menu.items.map((i) => ({ ...blankItem(), ...i })) : [blankItem()]);
  const [alcoholCap, setAlcoholCap] = useState(draft.menu?.alcoholCapPerGuest ?? DEFAULT_ALCOHOL_CAP);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Load what's already saved for this event, if anything.
  useEffect(() => {
    if (!draft.eventId) return;
    let cancelled = false;
    api
      .get<ServerMenu>(paths.eventMenu(draft.eventId))
      .then((menu) => {
        if (cancelled || menu.items.length === 0) return;
        setItems(menu.items.map((i) => ({ id: i.id, name: i.name, category: i.category, isAlcoholic: i.isAlcoholic, pricePaise: i.pricePaise, stockInitial: i.stockInitial })));
        if (menu.alcoholCapPerPass !== null) setAlcoholCap(menu.alcoholCapPerPass);
      })
      .catch(() => {
        /* keep the local draft; saving will surface any real problem */
      });
    return () => {
      cancelled = true;
    };
    // Load once per event; the draft object itself changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.eventId]);

  function updateItem(i: number, patch: Partial<MenuItemDraft>) {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onSaveDraft() {
    saveDraft({ menu: { items, alcoholCapPerGuest: alcoholCap } });
  }

  async function onContinue() {
    if (saving) return;
    const named = items.filter((item) => item.name.trim().length > 0);
    if (named.length === 0) {
      setError('Add at least one menu item.');
      return;
    }
    if (!draft.eventId) {
      // The event row is created on the Location step.
      navigate('/events/new/location');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const saved = await api.put<ServerMenu>(paths.eventMenu(draft.eventId), {
        items: named.map((i) => ({
          ...(i.id ? { id: i.id } : {}),
          name: i.name.trim(),
          category: i.category,
          isAlcoholic: i.isAlcoholic,
          pricePaise: i.pricePaise,
          stockInitial: i.stockInitial ?? null,
        })),
        alcoholCapPerPass: alcoholCap,
      });
      const savedItems = saved.items.map((i) => ({ id: i.id, name: i.name, category: i.category, isAlcoholic: i.isAlcoholic, pricePaise: i.pricePaise, stockInitial: i.stockInitial }));
      setItems(savedItems);
      saveDraft({ menu: { items: savedItems, alcoholCapPerGuest: alcoholCap } });
      navigate('/events/new/staff');
    } catch (err) {
      showApiError(toast, err, 'Could not save the menu.');
    } finally {
      setSaving(false);
    }
  }

  const grossPotentialRupees = draft.basics ? draft.basics.priceRupees * draft.basics.capacity : 0;

  return (
    <Page>
      <WizardTopBar
        stepLabel="Step 3 of 5 · Menu"
        draftSavedAt={draft.updatedAt}
        onSaveDraft={onSaveDraft}
        onBack={() => navigate('/events/new/location')}
        rightSlot={
          <Button variant="primary" onClick={onContinue} disabled={saving}>
            {saving ? 'Saving…' : 'Next: staff'}
          </Button>
        }
      />
      <WizardSteps current={2} />

      <div className="wizard-layout" style={{ marginTop: 18, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span className="text text-title" style={{ fontWeight: 500 }}>Menu items</span>
            <span className="text text-body-s tone-secondary">{items.length} item{items.length === 1 ? '' : 's'}</span>
          </div>

          <Panel style={{ overflow: 'hidden' }}>
            {items.map((item, i) => (
              <div key={item.id ?? `new-${i}`} style={{ padding: '12px 18px', borderTop: i > 0 ? '1px solid var(--paper-border)' : 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, alignItems: 'flex-end' }}>
                  <TextField label={`Item ${i + 1}`} placeholder="House Pour · Whisky" value={item.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                  <Select<MenuItemCategory>
                    label="Counter"
                    value={item.category}
                    options={CATEGORY_OPTIONS}
                    onChange={(category) => updateItem(i, { category, isAlcoholic: category === 'bar' ? item.isAlcoholic : false })}
                  />
                  <TextField
                    label="Price (₹)"
                    type="number"
                    min={0}
                    placeholder="0 = included"
                    value={item.pricePaise / 100}
                    onChange={(e) => updateItem(i, { pricePaise: Math.max(0, Math.round(Number(e.target.value) * 100)) })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 14, alignItems: 'center' }}>
                  <TextField
                    label="Stock for the night"
                    type="number"
                    min={0}
                    placeholder="Empty = unlimited"
                    value={item.stockInitial ?? ''}
                    onChange={(e) => updateItem(i, { stockInitial: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
                  />
                  <Checkbox
                    label="Alcoholic"
                    description="Counts toward the per-pass cap"
                    checked={item.isAlcoholic}
                    disabled={item.category !== 'bar'}
                    onChange={(e) => updateItem(i, { isAlcoholic: e.target.checked })}
                  />
                  <Button type="button" variant="outline-danger" size="sm" onClick={() => removeItem(i)}>Remove</Button>
                </div>
              </div>
            ))}
          </Panel>
          <Button type="button" variant="outline" onClick={addItem}>+ Add item</Button>
          {error ? <span className="text text-caption" style={{ color: 'var(--danger-text)' }}>{error}</span> : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel pad>
            <span className="text text-body-s" style={{ fontWeight: 500 }}>Excise compliance</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <span className="text text-body-s tone-secondary">Max alcoholic items / pass</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <button type="button" className="stepper-btn minus" aria-label="Lower the cap" onClick={() => setAlcoholCap((c) => Math.max(0, c - 1))}>−</button>
                <span className="text text-numeral">{alcoholCap}</span>
                <button type="button" className="stepper-btn plus" aria-label="Raise the cap" onClick={() => setAlcoholCap((c) => c + 1)}>+</button>
              </div>
            </div>
            <Panel variant="positive" pad style={{ marginTop: 11 }}>
              <span className="text text-caption">The bar terminal refuses an alcoholic item once a pass has had this many.</span>
            </Panel>
          </Panel>

          {grossPotentialRupees > 0 ? (
            <Panel variant="dark" pad>
              <span className="text text-title" style={{ fontWeight: 500 }}>Gross potential</span>
              <div className="text text-numeral-l" style={{ marginTop: 6, color: 'var(--amber-light)' }}>
                ₹{grossPotentialRupees.toLocaleString('en-IN')}
              </div>
              <p className="text text-caption" style={{ marginTop: 6, marginBottom: 0 }}>
                If every pass sells at full price. Platform fee, GST and TDS are calculated at payout — see Payouts once this event is on sale.
              </p>
            </Panel>
          ) : null}

          <Chip tone="warning">Regional alcohol cap applies at redemption</Chip>
        </div>
      </div>

      {draft.eventId ? (
        <div style={{ marginTop: 18 }}>
          <TiersPanel
            eventId={draft.eventId}
            menuItems={items.filter((i): i is MenuItemDraft & { id: string } => Boolean(i.id)).map((i) => ({ id: i.id, name: i.name, isAlcoholic: i.isAlcoholic }))}
          />
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <WizardPreviewCard basics={draft.basics} location={draft.location} menu={{ items, alcoholCapPerGuest: alcoholCap }} staff={draft.staff} />
      </div>
    </Page>
  );
}
