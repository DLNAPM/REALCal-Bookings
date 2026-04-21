import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, Auth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const hasFirebaseConfig = !!(firebaseConfig.apiKey && firebaseConfig.apiKey.length > 0);

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
const googleProvider = new GoogleAuthProvider();

if (hasFirebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID || undefined);
    auth = getAuth(app);
  } catch (err) {
    console.error("Firebase initialization error:", err);
  }
}

export { app, db, auth, googleProvider };

export async function signIn() {
  if (!auth) throw new Error("Firebase Auth is not initialized. Please configure Firebase Environment Variables.");
  return await signInWithPopup(auth, googleProvider);
}

export async function signOut() {
  if (!auth) return;
  return await fbSignOut(auth);
}

export async function testConnection() {
  if (!db) {
    console.warn("Firebase not configured. Skipping connection test.");
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error) {
      console.error("Firebase connection error:", error);
      if (error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration. Ensure that Firestore Database has been created in the Firebase Console.");
      }
    }
  }
}
if (hasFirebaseConfig) {
  testConnection();
}
