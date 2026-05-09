/**
 * Firebase authentication for the workbench static nav.
 * Injected as type="module" into nav-component.html by the build script.
 * Replaces static Sign In / Get Started buttons with working Firebase auth.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = window.NEWLEAF_FIREBASE_CONFIG || {};
const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app, 'newleafdb') : null;
const IMMUTABLE_ADMIN_EMAILS = Object.freeze([
  'sd.nirsha@gmail.com',
  'manish28june@gmail.com',
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isImmutableAdminUser(user) {
  return IMMUTABLE_ADMIN_EMAILS.indexOf(normalizeEmail(user && user.email)) !== -1;
}

function signInUrl() {
  var redirect = location.pathname + location.search + location.hash;
  return '/signin?redirect=' + encodeURIComponent(redirect);
}

function registerUrl() {
  var redirect = location.pathname + location.search + location.hash;
  return '/register?redirect=' + encodeURIComponent(redirect);
}

function allAppAccess() {
  return {
    invest: true,
    picks: true,
    workbench: true,
    admin: true,
    quant: true,
    desk: true
  };
}

function boolValue(value) {
  return value === true || value === 'true' || value === 1;
}

function normalizeAccessMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.keys(value).reduce(function (acc, key) {
    acc[String(key).toLowerCase()] = boolValue(value[key]);
    return acc;
  }, {});
}

function getAccess(profile, user) {
  var immutableAdmin = isImmutableAdminUser(user);
  var explicit = profile && (profile.appAccess || profile.apps || profile.applications || profile.productAccess);
  var appAccess = normalizeAccessMap(explicit);
  var status = String((profile && profile.status) || (profile && profile.disabled ? 'disabled' : 'active')).toLowerCase();
  var disabled = !immutableAdmin && profile && (profile.disabled === true || ['disabled', 'inactive', 'revoked', 'suspended'].indexOf(status) !== -1);

  if (immutableAdmin) {
    appAccess = allAppAccess();
  } else if (!explicit && user) {
    appAccess = {
      invest: true,
      picks: false,
      workbench: false,
      admin: false,
      quant: false,
      desk: false
    };
  }

  if (disabled) {
    appAccess = {};
  }

  return {
    canAccessApp: function (appId) {
      if (!appId || appId === 'root') return true;
      return Boolean(appAccess[String(appId).toLowerCase()]);
    }
  };
}

async function loadUserProfile(user) {
  if (!db || !user) return null;
  try {
    var snapshot = await getDoc(doc(db, 'users', user.uid));
    return snapshot.exists() ? snapshot.data() : null;
  } catch (error) {
    return null;
  }
}

function applyRoleBasedNav(access) {
  document.querySelectorAll('[data-app-id]').forEach(function (el) {
    var appId = el.getAttribute('data-app-id');
    var hidden = !access.canAccessApp(appId);
    var target = el.closest('li') || el;
    target.hidden = hidden;
    target.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  });
}

function setWorkbenchContentHidden(hidden) {
  Array.prototype.forEach.call(document.body.children, function (child) {
    if (
      child.matches('.nl-nav') ||
      child.matches('.nl-nav-spacer') ||
      child.matches('#nl-workbench-access-gate') ||
      child.tagName === 'SCRIPT' ||
      child.tagName === 'STYLE'
    ) {
      return;
    }

    if (hidden) {
      child.setAttribute('data-nl-access-hidden', 'true');
      child.hidden = true;
    } else if (child.getAttribute('data-nl-access-hidden') === 'true') {
      child.hidden = false;
      child.removeAttribute('data-nl-access-hidden');
    }
  });
}

function applyWorkbenchPageGate(access, user) {
  if (!location.pathname.startsWith('/workbench')) return;

  var allowed = access.canAccessApp('workbench');
  var existing = document.getElementById('nl-workbench-access-gate');

  if (allowed) {
    if (existing) existing.remove();
    setWorkbenchContentHidden(false);
    return;
  }

  setWorkbenchContentHidden(true);

  if (!existing) {
    existing = document.createElement('main');
    existing.id = 'nl-workbench-access-gate';
    var spacer = document.querySelector('.nl-nav-spacer');
    if (spacer && spacer.parentNode) spacer.insertAdjacentElement('afterend', existing);
    else document.body.insertBefore(existing, document.body.firstChild);
  }

  existing.innerHTML =
    '<section style="min-height:calc(100vh - 64px);display:grid;place-items:center;padding:48px 20px;background:#F7F5F0">' +
      '<div style="width:min(100%,520px);background:#fff;border:1px solid rgba(15,61,46,.12);border-radius:8px;padding:32px;text-align:center;box-shadow:0 18px 48px rgba(15,61,46,.08)">' +
        '<p style="margin:0 0 10px;color:#C9A96E;font:700 11px Space Mono,monospace;letter-spacing:.12em;text-transform:uppercase">Account Access</p>' +
        '<h1 style="margin:0;color:#0B2D23;font:500 36px Georgia,serif;line-height:1.1">NewLeaf Workbench is not enabled</h1>' +
        '<p style="margin:16px 0 0;color:#55554f;font:14px Inter,system-ui,sans-serif;line-height:1.7">' +
          (user ? 'Your NewLeaf account does not currently include Workbench. Access is managed from the admin-web user record.' : 'Sign in so NewLeaf can check the Workbench access assigned to your user profile.') +
        '</p>' +
        '<div style="margin-top:24px">' +
          '<button id="nlWorkbenchGateAction" style="min-height:42px;padding:0 20px;border:1px solid var(--brand-button-primary-border,#c8a85a);border-radius:6px;background:var(--brand-button-primary-bg,#c8a85a);color:var(--brand-button-primary-text,#061c15);font:800 13px Inter,system-ui,sans-serif;cursor:pointer">' +
            (user ? 'Sign Out' : 'Sign In') +
          '</button>' +
        '</div>' +
      '</div>' +
    '</section>';

  var action = document.getElementById('nlWorkbenchGateAction');
  if (action) {
    action.addEventListener('click', function () {
      if (user) signOut(auth);
      else window.location.href = signInUrl();
    });
  }
}

function getInitials(user) {
  if (user.displayName) {
    return user.displayName.split(' ').map(function (n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
  }
  return user.email ? user.email.charAt(0).toUpperCase() : 'U';
}

function signedOutHTML() {
  return '<a class="nl-nav-ghost" id="navSignIn" href="' + signInUrl() + '">Sign In</a>' +
    '<a href="' + registerUrl() + '" class="nl-nav-cta">Get Started &rarr;</a>';
}

function signedInHTML(user) {
  var initials = getInitials(user);
  return '<div class="nl-nav-user">' +
    '<div class="nl-nav-avatar">' + initials + '</div>' +
    '<button class="nl-nav-ghost" id="navSignOut" style="height:auto;padding:0 12px">Sign Out</button>' +
    '</div>';
}

function mobileSignedOutHTML() {
  return '<a class="nl-nav-ghost nl-mobile-btn" id="mobileSignIn" href="' + signInUrl() + '">Sign In</a>' +
    '<a href="' + registerUrl() + '" class="nl-nav-cta nl-mobile-btn">Get Started &rarr;</a>';
}

function mobileSignedInHTML(user) {
  var initials = getInitials(user);
  return '<div class="nl-mobile-auth">' +
    '<div class="nl-nav-avatar">' + initials + '</div>' +
    '<button class="nl-nav-ghost" id="mobileSignOut">Sign Out</button>' +
    '</div>';
}

function wireFallbackAuthLinks() {
  document.querySelectorAll('#navSignIn, #mobileSignIn, .nl-nav-right .nl-nav-ghost, .nl-mobile-utility .nl-nav-ghost').forEach(function (button) {
    button.addEventListener('click', function () {
      window.location.href = signInUrl();
    });
  });
}

if (!auth) {
  wireFallbackAuthLinks();
} else {
onAuthStateChanged(auth, async function (user) {
  var profile = await loadUserProfile(user);
  var access = getAccess(profile, user);
  applyRoleBasedNav(access);
  applyWorkbenchPageGate(access, user);

  // Desktop auth zone
  var navRight = document.querySelector('.nl-nav-right');
  if (navRight) {
    // Find or create auth container
    var authEl = navRight.querySelector('.nl-nav-auth');
    if (!authEl) {
      authEl = document.createElement('div');
      authEl.className = 'nl-nav-auth';
      // Remove static auth buttons rendered by SSR
      var ghost = navRight.querySelector('.nl-nav-ghost');
      var cta = navRight.querySelector('.nl-nav-cta');
      if (ghost) ghost.remove();
      if (cta) cta.remove();
      navRight.appendChild(authEl);
    }
    authEl.innerHTML = user ? signedInHTML(user) : signedOutHTML();

    // Attach event listeners
    var signInBtn = document.getElementById('navSignIn');
    var signOutBtn = document.getElementById('navSignOut');
    if (signInBtn) signInBtn.addEventListener('click', function () { window.location.href = signInUrl(); });
    if (signOutBtn) signOutBtn.addEventListener('click', function () { signOut(auth); });
  }

  // Mobile auth zone
  var mobileUtility = document.querySelector('.nl-mobile-utility');
  if (mobileUtility) {
    // Remove static mobile auth buttons
    var mobileGhost = mobileUtility.querySelector('.nl-nav-ghost');
    var mobileCta = mobileUtility.querySelector('.nl-nav-cta');
    if (mobileGhost) mobileGhost.remove();
    if (mobileCta) mobileCta.remove();

    // Find or create mobile auth container
    var mobileAuthEl = mobileUtility.querySelector('.nl-mobile-auth-zone');
    if (!mobileAuthEl) {
      mobileAuthEl = document.createElement('div');
      mobileAuthEl.className = 'nl-mobile-auth-zone';
      mobileUtility.appendChild(mobileAuthEl);
    }
    mobileAuthEl.innerHTML = user ? mobileSignedInHTML(user) : mobileSignedOutHTML();

    var mobileSignInBtn = document.getElementById('mobileSignIn');
    var mobileSignOutBtn = document.getElementById('mobileSignOut');
    if (mobileSignInBtn) mobileSignInBtn.addEventListener('click', function () { window.location.href = signInUrl(); });
    if (mobileSignOutBtn) mobileSignOutBtn.addEventListener('click', function () { signOut(auth); });
  }
});
}
