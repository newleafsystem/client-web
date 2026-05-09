/**
 * WorkbenchLayout — layout shell for React pages under /workbench/*
 *
 * Previously loaded nav-component.html via fetch and injected it.
 * Now uses BrandBar directly. The static workbench HTML pages still
 * load nav-component.html themselves.
 */
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { BrandBar } from './BrandBar';
import { AppAccessGate } from './AppAccessGate';
import { APP_IDS } from '../auth/accessControl';
import { useAuth } from '../hooks/useAuth';
import { Footer } from '../../trading/components/Footer';

export default function WorkbenchLayout() {
  const { user, access, loading, signOut, signInWithGoogle } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff' }}>
      <BrandBar
        surface="workbench"
        authState={user ? 'in' : 'out'}
        user={user}
        access={access}
        onSignOut={signOut}
        onSignIn={signInWithGoogle}
      />
      <AppAccessGate
        appId={APP_IDS.WORKBENCH}
        appName="NewLeaf Workbench"
        user={user}
        access={access}
        loading={loading}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
      >
        <Suspense fallback={<div style={{ minHeight: 400 }} />}>
          <Outlet />
        </Suspense>
      </AppAccessGate>
      <Footer />
    </div>
  );
}
