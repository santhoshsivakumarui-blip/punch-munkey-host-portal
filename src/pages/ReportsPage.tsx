import { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Page, PageHeader, Panel, Chip, ReasonField, Button, EmptyState, Skeleton, useToast } from '@punch-munkey/ui-web';
import { reportsLoadable, respondToReportAtom } from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';

// `7i` — reports inbox. `GET /hosts/me/reports` (safety-service, masked —
// the reporter's identity is sealed, only the category/body surface).
// Responding calls `POST /reports/:id/host-response`, once per report
// (host-response is a statement, not a thread).
export default function ReportsPage() {
  const toast = useToast();
  const loadable = useAtomValue(reportsLoadable);
  useToastOnError(loadable, 'Could not load reports.');
  const respond = useSetAtom(respondToReportAtom);

  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function send(id: string) {
    if (!reply.trim() || submitting) return;
    setSubmitting(true);
    try {
      await respond({ id, response: reply.trim() });
      toast.show('Response sent.', { tone: 'positive' });
      setOpen(null);
      setReply('');
    } catch (err) {
      showApiError(toast, err, 'Could not send that response.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadable.state === 'loading') {
    return (
      <Page>
        <PageHeader title="Reports inbox" />
        <Skeleton height={90} radius={16} />
      </Page>
    );
  }

  if (loadable.state === 'hasError') {
    return (
      <Page>
        <PageHeader title="Reports inbox" />
        <EmptyState icon="alert" title="Couldn't load reports" body="Check your connection and reload." />
      </Page>
    );
  }

  const reports = loadable.data;

  return (
    <Page>
      <PageHeader title="Reports inbox" subtitle="Reports about your nights. The reporter's identity is never shown to you." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reports.length === 0 ? (
          <Chip tone="positive">No open reports.</Chip>
        ) : (
          reports.map((r) => (
            <Panel key={r.id} pad>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.category}</span>
                  <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>{r.body}</p>
                </div>
                <span className="text text-caption tone-secondary">{new Date(r.filedAt).toLocaleDateString('en-IN')}</span>
              </div>
              {r.hostResponse ? (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--paper-tint)' }}>
                  <span className="text text-caption tone-secondary">Your response: {r.hostResponse}</span>
                </div>
              ) : open === r.id ? (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ReasonField value={reply} onChange={setReply} placeholder="Your response · visible to the guest and Support" />
                  <Button variant="primary" disabled={!reply.trim() || submitting} onClick={() => send(r.id)}>{submitting ? 'Sending…' : 'Send response'}</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" style={{ marginTop: 10 }} onClick={() => setOpen(r.id)}>Respond</Button>
              )}
            </Panel>
          ))
        )}
      </div>
    </Page>
  );
}
