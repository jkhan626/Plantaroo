/**
 * Thin banner shown while viewing a co-owned account (not your own), so it's
 * always obvious whose plants you're looking at and acting on. Tapping it
 * switches back to your own plants.
 */
import React from 'react';
import { StyleSheet, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../theme';
import { useStore } from './hooks';
import { getActiveOwnerName, getSignedInUid, switchAccount } from '../data/db';

export function SharedAccountBanner() {
  useStore(); // re-render on account switch
  const insets = useSafeAreaInsets();
  const name = getActiveOwnerName();
  if (!name) return null;
  return (
    <Pressable
      style={[styles.bar, { paddingTop: insets.top + 4 }]}
      onPress={() => {
        const me = getSignedInUid();
        if (me) switchAccount(me, null);
      }}
    >
      <Text style={styles.text}>
        Viewing {name}'s plants · <Text style={styles.action}>Back to mine</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.greenBgStrong,
    paddingBottom: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: { color: colors.textPrimary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  action: { color: colors.green, fontWeight: font.weight.semibold },
});
