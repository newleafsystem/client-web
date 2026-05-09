/**
 * Runtime interactivity for the workbench static nav.
 * Injected into the generated nav-component.html by the build script.
 * Uses class-based selectors (no IDs) to match BrandBar's DOM.
 */
(function () {
  // ── Active page detection ──
  var normalizedPath = location.pathname.replace(/\/+$/, '');
  var currentPage = (normalizedPath.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  document.querySelectorAll('.nl-nav-links a[data-page]').forEach(function (link) {
    if (link.dataset.page === currentPage) link.classList.add('active');
  });
  document.querySelectorAll('.nl-dd-item[data-page]').forEach(function (link) {
    if (link.dataset.page === currentPage) {
      link.style.color = 'var(--brand-gold, #d7b56d)';
      link.style.fontWeight = '600';
      var trigger = link.closest('.nl-dd-wrap') && link.closest('.nl-dd-wrap').querySelector('.nl-dd-trigger');
      if (trigger) trigger.classList.add('active');
    }
  });

  // ── ET clock ──
  function updateClock() {
    var et = new Date().toLocaleTimeString('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false
    });
    var el = document.querySelector('.nl-live-time');
    if (el) el.textContent = et + ' ET';
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ── Strategies dropdown (desktop: hover + click) ──
  document.querySelectorAll('.nl-dd-wrap').forEach(function (ddWrap) {
    var ddTrigger = ddWrap.querySelector('.nl-dd-trigger');
    var ddPanel = ddWrap.querySelector('.nl-dd-panel');
    var hoverTimeout;

    if (!ddTrigger || !ddPanel) return;

    function showDD() { ddPanel.hidden = false; ddTrigger.setAttribute('aria-expanded', 'true'); }
    function hideDD() { ddPanel.hidden = true; ddTrigger.setAttribute('aria-expanded', 'false'); }

    if (ddTrigger.tagName !== 'A') {
      ddTrigger.addEventListener('click', function () { ddPanel.hidden ? showDD() : hideDD(); });
    }
    ddTrigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        showDD();
        var first = ddPanel.querySelector('.nl-dd-item');
        if (first) first.focus();
      }
      if (e.key === ' ' && ddTrigger.tagName === 'A') {
        e.preventDefault();
        ddPanel.hidden ? showDD() : hideDD();
      }
    });
    ddWrap.addEventListener('mouseenter', function () {
      if (window.innerWidth > 1080) { clearTimeout(hoverTimeout); showDD(); }
    });
    ddWrap.addEventListener('mouseleave', function () {
      if (window.innerWidth > 1080) { hoverTimeout = setTimeout(hideDD, 150); }
    });
    document.addEventListener('mousedown', function (e) {
      if (!ddWrap.contains(e.target)) hideDD();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !ddPanel.hidden) hideDD();
    });
  });

  // ── Mobile menu ──
  var hamburger = document.querySelector('.nl-hamburger');
  var overlay = document.querySelector('.nl-mobile-overlay');
  var panel = document.querySelector('.nl-mobile-panel');
  var closeBtn = panel && panel.querySelector('.nl-mobile-close');

  function openMobile() {
    if (overlay) overlay.hidden = false;
    if (panel) panel.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeMobile() {
    if (overlay) overlay.hidden = true;
    if (panel) panel.hidden = true;
    document.body.style.overflow = '';
  }

  if (hamburger) hamburger.addEventListener('click', openMobile);
  if (closeBtn) closeBtn.addEventListener('click', closeMobile);
  if (overlay) overlay.addEventListener('click', closeMobile);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel && !panel.hidden) closeMobile();
  });

  // Close on link click
  if (panel) {
    panel.querySelectorAll('a[href]').forEach(function (link) {
      link.addEventListener('click', closeMobile);
    });
  }

  // Mobile strategies accordion
  if (panel) {
    panel.querySelectorAll('.nl-mobile-dd').forEach(function (wrap) {
      var mobileTrigger = wrap.querySelector('.nl-mobile-dd-trigger, .nl-mobile-dd-toggle');
      var mobileItems = wrap.querySelector('.nl-mobile-dd-items');
      if (!mobileTrigger || !mobileItems) return;

      mobileTrigger.addEventListener('click', function () {
        var expanded = !mobileItems.hidden;
        mobileItems.hidden = !mobileItems.hidden;
        mobileTrigger.setAttribute('aria-expanded', String(!expanded));
        var arrow = mobileTrigger.querySelector('.nl-dd-arrow');
        if (arrow) arrow.style.transform = expanded ? 'none' : 'rotate(180deg)';
      });
    });
  }
})();
