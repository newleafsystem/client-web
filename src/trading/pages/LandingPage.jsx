import { useState } from 'react';
import { LoginPage } from '../components/LoginPage';
import '../styles/landing-mockup.css';

export function LandingPage({ onSignInWithGoogle, onSignInWithEmail, onSignUp }) {
  const [showAuth, setShowAuth] = useState(null); // null | 'login' | 'signup'

  const handleGetStarted = (mode = 'signup') => setShowAuth(mode);
  const handleCloseAuth = () => setShowAuth(null);

  if (showAuth) {
    return (
      <LoginPage
        mode={showAuth}
        onClose={handleCloseAuth}
        onSignInWithGoogle={onSignInWithGoogle}
        onSignInWithEmail={onSignInWithEmail}
        onSignUp={onSignUp}
      />
    );
  }

  return (
    <div className="landing-mockup">

      {/* ═══════════════════════════════
          NAV — Anonymous / Marketing only
          No app-switcher. No back-office links.
      ═══════════════════════════════ */}
      <header className="landing-header">
        <div className="landing-container">
          <div className="landing-nav">

            <a href="#" className="landing-brand">
              <div className="landing-logo" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
                  <path d="M10 30C16 18 32 18 38 30" stroke="#C9A96E" strokeWidth="3.2" strokeLinecap="round"/>
                  <path d="M26 14C22.5 15.5 20.5 18.8 20.7 22.2C24.1 22.4 27.4 20.4 28.9 16.9C29.6 15.2 29.1 13.6 28 12.7C27.1 11.9 25.7 12.2 26 14Z" fill="rgba(255,255,255,.92)"/>
                  <path d="M21 26C24 22 28 19.5 33 17.6" stroke="rgba(255,255,255,.92)" strokeWidth="2.6" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="landing-brand-text">
                <div className="landing-brand-line">
                  <div className="landing-brand-newleaf">NewLeaf</div>
                  <div className="landing-brand-system">System</div>
                </div>
                <div className="landing-brand-tagline">Defined-Risk Trading OS</div>
              </div>
            </a>

            <nav className="landing-nav-links">
              <a href="#how-it-works">How It Works</a>
              <a href="#watch">Watch</a>
              <a href="#apps">Platform</a>
              <a href="#get-started">Pricing</a>
            </nav>

            <div className="landing-nav-actions">
              <button className="landing-btn-link" onClick={() => handleGetStarted('login')}>Sign In</button>
              <button className="landing-btn-primary" onClick={() => handleGetStarted('signup')}>Get Started Free</button>
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════
          HERO — Dark with system diagram
      ═══════════════════════════════ */}
      <section className="landing-hero lh-dark">
        <div className="landing-container">
          <div className="hero-inner-dark">

            {/* Left copy */}
            <div>
              <div className="hero-pill-dark">
                <span className="hero-dot-dark"></span> Defined-Risk Options Platform
              </div>

              <h1 className="hero-h1-dark">
                One system.<br /><em>Every step</em><br />of the trade.
              </h1>

              <p className="hero-sub-dark">
                Discover analyst-curated options strategies, understand every Greek before
                you allocate, and execute with precision — all backed by institutional-grade
                analysis with fully defined risk.
              </p>

              <div className="hero-cta-row">
                <button className="landing-btn-gold" onClick={() => handleGetStarted('signup')}>
                  Start Free →
                </button>
                <button className="landing-btn-ghost-dark" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                  See How It Works
                </button>
              </div>

              {/* Metrics row */}
              <div className="hero-metrics-dark">
                <div className="hmd-item">
                  <div className="hmd-val">150+</div>
                  <div className="hmd-label">Symbols scanned</div>
                </div>
                <div className="hmd-div"></div>
                <div className="hmd-item">
                  <div className="hmd-val">100%</div>
                  <div className="hmd-label">Defined risk</div>
                </div>
                <div className="hmd-div"></div>
                <div className="hmd-item">
                  <div className="hmd-val">3</div>
                  <div className="hmd-label">Scoring pillars</div>
                </div>
                <div className="hmd-div"></div>
                <div className="hmd-item">
                  <div className="hmd-val">1</div>
                  <div className="hmd-label">Connected hub</div>
                </div>
              </div>

              {/* Social proof */}
              <div className="hero-social-proof-dark">
                <div className="hsp-avatars">
                  <div className="hsp-av" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>M</div>
                  <div className="hsp-av" style={{background:'linear-gradient(135deg,#0d9488,#0f766e)'}}>S</div>
                  <div className="hsp-av" style={{background:'linear-gradient(135deg,#d97706,#b45309)'}}>R</div>
                  <div className="hsp-av" style={{background:'linear-gradient(135deg,#dc2626,#b91c1c)'}}>K</div>
                  <div className="hsp-av" style={{background:'linear-gradient(135deg,#0B2D23,#0b2c22)'}}>I</div>
                </div>
                <div className="hsp-text">
                  <div className="hsp-val">Trusted by <strong>500+</strong> retail traders</div>
                  <div className="hsp-stars">★★★★★ <span>4.9 average</span></div>
                </div>
              </div>
            </div>

            {/* Right: Intro video */}
            <div className="hero-diagram">
              <video
                className="hero-intro-video"
                autoPlay
                muted
                loop
                playsInline
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  borderRadius: '16px',
                  border: '1px solid rgba(201, 169, 110, .2)',
                  boxShadow: '0 8px 40px rgba(0,0,0,.4)',
                }}
              >
                <source
                  src="https://pub-554c552d94e74e32822dd23be2656ba0.r2.dev/newleafintro.mp4"
                  type="video/mp4"
                />
              </video>
            </div>

          </div>
        </div>

        {/* Wave transition hero → light */}
        <div className="hero-wave">
          <svg viewBox="0 0 1200 64" preserveAspectRatio="none">
            <path d="M0,0 C200,64 400,64 600,32 C800,0 1000,0 1200,48 L1200,64 L0,64 Z" fill="#F4F5F7"/>
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════
          TICKER STRIP
      ═══════════════════════════════ */}
      <div className="ticker-strip">
        <div className="ticker-track">
          {[
            { color: '#7c3aed', text: 'Gamma Wall Analysis · 150+ Symbols' },
            { color: '#d97706', text: 'Analyst-Curated Strategy Tiles' },
            { color: '#0d9488', text: 'Risk-Budgeted Portfolio Builder' },
            { color: '#dc2626', text: 'Live IB Execution · Human-in-Loop' },
            { color: '#0B2D23', text: 'Single Firestore Hub · Zero Duplication' },
            { color: '#C9A96E', text: '3-Pillar Scoring · Gamma / IV / Trend' },
            { color: '#0d9488', text: 'Theta Decay Tracker · Live P&L' },
            { color: '#dc2626', text: 'Combo Orders · All Legs or None' },
            // duplicate for seamless loop
            { color: '#7c3aed', text: 'Gamma Wall Analysis · 150+ Symbols' },
            { color: '#d97706', text: 'Analyst-Curated Strategy Tiles' },
            { color: '#0d9488', text: 'Risk-Budgeted Portfolio Builder' },
            { color: '#dc2626', text: 'Live IB Execution · Human-in-Loop' },
            { color: '#0B2D23', text: 'Single Firestore Hub · Zero Duplication' },
            { color: '#C9A96E', text: '3-Pillar Scoring · Gamma / IV / Trend' },
            { color: '#0d9488', text: 'Theta Decay Tracker · Live P&L' },
            { color: '#dc2626', text: 'Combo Orders · All Legs or None' },
          ].map((item, i) => (
            <div key={i} className="ticker-item">
              <div className="ticker-dot" style={{background: item.color}}></div>
              {item.text}
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════
          WATCH — Video section
      ═══════════════════════════════ */}
      <section id="watch" className="landing-section">
        <div className="landing-container">
          <div className="section-header">
            <div className="section-kicker">Watch</div>
            <div className="section-h2">See NewLeaf System in action</div>
            <p className="section-p">A 2-minute overview of how structured strategies deliver consistent, defined-risk results — from scan to execution.</p>
          </div>

          <div className="video-shell">
            <div className="video-top">
              <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                <div className="preview-dots" aria-hidden="true">
                  <div className="preview-dot red"></div>
                  <div className="preview-dot yellow"></div>
                  <div className="preview-dot green"></div>
                </div>
                <div style={{fontWeight:800, color:'rgba(17,24,39,.70)', fontSize:'12px'}}>Demo</div>
              </div>
              <div style={{fontSize:'12px', fontWeight:750, color:'rgba(17,24,39,.55)'}}>2:13</div>
            </div>

            <div className="video-body">
              <video
                className="landing-video-player"
                controls
                preload="metadata"
                poster=""
                playsInline
              >
                <source
                  src="https://pub-554c552d94e74e32822dd23be2656ba0.r2.dev/NewLeafSystemOverview.mp4"
                  type="video/mp4"
                />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>

          <div className="exchange-strip">Analyzing options across major exchanges</div>
          <div className="exchanges" aria-hidden="true">
            <div>NYSE</div><div>NASDAQ</div><div>CBOE</div><div>S&amp;P 500</div><div>Russell 2000</div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════
          HOW IT WORKS — Pipeline
          Quant/workbench described as "the engine",
          not as apps the investor navigates to.
      ═══════════════════════════════ */}
      <section id="how-it-works" className="pipeline-sec">
        <div className="landing-container">
          <div className="section-header" style={{marginBottom:'44px'}}>
            <div className="section-kicker">How It Works</div>
            <div className="section-h2">Research → Design → <em style={{fontStyle:'italic',color:'#0B2D23'}}>Invest</em> → Execute</div>
            <p className="section-p">Every strategy tile you see has been through a rigorous 4-stage pipeline — so by the time it reaches you, the hard work is already done.</p>
          </div>
          <div className="pipeline-steps">
            <div className="pipe-step ps1">
              <div className="pipe-icon-wrap">
                <div className="pipe-num-badge">01</div>
                <div className="pipe-icon">⚛️</div>
              </div>
              <div className="pipe-name" style={{color:'#7c3aed'}}>Research Engine</div>
              <div className="pipe-verb">Scan &amp; Score</div>
              <div className="pipe-desc">Gamma wall analysis runs across 150+ tickers. Each symbol is scored on Gamma structure, IV environment, and Trend — surfacing only high-conviction setups.</div>
            </div>
            <div className="pipe-arrow pa1">
              <svg viewBox="0 0 28 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="12" x2="20" y2="12" stroke="rgba(124,58,237,.45)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3"/>
                <polygon points="18,6 28,12 18,18" fill="rgba(124,58,237,.7)"/>
              </svg>
            </div>
            <div className="pipe-step ps2">
              <div className="pipe-icon-wrap">
                <div className="pipe-num-badge">02</div>
                <div className="pipe-icon">🔧</div>
              </div>
              <div className="pipe-name" style={{color:'#d97706'}}>Analyst Curation</div>
              <div className="pipe-verb">Build &amp; Approve</div>
              <div className="pipe-desc">An analyst reviews top proposals, builds multi-variant structures, prices each leg with live market quotes, and selects only the best for the investor library.</div>
            </div>
            <div className="pipe-arrow pa2">
              <svg viewBox="0 0 28 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="12" x2="20" y2="12" stroke="rgba(217,119,6,.45)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3"/>
                <polygon points="18,6 28,12 18,18" fill="rgba(217,119,6,.7)"/>
              </svg>
            </div>
            <div className="pipe-step ps3">
              <div className="pipe-icon-wrap">
                <div className="pipe-num-badge">03</div>
                <div className="pipe-icon">📊</div>
              </div>
              <div className="pipe-name" style={{color:'#0d9488'}}>newleaf-trading</div>
              <div className="pipe-verb">Discover &amp; Allocate</div>
              <div className="pipe-desc">You discover curated strategy tiles, understand each trade through rationale, technicals, and Greeks — then build a risk-budgeted portfolio.</div>
            </div>
            <div className="pipe-arrow pa3">
              <svg viewBox="0 0 28 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="12" x2="20" y2="12" stroke="rgba(13,148,136,.45)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3"/>
                <polygon points="18,6 28,12 18,18" fill="rgba(13,148,136,.7)"/>
              </svg>
            </div>
            <div className="pipe-step ps4">
              <div className="pipe-icon-wrap">
                <div className="pipe-num-badge">04</div>
                <div className="pipe-icon">⚡</div>
              </div>
              <div className="pipe-name" style={{color:'#dc2626'}}>Execution</div>
              <div className="pipe-verb">Confirm &amp; Execute</div>
              <div className="pipe-desc">Live IB quotes fetched per leg. Combo orders placed — all legs fill together or none fill at all. Human confirmation required before every trade.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════
          PLATFORM — App cards
          Quant/workbench = engine (no links)
          Trading = investor CTA
          Desk = internal, described only
      ═══════════════════════════════ */}
      <section id="apps" className="landing-section">
        <div className="landing-container">
          <div className="section-header">
            <div className="section-kicker">The Platform</div>
            <div className="section-h2">Four layers. <em style={{fontStyle:'italic',color:'#0B2D23'}}>One experience.</em></div>
            <p className="section-p">Two back-end engines that do the research. One investor platform where you trade. One execution layer that places the orders — all connected through a single live data hub.</p>
          </div>

          <div className="app-cards-grid">

            <div className="app-card ac-q">
              <div className="ac-top">
                <div className="ac-icon ac-icon-q">⚛️</div>
                <div className="ac-badge b-engine">⚙ Research Engine</div>
              </div>
              <div className="ac-name">newleaf-quant</div>
              <div className="ac-role">The intelligence layer — runs behind the scenes</div>
              <div className="ac-desc">Scans 150+ symbols daily for gamma wall structures, elevated IV environments, and trend alignment. Every strategy tile you see started here.</div>
              <ul className="ac-features">
                <li>Gamma wall + ATM IV analysis</li>
                <li>3-pillar scoring: Gamma / IV / Trend</li>
                <li>Bulk scan engine — 150 symbols per run</li>
                <li>AI-powered trade rationale generation</li>
              </ul>
              <div className="ac-engine-note">⚙ Powers your curated strategy tiles</div>
            </div>

            <div className="app-card ac-w">
              <div className="ac-top">
                <div className="ac-icon ac-icon-w">🔧</div>
                <div className="ac-badge b-engine">⚙ Curation Engine</div>
              </div>
              <div className="ac-name">newleaf-workbench</div>
              <div className="ac-role">Analyst tool — curates what you see in the library</div>
              <div className="ac-desc">An analyst reviews all quant proposals, builds multi-variant structures with live IB pricing, and hand-picks the best setups for the investor tile library.</div>
              <ul className="ac-features">
                <li>Multi-variant Trade Builder</li>
                <li>Live IB quote pricing per leg</li>
                <li>Tile promotion to investor library</li>
                <li>Quality filter before anything reaches you</li>
              </ul>
              <div className="ac-engine-note">⚙ Curates what appears in your strategy library</div>
            </div>

            <div className="app-card ac-t">
              <div className="ac-top">
                <div className="ac-icon ac-icon-t">📊</div>
                <div className="ac-badge b-live">● Your Platform</div>
              </div>
              <div className="ac-name">newleaf-trading</div>
              <div className="ac-role">Investor Platform — this is where you trade</div>
              <div className="ac-desc">Discover curated strategy tiles, understand each trade through rationale, technicals, and Greeks. Build a risk-budgeted portfolio and track theta decay in real time.</div>
              <ul className="ac-features">
                <li>Curated strategy tile discovery</li>
                <li>Portfolio builder + fund allocation</li>
                <li>Theta decay tracker + live P&L</li>
                <li>Performance analytics dashboard</li>
              </ul>
              <button className="ac-cta-btn" onClick={() => handleGetStarted('signup')}>
                Start Free on newleaf-trading →
              </button>
            </div>

            <div className="app-card ac-d">
              <div className="ac-top">
                <div className="ac-icon ac-icon-d">⚡</div>
                <div className="ac-badge b-new">● Execution Layer</div>
              </div>
              <div className="ac-name">newleaf-desk</div>
              <div className="ac-role">Execution layer — live order placement</div>
              <div className="ac-desc">Once you've built your portfolio allocation, the execution desk reads your quantities, fetches live IB quotes per leg, and places combo orders — all with your confirmation.</div>
              <ul className="ac-features">
                <li>Reads your portfolio allocation automatically</li>
                <li>Live IB quotes — fresh snapshot per leg</li>
                <li>Combo orders — all legs fill or none fill</li>
                <li>Human-in-the-loop, one trade at a time</li>
              </ul>
              <div className="ac-engine-note">⚙ Available from your dashboard after sign-up</div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════
          ARCHITECTURE — Hub section
      ═══════════════════════════════ */}
      <section className="hub-sec-landing">
        <div className="landing-container">
          <div className="hub-grid-landing">
            <div className="hub-visual-landing">
              <div className="hub-box-landing">
                <div className="hub-box-icon">🔗</div>
                <div className="hub-box-title">Always in Sync</div>
                <div className="hub-box-sub">One login · All four apps</div>
                <div className="hub-box-desc">Changes made in one app are<br/>instantly visible in all the others.<br/>No exports. No stale data. Ever.</div>
              </div>
              <div className="hub-cols-landing">
                {[
                  { color:'#7c3aed', app:'Research Engine', flow:'Writes proposals & scores' },
                  { color:'#d97706', app:'Curation Engine', flow:'Promotes strategy tiles' },
                  { color:'#0d9488', app:'newleaf-trading', flow:'Writes portfolio allocation' },
                  { color:'#dc2626', app:'Execution Desk', flow:'Reads qty · writes fills' },
                ].map((item, i) => (
                  <div key={i} className="hub-col-landing">
                    <div className="hc-dot" style={{background: item.color}}></div>
                    <div>
                      <div className="hc-app">{item.app}</div>
                      <div className="hc-flow">{item.flow}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="section-kicker" style={{textAlign:'left'}}>Architecture</div>
              <div className="section-h2" style={{textAlign:'left',marginBottom:'12px'}}>One data layer.<br/><em style={{fontStyle:'italic',color:'#0B2D23'}}>Zero duplication.</em></div>
              <p className="section-p" style={{textAlign:'left',marginBottom:'28px'}}>The moment the analyst approves a strategy, you see it. The moment you allocate, execution is ready. The pipeline moves at market speed.</p>
              <div className="hub-points-landing">
                {[
                  { icon:'🔐', title:'One login, everywhere', desc:"Sign in once and your identity, portfolio, and allocations are shared across the full system. The portfolio you build is the exact one execution reads from." },
                  { icon:'⚡', title:'Strategies appear the moment they\'re published', desc:"When the analyst approves a new tile, it appears in your library within seconds — no manual refresh, no batch updates. Always current." },
                  { icon:'🛡️', title:'Every position is defined-risk', desc:"Every strategy on the platform has a known maximum loss. No naked exposure. You always know the worst case before you enter a trade." },
                ].map((pt, i) => (
                  <div key={i} className="hub-point">
                    <div className="hp-icon-landing">{pt.icon}</div>
                    <div>
                      <div className="hp-title">{pt.title}</div>
                      <div className="hp-desc">{pt.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════
          FINAL CTA
      ═══════════════════════════════ */}
      <section className="landing-section" id="get-started">
        <div className="landing-container">
          <div className="final-cta">
            <div>
              <h3>Operate your portfolio like a system.</h3>
              <p>Start free on newleaf-trading. Explore today's curated strategy library, build your risk-budgeted portfolio, and execute with full confidence.</p>
            </div>
            <div className="final-cta-right">
              <button className="landing-btn-ghost btn-gold" onClick={() => handleGetStarted('signup')}>View Pricing</button>
              <button className="landing-btn-primary" onClick={() => handleGetStarted('signup')}>Start Free →</button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════
          FOOTER
      ═══════════════════════════════ */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="footer-row">
            <div className="footer-text">
              <strong>Disclaimer:</strong> NewLeaf System is an educational and decision-support platform. It does not provide personalised financial advice.
              Options trading involves significant risk and may not be suitable for all investors. Past performance does not guarantee future results.
            </div>
            <div className="footer-copy">© 2026 NewLeaf System</div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', marginTop: 16, paddingTop: 16, display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/privacy-policy" style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms-and-conditions" style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, textDecoration: 'none' }}>Terms &amp; Conditions</a>
            <a href="mailto:support@newleafsystem.com" style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, textDecoration: 'none' }}>Contact</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
