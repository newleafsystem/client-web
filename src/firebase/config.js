// Import only the core Firebase App SDK at module load time. Product SDKs
// are loaded lazily so public pages do not initialize Firebase services.
import { getApp, getApps, initializeApp } from "firebase/app";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

let appInstance = null;
let authInstance = null;
let functionsInstance = null;
let aiInstance = null;
let analyticsPromise = null;

export function getFirebaseApp() {
  if (!appInstance) {
    appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return appInstance;
}

// Firestore reads and writes are proxied through api.newleafsystem.com.
export const db = Object.freeze({ __newleafApiFirestore: true });

export async function getFirebaseAuth() {
  if (!authInstance) {
    const { getAuth } = await import("firebase/auth");
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

export async function getFirebaseFunctions() {
  if (!functionsInstance) {
    const { getFunctions } = await import("firebase/functions");
    functionsInstance = getFunctions(getFirebaseApp());
  }
  return functionsInstance;
}

// Use emulator for local development (uncomment to enable)
// if (window.location.hostname === 'localhost') {
//   const { connectFunctionsEmulator } = await import("firebase/functions");
//   connectFunctionsEmulator(await getFirebaseFunctions(), 'localhost', 5001);
// }

export async function getFirebaseAI() {
  if (typeof window === 'undefined') return null;
  if (!aiInstance) {
    const { getAI, GoogleAIBackend } = await import("firebase/ai");
    aiInstance = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  }
  return aiInstance;
}

export function getFirebaseAnalytics() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = import("firebase/analytics")
      .then(async ({ getAnalytics, isSupported }) => {
        if (!(await isSupported())) return null;
        return getAnalytics(getFirebaseApp());
      })
      .catch(() => null);
  }
  return analyticsPromise;
}


// Legacy helper: route through the shared account page instead of opening a provider-only popup.
export async function signInWithGoogle() {
  if (typeof window === 'undefined') return;
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.href = `/signin?redirect=${encodeURIComponent(redirect)}`;
}

export async function signOut() {
  const [{ signOut: fbSignOut }, auth] = await Promise.all([
    import("firebase/auth"),
    getFirebaseAuth(),
  ]);
  return fbSignOut(auth);
}
