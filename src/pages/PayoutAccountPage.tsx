import { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader, Panel, PanelTitle, TextField, Button, Chip, KvRow, Skeleton, EmptyState, useToast } from '@jfc/ui-web';
import { bankDetailsAtom, bankDetailsLoadable, submitBankDetailsAtom, taxLoadable, payoutsLoadable } from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';
import { formatINR } from '../lib/format';

// Real rates, `@jfc/shared`'s own splitFee() — 05-hard-parts.md §3 ("confirm
// with finance before launch," per that function's own comment). No
// separate "payment gateway charges" line exists in that formula (the
// mockup's `8h` shows one) — folded out rather than invented, since there's
// no real number behind it; GST-on-fee is real and shown instead, which
// the mockup's illustrative breakdown omits.
const PLATFORM_FEE_PERCENT = 8;
const TDS_PERCENT = 1;
const GST_ON_FEE_PERCENT = 18;

/**
 * `8h` — "Where the money goes." `GET`/`POST /hosts/me/bank` are both real —
 * including `gstin`, validated server-side against the actual 15-character
 * GSTIN format and left `null` for a host with none on file. Bank details
 * persist across a reload via the real `GET`. `GET /hosts/me/tax` is a real
 * monthly TDS/GST rollup. The fee-breakdown panel now shows a real payout's
 * actual gross/fee/TDS/GST/net split (same `PayoutRecord` `PayoutsPage`
 * already renders, just walked through here) rather than nothing — falls
 * back to the real rates alone (no fabricated rupee amount) when this host
 * has no payout yet. "Verify with ₹1" from the mockup isn't used as CTA
 * copy: penny-drop bank verification was never built anywhere in this
 * codebase (payments-service's own POST /hosts/me/bank comment says so
 * plainly) — claiming it in a button label would be exactly the kind of
 * false affordance this codebase avoids elsewhere.
 */
export default function PayoutAccountPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const submitBank = useSetAtom(submitBankDetailsAtom);
  const refreshBank = useSetAtom(bankDetailsAtom);
  const bankL = useAtomValue(bankDetailsLoadable);
  useToastOnError(bankL, 'Could not load your bank details.');
  const taxL = useAtomValue(taxLoadable);
  useToastOnError(taxL, 'Could not load tax summary.');
  const payoutsL = useAtomValue(payoutsLoadable);

  const saved = bankL.state === 'hasData' ? bankL.data : null;
  const latestPayout =
    payoutsL.state === 'hasData' && payoutsL.data.length > 0
      ? [...payoutsL.data].sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime())[0]
      : null;
  const [editing, setEditing] = useState(false);
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [gstin, setGstin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function startEditing() {
    setAccountHolderName(saved?.accountHolderName ?? '');
    setAccountNumber('');
    setConfirmAccountNumber('');
    setIfsc(saved?.ifsc ?? '');
    setGstin(saved?.gstin ?? '');
    setEditing(true);
  }

  const accountNumbersMatch = accountNumber.trim().length > 0 && accountNumber.trim() === confirmAccountNumber.trim();

  async function saveAccount() {
    if (!accountHolderName.trim() || !accountNumbersMatch || !ifsc.trim() || submitting) return;
    setSubmitting(true);
    try {
      await submitBank({
        accountHolderName: accountHolderName.trim(),
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim(),
        gstin: gstin.trim() || undefined,
      });
      refreshBank();
      setEditing(false);
      toast.show('Saved — payouts paused pending review.', { tone: 'positive' });
    } catch (err) {
      showApiError(toast, err, 'Could not save these bank details.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Where the money goes" actions={<Button variant="outline" onClick={() => navigate('/payouts')}>View payouts</Button>} />
      {/* Same fix as WizardReviewPage's identical grid-shape bug this
          session — .two-col's 1fr/340px default is a main+sidebar shape,
          not right for 4 equal panels. */}
      <div className="two-col" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <Panel pad>
          <PanelTitle>Bank account</PanelTitle>
          {bankL.state === 'loading' ? (
            <Skeleton height={100} radius={12} />
          ) : editing || !saved ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <TextField label="Account holder name" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} />
              <TextField label="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder={saved ? 'Re-enter to change · not shown back to you' : undefined} />
              <TextField
                label="Confirm account number"
                value={confirmAccountNumber}
                onChange={(e) => setConfirmAccountNumber(e.target.value)}
                error={confirmAccountNumber.length > 0 && !accountNumbersMatch ? "Doesn't match." : undefined}
              />
              <TextField label="IFSC" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
              <TextField label="GSTIN (optional)" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="Leave blank if not registered for GST" />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" disabled={submitting || !accountNumbersMatch} onClick={saveAccount}>{submitting ? 'Saving…' : 'Save · pauses payouts'}</Button>
                {saved ? <Button variant="outline" disabled={submitting} onClick={() => setEditing(false)}>Cancel</Button> : null}
              </div>
            </div>
          ) : (
            <>
              <Chip tone="warning">Payouts paused · pending four-eyes release</Chip>
              <KvRow label="Account" value={saved.accountNumber} mono />
              <KvRow label="IFSC" value={saved.ifsc} mono />
              <KvRow label="GSTIN" value={saved.gstin ?? 'Not registered'} mono={Boolean(saved.gstin)} />
              <Button variant="outline" onClick={startEditing} style={{ marginTop: 8 }}>Change account</Button>
            </>
          )}
        </Panel>

        <Panel pad>
          <PanelTitle>What lands in your account</PanelTitle>
          {latestPayout ? (
            <>
              <KvRow label="Ticket revenue" value={formatINR(latestPayout.grossPaise / 100)} mono />
              <KvRow label={`Platform fee (${PLATFORM_FEE_PERCENT}%)`} value={`−${formatINR(latestPayout.feePaise / 100)}`} mono />
              <KvRow label={`TDS, sec. 194-O (${TDS_PERCENT}%)`} value={`−${formatINR(latestPayout.tdsPaise / 100)}`} mono />
              <KvRow label={`GST on fee (${GST_ON_FEE_PERCENT}%)`} value={`−${formatINR(latestPayout.gstPaise / 100)}`} mono />
              {latestPayout.heldPaise > 0 ? (
                <KvRow label="Held (open disputes)" value={`−${formatINR(latestPayout.heldPaise / 100)}`} mono />
              ) : null}
              <KvRow label="Net to bank" value={formatINR(latestPayout.netPaise / 100)} mono />
            </>
          ) : (
            <p className="text text-body-s tone-secondary" style={{ margin: 0 }}>
              No payout yet — once one lands, this shows exactly what was deducted. Every payout is {PLATFORM_FEE_PERCENT}% platform fee, {TDS_PERCENT}% TDS, and {GST_ON_FEE_PERCENT}% GST on the fee, off the top of ticket revenue.
            </p>
          )}
        </Panel>

        <Panel pad>
          <PanelTitle>When it moves</PanelTitle>
          <p className="text text-body-s tone-secondary" style={{ margin: 0, lineHeight: 1.6 }}>
            Doors close → held in escrow for 12 hours → released, minus anything disputed → paid out same-day. Nothing here implies you've been paid before that.
          </p>
        </Panel>

        <Panel pad>
          <PanelTitle>Tax</PanelTitle>
          {taxL.state === 'loading' ? (
            <Skeleton height={80} radius={12} />
          ) : taxL.state === 'hasError' ? (
            <EmptyState icon="alert" title="Couldn't load tax summary" body="Check your connection and reload." />
          ) : taxL.data.length === 0 ? (
            <span className="text text-body-s tone-secondary">No payouts yet this financial year.</span>
          ) : (
            taxL.data.map((m) => (
              <div key={m.month}>
                <KvRow label={`${m.month} · TDS`} value={formatINR(Math.round(m.tdsPaise / 100))} mono />
                <KvRow label={`${m.month} · GST`} value={formatINR(Math.round(m.gstPaise / 100))} mono />
              </div>
            ))
          )}
        </Panel>
      </div>
    </Page>
  );
}
