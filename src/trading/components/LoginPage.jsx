import { useState, useEffect } from 'react';
import { GOOGLE_LINK_PASSWORD_REQUIRED } from '../../shared/hooks/useAuth';
import { useNotification } from '../../shared/components/NotificationProvider';

function authMessage(error, isSignUp) {
  switch (error?.code) {
    case GOOGLE_LINK_PASSWORD_REQUIRED:
      return 'This email already has a NewLeaf account. Enter your existing password once to link Google to the same account.';
    case 'auth/email-already-in-use':
      return 'That email is already registered. Sign in, or use Google after signing in to link it.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'The email or password is incorrect.';
    case 'auth/weak-password':
      return 'Use a stronger password with at least 8 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/password registration is not enabled for this Firebase project yet.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Firebase sign-in yet. Add the current domain in Firebase Authentication settings and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow popups for NewLeaf and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it finished.';
    case 'auth/network-request-failed':
      return 'The sign-in request could not reach Firebase. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts were made. Wait a few minutes and try again.';
    case 'auth/user-disabled':
      return 'This account is disabled. Contact NewLeaf support to restore access.';
    case 'auth/user-not-found':
      return 'No NewLeaf account exists for this email. Create an account first, or continue with Google.';
    case 'auth/missing-google-link-credential':
      return 'The Google linking session expired. Start Google sign-in again.';
    case 'auth/email-link-mismatch':
      return 'The email entered does not match the Google account being linked.';
    default:
      return isSignUp ? 'Registration failed. Check the details and try again.' : 'Sign-in failed. Check the details and try again.';
  }
}

export function LoginPage({
  onSignInWithGoogle,
  onSignInWithEmail,
  onSignUp,
  onLinkGoogleWithPassword,
  onComplete,
  isModal = false,
  defaultMode = 'login',
  mode,
}) {
  const notification = useNotification();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const initialMode = mode || defaultMode;
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [pendingGoogleLink, setPendingGoogleLink] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsSignUp((mode || defaultMode) === 'signup');
  }, [defaultMode, mode]);

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setLoading(true);
      setPendingGoogleLink(null);
      await onSignInWithGoogle();
      onComplete?.();
    } catch (err) {
      if (err?.code === GOOGLE_LINK_PASSWORD_REQUIRED) {
        setEmail(err.email || '');
        setPassword('');
        setIsSignUp(false);
        setPendingGoogleLink({ email: err.email, credential: err.credential });
      }
      const message = authMessage(err, isSignUp);
      setError(message);
      await notification.showError({
        title: 'Sign-in did not complete',
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (isSignUp && !displayName.trim()) {
      setError('Please enter your name so we can identify your account.');
      return;
    }

    if ((isSignUp || pendingGoogleLink) && password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }

    try {
      setError('');
      setLoading(true);

      if (pendingGoogleLink) {
        await onLinkGoogleWithPassword(email, password, pendingGoogleLink.credential);
      } else if (isSignUp) {
        await onSignUp(email, password, { displayName });
      } else {
        await onSignInWithEmail(email, password);
      }
      onComplete?.();
    } catch (err) {
      const message = authMessage(err, isSignUp);
      setError(message);
      await notification.showError({
        title: pendingGoogleLink ? 'Could not link Google' : isSignUp ? 'Registration did not complete' : 'Sign-in did not complete',
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  // When used as modal, use a slimmer style
  const containerStyle = isModal ? styles.modalContainer : styles.container;
  const cardStyle = isModal ? styles.modalCard : styles.card;

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Branding */}
        <div style={styles.branding}>
          <svg width="48" height="48" viewBox="0 0 40 40" fill="none" style={{display:'block',margin:'0 auto 8px'}}>
            <circle cx="20" cy="12" r="3.5" fill="#0B2D23"/>
            <path d="M6 28 C6 28 12 18 20 18 C28 18 34 28 34 28" stroke="#C9A96E" strokeWidth="3" fill="none" strokeLinecap="round"/>
          </svg>
          <h1 style={styles.title}>
            {pendingGoogleLink ? 'Link Your Google Account' : isSignUp ? 'Create Your Account' : 'Welcome Back'}
          </h1>
          <p style={styles.tagline}>
            {pendingGoogleLink
              ? 'Enter your existing password once. NewLeaf will keep one account for both sign-in methods.'
              : isSignUp
                ? 'Use any email address. Gmail is optional.'
                : 'Sign in to NewLeaf System'}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div style={styles.error}>
            {error}
          </div>
        )}

        {/* Google Sign-In Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading || pendingGoogleLink}
          style={styles.googleButton}
        >
          <svg style={styles.googleIcon} viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'Signing in...' : `Continue ${isSignUp ? 'registration' : 'sign in'} with Google`}
        </button>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine}></span>
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine}></span>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth} style={styles.form}>
          {isSignUp && !pendingGoogleLink && (
            <input
              type="text"
              placeholder="Full name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
              style={styles.input}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading || Boolean(pendingGoogleLink)}
            style={styles.input}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder={pendingGoogleLink ? 'Existing NewLeaf password' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={styles.input}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />

          <button
            type="submit"
            disabled={loading}
            style={styles.submitButton}
          >
            {loading ? 'Please wait...' : pendingGoogleLink ? 'Link Google Account' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        {pendingGoogleLink && (
          <button
            type="button"
            onClick={() => {
              setPendingGoogleLink(null);
              setPassword('');
              setError('');
            }}
            disabled={loading}
            style={styles.cancelLinkButton}
          >
            Use a different sign-in method
          </button>
        )}

        {/* Toggle between sign-in and sign-up */}
        {!pendingGoogleLink && <div style={styles.toggle}>
          <span style={styles.toggleText}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          </span>
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            disabled={loading}
            style={styles.toggleButton}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>}

        {/* Footer */}
        <div style={styles.footer}>
          <p style={styles.footerText}>
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F9FAFB',
    padding: '2rem',
  },
  modalContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#FFFFFF',
    borderRadius: '12px',
    padding: '2.5rem',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
    border: '1px solid #E5E7EB',
  },
  modalCard: {
    width: '100%',
    maxWidth: '420px',
    background: 'transparent',
    padding: '0.5rem',
  },
  branding: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  logo: {
    fontSize: '3rem',
    display: 'block',
    marginBottom: '0.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '600',
    fontFamily: "'Instrument Sans', sans-serif",
    color: '#111827',
    margin: '0 0 0.5rem 0',
  },
  tagline: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: 0,
    fontFamily: "'Instrument Sans', sans-serif",
    fontWeight: '400',
  },
  error: {
    background: 'rgba(220, 38, 38, 0.05)',
    border: '1px solid #dc2626',
    borderRadius: '8px',
    padding: '0.875rem',
    marginBottom: '1.25rem',
    color: '#dc2626',
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  googleButton: {
    width: '100%',
    padding: '0.875rem',
    background: '#ffffff',
    color: '#3c4043',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    transition: 'all 0.2s ease',
    fontFamily: "'Instrument Sans', sans-serif",
  },
  googleIcon: {
    width: '20px',
    height: '20px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '1.5rem 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#E5E7EB',
  },
  dividerText: {
    padding: '0 1rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  input: {
    padding: '0.875rem 1rem',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    color: '#111827',
    fontSize: '0.9375rem',
    fontFamily: "'Instrument Sans', sans-serif",
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  submitButton: {
    width: '100%',
    padding: '0.875rem',
    background: 'var(--brand-button-primary-bg, #c8a85a)',
    color: 'var(--brand-button-primary-text, #061c15)',
    border: '1px solid var(--brand-button-primary-border, #c8a85a)',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '800',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: "'Instrument Sans', sans-serif",
    marginTop: '0.5rem',
  },
  cancelLinkButton: {
    display: 'block',
    margin: '1rem auto 0',
    background: 'none',
    border: 'none',
    color: '#0B2D23',
    fontSize: '0.875rem',
    fontWeight: '700',
    cursor: 'pointer',
    padding: 0,
    fontFamily: "'Instrument Sans', sans-serif",
  },
  toggle: {
    marginTop: '1.5rem',
    textAlign: 'center',
  },
  toggleText: {
    color: '#9CA3AF',
    fontSize: '0.875rem',
    marginRight: '0.5rem',
  },
  toggleButton: {
    background: 'none',
    border: 'none',
    color: '#0B2D23',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
    fontFamily: "'Instrument Sans', sans-serif",
  },
  footer: {
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #E5E7EB',
  },
  footerText: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: '1.5',
    margin: 0,
  },
};
