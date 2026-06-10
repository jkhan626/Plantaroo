import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle } from 'react-native-svg';
import { colors, font, radius, spacing, dueColor as dueColorFor } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type {
  Plant,
  MoisturePref,
  FertType,
  WaterSource,
  SoilType,
  LightType,
} from '../types';
import { usePlant, useHistory } from '../ui/hooks';
import { useWaterAction } from '../ui/useWater';
import { useToast } from '../ui/Toast';
import { PlantAvatar, OptionSheet } from '../ui/components';
import { DateSheet } from '../ui/DateSheet';
import {
  ChevronLeft,
  Droplet,
  Skip as SkipIcon,
  Repot as RepotIcon,
  Trash,
  Camera,
} from '../ui/icons';
import {
  getClampedInterval,
  getSeasonalMultiplier,
  getSeasonLabel,
  formatDueDate,
  getDaysUntilDue,
  relativeDayLabel,
} from '../logic/schedule';
import {
  SOIL_TABLE,
  SOIL_OPTIONS,
  ROOMS,
  MOISTURE_OPTIONS,
  FERT_TYPE_OPTIONS,
  WATER_SRC_OPTIONS,
  DROPDOWN_LABELS,
  displayLabel,
} from '../logic/constants';
import {
  patchPlant,
  setLastWatered,
  saveNotes,
  skipPlant,
  repotPlant,
  undoAction,
  removeHistoryEntry,
} from '../logic/actions';
import { rescheduleWateringReminders } from '../logic/notify';
import { getPlants, getHistory, dbDelete } from '../data/db';
import { choosePhoto } from '../lib/photo';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EditorField = 'moisture_pref' | 'fert_type' | 'water_source' | 'soil_type' | 'light_type' | 'room';

// Due-progress ring around the hero avatar (elapsed / effective interval).
const RING_SIZE = 126;
const RING_STROKE = 6;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const MS_PER_DAY = 86_400_000;

interface Editor {
  field: EditorField;
  title: string;
  options: { label: string; value: string }[];
  selected: string;
}

export function PlantDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'PlantDetail'>>();
  const plant = usePlant(route.params.id);
  const allHistory = useHistory();
  const { water } = useWaterAction();
  const toast = useToast();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    if (plant) setNotesDraft(plant.notes ?? '');
  }, [plant?.id]);

  // Plant was deleted underneath us.
  useEffect(() => {
    if (!plant) nav.goBack();
  }, [plant, nav]);

  if (!plant) return <SafeAreaView style={styles.root} />;

  const interval = getClampedInterval(plant);
  const seasonal = getSeasonalMultiplier(plant.light_type);
  const dueDays = getDaysUntilDue(plant);
  const dueColor =
    !plant.last_watered ? colors.blue : dueDays < 0 ? colors.red : dueDays <= 2 ? colors.orange : colors.textPrimary;

  // Ring progress: how far through the effective interval we are.
  const effectiveInterval = interval * seasonal;
  const elapsedDays = plant.last_watered
    ? (Date.now() - new Date(plant.last_watered).getTime()) / MS_PER_DAY
    : 0;
  const ringProgress = plant.last_watered
    ? Math.max(0.02, Math.min(elapsedDays / effectiveInterval, 1))
    : 0;
  const ringColor = dueColorFor(plant.last_watered ? dueDays : 0, !plant.last_watered);
  const myHistory = allHistory
    .filter((h) => h.plantId === plant.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  async function reschedule() {
    rescheduleWateringReminders(getPlants());
  }

  function confirmRemoveActivity(h: (typeof myHistory)[number]) {
    const isWater = h.type === 'Watered' || h.type === 'Watered + Fed';
    Alert.alert(
      isWater ? 'Unwater this plant?' : 'Remove this event?',
      isWater
        ? `This removes the "${h.type}" event and recalculates the schedule.`
        : `This removes the "${h.type}" event.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeHistoryEntry(h);
            reschedule();
          },
        },
      ],
    );
  }

  function commitName() {
    const n = nameDraft.trim();
    setEditingName(false);
    if (n && plant && n !== plant.name) patchPlant(plant, { name: n });
  }

  async function onLastWateredDone(d: Date) {
    setDateOpen(false);
    if (!plant) return;
    const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString();
    await setLastWatered(plant, iso);
    reschedule();
  }
  async function onLastWateredClear() {
    setDateOpen(false);
    if (!plant) return;
    await setLastWatered(plant, null);
    reschedule();
  }

  async function doSkip() {
    if (!plant) return;
    const { undo } = await skipPlant(plant);
    reschedule();
    toast.show({
      message: `${plant.name} skipped`,
      kind: 'info',
      onUndo: async () => {
        await undoAction(undo);
        reschedule();
      },
    });
  }
  async function doRepot() {
    if (!plant) return;
    const { undo } = await repotPlant(plant);
    toast.show({
      message: 'Repotted — no fertilizer for 2 weeks',
      kind: 'info',
      onUndo: async () => undoAction(undo),
    });
  }

  function editNumber(field: 'species_baseline_days' | 'feed_every_n_waterings', label: string) {
    if (Platform.OS !== 'ios') return; // Alert.prompt is iOS-only
    Alert.prompt(
      label,
      undefined,
      (text) => {
        const n = parseFloat(text);
        if (!isNaN(n) && n >= 0 && plant) patchPlant(plant, { [field]: n } as Partial<Plant>);
      },
      'plain-text',
      String(plant![field]),
      'numeric',
    );
  }

  function openEditor(field: EditorField) {
    const map: Record<EditorField, Omit<Editor, 'selected'>> = {
      moisture_pref: {
        field,
        title: 'Moisture preference',
        options: MOISTURE_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v })),
      },
      fert_type: {
        field,
        title: 'Fertilizer type',
        options: FERT_TYPE_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v })),
      },
      water_source: {
        field,
        title: 'Water source',
        options: WATER_SRC_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v })),
      },
      soil_type: {
        field,
        title: 'Soil mix',
        options: SOIL_OPTIONS.map((v) => ({ label: SOIL_TABLE[v].label, value: v })),
      },
      light_type: {
        field,
        title: 'Light',
        options: [
          { label: 'Natural light', value: 'natural' },
          { label: 'Grow light', value: 'grow' },
        ],
      },
      room: { field, title: 'Room', options: ROOMS.map((r) => ({ label: r, value: r })) },
    };
    setEditor({ ...map[field], selected: String((plant as any)[field]) });
  }

  function applyEditor(value: string) {
    if (!editor || !plant) return;
    patchPlant(plant, { [editor.field]: value } as Partial<Plant>);
  }

  function confirmDelete() {
    Alert.alert('Delete plant?', `${plant!.name} and its history will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const id = plant!.id;
          for (const h of getHistory().filter((h) => h.plantId === id)) {
            await dbDelete('history', h.id);
          }
          await dbDelete('plants', id);
          reschedule();
          nav.goBack();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={styles.backText}>Plants</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Pressable onPress={() => choosePhoto((uri) => patchPlant(plant, { photo: uri }))}>
            <View style={styles.ringWrap}>
              <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  stroke={colors.surfaceElevated}
                  strokeWidth={RING_STROKE}
                  fill="none"
                />
                {ringProgress > 0 && (
                  <Circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_R}
                    stroke={ringColor}
                    strokeWidth={RING_STROKE}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${RING_C}`}
                    strokeDashoffset={RING_C * (1 - ringProgress)}
                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                  />
                )}
              </Svg>
              <PlantAvatar uri={plant.photo} size={104} />
              <View style={styles.cameraBadge}>
                <Camera size={15} color={colors.black} />
              </View>
            </View>
          </Pressable>
          {editingName ? (
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              onBlur={commitName}
              onSubmitEditing={commitName}
              style={styles.nameInput}
              returnKeyType="done"
            />
          ) : (
            <Pressable
              onPress={() => {
                setNameDraft(plant.name);
                setEditingName(true);
              }}
            >
              <Text style={styles.name}>{plant.name}</Text>
            </Pressable>
          )}

          {/* Quiet stat strip */}
          <View style={styles.statStrip}>
            <Stat value={`${Math.round(effectiveInterval)}d`} label="Interval" />
            <View style={styles.statDivider} />
            <Stat value={displayLabel(plant.moisture_pref)} label="Moisture" />
            <View style={styles.statDivider} />
            <Stat value={plant.light_type === 'grow' ? 'Grow' : 'Natural'} label="Light" />
            <View style={styles.statDivider} />
            <Stat
              value={
                plant.carnivore || !plant.feed_every_n_waterings
                  ? 'Never'
                  : `Every ${plant.feed_every_n_waterings}`
              }
              label="Feed"
            />
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.actions}>
          <ActionBtn label="Water" tint={colors.green} bg={colors.greenBg} onPress={() => water(plant)}>
            <Droplet size={18} color={colors.green} />
          </ActionBtn>
          <ActionBtn label="Skip" tint={colors.textSecondary} bg="rgba(142,142,147,0.1)" onPress={doSkip}>
            <SkipIcon size={18} color={colors.textSecondary} />
          </ActionBtn>
          <ActionBtn label="Repot" tint={colors.orange} bg={colors.orangeBg} onPress={doRepot}>
            <RepotIcon size={18} color={colors.orange} />
          </ActionBtn>
        </View>

        {plant.carnivore && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              Carnivorous — distilled or rain water only, never fertilize.
            </Text>
          </View>
        )}

        {/* Schedule */}
        <Section title="Schedule">
          <Row label="Last watered" value={relativeDayLabel(plant.last_watered)} onPress={() => setDateOpen(true)} />
          <Row label="Next due" value={formatDueDate(plant)} valueColor={dueColor} />
          <Row label="Learned interval" value={`${interval.toFixed(1)} days`} />
          <Row label="Seasonal" value={`${seasonal.toFixed(2)}× · ${getSeasonLabel()}`} />
          <Row label="Waterings logged" value={String(plant.watering_count || 0)} last />
        </Section>

        {/* Care profile */}
        <Section title="Care profile">
          <Row label="Moisture" value={displayLabel(plant.moisture_pref)} onPress={() => openEditor('moisture_pref')} />
          <Row
            label="Baseline interval"
            value={`${plant.species_baseline_days} days`}
            onPress={Platform.OS === 'ios' ? () => editNumber('species_baseline_days', 'Baseline days between waterings') : undefined}
          />
          <Row label="Fertilizer" value={displayLabel(plant.fert_type)} onPress={() => openEditor('fert_type')} />
          <Row
            label="Feed every"
            value={plant.feed_every_n_waterings ? `${plant.feed_every_n_waterings} waterings` : 'Never'}
            onPress={Platform.OS === 'ios' ? () => editNumber('feed_every_n_waterings', 'Feed every N waterings (0 = never)') : undefined}
          />
          <Row label="Water source" value={displayLabel(plant.water_source)} onPress={() => openEditor('water_source')} last />
        </Section>

        {/* Setup */}
        <Section title="Setup">
          <Row label="Room" value={plant.room || '—'} onPress={() => openEditor('room')} />
          <Row label="Light" value={plant.light_type === 'grow' ? 'Grow light' : 'Natural'} onPress={() => openEditor('light_type')} />
          <Row label="Soil mix" value={SOIL_TABLE[plant.soil_type]?.short ?? '—'} onPress={() => openEditor('soil_type')} last />
        </Section>

        {/* Notes */}
        <Section title="Notes">
          <TextInput
            value={notesDraft}
            onChangeText={setNotesDraft}
            onBlur={() => plant && saveNotes(plant, notesDraft)}
            placeholder="Add a note…"
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.notes}
          />
        </Section>

        {/* History */}
        {myHistory.length > 0 && (
          <Section title="Recent activity">
            {myHistory.map((h) => (
              <Pressable
                key={h.id}
                style={styles.histRow}
                onLongPress={() => confirmRemoveActivity(h)}
                delayLongPress={350}
              >
                <Text style={styles.histType}>
                  {h.type}
                  {h.lateReason ? <Text style={styles.histReason}>{`  ·  ${h.lateReason}`}</Text> : ''}
                </Text>
                <Text style={styles.histDate}>
                  {new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              </Pressable>
            ))}
          </Section>
        )}

        <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
          <Trash size={17} color={colors.red} />
          <Text style={styles.deleteText}>Delete plant</Text>
        </Pressable>
      </ScrollView>

      <DateSheet
        visible={dateOpen}
        title="Last watered"
        initial={plant.last_watered ? new Date(plant.last_watered) : undefined}
        allowClear
        onDone={onLastWateredDone}
        onClear={onLastWateredClear}
        onClose={() => setDateOpen(false)}
      />
      <OptionSheet
        visible={!!editor}
        title={editor?.title ?? ''}
        options={editor?.options ?? []}
        selected={editor?.selected}
        onSelect={applyEditor}
        onClose={() => setEditor(null)}
      />
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
  onPress,
  last,
}: {
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null, onPress ? { color: colors.green } : null]}>
        {value}
      </Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

function ActionBtn({
  label,
  tint,
  bg,
  onPress,
  children,
}: {
  label: string;
  tint: string;
  bg: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={[styles.actionBtn, { backgroundColor: bg }]} onPress={onPress}>
      {children}
      <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.lg, paddingVertical: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.textSecondary, fontSize: font.size.xl, fontWeight: font.weight.medium },
  scroll: { paddingBottom: 60 },

  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 20 },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 16,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue: {
    color: colors.textPrimary,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 3,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.hairline,
  },
  cameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  name: { color: colors.textPrimary, fontSize: 24, fontWeight: font.weight.bold, marginTop: 14, letterSpacing: -0.3 },
  nameInput: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: font.weight.bold,
    textAlign: 'center',
    marginTop: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 220,
  },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, marginBottom: 8 },
  actionBtn: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: { fontSize: font.size.base, fontWeight: font.weight.semibold },

  warning: {
    marginHorizontal: spacing.lg,
    marginTop: 8,
    backgroundColor: colors.redBg,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.12)',
    borderRadius: radius.md,
    padding: 13,
  },
  warningText: { color: colors.redSoft, fontSize: font.size.base, fontWeight: font.weight.medium, textAlign: 'center' },

  section: { marginTop: 22, paddingHorizontal: spacing.lg },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textSecondary, fontSize: font.size.md },
  rowValue: { color: colors.textPrimary, fontSize: font.size.md, fontWeight: font.weight.medium },

  notes: {
    color: colors.textPrimary,
    fontSize: font.size.md,
    minHeight: 64,
    paddingVertical: 14,
    textAlignVertical: 'top',
  },

  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  histType: { color: colors.textPrimary, fontSize: font.size.md, fontWeight: font.weight.medium },
  histReason: { color: colors.orange, fontWeight: font.weight.regular },
  histDate: { color: colors.textMuted, fontSize: font.size.sm },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: 28,
    paddingVertical: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.16)',
    backgroundColor: colors.redBg,
  },
  deleteText: { color: colors.red, fontSize: font.size.lg, fontWeight: font.weight.semibold },
});
