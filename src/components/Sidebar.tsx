import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from '@punch-munkey/ui-web';
import type { IconName } from '@punch-munkey/ui-web';

interface LeafItem {
  type: 'leaf';
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

interface BranchItem {
  type: 'branch';
  key: string;
  label: string;
  icon: IconName;
  children: { to: string; label: string }[];
}

type TreeItem = LeafItem | BranchItem;

// Requests (`7g` transfers + `1h` screening) share one nav item in the
// actual design — both mockups highlight the same "Requests" sidebar entry
// with a pending-count badge, despite 06/07's docs having briefly
// mis-sorted `1h` as a native tab in an earlier pass here; the frame
// width (1180px, not 390px) settled it — see punch-munkey-host-app/README.md.
//
// "Payouts" and "Business ops" are branches, not leaves — the tree
// structure this replaces a flat link list with groups genuinely related
// destinations under one parent, instead of the two-navs-for-the-same-
// pages problem the previous flat "Business ops" single-link fix (with a
// separate BusinessSubNav tab bar on each page) was already working
// around. Now the tree itself is the one place that relationship shows up.
const BASE_TREE: TreeItem[] = [
  { type: 'leaf', to: '/events', label: 'Events', icon: 'calendar', end: true },
  { type: 'leaf', to: '/guest-lookup', label: 'Guest lookup', icon: 'search' },
  { type: 'leaf', to: '/requests', label: 'Requests', icon: 'check' },
  {
    type: 'branch',
    key: 'payouts',
    label: 'Payouts',
    icon: 'tag',
    children: [
      { to: '/payouts', label: 'Payouts & escrow' },
      { to: '/payout-account', label: 'Payout account' },
    ],
  },
  { type: 'leaf', to: '/disputes', label: 'Disputes', icon: 'shield' },
  { type: 'leaf', to: '/reports', label: 'Reports', icon: 'alert' },
  { type: 'leaf', to: '/ratings', label: 'Ratings', icon: 'star' },
  { type: 'leaf', to: '/promoters', label: 'Promoters', icon: 'person' },
  { type: 'leaf', to: '/notifications', label: 'Notifications', icon: 'bell' },
  { type: 'leaf', to: '/support', label: 'Support', icon: 'heart' },
  { type: 'leaf', to: '/devices', label: 'Devices', icon: 'lock' },
];

// Kitchen/bar/smoke inventory assumes staff running those counters for
// you — real for an organisation, not an individual host working their
// own set alone (see App.tsx's RequireOrganisation, which this mirrors so
// the tree and the routes it points to agree on who sees it).
const ORGANISATION_BRANCH: BranchItem = {
  type: 'branch',
  key: 'business-ops',
  label: 'Business ops',
  icon: 'home',
  children: [
    { to: '/inventory', label: 'Inventory' },
    { to: '/procurement', label: 'Procurement' },
    { to: '/invoice', label: 'Invoice' },
    { to: '/accounting', label: 'Accounting' },
  ],
};

function isChildActive(item: BranchItem, pathname: string): boolean {
  return item.children.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`));
}

export function Sidebar({ isOrganisation }: { isOrganisation: boolean }) {
  const location = useLocation();
  const tree = isOrganisation ? [...BASE_TREE, ORGANISATION_BRANCH] : BASE_TREE;

  // Auto-expands whichever branch the current route is inside, without
  // ever auto-collapsing one the host opened themselves — landing on
  // /accounting directly (a bookmark, a search result) should show it
  // already expanded in the tree, not force a manual click to reveal
  // where you already are.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of tree) {
      if (item.type === 'branch' && isChildActive(item, location.pathname)) initial.add(item.key);
    }
    return initial;
  });

  useEffect(() => {
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const item of tree) {
        if (item.type === 'branch' && isChildActive(item, location.pathname) && !next.has(item.key)) {
          next.add(item.key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // `isOrganisation` matters too, not just the path: `tree` (and so
    // whether the "Business ops" branch even exists to check) depends on
    // it, and session data loads asynchronously after mount — a org host
    // landing straight on /inventory before their session finishes loading
    // would otherwise never get that branch auto-expanded once it appears,
    // since the path itself never changes once it's already there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isOrganisation]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <nav className="sidebar-tree" aria-label="Main navigation">
      {tree.map((item) =>
        item.type === 'leaf' ? (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
            <Icon name={item.icon} size={15} />
            <span>{item.label}</span>
          </NavLink>
        ) : (
          <div key={item.key} className="sidebar-branch">
            <button
              type="button"
              className={`sidebar-item sidebar-branch-toggle${isChildActive(item, location.pathname) ? ' active' : ''}`}
              onClick={() => toggle(item.key)}
              aria-expanded={expanded.has(item.key)}
            >
              <Icon name={item.icon} size={15} />
              <span style={{ flex: 1 }}>{item.label}</span>
              <Icon name={expanded.has(item.key) ? 'chevron-down' : 'chevron-right'} size={11} color="var(--chrome-text)" />
            </button>
            {expanded.has(item.key) ? (
              <div className="sidebar-branch-children">
                {item.children.map((c) => (
                  <NavLink key={c.to} to={c.to} className={({ isActive }) => `sidebar-item sidebar-item-child${isActive ? ' active' : ''}`}>
                    {c.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        ),
      )}
    </nav>
  );
}
