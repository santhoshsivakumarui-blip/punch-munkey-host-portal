import { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Page, PageHeader, DataTable, Chip, Panel, TextField, Button, EmptyState, Skeleton, useToast } from '@punch-munkey/ui-web';
import type { ChipTone } from '@punch-munkey/ui-web';
import { disputesLoadable, fileDisputeEvidenceAtom } from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';
import { formatINR } from '../lib/format';
import type { DisputeRecord } from '../lib/types';

const STATUS_TONE: Record<DisputeRecord['state'], ChipTone> = { open: 'warning', evidence_filed: 'accent', won: 'positive', lost: 'critical' };

// `7h` — disputes & chargebacks. `GET /hosts/me/disputes` +
// `POST /disputes/:id/evidence`.
export default function DisputesPage() {
  const toast = useToast();
  const loadable = useAtomValue(disputesLoadable);
  useToastOnError(loadable, 'Could not load your disputes.');
  const fileEvidence = useSetAtom(fileDisputeEvidenceAtom);

  const [filingId, setFilingId] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(id: string) {
    if (!evidenceUrl.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fileEvidence({ id, evidenceUrl: evidenceUrl.trim() });
      toast.show('Evidence filed.', { tone: 'positive' });
      setFilingId(null);
      setEvidenceUrl('');
    } catch (err) {
      showApiError(toast, err, 'Could not file evidence.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadable.state === 'loading') {
    return (
      <Page>
        <PageHeader title="Disputes & chargebacks" />
        <Skeleton height={200} radius={16} />
      </Page>
    );
  }

  if (loadable.state === 'hasError') {
    return (
      <Page>
        <PageHeader title="Disputes & chargebacks" />
        <EmptyState icon="alert" title="Couldn't load disputes" body="Check your connection and reload." />
      </Page>
    );
  }

  const disputes = loadable.data;

  return (
    <Page>
      <PageHeader title="Disputes & chargebacks" subtitle="Decisions and precedent, per pass." />
      {disputes.length === 0 ? (
        <EmptyState icon="calendar" title="No disputes on record" body="Chargebacks and guest disputes against your events show up here." />
      ) : (
        <>
          <DataTable<DisputeRecord>
            columns={[
              { key: 'id', header: 'Case', accessor: (r) => r.id, render: (r) => <span className="mono">{r.id.slice(0, 8).toUpperCase()}</span> },
              { key: 'reason', header: 'Reason', accessor: (r) => r.reasonCode ?? '—' },
              { key: 'amount', header: 'Amount', align: 'right', accessor: (r) => r.amountPaise, render: (r) => <span className="num">{formatINR(Math.round(r.amountPaise / 100))}</span> },
              { key: 'raised', header: 'Raised', accessor: (r) => r.raisedAt, render: (r) => new Date(r.raisedAt).toLocaleDateString('en-IN') },
              { key: 'status', header: 'Status', render: (r) => <Chip tone={STATUS_TONE[r.state]}>{r.state.replace('_', ' ')}</Chip> },
              {
                key: 'action',
                header: '',
                render: (r) =>
                  r.state === 'open' ? (
                    <Button variant="outline" size="sm" onClick={() => setFilingId(r.id)}>File evidence</Button>
                  ) : null,
              },
            ]}
            rows={disputes}
            rowKey={(r) => r.id}
            searchable
            searchPlaceholder="Search disputes…"
          />
          {filingId ? (
            <Panel pad style={{ maxWidth: 480 }}>
              <TextField label="Evidence URL" placeholder="Link to receipt, chat log, waiver scan…" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button variant="primary" disabled={!evidenceUrl.trim() || submitting} onClick={() => handleFile(filingId)}>{submitting ? 'Filing…' : 'Submit evidence'}</Button>
                <Button variant="outline" onClick={() => setFilingId(null)}>Cancel</Button>
              </div>
            </Panel>
          ) : null}
        </>
      )}
    </Page>
  );
}
