import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { Chip, Button, Panel, useToast } from '@punch-munkey/ui-web';
import { sessionAtom, hostDocumentsAtom, hostDocumentsLoadable, uploadHostDocumentAtom } from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';
import type { HostDocument, HostDocumentType } from '../lib/types';

// `3f` — verify (phone, not email — see SignInPage's doc comment) then KYH
// pending. Reached right after SignUpPage's submit; `kyhState` comes from
// the real `hosts.kyh_state` column (`submitted` until an admin decides via
// the real `POST /admin/kyh/:hostId/decide` — see punch-munkey-admin-portal's
// VerificationPage and punch-munkey-support-portal's KyhDelegatedPage for the two
// operator-side surfaces that call it).
//
// Document upload lives here rather than on SignUpPage — `POST
// /hosts/me/documents` (identity-service) is host-authenticated, and a host
// has no token yet while filling out SignUpPage's form. `gov_id` is the one
// every host needs; `liquor_licence`/`fire_noc` only make sense for a host
// holding a venue (shown for 'organisation' entityType — an individual host
// applying on their own name has neither), `venue_photo` is optional
// supporting evidence for everyone.
const DOC_TYPES: { type: HostDocumentType; label: string; hint: string }[] = [
  { type: 'gov_id', label: 'Government ID', hint: 'Aadhaar, PAN, passport, or driving licence.' },
  { type: 'liquor_licence', label: 'Liquor licence', hint: 'Required if the venue serves alcohol.' },
  { type: 'fire_noc', label: 'Fire NOC', hint: 'Fire safety no-objection certificate for the venue.' },
  { type: 'venue_photo', label: 'Venue photo', hint: 'Optional — helps reviewers place the space.' },
];

function latestByType(docs: HostDocument[], type: HostDocumentType): HostDocument | undefined {
  return docs.find((d) => d.docType === type);
}

const STATUS_TONE: Record<HostDocument['status'], 'positive' | 'warning' | 'critical'> = {
  approved: 'positive',
  pending: 'warning',
  rejected: 'critical',
};

function DocumentRow({ type, label, hint, existing }: { type: HostDocumentType; label: string; hint: string; existing?: HostDocument }) {
  const toast = useToast();
  const upload = useSetAtom(uploadHostDocumentAtom);
  const refresh = useSetAtom(hostDocumentsAtom);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploading) return;
    setUploading(true);
    try {
      await upload({ file, docType: type });
      refresh();
      toast.show(`${label} uploaded.`, { tone: 'positive' });
    } catch (err) {
      showApiError(toast, err, `Could not upload ${label.toLowerCase()}.`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="text text-body-s" style={{ color: 'var(--chrome-text-strong)', fontWeight: 500 }}>{label}</span>
        <span className="text text-caption" style={{ color: 'var(--chrome-text)' }}>
          {existing ? existing.originalFilename : hint}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {existing ? <Chip tone={STATUS_TONE[existing.status]}>{existing.status}</Chip> : null}
        {existing?.viewUrl ? (
          <a href={existing.viewUrl} target="_blank" rel="noreferrer" className="text text-caption" style={{ color: 'var(--amber-light)' }}>View</a>
        ) : null}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }} onChange={onFileChosen} />
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Uploading…' : existing ? 'Replace' : 'Upload'}
        </Button>
      </div>
    </div>
  );
}

export default function VerifyPendingPage() {
  const navigate = useNavigate();
  const { user } = useAtomValue(sessionAtom);
  const docsLoadable = useAtomValue(hostDocumentsLoadable);
  useToastOnError(docsLoadable, 'Could not load your documents.');
  const docs = docsLoadable.state === 'hasData' ? docsLoadable.data : [];

  return (
    <div className="auth-page">
      <div className="auth-shell" style={{ gridTemplateColumns: '1fr', maxWidth: 560 }}>
        <div className="auth-brand-panel">
          <Chip tone="warning">{user?.kyhState === 'verified' ? 'Verified' : 'KYH pending'}</Chip>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div className="text text-display-l" style={{ color: 'var(--chrome-text-strong)' }}>Phone verified — your application is in review</div>
            <p className="text text-body-s" style={{ color: 'var(--chrome-text)', margin: 0, lineHeight: 1.6 }}>
              A KYH reviewer checks your entity, licence and identity. This usually takes a business day. You can start building your first night now — it just can't publish until you're verified.
            </p>
          </div>
          <Panel variant="dark" pad>
            <span className="text text-title" style={{ color: 'var(--chrome-text-strong)' }}>{user?.legalEntity ?? 'Your application'}</span>
            <span className="text text-body-s" style={{ color: 'var(--chrome-text)' }}>Displayed as {user?.displayName ?? '—'}</span>
          </Panel>

          <Panel variant="dark" pad>
            <span className="text text-title" style={{ color: 'var(--chrome-text-strong)', display: 'block', marginBottom: 4 }}>Documents</span>
            {DOC_TYPES.filter((d) => (d.type !== 'liquor_licence' && d.type !== 'fire_noc') || user?.entityType === 'organisation').map((d) => (
              <DocumentRow key={d.type} type={d.type} label={d.label} hint={d.hint} existing={latestByType(docs, d.type)} />
            ))}
          </Panel>

          <Button variant="primary" onClick={() => navigate('/events')}>Start building a night</Button>
        </div>
      </div>
    </div>
  );
}
