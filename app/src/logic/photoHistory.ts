/**
 * Photo history management — keep first photo + last 10
 */
import type { Plant } from '../types';

/**
 * Add a new photo to history, keeping first photo + last 10 total.
 * Returns updated plant with photo set to new image and history maintained.
 */
export function addPhotoToHistory(plant: Plant, newPhoto: string): Plant {
  const history = plant.photo_history || [];

  // If this is the first photo, just set it
  if (!plant.photo) {
    return {
      ...plant,
      photo: newPhoto,
      photo_history: [],
    };
  }

  // Add current photo to history with timestamp
  const updated = [...history, { date: new Date().toISOString(), photo: plant.photo }];

  // Keep first photo + last 10
  let kept = updated;
  if (updated.length > 10) {
    // Keep index 0 (first) and last 10 indices
    const first = updated[0];
    const last10 = updated.slice(-10);
    kept = [first, ...last10];
  }

  return {
    ...plant,
    photo: newPhoto,
    photo_history: kept,
  };
}

/**
 * Get all photos in display order: current + history (newest first)
 */
export function getAllPhotos(plant: Plant): Array<{ date: string; photo: string; isFirst: boolean }> {
  const photos: Array<{ date: string; photo: string; isFirst: boolean }> = [];

  // Add current photo
  if (plant.photo) {
    photos.push({
      date: new Date().toISOString(), // Current doesn't have a stored date
      photo: plant.photo,
      isFirst: false,
    });
  }

  // Add history in reverse (newest first)
  if (plant.photo_history && plant.photo_history.length > 0) {
    for (let i = plant.photo_history.length - 1; i >= 0; i--) {
      const h = plant.photo_history[i];
      photos.push({
        date: h.date,
        photo: h.photo,
        isFirst: i === 0, // Mark the very first photo
      });
    }
  }

  return photos;
}

/**
 * Format date for display in image history
 */
export function formatPhotoDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return 'Unknown date';
  }
}
