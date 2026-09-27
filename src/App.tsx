import { Suspense, lazy, useEffect } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { Skeleton } from '@punch-munkey/ui-web';
import { bootstrapSessionAtom, sessionAtom } from './lib/atoms';
import Layout from './components/Layout';
import HostLandingPage from './pages/HostLandingPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import VerifyPendingPage from './pages/VerifyPendingPage';
import InviteAcceptPage from './pages/InviteAcceptPage';
import SessionExpiredPage from './pages/SessionExpiredPage';
import NotFoundPage from './pages/NotFoundPage';

/** Suspense fallback for a lazy page chunk — mirrors punch-munkey-admin-portal/
 * punch-munkey-support-portal's identical helper. */
function PageFallback() {
  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton height={28} width={240} radius={8} />
      <Skeleton height={120} radius={16} />
      <Skeleton height={120} radius={16} />
    </div>
  );
}

function lazyElement(Component: ComponentType): ReactNode {
  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

// Every authenticated page lazy-loaded — same reasoning as the other two
// portals' App.tsx. The public onboarding pages (landing, sign-in, sign-up,
// verify-pending, invite-accept) stay static: they're the unauthenticated
// critical path, where a lazy chunk fetch would just add a waterfall.
const EventsIndexPage = lazy(() => import('./pages/EventsIndexPage'));
const GuestLookupPage = lazy(() => import('./pages/GuestLookupPage'));
const RequestsPage = lazy(() => import('./pages/RequestsPage'));
const WizardBasicsPage = lazy(() => import('./pages/wizard/WizardBasicsPage'));
const WizardLocationPage = lazy(() => import('./pages/wizard/WizardLocationPage'));
const WizardMenuPage = lazy(() => import('./pages/wizard/WizardMenuPage'));
const WizardStaffPage = lazy(() => import('./pages/wizard/WizardStaffPage'));
const WizardReviewPage = lazy(() => import('./pages/wizard/WizardReviewPage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const EventCancelPage = lazy(() => import('./pages/EventCancelPage'));
const PayoutsPage = lazy(() => import('./pages/PayoutsPage'));
const PayoutAccountPage = lazy(() => import('./pages/PayoutAccountPage'));
const DisputesPage = lazy(() => import('./pages/DisputesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const RatingsPage = lazy(() => import('./pages/RatingsPage'));
const PromotersPage = lazy(() => import('./pages/PromotersPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const InventoryItemDetailPage = lazy(() => import('./pages/InventoryItemDetailPage'));
const ProcurementPage = lazy(() => import('./pages/ProcurementPage'));
const InvoicePage = lazy(() => import('./pages/InvoicePage'));
const AccountingPage = lazy(() => import('./pages/AccountingPage'));

// While `isRestoring` is true, lib/atoms.ts's GET /hosts/me (against a
// stored bearer token) hasn't resolved yet — same reasoning as the other
// two portals' identical guard, now backed by sessionAtom instead of
// AuthContext.
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isRestoring, expiredFromIdle } = useAtomValue(sessionAtom);
  if (isRestoring) return null;
  if (!user) return <Navigate to={expiredFromIdle ? '/session-expired' : '/sign-in'} replace />;
  return <>{children}</>;
}

// Sign-in/sign-up redirect a still-signed-in host straight to their events
// index rather than re-showing onboarding. The landing page itself (`/`)
// stays reachable either way — a marketing page, not a gate.
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, isRestoring } = useAtomValue(sessionAtom);
  if (isRestoring) return null;
  if (user) return <Navigate to="/events" replace />;
  return <>{children}</>;
}

// Inventory (food/bar/smoke stock + billing) assumes kitchen/bar/smoke
// staff to track — real for a company running a venue, not for an
// individual host working their own single set alone. Redirects rather
// than 404s: an individual host typing /inventory from muscle memory
// (or an old bookmark from before they were ever gated) lands somewhere
// real, not a dead end.
function RequireOrganisation({ children }: { children: ReactNode }) {
  const { user } = useAtomValue(sessionAtom);
  if (user?.entityType !== 'organisation') return <Navigate to="/events" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HostLandingPage />} />
      <Route path="/sign-in" element={<PublicOnlyRoute><SignInPage /></PublicOnlyRoute>} />
      <Route path="/sign-up" element={<PublicOnlyRoute><SignUpPage /></PublicOnlyRoute>} />
      <Route path="/verify-pending" element={<VerifyPendingPage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="/session-expired" element={<SessionExpiredPage />} />

      {/* Pathless layout route — RequireAuth + Layout wrap every child
          below without claiming "/" themselves, since HostLandingPage
          already owns that exact path (a bare `path="/"` here would
          collide with it rather than nest under it). */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="events" element={lazyElement(EventsIndexPage)} />
        <Route path="events/new/basics" element={lazyElement(WizardBasicsPage)} />
        <Route path="events/new/location" element={lazyElement(WizardLocationPage)} />
        <Route path="events/new/menu" element={lazyElement(WizardMenuPage)} />
        <Route path="events/new/staff" element={lazyElement(WizardStaffPage)} />
        <Route path="events/new/review" element={lazyElement(WizardReviewPage)} />
        <Route path="events/:id" element={lazyElement(EventDetailPage)} />
        <Route path="events/:id/cancel" element={lazyElement(EventCancelPage)} />
        <Route path="guest-lookup" element={lazyElement(GuestLookupPage)} />
        <Route path="requests" element={lazyElement(RequestsPage)} />
        <Route path="payouts" element={lazyElement(PayoutsPage)} />
        <Route path="payout-account" element={lazyElement(PayoutAccountPage)} />
        <Route path="disputes" element={lazyElement(DisputesPage)} />
        <Route path="reports" element={lazyElement(ReportsPage)} />
        <Route path="ratings" element={lazyElement(RatingsPage)} />
        <Route path="promoters" element={lazyElement(PromotersPage)} />
        <Route path="notifications" element={lazyElement(NotificationsPage)} />
        <Route path="support" element={lazyElement(SupportPage)} />
        <Route path="devices" element={lazyElement(DevicesPage)} />
        <Route path="inventory" element={<RequireOrganisation>{lazyElement(InventoryPage)}</RequireOrganisation>} />
        <Route path="inventory/items/:id" element={<RequireOrganisation>{lazyElement(InventoryItemDetailPage)}</RequireOrganisation>} />
        <Route path="procurement" element={<RequireOrganisation>{lazyElement(ProcurementPage)}</RequireOrganisation>} />
        <Route path="invoice" element={<RequireOrganisation>{lazyElement(InvoicePage)}</RequireOrganisation>} />
        <Route path="accounting" element={<RequireOrganisation>{lazyElement(AccountingPage)}</RequireOrganisation>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const bootstrap = useSetAtom(bootstrapSessionAtom);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return <AppRoutes />;
}
