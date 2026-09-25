import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { Page, Panel, TextField, Button } from '@jfc/ui-web';
import { WizardSteps } from '../../components/WizardSteps';
import { WizardTopBar } from '../../components/WizardTopBar';
import { WizardPreviewCard } from '../../components/WizardPreviewCard';
import { staffSchema } from '../../schemas/wizard';
import type { StaffFormValues } from '../../schemas/wizard';
import { loadDraft, saveDraft } from '../../lib/wizardDraft';

// `2m`/`1h` — wizard step 4, door & staff RBAC. No standalone desk mockup
// of its own: `1h` (screening & ratio) was reconciled onto the native app
// (07-navigation.md's route tree, not this portal — see WizardStaffPage's
// git history for that call), so this step applies the same visual
// language as the rest of the wizard without a specific screen to match
// pixel-for-pixel. `ratioRule` feeds the same screening/ratio check
// jfc-host-app's native `guests.tsx` (`1h`) enforces on the floor — see
// @jfc/shared's `ratioCheck` (08-component-inventory.md).
// Local-draft-only: `events.minRatioWomen` is a real, PATCH-able column
// (a percentage), but `ratioRule`'s free-text shape ("2 couples : 1 stag")
// doesn't map onto it cleanly, and named door staff has no column at all —
// flagged rather than reshaping this step's UX to fit a number field.
export default function WizardStaffPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const form = useForm<StaffFormValues>({
    resolver: yupResolver(staffSchema),
    defaultValues: draft.staff ?? { doorStaff: '', ratioRule: '2 couples : 1 stag' },
  });

  function onSubmit(values: StaffFormValues) {
    saveDraft({ staff: values });
    navigate('/events/new/review');
  }

  function onSaveDraft() {
    saveDraft({ staff: form.getValues() });
  }

  const live = form.watch();

  return (
    <Page>
      <WizardTopBar
        stepLabel="Step 4 of 5 · Door & staff"
        draftSavedAt={draft.updatedAt}
        onSaveDraft={onSaveDraft}
        onBack={() => navigate('/events/new/menu')}
        rightSlot={<Button variant="primary" onClick={form.handleSubmit(onSubmit)}>Next: review</Button>}
      />
      <WizardSteps current={3} />

      <form onSubmit={form.handleSubmit(onSubmit)} style={{ marginTop: 18 }}>
        <div className="wizard-layout" style={{ alignItems: 'stretch' }}>
          <Panel pad style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField label="Door staff (comma-separated)" placeholder="Rahul, Priya" error={form.formState.errors.doorStaff?.message} {...form.register('doorStaff')} />
            <TextField label="Screening & ratio rule" placeholder="2 couples : 1 stag" error={form.formState.errors.ratioRule?.message} {...form.register('ratioRule')} />
          </Panel>

          <Panel variant="positive" pad>
            <span className="text text-title" style={{ fontWeight: 500 }}>What this enables</span>
            <p className="text text-body-s" style={{ marginTop: 6, marginBottom: 0 }}>
              Named door staff pair a device from Devices and see this ratio rule live on the floor at the door scanner.
            </p>
          </Panel>
        </div>
      </form>

      <div style={{ marginTop: 18 }}>
        <WizardPreviewCard basics={draft.basics} location={draft.location} menu={draft.menu} staff={live} />
      </div>
    </Page>
  );
}
