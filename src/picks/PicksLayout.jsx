import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { BrandBar } from '../shared/components/BrandBar';
import { AppAccessGate } from '../shared/components/AppAccessGate';
import { APP_IDS } from '../shared/auth/accessControl';
import { useAuth } from '../shared/hooks/useAuth';
import { SectionLoader } from '../shared/components/LeafLoader';
import { Footer } from '../trading/components/Footer';

function ContentSkeleton() {
  return <SectionLoader label="Loading Picks" minHeight={420} />;
}

export default function PicksLayout() {
  const { user, access, loading, signOut, signInWithGoogle } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F0' }}>
      <BrandBar
        surface="picks"
        authState={user ? 'in' : loading ? 'loading' : 'out'}
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
