import { Link, useLocation } from 'react-router-dom';
import { useMarketState } from '../hooks/useMarketState';

/**
 * AppHeader — Shared premium header component for authenticated pages
 * Implements the branding and navigation improvements with:
 * - Brand lockup: "NewLeaf" (bold) + "System" (gold)
 * - Optional tagline: "Defined-Risk Trading OS"
 * - Nav links with gold underline on active state
 * - Premium styling with consistent spacing
 */
export function AppHeader({ user, onSignOut, onOpenChat }) {
  const location = useLocation();
  const { marketState } = useMarketState();

  const getUserInitials = () => {
    if (user?.displayName) {
      return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return 'U';
  };

  const isActive = (path) => location.pathname === path;

  // Get market status
  const getMarketStatus = () => {
    if (!marketState) return { text: 'Loading...', isOpen: false };
    return {
      text: marketState.isMarketOpen ? 'Markets Open' : 'Markets Closed',
      isOpen: marketState.isMarketOpen
    };
  };

  const marketStatus = getMarketStatus();

  // Check if user is admin
  const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim());
  const isAdmin = user?.email && ADMIN_EMAILS.some(email => email.toLowerCase() === user.email.toLowerCase());

  const navLinks = [
    { path: '/invest', label: 'Home' },
    { path: '/invest/discover', label: 'Discover' },
    { path: '/invest/build', label: 'Build' },
    { path: '/invest/positions', label: 'Positions' },
    { path: '/invest/performance', label: 'Performance' },
  ];

  // Add admin link if user is admin
  if (isAdmin) {
    navLinks.push({ path: '/invest/admin', label: 'Admin' });
  }

  return (
    <nav className="nl-nav">
      <a href="/" className="nl-nav-brand">
        <img src="/logo-icon.png" width="36" height="36" alt="NewLeaf" />
        <span className="nl-nav-wordmark">
          NewLeaf <em>Invest</em>
        </span>
      </a>

      <ul className="nl-nav-links">
        {navLinks.map(link => (
          <li key={link.path}>
            <Link
              to={link.path}
              className={`nl-nav-link${isActive(link.path) ? ' active' : ''}`}
              aria-current={isActive(link.path) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          </li>
        ))}
        {/* Workbench link removed — separate app, accessible from main nav */}
      </ul>

      <div className="nl-nav-right">
        {/* Market status (acts like the Live indicator on R2) */}
        <div className="nl-live">
          <span className="nl-live-dot" style={{ background: marketStatus.isOpen ? '#5dba8e' : '#888' }} />
          <span>{marketStatus.text}</span>
        </div>

        {/* Ask AI button */}
        <button
          className="nl-nav-pill"
          onClick={() => onOpenChat?.()}
          title="Ask NewLeaf AI Assistant"
          style={{ gap: 6 }}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" x2="12" y1="19" y2="22"/>
          </svg>
          Ask AI
        </button>

        {/* Avatar + Sign out */}
        <div className="nl-nav-user">
          <div className="nl-nav-avatar">{getUserInitials()}</div>
          <button onClick={onSignOut} className="nl-nav-ghost" style={{ height: 'auto', padding: '0 12px' }}>Sign Out</button>
        </div>
      </div>
    </nav>
  );
}
