/** Full-screen image viewer modal */
import React from 'react';
import { StyleSheet, View, Modal, Pressable, SafeAreaView } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../theme';
import { X } from './icons';

export function ImageViewerModal({
  visible,
  imageUri,
  onClose,
}: {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible && !!imageUri} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
          <X size={24} color={colors.textPrimary} />
        </Pressable>

        {imageUri && (
          <Pressable style={styles.imageArea} onPress={onClose}>
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              contentFit="contain"
            />
          </Pressable>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  imageArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
