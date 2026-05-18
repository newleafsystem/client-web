import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  sendEmailVerification,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../../firebase/config';
import { normalizeUserAccess } from '../auth/accessControl';
import { writeCachedNavigationState } from '../components/navigationState';
import {
  clearCachedAuthState,
  clearCookieSession,
  createCookieSession,
  fetchCookieSession,
  fetchCustomTokenFromCookie,
  readCachedAuthState,
  sanitizeProfile,
  sanitizeUser,
  shouldValidateCachedAuth,
  writeCachedAuthState,
} from '../auth/authSession';

const GOOGLE_LINK_PASSWORD_REQUIRED = 'auth/google-link-password-required';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function createGoogleLinkRequiredError(error, signInMethods = []) {
  const email = normalizeEmail(error?.customData?.email);
  const credential = GoogleAuthProvider.credentialFromError(error);
  const linkError = new Error(
    'This email already has a NewLeaf account. Sign in with your password once to link Google to the same account.'
  );
  linkError.code = GOOGLE_LINK_PASSWORD_REQUIRED;
  linkError.email = email;
  linkError.credential = credential;
  linkError.signInMethods = signInMethods;
  return linkError;
}

function stateFromCachedAuth() {
  const cached = readCachedAuthState();
  if (!cached?.user) {
    return signedOutState('anonymous-no-cookie');
  }

  return {
    user: cached.user,
    profile: cached.profile,
    access: normalizeUserAccess(cached.profile, cached.user),
    loading: false,
    sessionValidationPending: shouldValidateCachedAuth(cached),
    source: cached.source,
  };
}

let authState = stateFromCachedAuth();
let authStarted = false;
let unsubscribeAuth = null;
const subscribers = new Set();

function emitAuthState(nextState) {
  authState = { ...authState, ...nextState };
  subscribers.forEach((listener) => listener(authState));
}

function signedOutState(source = 'signed-out') {
  return {
    user: null,
    profile: null,
    access: normalizeUserAccess(null, null),
    loading: false,
    sessionValidationPending: false,
    source,
  };
}

async function createOrUpdateUserProfile(currentUser, options = {}) {
  if (!currentUser) return null;
  if (options.displayName && currentUser.getIdToken) {
    await currentUser.getIdToken(true).catch(() => null);
  }
  const session = await createCookieSession(currentUser);
  return session?.profile || null;
}

async function loadUserProfile(currentUser) {
  if (!currentUser) return null;
  const session = await fetchCookieSession();
  return session?.profile || null;
}

function applyAuthenticatedState(user, profile, source = 'firebase-auth', options = {}) {
  const safeProfile = sanitizeProfile(profile);
  const safeUser = sanitizeUser(user);
  const accessUser = safeUser ? {
    ...safeUser,
    displayName: safeUser.displayName || safeProfile?.displayName || safeProfile?.communicationEmail?.split('@')[0] || safeUser.email?.split('@')[0] || null,
    photoURL: safeUser.photoURL || safeProfile?.photoURL || null,
  } : null;
  const access = normalizeUserAccess(safeProfile, accessUser);

  writeCachedNavigationState({
    user: accessUser,
    profile: safeProfile,
    access,
  });

  emitAuthState({
    user: accessUser,
    profile: safeProfile,
    access,
    loading: false,
    sessionValidationPending: false,
    source,
  });

  const hasValidatedAt = Object.prototype.hasOwnProperty.call(options, 'validatedAt');
  writeCachedAuthState({
    user: accessUser,
    profile: safeProfile,
    validatedAt: hasValidatedAt ? options.validatedAt : (source === 'firebase-auth-fallback' ? null : Date.now()),
  });
}

async function hydrateFromCookieSession(options = {}) {
  const cached = readCachedAuthState();
  if (!cached?.user) return false;

  if (!options.force && cached?.user && !shouldValidateCachedAuth(cached)) {
    applyAuthenticatedState(cached.user, cached.profile, cached.source, {
      validatedAt: cached.validatedAt,
    });
    return true;
  }

  const session = await fetchCookieSession();
  if (!session?.user) {
    clearCachedAuthState();
    emitAuthState(signedOutState('session-cookie-missing'));
    return false;
  }

  applyAuthenticatedState(session.user, session.profile, session.source, {
    validatedAt: Date.now(),
  });
  return true;
}

async function restoreFirebaseFromCookieSession(cached = readCachedAuthState()) {
  if (auth.currentUser) return false;
  if (!cached?.user) return false;

  const customToken = await fetchCustomTokenFromCookie();
  if (!customToken) return false;
  await signInWithCustomToken(auth, customToken);
  return true;
}

function startAuthObserver() {
  if (authStarted) return;
  authStarted = true;

  const startupCache = readCachedAuthState();
  if (startupCache?.user) {
    applyAuthenticatedState(startupCache.user, startupCache.profile, startupCache.source, {
      validatedAt: startupCache.validatedAt,
    });
  } else {
    clearCachedAuthState();
    emitAuthState(signedOutState('anonymous-no-cookie'));
  }

  if (startupCache?.user) {
    hydrateFromCookieSession({ force: shouldValidateCachedAuth(startupCache) }).then((hasSession) => {
      const cached = readCachedAuthState();
      if (!auth.currentUser && hasSession && cached?.user && shouldValidateCachedAuth(startupCache)) {
        return restoreFirebaseFromCookieSession(cached);
      }
      return false;
    }).catch(() => {});
  }

  unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
    if (!currentUser) {
      const cached = readCachedAuthState();
      if (cached?.user && !shouldValidateCachedAuth(cached)) {
        applyAuthenticatedState(cached.user, cached.profile, cached.source, {
          validatedAt: cached.validatedAt,
        });
        return;
      }

      if (!cached?.user) {
        clearCachedAuthState();
        emitAuthState(signedOutState('anonymous-no-cookie'));
        return;
      }

      const restored = await restoreFirebaseFromCookieSession(cached).catch(() => false);
      if (!restored) {
        clearCachedAuthState();
        emitAuthState(signedOutState());
      }
      return;
    }

    try {
      if (!authState.user?.uid) {
        emitAuthState({ loading: true, source: 'firebase-auth' });
      }
      const session = await createCookieSession(currentUser);
      let profile = session?.profile || null;
      if (!profile) {
        profile = await loadUserProfile(currentUser).catch(() => null);
      }

      applyAuthenticatedState(session?.user || currentUser, profile, 'firebase-auth');
    } catch {
      applyAuthenticatedState(currentUser, null, 'firebase-auth-fallback');
    }
  });
}

function subscribeAuth(listener) {
  startAuthObserver();
  subscribers.add(listener);
  listener(authState);
  return () => {
    subscribers.delete(listener);
  };
}

async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === 'auth/account-exists-with-different-credential') {
      const email = normalizeEmail(error?.customData?.email);
      const signInMethods = email ? await fetchSignInMethodsForEmail(auth, email).catch(() => []) : [];
      throw createGoogleLinkRequiredError(error, signInMethods);
    }
    throw error;
  }
}

async function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, normalizeEmail(email), password);
}

async function signUp(email, password, options = {}) {
  const result = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
  const displayName = String(options.displayName || '').trim();

  if (displayName) {
    await updateProfile(result.user, { displayName });
  }

  if (!result.user.emailVerified) {
    await sendEmailVerification(result.user).catch(() => {});
  }

  const profile = await createOrUpdateUserProfile(result.user, {
    displayName,
    registrationSource: 'email-password',
  }).catch(() => null);
  applyAuthenticatedState(result.user, profile, 'firebase-auth');

  return result;
}

async function linkGoogleWithPassword(email, password, pendingCredential) {
  if (!pendingCredential) {
    const error = new Error('Missing Google credential for account linking.');
    error.code = 'auth/missing-google-link-credential';
    throw error;
  }

  const normalizedEmail = normalizeEmail(email);
  const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);

  if (normalizeEmail(result.user.email) !== normalizedEmail) {
    const error = new Error('The signed-in email does not match the Google account.');
    error.code = 'auth/email-link-mismatch';
    throw error;
  }

  let linkedUser = result.user;
  const linkResult = await linkWithCredential(result.user, pendingCredential).catch((error) => {
    if (error?.code !== 'auth/provider-already-linked') throw error;
    return null;
  });
  linkedUser = linkResult?.user || linkedUser;

  const profile = await createOrUpdateUserProfile(linkedUser, {
    registrationSource: 'linked-google',
  }).catch(() => null);
  applyAuthenticatedState(linkedUser, profile, 'firebase-auth');

  return result;
}

async function signOut() {
  try {
    await Promise.allSettled([
      clearCookieSession(),
      firebaseSignOut(auth),
    ]);
  } finally {
    clearCachedAuthState();
    emitAuthState(signedOutState());
  }
}

export function useAuth() {
  const [snapshot, setSnapshot] = useState(authState);

  useEffect(() => subscribeAuth(setSnapshot), []);

  return {
    ...snapshot,
    signInWithGoogle,
    signInWithEmail,
    signUp,
    linkGoogleWithPassword,
    signOut,
  };
}

export { GOOGLE_LINK_PASSWORD_REQUIRED };

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!subscribers.size && unsubscribeAuth) {
      unsubscribeAuth();
      unsubscribeAuth = null;
      authStarted = false;
    }
  });
}
