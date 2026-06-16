/**
 * Sharing & co-owners. Three jobs:
 *  - Invite someone to co-own your plants (full shared read/write).
 *  - See who currently has access and revoke it.
 *  - Switch between your own plants and any account you co-own.
 *  - Join an account from a pasted invite link / code.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, font, radius, spacing } from '../theme';
import { Check, ChevronLeft } from '../ui/icons';
import {
  createInvite,
  listCoowners,
  revokeCoowner,
  listMemberships,
  removeLocalMembership,
  acceptInvite,
  parseJoinCode,
  type Coowner,
  type Membership,
} from '../lib/sharing';
import { getUid, getSignedInUid, switchAccount } from '../data/db';

export function SharingScreen() {
  const nav = useNavigation();
  const signedIn = getSignedInUid();
  const [activeUid, setActiveUid] = useState<string | null>(getUid());
  const [coowners, setCoowners] = useState<Coowner[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setActiveUid(getUid());
    listCoowners().then(setCoowners).catch(() => {});
    listMemberships().then(setMemberships).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => refresh(), [refresh]));
  useEffect(() => refresh(), [refresh]);

  async function onInvite() {
    setBusy(true);
    try {
      const { url } = await createInvite();
      await Share.share(
        {
          message:
            `I'd like you to co-own my plants in Plantaroo. Install the app, sign in, then open ` +
            `this link to join:\n\n${url}\n\n(Or paste it into Settings → Sharing → Join an account.)`,
        },
        { subject: 'Co-own my Plantaroo plants' },
      );
    } catch (e: any) {
      Alert.alert('Could not create invite', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function onRevokeCoowner(c: Coowner) {
    Alert.alert(
      'Remove access?',
      `${c.name || 'This person'} will no longer be able to see or change your plants.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await revokeCoowner(c.uid).catch(() => {});
            refresh();
          },
        },
      ],
    );
  }

  async function onSwitch(ownerUid: string, ownerName: string | null) {
    if (ownerUid === activeUid) return;
    setBusy(true);
    try {
      await switchAccount(ownerUid, ownerName);
      setActiveUid(ownerUid);
      nav.goBack(); // back to the tabs to see the switched account
    } catch (e: any) {
      Alert.alert('Could not switch', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function onLeaveMembership(m: Membership) {
    Alert.alert('Leave this account?', `Remove ${m.ownerName}'s plants from your account switcher?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (activeUid === m.ownerUid && signedIn) await switchAccount(signedIn, null);
          await removeLocalMembership(m.ownerUid);
          refresh();
        },
      },
    ]);
  }

  async function onJoin() {
    const parsed = parseJoinCode(code);
    if (!parsed) {
      Alert.alert('Invalid link', 'Paste the full invite link or code you were sent.');
      return;
    }
    setBusy(true);
    try {
      const m = await acceptInvite(parsed.ownerUid, parsed.token);
      setCode('');
      refresh();
      Alert.alert('Joined', `You can now access ${m.ownerName}'s plants.`, [
        { text: 'Later' },
        { text: 'Switch to it', onPress: () => onSwitch(m.ownerUid, m.ownerName) },
      ]);
    } catch (e: any) {
      Alert.alert('Could not join', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const onOwnAccount = activeUid === signedIn;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={styles.backText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>Sharing</Text>

        {/* Account switcher */}
        <Text style={styles.sectionLabel}>Viewing</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => signedIn && onSwitch(signedIn, null)}>
            <Text style={styles.rowLabel}>My plants</Text>
            {onOwnAccount && <Check size={16} color={colors.green} />}
          </Pressable>
          {memberships.map((m) => (
            <View key={m.ownerUid}>
              <View style={styles.divider} />
              <Pressable style={styles.row} onPress={() => onSwitch(m.ownerUid, m.ownerName)}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.rowLabel}>{m.ownerName}'s plants</Text>
                  <Text style={styles.rowHint}>Shared with you</Text>
                </View>
                {activeUid === m.ownerUid ? (
                  <Check size={16} color={colors.green} />
                ) : (
                  <Pressable onPress={() => onLeaveMembership(m)} hitSlop={6}>
                    <Text style={styles.revoke}>Leave</Text>
                  </Pressable>
                )}
              </Pressable>
            </View>
          ))}
        </View>

        {/* People with access to MY plants */}
        <Text style={styles.sectionLabel}>People who can access my plants</Text>
        <View style={styles.card}>
          {coowners.length === 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowHint}>No one yet. Invite a partner or family member.</Text>
            </View>
          ) : (
            coowners.map((c, i) => (
              <View key={c.uid}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.rowLabel}>{c.name || 'Co-owner'}</Text>
                    <Text style={styles.rowHint}>Full access</Text>
                  </View>
                  <Pressable onPress={() => onRevokeCoowner(c)} hitSlop={6}>
                    <Text style={styles.revoke}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
        <Pressable style={styles.cta} onPress={onInvite} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <Text style={styles.ctaText}>Invite a co-owner</Text>
          )}
        </Pressable>

        {/* Join someone else's account */}
        <Text style={styles.sectionLabel}>Join an account</Text>
        <View style={styles.card}>
          <View style={{ paddingVertical: 14 }}>
            <Text style={styles.rowHint}>
              Paste an invite link someone sent you to co-own their plants.
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Paste invite link or code"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Pressable
              style={[styles.joinBtn, !code.trim() && styles.ctaDisabled]}
              onPress={onJoin}
              disabled={busy || !code.trim()}
            >
              <Text style={styles.joinText}>Join</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: 6 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backText: { color: colors.textSecondary, fontSize: font.size.xl, fontWeight: font.weight.medium },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
    marginTop: 6,
    marginBottom: 12,
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
  revoke: { color: colors.red, fontSize: font.size.md, fontWeight: font.weight.medium },
  input: {
    marginTop: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: font.size.md,
  },
  cta: {
    marginTop: 12,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: colors.surfaceElevated },
  ctaText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.semibold },
  joinBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinText: { color: colors.black, fontSize: font.size.lg, fontWeight: font.weight.semibold },
});
