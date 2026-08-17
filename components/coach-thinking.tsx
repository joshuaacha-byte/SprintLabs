import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { splitImages } from '@/components/onboarding';
import { Palette, useTheme } from '@/constants/sprintlab';

// Replaces a generic ActivityIndicator + "Split is thinking…" line wherever Coach is waiting on
// a real (sometimes slow, up to ~a minute for a demanding request) /api/coach response. The goal
// is to read as "SprintLab is actively working through this," not "the app is frozen" — a small
// breathing Split mark plus three typing-style dots, and status copy that progresses by elapsed
// time rather than any real backend progress signal (Gemini exposes no stage/percentage, so this
// never fakes one). Fully local, no network awareness beyond "still mounted."

const STAGES = [
  { afterMs: 0, label: 'Thinking it through…' },
  { afterMs: 2500, label: 'Reviewing your training…' },
  { afterMs: 7000, label: 'Putting together an answer…' },
  { afterMs: 16000, label: 'Still working — this one’s taking a little longer than usual.' },
] as const;

export function CoachThinkingIndicator() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [stageIndex, setStageIndex] = useState(0);
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setStageIndex(0);
    const timers = STAGES.slice(1).map((stage, index) => setTimeout(() => setStageIndex(index + 1), stage.afterMs));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    // A one-time stagger delay per dot, then a steady equal-period loop — keeping the delay
    // outside the loop (rather than re-applied every cycle) is what keeps the three dots in a
    // stable "wave" phase relative to each other instead of slowly drifting apart over time.
    const dotLoop = (value: Animated.Value, delay: number) => Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.3, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])),
    ]);
    const loops = [dotLoop(dot1, 0), dotLoop(dot2, 140), dotLoop(dot3, 280)];
    const glowLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    [...loops, glowLoop].forEach(loop => loop.start());
    return () => { [...loops, glowLoop].forEach(loop => loop.stop()); };
  }, [dot1, dot2, dot3, pulse]);

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.26] });

  return <View style={styles.row} accessibilityLabel="Split is working on a response" accessibilityLiveRegion="polite">
    <View style={styles.markWrap}>
      <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
      <Image source={splitImages.listening} style={styles.mark} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
    <View style={styles.textCol}>
      <Text style={styles.label}>{STAGES[stageIndex].label}</Text>
      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, { opacity: dot1 }]} />
        <Animated.View style={[styles.dot, { opacity: dot2 }]} />
        <Animated.View style={[styles.dot, { opacity: dot3 }]} />
      </View>
    </View>
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  markWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: palette.accent },
  mark: { width: 26, height: 26 },
  textCol: { gap: 4 },
  label: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  dotsRow: { flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.accent },
});
