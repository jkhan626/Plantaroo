import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { colors, font, spacing } from '../theme';

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
    marginTop: 3,
  },
});
