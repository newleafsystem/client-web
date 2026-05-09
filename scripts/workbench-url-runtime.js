/**
 * Keeps static Workbench links extensionless even when source files remain .html.
 */
(function () {
  function cleanUrl(value) {
    if (!value || /^(mailto:|tel:|#)/i.test(value)) return value;

    var url;
    try {
      url = new URL(value, window.location.href);
    } catch (_err) {
      return value;
    }

    if (url.origin !== window.location.origin) return value;
    if (url.pathname.endsWith('/nav-component.html')) return value;

    if (url.pathname.endsWith('/index.html')) {
      url.pathname = url.pathname.slice(0, -'index.html'.length) || '/';
    } else if (url.pathname.endsWith('.html')) {
      url.pathname = url.pathname.slice(0, -'.html'.length);
    }

    return url.pathname + url.search + url.hash;
  }

  function normalizeElementLinks(root) {
    var scope = root || document;
    scope.querySelectorAll('a[href]').forEach(function (anchor) {
      anchor.setAttribute('href', cleanUrl(anchor.getAttribute('href')));
    });
    scope.querySelectorAll('[data-href]').forEach(function (node) {
      node.dataset.href = cleanUrl(node.dataset.href);
    });
  }

  function normalizeCurrentLocation() {
    var clean = cleanUrl(window.location.href);
    if (clean !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, '', clean);
    }
  }

  window.NewLeafRoutes = {
    cleanUrl: cleanUrl,
    navigate: function (value) {
      window.location.href = cleanUrl(value);
    },
  };

  normalizeCurrentLocation();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { normalizeElementLinks(document); });
  } else {
    normalizeElementLinks(document);
  }

  document.addEventListener('click', function (event) {
    var anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    var clean = cleanUrl(anchor.getAttribute('href'));
    if (clean !== anchor.getAttribute('href')) {
      anchor.setAttribute('href', clean);
    }
  }, true);

  if ('MutationObserver' in window) {
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) normalizeElementLinks(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
