import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { createDefaultUserEntitlements, normalizeUserAccess } from '../auth/accessControl';

/**
 * Authentication hook with Google and Email/Password support
 * Automatically creates/updates user profile documents in Firestore
 * @returns {Object} { user, loading, signInWithGoogle, signInWithEmail, signUp, signOut }
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [access, setAccess] = useState(() => normalizeUserAccess(null, null));
  const [loading, setLoading] = useState(true);

  // Create or update user profile document in Firestore
  const createOrUpdateUserProfile = async (currentUser) => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        const entitlements = createDefaultUserEntitlements(currentUser);
        await setDoc(userRef, {
          email: currentUser.email,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          photoURL: currentUser.photoURL || null,
          ...entitlements,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        });
      } else {
        await setDoc(userRef, {
          email: currentUser.email,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          photoURL: currentUser.photoURL || null,
          lastLogin: serverTimestamp(),
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error creating/updating user profile:', error);
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
        (error) => {
          console.error('Error loading user profile:', error);
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
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signInWithEmail = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Error signing in with email:', error);
      throw error;
    }
  };

  const signUp = async (email, password) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return { user, profile, access, loading, signInWithGoogle, signInWithEmail, signUp, signOut };
}
