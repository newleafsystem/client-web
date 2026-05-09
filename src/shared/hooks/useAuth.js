import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  sendEmailVerification,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { createDefaultUserEntitlements, normalizeUserAccess } from '../auth/accessControl';

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

/**
 * Authentication hook with Google and Email/Password support
 * Automatically creates/updates user profile documents in Firestore
 * @returns {Object} auth state, access state, and auth actions
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [access, setAccess] = useState(() => normalizeUserAccess(null, null));
  const [loading, setLoading] = useState(true);

  // Create or update user profile document in Firestore
  const createOrUpdateUserProfile = async (currentUser, options = {}) => {
    if (!currentUser) return;

    try {
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
    } catch {
    }
  };

  useEffect(() => {
    let unsubscribeProfile = () => {};

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      unsubscribeProfile();
      setUser(currentUser);
      setProfile(null);
      setLoading(true);

      if (!currentUser) {
        setAccess(normalizeUserAccess(null, null));
        setLoading(false);
        return;
      }

      await createOrUpdateUserProfile(currentUser);

      const userRef = doc(db, 'users', currentUser.uid);
      unsubscribeProfile = onSnapshot(
        userRef,
        (snapshot) => {
          const data = snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null;
          setProfile(data);
          setAccess(normalizeUserAccess(data, currentUser));
          setLoading(false);
        },
        () => {
          setProfile(null);
          setAccess(normalizeUserAccess(null, currentUser));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile();
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
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
  };

  const signInWithEmail = async (email, password) => {
    try {
      return await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
    } catch (error) {
      throw error;
    }
  };

  const signUp = async (email, password, options = {}) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
      const displayName = String(options.displayName || '').trim();

      if (displayName) {
        await updateProfile(result.user, { displayName });
      }

      if (!result.user.emailVerified) {
        await sendEmailVerification(result.user).catch(() => {});
      }

      await createOrUpdateUserProfile(result.user, {
        displayName,
        registrationSource: 'email-password',
      });

      return result;
    } catch (error) {
      throw error;
    }
  };

  const linkGoogleWithPassword = async (email, password, pendingCredential) => {
    try {
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

      await createOrUpdateUserProfile(linkedUser, {
        registrationSource: 'linked-google',
      });

      return result;
    } catch (error) {
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      throw error;
    }
  };

  return {
    user,
    profile,
    access,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUp,
    linkGoogleWithPassword,
    signOut,
  };
}

export { GOOGLE_LINK_PASSWORD_REQUIRED };
