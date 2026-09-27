import { Link } from 'react-router-dom';
import { Button, Chip } from '@punch-munkey/ui-web';

// `6a` — host landing page, public marketing. Design handoff calls this out
// as "SSR for SEO" under Next.js; this is a plain Vite SPA (see
// 01-architecture.md's reconciliation note), so it's client-rendered like
// every other route here — real SEO would need a separate static build,
// out of scope for this thin slice.
export default function HostLandingPage() {
  return (
    <div className="auth-page">
      <div className="auth-shell" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="auth-brand-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="brand-mark" />
            <span className="text text-title" style={{ fontFamily: 'var(--font-display)', color: 'var(--chrome-text-strong)' }}>
              Punch Munkey · Host
            </span>
          </div>
          <Chip tone="dark">Bengaluru · couples &amp; women only</Chip>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div className="text text-display-l" style={{ color: 'var(--chrome-text-strong)' }}>Run private nights. We hold the money and the safety net.</div>
            <p className="text text-body-s" style={{ color: 'var(--chrome-text)', margin: 0, lineHeight: 1.6 }}>
              List a room, set your screening ratio, and get paid twelve hours after doors close — minus anything disputed. Guests never see your address until four hours before doors.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/sign-up">
              <Button variant="primary">Apply to host</Button>
            </Link>
            <Link to="/sign-in">
              <Button variant="outline">I already host here</Button>
            </Link>
          </div>
          <p className="text text-caption" style={{ color: 'var(--chrome-text)', marginTop: 'auto' }}>
            Every application goes through a KYH review before your first night goes on sale.
          </p>
        </div>

        <div className="auth-form-panel">
          <div>
            <span className="text text-overline tone-secondary">What you get</span>
            <div className="text text-display-m tone-primary" style={{ marginTop: 6 }}>A desk for the paperwork, a phone for the floor</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {[
              ['Event wizard', 'Basics, location & reveal radius, menu, staff and screening, then publish.'],
              ['Escrow you can see', 'Every payout traces back to a ledger row — never a promise.'],
              ['On-the-floor app', 'Live capacity, scans and staff chat on your phone, the night of.'],
            ].map(([title, body]) => (
              <div key={title} style={{ padding: '15px 16px', borderRadius: 18, background: '#fff', boxShadow: 'var(--shadow-sm)' }}>
                <div className="text text-title" style={{ fontWeight: 500 }}>{title}</div>
                <div className="text text-body-s tone-secondary" style={{ marginTop: 4 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
