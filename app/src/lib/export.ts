/**
 * Data export (Phase 5, OTA-able slice) — share the user's full subtree as
 * JSON text via the system share sheet (save to Files, AirDrop, mail…).
 *
 * Uses React Native's built-in Share so it ships OTA with no new native
 * modules. Base64 photos are excluded to keep the export readable; they
 * remain in the app/cloud. A file-based export (expo-file-system) can
 * replace this at the next native build if wanted.
 */
import { Share } from 'react-native';
import { getPlants, getHistory, getJournal } from '../data/db';

export async function exportDataAsJson(): Promise<void> {
  const plants = getPlants().map(({ photo, ...rest }) => ({
    ...rest,
    has_photo: !!photo,
  }));
  const journal = getJournal().map(({ photo, ...rest }) => ({
    ...rest,
    has_photo: !!photo,
  }));
  const payload = {
    app: 'Plantaroo',
    format: 1,
    exported_at: new Date().toISOString(),
    note: 'Photos are stored in the app and its cloud sync; they are omitted from this text export.',
    plants,
    history: getHistory(),
    journal,
  };
  await Share.share(
    { message: JSON.stringify(payload, null, 2) },
    { subject: 'Plantaroo data export' },
  );
}
