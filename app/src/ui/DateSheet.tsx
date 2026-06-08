/** Bottom-sheet date picker (spinner) with Done / Clear. */
import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable, Modal, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, font, spacing } from '../theme';

export function DateSheet({
  visible,
  title,
  initial,
  allowClear,
  onDone,
  onClear,
  onClose,
}: {
  visible: boolean;
  title: string;
  initial?: Date;
  allowClear?: boolean;
  onDone: (date: Date) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState<Date>(initial ?? new Date());

  // Re-seed when reopened.
  React.useEffect(() => {
    if (visible) setDate(initial ?? new Date());
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            {allowClear ? (
              <Pressable onPress={onClear} hitSlop={8}>
                <Text style={styles.clear}>Clear</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            )}
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={() => onDone(date)} hitSlop={8}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            themeVariant="dark"
            textColor={colors.textPrimary}
            onChange={(_, d) => {
              if (d) setDate(d);
            }}
            style={styles.picker}
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
    paddingHorizontal: spacing.lg,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: colors.hairline,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { color: colors.textPrimary, fontSize: font.size.lg, fontWeight: font.weight.semibold },
  done: { color: colors.green, fontSize: font.size.xl, fontWeight: font.weight.semibold },
  cancel: { color: colors.textSecondary, fontSize: font.size.xl },
  clear: { color: colors.red, fontSize: font.size.xl },
  picker: { alignSelf: 'center' },
});
