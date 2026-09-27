import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { Page, Panel, TextField, Button, useToast } from '@jfc/ui-web';
import { WizardSteps } from '../../components/WizardSteps';
import { WizardTopBar } from '../../components/WizardTopBar';
import { WizardPreviewCard } from '../../components/WizardPreviewCard';
import { SegmentedControl } from '../../components/SegmentedControl';
import { locationSchema, EVENT_TYPE_DEFAULTS } from '../../schemas/wizard';
import type { LocationFormValues } from '../../schemas/wizard';
import { loadDraft, saveDraft } from '../../lib/wizardDraft';
import { api, paths } from '../../lib/api';
import { showApiError } from '../../lib/toastError';
import type { EventRecord } from '../../lib/types';

const UNLOCK_OPTIONS = [
  { value: '4h', label: '4h before' },
  { value: 'on_payment', label: 'On payment' },
  { value: 'custom', label: 'Custom' },
] as const;
type UnlockMode = (typeof UNLOCK_OPTIONS)[number]['value'];

/**
 * `2k` — wizard step 2, location & reveal radius. This step's submit is
 * where the real event actually gets created: `POST /events`
 * (event-service/src/routes/hostEvents.ts) needs venue info in the same
 * call as basics, and this is the first point the wizard has both. Once
 * created, later steps `PATCH` this same `eventId` instead of creating a
 * second row — including, now, a real follow-up `PATCH` with the Basics
 * step's `eventType`-derived `requiresApproval`/`minRating` and
 * `coverImageUrl`, all real columns `PATCH /events/:id` already accepted
 * but nothing in this wizard ever sent before this redesign.
 *
 * `addressLine` and `gateCode` are saved with `PUT /events/:id/location`
 * right after the event exists: event-service hands them straight to
 * location-service, which stores them encrypted, and guests only see them
 * from the reveal time on (GET /events/:id/address). `radiusKm` and the
 * reveal window stay in the local draft only: `revealAt` is computed
 * server-side as `doorsAt - 4h`, fixed, not host-configurable, and there's
 * no geofence-radius column.
 */
export default function WizardLocationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const draft = loadDraft();
  const [submitting, setSubmitting] = useState(false);
  const [unlockMode, setUnlockMode] = useState<UnlockMode>(draft.location?.revealHoursBefore === 4 || !draft.location ? '4h' : 'custom');
  const form = useForm<LocationFormValues>({
    resolver: yupResolver(locationSchema),
    defaultValues: draft.location ?? { venueName: '', area: '', addressLine: '', gateCode: '', revealHoursBefore: 4, radiusKm: 2.4 },
  });

  async function onSubmit(values: LocationFormValues) {
    if (submitting) return;
    const basics = loadDraft().basics;
    if (!basics) {
      navigate('/events/new/basics');
      return;
    }

    setSubmitting(true);
    try {
      let eventId = draft.eventId;
      let eventCode = draft.eventCode;
      if (!eventId) {
        const doorsDate = new Date(`${basics.dateISO}T${basics.startTime}`);
        const endsDate = new Date(`${basics.dateISO}T${basics.endTime}`);
        if (Number.isNaN(doorsDate.getTime()) || Number.isNaN(endsDate.getTime())) {
          toast.show('The start or end time is invalid — go back to Basics and re-enter it.', { tone: 'warning' });
          return;
        }
        // An overnight event (doors 21:00, ends 02:00) has an endTime that
        // reads as *earlier* on the same calendar date, so endsAt would land
        // before doorsAt. Escrow releases at endsAt + 12h — an endsAt before
        // doors would pay the host before the night is even over and corrupt
        // every downstream payout/ledger time. Roll ends to the next day
        // whenever it isn't strictly after doors.
        if (endsDate.getTime() <= doorsDate.getTime()) endsDate.setDate(endsDate.getDate() + 1);
        const doorsAt = doorsDate.toISOString();
        const endsAt = endsDate.toISOString();
        const created = await api.post<EventRecord>(paths.events, {
          venue: { name: values.venueName, area: values.area, capacityMax: basics.capacity },
          title: basics.title,
          doorsAt,
          endsAt,
          pricePaise: Math.round(basics.priceRupees * 100),
          capacity: basics.capacity,
        });
        eventId = created.id;
        eventCode = created.code;

        const typeDefaults = EVENT_TYPE_DEFAULTS[basics.eventType];
        const patch: Record<string, unknown> = { requiresApproval: typeDefaults.requiresApproval };
        if (typeDefaults.minRating !== null) patch.minRating = typeDefaults.minRating;
        if (basics.coverImageUrl?.trim()) patch.coverImageUrl = basics.coverImageUrl.trim();
        await api.patch<EventRecord>(paths.event(eventId), patch);
      }
      // Saved every time this step is submitted, so going back and editing
      // the address updates the stored (encrypted) copy too.
      await api.put(paths.eventLocation(eventId), { addressLine: values.addressLine, gateCode: values.gateCode });
      saveDraft({ location: values, eventId, eventCode });
      navigate('/events/new/menu');
    } catch (err) {
      showApiError(toast, err, 'Could not save this event.');
    } finally {
      setSubmitting(false);
    }
  }

  function onSaveDraft() {
    saveDraft({ location: form.getValues() });
  }

  function onUnlockChange(mode: UnlockMode) {
    setUnlockMode(mode);
    if (mode === '4h') form.setValue('revealHoursBefore', 4, { shouldValidate: true });
    else if (mode === 'on_payment') form.setValue('revealHoursBefore', 1, { shouldValidate: true });
  }

  const live = form.watch();
  const radiusPercent = ((live.radiusKm - 1) / (5 - 1)) * 100;

  return (
    <Page>
      <WizardTopBar
        stepLabel="Step 2 of 5 · Location & reveal"
        draftSavedAt={draft.updatedAt}
        onSaveDraft={onSaveDraft}
        onBack={() => navigate('/events/new/basics')}
        rightSlot={<Button variant="primary" onClick={form.handleSubmit(onSubmit)} disabled={submitting}>{submitting ? 'Saving…' : 'Next: menu'}</Button>}
      />
      <WizardSteps current={1} />

      <form onSubmit={form.handleSubmit(onSubmit)} style={{ marginTop: 18 }}>
        <div className="wizard-layout" style={{ alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="radius-visual">
              <div
                className="radius-visual-ring"
                style={{ width: `${140 + radiusPercent}px`, height: `${140 + radiusPercent}px` }}
              >
                <span className="radius-visual-pin" />
              </div>
              <div style={{ position: 'absolute', left: 16, bottom: 16, padding: '9px 14px', borderRadius: 999, background: 'var(--paper-card)', boxShadow: 'var(--shadow-md)' }}>
                <span className="text text-numeral-s">{live.radiusKm.toFixed(1)} km · what guests see</span>
              </div>
              <div style={{ position: 'absolute', left: 16, top: 16, padding: '10px 14px', borderRadius: 16, background: 'var(--paper-card)', boxShadow: 'var(--shadow-md)' }}>
                <div className="text text-body-s" style={{ fontWeight: 500 }}>Public preview</div>
                <div className="text text-caption tone-secondary">Circle centre is randomised each load</div>
              </div>
            </div>

            <Panel pad>
              <span className="text text-body-s" style={{ fontWeight: 500 }}>Public radius</span>
              <input
                type="range"
                className="radius-slider"
                min={1}
                max={5}
                step={0.1}
                value={live.radiusKm}
                onChange={(e) => form.setValue('radiusKm', Number(e.target.value), { shouldValidate: true })}
                style={{ marginTop: 10 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span className="text text-caption tone-secondary">1 km</span>
                <span className="text text-numeral-s" style={{ color: 'var(--amber-dark)' }}>{live.radiusKm.toFixed(1)} km</span>
                <span className="text text-caption tone-secondary">5 km</span>
              </div>
            </Panel>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Panel pad>
              <span className="text text-display-s">Exact address</span>
              <p className="text text-caption tone-secondary" style={{ marginTop: 4, marginBottom: 14 }}>Encrypted at rest. Only shown to a paid, claimed guest.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <TextField label="Venue name (internal, never shown to guests)" placeholder="Terrace Rooftop Pvt Ltd" error={form.formState.errors.venueName?.message} {...form.register('venueName')} />
                <TextField label="Area (shown to guests)" placeholder="HSR Layout" error={form.formState.errors.area?.message} {...form.register('area')} />
                <TextField label="Exact address (locked until reveal)" placeholder="412, 9th Main" error={form.formState.errors.addressLine?.message} {...form.register('addressLine')} />
                <TextField label="Gate code / access notes" placeholder="Gate code 4417# · service lift to L6" {...form.register('gateCode')} />
              </div>
            </Panel>

            <Panel pad>
              <span className="text text-body-s" style={{ fontWeight: 500 }}>When does it unlock?</span>
              <div style={{ marginTop: 10 }}>
                <SegmentedControl value={unlockMode} onChange={onUnlockChange} options={[...UNLOCK_OPTIONS]} />
              </div>
              {unlockMode === 'custom' ? (
                <div style={{ marginTop: 11 }}>
                  <TextField label="Hours before doors" type="number" min={1} max={24} error={form.formState.errors.revealHoursBefore?.message} {...form.register('revealHoursBefore', { valueAsNumber: true })} />
                </div>
              ) : null}
              <Panel variant="positive" pad style={{ marginTop: 11 }}>
                <span className="text text-body-s">Guests get a notification when the address unlocks. Unclaimed passes stay locked regardless.</span>
              </Panel>
            </Panel>

            <Panel variant="warning" pad>
              <span className="text text-body-s">Address changes after publish notify every ticket holder and are logged for dispute evidence.</span>
            </Panel>
          </div>
        </div>
      </form>

      <div style={{ marginTop: 18 }}>
        <WizardPreviewCard basics={draft.basics} location={live} menu={draft.menu} staff={draft.staff} />
      </div>
    </Page>
  );
}
