// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, signOut as fbSignOut } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAI, GoogleAIBackend } from "firebase/ai";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Firestore reads and writes are proxied through api.newleafsystem.com.
export const db = Object.freeze({ __newleafApiFirestore: true });

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Cloud Functions
export const functions = getFunctions(app);

// Use emulator for local development (uncomment to enable)
// if (window.location.hostname === 'localhost') {
//   connectFunctionsEmulator(functions, 'localhost', 5001);
// }

// Initialize Firebase AI Logic (Gemini Developer API)
export const ai = typeof window !== 'undefined' ? getAI(app, { backend: new GoogleAIBackend() }) : null;


// Legacy helper: route through the shared account page instead of opening a provider-only popup.
export async function signInWithGoogle() {
  if (typeof window === 'undefined') return;
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.href = `/signin?redirect=${encodeURIComponent(redirect)}`;
}

export async function signOut() {
  return fbSignOut(auth);
}

// Export app instance
export { app };
