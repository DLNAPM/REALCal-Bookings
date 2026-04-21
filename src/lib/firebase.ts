import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAwVo9n0Jz5jjJ2-58eCFxz5JEl8SvNpBQ",
  authDomain: "realcal-bookings.firebaseapp.com",
  projectId: "realcal-bookings",
  storageBucket: "realcal-bookings.firebasestorage.app",
  messagingSenderId: "174959842411",
  appId: "1:174959842411:web:3ae050e89d55c5fc7b0d2e",
  measurementId: "G-3VVVX0KTEL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();

export async function signIn() {
  return await signInWithPopup(auth, googleProvider);
}

export async function signOut() {
  return await fbSignOut(auth);
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
