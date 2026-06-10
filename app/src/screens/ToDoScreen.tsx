import React, { useCallback, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, spacing, shadow } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { usePlants } from '../ui/hooks';
import { useWaterAction } from '../ui/useWater';
import { useToast } from '../ui/Toast';
import { PlantCard } from '../ui/PlantCard';
import { ScreenHeader } from '../ui/Header';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonRows } from '../ui/Skeleton';
import { PressableScale } from '../ui/components';
import { DateSheet } from '../ui/DateSheet';
import { Plus, Check, Gear, Sprout, Droplet, ChevronRight } from '../ui/icons';
import { getDaysUntilDue, getSeasonLabel } from '../logic/schedule';
import { bulkSetLastWatered } from '../logic/actions';
import { rescheduleWateringReminders } from '../logic/notify';
import { getPlants, isHydrated, refreshFromCloud } from '../data/db';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ToDoScreen() {
  const nav = useNavigation<Nav>();
  const plants = usePlants();
  const { water } = useWaterAction();
  const toast = useToast();
  const [dateOpen, setDateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFromCloud();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const overdue = plants
    .filter((p) => p.last_watered && getDaysUntilDue(p) < 0)
    .sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b));
  const today = plants.filter((p) => p.last_watered && getDaysUntilDue(p) === 0);
  const neverW = plants
    .filter((p) => !p.last_watered)
    .sort((a, b) => a.name.localeCompare(b.name));

  const dueCount = overdue.length + today.length + neverW.length;

  async function onBulkDate(d: Date) {
    setDateOpen(false);
    const n = await bulkSetLastWatered(plants, d.toISOString());
    rescheduleWateringReminders(getPlants());
    toast.show({ message: `Set last watered for ${n} plant${n === 1 ? '' : 's'}`, kind: 'info' });
  }

  const subtitle =
    plants.length === 0
      ? getSeasonLabel()
      : dueCount > 0
        ? `${dueCount} need${dueCount === 1 ? 's' : ''} water · ${getSeasonLabel()}`
        : `All caught up · ${getSeasonLabel()}`;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title="To Do"
        subtitle={subtitle}
        right={
          <Pressable onPress={() => nav.navigate('Settings')} hitSlop={10} style={styles.gear}>
            <Gear size={22} />
          </Pressable>
        }
      />

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
            subtitle="Add your first plant and Plantaroo starts learning its rhythm."
            actionLabel="Add a plant"
            onAction={() => nav.navigate('AddPlant')}
          />
        ) : dueCount === 0 ? (
          <EmptyState
            icon={<Check size={34} color={colors.green} />}
            title="All caught up"
            subtitle="Nothing needs water right now. Nice."
          />
        ) : (
          <>
            <PressableScale style={styles.queueBtn} onPress={() => nav.navigate('CareQueue')}>
              <View style={styles.queueIcon}>
                <Droplet size={18} color={colors.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.queueTitle}>Water all</Text>
                <Text style={styles.queueSub}>
                  {dueCount} plant{dueCount === 1 ? '' : 's'} · one at a time
                </Text>
              </View>
              <ChevronRight size={18} color={colors.green} />
            </PressableScale>
            <Section title="Overdue" tint={colors.red} items={overdue} water={water} nav={nav} />
            <Section title="Due today" tint={colors.orange} items={today} water={water} nav={nav} />
            {neverW.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.blue }]}>
                    New plants
                  </Text>
                  <PressableScale style={styles.setDateBtn} onPress={() => setDateOpen(true)}>
                    <Text style={styles.setDateText}>Set last watered</Text>
                  </PressableScale>
                </View>
                {neverW.map((p) => (
                  <PlantCard
                    key={p.id}
                    plant={p}
                    mode="todo"
                    onPress={() => nav.navigate('PlantDetail', { id: p.id })}
                    onWater={() => water(p)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <PressableScale style={styles.fab} onPress={() => nav.navigate('AddPlant')} scaleTo={0.9}>
        <Plus size={24} color={colors.black} />
      </PressableScale>

      <DateSheet
        visible={dateOpen}
        title="Last watered"
        onDone={onBulkDate}
        onClose={() => setDateOpen(false)}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  tint,
  items,
  water,
  nav,
}: {
  title: string;
  tint: string;
  items: ReturnType<typeof usePlants>;
  water: (p: any) => void;
  nav: Nav;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: tint }]}>{title}</Text>
      {items.map((p) => (
        <PlantCard
          key={p.id}
          plant={p}
          mode="todo"
          onPress={() => nav.navigate('PlantDetail', { id: p.id })}
          onWater={() => water(p)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 130 },
  gear: { padding: 4 },
  section: { marginBottom: 18 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 2,
  },
  setDateBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  setDateText: { color: colors.green, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.25)',
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  queueIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(48,209,88,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTitle: { color: colors.green, fontSize: font.size.lg, fontWeight: font.weight.semibold },
  queueSub: { color: colors.textTertiary, fontSize: font.size.sm, marginTop: 2 },
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
