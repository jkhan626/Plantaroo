import React from 'react';
import { StyleSheet, View, Text, Pressable, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, spacing } from '../theme';
import { SproutMark } from '../ui/SproutMark';
import { APP_STORE_URL } from '../lib/updates';

/** Hard block shown when the installed build is below the required minimum. */
export function UpdateRequiredScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(48,209,88,0.16)', 'rgba(48,209,88,0.03)', 'transparent']}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <View style={styles.body}>
        <View style={styles.markCircle}>
          <SproutMark size={56} color={colors.green} />
        </View>
        <Text style={styles.title}>Time to update</Text>
        <Text style={styles.subtitle}>
          A newer version of Plantaroo is required to keep your plants in sync.
          Update from the App Store to continue.
        </Text>
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={styles.btn} onPress={() => Linking.openURL(APP_STORE_URL)}>
          <Text style={styles.btnText}>Update on the App Store</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 380 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  markCircle: {
    width: 104,
    height: 104,
    borderRadius: 30,
    backgroundColor: 'rgba(48,209,88,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: font.weight.bold,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: font.size.lg,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 23,
    paddingHorizontal: 8,
  },
  actions: {},
  btn: {
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.semibold },
});
