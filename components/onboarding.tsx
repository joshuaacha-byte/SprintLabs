import { PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Animated, Image, ImageSourcePropType, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '@/constants/sprintlab';

export function OnboardingLayout({ children }: PropsWithChildren) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
    <View pointerEvents="none" style={styles.glowLarge} />
    <View pointerEvents="none" style={styles.glowSmall} />
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </KeyboardAvoidingView>;
}

export function OnboardingProgress({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return <View style={styles.progressRow}>{onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable> : <View style={styles.backSpacer} />}<View style={styles.track}><View style={[styles.fill, { width: `${Math.max(4, (step / total) * 100)}%` }]} /></View><Text accessibilityLabel={`Step ${step} of ${total}`} style={styles.stepText}>{step}/{total}</Text></View>;
}

export type SplitPose = 'welcome' | 'listening' | 'focused' | 'calm' | 'celebration';

export const splitImages: Record<SplitPose, ImageSourcePropType> = {
  welcome: require('@/assets/images/onboarding/split-welcome.png'),
  listening: require('@/assets/images/onboarding/split-listening.png'),
  focused: require('@/assets/images/onboarding/split-focused.png'),
  calm: require('@/assets/images/onboarding/split-calm.png'),
  celebration: require('@/assets/images/onboarding/split-celebration.png'),
};

export function SplitGuide({ speech, prominent = false, pose = 'listening' }: { speech: string; prominent?: boolean; pose?: SplitPose }) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver }),
      Animated.timing(rise, { toValue: 0, duration: 260, useNativeDriver }),
    ]).start();
  }, [fade, rise, speech]);
  return <Animated.View style={[styles.guide, prominent && styles.guideProminent, { opacity: fade, transform: [{ translateY: rise }] }]} accessibilityLabel={`Split says: ${speech}`}>
    <Image source={splitImages[pose]} style={[styles.split, prominent && styles.splitProminent]} resizeMode="contain" accessibilityIgnoresInvertColors />
    <SplitSpeechBubble>{speech}</SplitSpeechBubble>
  </Animated.View>;
}

export function SplitSpeechBubble({ children }: PropsWithChildren) { return <View style={styles.bubble}><Text style={styles.bubbleText}>{children}</Text></View>; }

export function SelectableCard({ label, detail, selected, onPress, disabled }: { label: string; detail?: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }} onPress={onPress} style={({ pressed }) => [styles.selectable, selected && styles.selectableSelected, pressed && !disabled && styles.pressed, disabled && styles.disabled]}><View style={{ flex: 1 }}><Text style={[styles.selectableLabel, selected && styles.selectableLabelSelected]}>{label}</Text>{detail ? <Text style={styles.selectableDetail}>{detail}</Text> : null}</View><View accessibilityElementsHidden style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View></Pressable>;
}

export function MultiSelectCard({ label, detail, selected, onPress, disabled }: React.ComponentProps<typeof SelectableCard>) {
  return <Pressable disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} onPress={onPress} style={({ pressed }) => [styles.selectable, selected && styles.selectableSelected, pressed && !disabled && styles.pressed, disabled && styles.disabled]}><View style={{ flex: 1 }}><Text style={[styles.selectableLabel, selected && styles.selectableLabelSelected]}>{label}</Text>{detail ? <Text style={styles.selectableDetail}>{detail}</Text> : null}</View><View accessibilityElementsHidden style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Text style={styles.checkmark}>✓</Text> : null}</View></Pressable>;
}

export function PrimaryOnboardingButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primary, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{title}</Text></Pressable>; }
export function SecondaryOnboardingButton({ title, onPress }: { title: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>{title}</Text></Pressable>; }

export function UnitToggle({ value, onChange }: { value: 'meters' | 'yards'; onChange: (value: 'meters' | 'yards') => void }) { return <View style={styles.unitToggle}>{(['meters', 'yards'] as const).map(unit => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: value === unit }} onPress={() => onChange(unit)} style={[styles.unit, value === unit && styles.unitActive]}><Text style={[styles.unitText, value === unit && styles.unitTextActive]}>{unit === 'meters' ? 'Meters' : 'Yards'}</Text></Pressable>)}</View>; }

export function PerformanceInput({ value, onChangeText, placeholder, keyboardType = 'decimal-pad', maxLength }: { value: string; onChangeText: (text: string) => void; placeholder: string; keyboardType?: 'default' | 'decimal-pad' | 'numeric'; maxLength?: number }) {
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
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  minimumSeconds: number;
  maximumSeconds: number;
  suggestedSeconds: number;
  label: string;
}) {
  const startingValue = value ?? suggestedSeconds;
  const [whole, setWhole] = useState(Math.floor(startingValue));
  const [hundredths, setHundredths] = useState(Math.round((startingValue % 1) * 100) % 100);
  const wholeOptions = useMemo(
    () => Array.from({ length: maximumSeconds - minimumSeconds + 1 }, (_, index) => minimumSeconds + index),
    [maximumSeconds, minimumSeconds],
  );
  const hundredthOptions = useMemo(() => Array.from({ length: 100 }, (_, index) => index), []);

  useEffect(() => {
    const next = value ?? suggestedSeconds;
    setWhole(Math.floor(next));
    setHundredths(Math.round((next % 1) * 100) % 100);
  }, [suggestedSeconds, value]);

  const combined = (nextWhole = whole, nextHundredths = hundredths) =>
    Number(`${nextWhole}.${String(nextHundredths).padStart(2, '0')}`);
  const chooseWhole = (next: number) => {
    setWhole(next);
    onChange(combined(next, hundredths));
  };
  const chooseHundredths = (next: number) => {
    setHundredths(next);
    onChange(combined(whole, next));
  };

  return (
    <View style={styles.timeWheelCard}>
      <Text style={styles.timeWheelLabel}>{label}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.timeWheelValue}>
        {whole}.{String(hundredths).padStart(2, '0')}
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
      <View style={styles.timeWheelActions}>
        <Pressable accessibilityRole="button" onPress={() => onChange(combined())} style={styles.timeWheelUse}>
          <Text style={styles.timeWheelUseText}>{value === null ? 'Use this time' : 'Time selected'}</Text>
        </Pressable>
        {value !== null ? (
          <Pressable accessibilityRole="button" onPress={() => onChange(null)} style={styles.timeWheelClear}>
            <Text style={styles.timeWheelClearText}>I don’t know it yet</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.timeWheelHint}>
        Scroll seconds and hundredths. This is optional and can be changed later.
      </Text>
    </View>
  );
}

export function CommitmentHoldButton({ onComplete, title = 'Press and hold to commit', icon = '◷', duration = 1300 }: { onComplete: () => void; title?: string; icon?: string; duration?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const complete = useRef(false);
  const start = () => { complete.current = false; progress.setValue(0); Animated.timing(progress, { toValue: 1, duration, useNativeDriver: false }).start(({ finished }) => { if (finished) { complete.current = true; onComplete(); } }); };
  const stop = () => { if (!complete.current) { progress.stopAnimation(); Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: false }).start(); } };
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPressIn={start} onPressOut={stop} style={styles.hold}><Animated.View style={[styles.holdFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /><Text style={styles.holdIcon}>{icon}</Text><Text style={styles.holdText}>{title}</Text></Pressable>;
}

export function ProfileRevealCard({ title, children }: PropsWithChildren<{ title: string }>) { return <View style={styles.reveal}><Text style={styles.revealTitle}>{title}</Text>{children}</View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg, overflow: 'hidden' },
  glowLarge: { position: 'absolute', width: 520, height: 520, borderRadius: 260, backgroundColor: '#1F390B', opacity: 0.27, top: -330, right: -220 },
  glowSmall: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#A7D913', opacity: 0.055, bottom: -150, left: -100 },
  page: { padding: 20, paddingBottom: 42, gap: 18, flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, back: { height: 40, width: 40, borderRadius: 20, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }, backSpacer: { width: 40 }, backText: { color: palette.text, fontSize: 32, lineHeight: 35, marginTop: -4 }, track: { height: 7, borderRadius: 4, backgroundColor: palette.surface2, flex: 1, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 4, backgroundColor: palette.accent }, stepText: { color: palette.muted, fontWeight: '800', fontSize: 11, width: 32, textAlign: 'right' },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 138 }, guideProminent: { flexDirection: 'column', justifyContent: 'center', minHeight: 302 }, split: { width: 132, height: 132 }, splitProminent: { width: 220, height: 220 }, bubble: { flex: 1, backgroundColor: '#111B23', borderColor: '#2C4150', borderWidth: 1, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15 }, bubbleText: { color: palette.text, fontWeight: '700', lineHeight: 20, fontSize: 14 },
  selectable: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }, selectableSelected: { borderColor: palette.accent, backgroundColor: '#18210B' }, selectableLabel: { color: palette.text, fontWeight: '900', fontSize: 15 }, selectableLabelSelected: { color: palette.accent }, selectableDetail: { color: palette.muted, marginTop: 3, fontSize: 12, lineHeight: 17 }, radio: { height: 23, width: 23, borderRadius: 12, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: palette.accent }, radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: palette.accent }, checkbox: { height: 23, width: 23, borderRadius: 6, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { borderColor: palette.accent, backgroundColor: palette.accent }, checkmark: { color: palette.bg, fontWeight: '900', fontSize: 16, lineHeight: 18 },
  primary: { backgroundColor: palette.accent, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, primaryText: { color: '#0A0E07', fontWeight: '900', fontSize: 16 }, secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: palette.muted, fontWeight: '800', fontSize: 14 }, pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, disabled: { opacity: 0.42 },
  unitToggle: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 12, backgroundColor: palette.surface2, gap: 3 }, unit: { borderRadius: 9, paddingHorizontal: 15, paddingVertical: 9 }, unitActive: { backgroundColor: palette.accent }, unitText: { color: palette.muted, fontWeight: '800', fontSize: 12 }, unitTextActive: { color: palette.bg }, input: { minHeight: 54, borderRadius: 15, paddingHorizontal: 15, color: palette.text, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, fontSize: 16 },
  timeWheelCard: { gap: 8, borderRadius: 20, padding: 14, backgroundColor: '#10150D', borderWidth: 1, borderColor: '#41551A', overflow: 'hidden' },
  timeWheelLabel: { color: palette.accent, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
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
  hold: { minHeight: 76, borderRadius: 38, overflow: 'hidden', backgroundColor: palette.surface2, borderColor: palette.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: palette.accent }, holdIcon: { color: palette.text, fontSize: 22, fontWeight: '900' }, holdText: { color: palette.text, fontWeight: '900', fontSize: 15 }, reveal: { gap: 12, backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 18, borderWidth: 1, padding: 16 }, revealTitle: { color: palette.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
});
