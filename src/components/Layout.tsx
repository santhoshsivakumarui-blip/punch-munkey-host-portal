import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { Chip, Icon, Footer, Popover, ConfirmModal, useToast } from '@jfc/ui-web';
import { sessionAtom, signOutAtom } from '../lib/atoms';
import { Sidebar } from './Sidebar';
import { useHostSearch } from '../hooks/useHostSearch';
import { HostSearchModal } from './HostSearchModal';

const KYH_TONE: Record<string, 'positive' | 'warning' | 'critical'> = {
  verified: 'positive',
  submitted: 'warning',
  rejected: 'critical',
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Remembered per browser, not per session — a host who collapses the
// sidebar on a small laptop screen shouldn't have to redo it every sign-in.
// Wrapped in try/catch: a private-browsing tab or a blocked storage
// permission should degrade to "always defaults open," not break the page.
const SIDEBAR_OPEN_KEY = 'jfc-host-portal.sidebar-open';

function loadSidebarOpen(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/**
 * A left sidebar (tree-structured — see Sidebar.tsx) replacing the old
 * top-bar `PortalShell` nav entirely for this portal: every menu item that
 * used to live in the horizontal `chrome-nav` now lives in the tree, and
 * the top bar that's left holds only the one thing that doesn't belong in
 * a nav tree — search — plus the KYH/account chrome that was already
 * there. Deliberately not a change to `PortalShell` itself (still used
 * as-is by jfc-admin-portal/jfc-support-portal) — this is a new,
 * host-portal-only shell built from the same design tokens.
 *
 * The sidebar itself slides open/closed (CSS `transform`, see styles.css'
 * `.sidebar.closed`) rather than just disappearing — a toggle in the top
 * bar controls it, always reachable regardless of collapsed state.
 *
 * The avatar used to sign out on a single click, no confirmation — a
 * mis-click cost nothing before (a 15-minute token, easy to just sign back
 * in), but now signs out for real, everywhere, with a 30-day token behind
 * it (see identity-service's HOST_ACCESS_TOKEN_TTL) — so it's a Popover
 * menu now, and the sign-out action inside it confirms first.
 */
export default function Layout() {
  const { user } = useAtomValue(sessionAtom);
  const signOut = useSetAtom(signOutAtom);
  const toast = useToast();
  const search = useHostSearch();
  const [sidebarOpen, setSidebarOpen] = useState(loadSidebarOpen);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(sidebarOpen));
    } catch {
      /* private browsing / storage blocked — nothing to persist, nothing to break either */
    }
  }, [sidebarOpen]);

  async function confirmSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { everywhereConfirmed } = await signOut();
      if (!everywhereConfirmed) {
        toast.show("Signed out here, but couldn't confirm other devices — check your connection.", { tone: 'warning' });
      }
    } finally {
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? '' : ' closed'}`} aria-hidden={!sidebarOpen}>
        <div className="brand" style={{ padding: '0 20px', height: 64, flex: 'none' }}>
          <span className="brand-mark" style={{ background: 'var(--sage-base)' }} />
          <span className="brand-name">Punch Munkey · Host</span>
        </div>
        <Sidebar isOrganisation={user?.entityType === 'organisation'} />
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-expanded={sidebarOpen}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Icon name={sidebarOpen ? 'chevron-left' : 'chevron-right'} size={14} />
            </button>
            <button type="button" className="chrome-search on-paper" style={{ textAlign: 'left', gap: 8 }} onClick={() => search.setOpen(true)}>
              <Icon name="search" size={14} color="var(--text-muted)" />
              Search this account · ⌘K
            </button>
          </div>
          <div className="topbar-right">
            {user ? <Chip tone={KYH_TONE[user.kyhState] ?? 'muted'}>{user.kyhState.replace('_', ' ')}</Chip> : null}
            {user ? (
              <Popover
                open={accountMenuOpen}
                onClose={() => setAccountMenuOpen(false)}
                align="right"
                trigger={
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((v) => !v)}
                    title={user.displayName}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <span className="avatar">{initialsFor(user.displayName)}</span>
                  </button>
                }
              >
                <div style={{ minWidth: 190, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ padding: '4px 6px 8px', borderBottom: '1px solid rgba(32,30,29,.08)', marginBottom: 4 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{user.displayName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{user.legalEntity}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setConfirmingSignOut(true);
                    }}
                    style={{ textAlign: 'left', padding: '8px 6px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, font: '400 12.5px var(--font-body)', color: 'var(--danger-text)' }}
                  >
                    Sign out
                  </button>
                </div>
              </Popover>
            ) : null}
          </div>
        </header>
        <main className="app-content">
          <Outlet />
          <Footer />
        </main>
      </div>

      <HostSearchModal search={search} />

      <ConfirmModal
        open={confirmingSignOut}
        title="Sign out everywhere?"
        body="This ends your session on this portal AND every paired door/bar device at once — all of them will need to sign in (or be re-paired) again before they can be used tonight."
        confirmLabel={signingOut ? 'Signing out…' : 'Sign out everywhere'}
        danger
        confirmDisabled={signingOut}
        onCancel={() => (signingOut ? null : setConfirmingSignOut(false))}
        onConfirm={confirmSignOut}
      />
    </div>
  );
}
