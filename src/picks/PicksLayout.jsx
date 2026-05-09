import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { BrandBar } from '../shared/components/BrandBar';
import { AppAccessGate } from '../shared/components/AppAccessGate';
import { APP_IDS } from '../shared/auth/accessControl';
import { useAuth } from '../shared/hooks/useAuth';
import { Footer } from '../trading/components/Footer';

function ContentSkeleton() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 2rem' }}>
      <div style={{ height: 12, width: 120, background: 'rgba(15,61,46,.06)', borderRadius: 4, marginBottom: 16 }} />
      <div style={{ height: 28, width: 320, background: 'rgba(15,61,46,.08)', borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 14, width: 240, background: 'rgba(15,61,46,.05)', borderRadius: 4 }} />
    </div>
  );
}

export default function PicksLayout() {
  const { user, access, loading, signOut, signInWithGoogle } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F0' }}>
      <BrandBar
        surface="picks"
        authState={user ? 'in' : 'out'}
        user={user}
        access={access}
        onSignOut={signOut}
        onSignIn={signInWithGoogle}
      />
      <AppAccessGate
        appId={APP_IDS.PICKS}
        appName="NewLeaf Picks"
        user={user}
        access={access}
        loading={loading}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
      >
        <Suspense fallback={<ContentSkeleton />}>
          <Outlet />
        </Suspense>
      </AppAccessGate>
      <Footer />
    </div>
  );
}
