import { useAuth } from '../../shared/hooks/useAuth';
import { canonicalLegalLinks } from '../../shared/components/footerConfig';
import { selectFooterSections } from '../../shared/components/navigationState';

export function Footer({
  className = 'app-footer',
  authState: authStateOverride,
  user: userOverride,
  access: accessOverride,
}) {
  const auth = useAuth();
  const user = userOverride !== undefined ? userOverride : auth.user;
  const access = accessOverride !== undefined ? accessOverride : auth.access;
  const authState = authStateOverride || (user ? 'in' : auth.loading ? 'loading' : 'out');
  const footerSections = selectFooterSections({ user, access, authState });
  const year = new Date().getFullYear();
  const classes = ['auth-footer', className].filter(Boolean).join(' ');

  return (
    <footer className={classes}>
      <div className="site-footer-inner">
        <section className="site-footer-brand" aria-label="NewLeaf System">
          <a className="site-footer-lockup" href="/">
            <img src="/logo-icon.png" width="40" height="40" alt="NewLeaf" />
            <span>NewLeaf <em>System</em></span>
          </a>
          <p>
            Options intelligence for defined-risk research, curated picks,
            portfolio workflow, and execution preparation.
          </p>
          <p className="site-footer-risk">
            Educational decision-support only. Options involve risk and are not
            suitable for every investor.
          </p>
        </section>

        <nav className="site-footer-nav" aria-label="Footer navigation">
          {footerSections.map((section) => (
            <div className="site-footer-column" key={section.title}>
              <h2>{section.title}</h2>
              {section.links.map((link) => (
                <a href={link.href} key={link.href}>{link.label}</a>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="site-footer-bottom">
        <span>Copyright {year} NewLeaf System. All rights reserved.</span>
        <nav aria-label="Legal links">
          <a href={canonicalLegalLinks.privacyPolicy}>Privacy Policy</a>
          <a href={canonicalLegalLinks.termsAndConditions}>Terms and Conditions</a>
        </nav>
      </div>
    </footer>
  );
}
