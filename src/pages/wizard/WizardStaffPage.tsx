import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useSetAtom } from 'jotai';
import { Page, Panel, TextField, Button, Select, useToast } from '@punch-munkey/ui-web';
import { WizardSteps } from '../../components/WizardSteps';
import { WizardTopBar } from '../../components/WizardTopBar';
import { WizardPreviewCard } from '../../components/WizardPreviewCard';
import { staffSchema } from '../../schemas/wizard';
import type { StaffFormValues, StaffRole } from '../../schemas/wizard';
import { loadDraft, saveDraft } from '../../lib/wizardDraft';
import type { EventWizardDraft } from '../../lib/wizardDraft';
import { api, paths } from '../../lib/api';
import { createStaffInviteAtom } from '../../lib/atoms';
import { showApiError } from '../../lib/toastError';

// `2m`/`1h` — wizard step 4, door & bar staff plus the screening ratio.
// Both halves are saved for real:
// - Each named person gets a staff invite link (ticketing-service
//   POST /hosts/me/invites): opening it on their phone pairs it as a door
//   scanner or bar terminal. Links already made for a person are remembered
//   in the draft, so re-saving doesn't mint duplicates.
// - "Minimum share of women" is `events.min_ratio_women` (PATCH /events/:id),
//   the rule booking checks against and host screening shows.

type SavedInvite = NonNullable<NonNullable<EventWizardDraft['staff']>['invites']>[number];

const ROLE_OPTIONS: Array<{ value: StaffRole; label: string }> = [
  { value: 'door', label: 'Door' },
  { value: 'bar', label: 'Bar' },
];

const RATIO_OPTIONS = [
  { value: '0', label: 'No minimum' },
  { value: '40', label: 'At least 40% women' },
  { value: '50', label: 'At least 50% women' },
  { value: '60', label: 'At least 60% women' },
];

const inviteKey = (m: { name: string; role: StaffRole }) => `${m.name.trim().toLowerCase()}|${m.role}`;

export default function WizardStaffPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createInvite = useSetAtom(createStaffInviteAtom);
  const draft = loadDraft();
  const [saving, setSaving] = useState(false);
  const [invites, setInvites] = useState<SavedInvite[]>(draft.staff?.invites ?? []);
  const [justCreated, setJustCreated] = useState<SavedInvite[]>([]);

  const form = useForm<StaffFormValues>({
    resolver: yupResolver(staffSchema),
    defaultValues: {
      members: draft.staff?.members?.length ? draft.staff.members : [{ name: '', role: 'door' }],
      minWomenPercent: draft.staff?.minWomenPercent ?? 0,
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'members' });

  async function onSubmit(values: StaffFormValues) {
    if (saving) return;
    if (!draft.eventId) {
      navigate('/events/new/location');
      return;
    }
    setSaving(true);
    try {
      await api.patch(paths.event(draft.eventId), {
        minRatioWomen: values.minWomenPercent > 0 ? values.minWomenPercent / 100 : null,
      });

      const known = new Set(invites.map(inviteKey));
      const created: SavedInvite[] = [];
      for (const member of values.members) {
        if (known.has(inviteKey(member))) continue;
        const invite = await createInvite({ label: member.name.trim(), kind: member.role });
        created.push({ name: member.name.trim(), role: member.role, link: `${window.location.origin}/invite/${invite.token}`, expiresAt: invite.expiresAt });
        known.add(inviteKey(member));
      }
      const allInvites = [...invites, ...created];
      setInvites(allInvites);
      saveDraft({ staff: { ...values, invites: allInvites } });

      if (created.length > 0) {
        // Show the new links so the host can share them before moving on.
        setJustCreated(created);
      } else {
        navigate('/events/new/review');
      }
    } catch (err) {
      showApiError(toast, err, 'Could not save staff and screening.');
    } finally {
      setSaving(false);
    }
  }

  function onSaveDraft() {
    saveDraft({ staff: { ...form.getValues(), invites } });
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.show('Link copied.', { tone: 'positive' });
    } catch {
      toast.show('Copy failed. Select the link and copy it manually.', { tone: 'warning' });
    }
  }

  const live = form.watch();
  const membersError = (form.formState.errors.members as { message?: string; root?: { message?: string } } | undefined);

  return (
    <Page>
      <WizardTopBar
        stepLabel="Step 4 of 5 · Door & staff"
        draftSavedAt={draft.updatedAt}
        onSaveDraft={onSaveDraft}
        onBack={() => navigate('/events/new/menu')}
        rightSlot={
          justCreated.length > 0 ? (
            <Button variant="primary" onClick={() => navigate('/events/new/review')}>Next: review</Button>
          ) : (
            <Button variant="primary" onClick={form.handleSubmit(onSubmit)} disabled={saving}>
              {saving ? 'Saving…' : 'Next: review'}
            </Button>
          )
        }
      />
      <WizardSteps current={3} />

      <form onSubmit={form.handleSubmit(onSubmit)} style={{ marginTop: 18 }}>
        <div className="wizard-layout" style={{ alignItems: 'stretch' }}>
          <Panel pad style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="text text-title" style={{ fontWeight: 500 }}>Staff on the night</span>
            {fields.map((field, i) => (
              <div key={field.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
                <TextField
                  label={`Person ${i + 1}`}
                  placeholder="Rahul"
                  error={form.formState.errors.members?.[i]?.name?.message}
                  {...form.register(`members.${i}.name` as const)}
                />
                <Select<StaffRole>
                  label="Works"
                  value={live.members?.[i]?.role ?? 'door'}
                  options={ROLE_OPTIONS}
                  onChange={(role) => form.setValue(`members.${i}.role` as const, role, { shouldValidate: true })}
                />
                <Button type="button" variant="outline-danger" size="sm" onClick={() => remove(i)} disabled={fields.length === 1}>
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => append({ name: '', role: 'door' })}>+ Add person</Button>
            {membersError?.message || membersError?.root?.message ? (
              <span className="text text-caption" style={{ color: 'var(--danger-text)' }}>{membersError.message ?? membersError.root?.message}</span>
            ) : null}

            <Select
              label="Screening ratio"
              value={String(live.minWomenPercent ?? 0)}
              options={RATIO_OPTIONS}
              onChange={(v) => form.setValue('minWomenPercent', Number(v), { shouldValidate: true })}
            />
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Panel variant="positive" pad>
              <span className="text text-title" style={{ fontWeight: 500 }}>What this enables</span>
              <p className="text text-body-s" style={{ marginTop: 6, marginBottom: 0 }}>
                Each person gets a link that turns their phone into a door scanner or bar terminal for your events. Booking is held to the screening ratio.
              </p>
            </Panel>

            {invites.length > 0 ? (
              <Panel pad style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="text text-title" style={{ fontWeight: 500 }}>
                  {justCreated.length > 0 ? 'Share these links' : 'Staff links'}
                </span>
                {invites.map((inv) => (
                  <div key={inv.link} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="text text-body-s">
                      {inv.name} · {inv.role} · expires {new Date(inv.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <code className="text text-caption" style={{ wordBreak: 'break-all', flex: 1 }}>{inv.link}</code>
                      <Button type="button" size="sm" variant="outline" onClick={() => void copy(inv.link)}>Copy</Button>
                    </div>
                  </div>
                ))}
              </Panel>
            ) : null}
          </div>
        </div>
      </form>

      <div style={{ marginTop: 18 }}>
        <WizardPreviewCard basics={draft.basics} location={draft.location} menu={draft.menu} staff={live} />
      </div>
    </Page>
  );
}
