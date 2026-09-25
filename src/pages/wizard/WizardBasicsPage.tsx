import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useAtomValue } from 'jotai';
import { Page, Panel, TextField, Button } from '@jfc/ui-web';
import { WizardSteps } from '../../components/WizardSteps';
import { WizardTopBar } from '../../components/WizardTopBar';
import { WizardPreviewCard } from '../../components/WizardPreviewCard';
import { basicsSchema, EVENT_TYPE_DEFAULTS } from '../../schemas/wizard';
import type { BasicsFormValues, EventTypeKey } from '../../schemas/wizard';
import { loadDraft, saveDraft } from '../../lib/wizardDraft';
import { sessionAtom } from '../../lib/atoms';

const EVENT_TYPE_CARDS: { type: EventTypeKey; title: string; body: string }[] = [
  { type: 'private', title: 'Private party', body: 'Hidden address, request-to-book, ratio control' },
  { type: 'club', title: 'Pub / club night', body: 'Public listing, open sale, F&B bundles' },
  { type: 'couples', title: 'Couples-only', body: 'Pairs only, screened at the door' },
];

// `2j` — wizard step 1, basics. Saves to the local draft on every submit —
// this step alone has nowhere real to save to yet: `POST /events`
// (event-service) requires venue info the design collects on step 2, so
// the actual event row isn't created until Location's submit. See
// lib/wizardDraft.ts's doc comment for the full reasoning, including why
// price/capacity live on this step instead of the design's own basics set.
//
// `eventType` picks real defaults (`requiresApproval`/`minRating`) that
// Location's submit PATCHes onto the event once it exists — see
// schemas/wizard.ts's own comment on why `minRatioWomen` isn't part of
// that mapping.
export default function WizardBasicsPage() {
  const navigate = useNavigate();
  const { user } = useAtomValue(sessionAtom);
  const draft = loadDraft();
  const form = useForm<BasicsFormValues>({
    resolver: yupResolver(basicsSchema),
    defaultValues: draft.basics ?? { eventType: 'private', title: '', dateISO: '', startTime: '', endTime: '', description: '', priceRupees: 1899, capacity: 60, coverImageUrl: '' },
  });

  function onSubmit(values: BasicsFormValues) {
    saveDraft({ basics: values });
    navigate('/events/new/location');
  }

  function onSaveDraft() {
    saveDraft({ basics: form.getValues() });
  }

  const live = form.watch();
  const eventType = form.watch('eventType');
  const defaults = EVENT_TYPE_DEFAULTS[eventType];

  return (
    <Page>
      <WizardTopBar
        stepLabel="Step 1 of 5 · Basics"
        draftSavedAt={draft.updatedAt}
        onSaveDraft={onSaveDraft}
        rightSlot={<Button variant="primary" onClick={form.handleSubmit(onSubmit)}>Next: location</Button>}
      />
      <WizardSteps current={0} />

      <form onSubmit={form.handleSubmit(onSubmit)} style={{ marginTop: 18 }}>
        <div className="wizard-layout" style={{ alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span className="text text-display-m">What kind of night is this?</span>
              <span className="text text-body-s tone-secondary">The type sets defaults for screening and approval.</span>
            </div>
            <div className="event-type-grid">
              {EVENT_TYPE_CARDS.map((c) => (
                <button
                  key={c.type}
                  type="button"
                  className={`event-type-card${c.type === eventType ? ' selected' : ''}`}
                  onClick={() => form.setValue('eventType', c.type, { shouldValidate: true })}
                >
                  <span className="event-type-card-title">{c.title}</span>
                  <span className="event-type-card-body">{c.body}</span>
                </button>
              ))}
            </div>

            <TextField label="Event name" placeholder="Terrace Rooftop · Sundowner to Late" error={form.formState.errors.title?.message} {...form.register('title')} />
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <TextField label="Date" type="date" error={form.formState.errors.dateISO?.message} {...form.register('dateISO')} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Doors open" type="time" error={form.formState.errors.startTime?.message} {...form.register('startTime')} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Last entry" type="time" error={form.formState.errors.endTime?.message} {...form.register('endTime')} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <TextField label="Price (₹)" type="number" min={1} error={form.formState.errors.priceRupees?.message} {...form.register('priceRupees', { valueAsNumber: true })} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Capacity" type="number" min={1} error={form.formState.errors.capacity?.message} {...form.register('capacity', { valueAsNumber: true })} />
              </div>
            </div>
            <TextField label="Description · what guests see" placeholder="House Set, sundowner to late" error={form.formState.errors.description?.message} {...form.register('description')} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Panel pad>
              <span className="text text-title" style={{ fontWeight: 500 }}>Cover image</span>
              {live.coverImageUrl?.trim() ? (
                <div style={{ height: 132, borderRadius: 16, marginTop: 11, background: `var(--paper-tint2) center/cover no-repeat url("${live.coverImageUrl}")` }} />
              ) : (
                <div style={{ height: 132, borderRadius: 16, marginTop: 11, background: 'var(--paper-tint2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="text text-caption tone-secondary">paste a link below · 3:2</span>
                </div>
              )}
              <div style={{ marginTop: 11 }}>
                <TextField label="Cover image URL" placeholder="https://…" {...form.register('coverImageUrl')} />
              </div>
              <p className="text text-caption tone-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                Never show the entrance, street signage or house number — the reveal engine can't hide what's in your photo.
              </p>
            </Panel>

            <Panel variant="positive" pad>
              <span className="text text-title" style={{ fontWeight: 500 }}>Defaults applied</span>
              <p className="text text-body-s" style={{ marginTop: 6, marginBottom: 0 }}>
                {defaults.requiresApproval ? 'Request-to-book on' : 'Open sale, no approval needed'}
                {defaults.minRating ? ` · conduct floor ${defaults.minRating.toFixed(1)} stars` : ''}
              </p>
            </Panel>

            <Panel variant="tint" pad>
              <span className="text text-title" style={{ fontWeight: 500 }}>{user?.kyhState === 'verified' ? 'KYH verified' : 'KYH pending'}</span>
              <p className="text text-body-s tone-secondary" style={{ marginTop: 6, marginBottom: 0 }}>
                {user?.kyhState === 'verified'
                  ? 'You can publish immediately once this wizard is done.'
                  : 'Publishing needs a verified KYH status — you can still build and submit for review now.'}
              </p>
            </Panel>
          </div>
        </div>
      </form>

      <div style={{ marginTop: 18 }}>
        <WizardPreviewCard basics={live} location={draft.location} menu={draft.menu} staff={draft.staff} />
      </div>
    </Page>
  );
}
