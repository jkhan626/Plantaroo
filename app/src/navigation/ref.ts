import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/** App-level navigation ref so non-screen code (quick actions) can navigate. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
