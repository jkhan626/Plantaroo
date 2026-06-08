/** Reusable UI primitives shared across screens. */
import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  ScrollView,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, font, spacing } from '../theme';
import { Sprout, Check, X } from './icons';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that scales down on touch, with optional light haptic. */
export function PressableScale({
  children,
  onPress,
  style,
  haptic = true,
  scaleTo = 0.96,
  disabled,
  hitSlop,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  scaleTo?: number;
  disabled?: boolean;
  hitSlop?: number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = useCallback(() => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.();
  }, [haptic, onPress]);

  return (
    <AnimatedPressable
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => (scale.value = withTiming(scaleTo, { duration: 90 }))}
      onPressOut={() => (scale.value = withTiming(1, { duration: 140 }))}
      onPress={handlePress}
      style={[animStyle, style, disabled && { opacity: 0.4 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Round plant photo or a sprout placeholder. */
export function PlantAvatar({
  uri,
  size = 48,
}: {
  uri?: string | null;
  size?: number;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
        }}
        contentFit="cover"
        transition={120}
      />
    );
  }
  return (
    <View
      style={[
        styles.avatarPlaceholder,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Sprout size={size * 0.46} color="rgba(48,209,88,0.55)" />
    </View>
  );
}

/** Segmented toggle (e.g. Natural / Grow). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[styles.segmentOpt, active && styles.segmentOptActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tappable field row that opens an option sheet — used for the picker rows. */
export function SelectRow({
  label,
  valueLabel,
  onPress,
}: {
  label: string;
  valueLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.selectRow} onPress={onPress}>
      <Text style={styles.selectLabel}>{label}</Text>
      <Text style={styles.selectValue}>{valueLabel}</Text>
    </Pressable>
  );
}

/** Bottom-sheet option picker. */
export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: T }[];
  selected?: T;
  onSelect: (v: T) => void;
  onClose: () => void;
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
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map((o) => {
              const active = o.value === selected;
              return (
                <Pressable
                  key={o.value}
                  style={styles.sheetOpt}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    onSelect(o.value);
                    onClose();
                  }}
                >
                  <Text
                    style={[styles.sheetOptText, active && { color: colors.green }]}
                  >
                    {o.label}
                  </Text>
                  {active && <Check size={18} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Section header label (uppercase, muted). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  avatarPlaceholder: {
    backgroundColor: '#10231a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  segment: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentOpt: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentOptActive: { backgroundColor: colors.greenBg },
  segmentText: { color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold },
  segmentTextActive: { color: colors.green },

  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  selectLabel: { color: colors.textSecondary, fontSize: font.size.md },
  selectValue: { color: colors.textPrimary, fontSize: font.size.md, fontWeight: font.weight.medium },

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
    marginBottom: 6,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: font.size.xl, fontWeight: font.weight.bold },
  sheetOpt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetOptText: { color: colors.textPrimary, fontSize: font.size.lg },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
