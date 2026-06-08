import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, spacing } from '../theme';
import type { HistoryEntry } from '../types';
import { useHistory, usePlants } from '../ui/hooks';
import { ScreenHeader } from '../ui/Header';
import { EmptyState } from '../ui/EmptyState';
import { OptionSheet } from '../ui/components';
import { Clock, ChevronDown } from '../ui/icons';

const TYPE_COLOR: Record<string, string> = {
  Watered: colors.green,
  'Watered + Fed': colors.purple,
  Skipped: colors.textSecondary,
  Repotted: colors.orange,
};

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
  const plants = usePlants();
  const [filterPlant, setFilterPlant] = useState<number | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...history]
        .filter((h) => filterPlant === 'all' || h.plantId === filterPlant)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [history, filterPlant],
  );

  const groups = useMemo(() => {
    const out: [string, HistoryEntry[]][] = [];
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

  const plantName = filterPlant === 'all' ? 'All plants' : plants.find((p) => p.id === filterPlant)?.name ?? 'All plants';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="History" subtitle={`${history.length} event${history.length === 1 ? '' : 's'}`} />

      {history.length > 0 && (
        <View style={styles.filterWrap}>
          <Pressable style={styles.filterPill} onPress={() => setFilterOpen(true)}>
            <Text style={styles.filterText} numberOfLines={1}>
              {plantName}
            </Text>
            <ChevronDown size={14} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Clock size={32} color={colors.textMuted} />}
            title="No history yet"
            subtitle="Watering, feeding, skips and repots will appear here."
          />
        ) : (
          groups.map(([label, items]) => (
            <View key={label} style={styles.group}>
              <Text style={styles.groupLabel}>{label}</Text>
              {items.map((h) => (
                <View key={h.id} style={styles.entry}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryName}>{h.plantName}</Text>
                    <Text style={[styles.entryType, { color: TYPE_COLOR[h.type] ?? colors.green }]}>
                      {h.type}
                      {h.lateReason ? <Text style={styles.reason}>{`  ·  ${h.lateReason}`}</Text> : ''}
                    </Text>
                  </View>
                  <Text style={styles.entryTime}>{timeLabel(h.date)}</Text>
                </View>
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
