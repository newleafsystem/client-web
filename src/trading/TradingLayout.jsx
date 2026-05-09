import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';
import { useTiles } from './hooks/useTiles';
import { PriceProvider } from './contexts/PriceContext';
import { BrandBar } from '../shared/components/BrandBar';
import { AppAccessDenied, AppAccessGate } from '../shared/components/AppAccessGate';
import { APP_IDS } from '../shared/auth/accessControl';
import { Footer } from './components/Footer';
import { VoiceAssistant } from './components/VoiceAssistant';
import { AIChatDrawer } from './components/AIChatDrawer';
import { InvestPage } from '../marketing/invest/InvestPage';

// Auth-gated pages
import { DashboardPage } from './pages/DashboardPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { PerformancePage } from './pages/PerformancePage';
import { AdminPage } from './pages/AdminPage';
import { AnalysisPage } from './pages/AnalysisPage';

// Phase 2 — new pages
import { StrategyDetailPage } from './pages/StrategyDetailPage';
import { BuildPage } from './pages/BuildPage';
import { PositionsPage } from './pages/PositionsPage';

// Redirect helper for /invest/position/:tileId → /invest/strategy/:tileId
function PositionRedirect() {
  const { tileId } = useParams();
  return <Navigate to={`/invest/strategy/${tileId}`} replace />;
}

export default function TradingLayout() {
  const { user, access, loading: authLoading, signInWithGoogle, signInWithEmail, signUp, signOut } = useAuth();
  const tilesEnabled = Boolean(
    !authLoading &&
    user &&
    (access?.canAccessApp(APP_IDS.INVEST) || access?.canAccessApp(APP_IDS.ADMIN))
  );
  const { tiles, loading: tilesLoading, error } = useTiles({ enabled: tilesEnabled });
  const location = useLocation();

  // AI Chat drawer state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState(null);

  const openChat = useCallback((message = null) => {
    setChatInitialMessage(message);
    setChatOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setChatInitialMessage(null);
  }, []);

  const renderInvestShell = (children, headerProps = {}) => (
    <div style={{ minHeight: '100vh', background: '#F7F5F0' }}>
      <BrandBar
        surface="invest"
        authState={headerProps.authState || (user ? 'in' : 'out')}
        user={headerProps.user ?? user}
        access={headerProps.access ?? access}
        onSignOut={signOut}
        onSignIn={signInWithGoogle}
        onOpenChat={headerProps.onOpenChat}
      />
      {children}
    </div>
  );

  if (authLoading) {
    return renderInvestShell(
      <div className="loading-container">
        <div className="loading-spinner">&#127811;</div>
        <p className="loading-text">Loading NewLeaf System...</p>
      </div>,
      { authState: 'out', user: null }
    );
  }

  // Not logged in → show BrandBar in invest-logged-out mode + InvestPage
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#F7F5F0' }}>
        <BrandBar
          surface="invest"
          authState="out"
          access={access}
          onSignIn={signInWithGoogle}
        />
        <InvestPage
          onSignInWithGoogle={signInWithGoogle}
          onSignInWithEmail={signInWithEmail}
          onSignUp={signUp}
        />
      </div>
    );
  }

  const isAdminRoute = location.pathname.startsWith('/invest/admin');
  const canUseInvest = access?.canAccessApp(APP_IDS.INVEST);
  const canUseAdmin = access?.canAccessApp(APP_IDS.ADMIN);

  if (!canUseInvest && !(isAdminRoute && canUseAdmin)) {
    return renderInvestShell(
      <AppAccessDenied appName="NewLeaf Invest" onSignOut={signOut} />,
      { authState: 'in', user, access }
    );
  }

  if (tilesLoading) {
    return renderInvestShell(
      <div className="loading-container">
        <div className="loading-spinner">&#127811;</div>
        <p className="loading-text">Loading opportunities...</p>
      </div>,
      { authState: 'in', user, onOpenChat: openChat }
    );
  }

  if (error) {
    return renderInvestShell(
      <div className="loading-container">
        <h2 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#dc2626', marginBottom: '1rem' }}>
          Error Loading Tiles
        </h2>
        <p style={{ fontSize: '1.125rem', color: '#111827', marginBottom: '0.5rem' }}>{error}</p>
        <button
          onClick={signOut}
          style={{
            marginTop: '1rem', padding: '0.75rem 1.5rem',
            background: '#15803d', color: '#ffffff', border: 'none',
            borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer'
          }}
        >
          Sign Out
        </button>
      </div>,
      { authState: 'in', user, onOpenChat: openChat }
    );
  }

  return (
    <PriceProvider>
      <div style={{ minHeight: '100vh', background: '#ffffff' }}>
        <BrandBar
          surface="invest"
          authState="in"
          user={user}
          access={access}
          onSignOut={signOut}
          onSignIn={signInWithGoogle}
          onOpenChat={openChat}
        />

        <Routes>
          {/* ═══ Core routes (4-phase IA) ═══ */}
          <Route path="/" element={<DashboardPage user={user} tiles={tiles} onOpenChat={openChat} />} />
          <Route path="/discover" element={<DiscoverPage tiles={tiles} />} />
          <Route path="/strategy/:id" element={<StrategyDetailPage tiles={tiles} />} />
          <Route path="/build" element={<BuildPage tiles={tiles} />} />
          <Route path="/positions" element={<PositionsPage tiles={tiles} />} />
          <Route path="/performance" element={<PerformancePage tiles={tiles} />} />

          {/* ═══ Utility routes ═══ */}
          <Route path="/analysis/:ticker" element={<AnalysisPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route
            path="/admin"
            element={
              <AppAccessGate
                appId={APP_IDS.ADMIN}
                appName="NewLeaf Admin"
                user={user}
                access={access}
                onSignIn={signInWithGoogle}
                onSignOut={signOut}
              >
                <AdminPage />
              </AppAccessGate>
            }
          />

          {/* ═══ Legacy routes — keep working, redirect to new paths ═══ */}
          <Route path="/portfolio" element={<Navigate to="/invest/positions" replace />} />
          <Route path="/position/:tileId" element={<PositionRedirect />} />

          {/* Legacy PositionDetail retired in Phase 6c — all traffic goes to /strategy/:id */}
        </Routes>

        <Footer />
        <VoiceAssistant tiles={tiles} />
        <AIChatDrawer
          isOpen={chatOpen}
          onClose={closeChat}
          tiles={tiles}
          initialMessage={chatInitialMessage}
        />
      </div>
    </PriceProvider>
  );
}
