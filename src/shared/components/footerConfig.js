export const canonicalLegalLinks = Object.freeze({
  privacyPolicy: 'https://newleafsystem.com/privacy-policy',
  termsAndConditions: 'https://newleafsystem.com/terms-and-conditions',
});

export const FOOTER_PRODUCT_LABELS = Object.freeze([
  'Picks',
  'Workbench',
  'Invest',
  'Quant',
  'Desk',
]);

export const FOOTER_STATIC_SECTIONS = Object.freeze([
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
      { label: 'Pricing', href: '/pricing' },
      { label: 'Privacy Policy', href: canonicalLegalLinks.privacyPolicy },
      { label: 'Terms and Conditions', href: canonicalLegalLinks.termsAndConditions },
      { label: 'Contact', href: 'mailto:hello@newleafsystem.com' },
    ],
  },
]);
