import { useAuth } from '../hooks/useAuth';
import { AnalysisPage } from '../../trading/pages/AnalysisPage';
import { Link } from 'react-router-dom';
import '../../trading/styles/newleaf-system.css';

export default function WorkbenchAnalysisWrapper() {
  const { user } = useAuth();

  return (
    <div style={{ position: 'relative' }}>
      <AnalysisPage />

      {/* Premium gating for anonymous users */}
      {!user && (
        <>
          <style>{`
            /* Blur the gamma insight + deep dive tabs (2nd and 3rd grids after summary cards) */
            .nl-page > div:nth-child(n+5):not(:first-child) {
              filter: blur(5px);
              pointer-events: none;
              user-select: none;
            }
            /* Keep header, tabs, control bar, price chart crisp */
            .nl-page > .nl-page-header,
            .nl-page > div:nth-child(-n+4) {
              filter: none !important;
              pointer-events: auto !important;
              user-select: auto !important;
            }
          `}</style>

          {/* Sign-in overlay */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.97) 30%, #fff 50%)',
            padding: '80px 2rem 32px', textAlign: 'center',
          }}>
            <div style={{ maxWidth: 520, margin: '0 auto' }}>
              <p style={{
                fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#0B2D23',
                marginBottom: 8, fontWeight: 500,
              }}>
                Sign in to unlock <em style={{ color: '#C9A96E', fontStyle: 'italic' }}>full analysis</em>
              </p>
              <p style={{ fontSize: 13, color: '#6b6b60', marginBottom: 20, lineHeight: 1.6 }}>
                Gamma walls, IV rank, strike heatmaps, and technical indicators are available to signed-in users.
              </p>
              <Link
                to="/signin"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '14px 32px', background: 'var(--brand-button-primary-bg)', color: 'var(--brand-button-primary-text)',
                  border: '1px solid var(--brand-button-primary-border)', borderRadius: 8, fontSize: 14, fontWeight: 800,
                  textDecoration: 'none',
                }}
              >
                Sign in or register
              </Link>
              <p style={{ fontSize: 11, color: '#6b6b60', marginTop: 10 }}>
                Free to explore. No credit card required.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
