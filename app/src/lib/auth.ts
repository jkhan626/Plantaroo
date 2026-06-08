/**
 * Auth — Sign in with Apple (required by App Store guideline 4.8 since we also
 * offer Google) + Google, both feeding Firebase Auth. Plus sign-out and the
 * App-Store-required in-app account deletion.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  OAuthProvider,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';
import { deleteAllUserData } from '../data/db';

export type { User };

export function onAuthChange(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export function currentUser(): User | null {
  return auth.currentUser;
}

// ---- Apple ----
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  const raw = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
  );
  return { raw, hashed };
}

export async function isAppleAuthAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<User> {
  const { raw, hashed } = await makeNonce();
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashed,
  });
  if (!credential.identityToken) {
    throw new Error('Apple Sign-In failed — no identity token.');
  }
  const provider = new OAuthProvider('apple.com');
  const fbCredential = provider.credential({
    idToken: credential.identityToken,
    rawNonce: raw,
  });
  const result = await signInWithCredential(auth, fbCredential);
  return result.user;
}

// ---- Google (idToken comes from the expo-auth-session Google provider hook) ----
export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

// ---- sign out ----
export async function signOutUser(): Promise<void> {
  await fbSignOut(auth);
}

/**
 * Delete the account and ALL associated data (App Store guideline 5.1.1).
 * Wipes the Firestore subtree first, then the Firebase Auth user.
 * May throw 'auth/requires-recent-login' — caller should re-auth and retry.
 *
 * NOTE: full Apple token revocation (recommended for SiwA) requires a small
 * backend endpoint with the authorization code; tracked in SETUP.md.
 */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  await deleteAllUserData();
  await user.delete();
}
