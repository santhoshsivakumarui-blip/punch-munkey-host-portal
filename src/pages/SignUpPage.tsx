import { Link } from 'react-router-dom';
import { TextField, Button, Chip, Panel, RadioGroup } from '@punch-munkey/ui-web';
import { useHostApplicationForm } from '../hooks/useHostApplicationForm';

// `2c` — sign-up & gov-ID KYC upload. Document upload is real now
// (`POST /hosts/me/documents`, identity-service) but host-authenticated —
// this page runs pre-auth (no token exists until /hosts/apply below
// succeeds), so the upload UI itself lives on VerifyPendingPage, the very
// next screen, instead of here.
export default function SignUpPage() {
  const f = useHostApplicationForm();
  const entityType = f.form.watch('entityType');
  const isIndividual = entityType === 'individual';

  return (
    <div className="auth-page">
      <div className="auth-shell" style={{ gridTemplateColumns: '440px 1fr' }}>
        <div className="auth-brand-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="brand-mark" />
            <span className="text text-title" style={{ fontFamily: 'var(--font-display)', color: 'var(--chrome-text-strong)' }}>Punch Munkey · Host</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div className="text text-display-l" style={{ color: 'var(--chrome-text-strong)' }}>Apply to host</div>
            <p className="text text-body-s" style={{ color: 'var(--chrome-text)', margin: 0, lineHeight: 1.6 }}>
              A human reviews every application (KYH) before your first night can go on sale.
            </p>
          </div>

          <form onSubmit={f.onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <RadioGroup
              name="entityType"
              label="You're applying as"
              value={entityType}
              onChange={(v) => f.form.setValue('entityType', v, { shouldValidate: true })}
              disabled={f.submitting}
              options={[
                { value: 'individual', label: 'An individual', description: 'Hosting on your own, no registered business.' },
                { value: 'organisation', label: 'An organisation', description: 'A company, LLP, or other registered entity.' },
              ]}
            />
            <TextField
              label={isIndividual ? 'Your full legal name' : 'Legal entity'}
              placeholder={isIndividual ? 'As on your government ID' : 'e.g. Nine Yards Hospitality LLP'}
              disabled={f.submitting}
              error={f.form.formState.errors.legalEntity?.message}
              {...f.form.register('legalEntity')}
            />
            <TextField label="Display name" placeholder="What guests see" disabled={f.submitting} error={f.form.formState.errors.displayName?.message} {...f.form.register('displayName')} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <TextField label="Phone number" placeholder="+91XXXXXXXXXX" disabled={f.submitting} {...f.form.register('phoneE164')} />
              </div>
              <Button type="button" variant="outline" onClick={f.requestOtp} disabled={f.submitting}>
                {f.otpSent ? 'Resend' : 'Send code'}
              </Button>
            </div>
            {/* See SignInPage.tsx's identical fix — kept out of TextField's
                own error slot so the row's height (and the button's position)
                doesn't shift when this field is invalid. */}
            {f.form.formState.errors.phoneE164 ? (
              <span className="text text-caption field-error">{f.form.formState.errors.phoneE164.message}</span>
            ) : null}
            {f.otpSent ? <Chip tone="positive">Code sent · check the api-gateway console in dev</Chip> : null}
            <TextField label="6-digit code" placeholder="000000" inputMode="numeric" disabled={f.submitting} error={f.form.formState.errors.otp?.message} {...f.form.register('otp')} />

            <Panel variant="tint" pad>
              <span className="text text-title" style={{ fontWeight: 500 }}>Government ID (KYC)</span>
              <p className="text text-caption tone-secondary" style={{ marginTop: 6, marginBottom: 0 }}>
                You'll upload this and any other documents right after submitting — this step needs you signed in first.
              </p>
            </Panel>

            {f.submitError ? <span className="text text-caption field-error">{f.submitError}</span> : null}
            <Button type="submit" variant="primary" disabled={f.submitting}>
              {f.submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          </form>

          <p className="text text-caption" style={{ color: 'var(--chrome-text)', marginTop: 'auto' }}>
            Already applied? <Link to="/sign-in" style={{ color: 'var(--amber-light)' }}>Sign in</Link>.
          </p>
        </div>

        <div className="auth-form-panel">
          <div>
            <span className="text text-overline tone-secondary">What happens next</span>
            <div className="text text-display-m tone-primary" style={{ marginTop: 6 }}>KYH review, then you're live</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {[
              ['1 · Verify your phone', 'A code confirms it’s really you.'],
              ['2 · KYH review', 'Admin checks entity, licence and identity.'],
              ['3 · Build your first night', 'The 5-step wizard, saved at every step.'],
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
