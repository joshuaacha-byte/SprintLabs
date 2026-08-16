import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { AthleteProfile } from '@/types';
import { buildDeterministicWeeklyPlan } from '@/utils/plan-selector';
import { getLibraryWorkouts } from '@/utils/workout-library';

// SprintLab plan-build step (onboarding step 16), TEMPORARY native-safety placeholder.
//
// The previous implementation of this screen (an SVG + Reanimated circular instrument
// translated from an approved Figma Make prototype) is suspected of crashing the app on a
// physical iPhone specifically at this point in onboarding. This placeholder intentionally
// uses only View/Text/Pressable — no react-native-svg, no react-native-reanimated, no
// gradients, no custom animation — so a native crash test can isolate whether the failure is
// in that visual implementation or in the surrounding onboarding step logic itself.
//
// The real generation gate is unchanged: buildDeterministicWeeklyPlan actually runs against
// the saved profile + Workout Library, and "Continue" only appears once that real result has
// landed — this never fakes completion on a timer.
//
// Do not build the approved Figma visual back on top of this file until native stability is
// confirmed. The Figma reference project is untouched at
// /Users/joshuaacha/Downloads/sprintlab figma/ for that later pass.

export function PlanBuildStep({ profile, onReady }: { profile: AthleteProfile; onReady: () => void }) {
  const palette = useTheme();
  const styles = createStyles(palette);
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOutcome('pending');
    getLibraryWorkouts()
      .then(library => {
        if (cancelled) return;
        buildDeterministicWeeklyPlan(profile, library);
        setOutcome('ready');
      })
      .catch(() => { if (!cancelled) setOutcome('failed'); });
    return () => { cancelled = true; };
  }, [attempt, profile]);

  const retry = () => {
    setContinuing(false);
    setAttempt(current => current + 1);
  };

  const continueToWeek = () => {
    if (continuing) return; // guards against a fast double-tap firing onReady twice and skipping a step
    setContinuing(true);
    onReady();
  };

  return <View style={styles.screen}>
    <Text style={styles.eyebrow}>BUILDING YOUR PLAN</Text>

    {outcome === 'pending' ? (
      <Text style={styles.status}>Building your plan…</Text>
    ) : outcome === 'failed' ? (
      <>
        <Text style={styles.status}>We couldn’t finish your plan.</Text>
        <Text style={styles.subStatus}>Your answers are saved. You can try again.</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </>
    ) : (
      <>
        <Text style={styles.status}>Your plan is ready.</Text>
        <Pressable accessibilityRole="button" disabled={continuing} onPress={continueToWeek} style={styles.button}>
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </>
    )}
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  eyebrow: { color: palette.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  status: { color: palette.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  subStatus: { color: palette.muted, fontSize: 13, textAlign: 'center' },
  button: { minHeight: 52, minWidth: 160, borderRadius: 14, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, marginTop: 8 },
  buttonText: { color: '#0A0E07', fontSize: 16, fontWeight: '900' },
});
