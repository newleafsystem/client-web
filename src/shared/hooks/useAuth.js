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
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { createDefaultUserEntitlements, normalizeUserAccess } from '../auth/accessControl';
import {
  clearCachedAuthState,
  clearCookieSession,
  createCookieSession,
  fetchCookieSession,
  fetchCustomTokenFromCookie,
  readCachedAuthState,
  sanitizeProfile,
  sanitizeUser,
  writeCachedAuthState,
} from '../auth/authSession';

const GOOGLE_LINK_PASSWORD_REQUIRED = 'auth/google-link-password-required';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function displayNameForUser(user, fallbackName) {
  return fallbackName || user.displayName || user.email?.split('@')[0] || 'User';
}

function providerIdsForUser(user) {
  return [...new Set((user?.providerData || []).map((provider) => provider.providerId).filter(Boolean))];
}

function authProvidersForUser(user) {
  return Object.fromEntries(providerIdsForUser(user).map((providerId) => [providerId, true]));
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
    return {
      user: null,
      profile: null,
      access: normalizeUserAccess(null, null),
      loading: true,
      source: 'initial',
    };
  }

  return {
    user: cached.user,
    profile: cached.profile,
    access: normalizeUserAccess(cached.profile, cached.user),
    loading: true,
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
    source,
  };
}

async function createOrUpdateUserProfile(currentUser, options = {}) {
  if (!currentUser) return null;

  const userRef = doc(db, 'users', currentUser.uid);
  const userDoc = await getDoc(userRef);
  const existingProfile = userDoc.exists() ? userDoc.data() : {};
  const displayName = displayNameForUser(currentUser, options.displayName);
  const communicationEmail = existingProfile.communicationEmail || currentUser.email || null;
  const identityPatch = {
    email: currentUser.email,
    communicationEmail,
    displayName,
    photoURL: currentUser.photoURL || null,
    emailVerified: currentUser.emailVerified === true,
    identityProviderIds: providerIdsForUser(currentUser),
    authProviders: authProvidersForUser(currentUser),
    primaryProviderId: providerIdsForUser(currentUser)[0] || null,
    identityUpdatedAt: serverTimestamp(),
  };

  if (!userDoc.exists()) {
    const entitlements = createDefaultUserEntitlements(currentUser);
    await setDoc(userRef, {
      ...identityPatch,
      registrationSource: options.registrationSource || 'firebase-auth',
      ...entitlements,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
  } else {
    const sourcePatch = (
      options.registrationSource &&
      (!existingProfile.registrationSource || existingProfile.registrationSource === 'firebase-auth')
    ) ? { registrationSource: options.registrationSource } : {};
    await setDoc(userRef, {
      ...identityPatch,
      ...sourcePatch,
      lastLogin: serverTimestamp(),
    }, { merge: true });
  }

  const refreshed = await getDoc(userRef);
  return refreshed.exists() ? { uid: refreshed.id, ...refreshed.data() } : null;
}

async function loadUserProfile(currentUser) {
  if (!currentUser) return null;
  const userRef = doc(db, 'users', currentUser.uid);
  const snapshot = await getDoc(userRef);
  return snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null;
}

function applyAuthenticatedState(user, profile, source = 'firebase-auth') {
  const safeProfile = sanitizeProfile(profile);
  const safeUser = sanitizeUser(user);
  const accessUser = safeUser ? {
    ...safeUser,
    displayName: safeUser.displayName || safeProfile?.displayName || safeProfile?.communicationEmail?.split('@')[0] || safeUser.email?.split('@')[0] || null,
    photoURL: safeUser.photoURL || safeProfile?.photoURL || null,
  } : null;
  const access = normalizeUserAccess(safeProfile, accessUser);

  emitAuthState({
    user: accessUser,
    profile: safeProfile,
    access,
    loading: false,
    source,
  });

  writeCachedAuthState({ user: accessUser, profile: safeProfile });
}

async function hydrateFromCookieSession() {
  const session = await fetchCookieSession();
  if (!session?.user) return false;

  applyAuthenticatedState(session.user, session.profile, session.source);
  return true;
}

async function restoreFirebaseFromCookieSession() {
  if (auth.currentUser) return false;
  const customToken = await fetchCustomTokenFromCookie();
  if (!customToken) return false;
  await signInWithCustomToken(auth, customToken);
  return true;
}

function startAuthObserver() {
  if (authStarted) return;
  authStarted = true;

  hydrateFromCookieSession().then((hasSession) => {
    if (!hasSession && !auth.currentUser && !readCachedAuthState()) {
      emitAuthState({ loading: true, source: 'firebase-auth' });
    }
    return restoreFirebaseFromCookieSession();
  }).catch(() => {});

  unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
    if (!currentUser) {
      const restored = await restoreFirebaseFromCookieSession().catch(() => false);
      if (!restored) {
        clearCachedAuthState();
        emitAuthState(signedOutState());
      }
      return;
    }

    try {
      emitAuthState({ loading: true, source: 'firebase-auth' });
      let profile = await createOrUpdateUserProfile(currentUser).catch(() => null);
      if (!profile) {
        profile = await loadUserProfile(currentUser).catch(() => null);
      }

      const session = await createCookieSession(currentUser);
      if (session?.profile) {
        profile = session.profile;
      }

      applyAuthenticatedState(currentUser, profile, 'firebase-auth');
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
