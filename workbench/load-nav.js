/**
 * NewLeaf Workbench navigation loader.
 *
 * Static Workbench pages cannot import the React BrandBar directly, so this
 * mounts a small header immediately and then upgrades it with the generated
 * nav-component.html markup once it is fetched.
 */
(function () {
  const FALLBACK_ATTR = 'data-nav-fallback';
  const CRITICAL_STYLE_ID = 'nl-workbench-nav-critical';

  function navLinks() {
    return '';
  }

  function fallbackMarkup() {
    return `
      <nav class="nl-nav nl-nav--workbench" ${FALLBACK_ATTR} aria-label="NewLeaf Workbench navigation">
        <div class="nl-brand-zone">
          <a class="nl-nav-brand" href="/">
            <img src="/logo-icon.png" width="36" height="36" alt="NewLeaf" />
            <span class="nl-nav-wordmark">NewLeaf <em>Workbench</em></span>
          </a>
        </div>
        <ul class="nl-nav-links">${navLinks()}</ul>
        <div class="nl-nav-right">
          <a class="nl-nav-cta" href="/invest">Get Started &rarr;</a>
        </div>
        <button class="nl-hamburger" aria-label="Open menu">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </nav>
      <div class="nl-nav-spacer" ${FALLBACK_ATTR} aria-hidden="true"></div>
    `;
  }

  function injectCriticalStyles() {
    if (document.getElementById(CRITICAL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = CRITICAL_STYLE_ID;
    style.textContent = `
      :root {
        --brand-forest: #0b2d23;
        --brand-gold: #d7b56d;
        --brand-gradient: linear-gradient(135deg, #061c15 0%, #0b2d23 42%, #155a42 78%, #7e682b 100%);
      }
      .nl-nav {
        background: var(--brand-gradient);
        padding: 0 clamp(1.25rem, 3vw, 2.25rem);
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        height: 64px;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        z-index: 100;
        box-shadow: 0 2px 12px rgba(0,0,0,.12);
        box-sizing: border-box;
      }
      .nl-nav-spacer { height: 64px; }
      .nl-brand-zone { grid-column: 1; display: flex; align-items: center; justify-self: start; }
      .nl-nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; white-space: nowrap; }
      .nl-nav-brand img { width: 36px; height: 36px; border-radius: 7px; }
      .nl-nav-wordmark { color: #fff; font: 600 20px Georgia, serif; line-height: 1; }
      .nl-nav-wordmark em { color: var(--brand-gold); font-style: italic; font-weight: 500; }
      .nl-nav-links { grid-column: 2; display: flex; justify-self: center; list-style: none; margin: 0; padding: 0; }
      .nl-nav-link {
        color: rgba(255,255,255,.72);
        display: flex;
        align-items: center;
        height: 64px;
        padding: 0 16px;
        text-decoration: none;
        text-transform: uppercase;
        letter-spacing: .12em;
        font: 700 12px Inter, system-ui, sans-serif;
      }
      .nl-nav-right { grid-column: 3; justify-self: end; display: flex; align-items: center; }
      .nl-nav-cta {
        background: var(--brand-gold);
        color: var(--brand-forest);
        border-radius: 6px;
        padding: 0 22px;
        height: 38px;
        display: flex;
        align-items: center;
        text-decoration: none;
        text-transform: uppercase;
        letter-spacing: .08em;
        font: 800 12px Inter, system-ui, sans-serif;
      }
      .nl-hamburger { display: none; grid-column: 3; justify-self: end; }
      @media (max-width: 1080px) {
        .nl-nav { height: 60px; padding: 0 1rem; }
        .nl-nav-spacer { height: 60px; }
        .nl-nav-links, .nl-nav-right { display: none; }
        .nl-hamburger { display: flex; align-items: center; justify-content: center; color: var(--brand-gold); border: 1px solid rgba(215,181,109,.25); background: transparent; border-radius: 4px; padding: 6px 10px; }
      }
    `;
    document.head.appendChild(style);
  }

  function mountFallback() {
    if (document.querySelector(`.nl-nav[${FALLBACK_ATTR}]`) || document.querySelector('.nl-nav')) return;
    injectCriticalStyles();
    document.body.insertAdjacentHTML('afterbegin', fallbackMarkup());
  }

  function replaceFallback(temp) {
    const nav = temp.querySelector('nav');
    if (!nav) return;
    const spacer = temp.querySelector('.nl-nav-spacer');
    const fallbackNav = document.querySelector(`.nl-nav[${FALLBACK_ATTR}]`);
    const fallbackSpacer = document.querySelector(`.nl-nav-spacer[${FALLBACK_ATTR}]`);

    if (fallbackNav) {
      fallbackNav.replaceWith(nav);
      if (spacer && fallbackSpacer) fallbackSpacer.replaceWith(spacer);
      return;
    }

    document.body.insertBefore(nav, document.body.firstChild);
    if (spacer) nav.insertAdjacentElement('afterend', spacer);
  }

  async function upgradeNav() {
    try {
      const response = await fetch('nav-component.html');
      const navHTML = await response.text();
      const temp = document.createElement('div');
      temp.innerHTML = navHTML;

      temp.querySelectorAll('style').forEach((style) => {
        document.head.appendChild(style.cloneNode(true));
      });

      replaceFallback(temp);

      temp.querySelectorAll('script').forEach((oldScript) => {
        const newScript = document.createElement('script');
        if (oldScript.type) newScript.type = oldScript.type;
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript);
      });
    } catch (error) {
      console.error('Failed to load navigation:', error);
    }
  }

  mountFallback();
  upgradeNav();
})();
