import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { Page, Panel, TextField, Button, useToast } from '@punch-munkey/ui-web';
import { WizardSteps } from '../../components/WizardSteps';
import { WizardTopBar } from '../../components/WizardTopBar';
import { WizardPreviewCard } from '../../components/WizardPreviewCard';
import { locationSchema, EVENT_TYPE_DEFAULTS, REVEAL_HOURS_BEFORE_DOORS } from '../../schemas/wizard';
import type { LocationFormValues } from '../../schemas/wizard';
import { loadDraft, saveDraft } from '../../lib/wizardDraft';
import { api, paths } from '../../lib/api';
import { showApiError } from '../../lib/toastError';
import type { EventRecord } from '../../lib/types';

/**
 * `2k` — wizard step 2, location & reveal. This step's submit is
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
 * from the reveal time on (GET /events/:id/address). The reveal time isn't a
 * setting: it's always four hours before doors (`revealAt = doorsAt - 4h`,
 * computed server-side), so this step states it rather than offering
 * options that wouldn't change anything.
 *
 * The exact address and gate code never go into this browser's storage.
 * The wizard draft saves them blank; reopening this step for an event that
 * already exists loads them from the server (GET /events/:id/location).
 */
export default function WizardLocationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const draft = loadDraft();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<LocationFormValues>({
    resolver: yupResolver(locationSchema),
    defaultValues: {
      venueName: draft.location?.venueName ?? '',
      area: draft.location?.area ?? '',
      addressLine: '',
      gateCode: '',
    },
  });

  // The address lives only on the server; fetch it back when editing.
  useEffect(() => {
    if (!draft.eventId) return;
    let cancelled = false;
    api
      .get<{ addressLine: string | null; gateCode: string | null }>(paths.eventLocation(draft.eventId))
      .then((loc) => {
        if (cancelled) return;
        if (loc.addressLine) form.setValue('addressLine', loc.addressLine);
        if (loc.gateCode) form.setValue('gateCode', loc.gateCode);
      })
      .catch(() => {
        /* nothing saved yet, or not reachable: the host can re-enter it */
      });
    return () => {
      cancelled = true;
    };
    // Load once per event; `form` and the draft object are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.eventId]);

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
      saveDraft({ location: { ...values, addressLine: '', gateCode: '' }, eventId, eventCode });
      navigate('/events/new/menu');
    } catch (err) {
      showApiError(toast, err, 'Could not save this event.');
    } finally {
      setSubmitting(false);
    }
  }

  function onSaveDraft() {
    // Never the exact address: that's saved on the server by "Next".
    saveDraft({ location: { ...form.getValues(), addressLine: '', gateCode: '' } });
  }

  const live = form.watch();

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
            <Panel pad style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="text text-display-s">What guests see</span>
              <div className="text text-body-s tone-secondary">
                Before the reveal, only the area: <span className="tone-primary">{live.area || 'not set yet'}</span>.
              </div>
              <div className="text text-body-s tone-secondary">
                The exact address and door notes unlock {REVEAL_HOURS_BEFORE_DOORS} hours before doors, and only for guests holding a valid pass.
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
              <p className="text text-body-s" style={{ marginTop: 6, marginBottom: 0 }}>
                {REVEAL_HOURS_BEFORE_DOORS} hours before doors, for every event.
              </p>
              <Panel variant="positive" pad style={{ marginTop: 11 }}>
                <span className="text text-body-s">Pass holders get a notification when the address unlocks. Guests without a valid pass never see it.</span>
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
