import React, { useEffect, useRef, useState } from 'react';
import { View, AppState, Linking, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  NavigationContainer,
  DarkTheme,
  type Theme,
} from '@react-navigation/native';
import * as QuickActions from 'expo-quick-actions';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { colors } from './src/theme';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import { TabBar } from './src/navigation/TabBar';
import { navigationRef } from './src/navigation/ref';
import { setQuickActionItems, clearQuickActionItems } from './src/lib/quickActions';
import { ToastProvider } from './src/ui/Toast';
import { Onboarding } from './src/ui/Onboarding';

import { onAuthChange, type User } from './src/lib/auth';
import { initSentry, setSentryUser, wrapWithSentry } from './src/lib/sentry';
import {
  startSession,
  endSession,
  getPlants,
  getActiveOwnerName,
  getSignedInUid,
  switchAccount,
} from './src/data/db';
import {
  drainGuestEvents,
  finalizePendingInvites,
  refreshActiveShares,
  acceptInvite,
  parseJoinCode,
} from './src/lib/sharing';
import { useStore } from './src/ui/hooks';
import { SharedAccountBanner } from './src/ui/SharedAccountBanner';
import {
  configureNotificationHandler,
  getNotifyEnabled,
  rescheduleWateringReminders,
} from './src/logic/notify';

import { UpdateRequiredScreen } from './src/screens/UpdateRequiredScreen';
import { isForcedUpdateRequired, fetchOtaUpdateSilently } from './src/lib/updates';

import { SignInScreen } from './src/screens/SignInScreen';
import { ToDoScreen } from './src/screens/ToDoScreen';
import { PlantsScreen } from './src/screens/PlantsScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { PlantDetailScreen } from './src/screens/PlantDetailScreen';
import { AddPlantScreen } from './src/screens/AddPlantScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SharingScreen } from './src/screens/SharingScreen';
import { AwayModeScreen } from './src/screens/AwayModeScreen';
import { CareQueueScreen } from './src/screens/CareQueueScreen';
import { TroubleshootScreen } from './src/screens/TroubleshootScreen';

initSentry();
configureNotificationHandler();
SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    border: colors.border,
    primary: colors.green,
    text: colors.textPrimary,
  },
};

/** Sets quick-action items when signed in and routes taps to the right screen. */
function QuickActionsBridge({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) setQuickActionItems();
    else clearQuickActionItems();
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const handle = (action: QuickActions.Action) => {
      let tries = 0;
      const go = () => {
        if (navigationRef.isReady()) {
          if (action.id === 'add') navigationRef.navigate('AddPlant');
          else if (action.id === 'todo') (navigationRef as any).navigate('Tabs', { screen: 'ToDo' });
        } else if (tries++ < 20) {
          setTimeout(go, 100);
        }
      };
      go();
    };
    if (QuickActions.initial) handle(QuickActions.initial);
    const sub = QuickActions.addListener(handle);
    return () => sub.remove();
  }, [enabled]);
  return null;
}

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      sceneContainerStyle={{ backgroundColor: colors.bg }}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="ToDo" component={ToDoScreen} />
      <Tab.Screen name="Plants" component={PlantsScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}

function Tabs() {
  useStore(); // re-render when the active account switches
  const shared = !!getActiveOwnerName();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SharedAccountBanner />
      {shared ? (
        // The banner consumed the real top inset — zero it out for the screens
        // so they don't double-pad below it.
        <SafeAreaInsetsContext.Consumer>
          {(insets) => (
            <SafeAreaInsetsContext.Provider value={{ ...(insets ?? { top: 0, bottom: 0, left: 0, right: 0 }), top: 0 }}>
              <TabNavigator />
            </SafeAreaInsetsContext.Provider>
          )}
        </SafeAreaInsetsContext.Consumer>
      ) : (
        <TabNavigator />
      )}
    </View>
  );
}

/** Drain sitter check-offs + finalize accepted co-owner invites (own account). */
function runSharingSync() {
  if (!getSignedInUid()) return;
  drainGuestEvents().catch(() => {});
  finalizePendingInvites().catch(() => {});
  refreshActiveShares().catch(() => {}); // keep sitter links fresh with latest watering
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [gateChecked, setGateChecked] = useState(false);
  const [forcedUpdate, setForcedUpdate] = useState(false);
  const pendingJoin = useRef<{ ownerUid: string; token: string } | null>(null);

  // Accept a co-owner invite once we're signed in (links may arrive cold).
  async function processPendingJoin() {
    const job = pendingJoin.current;
    if (!job || !getSignedInUid()) return;
    pendingJoin.current = null;
    try {
      const m = await acceptInvite(job.ownerUid, job.token);
      Alert.alert('Invite accepted', `You can now access ${m.ownerName}'s plants.`, [
        { text: 'Later' },
        { text: 'Switch to it', onPress: () => switchAccount(m.ownerUid, m.ownerName).catch(() => {}) },
      ]);
    } catch (e: any) {
      Alert.alert('Could not join', String(e?.message ?? e));
    }
  }

  // Deep links: plantaroo://join?u=<owner>&t=<token>
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url || !url.includes('join')) return;
      const parsed = parseJoinCode(url);
      if (parsed) {
        pendingJoin.current = parsed;
        processPendingJoin();
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  // Forced-update gate + foreground OTA fetch.
  useEffect(() => {
    isForcedUpdateRequired().then((r) => {
      setForcedUpdate(r);
      setGateChecked(true);
    });
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        isForcedUpdateRequired().then(setForcedUpdate);
        fetchOtaUpdateSilently();
        runSharingSync();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setSentryUser(u?.uid ?? null);
      if (u) {
        await startSession(u.uid);
        // Keep reminders fresh on launch (no-op if permission not yet granted).
        // We DON'T prompt here — permission is requested after the first plant
        // is added (high-intent moment) or from Settings.
        if (await getNotifyEnabled()) rescheduleWateringReminders(getPlants());
        // Apply any sitter check-offs / finalize co-owner invites, then handle a
        // pending join link that arrived before sign-in completed.
        runSharingSync();
        processPendingJoin();
      } else {
        endSession();
      }
      setUser(u ?? null);
      SplashScreen.hideAsync().catch(() => {});
    });
    return unsub;
  }, []);

  let content: React.ReactNode;
  if (!gateChecked || user === undefined) {
    content = <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  } else if (forcedUpdate) {
    content = <UpdateRequiredScreen />;
  } else {
    content = (
      <ToastProvider>
        <QuickActionsBridge enabled={!!user} />
        <NavigationContainer ref={navigationRef} theme={navTheme}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            {user ? (
              <>
                <Stack.Screen name="Tabs" component={Tabs} />
                <Stack.Screen
                  name="PlantDetail"
                  component={PlantDetailScreen}
                  options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                  name="AddPlant"
                  component={AddPlantScreen}
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="Settings"
                  component={SettingsScreen}
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="Sharing"
                  component={SharingScreen}
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="AwayMode"
                  component={AwayModeScreen}
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="CareQueue"
                  component={CareQueueScreen}
                  options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="Troubleshoot"
                  component={TroubleshootScreen}
                  options={{ animation: 'slide_from_right' }}
                />
              </>
            ) : (
              <Stack.Screen name="SignIn" component={SignInScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
        <Onboarding enabled={!!user} />
      </ToastProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <StatusBar style="light" />
          {content}
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithSentry(App);
