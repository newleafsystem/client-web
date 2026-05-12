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
  const LOADER_STYLE_ID = 'nl-workbench-loader-critical';
  const LOADER_ID = 'nl-workbench-fetch-loader';
  let activeFetches = 0;
  let hideLoaderTimer = null;

  function navLinks() {
    return [
      ['Picks', '/picks'],
      ['Workbench', '/workbench/'],
      ['Invest', '/invest'],
      ['Quant', '/quant'],
      ['Desk', '/desk'],
      ['Blog', '/blog'],
      ['How it works', '/how-we-pick'],
    ].map(function (item) {
      return '<li><a class="nl-nav-link" href="' + item[1] + '">' + item[0] + '</a></li>';
    }).join('');
  }

  function fallbackMarkup() {
    return `
      <nav class="nl-nav nl-nav--workbench" ${FALLBACK_ATTR} aria-label="NewLeaf Workbench navigation">
        <div class="nl-brand-zone">
          <a class="nl-nav-brand" href="/">
            <img src="/logo-icon.png" width="36" height="36" alt="NewLeaf" />
            <span class="nl-nav-wordmark">NewLeaf <em>System</em></span>
          </a>
        </div>
        <ul class="nl-nav-links">${navLinks()}</ul>
        <div class="nl-nav-right">
          <a class="nl-nav-ghost" href="/signin">Sign In</a>
          <a class="nl-nav-cta" href="/register">Get Started &rarr;</a>
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
        --brand-evergreen: #155a42;
        --brand-gold: #d7b56d;
        --brand-cream: #f7f5ef;
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
      @media (max-width: 1180px) {
        .nl-nav { height: 60px; padding: 0 1rem; }
        .nl-nav-spacer { height: 60px; }
        .nl-nav-links, .nl-nav-right { display: none; }
        .nl-hamburger { display: flex; align-items: center; justify-content: center; color: var(--brand-gold); border: 1px solid rgba(215,181,109,.25); background: transparent; border-radius: 4px; padding: 6px 10px; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectLoaderStyles() {
    if (document.getElementById(LOADER_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = LOADER_STYLE_ID;
    style.textContent = `
      .nl-workbench-fetch-loader {
        position: fixed;
        inset: 0;
        z-index: 400;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(6,28,21,.22);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        pointer-events: none;
      }
      .nl-workbench-fetch-loader[hidden] { display: none; }
      .nl-global-data-loader-card {
        padding: 16px 20px;
        border: 1px solid rgba(215,181,109,.24);
        border-radius: 8px;
        background: rgba(247,245,239,.96);
        box-shadow: 0 18px 46px rgba(6,28,21,.18);
      }
      .leaf-loader {
        display: grid;
        justify-items: center;
        gap: 12px;
        color: var(--brand-evergreen);
        text-align: center;
      }
      .leaf-loader-compact {
        display: inline-flex;
        align-items: center;
        justify-items: start;
        gap: 8px;
        text-align: left;
      }
      .leaf-loader-mark {
        position: relative;
        display: grid;
        place-items: center;
        width: 82px;
        height: 82px;
      }
      .leaf-loader-compact .leaf-loader-mark {
        width: 30px;
        height: 30px;
        flex: 0 0 30px;
      }
      .leaf-loader-ground,
      .leaf-loader-stem,
      .leaf-loader-sprout,
      .leaf-loader-canopy {
        position: absolute;
        display: block;
      }
      .leaf-loader-ground {
        left: 15px;
        right: 15px;
        bottom: 10px;
        height: 4px;
        border-radius: 999px;
        background: var(--brand-gold);
        animation: loader-ground 2.4s ease-in-out infinite;
      }
      .leaf-loader-stem {
        left: 50%;
        bottom: 13px;
        width: 7px;
        height: 50px;
        border-radius: 999px;
        background: linear-gradient(180deg, #5e8c52, #27745c);
        transform: translateX(-50%) scaleY(.12);
        transform-origin: 50% 100%;
        animation: loader-stem-grow 2.4s ease-in-out infinite;
      }
      .leaf-loader-sprout,
      .leaf-loader-canopy {
        border-radius: 72% 0 72% 0;
        background: linear-gradient(145deg, #cfeedd, #27745c);
        box-shadow: 0 8px 20px rgba(39,116,92,.24);
        transform-origin: 50% 88%;
      }
      .leaf-loader-sprout {
        bottom: 26px;
        width: 18px;
        height: 24px;
        opacity: 0;
        animation: loader-sprout-grow 2.4s ease-in-out infinite;
      }
      .leaf-loader-sprout-left {
        --leaf-rotate: -54deg;
        --loader-x: 0;
        left: 28px;
      }
      .leaf-loader-sprout-right {
        --leaf-rotate: 36deg;
        --loader-x: 0;
        right: 28px;
        animation-delay: 90ms;
      }
      .leaf-loader-canopy {
        width: 29px;
        height: 40px;
        opacity: 0;
        animation: loader-canopy-grow 2.4s ease-in-out infinite;
      }
      .leaf-loader-canopy-left {
        --canopy-rotate: -42deg;
        --loader-x: 0;
        left: 25px;
        bottom: 36px;
      }
      .leaf-loader-canopy-top {
        --canopy-rotate: 0deg;
        --loader-x: -50%;
        left: 50%;
        bottom: 44px;
        animation-delay: 120ms;
      }
      .leaf-loader-canopy-right {
        --canopy-rotate: 42deg;
        --loader-x: 0;
        right: 25px;
        bottom: 36px;
        animation-delay: 240ms;
      }
      .leaf-loader-compact .leaf-loader-ground {
        left: 5px;
        right: 5px;
        bottom: 4px;
        height: 2px;
      }
      .leaf-loader-compact .leaf-loader-stem {
        bottom: 6px;
        width: 3px;
        height: 18px;
      }
      .leaf-loader-compact .leaf-loader-sprout {
        bottom: 11px;
        width: 7px;
        height: 10px;
      }
      .leaf-loader-compact .leaf-loader-sprout-left { left: 8px; }
      .leaf-loader-compact .leaf-loader-sprout-right { right: 8px; }
      .leaf-loader-compact .leaf-loader-canopy {
        width: 10px;
        height: 14px;
        box-shadow: none;
      }
      .leaf-loader-compact .leaf-loader-canopy-left {
        left: 8px;
        bottom: 14px;
      }
      .leaf-loader-compact .leaf-loader-canopy-top { bottom: 17px; }
      .leaf-loader-compact .leaf-loader-canopy-right {
        right: 8px;
        bottom: 14px;
      }
      .leaf-loader-label {
        color: #53685e;
        font-size: .88rem;
        font-weight: 750;
      }
      .leaf-loader-compact .leaf-loader-label {
        color: inherit;
        font-size: inherit;
      }
      @keyframes loader-ground {
        0%, 100% { transform: scaleX(.36); opacity: .46; }
        46%, 72% { transform: scaleX(1); opacity: 1; }
      }
      @keyframes loader-stem-grow {
        0% { transform: translateX(-50%) scaleY(.12); opacity: .38; }
        32%, 72% { transform: translateX(-50%) scaleY(1); opacity: 1; }
        100% { transform: translateX(-50%) scaleY(.18); opacity: .5; }
      }
      @keyframes loader-sprout-grow {
        0%, 20% {
          opacity: 0;
          transform: translateX(var(--loader-x)) rotate(var(--leaf-rotate)) scale(0);
        }
        44%, 76% {
          opacity: 1;
          transform: translateX(var(--loader-x)) rotate(var(--leaf-rotate)) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateX(var(--loader-x)) rotate(var(--leaf-rotate)) scale(.22);
        }
      }
      @keyframes loader-canopy-grow {
        0%, 28% {
          opacity: 0;
          transform: translateX(var(--loader-x)) rotate(var(--canopy-rotate)) scale(.15);
        }
        54%, 80% {
          opacity: 1;
          transform: translateX(var(--loader-x)) rotate(var(--canopy-rotate)) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateX(var(--loader-x)) rotate(var(--canopy-rotate)) scale(.35);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getLoader() {
    injectLoaderStyles();
    let loader = document.getElementById(LOADER_ID);
    if (!loader) {
      loader = document.createElement('div');
      loader.id = LOADER_ID;
      loader.className = 'nl-workbench-fetch-loader';
      loader.hidden = true;
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-live', 'polite');
      loader.innerHTML = [
        '<div class="nl-global-data-loader-card">',
        '<div class="leaf-loader leaf-loader-compact">',
        '<span class="leaf-loader-mark" aria-hidden="true">',
        '<span class="leaf-loader-ground"></span>',
        '<span class="leaf-loader-stem"></span>',
        '<span class="leaf-loader-sprout leaf-loader-sprout-left"></span>',
        '<span class="leaf-loader-sprout leaf-loader-sprout-right"></span>',
        '<span class="leaf-loader-canopy leaf-loader-canopy-left"></span>',
        '<span class="leaf-loader-canopy leaf-loader-canopy-top"></span>',
        '<span class="leaf-loader-canopy leaf-loader-canopy-right"></span>',
        '</span>',
        '<span class="leaf-loader-label">Loading market data</span>',
        '</div>',
        '</div>'
      ].join('');
      document.body.appendChild(loader);
    }
    return loader;
  }

  function setLoaderVisible(visible) {
    const loader = getLoader();
    clearTimeout(hideLoaderTimer);
    if (visible) {
      loader.hidden = false;
      return;
    }
    hideLoaderTimer = setTimeout(function () {
      if (activeFetches === 0) loader.hidden = true;
    }, 120);
  }

  function shouldTrackFetch(input) {
    const value = typeof input === 'string' ? input : (input && input.url) || '';
    if (!value || value.indexOf('nav-component.html') !== -1) return false;
    return (
      value.indexOf('/reports/') !== -1 ||
      value.indexOf('/r2') !== -1 ||
      value.indexOf('/api/v1/public/') !== -1 ||
      value.indexOf('watchlist-snapshots.json') !== -1 ||
      value.indexOf('manifest.json') !== -1 ||
      value.indexOf('company-metadata.json') !== -1
    );
  }

  function installFetchLoader() {
    if (window.__newleafWorkbenchFetchLoaderInstalled || typeof window.fetch !== 'function') return;
    window.__newleafWorkbenchFetchLoaderInstalled = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function () {
      const track = shouldTrackFetch(arguments[0]);
      if (track) {
        activeFetches += 1;
        setLoaderVisible(true);
      }
      return nativeFetch.apply(null, arguments).finally(function () {
        if (track) {
          activeFetches = Math.max(0, activeFetches - 1);
          if (activeFetches === 0) setLoaderVisible(false);
        }
      });
    };
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
      const response = await fetch('/workbench/nav-component.html');
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
    }
  }

  mountFallback();
  installFetchLoader();
  upgradeNav();
})();
