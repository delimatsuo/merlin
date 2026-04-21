import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, type User } from "firebase/auth";

// Firebase project config. `apiKey` is injected at build time by webpack
// DefinePlugin (see webpack.config.js). It's a browser-side identifier, not
// an OAuth secret, but we still keep it out of source so it can be rotated
// without a git commit.
declare const process: { env: { FIREBASE_API_KEY: string } };
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "merlin-489714.firebaseapp.com",
  projectId: "merlin-489714",
  storageBucket: "merlin-489714.firebasestorage.app",
  messagingSenderId: "531233742939",
  appId: "1:531233742939:web:ca00cb4179af522e689f7e",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signIn(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
