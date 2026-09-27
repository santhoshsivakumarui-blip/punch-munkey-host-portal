import { useCallback, useEffect, useState } from 'react';
import { Page, PageHeader, Panel, Button, EmptyState, Skeleton, Chip, MessageBubble, useToast } from '@jfc/ui-web';
import { api, paths } from '../lib/api';
import { showApiError } from '../lib/toastError';

/**
 * Host ↔ support conversation (04-api-surface.md: GET/POST /hosts/me/tickets).
 * Backed by compliance-service's `/me/support/*`, the same "single continuous
 * support conversation" guests use: it already accepts host accounts and
 * files host tickets under the support team's host queue (audience 'host').
 * The first message opens a ticket; later ones append to it until support
 * resolves it. Support's internal notes are never returned here.
 */

interface SupportTicket {
  id: string;
  subject: string;
  state: string;
  slaDueAt: string | null;
}

interface SupportMessage {
  id: string;
  direction: 'incoming' | 'outgoing';
  body: string;
  createdAt: string;
}

const MAX_LENGTH = 2000;

export default function SupportPage() {
  const toast = useToast();
  const [thread, setThread] = useState<{ ticket: SupportTicket | null; messages: SupportMessage[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ ticket: SupportTicket | null; messages: SupportMessage[] }>(paths.meSupportThread)
      .then(setThread)
      .catch((err) => {
        setThread({ ticket: null, messages: [] });
        showApiError(toast, err, 'Could not load your support conversation.');
      });
  }, [toast]);

  useEffect(() => {
    load();
    // Replies from support arrive without a push to this page; refresh while open.
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api.post(paths.meSupportMessages, { body });
      setDraft('');
      load();
    } catch (err) {
      showApiError(toast, err, 'Could not send your message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Support" subtitle="Message the platform support team. We reply within 24 hours; SOS on the night always goes to the live team first." />

      <Panel pad style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
        {thread === null ? (
          <Skeleton height={120} />
        ) : thread.messages.length === 0 ? (
          <EmptyState icon="heart" title="No open conversation" body="Ask about payouts, a dispute, verification, or anything else. Your first message opens a ticket." />
        ) : (
          <>
            {thread.ticket ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="text text-body-s" style={{ fontWeight: 500 }}>{thread.ticket.subject}</span>
                <Chip tone={thread.ticket.state === 'pending' ? 'warning' : 'dark'}>{thread.ticket.state}</Chip>
              </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {thread.messages.map((m) => (
                // "incoming" to support is the host's own message: shown on the right.
                <MessageBubble key={m.id} direction={m.direction === 'incoming' ? 'outgoing' : 'incoming'} text={m.body} />
              ))}
            </div>
          </>
        )}

        <label className="text text-body-s" htmlFor="support-message" style={{ fontWeight: 500 }}>
          {thread?.ticket ? 'Reply' : 'New message'}
        </label>
        <textarea
          id="support-message"
          className="textarea"
          rows={4}
          maxLength={MAX_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What do you need help with?"
          style={{ width: '100%', padding: 12, borderRadius: 14, border: '1px solid var(--paper-border)', font: 'inherit', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text text-caption tone-secondary">{draft.length}/{MAX_LENGTH}</span>
          <Button variant="primary" onClick={() => void send()} disabled={sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Panel>
    </Page>
  );
}
