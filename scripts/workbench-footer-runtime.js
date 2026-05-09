/**
 * Adds the shared product footer to static Workbench HTML pages that do not
 * already define a footer in the source file.
 */
(function () {
  if (document.querySelector('.app-footer, .nl-static-footer')) return;

  document.querySelectorAll('body > footer').forEach(function (footer) {
    footer.remove();
  });

  var style = document.createElement('style');
  style.textContent = [
    '.nl-static-footer{margin-top:56px;background:#071c16;color:#dbe8df;border-top:1px solid rgba(215,181,109,.24);font-family:Inter,DM Sans,system-ui,-apple-system,BlinkMacSystemFont,sans-serif}',
    '.nl-static-footer-inner{max-width:1180px;margin:0 auto;padding:36px 20px 30px;display:grid;grid-template-columns:minmax(220px,1.6fr) repeat(3,minmax(150px,1fr));gap:28px}',
    '.nl-static-footer-brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800;color:#fff}',
    '.nl-static-footer-brand img{width:32px;height:32px;border-radius:8px}',
    '.nl-static-footer-copy{margin:12px 0 0;color:#aebfb6;font-size:13px;line-height:1.6;max-width:360px}',
    '.nl-static-footer h3{margin:0 0 12px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#d7b56d}',
    '.nl-static-footer a{display:block;color:#dbe8df;text-decoration:none;font-size:13px;margin:8px 0}',
    '.nl-static-footer a:hover{color:#d7b56d}',
    '.nl-static-footer-bottom{max-width:1180px;margin:0 auto;padding:16px 20px 24px;border-top:1px solid rgba(255,255,255,.08);color:#8ea399;font-size:12px}',
    '@media(max-width:820px){.nl-static-footer-inner{grid-template-columns:1fr 1fr}.nl-static-footer-about{grid-column:1/-1}}',
    '@media(max-width:560px){.nl-static-footer-inner{grid-template-columns:1fr}}',
  ].join('');
  document.head.appendChild(style);

  function link(href, label) {
    var anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = label;
    return anchor;
  }

  function column(title, links) {
    var section = document.createElement('section');
    var heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    links.forEach(function (item) {
      section.appendChild(link(item.href, item.label));
    });
    return section;
  }

  var footer = document.createElement('footer');
  footer.className = 'nl-static-footer';

  var inner = document.createElement('div');
  inner.className = 'nl-static-footer-inner';

  var about = document.createElement('section');
  about.className = 'nl-static-footer-about';
  var brand = document.createElement('div');
  brand.className = 'nl-static-footer-brand';
  var logo = document.createElement('img');
  logo.src = '/logo-icon.png';
  logo.alt = 'NewLeaf';
  var wordmark = document.createElement('span');
  wordmark.textContent = 'NewLeaf System';
  brand.appendChild(logo);
  brand.appendChild(wordmark);
  var copy = document.createElement('p');
  copy.className = 'nl-static-footer-copy';
  copy.textContent = 'Risk-aware research, strategy scanning, and portfolio tooling for defined-risk options workflows.';
  about.appendChild(brand);
  about.appendChild(copy);

  inner.appendChild(about);
  inner.appendChild(column('Platform', [
    { href: '/picks', label: 'Picks' },
    { href: '/workbench/', label: 'Workbench' },
    { href: '/invest', label: 'Invest' },
    { href: '/quant', label: 'Quant' },
    { href: '/desk', label: 'Desk' },
  ]));
  inner.appendChild(column('Research', [
    { href: '/how-we-pick', label: 'How we pick' },
    { href: '/track-record', label: 'Track record' },
    { href: '/probability-engine', label: 'Probability engine' },
    { href: '/blog', label: 'Blog' },
  ]));
  inner.appendChild(column('Support', [
    { href: '/privacy-policy', label: 'Privacy policy' },
    { href: '/terms-and-conditions', label: 'Terms and conditions' },
    { href: 'mailto:support@newleafsystem.com', label: 'Support' },
  ]));

  var bottom = document.createElement('div');
  bottom.className = 'nl-static-footer-bottom';
  bottom.textContent = 'NewLeaf System is educational software. Options trading involves risk and is not suitable for every investor.';

  footer.appendChild(inner);
  footer.appendChild(bottom);
  document.body.appendChild(footer);
})();
