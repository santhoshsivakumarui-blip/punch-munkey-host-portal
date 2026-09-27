import { useNavigate } from 'react-router-dom';
import { EmptyState, Page } from '@punch-munkey/ui-web';

// `5h` — 404, shared pattern with Admin/Support.
export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Page style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        icon="alert"
        title="That page doesn't exist"
        body="The link might be old, or the event may have moved."
        actionLabel="Back to Events"
        onAction={() => navigate('/events')}
      />
    </Page>
  );
}
