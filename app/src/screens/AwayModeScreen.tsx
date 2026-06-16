/**
 * Away mode (plant-sitter share). Pick the dates you'll be away → preview which
 * plants need water on which days → publish a token schedule and share the
 * jamasha.com link. Sitter check-offs flow back via drainGuestEvents() on open.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radius, spacing } from '../theme';
import { ChevronLeft } from '../ui/icons';
import { DateSheet } from '../ui/DateSheet';
import {
  buildAwaySchedule,
  createGuestShare,
  listGuestShares,
  revokeGuestShare,
  sitterUrl,
  getOwnerName,
  setOwnerName,
  type GuestShare,
} from '../lib/sharing';
import { getSignedInUid, isViewingOwnAccount, switchAccount } from '../data/db';

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmt(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtYMD(ymd: string): string {
  const [y, m, day] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function AwayModeScreen() {
  const nav = useNavigation();
  const today = startOfDay(new Date());
  const [from, setFrom] = useState<Date>(today);
  const [to, setTo] = useState<Date>(new Date(today.getTime() + 7 * MS_PER_DAY));
  const [picking, setPicking] = useState<null | 'from' | 'to'>(null);
  const [creating, setCreating] = useState(false);
  const [shares, setShares] = useState<GuestShare[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    getOwnerName().then(setName);
  }, []);
  function saveName() {
    setOwnerName(name).then(loadShares); // back-fill existing links + refresh list
  }

  const schedule = useMemo(() => buildAwaySchedule(from, to), [from, to]);
  const totalWaterings = useMemo(
    () => schedule.reduce((n, p) => n + p.dueDates.length, 0),
    [schedule],
  );

  async function loadShares() {
    setShares(await listGuestShares().catch(() => []));
  }
  useEffect(() => {
    loadShares();
  }, []);

  async function onCreate() {
    if (schedule.length === 0) {
      Alert.alert('Nothing to water', 'No plants are due in that window. Try a longer range.');
      return;
    }
    setCreating(true);
    try {
      await setOwnerName(name); // make sure the link uses the latest name
      const { url, plantCount } = await createGuestShare(from, to);
      await loadShares();
      await Share.share(
        {
          message:
            `Hi! Can you help water my plants while I'm away (${fmt(from)}–${fmt(to)})? ` +
            `Here's exactly what to water and when — tap to check each one off:\n\n${url}`,
        },
        { subject: 'Plant-sitting schedule' },
      );
      if (plantCount !== schedule.length) {
        // (photos may have been dropped to fit; no action needed)
      }
    } catch (e: any) {
      Alert.alert('Could not create link', String(e?.message ?? e));
    } finally {
      setCreating(false);
    }
  }

  function onShareExisting(s: GuestShare) {
    const uid = getSignedInUid();
    if (!uid) return;
    const url = sitterUrl(uid, s.token);
    Share.share({ message: `Plant-sitting schedule (${fmtYMD(s.start)}–${fmtYMD(s.end)}):\n\n${url}` });
  }

  function onRevoke(s: GuestShare) {
    Alert.alert('Revoke this link?', 'The sitter will no longer be able to open it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          await revokeGuestShare(s.token).catch(() => {});
          await loadShares();
        },
      },
    ]);
  }

  if (!isViewingOwnAccount()) {
    const me = getSignedInUid();
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
            <ChevronLeft size={18} color={colors.textSecondary} />
            <Text style={styles.backText}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.scroll}>
          <Text style={styles.screenTitle}>Going away?</Text>
          <Text style={styles.subtitle}>
            Plant-sitter links are for your own plants. Switch back to your account to make one.
          </Text>
          <Pressable
            style={styles.cta}
            onPress={() => me && switchAccount(me, null).then(() => nav.goBack())}
          >
            <Text style={styles.ctaText}>Switch to my plants</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={styles.backText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>Going away?</Text>
        <Text style={styles.subtitle}>
          Pick the days you'll be gone. We'll build a watering schedule you can send to a plant
          sitter — they just open the link, no app needed.
        </Text>

        <Text style={styles.sectionLabel}>Your name</Text>
        <View style={styles.card}>
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={saveName}
            onBlur={saveName}
            placeholder="e.g. Jamal"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            style={styles.nameInput}
          />
        </View>
        <Text style={styles.fieldHint}>The sitter sees this — "{name || 'Your'}'s plants".</Text>

        <Text style={styles.sectionLabel}>Dates away</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => setPicking('from')}>
            <Text style={styles.rowLabel}>From</Text>
            <Text style={styles.rowLink}>{fmt(from)}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => setPicking('to')}>
            <Text style={styles.rowLabel}>To</Text>
            <Text style={styles.rowLink}>{fmt(to)}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>
          {totalWaterings > 0
            ? `${schedule.length} plant${schedule.length === 1 ? '' : 's'} · ${totalWaterings} watering${totalWaterings === 1 ? '' : 's'}`
            : 'Schedule'}
        </Text>
        <View style={styles.card}>
          {schedule.length === 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowHint}>No plants are due in this window.</Text>
            </View>
          ) : (
            schedule.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.planRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.rowLabel}>{p.name}</Text>
                    {!!p.room && <Text style={styles.rowHint}>{p.room}</Text>}
                  </View>
                  <Text style={styles.dates}>{p.dueDates.map(fmtYMD).join(', ')}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Pressable
          style={[styles.cta, (creating || schedule.length === 0) && styles.ctaDisabled]}
          onPress={onCreate}
          disabled={creating || schedule.length === 0}
        >
          {creating ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <Text style={styles.ctaText}>Create share link</Text>
          )}
        </Pressable>

        {shares.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Active links</Text>
            <View style={styles.card}>
              {shares.map((s, i) => (
                <View key={s.token}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={styles.rowLabel}>
                        {fmtYMD(s.start)} – {fmtYMD(s.end)}
                      </Text>
                      <Text style={styles.rowHint}>
                        {s.plants.length} plant{s.plants.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Pressable onPress={() => onShareExisting(s)} hitSlop={6}>
                      <Text style={styles.rowLink}>Share</Text>
                    </Pressable>
                    <Pressable onPress={() => onRevoke(s)} hitSlop={6} style={{ marginLeft: 16 }}>
                      <Text style={styles.revoke}>Revoke</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <DateSheet
        visible={picking === 'from'}
        title="From"
        initial={from}
        minimumDate={today}
        maximumDate={undefined}
        onDone={(d) => {
          const nd = startOfDay(d);
          setFrom(nd);
          if (to < nd) setTo(nd);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <DateSheet
        visible={picking === 'to'}
        title="To"
        initial={to}
        minimumDate={from}
        maximumDate={undefined}
        onDone={(d) => {
          setTo(startOfDay(d));
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
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
    marginBottom: 8,
  },
  subtitle: { color: colors.textSecondary, fontSize: font.size.md, lineHeight: 20, marginBottom: 8 },
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
  planRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  rowLabel: { color: colors.textPrimary, fontSize: font.size.md },
  rowHint: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 3 },
  rowLink: { color: colors.green, fontSize: font.size.md, fontWeight: font.weight.medium },
  revoke: { color: colors.red, fontSize: font.size.md, fontWeight: font.weight.medium },
  nameInput: {
    color: colors.textPrimary,
    fontSize: font.size.md,
    paddingVertical: 15,
  },
  fieldHint: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 6, paddingLeft: 2 },
  dates: { color: colors.textSecondary, fontSize: font.size.sm, maxWidth: 170, textAlign: 'right' },
  cta: {
    marginTop: 24,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: colors.surfaceElevated },
  ctaText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.semibold },
});
