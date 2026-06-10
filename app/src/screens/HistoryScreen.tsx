import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '../theme';
import type { HistoryEntry } from '../types';
import { useHistory, usePlants, useJournal } from '../ui/hooks';
import { dbDelete } from '../data/db';
import { ScreenHeader } from '../ui/Header';
import { EmptyState } from '../ui/EmptyState';
import { OptionSheet } from '../ui/components';
import { Clock, ChevronDown } from '../ui/icons';
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

/** Action-type filter chips — 'Watered' includes 'Watered + Fed'. */
const TYPE_FILTERS: { label: string; types: string[] | null }[] = [
  { label: 'All', types: null },
  { label: 'Watered', types: ['Watered', 'Watered + Fed'] },
  { label: 'Fed', types: ['Watered + Fed'] },
  { label: 'Skipped', types: ['Skipped'] },
  { label: 'Misted', types: ['Misted'] },
  { label: 'Cleaned', types: ['Cleaned'] },
  { label: 'Pruned', types: ['Pruned'] },
  { label: 'Repotted', types: ['Repotted'] },
  { label: 'Photos', types: ['Growth photo'] },
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState(0); // index into TYPE_FILTERS

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

  const plantName = filterPlant === 'all' ? 'All plants' : plants.find((p) => p.id === filterPlant)?.name ?? 'All plants';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title="History"
        subtitle={`${history.length + journal.length} event${history.length + journal.length === 1 ? '' : 's'}`}
      />

      {history.length + journal.length > 0 && (
        <View style={styles.filterWrap}>
          <Pressable style={styles.filterPill} onPress={() => setFilterOpen(true)}>
            <Text style={styles.filterText} numberOfLines={1}>
              {plantName}
            </Text>
            <ChevronDown size={14} color={colors.textTertiary} />
          </Pressable>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={{ marginTop: 8 }}
          >
            {TYPE_FILTERS.map((f, i) => {
              const active = i === typeFilter;
              return (
                <Pressable
                  key={f.label}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setTypeFilter(i)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Clock size={32} color={colors.textMuted} />}
            title="No history yet"
            subtitle="Watering, feeding, misting, cleaning and repots will appear here."
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

      <OptionSheet
        visible={filterOpen}
        title="Filter by plant"
        selected={String(filterPlant)}
        options={[
          { label: 'All plants', value: 'all' },
          ...plants
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => ({ label: p.name, value: String(p.id) })),
        ]}
        onSelect={(v) => setFilterPlant(v === 'all' ? 'all' : parseInt(v, 10))}
        onClose={() => setFilterOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  filterWrap: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 15,
    maxWidth: 260,
  },
  filterText: { color: colors.textPrimary, fontSize: font.size.md, fontWeight: font.weight.medium },
  chipRow: { gap: 8, paddingRight: spacing.lg },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipActive: { backgroundColor: colors.greenBg, borderColor: colors.green },
  chipText: { color: colors.textSecondary, fontSize: font.size.base, fontWeight: font.weight.semibold },
  chipTextActive: { color: colors.green },
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
});
