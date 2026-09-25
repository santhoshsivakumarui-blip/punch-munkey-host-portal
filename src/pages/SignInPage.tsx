import { Link } from 'react-router-dom';
import { TextField, Button, Chip } from '@jfc/ui-web';
import { useSignInForm } from '../hooks/useSignInForm';

/**
 * `3d` — sign in. Phone + OTP only, verified against
 * `POST /auth/otp/verify` (the same route jfc-guest-app uses) rather than
 * the heavier `/hosts/apply` sign-up needs — a returning host already has
 * a `hosts` row, so there's nothing left to collect. useSignInForm rejects
 * (without creating a session) if the number verifies but isn't a host.
 */
export default function SignInPage() {
  const f = useSignInForm();

  return (
    <div className="auth-page">
      <div className="auth-shell" style={{ gridTemplateColumns: '440px 1fr' }}>
        <div className="auth-brand-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="brand-mark" />
            <span className="text text-title" style={{ fontFamily: 'var(--font-display)', color: 'var(--chrome-text-strong)' }}>Punch Munkey · Host</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div className="text text-display-l" style={{ color: 'var(--chrome-text-strong)' }}>Welcome back</div>
            <p className="text text-body-s" style={{ color: 'var(--chrome-text)', margin: 0, lineHeight: 1.6 }}>
              Verify your phone to continue. There's no separate password — a fresh code every time.
            </p>
          </div>

          <form onSubmit={f.onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Phone number"
                  placeholder="+91XXXXXXXXXX"
                  disabled={f.submitting}
                  {...f.form.register('phoneE164')}
                />
              </div>
              <Button type="button" variant="outline" onClick={f.requestOtp} disabled={f.submitting}>
                {f.otpSent ? 'Resend' : 'Send code'}
              </Button>
            </div>
            {/* Rendered outside the row above, not via TextField's own built-in
                error slot — that slot lives inside the field's flex column, so
                showing it there grows that column taller than the button next
                to it (row alignItems: 'flex-end' then drags the button down to
                the error line instead of the input). Keeping it here instead
                keeps the row's height, and the button's position, fixed. */}
            {f.form.formState.errors.phoneE164 ? (
              <span className="text text-caption field-error">{f.form.formState.errors.phoneE164.message}</span>
            ) : null}
            {f.otpSent ? <Chip tone="positive">Code sent · check the api-gateway console in dev</Chip> : null}

            <TextField
              label="6-digit code"
              placeholder="000000"
              inputMode="numeric"
              disabled={f.submitting}
              error={f.form.formState.errors.otp?.message}
              {...f.form.register('otp')}
            />

            {f.submitError ? <span className="text text-caption field-error">{f.submitError}</span> : null}
            <Button type="submit" variant="primary" disabled={f.submitting}>
              {f.submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text text-caption" style={{ color: 'var(--chrome-text)', marginTop: 'auto' }}>
            New here? <Link to="/sign-up" style={{ color: 'var(--amber-light)' }}>Apply to host</Link> instead.
          </p>
        </div>

        <div className="auth-form-panel">
          <div>
            <span className="text text-overline tone-secondary">Reminder</span>
            <div className="text text-display-m tone-primary" style={{ marginTop: 6 }}>Money sits in escrow</div>
          </div>
          <p className="text text-body-s tone-secondary" style={{ lineHeight: 1.6 }}>
            Payouts release twelve hours after doors close, minus anything disputed. Nothing here implies you've been paid before that.
          </p>
        </div>
      </div>
    </div>
  );
}
