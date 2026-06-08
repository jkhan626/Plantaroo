import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  NavigationContainer,
  DarkTheme,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { colors } from './src/theme';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import { TabBar } from './src/navigation/TabBar';
import { ToastProvider } from './src/ui/Toast';

import { onAuthChange, type User } from './src/lib/auth';
import { startSession, endSession, getPlants } from './src/data/db';
import {
  configureNotificationHandler,
  getNotifyEnabled,
  requestNotificationPermission,
  rescheduleWateringReminders,
} from './src/logic/notify';

import { SignInScreen } from './src/screens/SignInScreen';
import { ToDoScreen } from './src/screens/ToDoScreen';
import { PlantsScreen } from './src/screens/PlantsScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { PlantDetailScreen } from './src/screens/PlantDetailScreen';
import { AddPlantScreen } from './src/screens/AddPlantScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

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

function Tabs() {
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

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      if (u) {
        await startSession(u.uid);
        // Best-effort: keep reminders fresh on launch.
        if (await getNotifyEnabled()) {
          requestNotificationPermission().then((granted) => {
            if (granted) rescheduleWateringReminders(getPlants());
          });
        }
      } else {
        endSession();
      }
      setUser(u ?? null);
      SplashScreen.hideAsync().catch(() => {});
    });
    return unsub;
  }, []);

  if (user === undefined) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ToastProvider>
          <NavigationContainer theme={navTheme}>
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
                </>
              ) : (
                <Stack.Screen name="SignIn" component={SignInScreen} />
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
