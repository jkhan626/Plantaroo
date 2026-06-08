/** Plant row card used in the To Do and Plants tabs. */
import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, font } from '../theme';
import type { Plant } from '../types';
import { getDueText, isWateredToday, relativeDayLabel } from '../logic/schedule';
import { isFeedDue, needsDistilled } from '../logic/fertilize';
import { SOIL_TABLE } from '../logic/constants';
import { PlantAvatar } from './components';
import { Droplet, Check } from './icons';

const STATUS_COLOR: Record<string, string> = {
  never: colors.blue,
  overdue: colors.red,
  today: colors.red,
  soon: colors.orange,
  later: colors.textTertiary,
};

export function PlantCard({
  plant,
  onPress,
  onWater,
  mode = 'all',
}: {
  plant: Plant;
  onPress: () => void;
  onWater: () => void;
  mode?: 'all' | 'todo';
}) {
  const due = getDueText(plant);
  const isDue = due.status === 'overdue' || due.status === 'today' || due.status === 'never';
  const feed = isFeedDue(plant);
  const wateredToday = isWateredToday(plant);
  const distilled = needsDistilled(plant);

  // Pulse the water button when the plant needs water.
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (isDue && !wateredToday) {
      pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(pulse);
  }, [isDue, wateredToday, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  const tap = useSharedValue(1);
  const tapStyle = useAnimatedStyle(() => ({ transform: [{ scale: tap.value }] }));

  const soil = SOIL_TABLE[plant.soil_type]?.short ?? '';
  const metaParts = [plant.room, soil].filter(Boolean);

  return (
    <Animated.View style={tapStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => (tap.value = withTiming(0.985, { duration: 90 }))}
        onPressOut={() => (tap.value = withTiming(1, { duration: 140 }))}
        style={[styles.card, wateredToday && styles.cardWatered]}
      >
        <PlantAvatar uri={plant.photo} size={48} />

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {plant.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join('  ·  ')}
          </Text>

          {mode === 'todo' ? (
            <Text style={styles.action} numberOfLines={1}>
              Water{feed ? <Text style={styles.feed}>{'  ·  Feed'}</Text> : ''}
              {distilled ? <Text style={styles.distilled}>{'  ·  Distilled'}</Text> : ''}
            </Text>
          ) : wateredToday ? (
            <View style={styles.scheduleRow}>
              <Text style={styles.wateredText}>Watered today</Text>
              <Check size={11} color={colors.green} />
            </View>
          ) : (
            <Text style={styles.schedule} numberOfLines={1}>
              <Text style={{ color: STATUS_COLOR[due.status] }}>{due.text}</Text>
              {feed ? <Text style={styles.feed}>{'  ·  Feed due'}</Text> : ''}
              {plant.last_watered ? (
                <Text style={styles.scheduleMuted}>
                  {'   '}
                  {relativeDayLabel(plant.last_watered)}
                </Text>
              ) : (
                ''
              )}
            </Text>
          )}
        </View>

        {!wateredToday && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onWater();
            }}
            hitSlop={8}
            style={[styles.waterBtn, isDue && styles.waterBtnDue]}
          >
            <Animated.View style={isDue ? pulseStyle : undefined}>
              <Droplet size={19} color={colors.green} />
            </Animated.View>
          </Pressable>
        )}
        {wateredToday && (
          <View style={styles.doneBadge}>
            <Check size={16} color={colors.green} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardWatered: {
    backgroundColor: 'rgba(48,209,88,0.06)',
    borderColor: 'rgba(48,209,88,0.22)',
  },
  info: { flex: 1, minWidth: 0 },
  name: {
    color: colors.textPrimary,
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
  },
  meta: { color: colors.textTertiary, fontSize: font.size.sm, marginTop: 2 },
  schedule: { fontSize: font.size.sm, marginTop: 3 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  scheduleMuted: { color: colors.textMuted },
  wateredText: { color: colors.green, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  action: {
    color: colors.green,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    marginTop: 3,
  },
  feed: { color: colors.purple, fontWeight: font.weight.semibold },
  distilled: { color: colors.lightBlue },
  waterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterBtnDue: { backgroundColor: colors.greenBg },
  doneBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.greenBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
