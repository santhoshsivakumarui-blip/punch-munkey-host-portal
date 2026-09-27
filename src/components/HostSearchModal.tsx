import type { KeyboardEvent } from 'react';
import { Modal, Icon, Chip } from '@punch-munkey/ui-web';
import type { useHostSearch } from '../hooks/useHostSearch';

/**
 * The ⌘K palette for this host's own data — same shape as admin-portal's
 * GlobalSearchModal. Events and guests/passes are debounced, Elasticsearch-
 * backed server searches now; disputes/reports/promoters/devices stay
 * client-side, filtering only what's already loaded (see useHostSearch's
 * own comment on that split). No "view all results" deep link — unlike
 * admin-portal's `/lookup`, there's no separate full-results page here for
 * a query to expand into.
 */
export function HostSearchModal({ search }: { search: ReturnType<typeof useHostSearch> }) {
  const { open, close, query, setQuery, groups, remoteLoading, activeIndex, setActiveIndex, flatItems, select, moveActive, selectActive } = search;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectActive();
    }
  }

  let runningIndex = -1;

  return (
    <Modal open={open} onClose={close} wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="search" size={17} color="var(--text-secondary)" />
        <input
          autoFocus
          className="field-input"
          style={{ flex: 1, border: 'none', boxShadow: 'none', padding: '4px 0', fontSize: 15 }}
          placeholder="Search your events, guests, passes, disputes, reports, promoters, devices…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search this account"
        />
        <button
          type="button"
          onClick={close}
          aria-label="Close search"
          style={{ display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8, color: 'var(--text-secondary)' }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto', margin: '4px -22px 0', borderTop: '1px solid rgba(32,30,29,.08)' }}>
        {!query.trim() ? (
          <p style={{ margin: 0, padding: '32px 22px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Type an event name, code, or anything else in your account.
          </p>
        ) : flatItems.length === 0 && remoteLoading ? (
          <p style={{ margin: 0, padding: '32px 22px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Searching…
          </p>
        ) : flatItems.length === 0 ? (
          <p style={{ margin: 0, padding: '32px 22px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            No matches for &quot;{query.trim()}&quot;.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <div style={{ padding: '10px 22px 4px', fontSize: 11, fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                {group.label}
              </div>
              {group.items.map((item) => {
                runningIndex += 1;
                const isActive = runningIndex === activeIndex;
                return (
                  <button
                    key={item.id}
                    className={`queue-item${isActive ? ' active' : ''}`}
                    style={{ paddingLeft: 22, paddingRight: 22 }}
                    onClick={() => select(item)}
                    onMouseEnter={() => setActiveIndex(runningIndex)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.title}</span>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{item.subtitle}</div>
                    </div>
                    {item.badge ? <Chip tone={item.badge.tone}>{item.badge.label}</Chip> : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div style={{ margin: '0 -22px -22px', padding: '10px 22px', borderTop: '1px solid rgba(32,30,29,.08)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>↑↓ to navigate · ↵ to open · esc to close</span>
      </div>
    </Modal>
  );
}
