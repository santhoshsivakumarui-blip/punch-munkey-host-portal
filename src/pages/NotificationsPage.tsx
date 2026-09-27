import { useAtomValue, useSetAtom } from 'jotai';
import { Page, PageHeader, Panel, Chip, EmptyState, Skeleton, useToast } from '@punch-munkey/ui-web';
import type { ChipTone } from '@punch-munkey/ui-web';
import { markNotificationReadAtom, notificationsAtom, notificationsLoadable } from '../lib/atoms';
import { showApiError, useToastOnError } from '../lib/toastError';
import type { NotificationItem } from '../lib/types';

const CATEGORY_TONE: Record<NotificationItem['category'], ChipTone> = {
  safety: 'critical',
  entry: 'accent',
  money: 'positive',
  event: 'warning',
  social: 'muted',
  marketing: 'muted',
};

// `6c` — notifications. `GET /me/notifications` (notification-service,
// shared across roles — same route the guest app calls) + a per-id
// `POST .../read`.
export default function NotificationsPage() {
  const toast = useToast();
  const loadable = useAtomValue(notificationsLoadable);
  useToastOnError(loadable, 'Could not load notifications.');
  const refresh = useSetAtom(notificationsAtom);
  const markRead = useSetAtom(markNotificationReadAtom);

  async function handleOpen(n: NotificationItem) {
    if (n.readAt) return;
    try {
      await markRead(n.id);
      refresh();
    } catch (err) {
      showApiError(toast, err, 'Could not mark that as read.');
    }
  }

  if (loadable.state === 'loading') {
    return (
      <Page>
        <PageHeader title="Notifications" />
        <Skeleton height={60} radius={16} />
        <Skeleton height={60} radius={16} />
      </Page>
    );
  }

  if (loadable.state === 'hasError') {
    return (
      <Page>
        <PageHeader title="Notifications" />
        <EmptyState icon="alert" title="Couldn't load notifications" body="Check your connection and reload." />
      </Page>
    );
  }

  const notifications = loadable.data;

  return (
    <Page>
      <PageHeader title="Notifications" />
      {notifications.length === 0 ? (
        <EmptyState icon="calendar" title="No notifications" body="Anything about your nights, payouts, or account shows up here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => (
            <div key={n.id} onClick={() => handleOpen(n)} style={{ cursor: n.readAt ? 'default' : 'pointer' }}>
              <Panel pad style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: n.readAt ? 0.65 : 1 }}>
                <Chip tone={CATEGORY_TONE[n.category]}>{n.category}</Chip>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: n.readAt ? 400 : 500 }}>{n.title}</div>
                  <div className="text text-caption tone-secondary">{n.body}</div>
                </div>
                <span className="text text-caption tone-secondary">{new Date(n.createdAt).toLocaleDateString('en-IN')}</span>
              </Panel>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
