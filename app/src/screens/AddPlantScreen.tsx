import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, spacing } from '../theme';
import type {
  RootStackParamList,
} from '../navigation/types';
import type {
  PlantProfile,
  MoisturePref,
  FertType,
  WaterSource,
  SoilType,
  LightType,
  Plant,
} from '../types';
import { ScreenHeader } from '../ui/Header';
import {
  PlantAvatar,
  Segmented,
  SelectRow,
  OptionSheet,
} from '../ui/components';
import { PotSheet, potSummaryLabel, type PotValues } from '../ui/PotSheet';
import { useToast } from '../ui/Toast';
import { Camera, ChevronLeft, Check } from '../ui/icons';
import {
  SOIL_TABLE,
  SOIL_OPTIONS,
  ROOMS,
  MOISTURE_OPTIONS,
  FERT_TYPE_OPTIONS,
  WATER_SRC_OPTIONS,
  DROPDOWN_LABELS,
} from '../logic/constants';
import { localProfileLookup, defaultProfile } from '../logic/profiles';
import {
  careInfoLookup,
  DIFFICULTY_LABELS,
  HUMIDITY_LABELS,
  type CareInfo,
} from '../logic/careInfo';
import { soilWarning } from '../logic/soilFit';
import { dbAdd, genId, getPlants } from '../data/db';
import {
  rescheduleWateringReminders,
  getNotifyEnabled,
  requestNotificationPermission,
} from '../logic/notify';
import { choosePhoto, resizeImage } from '../lib/photo';
import {
  identifyPlant,
  generateProfile,
  localAiAvailable,
  type IdentifyCandidate,
  type AiProfile,
} from '../lib/localAi';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function AddPlantScreen() {
  const nav = useNavigation<Nav>();
  const toast = useToast();

  const [name, setName] = useState('');
  const [room, setRoom] = useState<string>(ROOMS[0]);
  const [light, setLight] = useState<LightType>('natural');
  const [soil, setSoil] = useState<SoilType>('regular_perlite');
  const [photo, setPhoto] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlantProfile>(defaultProfile());
  const [matched, setMatched] = useState<null | boolean>(null);
  const [care, setCare] = useState<CareInfo | null>(null);
  const [pot, setPot] = useState<PotValues>({});

  const [sheet, setSheet] = useState<null | 'room' | 'soil' | 'pot' | 'moisture' | 'fert' | 'water' | 'identify'>(null);
  // Soil the user explicitly chose to keep after a warning — don't re-nag at save.
  const soilWarnedRef = useRef<SoilType | null>(null);

  // ---- Photo identification ----
  const [identifying, setIdentifying] = useState(false);
  const [identifyCaption, setIdentifyCaption] = useState<string | null>(null);
  const [identifyCandidates, setIdentifyCandidates] = useState<IdentifyCandidate[]>([]);
  const [scientificName, setScientificName] = useState<string | undefined>(undefined);
  const identifyReqRef = useRef(0);
  const identifiedNameRef = useRef<string | null>(null);
  const identifyAbortRef = useRef<AbortController | null>(null);

  // ---- AI-tailored schedule ----
  const [tailoring, setTailoring] = useState(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const tailorReqRef = useRef(0);
  const tailorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tailorAbortRef = useRef<AbortController | null>(null);
  // Profile fields the user has manually edited on this screen — the AI-tailored
  // profile only fills in fields NOT in this set. Bundled-DB prefill doesn't count.
  const touchedRef = useRef<Set<string>>(new Set());
  const lightSoilMounted = useRef(false);

  // Latest values for use inside debounced/async callbacks without stale closures.
  const nameRef = useRef(name);
  nameRef.current = name;
  const scientificNameRef = useRef(scientificName);
  scientificNameRef.current = scientificName;
  const lightRef = useRef(light);
  lightRef.current = light;
  const soilRef = useRef(soil);
  soilRef.current = soil;
  const roomRef = useRef(room);
  roomRef.current = room;
  const potRef = useRef(pot);
  potRef.current = pot;

  // Abort in-flight identify/tailor requests and cancel the debounce on unmount.
  useEffect(() => {
    return () => {
      identifyAbortRef.current?.abort();
      tailorAbortRef.current?.abort();
      clearTailorDebounce();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preset rooms + any rooms already used by the user's plants + the current pick.
  const roomOptions = useMemo(() => {
    const used = getPlants().map((p) => p.room).filter(Boolean);
    return Array.from(new Set<string>([...ROOMS, ...used, room]));
  }, [room]);

  function promptCustomRoom() {
    if (Platform.OS === 'ios') {
      Alert.prompt('New room', 'Name this room (e.g. Sunroom, Desk)', (text) => {
        const t = (text || '').trim();
        if (t) setRoom(t);
      });
    }
  }

  function onRoomSelect(v: string) {
    if (v === '__custom__') setTimeout(promptCustomRoom, 350);
    else setRoom(v);
  }

  // Soil-adjusted starting interval — visibly reflects the plant + soil choice.
  const startInterval = useMemo(() => {
    const mult = SOIL_TABLE[soil]?.mult;
    if (mult === null) return 2;
    return Math.round(profile.species_baseline_days * (mult ?? 1) * 10) / 10;
  }, [soil, profile.species_baseline_days]);

  // Resolve live as the user types — taps on other controls don't reliably
  // blur the TextInput, so waiting for onBlur left the profile stuck on
  // defaults. The lookup is an in-memory table; per-keystroke is free.
  function resolveProfile(text: string = name) {
    const trimmed = text.trim();
    if (!trimmed) {
      setProfile(defaultProfile());
      setMatched(null);
      setCare(null);
      return;
    }
    const found = localProfileLookup(trimmed);
    if (found) {
      setProfile(found);
      setMatched(true);
      // Carnivores want peat + distilled defaults.
      if (found.carnivore && soil === 'regular_perlite') setSoil('carnivore_peat');
    } else {
      setProfile(defaultProfile());
      setMatched(false);
    }
    setCare(careInfoLookup(trimmed));
  }

  function onNameChange(t: string) {
    setName(t);
    resolveProfile(t);
    // Any name change invalidates whatever identification/AI-rationale state
    // was tied to the previous name — clear it, and discard any in-flight
    // tailor result (the 700ms debounce below re-tailors for the new name).
    identifiedNameRef.current = null;
    setIdentifyCaption(null);
    setIdentifyCandidates([]);
    setScientificName(undefined);
    setAiRationale(null);
    tailorReqRef.current++;
    if (t.trim()) scheduleTailor(700);
    else {
      clearTailorDebounce();
      setTailoring(false);
    }
  }

  function clearTailorDebounce() {
    if (tailorDebounceRef.current) clearTimeout(tailorDebounceRef.current);
    tailorDebounceRef.current = null;
  }

  function scheduleTailor(delayMs: number) {
    clearTailorDebounce();
    tailorDebounceRef.current = setTimeout(() => {
      runTailor();
    }, delayMs);
  }

  async function runTailor() {
    const trimmed = nameRef.current.trim();
    if (!trimmed) return;
    const myReq = ++tailorReqRef.current;
    // A new run supersedes any in-flight request — abort it so it can't land late.
    tailorAbortRef.current?.abort();
    const controller = new AbortController();
    tailorAbortRef.current = controller;
    try {
      const available = await localAiAvailable();
      if (!available || tailorReqRef.current !== myReq) return; // stay silent — screen looks identical to today
      setTailoring(true);
      const result = await generateProfile(
        {
          name: trimmed,
          scientific_name: scientificNameRef.current,
          light_type: lightRef.current,
          soil_type: soilRef.current,
          room: roomRef.current,
          pot_size: potRef.current.pot_size,
          pot_material: potRef.current.pot_material,
          pot_drainage: potRef.current.pot_drainage,
        },
        { signal: controller.signal },
      );
      if (tailorReqRef.current !== myReq) return; // superseded by a newer request
      if (!result.ok) {
        // Silently keep whatever the DB/default values already are.
        return;
      }
      applyAiProfile(result.data);
    } finally {
      if (tailorReqRef.current === myReq) setTailoring(false);
    }
  }

  function applyAiProfile(ai: AiProfile) {
    setProfile((p) => {
      const next = { ...p };
      if (!touchedRef.current.has('moisture_pref')) next.moisture_pref = ai.moisture_pref;
      if (!touchedRef.current.has('species_baseline_days')) next.species_baseline_days = ai.species_baseline_days;
      if (!touchedRef.current.has('feed_every_n_waterings')) next.feed_every_n_waterings = ai.feed_every_n_waterings;
      if (!touchedRef.current.has('fert_type')) next.fert_type = ai.fert_type;
      if (!touchedRef.current.has('water_source')) next.water_source = ai.water_source;
      if (!touchedRef.current.has('carnivore')) next.carnivore = ai.carnivore;
      if (ai.mist_every_days !== null) next.mist_every_days = ai.mist_every_days;
      if (ai.clean_every_days !== null) next.clean_every_days = ai.clean_every_days;
      return enforceCarnivoreInvariant(next);
    });
    setAiRationale(ai.rationale || null);
  }

  // A carnivore on tap water or fertilizer dies — force the safe defaults
  // whenever the resulting profile ends up carnivorous, regardless of which
  // fields the user touched.
  function enforceCarnivoreInvariant(p: PlantProfile): PlantProfile {
    if (!p.carnivore) return p;
    return {
      ...p,
      moisture_pref: 'moist',
      water_source: 'distilled_or_rain',
      fert_type: 'none',
      feed_every_n_waterings: 0,
      species_baseline_days: Math.min(p.species_baseline_days, 3),
    };
  }

  function regenerateTailor() {
    touchedRef.current.clear();
    clearTailorDebounce();
    runTailor();
  }

  // Re-tailor whenever light, soil, or pot details change after the first
  // mount, as long as a plant name has been entered.
  useEffect(() => {
    if (!lightSoilMounted.current) {
      lightSoilMounted.current = true;
      return;
    }
    if (nameRef.current.trim()) scheduleTailor(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light, soil, pot.pot_size, pot.pot_material, pot.pot_drainage]);

  function onPotDone(values: PotValues) {
    setPot(values);
    setSheet(null);
  }

  function applyIdentifiedCandidate(candidate: IdentifyCandidate, opts: { force: boolean }) {
    identifiedNameRef.current = candidate.common_name;
    setIdentifyCaption(
      `Identified as ${candidate.common_name} · ${Math.round(candidate.confidence * 100)}%`,
    );
    // Only trust the candidate's scientific name once its common name is
    // actually applied to the form — otherwise it doesn't describe what's
    // in the Name field (the user's typed name was preserved instead).
    if (opts.force || !nameRef.current.trim()) {
      setScientificName(candidate.scientific_name || undefined);
      setName(candidate.common_name);
      resolveProfile(candidate.common_name);
      scheduleTailor(0);
    }
  }

  function onIdentifySelect(value: string) {
    if (value === '__manual__') {
      identifiedNameRef.current = null;
      setIdentifyCaption(null);
      setIdentifyCandidates([]);
      setScientificName(undefined);
      return;
    }
    const candidate = identifyCandidates[Number(value)];
    if (!candidate) return;
    applyIdentifiedCandidate(candidate, { force: true });
  }

  async function runIdentify(rawUri: string) {
    const myReq = ++identifyReqRef.current;
    identifyAbortRef.current?.abort();
    const controller = new AbortController();
    identifyAbortRef.current = controller;
    try {
      const available = await localAiAvailable();
      if (!available || identifyReqRef.current !== myReq) return; // unreachable — look identical to today
      setIdentifying(true);
      setIdentifyCaption(null);
      setIdentifyCandidates([]);
      const identifyUri = await resizeImage(rawUri, 768);
      if (identifyReqRef.current !== myReq) return;
      const result = await identifyPlant(identifyUri, { signal: controller.signal });
      if (identifyReqRef.current !== myReq) return;
      if (!result.ok || result.data.candidates.length === 0) {
        setIdentifyCaption("Couldn't identify — type the name");
        return;
      }
      const candidates = result.data.candidates;
      setIdentifyCandidates(candidates);
      if (candidates.length === 1) {
        applyIdentifiedCandidate(candidates[0], { force: false });
      } else {
        setSheet('identify');
      }
    } catch {
      if (identifyReqRef.current === myReq) {
        setIdentifyCaption("Couldn't identify — type the name");
      }
    } finally {
      if (identifyReqRef.current === myReq) setIdentifying(false);
    }
  }

  function onPhotoPress() {
    choosePhoto(setPhoto, { onRaw: (rawUri) => runIdentify(rawUri) });
  }

  function onSoilSelect(v: SoilType) {
    setSoil(v);
    soilWarnedRef.current = null;
    if (!name.trim()) return; // nothing to judge against yet — save() re-checks
    const warn = soilWarning(name, profile.carnivore, v);
    if (!warn) return;
    // Let the option sheet finish closing before presenting the alert.
    setTimeout(() => {
      Alert.alert(warn.title, warn.message, [
        {
          text: `Use ${SOIL_TABLE[warn.recommended].short}`,
          onPress: () => setSoil(warn.recommended),
        },
        {
          text: 'Keep my choice',
          style: 'cancel',
          onPress: () => {
            soilWarnedRef.current = v;
          },
        },
      ]);
    }, 400);
  }

  function bump(field: 'species_baseline_days' | 'feed_every_n_waterings', delta: number) {
    touchedRef.current.add(field);
    setProfile((p) => {
      const min = field === 'feed_every_n_waterings' ? 0 : 1;
      const max = field === 'feed_every_n_waterings' ? 30 : 90;
      const next = Math.max(min, Math.min(max, (p[field] || 0) + delta));
      return { ...p, [field]: next };
    });
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Final soil sanity check — the name may have been typed after the soil
    // was picked. Skip if the user already chose to keep this exact soil.
    const warn = soilWarning(trimmed, profile.carnivore, soil);
    if (warn && soilWarnedRef.current !== soil) {
      Alert.alert(warn.title, warn.message, [
        {
          text: `Use ${SOIL_TABLE[warn.recommended].short}`,
          onPress: () => {
            setSoil(warn.recommended);
            doSave(trimmed, warn.recommended).catch(onSaveError);
          },
        },
        { text: 'Add anyway', onPress: () => doSave(trimmed, soil).catch(onSaveError) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    doSave(trimmed, soil).catch(onSaveError);
  }

  function onSaveError(err: unknown) {
    Alert.alert('Could not add plant', 'Something went wrong saving this plant. Please try again.');
    // eslint-disable-next-line no-console
    console.error('doSave failed', err);
  }

  async function doSave(trimmed: string, soilChoice: SoilType) {
    const firstPlant = getPlants().length === 0;
    // Last-guard carnivore invariant — a carnivore on tap water/fertilizer
    // dies, so this must hold no matter how the profile got here.
    const safeProfile = enforceCarnivoreInvariant(profile);
    const soilMult = SOIL_TABLE[soilChoice]?.mult;
    const effectiveStart = soilMult === null ? 2 : safeProfile.species_baseline_days * (soilMult ?? 1);
    const plant: Plant = {
      id: genId(),
      name: trimmed,
      room,
      light_type: light,
      soil_type: soilChoice,
      photo,
      ...safeProfile,
      current_interval: effectiveStart,
      recent_valid_gaps: [],
      last_watered: null,
      last_fertilized: null,
      last_fed_at_count: 0,
      no_fert_until: null,
      watering_count: 0,
      notes: '',
      created_at: new Date().toISOString(),
    };
    // Firestore's setDoc rejects any explicit `undefined` field value — only
    // write ai_rationale/pot fields when there's an actual value (the default
    // no-AI / not-set paths have none).
    if (aiRationale) plant.ai_rationale = aiRationale;
    if (pot.pot_size) plant.pot_size = pot.pot_size;
    if (pot.pot_material) plant.pot_material = pot.pot_material;
    if (pot.pot_drainage !== undefined) plant.pot_drainage = pot.pot_drainage;
    await dbAdd('plants', plant);
    rescheduleWateringReminders(getPlants());
    toast.show({ message: `${trimmed} added` });
    nav.goBack();
    // Ask for notification permission at the first high-intent moment.
    if (firstPlant && (await getNotifyEnabled())) {
      requestNotificationPermission().then((granted) => {
        if (granted) rescheduleWateringReminders(getPlants());
      });
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={styles.backText}>Cancel</Text>
        </Pressable>
      </View>
      <ScreenHeader title="New plant" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.photoRow}>
            <Pressable onPress={onPhotoPress}>
              <PlantAvatar uri={photo} size={72} />
              <View style={styles.cameraBadge}>
                <Camera size={13} color={colors.black} />
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Pressable onPress={onPhotoPress} style={styles.photoBtn}>
                <Text style={styles.photoBtnText}>{photo ? 'Change photo' : 'Add a photo'}</Text>
              </Pressable>
              {identifying && (
                <View style={styles.identifyRow}>
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                  <Text style={styles.identifyText}>Identifying…</Text>
                </View>
              )}
              {!identifying && identifyCaption && (
                <View style={styles.identifyRow}>
                  <Text style={styles.identifyText} numberOfLines={1}>
                    {identifyCaption}
                  </Text>
                  {identifyCandidates.length > 0 && (
                    <Pressable onPress={() => setSheet('identify')} hitSlop={6}>
                      <Text style={styles.identifyAction}>Not right?</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>

          <Field label="Name">
            <TextInput
              value={name}
              onChangeText={onNameChange}
              onBlur={() => resolveProfile()}
              placeholder="e.g. Monstera, Basil, Snake Plant"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCorrect={false}
              returnKeyType="next"
            />
          </Field>

          <View style={styles.card}>
            <SelectRow label="Room" valueLabel={room} onPress={() => setSheet('room')} />
            <View style={styles.divider} />
            <SelectRow label="Soil mix" valueLabel={SOIL_TABLE[soil].short} onPress={() => setSheet('soil')} />
            <View style={styles.divider} />
            <SelectRow label="Pot" valueLabel={potSummaryLabel(pot)} onPress={() => setSheet('pot')} />
          </View>

          <Field label="Light">
            <Segmented
              value={light}
              onChange={setLight}
              options={[
                { label: 'Natural', value: 'natural' },
                { label: 'Grow light', value: 'grow' },
              ]}
            />
          </Field>

          {/* Care profile — derived from the plant + your soil/light */}
          <View style={styles.profileHeaderRow}>
            <Text style={styles.sectionLabel}>Care profile</Text>
            {matched !== null && (
              <View style={styles.matchTag}>
                {matched && <Check size={12} color={colors.green} />}
                <Text style={[styles.matchText, { color: matched ? colors.green : colors.textTertiary }]}>
                  {matched ? 'Updated based on plant & settings' : 'Set it manually below'}
                </Text>
              </View>
            )}
          </View>

          {matched !== null && (
            <Text style={styles.deriveHint}>
              With your soil, waters about every {startInterval} day{startInterval === 1 ? '' : 's'}
              {light === 'natural' ? ' (slower in winter)' : ''} — then adjusts as it learns from you.
            </Text>
          )}

          {matched && care && (
            <Text style={styles.careHint}>
              <Text style={care.difficulty === 'fussy' ? { color: colors.orange } : undefined}>
                {DIFFICULTY_LABELS[care.difficulty]}
              </Text>
              {` · ${HUMIDITY_LABELS[care.humidity_pref].toLowerCase()}`}
              {care.pet_toxic === 'toxic' ? (
                <Text style={{ color: colors.redSoft }}>{' · toxic to pets'}</Text>
              ) : care.pet_toxic === 'safe' ? (
                <Text style={{ color: colors.green }}>{' · pet safe'}</Text>
              ) : (
                ''
              )}
            </Text>
          )}

          {tailoring && (
            <View style={styles.identifyRow}>
              <ActivityIndicator size="small" color={colors.textTertiary} />
              <Text style={styles.identifyText}>Tailoring schedule…</Text>
            </View>
          )}

          {!tailoring && aiRationale && (
            <View style={styles.tailoredRow}>
              <Text style={styles.tailoredText}>
                <Text style={styles.tailoredLabel}>Starting point  </Text>
                {aiRationale}
              </Text>
              <Text style={styles.tailoredHint}>Plantaroo adjusts this as you water.</Text>
              <Pressable onPress={regenerateTailor} hitSlop={6}>
                <Text style={styles.identifyAction}>Regenerate</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.card}>
            <SelectRow
              label="Moisture"
              valueLabel={DROPDOWN_LABELS[profile.moisture_pref]}
              onPress={() => setSheet('moisture')}
            />
            <View style={styles.divider} />
            <Stepper
              label="Baseline interval"
              value={`${profile.species_baseline_days} days`}
              onDec={() => bump('species_baseline_days', -1)}
              onInc={() => bump('species_baseline_days', 1)}
            />
            <View style={styles.divider} />
            <SelectRow
              label="Fertilizer"
              valueLabel={DROPDOWN_LABELS[profile.fert_type]}
              onPress={() => setSheet('fert')}
            />
            <View style={styles.divider} />
            <Stepper
              label="Feed every"
              value={profile.feed_every_n_waterings ? `${profile.feed_every_n_waterings} waterings` : 'Never'}
              onDec={() => bump('feed_every_n_waterings', -1)}
              onInc={() => bump('feed_every_n_waterings', 1)}
            />
            <View style={styles.divider} />
            <SelectRow
              label="Water source"
              valueLabel={DROPDOWN_LABELS[profile.water_source]}
              onPress={() => setSheet('water')}
            />
            <View style={styles.divider} />
            <View style={styles.carnRow}>
              <Text style={styles.rowLabel}>Carnivorous</Text>
              <View style={{ width: 150 }}>
                <Segmented
                  value={profile.carnivore ? 'yes' : 'no'}
                  onChange={(v) => {
                    touchedRef.current.add('carnivore');
                    setProfile((p) => ({ ...p, carnivore: v === 'yes' }));
                  }}
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Yes', value: 'yes' },
                  ]}
                />
              </View>
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
            onPress={save}
            disabled={!name.trim()}
          >
            <Text style={styles.saveText}>Add plant</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={sheet === 'room'}
        title="Room"
        selected={room}
        options={[
          ...roomOptions.map((r) => ({ label: r, value: r })),
          ...(Platform.OS === 'ios' ? [{ label: '＋  Add a custom room…', value: '__custom__' }] : []),
        ]}
        onSelect={onRoomSelect}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'soil'}
        title="Soil mix"
        selected={soil}
        options={SOIL_OPTIONS.map((v) => ({ label: SOIL_TABLE[v].label, value: v }))}
        onSelect={(v) => onSoilSelect(v as SoilType)}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'moisture'}
        title="Moisture preference"
        selected={profile.moisture_pref}
        options={MOISTURE_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v }))}
        onSelect={(v) => {
          touchedRef.current.add('moisture_pref');
          setProfile((p) => ({ ...p, moisture_pref: v as MoisturePref }));
        }}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'fert'}
        title="Fertilizer type"
        selected={profile.fert_type}
        options={FERT_TYPE_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v }))}
        onSelect={(v) => {
          touchedRef.current.add('fert_type');
          setProfile((p) => ({ ...p, fert_type: v as FertType }));
        }}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'water'}
        title="Water source"
        selected={profile.water_source}
        options={WATER_SRC_OPTIONS.map((v) => ({ label: DROPDOWN_LABELS[v], value: v }))}
        onSelect={(v) => {
          touchedRef.current.add('water_source');
          setProfile((p) => ({ ...p, water_source: v as WaterSource }));
        }}
        onClose={() => setSheet(null)}
      />
      <PotSheet
        visible={sheet === 'pot'}
        initial={pot}
        onDone={onPotDone}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'identify'}
        title="Which plant is this?"
        options={[
          ...identifyCandidates.map((c, i) => ({
            label: `${c.common_name} · ${Math.round(c.confidence * 100)}%`,
            value: String(i),
          })),
          { label: 'Enter manually', value: '__manual__' },
        ]}
        onSelect={onIdentifySelect}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={onDec} hitSlop={6}>
          <Text style={styles.stepSign}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable style={styles.stepBtn} onPress={onInc} hitSlop={6}>
          <Text style={styles.stepSign}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: 6 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.textSecondary, fontSize: font.size.xl, fontWeight: font.weight.medium },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18, marginTop: 4 },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  photoBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.md,
  },
  photoBtnText: { color: colors.textSecondary, fontSize: font.size.md, fontWeight: font.weight.medium },

  field: { marginBottom: 18 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 52,
    color: colors.textPrimary,
    fontSize: font.size.xl,
    fontWeight: font.weight.medium,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  matchTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  matchText: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  deriveHint: {
    color: colors.textTertiary,
    fontSize: font.size.sm,
    lineHeight: 18,
    marginTop: -2,
    marginBottom: 10,
    paddingLeft: 2,
  },
  careHint: {
    color: colors.textTertiary,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 10,
    paddingLeft: 2,
  },

  identifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  identifyText: { color: colors.textTertiary, fontSize: font.size.sm, flexShrink: 1 },
  identifyAction: { color: colors.green, fontSize: font.size.sm, fontWeight: font.weight.semibold },

  tailoredRow: {
    marginBottom: 12,
    gap: 4,
  },
  tailoredText: { color: colors.textTertiary, fontSize: 13, lineHeight: 17 },
  tailoredLabel: { color: colors.textSecondary, fontWeight: font.weight.semibold, fontSize: 13 },
  tailoredHint: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },

  rowLabel: { color: colors.textSecondary, fontSize: font.size.md },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSign: { color: colors.green, fontSize: 20, fontWeight: font.weight.semibold, lineHeight: 22 },
  stepValue: { color: colors.textPrimary, fontSize: font.size.md, fontWeight: font.weight.medium, minWidth: 86, textAlign: 'center' },

  carnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },

  saveBtn: {
    backgroundColor: colors.green,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveText: { color: colors.black, fontSize: font.size.xl, fontWeight: font.weight.semibold },
});
