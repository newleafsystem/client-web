/**
 * Shared modal runtime for static Workbench HTML pages.
 * React routes use NotificationProvider; static pages get this equivalent.
 */
(function () {
  if (window.NewLeafModal) return;

  var active = null;
  var stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var style = document.createElement('style');
    style.textContent = [
      '.nl-modal-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(9,21,16,.52);backdrop-filter:blur(4px)}',
      '.nl-modal-card{width:min(440px,100%);border-radius:10px;border:1px solid #b9ddc9;background:#fff;box-shadow:0 24px 80px rgba(11,45,35,.28);overflow:hidden;color:#0b2d23;font-family:Inter,DM Sans,system-ui,-apple-system,BlinkMacSystemFont,sans-serif}',
      '.nl-modal-head{padding:18px 22px;background:#f4fbf7;border-bottom:1px solid #b9ddc9}',
      '.nl-modal-card[data-tone="danger"]{border-color:#f3b8b0}.nl-modal-card[data-tone="danger"] .nl-modal-head{background:#fff4f2;border-bottom-color:#f3b8b0}.nl-modal-card[data-tone="danger"] .nl-modal-title{color:#b42318}.nl-modal-card[data-tone="danger"] .nl-modal-primary{background:#b42318;border-color:#b42318}',
      '.nl-modal-card[data-tone="warning"]{border-color:#ead49a}.nl-modal-card[data-tone="warning"] .nl-modal-head{background:#fff8e7;border-bottom-color:#ead49a}.nl-modal-card[data-tone="warning"] .nl-modal-title{color:#9a6a14}.nl-modal-card[data-tone="warning"] .nl-modal-primary{background:#9a6a14;border-color:#9a6a14}',
      '.nl-modal-title{margin:0;color:#0b5d3b;font-size:18px;line-height:1.25;font-weight:800}',
      '.nl-modal-body{padding:20px 22px 4px;color:#2f493f;font-size:14px;line-height:1.6;white-space:pre-line}',
      '.nl-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:20px 22px 22px}',
      '.nl-modal-secondary,.nl-modal-primary{min-height:40px;border-radius:8px;padding:0 16px;font-weight:800;cursor:pointer}',
      '.nl-modal-secondary{border:1px solid #d8e2dc;background:#fff;color:#345247}',
      '.nl-modal-primary{border:1px solid #0b5d3b;background:#0b5d3b;color:#fff}',
    ].join('');
    document.head.appendChild(style);
  }

  function close(result) {
    if (!active) return;
    var current = active;
    active = null;
    current.overlay.remove();
    current.resolve(result);
  }

  function openModal(options) {
    injectStyles();
    if (active) close(false);

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'nl-modal-overlay';
      overlay.setAttribute('role', 'presentation');

      var card = document.createElement('section');
      card.className = 'nl-modal-card';
      card.dataset.tone = options.tone || 'info';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'nl-modal-title');

      var head = document.createElement('div');
      head.className = 'nl-modal-head';
      var title = document.createElement('h2');
      title.className = 'nl-modal-title';
      title.id = 'nl-modal-title';
      title.textContent = options.title || 'Notice';
      head.appendChild(title);
      card.appendChild(head);

      if (options.message) {
        var body = document.createElement('div');
        body.className = 'nl-modal-body';
        body.textContent = options.message;
        card.appendChild(body);
      }

      var actions = document.createElement('div');
      actions.className = 'nl-modal-actions';

      if (options.kind === 'decision') {
        var secondary = document.createElement('button');
        secondary.type = 'button';
        secondary.className = 'nl-modal-secondary';
        secondary.textContent = options.secondaryLabel || 'Cancel';
        secondary.addEventListener('click', function () { close(false); });
        actions.appendChild(secondary);
      }

      var primary = document.createElement('button');
      primary.type = 'button';
      primary.className = 'nl-modal-primary';
      primary.textContent = options.primaryLabel || 'OK';
      primary.addEventListener('click', function () { close(true); });
      actions.appendChild(primary);

      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      active = { overlay: overlay, resolve: resolve };
      setTimeout(function () { primary.focus(); }, 0);
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close(false);
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
})();
