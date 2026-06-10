/**
 * First-launch onboarding — a full-screen overlay (not a nav screen) shown
 * when a signed-in user has no plants and hasn't seen it before. Three paged
 * slides selling the adaptive schedule, then straight into Add Plant. The
 * notification permission ask stays where it is (after the first plant is
 * added) — never here.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, font, radius, spacing } from '../theme';
import { usePlants, useStore } from './hooks';
import { isHydrated } from '../data/db';
import { navigationRef } from '../navigation/ref';
import { PressableScale } from './components';
import { Droplet, Bell, Sprout, X } from './icons';

const FLAG_KEY = 'plantaroo:onboarded';

const SLIDES = [
  {
    icon: Droplet,
    title: 'Watering that learns',
    body: 'Schedules anchor to when you actually water — not a fixed calendar. Every watering teaches Plantaroo your plant’s real rhythm.',
  },
  {
    icon: Bell,
    title: 'Quiet by default',
    body: 'No streaks, no nagging. One gentle reminder when plants need you, and a care queue that finishes the morning round in seconds.',
  },
  {
    icon: Sprout,
    title: '350+ plants built in',
    body: 'Care profiles for over 350 plants and herbs ship inside the app. Matches are instant, work offline, and never cost a thing.',
  },
];

export function Onboarding({ enabled }: { enabled: boolean }) {
  useStore(); // re-render when hydration / plants change
  const plants = usePlants();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [seen, setSeen] = useState<boolean | null>(null);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!enabled) return;
    AsyncStorage.getItem(FLAG_KEY)
      .then((v) => setSeen(v != null))
      .catch(() => setSeen(true)); // can't read — fail closed, don't block the app
  }, [enabled]);

  const visible = enabled && seen === false && isHydrated() && plants.length === 0;
  if (!visible) return null;

  function markSeen() {
    setSeen(true);
    AsyncStorage.setItem(FLAG_KEY, '1').catch(() => {});
  }

  function onAddFirstPlant() {
    markSeen();
    if (navigationRef.isReady()) navigationRef.navigate('AddPlant');
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  const lastPage = page === SLIDES.length - 1;

  return (
    <Animated.View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
      entering={FadeIn.duration(280)}
      exiting={FadeOut.duration(200)}
    >
      <View style={styles.topRow}>
        <View style={styles.closeBtn} />
        <Pressable onPress={markSeen} hitSlop={12} style={styles.closeBtn}>
          <X size={20} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => {
          const Icon = s.icon;
          return (
            <View key={s.title} style={[styles.slide, { width }]}>
              <View style={styles.iconCircle}>
                <Icon size={36} color={colors.green} strokeWidth={1.8} />
              </View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        {lastPage ? (
          <PressableScale style={styles.cta} onPress={onAddFirstPlant}>
            <Text style={styles.ctaText}>Add your first plant</Text>
          </PressableScale>
        ) : (
          <PressableScale
            style={styles.cta}
            onPress={() =>
              scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true })
            }
          >
            <Text style={styles.ctaText}>Next</Text>
          </PressableScale>
        )}
        <Pressable onPress={markSeen} hitSlop={8} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 100,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: font.weight.bold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    fontSize: font.size.xl,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 22,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.surfaceElevated,
  },
  dotActive: { backgroundColor: colors.green },
  footer: { paddingHorizontal: spacing.xl, gap: 4 },
  cta: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.bold },
  skipBtn: { alignItems: 'center', paddingVertical: 13 },
  skipText: { color: colors.textTertiary, fontSize: font.size.lg, fontWeight: font.weight.medium },
});
