/** Bottom-sheet editor for optional pot details (size / material / drainage). */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Pressable, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, font, spacing } from '../theme';
import { Segmented } from './components';
import { Check } from './icons';
import type { PotSize, PotMaterial } from '../types';

export interface PotValues {
  pot_size?: PotSize;
  pot_material?: PotMaterial;
  pot_drainage?: boolean;
}

const UNSET = '';

/** A short "Small terracotta, drains" style summary, or "Not set". */
export function potSummaryLabel(v: PotValues): string {
  const parts: string[] = [];
  const bits = [v.pot_size, v.pot_material].filter(Boolean) as string[];
  if (bits.length) parts.push(bits.join(' '));
  if (v.pot_drainage === true) parts.push('drains');
  else if (v.pot_drainage === false) parts.push('no drainage');
  if (parts.length === 0) return 'Not set';
  const label = parts.join(', ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function PotSheet({
  visible,
  initial,
  onDone,
  onClose,
}: {
  visible: boolean;
  initial: PotValues;
  onDone: (values: PotValues) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<string>(initial.pot_size ?? UNSET);
  const [material, setMaterial] = useState<string>(initial.pot_material ?? UNSET);
  const [drainage, setDrainage] = useState<string>(
    initial.pot_drainage === undefined ? UNSET : initial.pot_drainage ? 'yes' : 'no',
  );

  // Re-seed when reopened.
  useEffect(() => {
    if (visible) {
      setSize(initial.pot_size ?? UNSET);
      setMaterial(initial.pot_material ?? UNSET);
      setDrainage(initial.pot_drainage === undefined ? UNSET : initial.pot_drainage ? 'yes' : 'no');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function done() {
    const values: PotValues = {};
    if (size) values.pot_size = size as PotSize;
    if (material) values.pot_material = material as PotMaterial;
    if (drainage) values.pot_drainage = drainage === 'yes';
    onDone(values);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>Pot</Text>
            <Pressable onPress={done} hitSlop={8}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Size</Text>
          <Segmented
            value={size}
            onChange={setSize}
            options={[
              { label: 'Not set', value: UNSET },
              { label: 'Small', value: 'small' },
              { label: 'Medium', value: 'medium' },
              { label: 'Large', value: 'large' },
            ]}
          />

          <Text style={styles.label}>Material</Text>
          <View style={styles.optList}>
            {[
              { label: 'Not set', value: UNSET },
              { label: 'Terracotta', value: 'terracotta' },
              { label: 'Plastic', value: 'plastic' },
              { label: 'Glazed', value: 'glazed' },
              { label: 'Other', value: 'other' },
            ].map((o, i, arr) => {
              const active = o.value === material;
              return (
                <Pressable
                  key={o.value}
                  style={[styles.optRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setMaterial(o.value);
                  }}
                >
                  <Text style={[styles.optRowText, active && { color: colors.green }]}>{o.label}</Text>
                  {active && <Check size={18} />}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Drainage hole</Text>
          <Segmented
            value={drainage}
            onChange={setDrainage}
            options={[
              { label: 'Not set', value: UNSET },
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' },
            ]}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: colors.hairline,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  cancel: { color: colors.textSecondary, fontSize: font.size.lg },
  title: { color: colors.textPrimary, fontSize: font.size.xl, fontWeight: font.weight.bold },
  done: { color: colors.green, fontSize: font.size.lg, fontWeight: font.weight.semibold },
  label: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 14,
  },
  optList: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  optRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optRowText: { color: colors.textPrimary, fontSize: font.size.lg },
});
