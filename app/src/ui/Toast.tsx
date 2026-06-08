/** Toast with an optional UNDO action — mirrors the web app's watered toast. */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';
import { StyleSheet, Text, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, font, shadow } from '../theme';
import { Check } from './icons';

type ToastKind = 'success' | 'info';
interface ToastSpec {
  message: string;
  kind?: ToastKind;
  onUndo?: () => void;
}

interface ToastApi {
  show: (spec: ToastSpec) => void;
}

const Ctx = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [spec, setSpec] = useState<ToastSpec | null>(null);
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => setSpec(null), []);

  const dismiss = useCallback(() => {
    opacity.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(24, { duration: 220 }, (done) => {
      if (done) runOnJS(clear)();
    });
  }, [opacity, translateY, clear]);

  const show = useCallback(
    (s: ToastSpec) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setSpec(s);
      Haptics.notificationAsync(
        s.kind === 'info'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      opacity.value = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, { damping: 16, stiffness: 180 });
      hideTimer.current = setTimeout(dismiss, s.onUndo ? 4200 : 2600);
    },
    [opacity, translateY, dismiss],
  );

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {spec && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: insets.bottom + 96 }]}
        >
          <Animated.View
            style={[
              styles.toast,
              spec.kind === 'info' && styles.toastInfo,
              animStyle,
            ]}
          >
            {spec.kind !== 'info' && <Check size={16} color={colors.black} />}
            <Text style={styles.text}>{spec.message}</Text>
            {spec.onUndo && (
              <Pressable
                onPress={() => {
                  if (hideTimer.current) clearTimeout(hideTimer.current);
                  spec.onUndo?.();
                  dismiss();
                }}
                hitSlop={10}
                style={styles.undoBtn}
              >
                <Text style={styles.undoText}>UNDO</Text>
              </Pressable>
            )}
          </Animated.View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#3FD968',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  toastInfo: { backgroundColor: '#FFB13D' },
  text: {
    color: colors.black,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },
  undoBtn: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingVertical: 5,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    marginLeft: 2,
  },
  undoText: {
    color: colors.black,
    fontSize: 12,
    fontWeight: font.weight.bold,
    letterSpacing: 0.5,
  },
});
