import { useMemo, useState } from 'react';
import { Ban, Check, RotateCcw, ShieldCheck, Zap } from 'lucide-react';
import PageSEO from '../../shared/components/PageSEO';

const plans = [
  {
    name: 'Explorer',
    monthlyPrice: 0,
    annualPrice: 0,
    monthlyPeriod: 'Free forever',
    annualPeriod: 'Free forever',
    summary: 'Get a feel for the system',
    cta: 'Get Started',
    features: [
      "Browse current week's picks (read-only)",
      '3 strategy tiles in Invest',
      'Static strategy pages (educational)',
      'Projection simulator',
      'All marketing and educational content',
    ],
  },
  {
    name: 'Starter',
    monthlyPrice: 29,
    annualPrice: 290,
    summary: 'Unlock the full library',
    cta: 'Start Free Trial',
    features: [
      'Everything in Explorer',
      'Full picks history and weekly recap',
      '10 Invest tiles with payoff diagrams',
      'Workbench: Calendar, Projection',
      'Email: weekly picks summary',
    ],
  },
  {
    name: 'Trader',
    monthlyPrice: 69,
    annualPrice: 690,
    summary: 'For active options traders',
    cta: 'Start Free Trial',
    featured: true,
    badge: 'Most Popular',
    features: [
      'Everything in Starter',
      'Unlimited Invest tiles with full Greeks',
      'Workbench: Scanner, Watchlist, Strategy Builder',
      'AI Discover: 5 verifications/day (NewLeaf-Plus)',
      'AI Strategy Tutor on skill pages',
      'AI Variant Ranking in Strategy Builder',
      'Weekly Picks AI Narrative',
      'Strike Comparison Cards',
      '3 PDF reports/week',
      'Real-time data',
    ],
  },
  {
    name: 'Institutional',
    monthlyPrice: 149,
    annualPrice: 1490,
    summary: 'Maximum insight, zero limits',
    cta: 'Start Free Trial',
    features: [
      'Everything in Trader',
      'AI Discover: 25 verifications/day (NewLeaf-Max)',
      'AI Adjust: position risk management',
      'AI-powered live position verdicts',
      'Earnings and dividend risk alerts',
      'AI Chat assistant with portfolio awareness',
      'Unlimited PDF reports',
      'Priority email alerts with trade thesis',
      'API access (coming soon)',
    ],
  },
];

const trustItems = [
  { icon: ShieldCheck, label: 'Secure payments via Stripe' },
  { icon: Ban, label: 'No credit card for trial' },
  { icon: RotateCcw, label: '30-day money-back guarantee' },
  { icon: Zap, label: 'Cancel anytime, instantly' },
];

const faqs = [
  {
    question: 'Is there a free trial for paid plans?',
    answer: 'Yes. Every paid plan includes a 14-day free trial with full access. No credit card is required to start. Sign up and upgrade from your dashboard when you are ready.',
  },
  {
    question: 'Can I switch plans or cancel anytime?',
    answer: "Yes. You can upgrade, downgrade, or cancel at any time from account settings. If you cancel a paid plan, access continues until the end of the current billing period.",
  },
  {
    question: 'How does annual billing work?',
    answer: 'Annual billing is charged once per year at a 17% discount compared with monthly pricing. You can switch between monthly and annual billing from account settings.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'NewLeaf accepts major credit and debit cards through Stripe. Payment processing is handled securely by Stripe.',
  },
  {
    question: 'What happens when my trial ends?',
    answer: "If you do not add a payment method, your account returns to the free Explorer tier. Saved data stays in place, but premium features pause until you subscribe.",
  },
  {
    question: 'Do you offer refunds?',
    answer: "If NewLeaf is not a fit within the first 30 days of a paid subscription, contact support@newleafsystem.com and we will issue a refund.",
  },
];

function formatAnnualEquivalent(plan) {
  if (!plan.annualPrice) return null;
  const value = plan.annualPrice / 12;
  return value % 1 === 0 ? `$${value}/mo equivalent` : `$${value.toFixed(2)}/mo equivalent`;
}

function PricingCard({ plan, billing }) {
  const isAnnual = billing === 'annual';
  const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
  const period = price === 0
    ? (isAnnual ? plan.annualPeriod : plan.monthlyPeriod)
    : isAnnual ? '/yr' : '/mo';
  const equivalent = isAnnual ? formatAnnualEquivalent(plan) : null;
  const billingNote = price === 0 ? period : equivalent;

  return (
    <article className={`pricing-card${plan.featured ? ' pricing-card-featured' : ''}`}>
      {plan.badge && <div className="pricing-card-badge">{plan.badge}</div>}
      <div className="pricing-plan-name">{plan.name}</div>
      <div className="pricing-price-row">
        <span className="pricing-currency">$</span>
        <span className="pricing-price">{price}</span>
        {price > 0 && <span className="pricing-period">{period}</span>}
      </div>
      {billingNote && <div className="pricing-plan-period">{billingNote}</div>}
      <p className="pricing-plan-summary">{plan.summary}</p>

      <div className="pricing-divider" />

      <ul className="pricing-feature-list">
        {plan.features.map((feature) => (
          <li key={feature}>
            <Check size={15} strokeWidth={2.8} aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <a className="pricing-card-cta" href="/register">
        {plan.cta}
      </a>
    </article>
  );
}

export function PricingPage() {
  const [billing, setBilling] = useState('monthly');
  const faqSchema = useMemo(() => faqs.map(({ question, answer }) => ({ question, answer })), []);

  return (
    <main className="pricing-page">
      <PageSEO
        title="Pricing - NewLeaf System"
        description="Choose a NewLeaf System plan. Start free, then upgrade for full picks history, Workbench access, AI verifications, real-time data, and advanced portfolio intelligence."
        path="/pricing"
        faqItems={faqSchema}
      />

      <style>{`
        .pricing-page {
          --pricing-bg: #f7f4ee;
          --pricing-card: #ffffff;
          --pricing-ink: #0b0f14;
          --pricing-forest: #0b2d23;
          --pricing-forest-deep: #06271d;
          --pricing-green: #007a61;
          --pricing-gold: #c9a96e;
          --pricing-gold-dark: #a8893a;
          --pricing-muted: rgba(11, 15, 20, 0.62);
          --pricing-dim: rgba(11, 15, 20, 0.42);
          --pricing-border: rgba(11, 15, 20, 0.1);
          --pricing-shadow: 0 18px 50px rgba(11, 15, 20, 0.08);
          min-height: 100vh;
          background: var(--pricing-bg);
          color: var(--pricing-ink);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        }

        .pricing-page a { text-decoration: none; }

        .pricing-wrap {
          width: min(1152px, calc(100% - 40px));
          margin: 0 auto;
        }

        .pricing-hero {
          max-width: 940px;
          margin: 0 auto;
          padding: 74px 20px 48px;
          text-align: center;
        }

        .pricing-kicker {
          margin-bottom: 18px;
          color: var(--pricing-green);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.22em;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .pricing-hero h1 {
          margin: 0;
          color: var(--pricing-forest);
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(35px, 5vw, 49px);
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1.08;
        }

        .pricing-hero h1 em {
          color: var(--pricing-green);
          font-style: italic;
          font-weight: 800;
        }

        .pricing-lede {
          max-width: 620px;
          margin: 24px auto 0;
          color: var(--pricing-muted);
          font-size: 17px;
          line-height: 1.7;
        }

        .pricing-toggle-row {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-top: 42px;
          color: var(--pricing-muted);
          font-size: 14px;
          font-weight: 650;
        }

        .pricing-toggle-row strong {
          color: var(--pricing-ink);
          font-weight: 800;
        }

        .pricing-toggle {
          position: relative;
          width: 52px;
          height: 28px;
          border: 0;
          border-radius: 999px;
          background: #cbd1cc;
          cursor: pointer;
          transition: background 0.18s ease;
        }

        .pricing-toggle[aria-pressed="true"] {
          background: var(--pricing-forest);
        }

        .pricing-toggle::after {
          content: '';
          position: absolute;
          top: 4px;
          left: 4px;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
          transition: transform 0.18s ease;
        }

        .pricing-toggle[aria-pressed="true"]::after {
          transform: translateX(24px);
        }

        .pricing-save {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          padding: 0 9px;
          border-radius: 999px;
          background: rgba(0, 122, 97, 0.12);
          color: var(--pricing-green);
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.08em;
          line-height: 1;
        }

        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 20px;
          align-items: start;
          padding: 18px 0 74px;
        }

        .pricing-card {
          position: relative;
          display: flex;
          min-height: 526px;
          flex-direction: column;
          padding: 34px 28px 28px;
          border: 1px solid var(--pricing-border);
          border-radius: 14px;
          background: var(--pricing-card);
          box-shadow: var(--pricing-shadow);
        }

        .pricing-card-featured {
          min-height: 604px;
          margin-top: -12px;
          background: var(--pricing-forest-deep);
          color: #fff;
          border-color: rgba(201, 169, 110, 0.28);
          box-shadow: 0 26px 70px rgba(6, 39, 29, 0.25);
        }

        .pricing-card-badge {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          min-width: 118px;
          padding: 7px 14px;
          border-radius: 999px;
          background: var(--pricing-gold);
          color: var(--pricing-forest);
          text-align: center;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.16em;
          line-height: 1;
          text-transform: uppercase;
        }

        .pricing-plan-name {
          margin-bottom: 12px;
          color: var(--pricing-green);
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.22em;
          line-height: 1;
          text-transform: uppercase;
        }

        .pricing-card-featured .pricing-plan-name {
          color: var(--pricing-gold);
        }

        .pricing-card:not(.pricing-card-featured):last-child .pricing-plan-name {
          color: var(--pricing-gold-dark);
        }

        .pricing-price-row {
          display: flex;
          align-items: baseline;
          min-height: 55px;
          color: var(--pricing-ink);
          font-family: 'Playfair Display', Georgia, serif;
          line-height: 1;
        }

        .pricing-card-featured .pricing-price-row {
          color: #fff;
        }

        .pricing-currency {
          font-size: 36px;
          font-weight: 500;
        }

        .pricing-price {
          margin-left: -2px;
          font-size: 49px;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
        }

        .pricing-period {
          margin-left: 5px;
          color: var(--pricing-muted);
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 14px;
          font-weight: 650;
        }

        .pricing-card-featured .pricing-period,
        .pricing-card-featured .pricing-plan-period,
        .pricing-card-featured .pricing-plan-summary {
          color: rgba(255, 255, 255, 0.72);
        }

        .pricing-plan-period,
        .pricing-plan-summary {
          margin: 0;
          color: var(--pricing-muted);
          font-size: 14px;
          line-height: 1.55;
        }

        .pricing-plan-summary {
          margin-top: 4px;
        }

        .pricing-divider {
          height: 1px;
          margin: 24px 0;
          background: rgba(11, 15, 20, 0.08);
        }

        .pricing-card-featured .pricing-divider {
          background: rgba(255, 255, 255, 0.14);
        }

        .pricing-feature-list {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 16px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .pricing-feature-list li {
          display: grid;
          grid-template-columns: 16px minmax(0, 1fr);
          gap: 11px;
          align-items: start;
          color: #172033;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.45;
        }

        .pricing-feature-list svg {
          margin-top: 2px;
          color: var(--pricing-green);
        }

        .pricing-card-featured .pricing-feature-list li {
          color: rgba(255, 255, 255, 0.94);
          font-weight: 700;
        }

        .pricing-card-featured .pricing-feature-list svg {
          color: #66e0c9;
        }

        .pricing-card:not(.pricing-card-featured):last-child .pricing-feature-list svg {
          color: var(--pricing-gold-dark);
        }

        .pricing-card-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 49px;
          margin-top: 36px;
          border: 1px solid var(--pricing-forest);
          border-radius: 8px;
          background: #fff;
          color: var(--pricing-ink);
          font-size: 14px;
          font-weight: 800;
          line-height: 1;
          transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }

        .pricing-card-cta:hover {
          background: var(--pricing-forest);
          color: #fff;
          transform: translateY(-1px);
        }

        .pricing-card-featured .pricing-card-cta {
          background: var(--pricing-gold);
          border-color: var(--pricing-gold);
          color: var(--pricing-forest);
        }

        .pricing-card-featured .pricing-card-cta:hover {
          background: #d8bb79;
          border-color: #d8bb79;
          color: var(--pricing-forest);
        }

        .pricing-card:not(.pricing-card-featured):last-child .pricing-card-cta {
          border-color: var(--pricing-gold);
          color: var(--pricing-gold-dark);
        }

        .pricing-card:not(.pricing-card-featured):last-child .pricing-card-cta:hover {
          background: var(--pricing-gold);
          color: var(--pricing-forest);
        }

        .pricing-trust-band {
          border-top: 1px solid var(--pricing-border);
          border-bottom: 1px solid var(--pricing-border);
          background: #fff;
        }

        .pricing-trust-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 34px 52px;
          padding: 36px 0;
        }

        .pricing-trust-item {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: rgba(11, 15, 20, 0.72);
          font-size: 14px;
          font-weight: 700;
        }

        .pricing-trust-item svg {
          color: var(--pricing-gold-dark);
        }

        .pricing-guidance {
          padding: 96px 20px 30px;
          text-align: center;
        }

        .pricing-guidance h2,
        .pricing-faq h2 {
          margin: 0;
          color: var(--pricing-forest);
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(28px, 3vw, 34px);
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1.14;
        }

        .pricing-guidance p {
          max-width: 640px;
          margin: 26px auto 0;
          color: var(--pricing-muted);
          font-size: 16px;
          line-height: 1.75;
        }

        .pricing-faq {
          max-width: 640px;
          margin: 0 auto;
          padding: 28px 20px 120px;
        }

        .pricing-faq h2 {
          margin-bottom: 44px;
          text-align: center;
        }

        .pricing-faq-item {
          border-bottom: 1px solid rgba(11, 15, 20, 0.11);
        }

        .pricing-faq-item summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 20px 0;
          color: #05080b;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.4;
          cursor: pointer;
          list-style: none;
        }

        .pricing-faq-item summary::-webkit-details-marker {
          display: none;
        }

        .pricing-faq-plus {
          color: var(--pricing-gold-dark);
          font-size: 20px;
          font-weight: 500;
          line-height: 1;
          transition: transform 0.16s ease;
        }

        .pricing-faq-item[open] .pricing-faq-plus {
          transform: rotate(45deg);
        }

        .pricing-faq-item p {
          margin: 0;
          padding: 0 34px 20px 0;
          color: var(--pricing-muted);
          font-size: 14px;
          line-height: 1.7;
        }

        .pricing-risk-note {
          padding: 0 20px 48px;
          text-align: center;
        }

        .pricing-risk-note p {
          max-width: 820px;
          margin: 0 auto;
          color: rgba(11, 15, 20, 0.5);
          font-size: 12px;
          line-height: 1.7;
        }

        @media (max-width: 1100px) {
          .pricing-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .pricing-card,
          .pricing-card-featured {
            min-height: 0;
            margin-top: 0;
          }
        }

        @media (max-width: 640px) {
          .pricing-wrap {
            width: min(100% - 28px, 420px);
          }

          .pricing-hero {
            padding: 56px 14px 34px;
          }

          .pricing-lede {
            font-size: 15px;
          }

          .pricing-toggle-row {
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 30px;
          }

          .pricing-grid {
            grid-template-columns: 1fr;
            gap: 16px;
            padding-bottom: 48px;
          }

          .pricing-card {
            padding: 30px 24px 24px;
          }

          .pricing-card-featured {
            margin-top: 10px;
          }

          .pricing-trust-grid {
            align-items: flex-start;
            justify-content: flex-start;
            gap: 20px;
          }

          .pricing-trust-item {
            width: 100%;
          }

          .pricing-guidance {
            padding-top: 62px;
          }

          .pricing-faq {
            padding-bottom: 82px;
          }
        }
      `}</style>

      <section className="pricing-hero">
        <div className="pricing-kicker">Pricing</div>
        <h1>
          One system, four tiers. <em>Pick yours.</em>
        </h1>
        <p className="pricing-lede">
          Start free and upgrade when you need more. Every paid plan includes a 14-day free trial - no credit card required.
        </p>

        <div className="pricing-toggle-row" aria-label="Billing frequency">
          <strong>Monthly</strong>
          <button
            className="pricing-toggle"
            type="button"
            aria-label="Use annual billing"
            aria-pressed={billing === 'annual'}
            onClick={() => setBilling((value) => value === 'monthly' ? 'annual' : 'monthly')}
          />
          <span>Annual</span>
          <span className="pricing-save">Save 17%</span>
        </div>
      </section>

      <section className="pricing-wrap pricing-grid" aria-label="Pricing plans">
        {plans.map((plan) => (
          <PricingCard key={plan.name} plan={plan} billing={billing} />
        ))}
      </section>

      <section className="pricing-trust-band" aria-label="Billing assurances">
        <div className="pricing-wrap pricing-trust-grid">
          {trustItems.map(({ icon: Icon, label }) => (
            <div className="pricing-trust-item" key={label}>
              <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pricing-guidance">
        <div className="pricing-kicker">Not sure which plan?</div>
        <h2>Start with Explorer, upgrade anytime.</h2>
        <p>
          Most traders start free, explore the picks and strategy pages, then upgrade to Starter or Trader when they want full Workbench access and real-time data.
        </p>
      </section>

      <section className="pricing-faq" aria-labelledby="pricing-faq-heading">
        <h2 id="pricing-faq-heading">Frequently asked questions</h2>
        {faqs.map((faq) => (
          <details className="pricing-faq-item" key={faq.question}>
            <summary>
              <span>{faq.question}</span>
              <span className="pricing-faq-plus" aria-hidden="true">+</span>
            </summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </section>

      <section className="pricing-risk-note" aria-label="Risk disclosure">
        <p>
          Options involve risk and are not suitable for all investors. Past performance does not guarantee future results. NewLeaf System provides structured options strategy frameworks for educational purposes only. All investments carry risk of loss.
        </p>
      </section>
    </main>
  );
}
