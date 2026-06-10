import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, spacing, shadow } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Plant } from '../types';
import { usePlants } from '../ui/hooks';
import { useWaterAction } from '../ui/useWater';
import { PlantCard } from '../ui/PlantCard';
import { ScreenHeader } from '../ui/Header';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonRows } from '../ui/Skeleton';
import { PressableScale, OptionSheet } from '../ui/components';
import { Plus, Search, Gear, Sprout, ChevronDown } from '../ui/icons';
import { getDaysUntilDue, isWateredToday } from '../logic/schedule';
import { isHydrated, refreshFromCloud } from '../data/db';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type SortBy = 'due' | 'name' | 'room';

const SORT_LABEL: Record<SortBy, string> = {
  due: 'Due date',
  name: 'Name',
  room: 'Room',
};

export function PlantsScreen() {
  const nav = useNavigation<Nav>();
  const plants = usePlants();
  const { water } = useWaterAction();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('due');
  const [room, setRoom] = useState('');
  const [light, setLight] = useState<'' | 'grow' | 'natural'>('');
  const [hideWatered, setHideWatered] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFromCloud();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const rooms = useMemo(
    () => Array.from(new Set(plants.map((p) => p.room).filter(Boolean))).sort(),
    [plants],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = plants.filter((p) => {
      if (q && p.name.toLowerCase().indexOf(q) < 0) return false;
      if (room && p.room !== room) return false;
      if (light === 'grow' && p.light_type !== 'grow') return false;
      if (light === 'natural' && p.light_type === 'grow') return false;
      if (hideWatered && isWateredToday(p)) return false;
      return true;
    });
    if (sortBy === 'name') list = list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'room')
      list = list.sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name));
    else list = list.sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b));
    return list;
  }, [plants, search, room, light, hideWatered, sortBy]);

  const filtersActive = !!search || !!room || !!light || hideWatered;
  const lightLabel = light === 'grow' ? 'Grow light' : light === 'natural' ? 'Natural' : 'Any light';

  function cycleLight() {
    setLight((l) => (l === '' ? 'grow' : l === 'grow' ? 'natural' : ''));
  }
  function clearFilters() {
    setSearch('');
    setRoom('');
    setLight('');
    setHideWatered(false);
  }

  const grouped = sortBy === 'room';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title="Plants"
        subtitle={`${plants.length} plant${plants.length === 1 ? '' : 's'}`}
        right={
          <Pressable onPress={() => nav.navigate('Settings')} hitSlop={10} style={styles.gear}>
            <Gear size={22} />
          </Pressable>
        }
      />

      {plants.length > 0 && (
        <View style={styles.controls}>
          <View style={styles.searchBar}>
            <Search size={16} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search plants"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <View style={styles.pillRow}>
            <Pill label={SORT_LABEL[sortBy]} caret onPress={() => setSortOpen(true)} />
            <Pill
              label={room || 'All rooms'}
              active={!!room}
              caret
              onPress={() => setRoomOpen(true)}
            />
            <Pill label={lightLabel} active={!!light} onPress={cycleLight} />
            <Pill
              label="Hide watered"
              active={hideWatered}
              onPress={() => setHideWatered((v) => !v)}
            />
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        }
      >
        {plants.length === 0 && !isHydrated() ? (
          <SkeletonRows />
        ) : plants.length === 0 ? (
          <EmptyState
            icon={<Sprout size={34} color={colors.green} />}
            title="No plants yet"
            subtitle="Add your first plant — its photo, schedule, and history live here."
            actionLabel="Add a plant"
            onAction={() => nav.navigate('AddPlant')}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={30} color={colors.textMuted} />}
            title="No matches"
            subtitle="Try a different search or filter."
            actionLabel={filtersActive ? 'Clear filters' : undefined}
            onAction={filtersActive ? clearFilters : undefined}
          />
        ) : grouped ? (
          groupByRoom(filtered).map(([roomName, items]) => (
            <View key={roomName} style={styles.group}>
              <Text style={styles.groupLabel}>{roomName || 'No room'}</Text>
              {items.map((p) => (
                <PlantCard
                  key={p.id}
                  plant={p}
                  onPress={() => nav.navigate('PlantDetail', { id: p.id })}
                  onWater={() => water(p)}
                />
              ))}
            </View>
          ))
        ) : (
          filtered.map((p) => (
            <PlantCard
              key={p.id}
              plant={p}
              onPress={() => nav.navigate('PlantDetail', { id: p.id })}
              onWater={() => water(p)}
            />
          ))
        )}
      </ScrollView>

      <PressableScale style={styles.fab} onPress={() => nav.navigate('AddPlant')} scaleTo={0.9}>
        <Plus size={24} color={colors.black} />
      </PressableScale>

      <OptionSheet
        visible={sortOpen}
        title="Sort by"
        selected={sortBy}
        options={[
          { label: 'Due date', value: 'due' },
          { label: 'Name', value: 'name' },
          { label: 'Room', value: 'room' },
        ]}
        onSelect={(v) => setSortBy(v as SortBy)}
        onClose={() => setSortOpen(false)}
      />
      <OptionSheet
        visible={roomOpen}
        title="Filter by room"
        selected={room}
        options={[{ label: 'All rooms', value: '' }, ...rooms.map((r) => ({ label: r, value: r }))]}
        onSelect={setRoom}
        onClose={() => setRoomOpen(false)}
      />
    </SafeAreaView>
  );
}

function Pill({
  label,
  active,
  caret,
  onPress,
}: {
  label: string;
  active?: boolean;
  caret?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {caret && <ChevronDown size={13} color={active ? colors.green : colors.textTertiary} />}
    </Pressable>
  );
}

function groupByRoom(items: Plant[]): [string, Plant[]][] {
  const map = new Map<string, Plant[]>();
  for (const p of items) {
    const k = p.room || '';
    const arr = map.get(k);
    if (arr) arr.push(p);
    else map.set(k, [p]);
  }
  return Array.from(map.entries());
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  gear: { padding: 4 },
  controls: { paddingHorizontal: spacing.lg, paddingBottom: 6 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    height: 44,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.size.lg, fontWeight: font.weight.medium },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  pillActive: { backgroundColor: colors.greenBg, borderColor: colors.green },
  pillText: { color: colors.textSecondary, fontSize: font.size.base, fontWeight: font.weight.semibold },
  pillTextActive: { color: colors.green },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 130 },
  group: { marginBottom: 16 },
  groupLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 2,
  },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
