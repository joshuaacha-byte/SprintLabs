import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SplitMoment } from '@/components/split-moment';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { Palette, useTheme } from '@/constants/sprintlab';
import { error, success, tap } from '@/utils/haptics';
import type { AthleteProfile, LibraryWorkout, LibraryWorkoutCategory, WeekdayIndex } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { buildDeterministicWeeklyPlan, blockedWeekdayReasons, type WeeklyPlanSuggestion } from '@/utils/plan-selector';
import { getCompletedWorkoutSessions, hasSavedWeekSchedule, saveWeekSchedule } from '@/utils/storage';
import { getLibraryWorkouts } from '@/utils/workout-library';
import { syncWorkoutReminders } from '@/utils/workout-reminders';
import { hasSeenSprintLabIntro, requestSprintLabIntroLaunch } from '@/utils/sprintlab-intro';
import { WORKOUT_ICON_FALLBACK } from '@/utils/workout-icons';
import { applyWeeklyProgressionProposal, buildWeeklyProgressionProposal, type WeeklyProgressionProposal } from '@/utils/weekly-progression';

// SprintLab plan preview: a confident reveal of the generated week, not an editing workspace.
// Per-card Edit/Move/More and the per-card "Why this session?" accordion were removed — editing
// an accepted week already lives in the Plan tab after saving. This screen only renders
// `WeeklyPlanSuggestion` from utils/plan-selector — it never derives or mutates the plan itself.

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

const CATEGORY_ICONS: Record<LibraryWorkoutCategory, MaterialIconName> = {
  acceleration: 'directions-run',
  starts: 'rocket-launch',
  'resisted-sprinting': 'directions-run',
  'assisted-sprint-exposure': 'directions-run',
  'multidirectional-acceleration': 'directions-run',
  deceleration: 'directions-run',
  'change-of-direction': 'directions-run',
  'reactive-agility': 'directions-run',
  'explosive-power': 'directions-run',
  'combine-preparation': 'directions-run',
  'maximum-velocity': 'bolt',
  'speed-endurance': 'stadium',
  'special-endurance': 'stadium',
  'repeated-sprint-ability': 'stadium',
  'tempo-recovery': 'speed',
  'field-conditioning': 'speed',
  'game-day-preparation': 'speed',
  strength: 'fitness-center',
  plyometrics: 'sports-gymnastics',
  'core-bodyweight': 'sports-gymnastics',
  'sport-practice-recovery': 'self-improvement',
  testing: 'flag',
  'meet-preparation': 'flag',
  'court-speed': 'sports',
};

export default function PlanPreviewScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { width } = useWindowDimensions();
  const useTwoColumns = width >= 1040;
  const [workouts, setWorkouts] = useState<LibraryWorkout[]>([]);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [result, setResult] = useState<WeeklyPlanSuggestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [progression, setProgression] = useState<WeeklyProgressionProposal | null>(null);
  const [replacingExistingWeek, setReplacingExistingWeek] = useState(false);
  const [completedSessionCount, setCompletedSessionCount] = useState(0);
  const [whyWeekOpen, setWhyWeekOpen] = useState(false);

  useEffect(() => {
    void Promise.all([getAthleteProfile(), getLibraryWorkouts(), getCompletedWorkoutSessions(), hasSavedWeekSchedule()]).then(([profile, library, sessions, hasWeek]) => {
      setReplacingExistingWeek(hasWeek);
      setCompletedSessionCount(sessions.length);
      setWorkouts(library);
      if (!profile) {
        router.replace('/profile');
        return;
      }
      setProfile(profile);
      const baseline = buildDeterministicWeeklyPlan(profile, library);
      const proposal = buildWeeklyProgressionProposal(sessions);
      const shouldApply = baseline.status === 'ready' && (proposal.kind === 'reduce' || proposal.kind === 'progress-one');
      setResult(shouldApply ? applyWeeklyProgressionProposal(baseline, proposal, library) : baseline);
      setProgression(proposal);
    });
  }, [router]);

  const save = () => {
    if (!result || result.status !== 'ready') return;
    Alert.alert(
      replacingExistingWeek ? 'Replace the current training week?' : 'Save this training week?',
      replacingExistingWeek
        ? 'The reviewed suggestion will replace your current recurring Monday–Sunday plan. Existing History and completed workouts will not change.'
        : 'The reviewed suggestion will become your recurring Monday–Sunday plan. You can edit it at any time.',
      [
        { text: replacingExistingWeek ? 'Keep current plan' : 'Not yet', style: 'cancel' },
        {
          text: 'Save suggested week',
          onPress: async () => {
            try {
              setSaving(true);
              await saveWeekSchedule(result.schedule);
              await syncWorkoutReminders({ profile, schedule: result.schedule });
              success();
              // First plan ever saved (no prior saved week schedule) and the tour has never run —
              // this is precisely the "onboarding → first personalized plan generated" moment the
              // tour is for. Any later regenerate/replace (replacingExistingWeek) never re-fires
              // it, so an existing athlete's normal plan-rebuild flow is unaffected.
              const shouldIntroduceTour = !replacingExistingWeek && !(await hasSeenSprintLabIntro());
              if (shouldIntroduceTour) {
                await requestSprintLabIntroLaunch();
                router.replace('/');
              } else {
                router.replace('/plan');
              }
            } catch {
              setSaving(false);
              error();
              Alert.alert('Could not save this week', 'Your preview is still here. Please try again.');
            }
          },
        },
      ],
    );
  };

  const blocked = profile ? blockedWeekdayReasons(profile) : new Map<WeekdayIndex, string[]>();
  const ready = result?.status === 'ready' ? result : null;
  const highDays = ready?.suggestions.filter(item => item.loadClass === 'high').length ?? 0;
  const supportDays = (ready?.suggestions.length ?? 0) - highDays;
  const pathwayLabel = profile ? getPathwayLabel(profile) : '';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.page, ready && styles.pageWithStickySave]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close plan preview" onPress={() => { tap(); router.back(); }} style={styles.iconButton}>
            <MaterialIcons name="close" color={palette.text} size={22} />
          </Pressable>
          <Eyebrow>Plan preview</Eyebrow>
        </View>

        {!result ? (
          <Card><Text style={styles.loading}>Matching your profile with reviewed library workouts…</Text></Card>
        ) : result.status !== 'ready' ? (
          <>
            <ScreenTitle subtitle={result.message}>{result.title}</ScreenTitle>
            <SplitMoment
              title={result.status === 'coach-managed' ? 'Your plan stays yours.' : 'I won’t make up a workout.'}
              message={result.status === 'coach-managed'
                ? 'Use the existing Plan editor to enter the sessions your coach assigned.'
                : 'Update the missing profile or access details, then check again.'}
              pose={result.status === 'coach-managed' ? 'calm' : 'focused'}
            />
            <Card style={styles.reasonCard}>
              {result.reasons.map(reason => <Bullet key={reason}>{reason}</Bullet>)}
            </Card>
            <PrimaryButton
              title={result.status === 'coach-managed' ? 'Open my current plan' : 'Edit athlete profile'}
              onPress={() => { tap(); router.replace(result.status === 'coach-managed' ? '/plan' : '/settings'); }}
            />
          </>
        ) : (
          <>
            <ScreenTitle subtitle="Review your week, then save it to lock in your plan.">
              Your suggested training week
            </ScreenTitle>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCell}>
                <MaterialIcons name="calendar-month" size={18} color={palette.text} />
                <Text style={styles.summaryValue}>{result.suggestions.length} <Text style={styles.summaryLabel}>Training Days</Text></Text>
              </View>
              <View style={styles.summaryCell}>
                <MaterialIcons name="bolt" size={18} color={palette.accent} />
                <Text style={styles.summaryValue}>{highDays} <Text style={styles.summaryLabel}>Speed Days</Text></Text>
              </View>
              <View style={styles.summaryCell}>
                <MaterialIcons name="shield" size={18} color={palette.text} />
                <Text style={styles.summaryValue}>{supportDays} <Text style={styles.summaryLabel}>Support Days</Text></Text>
              </View>
              {pathwayLabel ? <View style={[styles.summaryCell, styles.summaryCellWide]}>
                <MaterialIcons name="stadium" size={18} color={palette.text} />
                <Text style={styles.summaryValueText}>{pathwayLabel}</Text>
              </View> : null}
            </View>

            <View style={styles.week}>
              {result.schedule.map(day => {
                const suggestion = result.suggestions.find(item => item.dayIndex === day.dayIndex);
                if (!suggestion || day.kind === 'rest') {
                  const protectedReasons = blocked.get(day.dayIndex) ?? [];
                  const title = day.restTitle || (protectedReasons.length ? 'Protected day' : 'Open day');
                  const note = protectedReasons.join(' · ') || day.restNote || 'Available for practice, competition, or recovery';
                  return <Card
                    key={day.dayIndex}
                    style={{
                      ...styles.restCard,
                      ...(useTwoColumns ? styles.dayCardWide : {}),
                    }}>
                    <Text style={styles.dayDate}>{day.shortLabel.toUpperCase()} · {dateLabel(day.dayIndex)}</Text>
                    <Text style={styles.restTitle}>{title}</Text>
                    <Text style={styles.restNote}>{note}</Text>
                  </Card>;
                }
                const supportWorkouts = suggestion.supportWorkoutIds
                  .map(id => workouts.find(item => item.id === id))
                  .filter((item): item is LibraryWorkout => Boolean(item));
                const pairedStrength = supportWorkouts.map(item => item.name).join(' · ');
                const chip = loadChip(suggestion.loadClass, palette);
                return (
                  <Card
                    key={`${suggestion.dayIndex}:${suggestion.workoutId}:${suggestion.plannedWorkout.id}`}
                    style={{
                      ...styles.dayCard,
                      ...(useTwoColumns ? styles.dayCardWide : {}),
                    }}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.dayDate}>{day.shortLabel.toUpperCase()} · {dateLabel(day.dayIndex)}</Text>
                      <View style={[styles.chip, { borderColor: chip.color }]}><Text style={[styles.chipText, { color: chip.color }]}>{chip.label}</Text></View>
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.typeIcon}>
                        <MaterialIcons name={CATEGORY_ICONS[suggestion.targetCategory] ?? WORKOUT_ICON_FALLBACK} size={20} color={palette.accent} />
                      </View>
                      <View style={styles.cardBodyText}>
                        <Text numberOfLines={3} style={styles.workoutName}>{suggestion.plannedWorkout.title}</Text>
                        <View style={styles.metaRow}>
                          <Text style={styles.workoutMeta}>{suggestion.weeklyRole}</Text>
                          <View style={styles.metaDot} />
                          <MaterialIcons name="schedule" size={12} color={palette.muted} />
                          <Text style={styles.workoutMeta}>{suggestion.plannedWorkout.durationMinutes} min</Text>
                        </View>
                      </View>
                    </View>
                    {pairedStrength ? <View style={styles.pairedRow}>
                      <MaterialIcons name="link" size={13} color={palette.muted} />
                      <Text style={styles.pairedText}>Paired with {pairedStrength}</Text>
                    </View> : null}
                  </Card>
                );
              })}
            </View>

            <Card style={styles.whyWeekCard}>
              <Pressable onPress={() => { tap(); setWhyWeekOpen(current => !current); }} style={styles.whyWeekHead}>
                <Text style={styles.whyWeekTitle}>Why this week?</Text>
                <MaterialIcons name={whyWeekOpen ? 'expand-less' : 'expand-more'} size={20} color={palette.muted} />
              </Pressable>
              {whyWeekOpen ? <View style={styles.whyWeekBody}>
                <Bullet>High-intensity sessions are separated by lower-output or open days.</Bullet>
                <Bullet>Strength is paired with demanding sprint sessions.</Bullet>
                {profile?.preferredRestDayAnswered ? <Bullet>Your preferred rest day remains open.</Bullet> : null}
                {blocked.size ? <Bullet>Practices, competitions, and schedule constraints were protected.</Bullet> : null}
                {completedSessionCount === 0
                  ? <Text style={styles.startingWeek}>This is your starting week. Future weeks can adjust using your completed training and feedback.</Text>
                  : progression
                    ? <View style={styles.progressionCompact}>
                        <Text style={styles.progressionTitle}>{progression.title}</Text>
                        <Text style={styles.progressionCopy}>{progression.explanation}</Text>
                      </View>
                    : null}
              </View> : null}
            </Card>
            <Text style={styles.safetyNote}>SprintLab organizes training and does not diagnose injuries or replace qualified coaching.</Text>
          </>
        )}
      </ScrollView>
      {ready ? <View style={styles.stickySave}>
        <View style={styles.stickySaveInner}>
          <PrimaryButton title={saving ? 'Saving…' : 'Save this week'} onPress={save} disabled={saving} />
          {replacingExistingWeek ? <Pressable onPress={() => { tap(); router.back(); }} style={styles.keepButton}>
            <Text style={styles.keepText}>Keep my current plan</Text>
          </Pressable> : null}
        </View>
      </View> : null}
    </SafeAreaView>
  );
}

function dateLabel(dayIndex: WeekdayIndex) {
  const today = new Date();
  const date = new Date(today);
  date.setDate(today.getDate() - today.getDay() + dayIndex);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

function loadChip(loadClass: 'high' | 'low' | 'moderate', palette: Palette): { label: string; color: string } {
  if (loadClass === 'high') return { label: 'HIGH', color: palette.accent };
  if (loadClass === 'low') return { label: 'SUPPORT', color: palette.muted };
  return { label: 'MODERATE', color: palette.muted };
}

function getPathwayLabel(profile: AthleteProfile) {
  const sport = profile.primarySport ?? profile.sport;
  if (sport === 'football') return '40-yard pathway';
  if (sport !== 'track-and-field') return 'General speed pathway';
  if (profile.primaryEvent === '200m' || profile.primaryEvent === '400m') return '200m / 400m pathway';
  return '60m / 100m pathway';
}

function Bullet({ children }: { children: React.ReactNode }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.bulletRow}><Text style={styles.bullet}>•</Text><Text style={styles.bulletText}>{children}</Text></View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, paddingBottom: 44, gap: 16 },
  pageWithStickySave: { maxWidth: 1120, paddingBottom: 150 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  loading: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  reasonCard: { gap: 8 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCell: { flexGrow: 1, flexBasis: '46%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 13 },
  summaryCellWide: { flexBasis: '100%' },
  summaryValue: { color: palette.text, fontSize: 15, fontWeight: '900' },
  summaryValueText: { flex: 1, color: palette.text, fontSize: 12, fontWeight: '800' },
  summaryLabel: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  progressionTitle: { color: palette.text, fontSize: 14, fontWeight: '900' },
  progressionCopy: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  progressionCompact: { gap: 5, paddingTop: 3 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { color: palette.accent, fontSize: 16, lineHeight: 18, fontWeight: '900' },
  bulletText: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 18 },
  week: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dayCard: { width: '100%', gap: 10, borderColor: palette.border, padding: 15 },
  dayCardWide: { width: '49%' },
  restCard: { width: '100%', minHeight: 96, gap: 5, justifyContent: 'center', borderColor: palette.border, backgroundColor: palette.surface, opacity: 0.85 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayDate: { color: palette.muted, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1 },
  chip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  chipText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  restTitle: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  restNote: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  cardBody: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  typeIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  cardBodyText: { flex: 1, gap: 5 },
  workoutName: { color: palette.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: palette.muted },
  workoutMeta: { color: palette.muted, fontSize: 11, lineHeight: 15, textTransform: 'capitalize' },
  pairedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 9 },
  pairedText: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  whyWeekCard: { gap: 8, borderColor: palette.border, backgroundColor: 'transparent', paddingVertical: 12 },
  whyWeekHead: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  whyWeekTitle: { color: palette.muted, fontSize: 13, fontWeight: '800' },
  whyWeekBody: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 10 },
  startingWeek: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  safetyNote: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 10 },
  stickySave: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: palette.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  stickySaveInner: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: 2 },
  keepButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  keepText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
});
