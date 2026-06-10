/**
 * "What's wrong with my plant?" — symptom picker → 1–2 follow-ups →
 * diagnosis informed by the plant's real watering data (logic/troubleshoot.ts).
 */
import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { usePlant } from '../ui/hooks';
import { PlantAvatar, PressableScale } from '../ui/components';
import { ChevronLeft, ChevronRight, Sprout } from '../ui/icons';
import {
  SYMPTOMS,
  getQuestions,
  diagnose,
  type TSDiagnosis,
} from '../logic/troubleshoot';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TroubleshootScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Troubleshoot'>>();
  const plant = usePlant(route.params.id);

  const [symptom, setSymptom] = useState<string | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TSDiagnosis | null>(null);

  if (!plant) {
    return <SafeAreaView style={styles.root} />;
  }

  const questions = symptom ? getQuestions(symptom) : [];
  const question = symptom && !result ? questions[qIndex] : null;

  function pickSymptom(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setSymptom(id);
    setQIndex(0);
    setAnswers({});
    setResult(null);
    if (getQuestions(id).length === 0) {
      setResult(diagnose(plant!, id, {}));
    }
  }

  function answer(qid: string, value: string) {
    Haptics.selectionAsync().catch(() => {});
    const next = { ...answers, [qid]: value };
    setAnswers(next);
    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
    } else {
      setResult(diagnose(plant!, symptom!, next));
    }
  }

  function startOver() {
    setSymptom(null);
    setQIndex(0);
    setAnswers({});
    setResult(null);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={styles.backText}>{plant.name}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <PlantAvatar uri={plant.photo} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Troubleshoot</Text>
            <Text style={styles.subtitle}>
              {result
                ? 'Diagnosis'
                : question
                  ? `Question ${qIndex + 1} of ${questions.length}`
                  : 'What are you seeing?'}
            </Text>
          </View>
        </View>

        {!symptom && !result && (
          <Animated.View entering={FadeInDown.duration(220)}>
            {SYMPTOMS.map((s) => (
              <Pressable key={s.id} style={styles.optionRow} onPress={() => pickSymptom(s.id)}>
                <Text style={styles.optionText}>{s.label}</Text>
                <ChevronRight size={16} />
              </Pressable>
            ))}
          </Animated.View>
        )}

        {question && (
          <Animated.View key={question.id} entering={FadeInDown.duration(220)}>
            <Text style={styles.questionText}>{question.text}</Text>
            {question.options.map((o) => (
              <Pressable
                key={o.value}
                style={styles.optionRow}
                onPress={() => answer(question.id, o.value)}
              >
                <Text style={styles.optionText}>{o.label}</Text>
                <ChevronRight size={16} />
              </Pressable>
            ))}
          </Animated.View>
        )}

        {result && (
          <Animated.View entering={FadeInDown.duration(240)}>
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>{result.title}</Text>
              <Text style={styles.resultBody}>{result.body}</Text>
            </View>
            {result.dataNote && (
              <View style={styles.dataCard}>
                <View style={styles.dataHeader}>
                  <Sprout size={14} color={colors.green} />
                  <Text style={styles.dataLabel}>From this plant’s data</Text>
                </View>
                <Text style={styles.dataText}>{result.dataNote}</Text>
              </View>
            )}
            <PressableScale style={styles.doneBtn} onPress={() => nav.goBack()}>
              <Text style={styles.doneText}>Done</Text>
            </PressableScale>
            <Pressable style={styles.againBtn} onPress={startOver} hitSlop={8}>
              <Text style={styles.againText}>Check another symptom</Text>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.lg, paddingVertical: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.textSecondary, fontSize: font.size.xl, fontWeight: font.weight.medium },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20, marginTop: 4 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: font.weight.bold, letterSpacing: -0.3 },
  subtitle: { color: colors.textTertiary, fontSize: font.size.md, marginTop: 3 },

  questionText: {
    color: colors.textPrimary,
    fontSize: font.size.xl,
    fontWeight: font.weight.semibold,
    marginBottom: 12,
    lineHeight: 23,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  optionText: { color: colors.textPrimary, fontSize: font.size.lg, fontWeight: font.weight.medium, flex: 1 },

  resultCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 16,
  },
  resultTitle: { color: colors.textPrimary, fontSize: font.size.title, fontWeight: font.weight.bold, letterSpacing: -0.3 },
  resultBody: { color: colors.textSecondary, fontSize: font.size.lg, lineHeight: 22, marginTop: 8 },

  dataCard: {
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.22)',
    borderRadius: radius.md,
    padding: 14,
    marginTop: 10,
  },
  dataHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  dataLabel: {
    color: colors.green,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dataText: { color: colors.textPrimary, fontSize: font.size.md, lineHeight: 20 },

  doneBtn: {
    backgroundColor: colors.green,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  doneText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.semibold },
  againBtn: { alignItems: 'center', paddingVertical: 14 },
  againText: { color: colors.textTertiary, fontSize: font.size.md, fontWeight: font.weight.medium },
});
