/**
 * Care queue — one-plant-at-a-time watering blitz for everything due today.
 * The due list is snapshotted on mount so plants don't jump around as they're
 * watered; each step offers Water / Skip / Later and advances instantly.
 * Morning routine in under 30 seconds.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Plant } from '../types';
import { usePlants } from '../ui/hooks';
import { useWaterAction } from '../ui/useWater';
import { PlantAvatar, PressableScale } from '../ui/components';
import { Droplet, Check, X, Skip as SkipIcon, Clock } from '../ui/icons';
import { getDueText, getDaysUntilDue } from '../logic/schedule';
import { isFeedDue, needsDistilled } from '../logic/fertilize';
import { getDueTasks } from '../logic/tasks';
import { skipPlant } from '../logic/actions';
import { rescheduleWateringReminders } from '../logic/notify';
import { getPlants } from '../data/db';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CareQueueScreen() {
  const nav = useNavigation<Nav>();
  const plants = usePlants();
  const { water } = useWaterAction();

  // Snapshot the due ids once on mount: overdue (worst first) → due today →
  // never watered, so the queue order is stable while we work through it.
  const queueIds = useRef<number[]>(
    (() => {
      const all = getPlants();
      const overdue = all
        .filter((p) => p.last_watered && getDaysUntilDue(p) < 0)
        .sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b));
      const today = all.filter((p) => p.last_watered && getDaysUntilDue(p) === 0);
      const neverW = all
        .filter((p) => !p.last_watered)
        .sort((a, b) => a.name.localeCompare(b.name));
      return [...overdue, ...today, ...neverW].map((p) => p.id);
    })(),
  ).current;

  const [index, setIndex] = useState(0);
  const [wateredCount, setWateredCount] = useState(0);

  const total = queueIds.length;
  const plant: Plant | undefined =
    index < total ? plants.find((p) => p.id === queueIds[index]) : undefined;
  const done = index >= total;

  // Plant deleted underneath us mid-queue — move on.
  useEffect(() => {
    if (!done && !plant) setIndex((i) => i + 1);
  }, [done, plant]);

  const progressPct = total === 0 ? 100 : (Math.min(index, total) / total) * 100;

  function advance() {
    setIndex((i) => i + 1);
  }

  function onWater() {
    if (!plant) return;
    water(plant, {
      silent: true,
      onWatered: () => {
        setWateredCount((n) => n + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        advance();
      },
    });
  }

  async function onSkip() {
    if (!plant) return;
    await skipPlant(plant);
    rescheduleWateringReminders(getPlants());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    advance();
  }

  function onLater() {
    advance();
  }

  const feed = plant ? isFeedDue(plant) : false;
  const distilled = plant ? needsDistilled(plant) : false;
  const taskText = plant
    ? getDueTasks(plant)
        .map((t) => t.label)
        .join('  ·  ')
    : '';
  const due = plant ? getDueText(plant) : null;
  const dueTint =
    due?.status === 'overdue' || due?.status === 'today'
      ? colors.red
      : due?.status === 'never'
        ? colors.blue
        : colors.textTertiary;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header: close + progress */}
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={styles.closeBtn}>
          <X size={20} />
        </Pressable>
        {!done && total > 0 && (
          <Text style={styles.progressText}>
            {Math.min(index + 1, total)} of {total}
          </Text>
        )}
        <View style={styles.closeBtn} />
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${progressPct}%` }]} />
      </View>

      {done ? (
        <View style={styles.center}>
          <View style={styles.doneCircle}>
            <Check size={40} strokeWidth={2.6} />
          </View>
          <Text style={styles.doneTitle}>All done</Text>
          <Text style={styles.doneSubtitle}>
            {wateredCount === 0
              ? 'Nothing watered this round.'
              : `${wateredCount} plant${wateredCount === 1 ? '' : 's'} watered.`}
          </Text>
          <PressableScale style={styles.doneBtn} onPress={() => nav.goBack()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </PressableScale>
        </View>
      ) : plant ? (
        <>
          <View style={styles.center}>
            <PlantAvatar uri={plant.photo} size={140} />
            <Text style={styles.name} numberOfLines={2}>
              {plant.name}
            </Text>
            {due && <Text style={[styles.due, { color: dueTint }]}>{due.text}</Text>}
            {(feed || distilled || !!taskText) && (
              <Text style={styles.hints}>
                {feed ? <Text style={styles.feedHint}>Feed this time</Text> : null}
                {feed && distilled ? '  ·  ' : ''}
                {distilled ? <Text style={styles.distilledHint}>Distilled water</Text> : null}
                {(feed || distilled) && taskText ? '  ·  ' : ''}
                {taskText ? <Text style={styles.taskHint}>{taskText}</Text> : null}
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            <PressableScale style={styles.waterBtn} onPress={onWater} scaleTo={0.97}>
              <Droplet size={20} color={colors.black} strokeWidth={2.2} />
              <Text style={styles.waterText}>Water</Text>
            </PressableScale>
            <View style={styles.secondaryRow}>
              <PressableScale style={styles.secondaryBtn} onPress={onSkip}>
                <SkipIcon size={16} />
                <Text style={styles.secondaryText}>Skip</Text>
              </PressableScale>
              <PressableScale style={styles.secondaryBtn} onPress={onLater}>
                <Clock size={16} color={colors.textSecondary} />
                <Text style={styles.secondaryText}>Later</Text>
              </PressableScale>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.center} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  progressText: {
    color: colors.textSecondary,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },
  barTrack: {
    height: 3,
    backgroundColor: colors.surface,
    borderRadius: 2,
    marginHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  barFill: { height: 3, backgroundColor: colors.green, borderRadius: 2 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  name: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: font.weight.bold,
    letterSpacing: -0.3,
    marginTop: 20,
    textAlign: 'center',
  },
  due: { fontSize: font.size.xl, fontWeight: font.weight.medium, marginTop: 6 },
  hints: { fontSize: font.size.lg, marginTop: 10 },
  feedHint: { color: colors.purple, fontWeight: font.weight.semibold },
  distilledHint: { color: colors.lightBlue, fontWeight: font.weight.medium },
  taskHint: { color: colors.lightBlue, fontWeight: font.weight.medium },

  actions: { paddingHorizontal: spacing.xl, paddingBottom: 14, gap: 10 },
  waterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.green,
  },
  waterText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.bold },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
  },

  doneCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: font.weight.bold,
    marginTop: 22,
  },
  doneSubtitle: { color: colors.textSecondary, fontSize: font.size.xl, marginTop: 6 },
  doneBtn: {
    marginTop: 28,
    backgroundColor: colors.green,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: radius.lg,
  },
  doneBtnText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.bold },
});
