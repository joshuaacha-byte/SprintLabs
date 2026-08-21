import { PropsWithChildren, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker';
import { Animated, Image, ImageSourcePropType, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Palette, useTheme } from '@/constants/sprintlab';
import { completeStep, hapticSelection, selection, tap } from '@/utils/haptics';

export function OnboardingLayout({
  children,
  welcome = false,
  footer,
  trackLanes = false,
  bare = false,
}: PropsWithChildren<{ welcome?: boolean; footer?: ReactNode; trackLanes?: boolean; bare?: boolean }>) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <SafeAreaView
    edges={['top', 'left', 'right', 'bottom']}
    style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
      {!welcome && !trackLanes && !bare ? <View pointerEvents="none" style={styles.glowLarge} /> : null}
      {!welcome && !trackLanes && !bare ? <View pointerEvents="none" style={styles.glowSmall} /> : null}
      {trackLanes ? <View pointerEvents="none" style={styles.laneArcOuter} /> : null}
      {trackLanes ? <View pointerEvents="none" style={styles.laneArcInner} /> : null}
      <ScrollView
        contentContainerStyle={[styles.page, welcome && styles.welcomePage, bare && styles.barePage, Boolean(footer) && styles.pageWithFooter]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!bare}
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.stickyFooter}>{footer}</View> : null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function OnboardingProgress({ step, total, onBack, stageLabel }: { step: number; total: number; onBack?: () => void; stageLabel?: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.progressRow}>{onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => { tap(); onBack(); }} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable> : <View style={styles.backSpacer} />}<View style={{ flex: 1, gap: 6 }}><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(4, (step / total) * 100)}%` }]} /></View>{stageLabel ? <Text accessibilityLabel={`${stageLabel}, step ${step} of ${total}`} numberOfLines={1} style={styles.stageText}>{stageLabel}</Text> : null}</View></View>;
}

export type SplitPose = 'welcome' | 'listening' | 'focused' | 'calm' | 'celebration';

export const splitImages: Record<SplitPose, ImageSourcePropType> = {
  welcome: require('@/assets/images/onboarding/split-welcome.png'),
  listening: require('@/assets/images/onboarding/split-listening.png'),
  focused: require('@/assets/images/onboarding/split-focused.png'),
  calm: require('@/assets/images/onboarding/split-calm.png'),
  celebration: require('@/assets/images/onboarding/split-celebration.png'),
};

export function SplitGuide({ speech, prominent = false, compact = false, pose = 'listening' }: { speech: string; prominent?: boolean; compact?: boolean; pose?: SplitPose }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver }),
      Animated.timing(rise, { toValue: 0, duration: 260, useNativeDriver }),
    ]).start();
  }, [fade, rise, speech]);
  return <Animated.View style={[styles.guide, compact && styles.guideCompact, prominent && styles.guideProminent, { opacity: fade, transform: [{ translateY: rise }] }]} accessibilityLabel={`Split says: ${speech}`}>
    <Image source={splitImages[pose]} style={[styles.split, compact && styles.splitCompact, prominent && styles.splitProminent]} resizeMode="contain" accessibilityIgnoresInvertColors />
    <SplitSpeechBubble>{speech}</SplitSpeechBubble>
  </Animated.View>;
}

export function SplitSpeechBubble({ children }: PropsWithChildren) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const light = useColorScheme() === 'light';
  return <View style={[styles.bubble, light && styles.bubbleLight]}><Text style={[styles.bubbleText, light && styles.bubbleTextLight]}>{children}</Text></View>;
}

export function SelectableCard({ label, detail, selected, onPress, disabled }: { label: string; detail?: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }} onPress={() => { if (!selected) selection(); onPress(); }} style={({ pressed }) => [styles.selectable, selected && styles.selectableSelected, pressed && !disabled && styles.pressed, disabled && styles.disabled]}><View style={{ flex: 1 }}><Text style={[styles.selectableLabel, selected && styles.selectableLabelSelected]}>{label}</Text>{detail ? <Text style={styles.selectableDetail}>{detail}</Text> : null}</View><View accessibilityElementsHidden style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View></Pressable>;
}

export function MultiSelectCard({ label, detail, selected, onPress, disabled }: React.ComponentProps<typeof SelectableCard>) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} onPress={() => { selection(); onPress(); }} style={({ pressed }) => [styles.selectable, selected && styles.selectableSelected, pressed && !disabled && styles.pressed, disabled && styles.disabled]}><View style={{ flex: 1 }}><Text style={[styles.selectableLabel, selected && styles.selectableLabelSelected]}>{label}</Text>{detail ? <Text style={styles.selectableDetail}>{detail}</Text> : null}</View><View accessibilityElementsHidden style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Text style={styles.checkmark}>✓</Text> : null}</View></Pressable>;
}

export function PrimaryOnboardingButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [styles.primary, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{title}</Text></Pressable>; }
export function SecondaryOnboardingButton({ title, onPress }: { title: string; onPress: () => void }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <Pressable accessibilityRole="button" onPress={() => { tap(); onPress(); }} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>{title}</Text></Pressable>; }

export function UnitToggle({ value, onChange }: { value: 'meters' | 'yards'; onChange: (value: 'meters' | 'yards') => void }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <View style={styles.unitToggle}>{(['meters', 'yards'] as const).map(unit => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: value === unit }} onPress={() => { if (value !== unit) selection(); onChange(unit); }} style={[styles.unit, value === unit && styles.unitActive]}><Text style={[styles.unitText, value === unit && styles.unitTextActive]}>{unit === 'meters' ? 'Meters' : 'Yards'}</Text></Pressable>)}</View>; }

export function PerformanceInput({ value, onChangeText, placeholder, keyboardType = 'decimal-pad', maxLength, textContentType, autoComplete }: { value: string; onChangeText: (text: string) => void; placeholder: string; keyboardType?: 'default' | 'decimal-pad' | 'numeric'; maxLength?: number; textContentType?: TextInputProps['textContentType']; autoComplete?: TextInputProps['autoComplete'] }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [displayValue, setDisplayValue] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDisplayValue(value);
  }, [value]);
  const change = (raw: string) => {
    const next = keyboardType === 'default'
      ? raw
      : keyboardType === 'numeric'
        ? raw.replace(/\D/g, '')
        : raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setDisplayValue(next);
    onChangeText(next);
  };
  return <TextInput
    value={displayValue}
    onChangeText={change}
    onFocus={() => { focused.current = true; }}
    onBlur={() => { focused.current = false; setDisplayValue(value); }}
    placeholder={placeholder}
    placeholderTextColor={palette.muted}
    keyboardType={keyboardType}
    inputMode={keyboardType === 'default' ? 'text' : keyboardType === 'decimal-pad' ? 'decimal' : 'numeric'}
    maxLength={maxLength}
    autoCorrect={keyboardType === 'default'}
    textContentType={textContentType}
    autoComplete={autoComplete}
    style={styles.input}
    accessibilityLabel={placeholder}
  />;
}

export function PerformanceTimeWheel({
  value,
  onChange,
  minimumSeconds,
  maximumSeconds,
  suggestedSeconds,
  label,
  showActions = true,
  showUnit = false,
  hint = 'Scroll seconds and hundredths. This is optional and can be changed later.',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  minimumSeconds: number;
  maximumSeconds: number;
  suggestedSeconds: number;
  label: string;
  showActions?: boolean;
  showUnit?: boolean;
  hint?: string | null;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const minimumWhole = Math.floor(minimumSeconds);
  const maximumWhole = Math.floor(maximumSeconds);
  const startingValue = Math.min(maximumSeconds, Math.max(minimumSeconds, value ?? suggestedSeconds));
  const [whole, setWhole] = useState(Math.floor(startingValue));
  const [hundredths, setHundredths] = useState(Math.round((startingValue % 1) * 100) % 100);
  const wholeOptions = useMemo(
    () => Array.from({ length: maximumWhole - minimumWhole + 1 }, (_, index) => minimumWhole + index),
    [maximumWhole, minimumWhole],
  );
  const hundredthOptions = useMemo(() => {
    const minimumHundredths = whole === minimumWhole
      ? Math.ceil((minimumSeconds - minimumWhole) * 100)
      : 0;
    const maximumHundredths = whole === maximumWhole
      ? Math.floor((maximumSeconds - maximumWhole) * 100)
      : 99;
    return Array.from(
      { length: Math.max(1, maximumHundredths - minimumHundredths + 1) },
      (_, index) => minimumHundredths + index,
    );
  }, [maximumSeconds, maximumWhole, minimumSeconds, minimumWhole, whole]);

  useEffect(() => {
    const next = Math.min(maximumSeconds, Math.max(minimumSeconds, value ?? suggestedSeconds));
    setWhole(Math.floor(next));
    setHundredths(Math.round((next % 1) * 100) % 100);
  }, [maximumSeconds, minimumSeconds, suggestedSeconds, value]);

  const combined = (nextWhole = whole, nextHundredths = hundredths) =>
    Math.min(
      maximumSeconds,
      Math.max(minimumSeconds, Number(`${nextWhole}.${String(nextHundredths).padStart(2, '0')}`)),
    );
  const chooseWhole = (next: number) => {
    const minimumHundredths = next === minimumWhole
      ? Math.ceil((minimumSeconds - minimumWhole) * 100)
      : 0;
    const maximumHundredths = next === maximumWhole
      ? Math.floor((maximumSeconds - maximumWhole) * 100)
      : 99;
    const nextHundredths = Math.min(maximumHundredths, Math.max(minimumHundredths, hundredths));
    setWhole(next);
    setHundredths(nextHundredths);
    onChange(combined(next, nextHundredths));
    hapticSelection();
  };
  const chooseHundredths = (next: number) => {
    setHundredths(next);
    onChange(combined(whole, next));
    hapticSelection();
  };

  return (
    <View style={styles.timeWheelCard}>
      <Text style={styles.timeWheelLabel}>{label}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.timeWheelValue}>
        {value === null ? '—' : `${whole}.${String(hundredths).padStart(2, '0')}`}{showUnit ? ' seconds' : ''}
      </Text>
      <View style={styles.timeWheelRow}>
        <Picker
          accessibilityLabel={`${label} whole seconds`}
          selectedValue={whole}
          onValueChange={chooseWhole}
          style={styles.timeWheelPicker}
          itemStyle={styles.timeWheelPickerItem}
        >
          {wholeOptions.map(option => <Picker.Item key={option} label={String(option)} value={option} />)}
        </Picker>
        <Text style={styles.timeWheelDecimal}>.</Text>
        <Picker
          accessibilityLabel={`${label} hundredths`}
          selectedValue={hundredths}
          onValueChange={chooseHundredths}
          style={styles.timeWheelPicker}
          itemStyle={styles.timeWheelPickerItem}
        >
          {hundredthOptions.map(option => <Picker.Item key={option} label={String(option).padStart(2, '0')} value={option} />)}
        </Picker>
      </View>
      {showActions ? <View style={styles.timeWheelActions}>
        <Pressable accessibilityRole="button" onPress={() => onChange(combined())} style={styles.timeWheelUse}>
          <Text style={styles.timeWheelUseText}>{value === null ? 'Use this time' : 'Selected'}</Text>
        </Pressable>
        {value !== null ? (
          <Pressable accessibilityRole="button" onPress={() => onChange(null)} style={styles.timeWheelClear}>
            <Text style={styles.timeWheelClearText}>I don’t know it yet</Text>
          </Pressable>
        ) : null}
      </View> : null}
      {hint ? <Text style={styles.timeWheelHint}>{hint}</Text> : null}
    </View>
  );
}

export function CommitmentHoldButton({
  onComplete,
  title = 'Hold to commit',
  completedTitle,
  completedHint,
  icon,
  duration = 1300,
  feedback = 'completeStep',
}: {
  onComplete: () => void;
  title?: string;
  completedTitle?: string;
  completedHint?: string;
  icon?: string;
  duration?: number;
  feedback?: 'completeStep' | 'none';
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const progress = useRef(new Animated.Value(0)).current;
  const complete = useRef(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => () => {
    if (completionTimer.current) clearTimeout(completionTimer.current);
  }, []);

  const start = () => {
    if (locked) return;
    complete.current = false;
    setHolding(true);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration, useNativeDriver: false }).start(({ finished }) => {
      if (!finished) return;
      complete.current = true;
      setHolding(false);
      setLocked(true);
      if (feedback === 'completeStep') completeStep();
      if (completedTitle) {
        completionTimer.current = setTimeout(onComplete, completedHint ? 850 : 550);
      } else {
        onComplete();
      }
    });
  };
  const stop = () => {
    if (complete.current || locked) return;
    setHolding(false);
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };
  const active = holding || locked;
  const iconColor = active ? '#080D12' : palette.text;
  return <View style={styles.holdGroup}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={locked ? (completedTitle ?? title) : title}
      accessibilityHint="Press and hold for about one second to complete"
      accessibilityState={{ busy: holding }}
      onPressIn={start}
      onPressOut={stop}
      style={[styles.hold, active && styles.holdActive]}
    >
      {holding ? <Animated.View style={[styles.holdProgressShade, {
        width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
      }]} /> : null}
      {locked
        ? <MaterialIcons name="check" size={24} color={iconColor} />
        : icon
          ? <Text style={[styles.holdIcon, active && styles.holdContentActive]}>{icon}</Text>
          : <MaterialIcons name="timer" size={24} color={iconColor} />}
      <Text style={[styles.holdText, active && styles.holdContentActive]}>{locked ? (completedTitle ?? title) : title}</Text>
    </Pressable>
    {locked && completedHint ? <Text accessibilityLiveRegion="polite" style={styles.holdCompletionHint}>{completedHint}</Text> : null}
  </View>;
}

/**
 * SprintLab Onboarding V3: the single shared primitive behind every auto-advancing single-choice
 * screen (see app/profile.tsx). Tapping an answer shows its selected state immediately (the
 * caller's own selected-card styling), then this schedules the actual navigation a short beat
 * later so the tap reads as acknowledged rather than abrupt. Returns a `schedule` function to
 * call from an option's onPress, plus `pending` (true once a selection is scheduled) so the
 * caller can disable the row of options and prevent a second tap from re-triggering — or
 * skipping ahead an extra screen — during the brief window before navigation fires.
 */
export function useAutoAdvance(delay = 320) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const schedule = (onAdvance: () => void) => {
    if (timer.current) return; // already scheduled — ignore a fast double-tap rather than restacking
    tap();
    setPending(true);
    timer.current = setTimeout(onAdvance, delay);
  };
  return { schedule, pending };
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg, overflow: 'hidden' },
  keyboard: { flex: 1 },
  glowLarge: { position: 'absolute', width: 520, height: 520, borderRadius: 260, backgroundColor: '#1F390B', opacity: 0.27, top: -330, right: -220 },
  glowSmall: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#A7D913', opacity: 0.055, bottom: -150, left: -100 },
  laneArcOuter: { position: 'absolute', width: 520, height: 520, borderRadius: 260, borderWidth: 1, borderColor: palette.accent, opacity: 0.08, top: -335, right: -235 },
  laneArcInner: { position: 'absolute', width: 430, height: 430, borderRadius: 215, borderWidth: 1, borderColor: palette.accent, opacity: 0.055, top: -292, right: -190 },
  page: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 42, gap: 18, flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  pageWithFooter: { paddingBottom: 28 },
  barePage: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: undefined },
  stickyFooter: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.bg },
  welcomePage: { maxWidth: 640, paddingTop: 20, paddingBottom: 28, justifyContent: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, back: { height: 40, width: 40, borderRadius: 20, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }, backSpacer: { width: 40 }, backText: { color: palette.text, fontSize: 32, lineHeight: 35, marginTop: -4 }, track: { height: 7, borderRadius: 4, backgroundColor: palette.surface2, flex: 1, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 4, backgroundColor: palette.accent }, stageText: { color: palette.muted, fontWeight: '700', fontSize: 12 },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 138 }, guideProminent: { flexDirection: 'column', justifyContent: 'center', minHeight: 302 }, split: { width: 132, height: 132 }, splitProminent: { width: 220, height: 220 }, bubble: { flex: 1, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15 }, bubbleText: { color: palette.text, fontWeight: '700', lineHeight: 20, fontSize: 14 },
  guideCompact: { minHeight: 94, gap: 2 },
  splitCompact: { width: 98, height: 98 },
  bubbleLight: { backgroundColor: '#FFFFFF', borderColor: '#AEBBAA' },
  bubbleTextLight: { color: '#101710' },
  selectable: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }, selectableSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark }, selectableLabel: { color: palette.text, fontWeight: '900', fontSize: 15 }, selectableLabelSelected: { color: palette.accent }, selectableDetail: { color: palette.muted, marginTop: 3, fontSize: 12, lineHeight: 17 }, radio: { height: 23, width: 23, borderRadius: 12, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: palette.accent }, radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: palette.accent }, checkbox: { height: 23, width: 23, borderRadius: 6, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { borderColor: palette.accent, backgroundColor: palette.accent }, checkmark: { color: '#0A0E07', fontWeight: '900', fontSize: 16, lineHeight: 18 },
  primary: { backgroundColor: palette.accent, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, primaryText: { color: '#0A0E07', fontWeight: '900', fontSize: 16 }, secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: palette.muted, fontWeight: '800', fontSize: 14 }, pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, disabled: { opacity: 0.42 },
  unitToggle: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 12, backgroundColor: palette.surface2, gap: 3 }, unit: { borderRadius: 9, paddingHorizontal: 15, paddingVertical: 9 }, unitActive: { backgroundColor: palette.accent }, unitText: { color: palette.muted, fontWeight: '800', fontSize: 12 }, unitTextActive: { color: palette.bg }, input: { minHeight: 54, borderRadius: 15, paddingHorizontal: 15, color: palette.text, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, fontSize: 16 },
  timeWheelCard: { gap: 8, borderRadius: 20, padding: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  timeWheelLabel: { color: palette.accent, fontSize: 11, fontWeight: '900', textTransform: 'capitalize', letterSpacing: 1 },
  timeWheelValue: { color: palette.text, fontSize: 44, lineHeight: 52, fontWeight: '900', textAlign: 'center', letterSpacing: -1 },
  timeWheelRow: { minHeight: 138, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  timeWheelPicker: { width: 132, height: 136, color: palette.text, backgroundColor: 'transparent' },
  timeWheelPickerItem: { color: palette.text, fontSize: 27, height: 136 },
  timeWheelDecimal: { color: palette.accent, fontSize: 34, fontWeight: '900', paddingHorizontal: 2 },
  timeWheelActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  timeWheelUse: { minHeight: 42, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16, backgroundColor: palette.accent },
  timeWheelUseText: { color: palette.bg, fontSize: 12, fontWeight: '900' },
  timeWheelClear: { minHeight: 42, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16, backgroundColor: palette.surface2 },
  timeWheelClearText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  timeWheelHint: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  holdGroup: { gap: 8 },
  hold: { minHeight: 68, borderRadius: 20, overflow: 'hidden', backgroundColor: palette.surface2, borderColor: palette.border, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  holdActive: { backgroundColor: '#C9FF18', borderColor: '#C9FF18' },
  holdProgressShade: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8, 13, 18, 0.14)' },
  holdIcon: { color: palette.text, fontSize: 22, fontWeight: '900' },
  holdText: { color: palette.text, fontWeight: '900', fontSize: 15, opacity: 1 },
  holdContentActive: { color: '#080D12', opacity: 1 },
  holdCompletionHint: { color: palette.accent, fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
});
