import { useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import { Page, PageHeader, Panel, PanelTitle, KvRow, StatGrid, StatTile, Select, TextField, Button, Chip, Skeleton, EmptyState, useToast } from '@punch-munkey/ui-web';
import { eventsLoadable, taxConfigLoadable, taxConfigAtom, updateTaxConfigAtom, accountingSummaryAtom, selectedBusinessEventIdAtom } from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { FnbCategory } from '../lib/types';

const CATEGORY_LABEL: Record<FnbCategory, string> = { food: 'Kitchen', bar: 'Bar', smoke: 'Smoke' };

/**
 * `/accounting` — an Indian GST/excise view of F&B sales, built on top of
 * `tax_config` (host-set rates, fnb-service's schema.ts) and the
 * accounting-summary route. Food and smoke are real GST and ship with
 * commonly-cited starting rates (5% no-ITC, 28%); bar alcohol sits
 * outside GST under Indian law (Constitution Art. 366(12A)) and is state
 * excise + VAT instead — no universal default exists, so that starts at
 * 0 until the host fills in their own state's actual rates. None of this
 * is filing advice; the banner below says so explicitly.
 */
export default function AccountingPage() {
  const toast = useToast();
  const eventsL = useAtomValue(eventsLoadable);
  const candidateEvents = eventsL.state === 'hasData' ? eventsL.data : [];
  // Shared with Inventory/Invoice — see selectedBusinessEventIdAtom's own
  // comment. This page's own candidate list is a superset of theirs
  // (accounting needs closed/cancelled events too, for historical tax
  // reporting), so the shared selection is valid here whenever it's valid
  // anywhere — the `.some` guard is just consistency with the other two,
  // not load-bearing the way it is for their narrower lists.
  const [sharedEventId, setSharedEventId] = useAtom(selectedBusinessEventIdAtom);
  const activeEventId = candidateEvents.some((e) => e.id === sharedEventId) ? sharedEventId : (candidateEvents[0]?.id ?? null);

  const configL = useAtomValue(taxConfigLoadable);
  useToastOnError(configL, 'Could not load tax settings.');
  const refreshConfig = useSetAtom(taxConfigAtom);
  const updateConfig = useSetAtom(updateTaxConfigAtom);

  // Tied to activeEventId via useMemo so a new atom (and fetch) is only
  // created when the event actually changes, not on every render — an
  // inline `accountingSummaryAtom(x)` passed straight to useAtomValue
  // would recreate itself each render and fetch in a loop.
  const summaryAtom = useMemo(() => loadable(accountingSummaryAtom(activeEventId ?? '__none__')), [activeEventId]);
  const summaryL = useAtomValue(summaryAtom);
  useToastOnError(summaryL, 'Could not load the accounting summary.');

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function startEdit() {
    if (configL.state !== 'hasData') return;
    const c = configL.data;
    setDraft({
      foodGstPercent: c.foodGstPercent,
      barExcisePercent: c.barExcisePercent,
      barVatPercent: c.barVatPercent,
      smokeGstPercent: c.smokeGstPercent,
      smokeCessPercent: c.smokeCessPercent,
      serviceChargePercent: c.serviceChargePercent,
      gstin: c.gstin ?? '',
    });
    setEditing(true);
  }

  async function saveConfig() {
    if (saving) return;
    setSaving(true);
    try {
      await updateConfig({
        foodGstPercent: Number(draft.foodGstPercent),
        barExcisePercent: Number(draft.barExcisePercent),
        barVatPercent: Number(draft.barVatPercent),
        smokeGstPercent: Number(draft.smokeGstPercent),
        smokeCessPercent: Number(draft.smokeCessPercent),
        serviceChargePercent: Number(draft.serviceChargePercent),
        gstin: draft.gstin,
      });
      toast.show('Tax settings saved.', { tone: 'positive' });
      setEditing(false);
      refreshConfig();
    } catch (err) {
      showApiError(toast, err, 'Could not save tax settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Accounting"
        subtitle="GST, excise & VAT on food, bar and smoke sales."
        actions={
          candidateEvents.length > 0 ? (
            <Select
              value={activeEventId ?? ''}
              onChange={setSharedEventId}
              options={candidateEvents.map((e) => ({ value: e.id, label: e.title }))}
              ariaLabel="Event"
              style={{ height: 40, width: 'auto', minWidth: 200 }}
            />
          ) : undefined
        }
      />

      <Panel pad style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Chip tone="warning">Note</Chip>
          <p className="text text-body-s tone-secondary" style={{ margin: 0 }}>
            Rates below are starting points, not filing advice — confirm actual GST, excise and VAT rates for your state with your CA or state excise department before relying on these figures.
          </p>
        </div>
      </Panel>

      <Panel pad style={{ maxWidth: 640, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <PanelTitle>Tax settings</PanelTitle>
          {!editing && configL.state === 'hasData' ? (
            <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
          ) : null}
        </div>

        {configL.state === 'loading' ? (
          <Skeleton height={140} radius={12} />
        ) : configL.state !== 'hasData' ? null : editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <TextField label="Food GST %" type="number" min={0} max={100} value={draft.foodGstPercent} onChange={(e) => setDraft((d) => ({ ...d, foodGstPercent: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Smoke GST %" type="number" min={0} max={100} value={draft.smokeGstPercent} onChange={(e) => setDraft((d) => ({ ...d, smokeGstPercent: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Smoke cess %" type="number" min={0} max={100} value={draft.smokeCessPercent} onChange={(e) => setDraft((d) => ({ ...d, smokeCessPercent: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <TextField label="Bar excise %" type="number" min={0} max={100} value={draft.barExcisePercent} onChange={(e) => setDraft((d) => ({ ...d, barExcisePercent: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Bar VAT %" type="number" min={0} max={100} value={draft.barVatPercent} onChange={(e) => setDraft((d) => ({ ...d, barVatPercent: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Service charge %" type="number" min={0} max={100} value={draft.serviceChargePercent} onChange={(e) => setDraft((d) => ({ ...d, serviceChargePercent: e.target.value }))} />
              </div>
            </div>
            <TextField label="GSTIN (optional)" value={draft.gstin} onChange={(e) => setDraft((d) => ({ ...d, gstin: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" disabled={saving} onClick={saveConfig}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="outline" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <KvRow label="Food (kitchen) GST" value={`${configL.data.foodGstPercent}%`} />
            <KvRow label="Bar excise + VAT" value={`${configL.data.barExcisePercent}% + ${configL.data.barVatPercent}%`} />
            <KvRow label="Smoke GST + cess" value={`${configL.data.smokeGstPercent}% + ${configL.data.smokeCessPercent}%`} />
            <KvRow label="Service charge" value={`${configL.data.serviceChargePercent}%`} />
            <KvRow label="GSTIN" value={configL.data.gstin ?? '—'} mono />
          </div>
        )}
      </Panel>

      {candidateEvents.length === 0 ? (
        <EmptyState icon="calendar" title="No events yet" body="A tax summary attaches to a specific event's sales." />
      ) : summaryL.state === 'loading' ? (
        <Skeleton height={140} radius={16} />
      ) : summaryL.state === 'hasData' ? (
        <>
          <StatGrid>
            <StatTile label="Revenue" value={formatINR(summaryL.data.totalRevenuePaise / 100)} />
            <StatTile label="Tax owed" value={formatINR(summaryL.data.totalTaxPaise / 100)} />
            <StatTile label="Service charge" value={formatINR(summaryL.data.serviceChargePaise / 100)} />
            <StatTile label="Net" value={formatINR(summaryL.data.netPaise / 100)} variant="dark" />
          </StatGrid>

          <Panel pad style={{ marginTop: 16 }}>
            <PanelTitle>By counter</PanelTitle>
            <div style={{ marginTop: 8 }}>
              {summaryL.data.categories.map((c) => (
                <KvRow key={c.category} label={`${CATEGORY_LABEL[c.category]} — ${c.rateLabel}`} value={`${formatINR(c.revenuePaise / 100)} rev · ${formatINR(c.taxPaise / 100)} tax`} mono />
              ))}
            </div>
          </Panel>
        </>
      ) : null}
    </Page>
  );
}
