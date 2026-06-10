/** Pulsing placeholder rows shown while the first hydrate is still pending. */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors, radius } from '../theme';

export function SkeletonRows({ count = 3 }: { count?: number }) {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={pulseStyle}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.avatar} />
          <View style={styles.lines}>
            <View style={[styles.line, { width: '55%' }]} />
            <View style={[styles.line, { width: '35%', marginTop: 8 }]} />
          </View>
        </View>
      ))}
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceElevated,
  },
  lines: { flex: 1 },
  line: {
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
});
