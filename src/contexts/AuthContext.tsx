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
      // Clear existing snapshot listener
      if (userUnsubscribe) {
        userUnsubscribe();
        userUnsubscribe = null;
      }

      if (firebaseUser) {
        const userRef = doc(db!, 'users', firebaseUser.uid);
        
        // Ensure user document exists
        const userSnap = await getDoc(userRef);
        let role: 'user' | 'admin' = 'user';
        if (firebaseUser.email === 'dlaniger.napm.consulting@gmail.com') {
          role = 'admin';
        }

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Guest',
            photoURL: firebaseUser.photoURL || '',
            role,
            createdAt: serverTimestamp(),
          });
        }

        // Set up real-time listener for the user record
        userUnsubscribe = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
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
          }
        }, (error) => {
          console.error("User snapshot error:", error);
          setLoading(false);
        });
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
