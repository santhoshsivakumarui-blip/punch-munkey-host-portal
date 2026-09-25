import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Chip, Button, Skeleton, EmptyState } from '@jfc/ui-web';
import { api, ApiError, paths } from '../lib/api';
import { showApiError } from '../lib/toastError';
import type { PairedDevice, StaffInviteInfo } from '../lib/types';

/**
 * `3g` — staff accept an invite. Real now: `GET /invites/:token`
 * (ticketing-service, public — no session exists yet) shows what's being
 * accepted before committing, `POST /invites/:token/accept` mints the same
 * device-pairing token `POST /devices/pair` does. This page is reached on
 * whatever phone the shared link was opened on, which won't always be the
 * staff member's own host-app install — so the result is shown once as a
 * copyable token, same shown-once pattern as DevicesPage's direct-pair
 * flow, for them to paste into jfc-host-app's `(host)/pair-device.tsx`
 * "Or, paste a pairing token from the desk" field.
 */
export default function InviteAcceptPage() {
  const { token } = useParams();
  const [info, setInfo] = useState<StaffInviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [result, setResult] = useState<PairedDevice | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<StaffInviteInfo>(paths.invite(token))
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.body.message : 'Could not reach the server.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onAccept() {
    if (!token || accepting) return;
    setAccepting(true);
    setAcceptError('');
    try {
      const paired = await api.post<PairedDevice>(paths.inviteAccept(token));
      setResult(paired);
    } catch (err) {
      setAcceptError(showApiError.messageFor(err, 'Could not accept this invite.'));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell" style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}>
        <div className="auth-brand-panel">
          <Chip tone="dark">Staff invite</Chip>

          {loading ? (
            <Skeleton height={90} radius={16} />
          ) : loadError || !info ? (
            <EmptyState icon="alert" title="Couldn't load this invite" body={loadError || 'This invite link is invalid.'} />
          ) : result ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div className="text text-display-l" style={{ color: 'var(--chrome-text-strong)' }}>You're paired</div>
                <p className="text text-body-s" style={{ color: 'var(--chrome-text)', margin: 0, lineHeight: 1.6 }}>
                  Open the host app on the {info.kind} device and paste this token into "Or, paste a pairing token from the desk."
                </p>
              </div>
              <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.08)', color: 'var(--chrome-text-strong)' }}>
                {result.deviceToken}
              </div>
              <p className="text text-caption" style={{ color: 'var(--chrome-text)', margin: 0 }}>Shown once — it isn't stored anywhere you can come back to.</p>
            </>
          ) : info.used ? (
            <EmptyState icon="alert" title="Already used" body="This invite link has already been accepted. Ask the host for a new one." />
          ) : info.expired ? (
            <EmptyState icon="alert" title="This invite has expired" body="Ask the host to send a new invite link." />
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div className="text text-display-l" style={{ color: 'var(--chrome-text-strong)' }}>
                  You've been invited to work the {info.kind === 'door' ? 'door' : 'bar'}
                </div>
                <p className="text text-body-s" style={{ color: 'var(--chrome-text)', margin: 0, lineHeight: 1.6 }}>
                  {info.hostDisplayName ? `${info.hostDisplayName} · ` : ''}
                  {info.label}. Accepting pairs a device for {info.kind} scanning — see the Punch Munkey Host app's `(door)`/`(bar)` entry point.
                </p>
              </div>
              {acceptError ? <span className="text text-caption" style={{ color: 'var(--danger-pale)' }}>{acceptError}</span> : null}
              <Button variant="primary" disabled={accepting} onClick={onAccept}>{accepting ? 'Accepting…' : 'Accept invite'}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
