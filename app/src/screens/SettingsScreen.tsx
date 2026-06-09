import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Application from 'expo-application';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { ChevronLeft } from '../ui/icons';
import { currentUser, signOutUser, deleteAccount } from '../lib/auth';
import {
  getNotifyEnabled,
  setNotifyEnabled,
  requestNotificationPermission,
  rescheduleWateringReminders,
  cancelAllReminders,
} from '../logic/notify';
import { getPlants } from '../data/db';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const PRIVACY_URL = 'https://jkhan626.github.io/Plantaroo/privacy.html';
const TERMS_URL = 'https://jkhan626.github.io/Plantaroo/terms.html';
const SUPPORT_URL = 'https://jkhan626.github.io/Plantaroo/support.html';

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const user = currentUser();
  const [notify, setNotify] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getNotifyEnabled().then(setNotify);
  }, []);

  async function toggleNotify(on: boolean) {
    if (on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications off',
          'Enable notifications for Plantaroo in Settings to get watering reminders.',
        );
        setNotify(false);
        await setNotifyEnabled(false);
        return;
      }
      setNotify(true);
      await setNotifyEnabled(true);
      await rescheduleWateringReminders(getPlants());
    } else {
      setNotify(false);
      await setNotifyEnabled(false);
      await cancelAllReminders();
    }
  }

  function onSignOut() {
    Alert.alert('Sign out?', 'Your plants stay safe in the cloud.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await cancelAllReminders();
          await signOutUser();
        },
      },
    ]);
  }

  function onDelete() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all your plants, photos and history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await cancelAllReminders();
              await deleteAccount();
              // auth state change routes back to sign-in.
            } catch (e: any) {
              setDeleting(false);
              if (String(e?.code).includes('requires-recent-login')) {
                Alert.alert(
                  'Please sign in again',
                  'For your security, sign out and back in, then delete your account.',
                );
              } else {
                Alert.alert('Could not delete account', String(e?.message ?? e));
              }
            }
          },
        },
      ],
    );
  }

  const version = `${Application.nativeApplicationVersion ?? '1.0.0'} (${Application.nativeBuildVersion ?? '1'})`;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={styles.backText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>Settings</Text>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Signed in as</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {user?.email ?? user?.displayName ?? 'Apple ID'}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Reminders</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.rowLabel}>Watering reminders</Text>
              <Text style={styles.rowHint}>A daily nudge when plants are due.</Text>
            </View>
            <Switch
              value={notify}
              onValueChange={toggleNotify}
              trackColor={{ true: colors.green, false: colors.surfaceElevated }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => Linking.openURL(SUPPORT_URL)}>
            <Text style={styles.rowLabel}>Support</Text>
            <Text style={styles.rowLink}>Get help</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => Linking.openURL(PRIVACY_URL)}>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Text style={styles.rowLink}>View</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => Linking.openURL(TERMS_URL)}>
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <Text style={styles.rowLink}>View</Text>
          </Pressable>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>{version}</Text>
          </View>
        </View>

        <Pressable style={styles.signOut} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Pressable style={styles.deleteBtn} onPress={onDelete} disabled={deleting}>
          {deleting ? (
            <ActivityIndicator color={colors.red} />
          ) : (
            <Text style={styles.deleteText}>Delete account</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: 6 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.textSecondary, fontSize: font.size.xl, fontWeight: font.weight.medium },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
    marginTop: 6,
    marginBottom: 18,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 18,
    paddingLeft: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  rowLabel: { color: colors.textPrimary, fontSize: font.size.md },
  rowHint: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 3 },
  rowValue: { color: colors.textSecondary, fontSize: font.size.md, maxWidth: 200 },
  rowLink: { color: colors.green, fontSize: font.size.md, fontWeight: font.weight.medium },
  signOut: {
    marginTop: 28,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { color: colors.textPrimary, fontSize: font.size.xl, fontWeight: font.weight.semibold },
  deleteBtn: { marginTop: 12, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.red, fontSize: font.size.md, fontWeight: font.weight.medium },
});
