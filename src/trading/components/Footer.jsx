export const canonicalLegalLinks = Object.freeze({
  privacyPolicy: 'https://newleafsystem.com/privacy-policy',
  termsAndConditions: 'https://newleafsystem.com/terms-and-conditions',
});

const footerSections = [
  {
    title: 'Platform',
    links: [
      { label: 'Picks', href: '/picks' },
      { label: 'Workbench', href: '/workbench/' },
      { label: 'Invest', href: '/invest' },
      { label: 'Quant', href: '/quant' },
      { label: 'Desk', href: '/desk' },
    ],
  },
  {
    title: 'Research',
    links: [
      { label: 'How we pick trades', href: '/how-we-pick' },
      { label: 'Track record', href: '/track-record' },
      { label: 'Probability engine', href: '/probability-engine' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Privacy Policy', href: canonicalLegalLinks.privacyPolicy },
      { label: 'Terms and Conditions', href: canonicalLegalLinks.termsAndConditions },
      { label: 'Contact', href: 'mailto:hello@newleafsystem.com' },
    ],
  },
];

export function Footer({ className = 'app-footer' }) {
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
