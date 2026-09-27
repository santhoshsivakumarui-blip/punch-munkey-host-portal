import type { ReactNode } from 'react';
import { Button } from '@punch-munkey/ui-web';

function formatSavedAt(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/**
 * `2j`/`2k`/`1g`/`2l`'s "New event" header bar — one dot, a title, the
 * current step's label, and a `Draft saved HH:MM` timestamp pulled from
 * `wizardDraft.ts`'s real `updatedAt` (not a fabricated "saved" claim: it's
 * the same field every wizard submit already writes). `onSaveDraft` is
 * optional — Review has nothing left to save that submitting doesn't
 * already cover, so it omits the button rather than showing a no-op one.
 */
export function WizardTopBar({
  stepLabel,
  draftSavedAt,
  onBack,
  backLabel = 'Back',
  onSaveDraft,
  rightSlot,
}: {
  stepLabel: string;
  draftSavedAt?: string;
  onBack?: () => void;
  backLabel?: string;
  onSaveDraft?: () => void;
  rightSlot: ReactNode;
}) {
  const savedLabel = formatSavedAt(draftSavedAt);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 20px',
        borderRadius: 20,
        background: 'var(--paper-card)',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 18,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 22, height: 22, borderRadius: '999px', background: 'var(--amber-base)', flex: 'none' }} />
        <span className="text text-title" style={{ fontWeight: 500 }}>New event</span>
        <span className="text text-body-s tone-secondary">{stepLabel}</span>
        {savedLabel ? <span className="text text-caption tone-secondary">Draft saved {savedLabel}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        {onSaveDraft ? (
          <Button type="button" variant="outline" onClick={onSaveDraft}>
            Save draft
          </Button>
        ) : null}
        {onBack ? (
          <Button type="button" variant="outline" onClick={onBack}>
            {backLabel}
          </Button>
        ) : null}
        {rightSlot}
      </div>
    </div>
  );
}
