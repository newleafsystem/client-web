/**
 * Workbench embedded runtime.
 *
 * React owns BrandBar, Footer, auth state, and role-gated navigation for every
 * /workbench route. These static pages are rendered only as embedded content
 * under /workbench-static/*.html.
 */
(function () {
  const RAW_PREFIX = '/workbench-static/';
  const EMBEDDED_PARAM = 'embedded';
  const LOADER_STYLE_ID = 'nl-workbench-loader-critical';
  const LOADER_ID = 'nl-workbench-fetch-loader';
  const MODAL_STYLE_ID = 'nl-workbench-modal-critical';
  let activeFetches = 0;
  let hideLoaderTimer = null;
  let activeModal = null;

  function pageFromRawPath(pathname) {
    if (!pathname.startsWith(RAW_PREFIX)) return null;
    const file = pathname.slice(RAW_PREFIX.length).replace(/\.html$/i, '');
    return file && file !== 'index' ? file : '';
  }

  function canonicalWorkbenchUrl(url) {
    if (url.pathname.startsWith(RAW_PREFIX)) {
      const page = pageFromRawPath(url.pathname);
      return `${page ? `/workbench/${page}` : '/workbench'}${cleanSearch(url.search)}${url.hash || ''}`;
    }

    if (url.pathname.startsWith('/workbench/')) {
      const normalized = url.pathname
        .replace(/\.html$/i, '')
        .replace(/\/index$/i, '')
        .replace(/\/+$/, '');
      return `${normalized || '/workbench'}${url.search || ''}${url.hash || ''}`;
    }

    if (url.pathname === '/workbench') {
      return `${url.pathname}${url.search || ''}${url.hash || ''}`;
    }

    return null;
  }

  function cleanSearch(search) {
    const params = new URLSearchParams(search || '');
    params.delete(EMBEDDED_PARAM);
    const next = params.toString();
    return next ? `?${next}` : '';
  }

  function isEmbedded() {
    return new URLSearchParams(window.location.search).get(EMBEDDED_PARAM) === '1';
  }

  function redirectDirectRawPage() {
    if (isEmbedded()) return false;
    const current = new URL(window.location.href);
    const target = canonicalWorkbenchUrl(current);
    if (!target) return false;
    window.location.replace(target);
    return true;
  }

  function injectBaseStyles() {
    if (document.getElementById(LOADER_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = LOADER_STYLE_ID;
    style.textContent = [
      'body.nl-workbench-embedded{padding-top:0!important;margin-top:0!important}',
      'body.nl-workbench-embedded>nav,body.nl-workbench-embedded>footer{display:none!important}',
      '#nl-workbench-fetch-loader{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(247,245,239,.78);backdrop-filter:blur(2px)}',
      '#nl-workbench-fetch-loader[hidden]{display:none!important}',
      '.nl-loader-card{display:flex;align-items:center;gap:12px;padding:14px 18px;border:1px solid rgba(201,169,110,.35);border-radius:10px;background:#fff;color:#0b2d23;box-shadow:0 18px 45px rgba(11,45,35,.12);font:700 13px/1.2 Inter,system-ui,sans-serif}',
      '.nl-loader-mark{position:relative;width:28px;height:28px;display:inline-block}',
      '.nl-loader-mark:before,.nl-loader-mark:after{content:"";position:absolute;border-radius:999px;background:#155a42;animation:nl-leaf-pulse 1.1s ease-in-out infinite}',
      '.nl-loader-mark:before{width:17px;height:24px;left:3px;top:2px;transform:rotate(-28deg);transform-origin:bottom right}',
      '.nl-loader-mark:after{width:17px;height:24px;right:3px;top:2px;transform:rotate(28deg);transform-origin:bottom left;animation-delay:.16s;background:#d7b56d}',
      '@keyframes nl-leaf-pulse{0%,100%{opacity:.55;scale:.9}50%{opacity:1;scale:1}}',
    ].join('');
    document.head.appendChild(style);
  }

  function installEmbeddedMode() {
    document.body.classList.add('nl-workbench-embedded');
    injectBaseStyles();
  }

  function getLoader() {
    let loader = document.getElementById(LOADER_ID);
    if (!loader) {
      loader = document.createElement('div');
      loader.id = LOADER_ID;
      loader.hidden = true;
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-live', 'polite');
      loader.innerHTML = '<div class="nl-loader-card"><span class="nl-loader-mark" aria-hidden="true"></span><span>Loading market data</span></div>';
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
    }, 140);
  }

  function shouldTrackFetch(input) {
    const value = typeof input === 'string' ? input : (input && input.url) || '';
    return Boolean(value) && (
      value.indexOf('/api/v1/public/') !== -1 ||
      value.indexOf('/api/v1/market/') !== -1 ||
      value.indexOf('/reports/') !== -1 ||
      value.indexOf('/r2') !== -1 ||
      value.indexOf('watchlist-snapshots.json') !== -1 ||
      value.indexOf('company-metadata.json') !== -1 ||
      value.indexOf('manifest.json') !== -1
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

  function injectModalStyles() {
    if (document.getElementById(MODAL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MODAL_STYLE_ID;
    style.textContent = [
      '.nl-modal-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(9,21,16,.52);backdrop-filter:blur(4px)}',
      '.nl-modal-card{width:min(460px,100%);max-height:min(82vh,720px);display:flex;flex-direction:column;border-radius:10px;border:1px solid #b9ddc9;background:#fff;box-shadow:0 24px 80px rgba(11,45,35,.28);overflow:hidden;color:#0b2d23;font-family:Inter,system-ui,sans-serif}',
      '.nl-modal-head{padding:18px 22px;background:#f4fbf7;border-bottom:1px solid #b9ddc9}',
      '.nl-modal-card[data-tone="danger"]{border-color:#f3b8b0}.nl-modal-card[data-tone="danger"] .nl-modal-head{background:#fff4f2;border-bottom-color:#f3b8b0}.nl-modal-card[data-tone="danger"] .nl-modal-title{color:#b42318}.nl-modal-card[data-tone="danger"] .nl-modal-primary{background:#b42318;border-color:#b42318}',
      '.nl-modal-card[data-tone="warning"]{border-color:#ead49a}.nl-modal-card[data-tone="warning"] .nl-modal-head{background:#fff8e7;border-bottom-color:#ead49a}.nl-modal-card[data-tone="warning"] .nl-modal-title{color:#9a6a14}.nl-modal-card[data-tone="warning"] .nl-modal-primary{background:#9a6a14;border-color:#9a6a14}',
      '.nl-modal-title{margin:0;color:#0b5d3b;font-size:18px;line-height:1.25;font-weight:800}',
      '.nl-modal-body{padding:20px 22px 4px;color:#2f493f;font-size:14px;line-height:1.6;white-space:pre-line;overflow:auto}',
      '.nl-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:20px 22px 22px}',
      '.nl-modal-secondary,.nl-modal-primary{min-height:40px;border-radius:8px;padding:0 16px;font-weight:800;cursor:pointer}',
      '.nl-modal-secondary{border:1px solid #d8e2dc;background:#fff;color:#345247}',
      '.nl-modal-primary{border:1px solid #0b5d3b;background:#0b5d3b;color:#fff}',
    ].join('');
    document.head.appendChild(style);
  }

  function closeModal(result) {
    if (!activeModal) return;
    const current = activeModal;
    activeModal = null;
    current.overlay.remove();
    current.resolve(result);
  }

  function openModal(options) {
    injectModalStyles();
    if (activeModal) closeModal(false);
    return new Promise(function (resolve) {
      const overlay = document.createElement('div');
      overlay.className = 'nl-modal-overlay';
      const card = document.createElement('section');
      card.className = 'nl-modal-card';
      card.dataset.tone = options.tone || 'info';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.innerHTML = '<div class="nl-modal-head"><h2 class="nl-modal-title"></h2></div><div class="nl-modal-body"></div><div class="nl-modal-actions"></div>';
      card.querySelector('.nl-modal-title').textContent = options.title || 'Notice';
      card.querySelector('.nl-modal-body').textContent = options.message || '';
      const actions = card.querySelector('.nl-modal-actions');
      if (options.kind === 'decision') {
        const secondary = document.createElement('button');
        secondary.type = 'button';
        secondary.className = 'nl-modal-secondary';
        secondary.textContent = options.secondaryLabel || 'Cancel';
        secondary.addEventListener('click', function () { closeModal(false); });
        actions.appendChild(secondary);
      }
      const primary = document.createElement('button');
      primary.type = 'button';
      primary.className = 'nl-modal-primary';
      primary.textContent = options.primaryLabel || 'OK';
      primary.addEventListener('click', function () { closeModal(true); });
      actions.appendChild(primary);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      activeModal = { overlay: overlay, resolve: resolve };
      setTimeout(function () { primary.focus(); }, 0);
    });
  }

  function installModalRuntime() {
    if (window.NewLeafModal) return;
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeModal(false);
    });
    window.NewLeafModal = {
      showMessage: function (options) {
        return openModal(Object.assign({ kind: 'message', tone: 'info' }, options || {}));
      },
      showError: function (options) {
        return openModal(Object.assign({ kind: 'message', tone: 'danger' }, options || {}));
      },
      requestDecision: function (options) {
        return openModal(Object.assign({ kind: 'decision', tone: 'warning' }, options || {}));
      },
    };
  }

  function installWorkbenchLinkBridge() {
    document.addEventListener('click', function (event) {
      const anchor = event.target.closest && event.target.closest('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.getAttribute('href'), window.location.href);
      if (url.origin !== window.location.origin) return;
      const target = canonicalWorkbenchUrl(url);
      if (!target) return;
      event.preventDefault();
      window.parent.location.href = target;
    });
  }

  function postHeight() {
    if (window.parent === window) return;
    const body = document.body;
    const doc = document.documentElement;
    const height = Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      doc?.clientHeight || 0,
      doc?.scrollHeight || 0,
      doc?.offsetHeight || 0
    );
    window.parent.postMessage({ type: 'newleaf:workbench-height', height }, window.location.origin);
  }

  function installHeightRelay() {
    window.addEventListener('load', postHeight);
    window.addEventListener('resize', postHeight);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(postHeight);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
    }
    setTimeout(postHeight, 0);
    setTimeout(postHeight, 300);
    setTimeout(postHeight, 1200);
  }

  if (redirectDirectRawPage()) return;
  installEmbeddedMode();
  installFetchLoader();
  installModalRuntime();
  installWorkbenchLinkBridge();
  installHeightRelay();
})();
