import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  RefreshControl,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing, shadow } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Plant, LightType } from '../types';
import { usePlants } from '../ui/hooks';
import { useWaterAction } from '../ui/useWater';
import { PlantCard } from '../ui/PlantCard';
import { ScreenHeader } from '../ui/Header';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonRows } from '../ui/Skeleton';
import { PressableScale, Segmented } from '../ui/components';
import { Plus, Search, Gear, Sprout, Sliders, Check, X } from '../ui/icons';
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
  const insets = useSafeAreaInsets();
  const plants = usePlants();
  const { water } = useWaterAction();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('due');
  const [room, setRoom] = useState('');
  const [light, setLight] = useState<'' | 'grow' | 'natural'>('');
  const [hideWatered, setHideWatered] = useState(false);
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
  // Anything the sliders sheet controls that's off its default.
  const sheetActive = !!room || !!light || hideWatered || sortBy !== 'due';

  function clearFilters() {
    setSearch('');
    setRoom('');
    setLight('');
    setHideWatered(false);
    setSortBy('due');
  }

  const summaryParts = [
    room,
    light === 'grow' ? 'Grow light' : light === 'natural' ? 'Natural light' : '',
    hideWatered ? 'Hiding watered' : '',
    sortBy !== 'due' ? `By ${SORT_LABEL[sortBy].toLowerCase()}` : '',
  ].filter(Boolean);

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
          <View style={styles.searchRow}>
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
            <Pressable
              style={[styles.filterBtn, sheetActive && styles.filterBtnActive]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setFilterOpen(true);
              }}
              hitSlop={6}
            >
              <Sliders size={18} color={sheetActive ? colors.green : colors.textSecondary} />
            </Pressable>
          </View>
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

      <PressableScale
        style={[styles.fab, { bottom: Math.max(insets.bottom, 10) + 76 }]}
        onPress={() => nav.navigate('AddPlant')}
        scaleTo={0.9}
      >
        <Plus size={24} color={colors.black} />
      </PressableScale>

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        sortBy={sortBy}
        setSortBy={setSortBy}
        room={room}
        setRoom={setRoom}
        rooms={rooms}
        light={light}
        setLight={setLight}
        hideWatered={hideWatered}
        setHideWatered={setHideWatered}
        onReset={clearFilters}
      />
    </SafeAreaView>
  );
}

/** App-Store-style sort & filter bottom sheet — replaces the old pill row. */
function FilterSheet({
  visible,
  onClose,
  sortBy,
  setSortBy,
  room,
  setRoom,
  rooms,
  light,
  setLight,
  hideWatered,
  setHideWatered,
  onReset,
}: {
  visible: boolean;
  onClose: () => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  room: string;
  setRoom: (v: string) => void;
  rooms: string[];
  light: '' | LightType;
  setLight: (v: '' | LightType) => void;
  hideWatered: boolean;
  setHideWatered: (v: boolean) => void;
  onReset: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Sort &amp; filter</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} />
            </Pressable>
          </View>

          <Text style={styles.sheetLabel}>Sort by</Text>
          <Segmented
            value={sortBy}
            onChange={setSortBy}
            options={[
              { label: 'Due date', value: 'due' },
              { label: 'Name', value: 'name' },
              { label: 'Room', value: 'room' },
            ]}
          />

          <Text style={styles.sheetLabel}>Light</Text>
          <Segmented
            value={light}
            onChange={setLight}
            options={[
              { label: 'Any', value: '' },
              { label: 'Natural', value: 'natural' },
              { label: 'Grow', value: 'grow' },
            ]}
          />

          {rooms.length > 0 && (
            <>
              <Text style={styles.sheetLabel}>Room</Text>
              <ScrollView style={{ maxHeight: 184 }} bounces={false}>
                {['', ...rooms].map((r) => {
                  const active = room === r;
                  return (
                    <Pressable
                      key={r || '__all__'}
                      style={styles.sheetOpt}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setRoom(r);
                      }}
                    >
                      <Text style={[styles.sheetOptText, active && { color: colors.green }]}>
                        {r || 'All rooms'}
                      </Text>
                      {active && <Check size={18} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          <View style={styles.sheetSwitchRow}>
            <Text style={styles.sheetOptText}>Hide watered today</Text>
            <Switch
              value={hideWatered}
              onValueChange={setHideWatered}
              trackColor={{ true: colors.green, false: colors.surfaceElevated }}
              thumbColor={colors.white}
            />
          </View>

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
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    height: 44,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.size.lg, fontWeight: font.weight.medium },
  filterBtn: {
    width: 44,
    height: 44,
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
    paddingTop: 9,
    paddingHorizontal: 2,
  },
  summaryText: {
    flex: 1,
    color: colors.textTertiary,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
  },
  summaryClear: { color: colors.green, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 170 },
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
    marginBottom: 8,
  },
  sheetOpt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetOptText: { color: colors.textPrimary, fontSize: font.size.lg },
  sheetSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  sheetFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
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
  fab: {
    position: 'absolute',
    right: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
