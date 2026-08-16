import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SplitMoment } from '@/components/split-moment';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { Palette, useTheme } from '@/constants/sprintlab';
import { completeStep, error, success, tap, warning } from '@/utils/haptics';
import type { AthleteProfile, LibraryWorkout, PlannedWorkout, WeekdayIndex } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import {
  buildDeterministicWeeklyPlan,
  blockedWeekdayReasons,
  moveSuggestedWorkout,
  removeSuggestedWorkout,
  replaceSuggestedWorkout,
  updateSuggestedWorkout,
  type WeeklyPlanSuggestion,
} from '@/utils/plan-selector';
import { getCompletedWorkoutSessions, hasSavedWeekSchedule, saveWeekSchedule } from '@/utils/storage';
import { getLibraryWorkouts } from '@/utils/workout-library';
import { syncWorkoutReminders } from '@/utils/workout-reminders';
import { applyWeeklyProgressionProposal, buildWeeklyProgressionProposal, type WeeklyProgressionProposal } from '@/utils/weekly-progression';

export default function PlanPreviewScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { width } = useWindowDimensions();
  const useTwoColumns = width >= 1040;
  const [workouts, setWorkouts] = useState<LibraryWorkout[]>([]);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [result, setResult] = useState<WeeklyPlanSuggestion | null>(null);
  const [baselineResult, setBaselineResult] = useState<WeeklyPlanSuggestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingDay, setEditingDay] = useState<WeekdayIndex | null>(null);
  const [movingDay, setMovingDay] = useState<WeekdayIndex | null>(null);
  const [progression, setProgression] = useState<WeeklyProgressionProposal | null>(null);
  const [progressionDecision, setProgressionDecision] = useState<'accepted' | 'declined' | null>(null);
  const [replacingExistingWeek, setReplacingExistingWeek] = useState(false);
  const [completedSessionCount, setCompletedSessionCount] = useState(0);
  const [whyDay, setWhyDay] = useState<WeekdayIndex | null>(null);
  const [moreDay, setMoreDay] = useState<WeekdayIndex | null>(null);
  const [organizationOpen, setOrganizationOpen] = useState(false);

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
      setBaselineResult(baseline);
      setResult(shouldApply ? applyWeeklyProgressionProposal(baseline, proposal, library) : baseline);
      setProgression(proposal);
      setProgressionDecision(shouldApply ? 'accepted' : null);
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
              router.replace('/plan');
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

  const editWorkout = (dayIndex: WeekdayIndex, changes: Partial<PlannedWorkout>) => {
    setResult(current => {
      if (current?.status !== 'ready') return current;
      const suggestion = current.suggestions.find(item => item.dayIndex === dayIndex);
      if (!suggestion) return current;
      return updateSuggestedWorkout(current, dayIndex, { ...suggestion.plannedWorkout, ...changes });
    });
  };

  const removeExercise = (dayIndex: WeekdayIndex, sectionIndex: number, exerciseId: string) => {
    setResult(current => {
      if (current?.status !== 'ready') return current;
      const suggestion = current.suggestions.find(item => item.dayIndex === dayIndex);
      if (!suggestion) return current;
      const sections = suggestion.plannedWorkout.sections.map((section, index) => index === sectionIndex
        ? { ...section, exercises: section.exercises.filter(exercise => exercise.id !== exerciseId) }
        : section);
      return updateSuggestedWorkout(current, dayIndex, { ...suggestion.plannedWorkout, sections });
    });
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
            <ScreenTitle subtitle="Review your week, then edit, move, or swap any session before saving.">
              Suggested training week
            </ScreenTitle>
            <View style={styles.weekSummary}>
              <Text style={styles.weekSummaryPrimary}>
                {result.suggestions.length} training days · {highDays} speed days · {supportDays} support days
              </Text>
              {pathwayLabel ? <Text style={styles.weekSummarySecondary}>{pathwayLabel}</Text> : null}
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
                const isEditing = editingDay === suggestion.dayIndex;
                const isMoving = movingDay === suggestion.dayIndex;
                const isMoreOpen = moreDay === suggestion.dayIndex;
                const isWhyOpen = whyDay === suggestion.dayIndex;
                return (
                  <Card
                    key={`${suggestion.dayIndex}:${suggestion.workoutId}:${suggestion.plannedWorkout.id}`}
                    style={{
                      ...styles.dayCard,
                      ...(useTwoColumns ? styles.dayCardWide : {}),
                    }}>
                    <Text style={styles.dayDate}>{day.shortLabel.toUpperCase()} · {dateLabel(day.dayIndex)}</Text>
                    <Text numberOfLines={3} style={styles.workoutName}>{suggestion.plannedWorkout.title}</Text>
                    <Text style={styles.workoutMeta}>
                      {loadLabel(suggestion.loadClass)} · {suggestion.weeklyRole} · {suggestion.plannedWorkout.durationMinutes} min
                    </Text>
                    {pairedStrength ? <Text style={styles.supportLine}>Paired: {pairedStrength}</Text> : null}
                    <View style={styles.reviewActions}>
                      <Pressable onPress={() => { tap(); setEditingDay(current => current === suggestion.dayIndex ? null : suggestion.dayIndex); }} style={styles.reviewAction}>
                        <MaterialIcons name="edit" size={16} color={palette.text} />
                        <Text style={styles.reviewActionText}>{isEditing ? 'Done' : 'Edit'}</Text>
                      </Pressable>
                      <Pressable onPress={() => { tap(); setMovingDay(current => current === suggestion.dayIndex ? null : suggestion.dayIndex); }} style={styles.reviewAction}>
                        <MaterialIcons name="event" size={16} color={palette.text} />
                        <Text style={styles.reviewActionText}>{isMoving ? 'Close' : 'Move'}</Text>
                      </Pressable>
                      <Pressable onPress={() => { tap(); setMoreDay(current => current === suggestion.dayIndex ? null : suggestion.dayIndex); }} style={styles.reviewAction}>
                        <MaterialIcons name="more-horiz" size={18} color={palette.text} />
                        <Text style={styles.reviewActionText}>More</Text>
                      </Pressable>
                    </View>

                    {editingDay === suggestion.dayIndex ? <View style={styles.editPanel}>
                      <Text style={styles.detailLabel}>Session name</Text>
                      <TextInput value={suggestion.plannedWorkout.title} onChangeText={title => editWorkout(suggestion.dayIndex, { title })} placeholderTextColor={palette.muted} style={styles.editInput} />
                      <Text style={styles.detailLabel}>Purpose</Text>
                      <TextInput value={suggestion.plannedWorkout.purpose} onChangeText={purpose => editWorkout(suggestion.dayIndex, { purpose })} placeholderTextColor={palette.muted} multiline style={[styles.editInput, styles.editPurpose]} />
                      <Text style={styles.detailLabel}>Estimated minutes</Text>
                      <TextInput
                        value={String(suggestion.plannedWorkout.durationMinutes)}
                        onChangeText={value => editWorkout(suggestion.dayIndex, { durationMinutes: Math.min(240, Math.max(1, Number(value.replace(/\D/g, '')) || 1)) })}
                        keyboardType="number-pad"
                        style={styles.editInput}
                      />
                      <Text style={styles.detailLabel}>Planned exercises</Text>
                      {suggestion.plannedWorkout.sections.filter(section => section.exercises.length).map((section, sectionIndex) => <View key={`${section.title}:${sectionIndex}`} style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{section.title}</Text>
                        {section.exercises.map(exercise => <View key={exercise.id} style={styles.editExercise}>
                          <View style={{ flex: 1 }}><Text style={styles.editExerciseName}>{exercise.name}</Text><Text style={styles.editExerciseDetail}>{exercise.detail}</Text></View>
                          <Pressable accessibilityLabel={`Remove ${exercise.name}`} onPress={() => { warning(); removeExercise(suggestion.dayIndex, suggestion.plannedWorkout.sections.indexOf(section), exercise.id); }} style={styles.removeExercise}>
                            <MaterialIcons name="close" size={17} color={palette.red} />
                          </Pressable>
                        </View>)}
                      </View>)}
                      <Text style={styles.editHelp}>You can add or restructure exercises after saving from the Plan editor. Removed items affect only this preview.</Text>
                    </View> : null}

                    {isMoving ? <View style={styles.movePanel}>
                      <Text style={styles.detailLabel}>Move to an open day or swap days</Text>
                      <View style={styles.moveOptions}>
                        {result.schedule.filter(day => day.dayIndex !== suggestion.dayIndex && !blocked.has(day.dayIndex)).map(day => (
                          <Pressable
                            key={day.dayIndex}
                            onPress={() => {
                              completeStep();
                              setResult(current => current?.status === 'ready' ? moveSuggestedWorkout(current, suggestion.dayIndex, day.dayIndex) : current);
                              setMovingDay(null);
                            }}
                            style={styles.moveOption}
                          >
                            <Text style={styles.moveOptionText}>{day.kind === 'workout' ? `Swap with ${day.shortLabel}` : `Move to ${day.shortLabel}`}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View> : null}

                    <Pressable onPress={() => { tap(); setWhyDay(current => current === suggestion.dayIndex ? null : suggestion.dayIndex); }} style={styles.whyToggle}>
                      <Text style={styles.whyToggleText}>Why this session?</Text>
                      <MaterialIcons name={isWhyOpen ? 'expand-less' : 'expand-more'} size={20} color={palette.muted} />
                    </Pressable>
                    {isWhyOpen ? <Text style={styles.whyCopy}>{athleteFacingReason(suggestion.whyThisFits)}</Text> : null}

                    {isMoreOpen ? <View style={styles.morePanel}>
                      {suggestion.alternatives.length ? <>
                        <Text style={styles.detailLabel}>Swap session</Text>
                        <View style={styles.altButtons}>
                          {suggestion.alternatives.map(alternative => (
                            <Pressable
                              key={alternative.workoutId}
                              accessibilityRole="button"
                              onPress={() => {
                                completeStep();
                                setResult(current =>
                                  current?.status === 'ready'
                                    ? replaceSuggestedWorkout(current, suggestion.dayIndex, alternative.workoutId, workouts)
                                    : current);
                              }}
                              style={styles.altButton}>
                              <Text style={styles.altText}>{alternative.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </> : <Text style={styles.moreEmpty}>No compatible swaps are available for this day.</Text>}
                      <Pressable
                        onPress={() => Alert.alert('Remove this session?', `${suggestion.plannedWorkout.title} will become an open day in this preview.`, [
                          { text: 'Keep session', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => { warning(); setResult(current => current?.status === 'ready' ? removeSuggestedWorkout(current, suggestion.dayIndex) : current); } },
                        ])}
                        style={styles.removeSession}
                      >
                        <MaterialIcons name="delete-outline" size={17} color={palette.red} />
                        <Text style={styles.removeSessionText}>Remove from this week</Text>
                      </Pressable>
                    </View> : null}
                  </Card>
                );
              })}
            </View>

            <Card style={styles.organizationCard}>
              <Pressable onPress={() => { tap(); setOrganizationOpen(current => !current); }} style={styles.organizationHead}>
                <Text style={styles.ruleTitle}>How this week was organized</Text>
                <MaterialIcons name={organizationOpen ? 'expand-less' : 'expand-more'} size={22} color={palette.muted} />
              </Pressable>
              {organizationOpen ? <View style={styles.organizationBody}>
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
                        {progressionDecision === 'accepted' && baselineResult?.status === 'ready' ? <Pressable onPress={() => {
                          completeStep();
                          setResult(baselineResult);
                          setProgressionDecision('declined');
                        }} style={styles.progressionKeep}><Text style={styles.progressionKeepText}>Undo this adjustment</Text></Pressable> : null}
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

function loadLabel(loadClass: 'high' | 'low' | 'moderate') {
  if (loadClass === 'high') return 'High';
  if (loadClass === 'low') return 'Low';
  return 'Moderate';
}

function athleteFacingReason(reasons: string[]) {
  const concise = reasons
    .filter(Boolean)
    .slice(0, 2)
    .map(reason => reason.trim().replace(/\.$/, ''));
  return concise.length ? `${concise.join('. ')}.` : 'This session fills the intended training role while preserving the rhythm of your week.';
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
  weekSummary: { gap: 4, paddingVertical: 4 },
  weekSummaryPrimary: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  weekSummarySecondary: { color: palette.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  progressionTitle: { color: palette.text, fontSize: 14, fontWeight: '900' },
  progressionCopy: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  progressionCompact: { gap: 7, paddingTop: 3 },
  progressionKeep: { minHeight: 40, borderRadius: 11, backgroundColor: palette.surface2, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  progressionKeepText: { color: palette.text, fontSize: 11, fontWeight: '800' },
  ruleTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { color: palette.accent, fontSize: 16, lineHeight: 18, fontWeight: '900' },
  bulletText: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 18 },
  week: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dayCard: { width: '100%', gap: 10, borderColor: palette.border },
  dayCardWide: { width: '49%' },
  restCard: { width: '100%', minHeight: 112, gap: 5, justifyContent: 'center', borderColor: palette.border, backgroundColor: palette.surface },
  dayDate: { color: palette.muted, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1 },
  restTitle: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  restNote: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  workoutName: { color: palette.text, fontSize: 17, lineHeight: 22, fontWeight: '900', width: '100%' },
  workoutMeta: { color: palette.muted, fontSize: 11, lineHeight: 16, textTransform: 'capitalize' },
  supportLine: { color: palette.text, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  reviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  reviewAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, backgroundColor: palette.surface2 },
  reviewActionText: { color: palette.text, fontSize: 10, fontWeight: '900' },
  editPanel: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.surface2, borderWidth: 1, borderColor: palette.border },
  editInput: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg, color: palette.text, paddingHorizontal: 12, fontSize: 13, fontWeight: '700' },
  editPurpose: { minHeight: 72, paddingTop: 11, textAlignVertical: 'top' },
  editSection: { gap: 7, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 9 },
  editSectionTitle: { color: palette.accent, fontSize: 11, fontWeight: '900' },
  editExercise: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  editExerciseName: { color: palette.text, fontSize: 11, fontWeight: '800' },
  editExerciseDetail: { color: palette.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  removeExercise: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  editHelp: { color: palette.muted, fontSize: 9, lineHeight: 14 },
  movePanel: { gap: 8, padding: 11, borderRadius: 13, backgroundColor: palette.surface2 },
  moveOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  moveOption: { minHeight: 38, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 11, backgroundColor: palette.accentDark },
  moveOptionText: { color: palette.accent, fontSize: 10, fontWeight: '900' },
  detailLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', textTransform: 'capitalize', letterSpacing: 0.7 },
  whyToggle: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 8 },
  whyToggleText: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  whyCopy: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  morePanel: { gap: 9, padding: 11, borderRadius: 13, backgroundColor: palette.surface2 },
  moreEmpty: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  altButtons: { gap: 7 },
  altButton: { minHeight: 42, justifyContent: 'center', borderRadius: 11, backgroundColor: palette.surface2, paddingHorizontal: 12 },
  altText: { color: palette.accent, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  removeSession: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 8 },
  removeSessionText: { color: palette.red, fontSize: 11, fontWeight: '800' },
  organizationCard: { gap: 8, borderColor: palette.border },
  organizationHead: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  organizationBody: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 10 },
  startingWeek: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  safetyNote: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 10 },
  stickySave: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: palette.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  stickySaveInner: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: 2 },
  keepButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  keepText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
});
