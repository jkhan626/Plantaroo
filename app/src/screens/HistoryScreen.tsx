import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '../theme';
import type { HistoryEntry, Plant } from '../types';
import { useHistory, usePlants, useJournal } from '../ui/hooks';
import { dbDelete, isHydrated, refreshFromCloud } from '../data/db';
import { ScreenHeader } from '../ui/Header';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonRows } from '../ui/Skeleton';
import { PressableScale } from '../ui/components';
import { Clock, Sliders, Check, X } from '../ui/icons';
import { removeHistoryEntry } from '../logic/actions';
import { rescheduleWateringReminders } from '../logic/notify';
import { getPlants } from '../data/db';

function confirmRemoveEvent(h: HistoryEntry) {
  const isWater = h.type === 'Watered' || h.type === 'Watered + Fed';
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  Alert.alert(
    isWater ? 'Unwater this plant?' : 'Remove this event?',
    isWater
      ? `This removes the "${h.type}" event and recalculates ${h.plantName}'s schedule.`
      : `This removes the "${h.type}" event for ${h.plantName}.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeHistoryEntry(h);
          rescheduleWateringReminders(getPlants());
        },
      },
    ],
  );
}

const TYPE_COLOR: Record<string, string> = {
  Watered: colors.green,
  'Watered + Fed': colors.purple,
  Skipped: colors.textSecondary,
  Repotted: colors.orange,
  Misted: colors.lightBlue,
  Cleaned: colors.textSecondary,
  Pruned: colors.orange,
  'Growth photo': colors.lightBlue,
};

/** Unified row: a real history event, or a journal entry shown alongside. */
interface FeedRow {
  id: number;
  plantId: number;
  plantName: string;
  date: string;
  type: string;
  lateReason: string | null;
  isJournal: boolean;
}

/** Event-type filter options — 'Watered' includes 'Watered + Fed'. */
const TYPE_FILTERS: { label: string; types: string[] | null }[] = [
  { label: 'All events', types: null },
  { label: 'Watered', types: ['Watered', 'Watered + Fed'] },
  { label: 'Fed', types: ['Watered + Fed'] },
  { label: 'Skipped', types: ['Skipped'] },
  { label: 'Misted', types: ['Misted'] },
  { label: 'Cleaned', types: ['Cleaned'] },
  { label: 'Pruned', types: ['Pruned'] },
  { label: 'Repotted', types: ['Repotted'] },
  { label: 'Growth photos', types: ['Growth photo'] },
];

function groupLabel(iso: string): string {
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'This month';
  return 'Earlier';
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function HistoryScreen() {
  const history = useHistory();
  const journal = useJournal();
  const plants = usePlants();
  const [filterPlant, setFilterPlant] = useState<number | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState(0); // index into TYPE_FILTERS
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFromCloud();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const allowedTypes = TYPE_FILTERS[typeFilter].types;
  const sorted = useMemo(() => {
    const rows: FeedRow[] = [
      ...history.map((h) => ({
        id: h.id,
        plantId: h.plantId,
        plantName: h.plantName,
        date: h.date,
        type: h.type as string,
        lateReason: h.lateReason,
        isJournal: false,
      })),
      ...journal.map((j) => ({
        id: j.id,
        plantId: j.plant_id,
        plantName: plants.find((p) => p.id === j.plant_id)?.name ?? 'Plant',
        date: j.date,
        type: 'Growth photo',
        lateReason: null,
        isJournal: true,
      })),
    ];
    return rows
      .filter((h) => filterPlant === 'all' || h.plantId === filterPlant)
      .filter((h) => !allowedTypes || allowedTypes.indexOf(h.type) !== -1)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, journal, plants, filterPlant, allowedTypes]);

  const groups = useMemo(() => {
    const out: [string, FeedRow[]][] = [];
    let current = '';
    for (const h of sorted) {
      const label = groupLabel(h.date);
      if (label !== current) {
        out.push([label, []]);
        current = label;
      }
      out[out.length - 1][1].push(h);
    }
    return out;
  }, [sorted]);

  function removeRow(row: FeedRow) {
    if (!row.isJournal) {
      confirmRemoveEvent(row as unknown as HistoryEntry);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert('Remove this photo?', `The journal entry for ${row.plantName} will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => dbDelete('journal', row.id) },
    ]);
  }

  const filtersActive = filterPlant !== 'all' || typeFilter !== 0;
  const plantName =
    filterPlant === 'all' ? '' : plants.find((p) => p.id === filterPlant)?.name ?? '';
  const summaryParts = [plantName, typeFilter !== 0 ? TYPE_FILTERS[typeFilter].label : ''].filter(
    Boolean,
  );
  const total = history.length + journal.length;

  function clearFilters() {
    setFilterPlant('all');
    setTypeFilter(0);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title="History"
        subtitle={`${total} event${total === 1 ? '' : 's'}`}
        right={
          total > 0 ? (
            <Pressable
              style={[styles.filterBtn, filtersActive && styles.filterBtnActive]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setFilterOpen(true);
              }}
              hitSlop={6}
            >
              <Sliders size={18} color={filtersActive ? colors.green : colors.textSecondary} />
            </Pressable>
          ) : undefined
        }
      />

      {summaryParts.length > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText} numberOfLines={1}>
            {summaryParts.join('  ·  ')}
          </Text>
          <Pressable onPress={clearFilters} hitSlop={8}>
            <Text style={styles.summaryClear}>Clear</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        }
      >
        {total === 0 && !isHydrated() ? (
          <SkeletonRows />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<Clock size={32} color={colors.textMuted} />}
            title={filtersActive ? 'No matching events' : 'No history yet'}
            subtitle={
              filtersActive
                ? 'Try a different filter.'
                : 'Watering, feeding, misting, cleaning and repots will appear here.'
            }
            actionLabel={filtersActive ? 'Clear filters' : undefined}
            onAction={filtersActive ? clearFilters : undefined}
          />
        ) : (
          groups.map(([label, items]) => (
            <View key={label} style={styles.group}>
              <Text style={styles.groupLabel}>{label}</Text>
              {items.map((h) => (
                <Pressable
                  key={`${h.isJournal ? 'j' : 'h'}${h.id}`}
                  style={styles.entry}
                  onLongPress={() => removeRow(h)}
                  delayLongPress={350}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryName}>{h.plantName}</Text>
                    <Text style={[styles.entryType, { color: TYPE_COLOR[h.type] ?? colors.green }]}>
                      {h.type}
                      {h.lateReason ? <Text style={styles.reason}>{`  ·  ${h.lateReason}`}</Text> : ''}
                    </Text>
                  </View>
                  <Text style={styles.entryTime}>{timeLabel(h.date)}</Text>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <HistoryFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        filterPlant={filterPlant}
        setFilterPlant={setFilterPlant}
        plants={plants}
        onReset={clearFilters}
      />
    </SafeAreaView>
  );
}

/** Sort & filter bottom sheet — same pattern as the Plants tab. */
function HistoryFilterSheet({
  visible,
  onClose,
  typeFilter,
  setTypeFilter,
  filterPlant,
  setFilterPlant,
  plants,
  onReset,
}: {
  visible: boolean;
  onClose: () => void;
  typeFilter: number;
  setTypeFilter: (i: number) => void;
  filterPlant: number | 'all';
  setFilterPlant: (v: number | 'all') => void;
  plants: Plant[];
  onReset: () => void;
}) {
  const insets = useSafeAreaInsets();
  const sortedPlants = useMemo(
    () => plants.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [plants],
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filter history</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} />
            </Pressable>
          </View>

          <Text style={styles.sheetLabel}>Event type</Text>
          <ScrollView style={{ maxHeight: 196 }} bounces={false}>
            {TYPE_FILTERS.map((f, i) => {
              const active = i === typeFilter;
              return (
                <Pressable
                  key={f.label}
                  style={styles.sheetOpt}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTypeFilter(i);
                  }}
                >
                  <Text style={[styles.sheetOptText, active && { color: colors.green }]}>
                    {f.label}
                  </Text>
                  {active && <Check size={18} />}
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.sheetLabel}>Plant</Text>
          <ScrollView style={{ maxHeight: 196 }} bounces={false}>
            {[null, ...sortedPlants].map((p) => {
              const value: number | 'all' = p ? p.id : 'all';
              const active = filterPlant === value;
              return (
                <Pressable
                  key={p ? p.id : '__all__'}
                  style={styles.sheetOpt}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFilterPlant(value);
                  }}
                >
                  <Text
                    style={[styles.sheetOptText, active && { color: colors.green }]}
                    numberOfLines={1}
                  >
                    {p ? p.name : 'All plants'}
                  </Text>
                  {active && <Check size={18} />}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <Pressable onPress={onReset} hitSlop={8} style={styles.sheetReset}>
              <Text style={styles.sheetResetText}>Reset</Text>
            </Pressable>
            <PressableScale style={styles.sheetDone} onPress={onClose}>
              <Text style={styles.sheetDoneText}>Done</Text>
            </PressableScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: colors.greenBg, borderColor: 'rgba(48,209,88,0.35)' },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: spacing.xl,
    paddingBottom: 8,
  },
  summaryText: {
    flex: 1,
    color: colors.textTertiary,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
  },
  summaryClear: { color: colors.green, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 130 },
  group: { marginBottom: 14 },
  groupLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 6,
    paddingLeft: 2,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  entryName: { color: colors.textPrimary, fontSize: font.size.lg, fontWeight: font.weight.semibold },
  entryType: { fontSize: font.size.sm, marginTop: 3, fontWeight: font.weight.medium },
  reason: { color: colors.orange },
  entryTime: { color: colors.textMuted, fontSize: font.size.sm },

  sheetScrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: colors.hairline,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: font.size.xl, fontWeight: font.weight.bold },
  sheetLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 4,
  },
  sheetOpt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetOptText: { color: colors.textPrimary, fontSize: font.size.lg, flex: 1, paddingRight: 10 },
  sheetFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  sheetReset: { paddingVertical: 14, paddingHorizontal: 10 },
  sheetResetText: { color: colors.textTertiary, fontSize: font.size.lg, fontWeight: font.weight.medium },
  sheetDone: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDoneText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.semibold },
});
