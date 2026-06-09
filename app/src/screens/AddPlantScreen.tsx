import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, spacing } from '../theme';
import type {
  RootStackParamList,
} from '../navigation/types';
import type {
  PlantProfile,
  MoisturePref,
  FertType,
  WaterSource,
  SoilType,
  LightType,
  Plant,
} from '../types';
import { ScreenHeader } from '../ui/Header';
import {
  PlantAvatar,
  Segmented,
  SelectRow,
  OptionSheet,
} from '../ui/components';
import { useToast } from '../ui/Toast';
import { Camera, ChevronLeft, Check } from '../ui/icons';
import {
  SOIL_TABLE,
  SOIL_OPTIONS,
  ROOMS,
  MOISTURE_OPTIONS,
  FERT_TYPE_OPTIONS,
  WATER_SRC_OPTIONS,
  DROPDOWN_LABELS,
} from '../logic/constants';
import { localProfileLookup, defaultProfile } from '../logic/profiles';
import { dbAdd, genId, getPlants } from '../data/db';
import {
  rescheduleWateringReminders,
  getNotifyEnabled,
  requestNotificationPermission,
} from '../logic/notify';
import { choosePhoto } from '../lib/photo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function AddPlantScreen() {
  const nav = useNavigation<Nav>();
  const toast = useToast();

  const [name, setName] = useState('');
  const [room, setRoom] = useState<string>(ROOMS[0]);
  const [light, setLight] = useState<LightType>('natural');
  const [soil, setSoil] = useState<SoilType>('regular_perlite');
  const [photo, setPhoto] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlantProfile>(defaultProfile());
  const [matched, setMatched] = useState<null | boolean>(null);

  const [sheet, setSheet] = useState<null | 'room' | 'soil' | 'moisture' | 'fert' | 'water'>(null);

  // Preset rooms + any rooms already used by the user's plants + the current pick.
  const roomOptions = useMemo(() => {
    const used = getPlants().map((p) => p.room).filter(Boolean);
    return Array.from(new Set<string>([...ROOMS, ...used, room]));
  }, [room]);

  function promptCustomRoom() {
    if (Platform.OS === 'ios') {
      Alert.prompt('New room', 'Name this room (e.g. Sunroom, Desk)', (text) => {
        const t = (text || '').trim();
        if (t) setRoom(t);
      });
    }
  }

  function onRoomSelect(v: string) {
    if (v === '__custom__') setTimeout(promptCustomRoom, 350);
    else setRoom(v);
  }

  // Soil-adjusted starting interval — visibly reflects the plant + soil choice.
  const startInterval = useMemo(() => {
    const mult = SOIL_TABLE[soil]?.mult;
    if (mult === null) return 2;
    return Math.round(profile.species_baseline_days * (mult ?? 1) * 10) / 10;
  }, [soil, profile.species_baseline_days]);

  function resolveProfile() {
    const found = localProfileLookup(name);
    if (found) {
      setProfile(found);
      setMatched(true);
      // Carnivores want peat + distilled defaults.
      if (found.carnivore && soil === 'regular_perlite') setSoil('carnivore_peat');
    } else {
      setProfile(defaultProfile());
      setMatched(false);
    }
  }

  function bump(field: 'species_baseline_days' | 'feed_every_n_waterings', delta: number) {
    setProfile((p) => {
      const min = field === 'feed_every_n_waterings' ? 0 : 1;
      const max = field === 'feed_every_n_waterings' ? 30 : 90;
      const next = Math.max(min, Math.min(max, (p[field] || 0) + delta));
      return { ...p, [field]: next };
    });
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const firstPlant = getPlants().length === 0;
    const soilMult = SOIL_TABLE[soil]?.mult;
    const effectiveStart = soilMult === null ? 2 : profile.species_baseline_days * (soilMult ?? 1);
    const plant: Plant = {
      id: genId(),
      name: trimmed,
      room,
      light_type: light,
      soil_type: soil,
      photo,
      ...profile,
      current_interval: effectiveStart,
      recent_valid_gaps: [],
      last_watered: null,
      last_fertilized: null,
      last_fed_at_count: 0,
      no_fert_until: null,
      watering_count: 0,
      notes: '',
      created_at: new Date().toISOString(),
    };
    await dbAdd('plants', plant);
    rescheduleWateringReminders(getPlants());
    toast.show({ message: `${trimmed} added` });
    nav.goBack();
    // Ask for notification permission at the first high-intent moment.
    if (firstPlant && (await getNotifyEnabled())) {
      requestNotificationPermission().then((granted) => {
        if (granted) rescheduleWateringReminders(getPlants());
      });
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={styles.backText}>Cancel</Text>
        </Pressable>
      </View>
      <ScreenHeader title="New plant" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.photoRow}>
            <Pressable onPress={() => choosePhoto(setPhoto)}>
              <PlantAvatar uri={photo} size={72} />
              <View style={styles.cameraBadge}>
                <Camera size={13} color={colors.black} />
              </View>
            </Pressable>
            <Pressable onPress={() => choosePhoto(setPhoto)} style={styles.photoBtn}>
              <Text style={styles.photoBtnText}>{photo ? 'Change photo' : 'Add a photo'}</Text>
            </Pressable>
          </View>

          <Field label="Name">
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={resolveProfile}
              placeholder="e.g. Monstera, Basil, Snake Plant"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCorrect={false}
              returnKeyType="next"
            />
          </Field>

          <View style={styles.card}>
            <SelectRow label="Room" valueLabel={room} onPress={() => setSheet('room')} />
            <View style={styles.divider} />
            <SelectRow label="Soil mix" valueLabel={SOIL_TABLE[soil].short} onPress={() => setSheet('soil')} />
          </View>

          <Field label="Light">
            <Segmented
              value={light}
              onChange={setLight}
              options={[
                { label: 'Natural', value: 'natural' },
                { label: 'Grow light', value: 'grow' },
              ]}
            />
          </Field>

          {/* Care profile — derived from the plant + your soil/light */}
          <View style={styles.profileHeaderRow}>
            <Text style={styles.sectionLabel}>Care profile</Text>
            {matched !== null && (
              <View style={styles.matchTag}>
                {matched && <Check size={12} color={colors.green} />}
                <Text style={[styles.matchText, { color: matched ? colors.green : colors.textTertiary }]}>
                  {matched ? 'Updated based on plant & settings' : 'Set it manually below'}
                </Text>
              </View>
            )}
          </View>

          {matched !== null && (
            <Text style={styles.deriveHint}>
              With your soil, waters about every {startInterval} day{startInterval === 1 ? '' : 's'}
              {light === 'natural' ? ' (slower in winter)' : ''} — then adjusts as it learns from you.
            </Text>
          )}

          <View style={styles.card}>
            <SelectRow
              label="Moisture"
              valueLabel={DROPDOWN_LABELS[profile.moisture_pref]}
              onPress={() => setSheet('moisture')}
            />
            <View style={styles.divider} />
            <Stepper
              label="Baseline interval"
              value={`${profile.species_baseline_days} days`}
              onDec={() => bump('species_baseline_days', -1)}
              onInc={() => bump('species_baseline_days', 1)}
            />
            <View style={styles.divider} />
            <SelectRow
              label="Fertilizer"
              valueLabel={DROPDOWN_LABELS[profile.fert_type]}
              onPress={() => setSheet('fert')}
            />
            <View style={styles.divider} />
            <Stepper
              label="Feed every"
              value={profile.feed_every_n_waterings ? `${profile.feed_every_n_waterings} waterings` : 'Never'}
              onDec={() => bump('feed_every_n_waterings', -1)}
              onInc={() => bump('feed_every_n_waterings', 1)}
            />
            <View style={styles.divider} />
            <SelectRow
              label="Water source"
              valueLabel={DROPDOWN_LABELS[profile.water_source]}
              onPress={() => setSheet('water')}
            />
            <View style={styles.divider} />
            <View style={styles.carnRow}>
              <Text style={styles.rowLabel}>Carnivorous</Text>
              <View style={{ width: 150 }}>
                <Segmented
                  value={profile.carnivore ? 'yes' : 'no'}
                  onChange={(v) => setProfile((p) => ({ ...p, carnivore: v === 'yes' }))}
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Yes', value: 'yes' },
                  ]}
                />
              </View>
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
            onPress={save}
            disabled={!name.trim()}
          >
            <Text style={styles.saveText}>Add plant</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={sheet === 'room'}
        title="Room"
        selected={room}
        options={[
          ...roomOptions.map((r) => ({ label: r, value: r })),
          ...(Platform.OS === 'ios' ? [{ label: '＋  Add a custom room…', value: '__custom__' }] : []),
        ]}
        onSelect={onRoomSelect}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'soil'}
        title="Soil mix"
        selected={soil}
        options={SOIL_OPTIONS.map((v) => ({ label: SOIL_TABLE[v].label, value: v }))}
        onSelect={(v) => setSoil(v as SoilType)}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'moisture'}
        title="Moisture preference"
        selected={profile.moisture_pref}
        options={MOISTURE_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v }))}
        onSelect={(v) => setProfile((p) => ({ ...p, moisture_pref: v as MoisturePref }))}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'fert'}
        title="Fertilizer type"
        selected={profile.fert_type}
        options={FERT_TYPE_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v }))}
        onSelect={(v) => setProfile((p) => ({ ...p, fert_type: v as FertType }))}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'water'}
        title="Water source"
        selected={profile.water_source}
        options={WATER_SRC_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v }))}
        onSelect={(v) => setProfile((p) => ({ ...p, water_source: v as WaterSource }))}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={onDec} hitSlop={6}>
          <Text style={styles.stepSign}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable style={styles.stepBtn} onPress={onInc} hitSlop={6}>
          <Text style={styles.stepSign}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: 6 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.textSecondary, fontSize: font.size.xl, fontWeight: font.weight.medium },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18, marginTop: 4 },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  photoBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.md,
  },
  photoBtnText: { color: colors.textSecondary, fontSize: font.size.md, fontWeight: font.weight.medium },

  field: { marginBottom: 18 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 52,
    color: colors.textPrimary,
    fontSize: font.size.xl,
    fontWeight: font.weight.medium,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  matchTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  matchText: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  deriveHint: {
    color: colors.textTertiary,
    fontSize: font.size.sm,
    lineHeight: 18,
    marginTop: -2,
    marginBottom: 10,
    paddingLeft: 2,
  },

  rowLabel: { color: colors.textSecondary, fontSize: font.size.md },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSign: { color: colors.green, fontSize: 20, fontWeight: font.weight.semibold, lineHeight: 22 },
  stepValue: { color: colors.textPrimary, fontSize: font.size.md, fontWeight: font.weight.medium, minWidth: 86, textAlign: 'center' },

  carnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },

  saveBtn: {
    backgroundColor: colors.green,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.semibold },
});
