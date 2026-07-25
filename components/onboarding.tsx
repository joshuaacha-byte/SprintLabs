import { PropsWithChildren, useEffect, useRef } from 'react';
import { Animated, Image, ImageSourcePropType, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '@/constants/sprintlab';

export function OnboardingLayout({ children }: PropsWithChildren) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView></KeyboardAvoidingView>;
}

export function OnboardingProgress({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return <View style={styles.progressRow}>{onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable> : <View style={styles.backSpacer} />}<View style={styles.track}><View style={[styles.fill, { width: `${Math.max(4, (step / total) * 100)}%` }]} /></View><Text accessibilityLabel={`Step ${step} of ${total}`} style={styles.stepText}>{step}/{total}</Text></View>;
}

export type SplitPose = 'welcome' | 'listening' | 'focused' | 'calm' | 'celebration';

const splitImages: Record<SplitPose, ImageSourcePropType> = {
  welcome: require('@/assets/images/onboarding/split-welcome.png'),
  listening: require('@/assets/images/onboarding/split-listening.png'),
  focused: require('@/assets/images/onboarding/split-focused.png'),
  calm: require('@/assets/images/onboarding/split-calm.png'),
  celebration: require('@/assets/images/onboarding/split-celebration.png'),
};

export function SplitGuide({ speech, prominent = false, pose = 'listening' }: { speech: string; prominent?: boolean; pose?: SplitPose }) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;
  useEffect(() => { Animated.parallel([Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }), Animated.timing(rise, { toValue: 0, duration: 260, useNativeDriver: true })]).start(); }, [fade, rise, speech]);
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

export function PerformanceInput({ value, onChangeText, placeholder, keyboardType = 'decimal-pad' }: { value: string; onChangeText: (text: string) => void; placeholder: string; keyboardType?: 'default' | 'decimal-pad' | 'numeric' }) { return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.muted} keyboardType={keyboardType} style={styles.input} accessibilityLabel={placeholder} />; }

export function CommitmentHoldButton({ onComplete }: { onComplete: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const complete = useRef(false);
  const start = () => { complete.current = false; progress.setValue(0); Animated.timing(progress, { toValue: 1, duration: 1300, useNativeDriver: false }).start(({ finished }) => { if (finished) { complete.current = true; onComplete(); } }); };
  const stop = () => { if (!complete.current) { progress.stopAnimation(); Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: false }).start(); } };
  return <Pressable accessibilityRole="button" accessibilityLabel="Press and hold to commit" onPressIn={start} onPressOut={stop} style={styles.hold}><Animated.View style={[styles.holdFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /><Text style={styles.holdIcon}>◷</Text><Text style={styles.holdText}>Press and hold to commit</Text></Pressable>;
}

export function ProfileRevealCard({ title, children }: PropsWithChildren<{ title: string }>) { return <View style={styles.reveal}><Text style={styles.revealTitle}>{title}</Text>{children}</View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 42, gap: 18, flexGrow: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, back: { height: 40, width: 40, borderRadius: 20, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }, backSpacer: { width: 40 }, backText: { color: palette.text, fontSize: 32, lineHeight: 35, marginTop: -4 }, track: { height: 7, borderRadius: 4, backgroundColor: palette.surface2, flex: 1, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 4, backgroundColor: palette.accent }, stepText: { color: palette.muted, fontWeight: '800', fontSize: 11, width: 32, textAlign: 'right' },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 126 }, guideProminent: { flexDirection: 'column', justifyContent: 'center', minHeight: 282 }, split: { width: 116, height: 116 }, splitProminent: { width: 205, height: 205 }, bubble: { flex: 1, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15 }, bubbleText: { color: palette.text, fontWeight: '700', lineHeight: 20, fontSize: 14 },
  selectable: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }, selectableSelected: { borderColor: palette.accent, backgroundColor: '#18210B' }, selectableLabel: { color: palette.text, fontWeight: '900', fontSize: 15 }, selectableLabelSelected: { color: palette.accent }, selectableDetail: { color: palette.muted, marginTop: 3, fontSize: 12, lineHeight: 17 }, radio: { height: 23, width: 23, borderRadius: 12, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: palette.accent }, radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: palette.accent }, checkbox: { height: 23, width: 23, borderRadius: 6, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { borderColor: palette.accent, backgroundColor: palette.accent }, checkmark: { color: palette.bg, fontWeight: '900', fontSize: 16, lineHeight: 18 },
  primary: { backgroundColor: palette.accent, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, primaryText: { color: '#0A0E07', fontWeight: '900', fontSize: 16 }, secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: palette.muted, fontWeight: '800', fontSize: 14 }, pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, disabled: { opacity: 0.42 },
  unitToggle: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 12, backgroundColor: palette.surface2, gap: 3 }, unit: { borderRadius: 9, paddingHorizontal: 15, paddingVertical: 9 }, unitActive: { backgroundColor: palette.accent }, unitText: { color: palette.muted, fontWeight: '800', fontSize: 12 }, unitTextActive: { color: palette.bg }, input: { minHeight: 54, borderRadius: 15, paddingHorizontal: 15, color: palette.text, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, fontSize: 16 },
  hold: { minHeight: 76, borderRadius: 38, overflow: 'hidden', backgroundColor: palette.surface2, borderColor: palette.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: palette.accent }, holdIcon: { color: palette.text, fontSize: 22, fontWeight: '900' }, holdText: { color: palette.text, fontWeight: '900', fontSize: 15 }, reveal: { gap: 12, backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 18, borderWidth: 1, padding: 16 }, revealTitle: { color: palette.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
});
