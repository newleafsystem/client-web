import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { BrandBar } from '../shared/components/BrandBar';
import { useAuth } from '../shared/hooks/useAuth';
import { SectionLoader } from '../shared/components/LeafLoader';
import { Footer } from '../trading/components/Footer';

export default function BlogLayout() {
  const { user, access, loading, signOut, signInWithGoogle } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff' }}>
      <BrandBar
        surface="root"
        authState={loading ? 'loading' : user ? 'in' : 'out'}
        user={user}
        access={access}
        onSignOut={signOut}
        onSignIn={signInWithGoogle}
      />
      <Suspense fallback={<SectionLoader label="Loading blog" minHeight={400} />}>
        <Outlet />
      </Suspense>
      <Footer />
    </div>
  );
}
