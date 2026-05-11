import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'user' | 'admin';
  tollFreeAccept?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      return;
    }

    let userUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser ? `Logged in: ${firebaseUser.email}` : "Logged out");
      
      // Clear existing snapshot listener
      if (userUnsubscribe) {
        console.log("Clearing previous user snapshot listener");
        userUnsubscribe();
        userUnsubscribe = null;
      }

      if (firebaseUser) {
        const userRef = doc(db!, 'users', firebaseUser.uid);
        
        try {
          // Ensure user document exists
          console.log("Checking for user document in Firestore...");
          const userSnap = await getDoc(userRef);
          let role: 'user' | 'admin' = 'user';
          if (firebaseUser.email === 'dlaniger.napm.consulting@gmail.com') {
            role = 'admin';
          }

          if (!userSnap.exists()) {
            console.log("User document does not exist, creating...");
            await setDoc(userRef, {
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Guest',
              photoURL: firebaseUser.photoURL || '',
              role,
              createdAt: serverTimestamp(),
            });
            console.log("User document created.");
          }

          // Set up real-time listener for the user record
          console.log("Setting up real-time listener for user record");
          userUnsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              console.log("User doc update received:", data);
              let currentRole = data.role || 'user';
              if (firebaseUser.email === 'dlaniger.napm.consulting@gmail.com') {
                currentRole = 'admin';
              }

              setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || 'Guest',
                photoURL: firebaseUser.photoURL || '',
                role: currentRole as 'user' | 'admin',
                tollFreeAccept: data.tollFreeAccept,
              });
              setLoading(false);
            } else {
              console.warn("User doc snapshot exists but is empty? (this shouldn't happen usually)");
              setLoading(false);
            }
          }, (error) => {
            console.error("User snapshot listener error:", error);
            // This is critical: if rules block this, we must still stop loading
            setLoading(false);
          });
        } catch (err) {
          console.error("Error in onAuthStateChanged persistence logic:", err);
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (userUnsubscribe) userUnsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
