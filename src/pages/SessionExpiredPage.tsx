import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { Chip, Button } from '@jfc/ui-web';
import { clearExpiredFlagAtom } from '../lib/atoms';

// Idle-timeout landing — same pattern as jfc-admin-portal/jfc-support-portal's
// `3k`, minus their "access denied" illustrative half: Host has one role per
// account, not the operator role/capability model that half is
// demonstrating, so there's nothing honest to show there.
export default function SessionExpiredPage() {
  const navigate = useNavigate();
  const clearExpiredFlag = useSetAtom(clearExpiredFlagAtom);

  function signInAgain() {
    clearExpiredFlag();
    navigate('/sign-in');
  }

  return (
    <div className="auth-page">
      <div className="auth-shell" style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}>
        <div className="auth-brand-panel">
          <Chip tone="dark">Session ended</Chip>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div className="text text-display-l" style={{ color: 'var(--chrome-text-strong)' }}>You were idle for a while</div>
            <p className="text text-body-s" style={{ color: 'var(--chrome-text)', margin: 0, lineHeight: 1.6 }}>
              Sign back in with a fresh code — any wizard step you saved is still there.
            </p>
          </div>
          <Button variant="positive" onClick={signInAgain}>Sign in again</Button>
        </div>
      </div>
    </div>
  );
}
