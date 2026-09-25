import { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { QRCodeSVG } from 'qrcode.react';
import { Page, PageHeader, Panel, Chip, Button, TextField, EmptyState, DataTable, ConfirmModal, useToast } from '@jfc/ui-web';
import { pairDeviceAtom, devicesAtom, devicesLoadable, unpairDeviceAtom, createStaffInviteAtom } from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';
import type { DeviceRecord } from '../lib/types';

/**
 * No one types a device label anymore — it was pure friction for a value
 * nobody read back except as a table row's first column. "Door device 2"
 * reads exactly as well as whatever a rushed bouncer would've typed at 11pm,
 * and numbering off the *current* roster (not a running counter) means a
 * relabel/unpair never produces a duplicate-looking "Door device 2" twice.
 */
function nextDeviceLabel(devices: DeviceRecord[] | undefined, kind: 'door' | 'bar'): string {
  const n = (devices ?? []).filter((d) => d.kind === kind).length + 1;
  return `${kind === 'door' ? 'Door' : 'Bar'} device ${n}`;
}

/**
 * `2d` — staff device pairing. `POST /devices/pair` (ticketing-service) is
 * real and returns a device + a bearer token. This is the *remote* pairing
 * path — the token shown below is meant to be copied onto a staff phone
 * that pastes it into jfc-host-app's `(host)/pair-device.tsx` ("Or, paste a
 * pairing token from the desk"), which resolves its own kind/label via
 * `GET /devices/me` and never needs to sign in as the host itself. host-app
 * also offers the opposite path — self-pairing while already signed in on
 * that phone — for a host handing over their own device instead.
 *
 * The list below is the real, durable roster (`GET /devices`) — not a
 * session-local one anymore. Unpairing from here works without physical
 * access to the device (unlike host-app's own unpair, which runs from the
 * paired device itself): this call is host-authenticated, the same as
 * pairing, so it's the way to revoke a lost or stolen staff phone.
 *
 * A third path onto a device sits below the direct-pair form: `POST
 * /hosts/me/invites` mints a shareable `/invite/:token` link instead of a
 * raw token to copy-paste — the host sends the link itself (WhatsApp, SMS,
 * whatever), and the staff member's own phone never needs to be handed a
 * token string directly. Same underlying device-pairing call either way.
 *
 * The design-audit's own open question on this page vs `2m`: this is the
 * real functional match for that frame (a roster + pairing page), not
 * host-app's `2d`. "Can do" is real (matches ticketing-service's own
 * requireActiveDevice(kind) gating exactly). `2m`'s "Permission matrix"
 * button and "Offline key bundle" panel are deliberately absent — there's
 * no capability model finer than door/bar (a device IS its kind, not a set
 * of assignable permissions) and no offline-key distribution mechanism
 * anywhere in this codebase; adding UI for either would promise something
 * that doesn't exist yet.
 */
export default function DevicesPage() {
  const toast = useToast();
  const pairDevice = useSetAtom(pairDeviceAtom);
  const unpairDevice = useSetAtom(unpairDeviceAtom);
  const refreshDevices = useSetAtom(devicesAtom);
  const createInvite = useSetAtom(createStaffInviteAtom);
  const loadable = useAtomValue(devicesLoadable);
  useToastOnError(loadable, 'Could not load paired devices.');

  const [kind, setKind] = useState<'door' | 'bar'>('door');
  const [pairing, setPairing] = useState(false);
  const [lastToken, setLastToken] = useState<{ deviceId: string; token: string } | null>(null);

  const [inviteKind, setInviteKind] = useState<'door' | 'bar'>('door');
  const [inviting, setInviting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const knownDevices = loadable.state === 'hasData' ? loadable.data : undefined;

  const [unpairTarget, setUnpairTarget] = useState<DeviceRecord | null>(null);
  const [pin, setPin] = useState('');
  const [unpairing, setUnpairing] = useState(false);
  const [unpairError, setUnpairError] = useState('');

  async function handlePair() {
    if (pairing) return;
    setPairing(true);
    try {
      const result = await pairDevice({ label: nextDeviceLabel(knownDevices, kind), kind });
      setLastToken({ deviceId: result.device.id, token: result.deviceToken });
      refreshDevices();
    } catch (err) {
      showApiError(toast, err, 'Could not pair that device.');
    } finally {
      setPairing(false);
    }
  }

  async function handleCreateInvite() {
    if (inviting) return;
    setInviting(true);
    try {
      const invite = await createInvite({ label: nextDeviceLabel(knownDevices, inviteKind), kind: inviteKind });
      setLastInviteLink(`${window.location.origin}/invite/${invite.token}`);
    } catch (err) {
      showApiError(toast, err, 'Could not create that invite.');
    } finally {
      setInviting(false);
    }
  }

  function openUnpair(device: DeviceRecord) {
    setUnpairTarget(device);
    setPin('');
    setUnpairError('');
  }

  async function confirmUnpair() {
    if (!unpairTarget || unpairing) return;
    setUnpairing(true);
    setUnpairError('');
    try {
      await unpairDevice({ id: unpairTarget.id, pin: pin.trim() || undefined });
      toast.show(`${unpairTarget.label} unpaired.`, { tone: 'positive' });
      setUnpairTarget(null);
      refreshDevices();
    } catch (err) {
      setUnpairError(showApiError.messageFor(err, 'Could not unpair that device.'));
    } finally {
      setUnpairing(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Staff devices" subtitle="Pair a phone for the door or the bar." />

      <Panel pad style={{ maxWidth: 420 }}>
        <span className="text text-title" style={{ fontWeight: 500 }}>Pair a device that's in the room</span>
        <p className="text text-caption tone-secondary" style={{ marginTop: 4, marginBottom: 10 }}>
          Pick what it'll do, then hand the staff phone over and have them scan the code that appears below.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant={kind === 'door' ? 'primary' : 'outline'} size="sm" onClick={() => setKind('door')}>Door</Button>
          <Button variant={kind === 'bar' ? 'primary' : 'outline'} size="sm" onClick={() => setKind('bar')}>Bar</Button>
        </div>
        <Button variant="primary" disabled={pairing} onClick={handlePair} style={{ marginTop: 12 }}>{pairing ? 'Pairing…' : 'Pair device'}</Button>
      </Panel>

      {lastToken ? (
        <Panel variant="tint" pad style={{ maxWidth: 420, marginTop: 16 }}>
          <span className="text text-title" style={{ fontWeight: 500 }}>Scan this on the staff phone</span>
          <p className="text text-caption tone-secondary" style={{ marginTop: 4, marginBottom: 12 }}>
            Open the Punch Munkey Host app on that phone, tap "Pair this device" → "Scan a QR code", and point it at this.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: 16, borderRadius: 12 }}>
            <QRCodeSVG value={lastToken.token} size={220} />
          </div>
          <details style={{ marginTop: 12 }}>
            <summary className="text text-caption tone-secondary" style={{ cursor: 'pointer' }}>No camera on that phone? Enter the token by hand instead</summary>
            <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all', marginTop: 8 }}>{lastToken.token}</div>
          </details>
          <p className="text text-caption tone-secondary" style={{ marginTop: 10, marginBottom: 0 }}>Shown once — it isn't stored anywhere you can come back to. Pair again if it's lost.</p>
        </Panel>
      ) : null}

      <Panel pad style={{ maxWidth: 420, marginTop: 16 }}>
        <span className="text text-title" style={{ fontWeight: 500 }}>Or, send an invite link</span>
        <p className="text text-caption tone-secondary" style={{ marginTop: 4, marginBottom: 10 }}>
          For a staff member who isn't in front of you right now — send this instead of pairing in person. Valid 24 hours, one-time use.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant={inviteKind === 'door' ? 'primary' : 'outline'} size="sm" onClick={() => setInviteKind('door')}>Door</Button>
          <Button variant={inviteKind === 'bar' ? 'primary' : 'outline'} size="sm" onClick={() => setInviteKind('bar')}>Bar</Button>
        </div>
        <Button variant="primary" disabled={inviting} onClick={handleCreateInvite} style={{ marginTop: 12 }}>
          {inviting ? 'Creating…' : 'Create invite link'}
        </Button>
      </Panel>

      {lastInviteLink ? (
        <Panel variant="tint" pad style={{ maxWidth: 420, marginTop: 16 }}>
          <span className="text text-title" style={{ fontWeight: 500 }}>Send this link to your staff member</span>
          <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all', marginTop: 8 }}>{lastInviteLink}</div>
          <p className="text text-caption tone-secondary" style={{ marginTop: 6, marginBottom: 0 }}>
            Expires in 24 hours and works once. Opening it and accepting shows the staff member a pairing token to enter in the host app — same as the token above, just delivered as a link.
          </p>
        </Panel>
      ) : null}

      <div style={{ marginTop: 16 }}>
        {loadable.state === 'hasData' && loadable.data.length === 0 ? (
          <EmptyState icon="calendar" title="No devices paired" body="Devices you pair above will list here, and stay listed after you leave this page." />
        ) : (
          <Panel>
            <DataTable<DeviceRecord>
              loading={loadable.state === 'loading'}
              columns={[
                { key: 'label', header: 'Device', width: '2fr', sortable: true, accessor: (d) => d.label, render: (d) => <span style={{ fontWeight: 500 }}>{d.label}</span> },
                { key: 'kind', header: 'Entry point', width: '1fr', sortable: true, accessor: (d) => d.kind, render: (d) => <span style={{ textTransform: 'capitalize' }}>{d.kind}</span> },
                {
                  key: 'canDo',
                  header: 'Can do',
                  width: '1.6fr',
                  render: (d) => (
                    <span className="text text-caption tone-secondary">
                      {d.kind === 'door' ? 'Scan/admit passes, manual admit by handle' : 'Scan QR for food, bar & smoke redemption'}
                    </span>
                  ),
                },
                { key: 'pairedAt', header: 'Paired', width: '1.2fr', sortable: true, accessor: (d) => d.pairedAt, render: (d) => new Date(d.pairedAt).toLocaleDateString('en-IN') },
                { key: 'status', header: 'Status', width: '1fr', render: () => <Chip tone="positive">paired</Chip> },
                { key: 'actions', header: '', width: '1fr', align: 'right', render: (d) => <Button variant="outline-danger" size="sm" onClick={() => openUnpair(d)}>Unpair</Button> },
              ]}
              rows={loadable.state === 'hasData' ? loadable.data : []}
              rowKey={(d) => d.id}
              searchable
              searchPlaceholder="Search devices…"
              emptyMessage="No devices paired."
            />
          </Panel>
        )}
      </div>

      <ConfirmModal
        open={unpairTarget !== null}
        title={`Unpair ${unpairTarget?.label ?? 'this device'}?`}
        body="This ends its door/bar access immediately. If you've set an unpair PIN, enter it below — leave it blank if you haven't set one."
        confirmLabel={unpairing ? 'Unpairing…' : 'Unpair'}
        danger
        confirmDisabled={unpairing}
        onCancel={() => (unpairing ? null : setUnpairTarget(null))}
        onConfirm={confirmUnpair}
      >
        <TextField
          label="Unpair PIN (if set)"
          type="password"
          inputMode="numeric"
          placeholder="4-6 digits"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        />
        {unpairError ? <span className="text text-caption" style={{ color: 'var(--danger-text)' }}>{unpairError}</span> : null}
      </ConfirmModal>
    </Page>
  );
}
