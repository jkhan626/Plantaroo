/**
 * Auth — Sign in with Apple (required by App Store guideline 4.8 since we also
 * offer Google) + Google, both feeding Firebase Auth. Plus sign-out and the
 * App-Store-required in-app account deletion.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  OAuthProvider,
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously,
  signOut as fbSignOut,
  onAuthStateChanged,
  reauthenticateWithCredential,
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

// ---- Apple ---- (no nonce — identical to the working Liftaroo implementation)
export async function isAppleAuthAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<User> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw new Error('Apple Sign-In failed — no identity token.');
  }
  const provider = new OAuthProvider('apple.com');
  const fbCredential = provider.credential({ idToken: credential.identityToken });
  const result = await signInWithCredential(auth, fbCredential);
  return result.user;
}

// ---- Guest (anonymous) ----
export async function signInAsGuest(): Promise<User> {
  const result = await signInAnonymously(auth);
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

// Render service (free tier) — only used for Apple token revocation.
const REVOKE_ENDPOINT = 'https://plantaroo.onrender.com/api/apple-revoke';

/**
 * Revoke the Sign in with Apple tokens (App Store guideline 5.1.1(v)).
 * Best-effort: the server returns 501 until the Apple key is configured on
 * Render, and a failed revocation must never block account deletion.
 */
async function revokeAppleTokens(authorizationCode: string): Promise<void> {
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode }),
    });
  } catch {
    // Offline or server cold-start — deletion proceeds regardless.
  }
}

/**
 * Delete the account and ALL associated data (App Store guideline 5.1.1).
 *
 * Apple accounts re-authenticate inline first — one Face ID prompt that both
 * satisfies Firebase's recent-login requirement and yields the authorization
 * code Apple requires for token revocation. Cancelling the prompt aborts the
 * deletion (throws ERR_REQUEST_CANCELED).
 *
 * Other providers may still throw 'auth/requires-recent-login' — caller
 * handles that with a sign-out-and-back-in message.
 */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  const isApple = user.providerData.some((p) => p.providerId === 'apple.com');
  if (isApple) {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (credential.identityToken) {
      const provider = new OAuthProvider('apple.com');
      await reauthenticateWithCredential(
        user,
        provider.credential({ idToken: credential.identityToken }),
      );
    }
    if (credential.authorizationCode) {
      await revokeAppleTokens(credential.authorizationCode);
    }
  }

  await deleteAllUserData();
  await user.delete();
}
