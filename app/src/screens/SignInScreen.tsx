import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors, font, radius, spacing } from '../theme';
import { SproutMark } from '../ui/SproutMark';
import {
  signInWithApple,
  signInWithGoogleIdToken,
  signInAsGuest,
  isAppleAuthAvailable,
} from '../lib/auth';

WebBrowser.maybeCompleteAuthSession();

const PRIVACY_URL = 'https://jkhan626.github.io/Plantaroo/privacy.html';
const TERMS_URL = 'https://jkhan626.github.io/Plantaroo/terms.html';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  googleIosClientId?: string;
  googleWebClientId?: string;
  googleAndroidClientId?: string;
};
const isRealClientId = (v?: string) => !!v && !v.startsWith('PASTE');
// Each platform needs its own OAuth client; the button hides until it exists.
const googleConfigured =
  Platform.OS === 'android'
    ? isRealClientId(extra.googleAndroidClientId)
    : isRealClientId(extra.googleIosClientId);

export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'guest'>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleAvailable);
  }, []);

  const [, googleResponse, googlePrompt] = Google.useIdTokenAuthRequest({
    iosClientId: extra.googleIosClientId,
    androidClientId: extra.googleAndroidClientId,
    clientId: extra.googleWebClientId,
  });

  useEffect(() => {
    const res = googleResponse as { type?: string; params?: { id_token?: string } } | null;
    if (res?.type === 'success') {
      const idToken = res.params?.id_token;
      if (idToken) {
        signInWithGoogleIdToken(idToken)
          .catch((e) => Alert.alert('Sign-in failed', String(e?.message ?? e)))
          .finally(() => setBusy(null));
      } else {
        setBusy(null);
      }
    } else if (res && res.type !== 'success') {
      setBusy(null);
    }
  }, [googleResponse]);

  async function onApple() {
    setBusy('apple');
    try {
      await signInWithApple();
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign-In failed', String(e?.message ?? e));
      }
    } finally {
      setBusy(null);
    }
  }

  function onGoogle() {
    setBusy('google');
    googlePrompt();
  }

  async function onGuest() {
    setBusy('guest');
    try {
      await signInAsGuest();
    } catch (e: any) {
      Alert.alert(
        'Guest sign-in unavailable',
        String(e?.code).includes('operation-not-allowed')
          ? 'Enable Anonymous sign-in in Firebase → Authentication → Sign-in method.'
          : String(e?.message ?? e),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(48,209,88,0.18)', 'rgba(48,209,88,0.03)', 'transparent']}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={styles.hero}>
        <View style={styles.markCircle}>
          <SproutMark size={62} color={colors.green} />
        </View>
        <Text style={styles.wordmark}>Plantaroo</Text>
        <Text style={styles.tagline}>
          Watering that learns from{'\n'}how you actually care for your plants.
        </Text>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.md}
            style={styles.appleBtn}
            onPress={onApple}
          />
        )}

        {googleConfigured && (
          <Pressable style={styles.googleBtn} onPress={onGoogle} disabled={!!busy}>
            {busy === 'google' ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <>
                <GoogleG />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>
        )}

        {busy === 'apple' && !appleAvailable && (
          <ActivityIndicator color={colors.textPrimary} style={{ marginTop: 8 }} />
        )}

        <Pressable style={styles.guestBtn} onPress={onGuest} disabled={!!busy}>
          {busy === 'guest' ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <Text style={styles.guestText}>Continue as guest</Text>
          )}
        </Pressable>

        <Text style={styles.legal}>
          By continuing you agree to our{' '}
          <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
            Terms
          </Text>{' '}
          and{' '}
          <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}

function GoogleG() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c11 0 19-8 19-19.5 0-1.3-.1-2.3-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 43.5c5.2 0 9.7-2 13-5.2l-6-5.1c-1.9 1.4-4.3 2.3-7 2.3-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39 16.2 43.5 24 43.5z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6 5.1c-.4.4 6.7-4.9 6.7-14.6 0-1.3-.1-2.3-.4-3.5z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  markCircle: {
    width: 116,
    height: 116,
    borderRadius: 34,
    backgroundColor: 'rgba(48,209,88,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  wordmark: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: font.size.lg,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 23,
  },
  actions: { gap: 12 },
  appleBtn: { height: 52, width: '100%' },
  googleBtn: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleText: {
    color: colors.textPrimary,
    fontSize: font.size.xl,
    fontWeight: font.weight.semibold,
  },
  guestBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  guestText: {
    color: colors.textSecondary,
    fontSize: font.size.lg,
    fontWeight: font.weight.medium,
  },
  legal: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  link: { color: colors.textSecondary, textDecorationLine: 'underline' },
});
