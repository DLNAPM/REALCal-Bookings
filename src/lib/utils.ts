import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Detects if the current user agent is an Apple device/OS */
export function isAppleOS(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|macintosh|mac os x/.test(userAgent);
}

/** Returns the appropriate Google Maps or Apple Maps query URL depending on OS */
export function getMapLink(address: string): string {
  if (!address) return '';
  const isApple = isAppleOS();
  if (isApple) {
    return `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
  }
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

/** Error handler specifically matching the Firebase constraints */
export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null) {
  console.error("Firestore Error:", error);
  // Re-throw or format as per rules
  throw new Error(`Firestore \${operationType} failed at \${path || 'unknown'}: \${error.message}`);
}
