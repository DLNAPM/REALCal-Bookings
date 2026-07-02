import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, Auth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, Firestore, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

declare const __FIREBASE_APPLET_CONFIG__: any;
const configJson = typeof __FIREBASE_APPLET_CONFIG__ !== 'undefined' ? __FIREBASE_APPLET_CONFIG__ : {};

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || configJson.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || configJson.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || configJson.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || configJson.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || configJson.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || configJson.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || configJson.measurementId || ""
};

const hasFirebaseConfig = !!(firebaseConfig.apiKey && firebaseConfig.apiKey.length > 0);

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
const googleProvider = new GoogleAuthProvider();

if (hasFirebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID || configJson.firestoreDatabaseId || undefined);
    auth = getAuth(app);
  } catch (err) {
    console.error("Firebase initialization error:", err);
  }
}

export { app, db, auth, googleProvider };

export async function signIn() {
  if (!auth) throw new Error("Firebase Auth is not initialized. Please configure Firebase Environment Variables.");
  
  // Force account selection prompt so users can switch accounts easily
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });

  console.log("Starting Firebase signInWithPopup...");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("Sign in successful for user:", result.user.email);
    return result;
  } catch (error: any) {
    console.error("Firebase signInWithPopup error detail:", {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function signOut() {
  if (!auth) return;
  const currentUser = auth.currentUser;
  if (currentUser && db) {
    try {
      console.log("[SignOut] Cleaning up pending_payment bookings for user:", currentUser.uid);
      const bookingsRef = collection(db, 'bookings');
      const q = query(bookingsRef, where('userId', '==', currentUser.uid), where('status', '==', 'pending_payment'));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const bookingId = d.id;
        const bookingData = d.data();
        await deleteDoc(doc(db, 'bookings', bookingId));
        console.log("[SignOut] Successfully cleaned up pending_payment booking:", bookingId);
        
        // Also clean up any potential blackout dates associated with this booking
        try {
          const rooms = bookingData.selectedBedrooms || (bookingData.selectedBedroom ? [bookingData.selectedBedroom] : []);
          if (rooms.length > 0) {
            for (const room of rooms) {
              await deleteDoc(doc(db, 'blackout_dates', `maint-${bookingId}-${room.roomNumber}`));
            }
          } else {
            await deleteDoc(doc(db, 'blackout_dates', `maint-${bookingId}`));
          }
        } catch (boErr) {
          console.warn("[SignOut] Failed to delete blackout dates for booking:", bookingId, boErr);
        }
      }
    } catch (err) {
      console.error("[SignOut] Failed to clean up pending_payment bookings on signOut:", err);
    }
  }
  return await fbSignOut(auth);
}

export async function testConnection() {
  if (!db) {
    console.warn("Firebase not configured. Skipping connection test.");
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connection established successfully.");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('the client is offline')) {
        console.error("Firebase connection error:", error);
        console.error("Please check your Firebase configuration. Ensure that Firestore Database has been created in the Firebase Console.");
      } else if (error.message.includes('Missing or insufficient permissions')) {
        // Hitting rule bounds proves connection acts perfectly!
        console.log("Firebase connection established successfully.");
      } else {
        console.error("Firebase connection error:", error);
      }
    }
  }
}
if (hasFirebaseConfig) {
  testConnection();
}
