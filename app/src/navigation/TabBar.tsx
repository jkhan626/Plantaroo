/** Floating glass bottom tab bar — Droplet / Plants / History. */
import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, font, radius, shadow } from '../theme';
import { Droplet, PlantPot, Clock } from '../ui/icons';

const ICONS: Record<string, (active: boolean) => React.ReactNode> = {
  ToDo: (a) => <Droplet size={22} color={a ? colors.green : colors.textTertiary} />,
  Plants: (a) => <PlantPot size={22} color={a ? colors.green : colors.textTertiary} />,
  History: (a) => <Clock size={22} color={a ? colors.green : colors.textTertiary} />,
};
const LABELS: Record<string, string> = { ToDo: 'To Do', Plants: 'Plants', History: 'History' };

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <BlurView intensity={36} tint="dark" style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const onPress = () => {
            Haptics.selectionAsync().catch(() => {});
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.btn}>
              {ICONS[route.name]?.(focused)}
              <Text style={[styles.label, focused && styles.labelActive]}>
                {LABELS[route.name]}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    width: '100%',
    minHeight: 62,
    borderRadius: 30,
    paddingVertical: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(16,16,20,0.7)',
    alignItems: 'center',
    ...shadow.floatNav,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: font.weight.medium,
    color: colors.textTertiary,
  },
  labelActive: { color: colors.green },
});
