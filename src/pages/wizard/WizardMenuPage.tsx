import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Page, Panel, TextField, Button, Chip } from '@jfc/ui-web';
import { WizardSteps } from '../../components/WizardSteps';
import { WizardTopBar } from '../../components/WizardTopBar';
import { WizardPreviewCard } from '../../components/WizardPreviewCard';
import { loadDraft, saveDraft } from '../../lib/wizardDraft';
import type { MenuItemDraft } from '../../lib/wizardDraft';

// `1g` — wizard step 3, regional menu builder. Each region has its own
// alcohol serving cap per guest — `05-hard-parts.md` territory; this page
// just captures the number, the rule itself is enforced server-side.
// Local-draft-only: `events` has no per-item menu table wired to a create
// endpoint (fnb-service's `fnbItems` is stock-correction/read-only from
// this side — see jfc-host-app's `(bar)/terminal.tsx`), so there's nowhere
// real to send this yet. Flagged in lib/wizardDraft.ts's own doc comment.
//
// The mockup's "Tiers & menu" step also shows multi-tier ticket pricing
// (Entry/Couple+Bar Tab/VIP Cabana, each with its own price and qty) — that
// doesn't exist in this backend at all (`events.pricePaise`/`capacity` are
// single scalar columns, no tiers table), so this stays a single-tier menu
// builder rather than inventing a tiers concept with nowhere real to save
// it. "Gross potential" below is a plain price × capacity multiplication,
// not the platform-fee/GST/TDS split — that math has one real home
// (payments-service's `splitFee`, per its own doc comment: "the same kind
// of number two audiences must see agree"), which a wizard preview
// shouldn't duplicate and risk drifting from.
export default function WizardMenuPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const [items, setItems] = useState<MenuItemDraft[]>(draft.menu?.items ?? [{ name: '', pricePaise: 0 }]);
  const [alcoholCap, setAlcoholCap] = useState(draft.menu?.alcoholCapPerGuest ?? 2);
  const [error, setError] = useState('');

  function updateItem(i: number, patch: Partial<MenuItemDraft>) {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { name: '', pricePaise: 0 }]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onSaveDraft() {
    saveDraft({ menu: { items, alcoholCapPerGuest: alcoholCap } });
  }

  function onContinue() {
    const named = items.filter((item) => item.name.trim().length > 0);
    if (named.length === 0) {
      setError('Add at least one menu item.');
      return;
    }
    saveDraft({ menu: { items: named, alcoholCapPerGuest: alcoholCap } });
    navigate('/events/new/staff');
  }

  const grossPotentialRupees = draft.basics ? draft.basics.priceRupees * draft.basics.capacity : 0;

  return (
    <Page>
      <WizardTopBar
        stepLabel="Step 3 of 5 · Menu"
        draftSavedAt={draft.updatedAt}
        onSaveDraft={onSaveDraft}
        onBack={() => navigate('/events/new/location')}
        rightSlot={<Button variant="primary" onClick={onContinue}>Next: staff</Button>}
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
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.6fr', gap: 14, padding: '12px 18px', alignItems: 'flex-end', borderTop: i > 0 ? '1px solid var(--paper-border)' : 'none' }}>
                <TextField label={`Item ${i + 1}`} placeholder="House Pour · Whisky" value={item.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                <TextField label="Price (₹)" type="number" min={0} placeholder="0 = included" value={item.pricePaise / 100} onChange={(e) => updateItem(i, { pricePaise: Math.round(Number(e.target.value) * 100) })} />
                <Button type="button" variant="outline-danger" size="sm" onClick={() => removeItem(i)}>Remove</Button>
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
              <span className="text text-body-s tone-secondary">Max alcoholic vouchers / pass</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <button type="button" className="stepper-btn minus" onClick={() => setAlcoholCap((c) => Math.max(0, c - 1))}>−</button>
                <span className="text text-numeral">{alcoholCap}</span>
                <button type="button" className="stepper-btn plus" onClick={() => setAlcoholCap((c) => c + 1)}>+</button>
              </div>
            </div>
            <Panel variant="positive" pad style={{ marginTop: 11 }}>
              <span className="text text-caption">Bar terminal enforces this cap at redemption.</span>
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

      <div style={{ marginTop: 18 }}>
        <WizardPreviewCard basics={draft.basics} location={draft.location} menu={{ items, alcoholCapPerGuest: alcoholCap }} staff={draft.staff} />
      </div>
    </Page>
  );
}
