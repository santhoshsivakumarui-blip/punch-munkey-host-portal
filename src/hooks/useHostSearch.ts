import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { disputesLoadable, reportsLoadable, promotersLoadable, devicesLoadable } from '../lib/atoms';
import { formatINR } from '../lib/format';
import { api, paths } from '../lib/api';
import type { EventRecord } from '../lib/types';
import type { ChipTone } from '@jfc/ui-web';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  badge: { label: string; tone: ChipTone } | null;
  href: string;
}

export interface SearchResultGroup {
  key: string;
  label: string;
  items: SearchResultItem[];
}

interface PassSearchResult {
  id: string;
  code: string;
  eventId: string;
  eventTitle: string;
  holderHandle: string;
  holderPhoneMasked: string | null;
  state: string;
  purchasedAt: string;
}

const MAX_PER_GROUP = 5;

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  return fields.some((f) => f && f.toLowerCase().includes(query));
}

function eventToItem(e: EventRecord): SearchResultItem {
  return {
    id: `event-${e.id}`,
    title: e.title,
    subtitle: `${e.code} · ${new Date(e.doorsAt).toLocaleDateString('en-IN')}`,
    badge: { label: e.state.replace('_', ' '), tone: (e.state === 'on_sale' || e.state === 'doors_open' ? 'positive' : 'muted') as ChipTone },
    href: `/events/${e.id}`,
  };
}

const PASS_STATE_TONE: Record<string, ChipTone> = { valid: 'positive', scanned: 'positive', void: 'critical', refunded: 'critical' };

function passToItem(p: PassSearchResult): SearchResultItem {
  return {
    id: `pass-${p.id}`,
    title: p.holderHandle || 'Unnamed guest',
    subtitle: `${p.code} · ${p.eventTitle}`,
    badge: { label: p.state.replace('_', ' '), tone: PASS_STATE_TONE[p.state] ?? 'muted' },
    href: `/events/${p.eventId}`,
  };
}

/**
 * The ⌘K command palette's data side. Two shapes live side by side here:
 * `events`/`passes` are Elasticsearch-backed, debounced server searches
 * (same admin-portal `useGlobalSearch` shape this codebase already has —
 * fan out, merge, cap at MAX_PER_GROUP) since a host's full event/pass
 * history is real backend data, not something already sitting in a loaded
 * atom. `disputes`/`reports`/`promoters`/`devices` stay client-side,
 * filtering only what this host session already has loaded — there's no ES
 * index for any of those (out of scope for this pass: this portal's own
 * per-host volume of disputes/reports/promoters/devices is small enough
 * that a local filter is already instant, and building a search index for
 * data nobody's found slow to filter isn't worth the added indexing
 * surface). A host can only ever find their OWN data through any of this,
 * by construction — same scoping guarantee the previous all-client version
 * had, just now true of the server-backed groups via `hostId` filters on
 * the backend rather than "never fetched cross-host data at all."
 */
export function useHostSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const disputesL = useAtomValue(disputesLoadable);
  const reportsL = useAtomValue(reportsLoadable);
  const promotersL = useAtomValue(promotersLoadable);
  const devicesL = useAtomValue(devicesLoadable);

  const [eventItems, setEventItems] = useState<SearchResultItem[]>([]);
  const [passItems, setPassItems] = useState<SearchResultItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) {
      setEventItems([]);
      setPassItems([]);
      setRemoteLoading(false);
      return;
    }
    let cancelled = false;
    setRemoteLoading(true);
    const timer = setTimeout(() => {
      Promise.all([
        api.get<{ data: EventRecord[] }>(paths.hostsMeEventsSearch(term)).catch(() => ({ data: [] as EventRecord[] })),
        api.get<{ data: PassSearchResult[] }>(paths.hostsMePassesSearch(term)).catch(() => ({ data: [] as PassSearchResult[] })),
      ])
        .then(([eventsRes, passesRes]) => {
          if (cancelled) return;
          setEventItems(eventsRes.data.slice(0, MAX_PER_GROUP).map(eventToItem));
          setPassItems(passesRes.data.slice(0, MAX_PER_GROUP).map(passToItem));
        })
        .finally(() => {
          if (!cancelled) setRemoteLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const groups = useMemo<SearchResultGroup[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];

    const disputeItems: SearchResultItem[] =
      disputesL.state === 'hasData'
        ? disputesL.data
            .filter((d) => matches(term, d.id, d.reasonCode, d.state))
            .slice(0, MAX_PER_GROUP)
            .map((d) => ({
              id: `dispute-${d.id}`,
              title: `Dispute ${d.id.slice(0, 8)}`,
              subtitle: `${d.reasonCode ?? 'No reason on file'} · ${formatINR(d.amountPaise / 100)}`,
              badge: { label: d.state.replace('_', ' '), tone: (d.state === 'won' ? 'positive' : d.state === 'lost' ? 'critical' : 'warning') as ChipTone },
              href: '/disputes',
            }))
        : [];

    const reportItems: SearchResultItem[] =
      reportsL.state === 'hasData'
        ? reportsL.data
            .filter((r) => matches(term, r.category, r.body))
            .slice(0, MAX_PER_GROUP)
            .map((r) => ({
              id: `report-${r.id}`,
              title: `Report · ${r.category}`,
              subtitle: r.body.length > 60 ? `${r.body.slice(0, 60)}…` : r.body,
              badge: r.hostResponse ? { label: 'responded', tone: 'positive' as ChipTone } : { label: 'open', tone: 'warning' as ChipTone },
              href: '/reports',
            }))
        : [];

    const promoterItems: SearchResultItem[] =
      promotersL.state === 'hasData'
        ? promotersL.data
            .filter((p) => matches(term, p.phoneE164, p.id))
            .slice(0, MAX_PER_GROUP)
            .map((p) => ({
              id: `promoter-${p.id}`,
              title: p.phoneE164 ?? `Promoter ${p.id.slice(0, 8)}`,
              subtitle: `${(p.commissionRate * 100).toFixed(0)}% commission`,
              badge: p.active ? { label: 'active', tone: 'positive' as ChipTone } : { label: 'inactive', tone: 'muted' as ChipTone },
              href: '/promoters',
            }))
        : [];

    const deviceItems: SearchResultItem[] =
      devicesL.state === 'hasData'
        ? devicesL.data
            .filter((d) => matches(term, d.label, d.kind))
            .slice(0, MAX_PER_GROUP)
            .map((d) => ({
              id: `device-${d.id}`,
              title: d.label,
              subtitle: `${d.kind} · paired ${new Date(d.pairedAt).toLocaleDateString('en-IN')}`,
              badge: { label: d.kind, tone: 'muted' as ChipTone },
              href: '/devices',
            }))
        : [];

    return [
      { key: 'events', label: 'Events', items: eventItems },
      { key: 'passes', label: 'Guests & passes', items: passItems },
      { key: 'disputes', label: 'Disputes', items: disputeItems },
      { key: 'reports', label: 'Reports', items: reportItems },
      { key: 'promoters', label: 'Promoters', items: promoterItems },
      { key: 'devices', label: 'Devices', items: deviceItems },
    ].filter((g) => g.items.length > 0);
  }, [query, eventItems, passItems, disputesL, reportsL, promotersL, devicesL]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => setActiveIndex(0), [query, groups.length]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function select(item: SearchResultItem) {
    close();
    navigate(item.href);
  }

  function moveActive(delta: number) {
    if (flatItems.length === 0) return;
    setActiveIndex((i) => (i + delta + flatItems.length) % flatItems.length);
  }

  function selectActive() {
    const item = flatItems[activeIndex];
    if (item) select(item);
  }

  return { open, setOpen, query, setQuery, groups, remoteLoading, activeIndex, setActiveIndex, flatItems, close, select, moveActive, selectActive };
}
