import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { palette } from '@/constants/sprintlab';
import { ReadinessDecision, ReadinessLocation, ReadinessSensation } from '@/types';
import {
  evaluateReadiness,
  locationLabels,
  readinessLevelMeta,
  sensationLabels,
} from '@/utils/readiness';
import { getReadiness, saveReadiness } from '@/utils/storage';

const dateKey = () => new Date().toLocaleDateString('en-CA');
const levelColors = { green: palette.accent, yellow: palette.orange, red: palette.red } as const;
const levelBackgrounds = { green: '#162000', yellow: '#2A1B0C', red: '#2A1216' } as const;
const cleanSleep = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, '');
  const [whole = '', ...decimals] = normalized.split('.');
  const decimal = decimals.length ? `.${decimals.join('').slice(0, 1)}` : '';
  const result = `${whole.slice(0, 2)}${decimal}`;
  return Number(result) > 24 ? '24' : result;
};

function Scale({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return <View style={styles.scale}>{Array.from({ length: max }, (_, i) => i + 1).map(n => <Pressable key={n} onPress={() => onChange(n)} style={[styles.scaleItem, value === n && styles.scaleActive]}><Text style={[styles.scaleText, value === n && styles.scaleTextActive]}>{n}</Text></Pressable>)}</View>;
}

function Choice<T extends string | boolean>({ value, options, onChange }: { value: T | null | undefined; options: { value: T; label: string; detail?: string }[]; onChange: (value: T) => void }) {
  return <View style={styles.choiceList}>{options.map(option => {
    const selected = value === option.value;
    return <Pressable key={String(option.value)} onPress={() => onChange(option.value)} style={[styles.choice, selected && styles.choiceSelected]}>
      <View style={[styles.choiceDot, selected && styles.choiceDotSelected]} />
      <View style={{ flex: 1 }}><Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{option.label}</Text>{option.detail ? <Text style={styles.choiceDetail}>{option.detail}</Text> : null}</View>
    </Pressable>;
  })}</View>;
}

export default function ReadinessScreen() {
  const router = useRouter();
  const [sleep, setSleep] = useState('');
  const [sleepQuality, setSleepQuality] = useState(0);
  const [neuralReadiness, setNeuralReadiness] = useState(0);
  const [focus, setFocus] = useState(0);
  const [fuelHydrated, setFuelHydrated] = useState<boolean | null>(null);
  const [soreness, setSoreness] = useState(0);
  const [hasLocalizedIssue, setHasLocalizedIssue] = useState<boolean | null>(null);
  const [sensation, setSensation] = useState<ReadinessSensation>();
  const [location, setLocation] = useState<ReadinessLocation>();
  const [otherLocationDetail, setOtherLocationDetail] = useState('');
  const [hesitatesAtMaxEffort, setHesitatesAtMaxEffort] = useState<boolean | null>(null);
  const [painNotes, setPainNotes] = useState('');
  const [confirmSkip, setConfirmSkip] = useState(false);

  useFocusEffect(useCallback(() => {
    getReadiness(dateKey()).then(value => {
      if (value?.status !== 'completed') return;
      setSleep(value.sleep ? String(value.sleep) : '');
      setSleepQuality(value.sleepQuality ?? 0);
      setNeuralReadiness(value.neuralReadiness ?? (value.energy ? value.energy * 2 : 0));
      setFocus(value.focus ?? 0);
      setFuelHydrated(value.fuelHydrated ?? null);
      setSoreness(value.soreness ?? 0);
      setHasLocalizedIssue(value.hasLocalizedIssue ?? null);
      setSensation(value.sensation);
      setLocation(value.location);
      setOtherLocationDetail(value.otherLocationDetail ?? '');
      setHesitatesAtMaxEffort(value.hesitatesAtMaxEffort ?? null);
      setPainNotes(value.painNotes);
    });
  }, []));

  const sleepNumber = Number(sleep);
  const locationComplete = Boolean(location) && (location !== 'other' || Boolean(otherLocationDetail.trim()));
  const branchComplete = hasLocalizedIssue === false || (hasLocalizedIssue === true && Boolean(sensation) && locationComplete && hesitatesAtMaxEffort !== null);
  const valid = sleepNumber > 0 && sleepNumber <= 24 && sleepQuality > 0 && neuralReadiness > 0 && focus > 0 && fuelHydrated !== null && soreness > 0 && hasLocalizedIssue !== null && branchComplete;

  const draft = useMemo<ReadinessDecision | null>(() => valid ? {
    date: dateKey(),
    status: 'completed',
    sleep: sleepNumber,
    sleepQuality,
    neuralReadiness,
    focus,
    fuelHydrated: fuelHydrated ?? undefined,
    soreness,
    hasLocalizedIssue: hasLocalizedIssue ?? undefined,
    sensation: hasLocalizedIssue ? sensation : undefined,
    location: hasLocalizedIssue ? location : undefined,
    otherLocationDetail: hasLocalizedIssue && location === 'other' ? otherLocationDetail.trim() : undefined,
    hesitatesAtMaxEffort: hasLocalizedIssue ? (hesitatesAtMaxEffort ?? undefined) : undefined,
    painNotes: hasLocalizedIssue ? painNotes : '',
  } : null, [valid, sleepNumber, sleepQuality, neuralReadiness, focus, fuelHydrated, soreness, hasLocalizedIssue, sensation, location, otherLocationDetail, hesitatesAtMaxEffort, painNotes]);

  const evaluation = useMemo(() => draft ? evaluateReadiness(draft) : null, [draft]);
  const save = async () => {
    if (!draft || !evaluation) return;
    await saveReadiness({
      ...draft,
      readinessLevel: evaluation.level,
      readinessReasons: evaluation.reasons,
      readinessGuidance: evaluation.guidance,
    });
    router.back();
  };
  const skip = async () => {
    await saveReadiness({ date: dateKey(), status: 'skipped', painNotes: '' });
    router.back();
  };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
    <Eyebrow>Before training</Eyebrow>
    <ScreenTitle subtitle="A quick sprint-specific check for recovery and warning signs—not a diagnosis or medical clearance.">Readiness check-in</ScreenTitle>

    <View style={styles.partHead}><Text style={styles.partNumber}>1</Text><View><Text style={styles.partTitle}>Recovery baseline</Text><Text style={styles.partCopy}>Sleep, explosive energy, focus, and fuel.</Text></View></View>
    <Card style={styles.formCard}>
      <View><Text style={styles.label}>Sleep duration</Text><Text style={styles.hint}>How many hours did you sleep last night? Enter 0–24; halves such as 7.5 are okay.</Text><TextInput value={sleep} onChangeText={value => setSleep(cleanSleep(value))} keyboardType="decimal-pad" placeholder="Hours, e.g. 7.5" placeholderTextColor="#647382" style={[styles.input, { marginTop: 10 }]} /></View>
      <View style={styles.field}><Text style={styles.label}>Sleep quality · {sleepQuality ? `${sleepQuality}/5` : 'not answered'}</Text><Text style={styles.hint}>1 = tossed and turned · 5 = deep sleep</Text><Scale value={sleepQuality} max={5} onChange={setSleepQuality} /></View>
      <View style={styles.field}><Text style={styles.label}>Explosive readiness · {neuralReadiness ? `${neuralReadiness}/10` : 'not answered'}</Text><Text style={styles.hint}>How snappy and powerful do your legs feel? 1 = heavy / dead legs · 10 = explosive / fully charged.</Text><Scale value={neuralReadiness} max={10} onChange={setNeuralReadiness} /></View>
      <View style={styles.field}><Text style={styles.label}>Mental focus · {focus ? `${focus}/5` : 'not answered'}</Text><Text style={styles.hint}>1 = distracted · 5 = fully locked in</Text><Scale value={focus} max={5} onChange={setFocus} /></View>
      <View style={styles.field}><Text style={styles.label}>Fuel and hydration</Text><Text style={styles.hint}>Have you eaten and had enough water today?</Text><Choice value={fuelHydrated} onChange={setFuelHydrated} options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]} /></View>
    </Card>

    <View style={styles.partHead}><Text style={styles.partNumber}>2</Text><View><Text style={styles.partTitle}>Body status</Text><Text style={styles.partCopy}>Review soreness, tightness, and localized pain.</Text></View></View>
    <Card style={styles.formCard}>
      <View><Text style={styles.label}>General training soreness · {soreness ? `${soreness}/5` : 'not answered'}</Text><Text style={styles.hint}>1 = none · 5 = severe</Text><Scale value={soreness} max={5} onChange={setSoreness} /></View>
      <View style={styles.field}><Text style={styles.label}>Localized tightness, pulling, or pain?</Text><Text style={styles.hint}>Hamstring, calf, shin, hip, foot, or another specific area.</Text><Choice value={hasLocalizedIssue} onChange={value => { setHasLocalizedIssue(value); if (!value) { setSensation(undefined); setLocation(undefined); setOtherLocationDetail(''); setHesitatesAtMaxEffort(null); setPainNotes(''); } }} options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]} /></View>
    </Card>

    {hasLocalizedIssue ? <Card style={styles.branchCard}>
      <Eyebrow>Required follow-up</Eyebrow>
      <View style={styles.field}><Text style={styles.label}>How would you describe it?</Text><Choice value={sensation} onChange={setSensation} options={[
        { value: 'minor-tightness', label: sensationLabels['minor-tightness'], detail: 'Tight or stiff and may ease during warm-up.' },
        { value: 'lingering-niggle', label: sensationLabels['lingering-niggle'], detail: 'Persistent pulling that is noticeable when accelerating.' },
        { value: 'severe-acute', label: sensationLabels['severe-acute'], detail: 'Sharp pain, pain walking, or pain pushing off.' },
      ]} /></View>
      <View style={styles.field}><Text style={styles.label}>Where is it?</Text><Choice value={location} onChange={value => { setLocation(value); if (value !== 'other') setOtherLocationDetail(''); }} options={(Object.entries(locationLabels) as [ReadinessLocation, string][]).map(([value, label]) => ({ value, label }))} /></View>
      {location === 'other' ? <View style={styles.field}><Text style={styles.label}>Specific area · required</Text><Text style={styles.hint}>Name the exact area so the entry is useful later.</Text><TextInput value={otherLocationDetail} onChangeText={setOtherLocationDetail} placeholder="Example: left adductor near the groin" placeholderTextColor="#647382" style={[styles.input, { marginTop: 10 }]} /></View> : null}
      <View style={styles.field}><Text style={styles.label}>Would you hesitate at 100% speed?</Text><Text style={styles.hint}>Would this make you hold back or change how you sprint?</Text><Choice value={hesitatesAtMaxEffort} onChange={setHesitatesAtMaxEffort} options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]} /></View>
      <View style={styles.field}><Text style={styles.label}>Optional note</Text><TextInput value={painNotes} onChangeText={setPainNotes} multiline placeholder="Side, exact spot, when you notice it…" placeholderTextColor="#647382" style={[styles.input, styles.notes]} /></View>
    </Card> : null}

    <View style={styles.partHead}><Text style={styles.partNumber}>3</Text><View><Text style={styles.partTitle}>Today’s decision</Text><Text style={styles.partCopy}>Complete every required answer to reveal it.</Text></View></View>
    {evaluation ? <Card style={{ ...styles.resultCard, borderColor: levelColors[evaluation.level], backgroundColor: levelBackgrounds[evaluation.level] }}>
      <View style={styles.resultHead}><View style={[styles.signal, { backgroundColor: levelColors[evaluation.level] }]} /><View style={{ flex: 1 }}><Text style={[styles.resultLevel, { color: levelColors[evaluation.level] }]}>{evaluation.label}</Text><Text style={styles.resultTitle}>{readinessLevelMeta[evaluation.level].shortLabel}</Text></View></View>
      <View style={styles.reasonList}>{evaluation.reasons.map(reason => <View key={reason} style={styles.reasonRow}><Text style={[styles.reasonDot, { color: levelColors[evaluation.level] }]}>•</Text><Text style={styles.reasonText}>{reason}</Text></View>)}</View>
      <Text style={styles.guidance}>{evaluation.guidance}</Text>
    </Card> : <Card style={styles.resultEmpty}><MaterialIcons name="fact-check" size={24} color={palette.muted} /><Text style={styles.resultEmptyText}>Your readiness signal and exact reasons will appear here.</Text></Card>}

    <PrimaryButton title={evaluation ? `Save ${evaluation.label.toLowerCase()} result` : 'Complete the check-in above'} onPress={save} disabled={!evaluation} />
    <Text style={styles.disclaimer}>This tool flags answers for discussion. It cannot diagnose an injury or guarantee that sprinting is safe.</Text>

    <View style={styles.skipWrap}><Text style={styles.skipHint}>Complete this check-in before training, or skip it for today.</Text>{confirmSkip ? <Card style={styles.skipConfirm}><Text style={styles.skipConfirmTitle}>Skip today’s check-in?</Text><Text style={styles.skipConfirmCopy}>You can begin the session without recording readiness details.</Text><View style={styles.skipActions}><Pressable onPress={() => setConfirmSkip(false)} style={styles.keepButton}><Text style={styles.keepText}>Go back</Text></Pressable><Pressable onPress={skip} style={styles.confirmButton}><Text style={styles.confirmText}>Yes, skip today</Text></Pressable></View></Card> : <Pressable onPress={() => setConfirmSkip(true)} style={styles.skipButton}><Text style={styles.skipText}>Skip check-in for today</Text></Pressable>}</View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 6 },
  partNumber: { width: 30, height: 30, borderRadius: 15, textAlign: 'center', textAlignVertical: 'center', lineHeight: 30, color: '#0B1000', backgroundColor: palette.accent, fontSize: 14, fontWeight: '900' },
  partTitle: { color: palette.text, fontSize: 17, fontWeight: '900' },
  partCopy: { color: palette.muted, fontSize: 12, marginTop: 2 },
  formCard: { gap: 20 },
  branchCard: { gap: 4, borderColor: '#59411F' },
  field: { paddingTop: 18, borderTopWidth: 1, borderTopColor: palette.border },
  label: { color: palette.text, fontWeight: '800', fontSize: 14, marginBottom: 5 },
  hint: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  input: { backgroundColor: palette.surface2, borderColor: palette.border, borderWidth: 1, borderRadius: 13, minHeight: 52, color: palette.text, paddingHorizontal: 14, fontSize: 16 },
  notes: { minHeight: 88, paddingTop: 14, marginTop: 10, textAlignVertical: 'top' },
  scale: { flexDirection: 'row', gap: 5, marginTop: 12 },
  scaleItem: { flex: 1, height: 36, minWidth: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface2 },
  scaleActive: { backgroundColor: palette.accent },
  scaleText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  scaleTextActive: { color: '#0B1000' },
  choiceList: { gap: 8, marginTop: 12 },
  choice: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  choiceSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  choiceDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: palette.muted },
  choiceDotSelected: { borderColor: palette.accent, backgroundColor: palette.accent },
  choiceLabel: { color: palette.text, fontSize: 13, fontWeight: '800' },
  choiceLabelSelected: { color: palette.accent },
  choiceDetail: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  resultCard: { gap: 14, borderWidth: 1.5 },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signal: { width: 16, height: 16, borderRadius: 8 },
  resultLevel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  resultTitle: { color: palette.text, fontSize: 21, fontWeight: '900', marginTop: 2 },
  reasonList: { gap: 7 },
  reasonRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  reasonDot: { fontSize: 18, lineHeight: 18, fontWeight: '900' },
  reasonText: { flex: 1, color: palette.text, fontSize: 13, lineHeight: 18 },
  guidance: { color: palette.muted, fontSize: 12, lineHeight: 18, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 },
  resultEmpty: { flexDirection: 'row', alignItems: 'center', gap: 12, borderStyle: 'dashed' },
  resultEmptyText: { flex: 1, color: palette.muted, fontSize: 13, lineHeight: 18 },
  disclaimer: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8 },
  skipWrap: { alignItems: 'center', gap: 8, marginTop: 2 },
  skipHint: { color: palette.muted, fontSize: 11, textAlign: 'center' },
  skipButton: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: palette.muted, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  skipConfirm: { width: '100%', gap: 8, borderColor: '#553032' },
  skipConfirmTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  skipConfirmCopy: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  skipActions: { flexDirection: 'row', gap: 8, marginTop: 3 },
  keepButton: { flex: 1, minHeight: 42, borderRadius: 11, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  keepText: { color: palette.text, fontSize: 12, fontWeight: '900' },
  confirmButton: { flex: 1, minHeight: 42, borderRadius: 11, backgroundColor: '#301719', alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: palette.red, fontSize: 12, fontWeight: '900' },
});
