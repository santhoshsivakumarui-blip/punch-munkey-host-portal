import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { Page, Panel, PanelTitle, KvRow, Chip, Button, EmptyState, Checkbox, useToast } from '@jfc/ui-web';
import { WizardSteps } from '../../components/WizardSteps';
import { WizardTopBar } from '../../components/WizardTopBar';
import { WizardPreviewCard } from '../../components/WizardPreviewCard';
import { loadDraft, clearDraft } from '../../lib/wizardDraft';
import { sessionAtom } from '../../lib/atoms';
import { api, paths } from '../../lib/api';
import { showApiError } from '../../lib/toastError';
import type { EventRecord } from '../../lib/types';
import { REVEAL_HOURS_BEFORE_DOORS } from '../../schemas/wizard';

/**
 * `2l` — wizard step 5, review & publish. `5e` (blocked publish
 * validation) isn't a separate route — it's this same page's state when a
 * required step is missing or the host's own KYH isn't verified yet.
 * Publish is a real two-call sequence: `POST /events/:id/submit`
 * (draft → in_review, checked for completeness server-side too) then
 * `POST /events/:id/publish` (in_review → on_sale, 403s with
 * `KYH_NOT_VERIFIED` if the host's KYH isn't done — surfaced as a toast,
 * not a generic failure).
 *
 * The mockup's "Announce to" panel (past guests / followers counts) has no
 * backend anywhere in this codebase — flagged below rather than shown with
 * fabricated numbers, same bar every other real-vs-mocked gap in this app
 * is held to.
 */
export default function WizardReviewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAtomValue(sessionAtom);
  const draft = loadDraft();
  const [publishing, setPublishing] = useState(false);
  const [pastGuests, setPastGuests] = useState<number | null>(null);
  const [announce, setAnnounce] = useState(true);

  useEffect(() => {
    api
      .get<{ count: number }>(paths.hostsMePastGuests)
      .then((r) => setPastGuests(r.count))
      .catch(() => setPastGuests(null));
  }, []);

  const missing: string[] = [];
  if (!draft.basics) missing.push('Basics');
  if (!draft.location || !draft.eventId) missing.push('Location');
  if (!draft.menu || draft.menu.items.length === 0) missing.push('Menu');
  if (!draft.staff) missing.push('Staff');

  const blocked = missing.length > 0;
  const kyhVerified = user?.kyhState === 'verified';
  const grossPotentialRupees = draft.basics ? draft.basics.priceRupees * draft.basics.capacity : 0;

  async function publish() {
    if (blocked || !draft.eventId || publishing) return;
    setPublishing(true);
    try {
      await api.post<EventRecord>(paths.eventSubmit(draft.eventId));
      await api.post<EventRecord>(paths.eventPublish(draft.eventId), { announce: announce && (pastGuests ?? 0) > 0 });
      toast.show('Published — on sale now.', { tone: 'positive' });
      clearDraft();
      navigate('/events');
    } catch (err) {
      showApiError(toast, err, 'Could not publish this event.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Page>
      <WizardTopBar
        stepLabel="Step 5 of 5 · Review"
        onBack={() => navigate('/events/new/staff')}
        rightSlot={
          <Button variant="positive" onClick={publish} disabled={blocked || publishing}>
            {publishing ? 'Publishing…' : 'Publish event'}
          </Button>
        }
      />
      <WizardSteps current={4} />

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 22, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="text text-display-m">{draft.basics?.title?.trim() || 'Untitled night'}</span>
          <Panel pad>
            <KvRow label="Type" value={draft.basics?.eventType ?? '—'} />
            <KvRow label="Doors" value={draft.basics ? `${draft.basics.dateISO}, ${draft.basics.startTime}–${draft.basics.endTime}` : '—'} />
            <KvRow label="Capacity" value={draft.basics ? String(draft.basics.capacity) : '—'} mono />
            <KvRow label="Reveal" value={`${REVEAL_HOURS_BEFORE_DOORS}h before doors`} />
            <KvRow label="Menu items" value={draft.menu ? String(draft.menu.items.length) : '0'} mono />
            <KvRow label="Drink cap" value={draft.menu ? `${draft.menu.alcoholCapPerGuest} per pass` : '—'} mono />
          </Panel>

          <Panel variant="positive" pad>
            <PanelTitle>Pre-flight checks</PanelTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {[
                { ok: Boolean(draft.eventId), label: 'Event created' },
                { ok: Boolean(draft.basics), label: 'Basics complete' },
                { ok: Boolean(draft.location), label: 'Location & reveal complete' },
                { ok: Boolean(draft.menu && draft.menu.items.length > 0), label: 'Menu complete' },
                { ok: Boolean(draft.staff), label: 'Door & staff complete' },
                { ok: kyhVerified, label: 'KYH verified' },
              ].map((c) => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: c.ok ? 'var(--sage-base)' : 'var(--amber-base)', flex: 'none' }} />
                  <span className="text text-body-s" style={{ color: c.ok ? 'var(--sage-text)' : 'var(--amber-dark)' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </Panel>

          {blocked ? (
            <Panel variant="warning" pad>
              <EmptyState icon="alert" title="Can't publish yet" body={`Missing: ${missing.join(', ')}.`} />
            </Panel>
          ) : !kyhVerified ? (
            <Panel variant="warning" pad>
              <EmptyState icon="alert" title="KYH verification pending" body="Everything's ready, but publishing needs a verified KYH status — the server will reject it until then." />
            </Panel>
          ) : (
            <Chip tone="positive">Ready to publish</Chip>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="text text-body-s tone-secondary">Guest preview</span>
          <WizardPreviewCard basics={draft.basics} location={draft.location} menu={draft.menu} staff={draft.staff} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {grossPotentialRupees > 0 ? (
            <Panel variant="dark" pad>
              <span className="text text-title" style={{ fontWeight: 500 }}>Gross potential</span>
              <div className="text text-numeral-l" style={{ marginTop: 6, color: 'var(--amber-light)' }}>
                ₹{grossPotentialRupees.toLocaleString('en-IN')}
              </div>
              <p className="text text-caption" style={{ marginTop: 6, marginBottom: 0 }}>
                If every pass sells at full price. Platform fee, GST and TDS are calculated at payout, not here.
              </p>
            </Panel>
          ) : null}

          <Panel pad>
            <PanelTitle>Announce to</PanelTitle>
            {pastGuests === null ? (
              <p className="text text-body-s tone-secondary" style={{ marginTop: 4, marginBottom: 0 }}>Checking your past guests…</p>
            ) : pastGuests === 0 ? (
              <p className="text text-body-s tone-secondary" style={{ marginTop: 4, marginBottom: 0 }}>
                No past guests yet. Once people have been scanned in at one of your nights, you can tell them about the next one here.
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                <Checkbox
                  label={`Tell ${pastGuests} past guest${pastGuests === 1 ? '' : 's'} about this night`}
                  description="Only guests who turned on announcements get it. Sent when you publish."
                  checked={announce}
                  onChange={(e) => setAnnounce(e.target.checked)}
                />
              </div>
            )}
          </Panel>

          <Panel variant="warning" pad>
            <span className="text text-body-s">Publishing opens sales immediately. You can pause sales any time without cancelling.</span>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
