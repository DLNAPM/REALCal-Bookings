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
          console.log(`Checking Firestore for user: ${firebaseUser.uid} (${firebaseUser.email})`);
          const userSnap = await getDoc(userRef);
          
          let role: 'user' | 'admin' = 'user';
          if (firebaseUser.email === 'dlaniger.napm.consulting@gmail.com') {
            role = 'admin';
            console.log("Detected admin email, assigning admin role in creation/sync");
          }

          if (!userSnap.exists()) {
            console.log("User record not found in Firestore. Creating new profile...");
            await setDoc(userRef, {
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Guest',
              photoURL: firebaseUser.photoURL || '',
              role,
              createdAt: serverTimestamp(),
            });
            console.log("User record created successfully.");
          } else {
            console.log("User record found. Setting up real-time listener.");
          }

          // Set up real-time listener for the user record
          userUnsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              console.log("User document data update:", data);
              
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
              console.log("AuthContext state updated with user data.");
              setLoading(false);
            } else {
              console.warn("User document exists but is empty? Failsafe loading=false");
              setLoading(false);
            }
          }, (error) => {
            console.error("Firestore User Snapshot Error:", error);
            // Fallback for rules-blocked users (still set basic user if auth exists)
            setUser({
               uid: firebaseUser.uid,
               email: firebaseUser.email || '',
               displayName: firebaseUser.displayName || 'Guest',
               photoURL: firebaseUser.photoURL || '',
               role: (firebaseUser.email === 'dlaniger.napm.consulting@gmail.com' ? 'admin' : 'user') as 'user' | 'admin',
            });
            setLoading(false);
          });
        } catch (err) {
          console.error("Critical Auth Persistence Error:", err);
          // Failsafe: even if firestore fails, let the user be "authenticated" at an auth level
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Guest',
            photoURL: firebaseUser.photoURL || '',
            role: (firebaseUser.email === 'dlaniger.napm.consulting@gmail.com' ? 'admin' : 'user') as 'user' | 'admin',
          });
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
