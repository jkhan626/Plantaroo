/** Home-screen long-press quick actions (iOS/Android). */
import { Platform } from 'react-native';
import * as QuickActions from 'expo-quick-actions';

export function setQuickActionItems() {
  QuickActions.setItems([
    {
      id: 'add',
      title: 'Add a Plant',
      icon: Platform.OS === 'ios' ? 'symbol:plus' : undefined,
      params: {},
    },
    {
      id: 'todo',
      title: 'What Needs Water',
      icon: Platform.OS === 'ios' ? 'symbol:drop.fill' : undefined,
      params: {},
    },
  ]);
}

export function clearQuickActionItems() {
  QuickActions.setItems([]);
}
