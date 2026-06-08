/**
 * Pick or capture a plant photo, resize to ~400px and compress, and return a
 * data URI small enough to store inside the Firestore plant doc (<1MB limit).
 */
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

async function process(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 400 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return `data:image/jpeg;base64,${result.base64}`;
}

export async function captureFromCamera(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Camera access needed', 'Enable camera access in Settings to take plant photos.');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  if (res.canceled || !res.assets?.[0]) return null;
  return process(res.assets[0].uri);
}

export async function pickFromLibrary(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return process(res.assets[0].uri);
}

/** Present a Take Photo / Choose action sheet and return a processed data URI. */
export function choosePhoto(onPicked: (dataUri: string) => void) {
  Alert.alert('Plant photo', undefined, [
    {
      text: 'Take Photo',
      onPress: async () => {
        const uri = await captureFromCamera();
        if (uri) onPicked(uri);
      },
    },
    {
      text: 'Choose from Library',
      onPress: async () => {
        const uri = await pickFromLibrary();
        if (uri) onPicked(uri);
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
