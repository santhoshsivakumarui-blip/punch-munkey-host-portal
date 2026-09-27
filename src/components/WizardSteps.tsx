import { useNavigate } from 'react-router-dom';

export const WIZARD_STEPS = [
  { path: '/events/new/basics', label: 'Basics' },
  { path: '/events/new/location', label: 'Location' },
  { path: '/events/new/menu', label: 'Menu' },
  { path: '/events/new/staff', label: 'Staff' },
  { path: '/events/new/review', label: 'Review' },
] as const;

/** `1g`'s pill step row, generalized across all 5 wizard routes — the RN
 * app's `Stepper` (@punch-munkey/ui-native) doesn't have a web counterpart in
 * @punch-munkey/ui-web yet, so this is a small local component per
 * 08-component-inventory.md's own rule ("if a component appears on fewer
 * than three screens... build it locally"). Each pill carries its own
 * check/number badge (matching the mockup's inline badge, not a separate
 * circle-above-label layout an earlier pass here used instead). */
export function WizardSteps({ current }: { current: number }) {
  const navigate = useNavigate();
  return (
    <div className="wizard-steps">
      {WIZARD_STEPS.map((step, i) => (
        <div key={step.path} style={{ display: 'contents' }}>
          <button
            type="button"
            className={`wizard-pill-step${i === current ? ' active' : i < current ? ' done' : ''}`}
            onClick={() => i < current && navigate(step.path)}
            disabled={i >= current}
            style={{ cursor: i < current ? 'pointer' : 'default' }}
          >
            {i <= current ? <span className="wizard-pill-badge">{i < current ? '✓' : i + 1}</span> : null}
            {step.label}
          </button>
          {i < WIZARD_STEPS.length - 1 ? <span className="wizard-step-connector" /> : null}
        </div>
      ))}
    </div>
  );
}
