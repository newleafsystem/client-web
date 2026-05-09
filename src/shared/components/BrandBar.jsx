import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { surfaceConfig } from './navConfig';
import { APP_IDS, filterNavSections, normalizeUserAccess } from '../auth/accessControl';
import { useMarketState } from '../../trading/hooks/useMarketState';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Use <a> for static / HTML pages, <Link> for React Router routes */
function NavAnchor({ href, children, ...props }) {
  const isStaticWorkbenchHref = href === '/workbench/' ||
    href === '/workbench' ||
    (href.startsWith('/workbench/') && !href.startsWith('/workbench/analysis'));

  if (isStaticWorkbenchHref) {
    return <a href={href} {...props}>{children}</a>;
  }
  return <Link {...props} to={href}>{children}</Link>;
}

function formatET() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' ET';
}

function accessAttrs(item) {
  return {
    ...(item.requiredApp ? { 'data-app-id': item.requiredApp } : {}),
    ...(item.requiredRole ? { 'data-role-id': item.requiredRole } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
// NavDropdown — reusable for "How it works", "Strategies", etc.
// ═══════════════════════════════════════════════════════════════

function NavDropdown({ label, href, items, isActive, dark, accessProps = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const hoverTimeout = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const handleMouseEnter = () => {
    clearTimeout(hoverTimeout.current);
    setOpen(true);
  };
  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => setOpen(false), 150);
  };

  const focusFirstItem = () => {
    requestAnimationFrame(() => ref.current?.querySelector('.nl-dd-item')?.focus());
  };

  const handleTriggerKey = (e) => {
    if (e.key === ' ' || (!href && e.key === 'Enter')) {
      e.preventDefault();
      setOpen((o) => !o);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      focusFirstItem();
    }
  };

  const handleItemKey = (e) => {
    const move = (dir) => {
      let el = e.target[dir];
      while (el && !el.classList?.contains('nl-dd-item')) el = el[dir];
      if (el) el.focus();
    };
    if (e.key === 'ArrowDown') { e.preventDefault(); move('nextElementSibling'); }
    if (e.key === 'ArrowUp') { e.preventDefault(); move('previousElementSibling'); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <li
      ref={ref}
      className="nl-dd-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...accessProps}
    >
      {href ? (
        <NavAnchor
          href={href}
          className={`nl-nav-link nl-dd-trigger${isActive ? ' active' : ''}`}
          onFocus={() => setOpen(true)}
          onKeyDown={handleTriggerKey}
          aria-expanded={open}
          aria-haspopup="true"
          aria-current={isActive ? 'page' : undefined}
        >
          {label}
          <span
            className="nl-dd-arrow"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          >
            &#9662;
          </span>
        </NavAnchor>
      ) : (
        <button
          type="button"
          className={`nl-nav-link nl-dd-trigger${isActive ? ' active' : ''}`}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={handleTriggerKey}
          aria-expanded={open}
          aria-haspopup="true"
        >
          {label}
          <span
            className="nl-dd-arrow"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          >
            &#9662;
          </span>
        </button>
      )}

      <div className={`nl-dd-panel${dark ? ' nl-dd-dark' : ''}`} role="menu" hidden={!open}>
          {items.map((item, idx) => {
            if (item.divider) return <div key={`d${idx}`} className="nl-dd-divider" />;
            if (item.heading) return <div key={`h${idx}`} className="nl-dd-heading">{item.heading}</div>;
            return (
              <NavAnchor
                key={item.href}
                href={item.href}
                role="menuitem"
                tabIndex={0}
                className={`nl-dd-item${item.accent ? ' accent' : ''}`}
                onClick={() => setOpen(false)}
                onKeyDown={handleItemKey}
                {...accessAttrs(item)}
              >
                {item.label}
              </NavAnchor>
            );
          })}
        </div>
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════
// MarketStatusPill — Invest surface, reads from Firestore
// ═══════════════════════════════════════════════════════════════

function MarketStatusPill() {
  const { marketState } = useMarketState();
  const isOpen = marketState?.isMarketOpen;
  const text = !marketState ? 'Loading\u2026' : isOpen ? 'Markets Open' : 'Markets Closed';

  return (
    <div className="nl-live">
      <span
        className="nl-live-dot"
        style={{ background: isOpen ? '#5dba8e' : '#888' }}
      />
      <span>{text}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LiveClock — Workbench surface, ET time updated every second
// ═══════════════════════════════════════════════════════════════

function LiveClock() {
  const [time, setTime] = useState(formatET);

  useEffect(() => {
    const id = setInterval(() => setTime(formatET()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="nl-live">
      <span className="nl-live-dot" />
      <span>
        Live &middot; <span className="nl-live-time">{time}</span>
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MobileMenu — full-width overlay with focus trap
// ═══════════════════════════════════════════════════════════════

function MobileMenu({ isOpen, onClose, sections, children }) {
  const panelRef = useRef(null);
  const prevFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    prevFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    requestAnimationFrame(() => {
      panelRef.current?.querySelector('a, button')?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      prevFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div className="nl-mobile-overlay" onClick={onClose} aria-hidden="true" hidden={!isOpen} />
      <div
        className="nl-mobile-panel"
        ref={panelRef}
        role="dialog"
        aria-modal={isOpen ? 'true' : undefined}
        aria-label="Navigation menu"
        hidden={!isOpen}
      >
        <button className="nl-mobile-close" onClick={onClose} aria-label="Close menu">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="nl-mobile-sections">
          {sections.map((item, idx) => {
            if (item.kind === 'dropdown') {
              return (
                <MobileDropdown
                  key={idx}
                  label={item.label}
                  href={item.href}
                  items={item.items}
                  onNavigate={onClose}
                  accessProps={accessAttrs(item)}
                />
              );
            }
            return (
              <NavAnchor
                key={item.href}
                href={item.href}
                className="nl-mobile-link"
                onClick={onClose}
                {...accessAttrs(item)}
              >
                {item.label}
              </NavAnchor>
            );
          })}
        </div>

        {children && <div className="nl-mobile-utility">{children}</div>}
      </div>
    </>
  );
}

function MobileDropdown({ label, href, items, onNavigate, accessProps = {} }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="nl-mobile-dd" {...accessProps}>
      {href ? (
        <div className="nl-mobile-dd-top">
          <NavAnchor
            href={href}
            className="nl-mobile-link nl-mobile-dd-label"
            onClick={onNavigate}
          >
            {label}
          </NavAnchor>
          <button
            type="button"
            className="nl-mobile-dd-toggle"
            onClick={() => setExpanded((o) => !o)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${label} links`}
          >
            <span
              className="nl-dd-arrow"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
            >
              &#9662;
            </span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="nl-mobile-link nl-mobile-dd-trigger"
          onClick={() => setExpanded((o) => !o)}
          aria-expanded={expanded}
        >
          {label}
          <span
            className="nl-dd-arrow"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
          >
            &#9662;
          </span>
        </button>
      )}
      <div className="nl-mobile-dd-items" hidden={!expanded}>
        {items.map((item, idx) => {
          if (item.divider) return <div key={`d${idx}`} className="nl-dd-divider" />;
          if (item.heading) return <div key={`h${idx}`} className="nl-dd-heading">{item.heading}</div>;
          return (
            <NavAnchor
              key={item.href}
              href={item.href}
              className={`nl-mobile-dd-item${item.accent ? ' accent' : ''}`}
              onClick={onNavigate}
              {...accessAttrs(item)}
            >
              {item.label}
            </NavAnchor>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BrandBar — unified top nav
// ═══════════════════════════════════════════════════════════════

export function BrandBar({
  surface = 'root',
  authState = 'out',
  user = null,
  access = null,
  onSignOut,
  onSignIn,
  onOpenChat,
  brandSuffix,
  sections: sectionsOverride,
  showAuth: showAuthOverride = true,
  className = '',
}) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const config = surfaceConfig[surface] || surfaceConfig.root;
  const navClassName = ['nl-nav', `nl-nav--${surface}`, className].filter(Boolean).join(' ');
  const productSuffix = brandSuffix || config.brandSuffix || 'System';
  const isAuthLoading = authState === 'loading';
  const isSignedIn = authState === 'in' && Boolean(user);
  const navAuthState = isSignedIn ? 'in' : 'out';

  // All surfaces share the same primary nav; dropdown contents are filtered
  // by app access so product internals do not become a second page header.
  const sectionsBase = sectionsOverride || config.sections;
  const userAccess = access || normalizeUserAccess(null, user);
  const effectiveSections = filterNavSections(sectionsBase, userAccess, { authState: navAuthState });
  const showBuilderCta = config.builderCta && userAccess.canAccessApp(APP_IDS.WORKBENCH);
  const showAuth = showAuthOverride;

  // Active-state helpers
  const cleanPath = (value) => {
    const path = String(value || '/').split(/[?#]/)[0].replace(/\/+$/, '');
    return path || '/';
  };
  const currentPath = cleanPath(location.pathname);
  const isActive = (href) => {
    const target = cleanPath(href);
    if (target === '/') return currentPath === '/';
    return currentPath === target || currentPath.startsWith(`${target}/`);
  };
  const isDropdownActive = (item) => (
    item.activePrefixes?.some((prefix) => location.pathname.startsWith(prefix)) ||
    item.items?.some((child) => child.href && isActive(child.href))
  );

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // User initials for avatar
  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email
      ? user.email.charAt(0).toUpperCase()
      : 'U';
  const userDisplayLabel = user?.displayName || user?.email || 'Signed in';

  // ── Ask AI button (shared between desktop + mobile) ──
  const askAiBtn = isSignedIn && onOpenChat ? (
    <button
      className="nl-nav-pill"
      onClick={() => { onOpenChat(); closeMobile(); }}
      title="Ask NewLeaf AI Assistant"
      style={{ gap: 6 }}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
      Ask AI
    </button>
  ) : null;

  return (
    <>
    <nav className={navClassName} aria-label={config.ariaLabel || 'NewLeaf navigation'}>
      {/* ── Brand zone ── */}
      <div className="nl-brand-zone">
        <Link to="/" className="nl-nav-brand">
          <img src="/logo-icon.png" width="36" height="36" alt="NewLeaf" />
          <span className="nl-nav-wordmark">
            NewLeaf <em>{productSuffix}</em>
          </span>
        </Link>
      </div>

      {/* ── Section nav (desktop) ── */}
      <ul className="nl-nav-links">
        {effectiveSections.map((item, idx) => {
          if (item.kind === 'dropdown') {
            return (
              <NavDropdown
                key={idx}
                label={item.label}
                href={item.href}
                items={item.items}
                dark={item.dark}
                isActive={isDropdownActive(item)}
                accessProps={accessAttrs(item)}
              />
            );
          }
          return (
            <li key={item.href}>
              <NavAnchor
                href={item.href}
                className={`nl-nav-link${isActive(item.href) ? ' active' : ''}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
                {...accessAttrs(item)}
              >
                {item.label}
              </NavAnchor>
            </li>
          );
        })}
      </ul>

      {/* ── Utility zone (desktop) ── */}
      <div className="nl-nav-right">
        {config.statusType === 'market' && isSignedIn && <MarketStatusPill />}

        {askAiBtn}

        {showBuilderCta && (
          <a href="/workbench/strategy-builder" className="nl-nav-pill">
            Try Builder &rarr;
          </a>
        )}

        {showAuth &&
          (isAuthLoading ? (
            <div className="nl-nav-auth-skeleton" aria-label="Checking account" />
          ) : isSignedIn ? (
            <div className="nl-nav-user">
              <div className="nl-nav-avatar">{initials}</div>
              <span className="nl-nav-user-email">{userDisplayLabel}</span>
              <button
                onClick={onSignOut}
                className="nl-nav-ghost"
                style={{ height: 'auto', padding: '0 12px' }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <>
              <Link to="/signin" className="nl-nav-ghost">
                Sign In
              </Link>
              <Link to="/register" className="nl-nav-cta">
                Get Started &rarr;
              </Link>
            </>
          ))}
      </div>

      {/* ── Mobile hamburger (visible ≤860 px) ── */}
      <button
        className="nl-hamburger"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* ── Mobile menu ── */}
      <MobileMenu
        isOpen={mobileOpen}
        onClose={closeMobile}
        sections={effectiveSections}
      >
        {/* Utility items for mobile (no status indicators — matches existing mobile UX) */}
        {askAiBtn}

        {showBuilderCta && (
          <a
            href="/workbench/strategy-builder"
            className="nl-nav-pill nl-mobile-btn"
            onClick={closeMobile}
          >
            Try Builder &rarr;
          </a>
        )}

        {showAuth &&
          (isAuthLoading ? (
            <div className="nl-nav-auth-skeleton nl-mobile-btn" aria-label="Checking account" />
          ) : isSignedIn ? (
            <div className="nl-mobile-auth">
              <div className="nl-nav-avatar">{initials}</div>
              <span className="nl-nav-user-email">{userDisplayLabel}</span>
              <button
                onClick={() => { onSignOut?.(); closeMobile(); }}
                className="nl-nav-ghost"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <>
              <Link
                to="/signin"
                className="nl-nav-ghost nl-mobile-btn"
                onClick={closeMobile}
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="nl-nav-cta nl-mobile-btn"
                onClick={closeMobile}
              >
                Get Started &rarr;
              </Link>
            </>
          ))}
      </MobileMenu>
    </nav>
    <div className="nl-nav-spacer" aria-hidden="true" />
    </>
  );
}
