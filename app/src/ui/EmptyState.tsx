import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { colors, font, radius } from '../theme';
import { PressableScale } from './components';

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>{icon}</View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <PressableScale style={styles.action} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 32 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    color: colors.textSecondary,
    fontSize: font.size.xl,
    fontWeight: font.weight.semibold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.size.md,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  action: {
    marginTop: 22,
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: colors.green,
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: radius.pill,
  },
  actionText: { color: colors.green, fontSize: font.size.lg, fontWeight: font.weight.semibold },
});
