import { useEffect, useMemo, useRef, useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Animated, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { NativeDateField, NativeTimeField } from '@/components/date-time-fields';
import { CommitmentHoldButton, MultiSelectCard, OnboardingLayout, OnboardingProgress, PerformanceInput, PerformanceTimeWheel, PrimaryOnboardingButton, ProfileRevealCard, SecondaryOnboardingButton, SelectableCard, splitImages, SplitGuide, SplitPose } from '@/components/onboarding';
import { PlanBuildStep } from '@/components/plan-build-loading';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { AthleteExperienceLevel, AthleteProfile, AthleteSport, CompetitionStatus, PainArea, RaceDevelopmentArea, SpeedGoal, SprintEvent, TimeAwayDuration, TimingMethod, TrainingConcernArea, TrainingConcernStatus, TrainingDay, TrainingDemand } from '@/types';
import { classificationExplanation, profileSummary, sportReaction } from '@/utils/onboarding-copy';
import { error as hapticError, success as hapticSuccess, tap, warning as hapticWarning } from '@/utils/haptics';
import { clearAthleteOnboardingDraft, getAthleteOnboardingDraft, getAthleteProfile, getTrainingWorkflow, resetAllSprintLabLocalData, resetAthleteOnboarding, saveAthleteOnboardingDraft, saveAthleteProfile, trainingWorkflowChanges, type TrainingWorkflow } from '@/utils/athlete-profile';
import { reminderTimeLabel, syncWorkoutReminders } from '@/utils/workout-reminders';
import { getTrackPerformanceInputRange } from '@/utils/performance-time';

const TOTAL_STEPS = 18;
const RESEARCH_URL = 'https://drive.google.com/drive/folders/1YsqqaUz08VPK9mdFMTppX06NRzJmjwqb?usp=sharing';
const weekdays: TrainingDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const events: SprintEvent[] = ['60m', '100m', '200m', '400m'];
const sports: { value: AthleteSport; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }[] = [
  { value: 'track-and-field', label: 'Track & field', icon: 'directions-run' },
  { value: 'football', label: 'Football', icon: 'sports-football' },
  { value: 'soccer', label: 'Soccer', icon: 'sports-soccer' },
  { value: 'basketball', label: 'Basketball', icon: 'sports-basketball' },
  { value: 'baseball', label: 'Baseball / softball', icon: 'sports-baseball' },
  { value: 'general-athletic-performance', label: 'General speed', icon: 'speed' },
  { value: 'other', label: 'Other', icon: 'more-horiz' },
];
// Canonical copy for every SpeedGoal, plus per-sport wording overrides where the same
// underlying quality reads more naturally in that sport's language (e.g. football's
// "10-yard acceleration" vs. basketball's "short sprint speed" both map to 'acceleration').
const SPEED_GOAL_LIBRARY: Record<SpeedGoal, { label: string; detail: string }> = {
  'first-step-quickness': { label: 'Explosive first steps', detail: 'Win the first 5–10 yards.' },
  acceleration: { label: 'Acceleration', detail: 'Build speed more powerfully through 10–30 yards.' },
  'maximum-velocity': { label: 'Top speed', detail: 'Improve upright sprinting and maximum velocity.' },
  'multidirectional-speed': { label: 'Change of direction', detail: 'Decelerate, redirect, and re-accelerate cleanly.' },
  'repeated-sprint-ability': { label: 'Repeat sprint ability', detail: 'Hold your speed across many efforts, not just one.' },
  'speed-endurance': { label: 'Speed endurance', detail: 'Hold high speed longer without tightening up.' },
  'explosive-power': { label: 'Jumping and explosiveness', detail: 'Build the power behind your first move and your jump.' },
  'combine-testing': { label: 'Testing performance', detail: 'Prepare for a specific timed or tested event.' },
  'track-race-performance': { label: 'Race performance', detail: 'Execute the race, not just train the parts.' },
  'general-speed-development': { label: 'Balanced speed development', detail: 'Train every quality without one main weakness.' },
};

const SPORT_GOAL_LABEL_OVERRIDES: Partial<Record<AthleteSport, Partial<Record<SpeedGoal, string>>>> = {
  football: { acceleration: '10-yard acceleration', 'maximum-velocity': '40-yard speed' },
};

// Which speed qualities are offered, and in what order, per primary sport. Falls back to the
// generic list for any sport not listed here (e.g. general-athletic-performance, other).
const SPORT_GOAL_ORDER: Partial<Record<AthleteSport, SpeedGoal[]>> = {
  football: ['first-step-quickness', 'acceleration', 'maximum-velocity', 'repeated-sprint-ability'],
  basketball: ['first-step-quickness', 'acceleration', 'repeated-sprint-ability', 'multidirectional-speed', 'explosive-power'],
  soccer: ['first-step-quickness', 'acceleration', 'repeated-sprint-ability', 'multidirectional-speed', 'explosive-power'],
  baseball: ['first-step-quickness', 'acceleration', 'maximum-velocity', 'explosive-power'],
  softball: ['first-step-quickness', 'acceleration', 'maximum-velocity', 'explosive-power'],
};

const DEFAULT_GOAL_ORDER: SpeedGoal[] = ['first-step-quickness', 'acceleration', 'maximum-velocity', 'speed-endurance', 'general-speed-development'];

function speedGoalOptionsFor(sport?: AthleteSport) {
  const order = (sport && SPORT_GOAL_ORDER[sport]) ?? DEFAULT_GOAL_ORDER;
  const overrides = (sport && SPORT_GOAL_LABEL_OVERRIDES[sport]) ?? {};
  return order.map(value => ({ value, label: overrides[value] ?? SPEED_GOAL_LIBRARY[value].label, detail: SPEED_GOAL_LIBRARY[value].detail }));
}
const raceAreas: { value: RaceDevelopmentArea; label: string; detail: string; goals: SpeedGoal[] }[] = [
  { value: 'start-and-first-30', label: 'The start and first 30', detail: 'Reaction, projection, and early acceleration.', goals: ['acceleration', 'first-step-quickness'] },
  { value: 'transition-to-upright', label: 'Transitioning upright', detail: 'Rising smoothly without losing momentum.', goals: ['acceleration', 'maximum-velocity'] },
  { value: 'maximum-velocity', label: 'Holding maximum speed', detail: 'Reaching and maintaining upright sprint velocity.', goals: ['maximum-velocity'] },
  { value: 'curve-running', label: 'Running the curve', detail: 'Positioning and rhythm in the 200m or 400m.', goals: ['track-race-performance'] },
  { value: 'speed-endurance', label: 'Speed endurance', detail: 'Keeping mechanics together as reps or races get longer.', goals: ['speed-endurance'] },
  { value: 'race-distribution', label: 'Race distribution', detail: 'Using effort in the right places across the race.', goals: ['track-race-performance'] },
  { value: 'finish-under-fatigue', label: 'Finishing under fatigue', detail: 'Limiting late-race slowdown without forcing mechanics.', goals: ['speed-endurance'] },
  { value: 'unsure', label: 'I’m not sure yet', detail: 'Start broad and learn from training and races.', goals: ['track-race-performance'] },
];
type SeasonDateKey = 'seasonStartDate' | 'seasonEndDate' | 'firstMeetDate' | 'championshipDate';
type SeasonDatePrompt = { key: SeasonDateKey; label: string };
const seasonStatuses: { value: Exclude<CompetitionStatus, 'unknown'>; label: string; detail: string }[] = [
  { value: 'out-of-season', label: 'Off-season', detail: 'Building general speed before competition approaches.' },
  { value: 'preseason', label: 'Preseason', detail: 'Preparing for an upcoming season or first competition.' },
  { value: 'in-season', label: 'In season', detail: 'Currently practicing and competing regularly.' },
  { value: 'postseason', label: 'Postseason', detail: 'The competitive season recently ended.' },
];
const seasonDatePrompts = (status: CompetitionStatus): [SeasonDatePrompt, SeasonDatePrompt] | null => {
  if (status === 'out-of-season') return [
    { key: 'seasonStartDate', label: 'Expected season start' },
    { key: 'firstMeetDate', label: 'Expected first competition' },
  ];
  if (status === 'preseason') return [
    { key: 'firstMeetDate', label: 'First competition' },
    { key: 'championshipDate', label: 'Most important competition' },
  ];
  if (status === 'in-season') return [
    { key: 'firstMeetDate', label: 'Next competition' },
    { key: 'championshipDate', label: 'Most important remaining competition' },
  ];
  if (status === 'postseason') return [
    { key: 'seasonEndDate', label: 'Season ended' },
    { key: 'seasonStartDate', label: 'Expected next season start' },
  ];
  return null;
};

/**
 * Sport-specific answers that stop being valid once the primary sport changes to something
 * else — clearing these when the primary sport changes prevents stale, hidden data (e.g. a
 * football 40-yard target) from lingering after the athlete switches to basketball.
 */
function clearedSportSpecificAnswers(): Partial<AthleteProfile> {
  return {
    speedGoals: [],
    raceDevelopmentAreas: [],
    footballProfile: undefined,
    trackProfile: undefined,
    sportProfileAnswered: false,
  };
}

function blankProfile(): AthleteProfile {
  const now = new Date().toISOString();
  return { id: 'local-athlete', name: '', ageRange: '16-17', competitionCategory: 'high-school', primaryEvent: '100m', secondaryEvents: [], personalBests: [], experienceLevel: 'developing', seasonPhase: 'general-preparation', trainingDaysPerWeek: 0, availableTrainingDays: [], exactTrainingDaysPreference: undefined, preferredRestDay: 'sunday', preferredRestDayAnswered: false, usualSessionDurationMinutes: 60, trackAccess: 'regular', grassAccess: 'regular', hillAccess: 'none', indoorAccess: 'none', startingBlocksAccess: 'none', weightRoomAccess: 'none', homeEquipment: ['none'], coachInvolvement: 'none', liftingExperience: 'beginner', blockStartExperience: 'none', primaryGoal: 'build-speed', nextMeetDate: null, championshipDate: null, loggingOnlyMode: false, sport: 'track-and-field', primarySport: undefined, sports: [], sportPosition: null, speedGoals: [], competitionLevel: 'high-school', trainingContext: 'general-development', primaryPerformanceTest: null, secondaryPerformanceTests: [], sportPracticeDays: [], gameOrCompetitionDays: [], gameScheduleVaries: false, otherSportDays: [], busySchoolDays: [], commitmentSchedulePlaced: false, currentTeamTrainingLoad: 'unknown', courtAccess: 'none', turfAccess: 'regular', sledAccess: 'none', timingGatesAccess: 'none', conesAccess: 'regular', trainingPlanMode: undefined, trainingPlanModeAnswered: false, currentPain: false, cautionAreas: [], onboardingLimitations: [], trainingConcernDetails: [], otherConcernArea: '', returningAfterTimeOff: false, trainingConstraintsReviewed: false, currentTrainingDemands: [], workoutReminderEnabled: false, workoutReminderHour: 16, workoutReminderMinute: 0, workoutReminderCustomTime: false, workoutReminderAnswered: false, raceDevelopmentAreas: [], targetPerformances: [], seasonCalendar: { competitionStatus: 'unknown', priorityMeets: [] }, seasonPhaseOverride: null, createdAt: now, updatedAt: now, onboardingComplete: false, experienceAnswered: false, sportProfileAnswered: false, primarySportAnswered: false };
}

const pretty = (value: string) => value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const toggle = <T,>(items: T[], value: T) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];
const summarizeWeekdays = (days: TrainingDay[]) => {
  const ordered = weekdays.filter(day => days.includes(day)).map(day => pretty(day).slice(0, 3));
  if (ordered.length <= 1) return ordered.join('');
  if (ordered.length === 2) return ordered.join(' + ');
  return `${ordered.slice(0, -1).join(', ')} + ${ordered.at(-1)}`;
};
export default function ProfileScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const editing = mode === 'edit';
  const [profile, setProfile] = useState<AthleteProfile>(blankProfile);
  const [step, setStep] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const update = (changes: Partial<AthleteProfile>) => setProfile(current => ({ ...current, ...changes }));

  useEffect(() => { Promise.all([getAthleteOnboardingDraft(), getAthleteProfile()]).then(([draft, saved]) => { if (!editing && draft && !draft.completed) { setProfile(draft.profile); setStep(draft.currentStep); } else if (saved) setProfile(saved); setLoaded(true); }); }, [editing]);
  useEffect(() => { if (loaded && !editing && !profile.onboardingComplete) void saveAthleteOnboardingDraft({ currentStep: step, profile, completed: false }); }, [editing, loaded, profile, step]);

  const speech = useMemo(() => step === 1 ? 'Hey, I’m Split. I’ll learn how you train and help build your speed profile.' : step === 3 ? 'Choose everything that applies. You can change this later.' : step === 4 ? 'Choose the sport or speed goal that matters most right now.' : step === 5 && profile.primarySport !== 'track-and-field' ? 'Choose up to two. I’ll use them to shape your speed profile.' : step === 5 ? sportReaction(profile.primarySport ?? 'general-athletic-performance') : step === 6 && profile.primarySport === 'football' ? 'Add it if you know it. You can test and update it later.' : step === 7 ? 'A target gives the plan direction. It is a goal—not a guarantee.' : step === 8 ? 'Choose the closest match. You can update it later.' : step === 10 ? 'We’ll place these on your week next.' : step === 11 ? 'Select anything currently affecting your training. We’ll ask only the follow-ups you need.' : step === 12 ? 'Estimated dates are fine. They help me place hard training and recovery.' : step === 13 ? 'Choose the setup that matches how your training is organized.' : step === 14 ? 'I can remind you when a planned session is coming up.' : step === 15 ? 'These publications help shape the workout library and planning rules.' : step === 16 ? 'I’m checking your real schedule and protecting your recovery now.' : step === 17 ? 'I’ve got your speed profile.' : step === 18 ? 'One promise to yourself, then we can get moving.' : 'Answer what you know. You can update every detail later.', [profile, step]);
  const splitPose = poseForStep(step);
  const go = (next: number) => {
    setError('');
    setStep(Math.max(1, Math.min(TOTAL_STEPS, next)));
  };
  const next = () => {
    const message = validateStep(step, profile);
    if (message) {
      hapticError();
      return setError(message);
    }
    if (step === 3 && profile.sports?.length === 1) {
      const primarySport = profile.sports[0];
      const changedSport = profile.primarySport !== undefined && profile.primarySport !== primarySport;
      setProfile(current => ({ ...current, ...(changedSport ? clearedSportSpecificAnswers() : {}), primarySport, sport: primarySport, primarySportAnswered: true }));
      return go(5);
    }
    if (step === 6 && profile.primarySport !== 'track-and-field' && profile.primarySport !== 'football') return go(8);
    go(step + 1);
  };
  const back = () => {
    if (step === 10 && profile.commitmentSchedulePlaced) {
      update({ commitmentSchedulePlaced: false });
      setError('');
      return;
    }
    if (step === 11 && profile.trainingConstraintsReviewed) {
      update({ trainingConstraintsReviewed: false });
      setError('');
      return;
    }
    go(step === 5 && profile.sports?.length === 1 ? 3 : step === 8 && profile.primarySport !== 'track-and-field' && profile.primarySport !== 'football' ? 6 : step - 1);
  };
  const finish = async () => {
    try {
      const finalProfile = await saveAthleteProfile({ ...profile, onboardingComplete: true, updatedAt: new Date().toISOString() });
      await syncWorkoutReminders({ profile: finalProfile });
      await clearAthleteOnboardingDraft();
      setProfile(finalProfile);
      hapticSuccess();
      if (editing) {
        Alert.alert('Profile updated', 'Your speed profile is saved on this device.');
        router.back();
        return;
      }
      const canBuildPlan = finalProfile.trainingPlanMode === 'build-my-plan' || finalProfile.trainingPlanMode === 'both';
      router.replace(canBuildPlan ? '/plan-preview' : '/');
    } catch {
      hapticError();
      Alert.alert('Could not save your profile', 'Your answers are still here. Please try again.');
    }
  };
  const reset = async () => { await resetAthleteOnboarding(); setProfile(blankProfile()); go(1); };
  const resetAll = () => Alert.alert('Reset all local SprintLab data?', 'This permanently removes this device’s profile, onboarding answers, plans, active workouts, history, progress, library edits, and saved logs. It cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Erase all data', style: 'destructive', onPress: async () => { hapticWarning(); await resetAllSprintLabLocalData(); setProfile(blankProfile()); go(1); } }]);
  const openDebugMenu = () => {
    if (!__DEV__) return;
    Alert.alert('SprintLab debug menu', 'Development controls', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset onboarding only', onPress: () => void reset() },
      { text: 'Erase all local app data', style: 'destructive', onPress: resetAll },
    ]);
  };
  if (!loaded) return <View style={styles.loading} />;

  const selectedSports = profile.sports ?? [];
  const sportCtaTitle = selectedSports.length === 0
    ? 'Select at least one'
    : selectedSports.length === 1
      ? `Continue with ${selectedSports[0] === 'other' && profile.otherSportParticipation?.trim() ? profile.otherSportParticipation.trim() : sports.find(option => option.value === selectedSports[0])?.label ?? 'selection'}`
      : 'Choose my main focus';
  const isSpeedPriorityStep = step === 5 && profile.primarySport !== 'track-and-field';
  const selectedSpeedGoals = profile.speedGoals ?? [];
  const speedPriorityCtaTitle = selectedSpeedGoals.length === 0
    ? 'Choose at least one'
    : selectedSpeedGoals.includes('general-speed-development')
      ? 'Build balanced speed'
      : selectedSpeedGoals.length === 1
        ? `Continue with ${speedGoalOptionsFor(profile.primarySport).find(option => option.value === selectedSpeedGoals[0])?.label ?? 'priority'}`
        : 'Continue with 2 priorities';
  const isFootballBaselineStep = step === 6 && profile.primarySport === 'football';
  const isExperienceStep = step === 8;
  const isFrequencyStep = step === 9;
  const isDemandsStep = step === 10;
  const isLimitationsStep = step === 11;
  const isSeasonStep = step === 12;
  const isModeStep = step === 13;
  const isReminderStep = step === 14;
  const isSourcesStep = step === 15;
  const isRevealStep = step === 17;
  const isCommitmentStep = step === 18;
  const experienceCtaLabels: Record<AthleteExperienceLevel, string> = {
    beginner: 'new',
    developing: 'some experience',
    intermediate: 'consistent',
    advanced: 'experienced',
    elite: 'experienced',
  };
  const experienceCtaTitle = profile.experienceAnswered
    ? `Continue as ${experienceCtaLabels[profile.experienceLevel]}`
    : 'Choose your experience';
  const footballBaseline = profile.footballProfile;
  const footballTrainingFocus = footballBaseline?.trainingFocus;
  const footballBaselineStatus = footballBaseline?.baselineStatus
    ?? (footballBaseline?.fortyYardDashTime ? 'known' : undefined);
  const footballNeedsBaseline = footballTrainingFocus === 'forty-yard' || footballTrainingFocus === 'both';
  const footballBaselineValid = !footballTrainingFocus
    ? false
    : !footballNeedsBaseline
      ? true
      : footballBaselineStatus === 'untested'
        || (footballBaselineStatus === 'known'
          && Boolean(footballBaseline?.fortyYardDashTime)
          && Boolean(footballBaseline?.fortyYardTimingMethod));
  const footballBaselineCtaTitle = !footballTrainingFocus
    ? 'Choose what you’re training for'
    : !footballNeedsBaseline
      ? 'Continue with game speed'
      : footballBaselineStatus === 'untested'
        ? 'Continue without a baseline'
        : footballBaselineStatus === 'known' && footballBaseline?.fortyYardDashTime && footballBaseline.fortyYardTimingMethod
          ? `Save ${footballBaseline.fortyYardDashTime.toFixed(2)} baseline`
          : 'Choose an option';
  const exactDayCount = profile.availableTrainingDays.length;
  const frequencyValid = profile.trainingDaysPerWeek >= 2 && profile.trainingDaysPerWeek <= 5;
  const exactDaysComplete = profile.exactTrainingDaysPreference !== true
    || exactDayCount === profile.trainingDaysPerWeek;
  const frequencyCtaTitle = !frequencyValid
    ? 'Choose your weekly schedule'
    : profile.exactTrainingDaysPreference === true
      ? exactDaysComplete
        ? `Continue with ${summarizeWeekdays(profile.availableTrainingDays)}`
        : `Choose ${profile.trainingDaysPerWeek - exactDayCount} more ${profile.trainingDaysPerWeek - exactDayCount === 1 ? 'day' : 'days'}`
      : `Continue with ${profile.trainingDaysPerWeek} days`;
  const demands = profile.currentTrainingDemands ?? [];
  const hasNoOtherDemands = demands.includes('none');
  const placingCommitments = Boolean(profile.commitmentSchedulePlaced && !hasNoOtherDemands);
  const demandDetailsComplete = (!demands.includes('team-practices') || Boolean(profile.sportPracticeDays?.length))
    && (!demands.includes('games-or-meets') || Boolean(profile.gameScheduleVaries || profile.gameOrCompetitionDays?.length))
    && (!demands.includes('another-sport') || Boolean(profile.otherSportDays?.length))
    && (!demands.includes('heavy-school-schedule') || Boolean(profile.busySchoolDays?.length));
  const demandsCtaTitle = placingCommitments
    ? 'Continue with my schedule'
    : hasNoOtherDemands
      ? 'Nothing else to add'
      : demands.length
        ? 'Add these to my week'
        : 'Select what applies';
  const handleDemandsContinue = () => {
    if (!demands.length) return;
    if (!hasNoOtherDemands && !profile.commitmentSchedulePlaced) {
      update({ commitmentSchedulePlaced: true });
      setError('');
      return;
    }
    next();
  };
  const limitations = profile.onboardingLimitations ?? [];
  const physicalConcernLabels = ['Hamstring', 'Knee', 'Achilles or ankle', 'Back', 'Shoulder', 'Other area'];
  const substantiveLimitations = limitations.filter(item => item !== 'No current concerns');
  const reviewingConstraints = Boolean(profile.trainingConstraintsReviewed);
  const concernDetails = profile.trainingConcernDetails ?? [];
  const selectedPhysicalCount = limitations.filter(item => physicalConcernLabels.includes(item)).length;
  const limitationDetailsComplete = concernDetails.length === selectedPhysicalCount
    && (!limitations.includes('Other area') || Boolean(profile.otherConcernArea?.trim()))
    && (!limitations.includes('Returning after time off') || Boolean(profile.timeAwayDuration))
    && (!limitations.includes('Coach restrictions') || Boolean(profile.coachRestrictions?.trim()))
    && (!limitations.includes('Medical restrictions') || Boolean(profile.medicalRestrictions?.trim()));
  const limitationsCtaTitle = reviewingConstraints
    ? 'Continue with my constraints'
    : substantiveLimitations.length
      ? 'Review my training constraints'
      : 'Confirm nothing is affecting training';
  const handleLimitationsContinue = () => {
    if (!reviewingConstraints) {
      if (!substantiveLimitations.length) {
        update({
          onboardingLimitations: ['No current concerns'],
          trainingConcernDetails: [],
          cautionAreas: [],
          currentPain: false,
          trainingConstraintsReviewed: true,
        });
        return go(12);
      }
      update({ trainingConstraintsReviewed: true });
      setError('');
      return;
    }
    next();
  };
  const calendar = profile.seasonCalendar ?? { competitionStatus: 'unknown' as CompetitionStatus, priorityMeets: [] };
  const calendarPrompts = seasonDatePrompts(calendar.competitionStatus);
  const calendarHasDates = Boolean(calendarPrompts?.some(prompt => calendar[prompt.key]));
  const calendarCtaTitle = calendar.competitionStatus === 'unknown'
    ? 'Choose your season status'
    : calendarHasDates
      ? 'Use these competition dates'
      : 'Continue without dates';
  const trainingWorkflow = getTrainingWorkflow(profile);
  const modeCtaTitle = trainingWorkflow === 'sprintlab-plan'
    ? 'Build my SprintLab plan'
    : trainingWorkflow === 'coach-plan'
      ? 'Set up my coach’s plan'
      : trainingWorkflow === 'combined'
        ? 'Set up combined planning'
        : trainingWorkflow === 'log-only'
          ? 'Start logging training'
          : 'Choose how SprintLab should help';
  const reminderAnswered = Boolean(profile.workoutReminderAnswered);
  const reminderCtaTitle = !reminderAnswered
    ? 'Choose a reminder option'
    : !profile.workoutReminderEnabled
      ? 'Continue without reminders'
      : `Set ${reminderTimeLabel(profile.workoutReminderHour, profile.workoutReminderMinute)} reminders`;
  const handleReminderContinue = async () => {
    if (!reminderAnswered) return;
    try {
      const result = await syncWorkoutReminders({
        profile,
        requestPermission: Boolean(profile.workoutReminderEnabled),
      });
      if (result.status === 'permission-denied') {
        Alert.alert(
          'Notifications are off',
          'Onboarding will continue normally. You can allow workout reminders later in SprintLab Settings and your device settings.',
        );
      }
    } catch {
      hapticError();
      Alert.alert(
        'Reminder not set',
        'Onboarding will continue normally. You can try enabling workout reminders later in SprintLab Settings.',
      );
    }
    next();
  };

  return <OnboardingLayout
    key={step}
    welcome={step === 1}
    trackLanes={step === 3 || isSpeedPriorityStep || isCommitmentStep}
    bare={step === 16}
    footer={step === 16
      ? undefined
      : step === 3
      ? <PrimaryOnboardingButton title={sportCtaTitle} disabled={selectedSports.length === 0} onPress={next} />
      : isSpeedPriorityStep
        ? <PrimaryOnboardingButton title={speedPriorityCtaTitle} disabled={selectedSpeedGoals.length === 0} onPress={next} />
        : isFootballBaselineStep
          ? <PrimaryOnboardingButton title={footballBaselineCtaTitle} disabled={!footballBaselineValid} onPress={next} />
          : isExperienceStep
            ? <PrimaryOnboardingButton title={experienceCtaTitle} disabled={!profile.experienceAnswered} onPress={next} />
          : isFrequencyStep
            ? <PrimaryOnboardingButton title={frequencyCtaTitle} disabled={!frequencyValid || !exactDaysComplete} onPress={next} />
            : isDemandsStep
              ? <PrimaryOnboardingButton title={demandsCtaTitle} disabled={!demands.length || (placingCommitments && !demandDetailsComplete)} onPress={handleDemandsContinue} />
              : isLimitationsStep
                ? <PrimaryOnboardingButton title={limitationsCtaTitle} disabled={reviewingConstraints && !limitationDetailsComplete} onPress={handleLimitationsContinue} />
                : isSeasonStep
                  ? <PrimaryOnboardingButton title={calendarCtaTitle} disabled={calendar.competitionStatus === 'unknown'} onPress={next} />
                  : isModeStep
                    ? <PrimaryOnboardingButton title={modeCtaTitle} disabled={!trainingWorkflow} onPress={next} />
                    : isReminderStep
                      ? <PrimaryOnboardingButton title={reminderCtaTitle} disabled={!reminderAnswered} onPress={() => void handleReminderContinue()} />
                      : isSourcesStep
                        ? <View style={styles.sourcesFooter}>
                            <PrimaryOnboardingButton title="Review my plan setup" onPress={next} />
                            <Pressable
                              accessibilityRole="link"
                              accessibilityLabel="View SprintLab research standards and methodology"
                              onPress={() => { tap(); void WebBrowser.openBrowserAsync(RESEARCH_URL); }}
                              style={styles.researchLink}
                            >
                              <Text style={styles.researchLinkText}>View research standards and methodology</Text>
                            </Pressable>
                          </View>
                        : isRevealStep
                          ? <PrimaryOnboardingButton title="Continue to my week" onPress={next} />
                          : isCommitmentStep
                            ? <CommitmentHoldButton
                                title={editing ? 'Hold to save changes' : 'Hold to commit'}
                                completedTitle={editing ? 'Changes saved.' : 'Commitment made.'}
                                completedHint={editing ? undefined : 'Now let’s build.'}
                                duration={1200}
                                feedback="none"
                                onComplete={finish}
                              />
        : undefined}
  >
    {step === 1 ? <Welcome onContinue={() => go(2)} onOpenDebugMenu={openDebugMenu} /> : <>
      {step === 16 ? null : <OnboardingProgress step={isCommitmentStep ? 1 : step === 3 ? 2 : isSpeedPriorityStep ? 4 : isRevealStep ? 2 : isFootballBaselineStep || isExperienceStep || isFrequencyStep || isSeasonStep || isModeStep || isSourcesStep ? 1 : isReminderStep ? 2 : isDemandsStep ? (placingCommitments ? 3 : 2) : isLimitationsStep ? (reviewingConstraints ? 2 : 1) : step - 1} total={isCommitmentStep ? 1 : step === 3 || isSpeedPriorityStep ? 6 : isFootballBaselineStep || isExperienceStep ? 4 : isFrequencyStep || isDemandsStep ? 3 : isLimitationsStep ? 2 : isSeasonStep ? 1 : isModeStep || isReminderStep || isSourcesStep || isRevealStep ? 2 : TOTAL_STEPS - 1} onBack={back} stageLabel={isCommitmentStep ? 'Commitment · 1 of 1' : isFootballBaselineStep ? 'Performance · 1 of 4' : isExperienceStep ? 'Training · 1 of 4' : isFrequencyStep ? 'Schedule · 1 of 3' : isDemandsStep ? `Schedule · ${placingCommitments ? 3 : 2} of 3` : isLimitationsStep ? `Constraints · ${reviewingConstraints ? 2 : 1} of 2` : isSeasonStep ? 'Season · 1 of 1' : isModeStep ? 'Setup · 1 of 2' : isReminderStep ? 'Setup · 2 of 2' : isSourcesStep ? 'Plan · 1 of 2' : isRevealStep ? 'Plan · 2 of 2' : stageLabelForStep(step)} />}
      {isCommitmentStep || step === 16 ? null : <SplitGuide speech={speech} pose={splitPose} compact={step === 3 || isSpeedPriorityStep || isFootballBaselineStep || isSourcesStep || isRevealStep} prominent={step === 12 || step === 13} />}
      <View style={[styles.content, step === 16 && styles.contentBare]}>{renderStep(step, profile, update, go, next)}</View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {step === 3 || step === 16 || isSpeedPriorityStep || isFootballBaselineStep || isExperienceStep || isFrequencyStep || isDemandsStep || isLimitationsStep || isSeasonStep || isModeStep || isReminderStep || isSourcesStep || isRevealStep || isCommitmentStep ? null : step === 2 ? <><PrimaryOnboardingButton title={profile.name.trim() ? 'Continue' : 'Skip for now'} onPress={next} /><SecondaryOnboardingButton title="Back" onPress={() => go(1)} /></> : step === 7 ? null : <PrimaryOnboardingButton title="Continue" onPress={next} />}
    </>}
  </OnboardingLayout>;
}

function renderStep(step: number, profile: AthleteProfile, update: (value: Partial<AthleteProfile>) => void, go: (step: number) => void, onPlanReady: () => void) {
  if (step === 1) return null;
  if (step === 2) return <NameStep profile={profile} update={update} />;
  if (step === 3) return <SportsStep profile={profile} update={update} />;
  if (step === 4) return <MainFocusStep profile={profile} update={update} />;
  if (step === 5) return <GoalsStep profile={profile} update={update} />;
  if (step === 6) return <SportProfileStep profile={profile} update={update} />;
  if (step === 7) return <TargetStep profile={profile} update={update} onContinue={() => go(8)} />;
  if (step === 8) return <ExperienceStep profile={profile} update={update} />;
  if (step === 9) return <FrequencyStep profile={profile} update={update} />;
  if (step === 10) return <DemandsStep profile={profile} update={update} />;
  if (step === 11) return <LimitationsStep profile={profile} update={update} />;
  if (step === 12) return <SeasonStep profile={profile} update={update} />;
  if (step === 13) return <ModeStep profile={profile} update={update} />;
  if (step === 14) return <ReminderStep profile={profile} update={update} />;
  if (step === 15) return <SourcesStep />;
  if (step === 16) return <PlanBuildStep profile={profile} onReady={onPlanReady} />;
  if (step === 17) return <RevealStep profile={profile} go={go} />;
  return <CommitmentStep profile={profile} />;
}

function CommitmentStep({ profile }: { profile: AthleteProfile }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const name = profile.name.trim().split(/\s+/)[0] || 'Athlete';
  return <View style={styles.commitmentScreen}>
    <Text style={styles.commitmentEyebrow}>ONE LAST STEP</Text>
    <Text style={styles.commitmentTitle}>Training with purpose</Text>
    <Text style={styles.commitmentSupport}>Make one simple commitment before opening your first week.</Text>
    <View style={styles.commitmentCard}>
      <Text style={styles.commitmentPledge}>I’m committing to train with purpose, log honestly, and improve one session at a time.</Text>
      <Text style={styles.commitmentSignature}>— {name}</Text>
    </View>
  </View>;
}

function Welcome({ onContinue, onOpenDebugMenu }: { onContinue: () => void; onOpenDebugMenu: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const idle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(idle, { toValue: 1, duration: 1600, useNativeDriver }),
      Animated.timing(idle, { toValue: 0, duration: 1600, useNativeDriver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [idle]);

  const start = () => {
    tap();
    onContinue();
  };

  return <View style={styles.welcomeHero}>
    <View pointerEvents="none" style={styles.laneArcOuter} />
    <View pointerEvents="none" style={styles.laneArcInner} />
    <View style={styles.welcomeColumns}>
      <View style={styles.mascotColumn}>
        <Pressable
          accessibilityRole="image"
          accessibilityLabel="Split, the SprintLab guide"
          delayLongPress={900}
          onLongPress={__DEV__ ? onOpenDebugMenu : undefined}
          style={styles.mascotPressable}
        >
          <Animated.View style={{ transform: [
            { translateY: idle.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
            { rotate: idle.interpolate({ inputRange: [0, 1], outputRange: ['-0.35deg', '0.35deg'] }) },
          ] }}>
            <Image accessibilityIgnoresInvertColors source={splitImages.welcome} resizeMode="contain" style={styles.welcomeSplit} />
          </Animated.View>
        </Pressable>
        <View accessible accessibilityLabel="Split says: Hey, I’m Split. I’ll learn how you train, then help shape your SprintLab setup." style={styles.welcomeBubble}>
          <View pointerEvents="none" style={styles.welcomeBubbleTail} />
          <Text style={styles.welcomeBubbleText}>Hey, I’m Split. I’ll learn how you train, then help shape your SprintLab setup.</Text>
        </View>
      </View>
      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeHeading}>Build your speed profile.</Text>
        <Text style={styles.welcomeDescription}>Answer a few quick questions about your events, goals, schedule, and equipment. Then preview the setup built around you.</Text>
        <Text style={styles.welcomeReassurance}><Text style={styles.welcomeDot}>●</Text>  About 2 minutes · Change anything later</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Build my profile" onPress={start} style={({ pressed }) => [styles.welcomeButton, pressed && styles.welcomeButtonPressed]}>
          <Text style={styles.welcomeButtonText}>Build my profile</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}
function Question({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <View style={styles.question}><Text style={styles.questionTitle}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}{children}</View>; }

function NameStep({ profile, update }: Props) { return <Question title="What should I call you?" subtitle="A first name is optional, and stays on this device."><PerformanceInput value={profile.name} onChangeText={name => update({ name })} placeholder="First name" keyboardType="default" /></Question>; }
function SportsStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const selected = profile.sports ?? [];
  const choose = (sport: AthleteSport) => {
    const next = selected.includes(sport) ? selected.filter(item => item !== sport) : [...selected, sport];
    update({
      sports: next,
      primarySport: next.includes(profile.primarySport as AthleteSport) ? profile.primarySport : undefined,
      primarySportAnswered: next.includes(profile.primarySport as AthleteSport) ? profile.primarySportAnswered : false,
      sportPosition: null,
      otherSportParticipation: next.includes('other') ? profile.otherSportParticipation : '',
    });
  };
  return <Question title="What are you getting faster for?" subtitle="Select every sport you currently train for. If you choose more than one, you’ll choose your main focus next.">
    <View style={styles.sportStack}>
      {sports.map(option => <SportSelectCard key={option.value} option={option} selected={selected.includes(option.value)} onPress={() => choose(option.value)} />)}
    </View>
    {selected.includes('other') ? <View style={styles.otherSportField}>
      <Text style={styles.otherSportLabel}>Your sport</Text>
      <PerformanceInput value={profile.otherSportParticipation ?? ''} onChangeText={otherSportParticipation => update({ otherSportParticipation })} placeholder="Enter your sport" keyboardType="default" />
    </View> : null}
  </Question>;
}

function SportSelectCard({
  option,
  selected,
  onPress,
}: {
  option: (typeof sports)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable
    accessibilityRole="checkbox"
    accessibilityLabel={`${option.label}${option.value === 'track-and-field' ? ', most common' : ''}`}
    accessibilityState={{ checked: selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.sportRow, selected && styles.sportRowSelected, pressed && styles.sportRowPressed]}
  >
    <View accessibilityElementsHidden style={[styles.sportIcon, selected && styles.sportIconSelected]}>
      <MaterialIcons name={option.icon} size={21} color={selected ? palette.accent : palette.muted} />
    </View>
    <View style={styles.sportCopy}>
      <Text style={[styles.sportLabel, selected && styles.sportLabelSelected]}>{option.label}</Text>
      {option.value === 'track-and-field' ? <Text style={styles.sportBadge}>Most common</Text> : null}
    </View>
    <View accessibilityElementsHidden style={[styles.sportCheckbox, selected && styles.sportCheckboxSelected]}>
      {selected ? <Text style={styles.sportCheckmark}>✓</Text> : null}
    </View>
  </Pressable>;
}

function MainFocusStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const selected = profile.sports ?? [];
  return <Question title="What is your main focus right now?" subtitle="Choose the one focus this speed profile and training week should prioritize.">
    <View style={styles.stack}>{selected.map(item => <SelectableCard key={item} label={item === 'other' && profile.otherSportParticipation?.trim() ? profile.otherSportParticipation.trim() : sports.find(option => option.value === item)?.label ?? pretty(item)} selected={profile.primarySportAnswered === true && profile.primarySport === item} onPress={() => update({ ...(profile.primarySport !== undefined && profile.primarySport !== item ? clearedSportSpecificAnswers() : {}), primarySport: item, primarySportAnswered: true, sport: item, sportPosition: null })} />)}</View>
  </Question>;
}

function SpeedPriorityCard({
  option,
  selected,
  recommended,
  onPress,
}: {
  option: ReturnType<typeof speedGoalOptionsFor>[number];
  selected: boolean;
  recommended: boolean;
  onPress: () => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable
    accessibilityRole="checkbox"
    accessibilityLabel={`${option.label}. ${option.detail}${recommended ? ' Recommended for football.' : ''}`}
    accessibilityState={{ checked: selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.priorityRow, selected && styles.priorityRowSelected, pressed && styles.priorityRowPressed]}
  >
    <View style={styles.priorityCopy}>
      <View style={styles.priorityTitleRow}>
        <Text style={[styles.priorityLabel, selected && styles.priorityLabelSelected]}>{option.label}</Text>
        {recommended ? <Text style={styles.priorityBadge}>Recommended for football</Text> : null}
      </View>
      <Text style={styles.priorityDetail}>{option.detail}</Text>
    </View>
    <View accessibilityElementsHidden style={[styles.sportCheckbox, selected && styles.sportCheckboxSelected]}>
      {selected ? <Text style={styles.sportCheckmark}>✓</Text> : null}
    </View>
  </Pressable>;
}

function GoalsStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const sport = profile.primarySport ?? profile.sport ?? 'track-and-field';
  if (sport === 'track-and-field') {
    const selected = profile.raceDevelopmentAreas ?? [];
    const choose = (area: RaceDevelopmentArea) => {
      const next = selected.includes(area)
        ? selected.filter(item => item !== area)
        : area === 'unsure'
          ? ['unsure' as RaceDevelopmentArea]
          : selected.filter(item => item !== 'unsure').length < 2
            ? [...selected.filter(item => item !== 'unsure'), area]
            : selected;
      const goals = [...new Set(next.flatMap(item => raceAreas.find(option => option.value === item)?.goals ?? []))].slice(0, 3);
      update({ raceDevelopmentAreas: next, speedGoals: goals });
    };
    return <Question title="Where do you lose your races?" subtitle="Most sprinters leave time in one or two places. Name yours."><Text style={styles.selectionCount}>{selected.length}/2 selected</Text><View style={styles.stack}>{raceAreas.map(option => <MultiSelectCard key={option.value} label={option.label} detail={option.detail} selected={selected.includes(option.value)} disabled={!selected.includes(option.value) && selected.length >= 2 && option.value !== 'unsure'} onPress={() => choose(option.value)} />)}</View></Question>;
  }
  const selected = profile.speedGoals ?? [];
  const choose = (goal: SpeedGoal) => {
    if (selected.includes(goal)) {
      update({ speedGoals: selected.filter(item => item !== goal) });
      return;
    }
    if (goal === 'general-speed-development') {
      update({ speedGoals: ['general-speed-development'] });
      return;
    }
    const specificGoals = selected.filter(item => item !== 'general-speed-development');
    update({ speedGoals: specificGoals.length >= 2 ? [...specificGoals.slice(1), goal] : [...specificGoals, goal] });
  };
  return <Question title="What do you want to improve most?" subtitle="Choose up to two priorities.">
    <Text accessibilityLiveRegion="polite" style={styles.selectionCount}>{selected.length}/2 selected</Text>
    <View style={styles.priorityStack}>{speedGoalOptionsFor(profile.primarySport).map(option => <SpeedPriorityCard
      key={option.value}
      option={option}
      selected={selected.includes(option.value)}
      recommended={profile.primarySport === 'football' && option.value === 'first-step-quickness'}
      onPress={() => choose(option.value)}
    />)}</View>
  </Question>;
}

function SportProfileStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const sport = profile.primarySport ?? profile.sport ?? 'track-and-field';
  if (sport === 'track-and-field') {
    const range = getTrackPerformanceInputRange(profile.primaryEvent);
    const personalBest = profile.personalBests.find(item => item.event === profile.primaryEvent)?.timeSeconds ?? null;
    const updatePersonalBest = (time: number | null) => update({
      personalBests: time
        ? [...profile.personalBests.filter(item => item.event !== profile.primaryEvent), { event: profile.primaryEvent, timeSeconds: time }]
        : profile.personalBests.filter(item => item.event !== profile.primaryEvent),
    });
    const updateSecondaryBest = (event: SprintEvent, time: number | null) => update({
      personalBests: time
        ? [...profile.personalBests.filter(item => item.event !== event), { event, timeSeconds: time }]
        : profile.personalBests.filter(item => item.event !== event),
    });
    return <Question title="Your track profile" subtitle="Choose your main event and add a current best only if you know it. The time is optional.">
      <Label text="Primary event" />
      <View style={styles.chips}>{events.map(event => <Chip key={event} label={event} selected={profile.primaryEvent === event && Boolean(profile.sportProfileAnswered)} onPress={() => update({ primaryEvent: event, sportProfileAnswered: true, trackProfile: { primaryEvent: event, secondaryEvents: profile.secondaryEvents, personalBests: profile.personalBests, blockStartExperience: profile.blockStartExperience, nextMeetDate: profile.nextMeetDate, championshipDate: profile.championshipDate } })} />)}</View>
      <Label text="Secondary events" />
      <View style={styles.chips}>{events.filter(event => event !== profile.primaryEvent).map(event => <Chip key={event} label={event} selected={profile.secondaryEvents.includes(event)} onPress={() => update({ secondaryEvents: toggle(profile.secondaryEvents, event) })} />)}</View>
      <PerformanceTimeWheel
        key={`personal-best:${profile.primaryEvent}`}
        label={`${profile.primaryEvent} current best`}
        value={personalBest}
        onChange={updatePersonalBest}
        minimumSeconds={range.minimum}
        maximumSeconds={range.maximum}
        suggestedSeconds={range.suggested}
      />
      {profile.secondaryEvents.length ? <View style={styles.secondaryBestCard}>
        <Label text="Secondary-event bests · optional" />
        {profile.secondaryEvents.map(event => {
          const secondaryRange = getTrackPerformanceInputRange(event);
          return <PerformanceTimeWheel
            key={`secondary-best:${event}`}
            label={`${event} current best`}
            value={profile.personalBests.find(item => item.event === event)?.timeSeconds ?? null}
            onChange={time => updateSecondaryBest(event, time)}
            minimumSeconds={secondaryRange.minimum}
            maximumSeconds={secondaryRange.maximum}
            suggestedSeconds={secondaryRange.suggested}
          />;
        })}
      </View> : null}
    </Question>;
  }
  if (sport === 'football') {
    const item = profile.footballProfile ?? {};
    const baselineStatus = item.baselineStatus ?? (item.fortyYardDashTime ? 'known' : undefined);
    const needsBaseline = item.trainingFocus === 'forty-yard' || item.trainingFocus === 'both';
    const chooseFocus = (trainingFocus: NonNullable<typeof item.trainingFocus>) => update({
      footballProfile: {
        ...item,
        trainingFocus,
        ...(trainingFocus === 'game-speed' ? { baselineStatus: undefined, fortyYardDashTime: undefined, fortyYardTimingMethod: undefined } : {}),
      },
      sportProfileAnswered: trainingFocus === 'game-speed' ? true : Boolean(profile.sportProfileAnswered),
    });
    const chooseStatus = (status: 'known' | 'untested') => update({
      footballProfile: {
        ...item,
        baselineStatus: status,
        fortyYardDashTime: status === 'untested' ? undefined : item.fortyYardDashTime,
        fortyYardTimingMethod: status === 'untested' ? undefined : item.fortyYardTimingMethod,
      },
      sportProfileAnswered: true,
    });
    const chooseTimingMethod = (fortyYardTimingMethod: TimingMethod) => update({
      footballProfile: { ...item, baselineStatus: 'known', fortyYardTimingMethod },
      sportProfileAnswered: true,
    });
    return <Question title="What are you training speed for?" subtitle="This decides whether a 40-yard baseline makes sense to ask for.">
      <Label text="Position or position group · optional" />
      <PerformanceInput value={profile.sportPosition ?? ''} onChangeText={sportPosition => update({ sportPosition: sportPosition || null })} placeholder="e.g. Wide receiver" keyboardType="default" />
      <View accessibilityRole="radiogroup" style={styles.baselineChoiceRow}>
        {([
          { value: 'forty-yard' as const, label: '40-yard dash' },
          { value: 'game-speed' as const, label: 'Game speed' },
          { value: 'both' as const, label: 'Both' },
        ]).map(option => <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityState={{ checked: item.trainingFocus === option.value }}
          onPress={() => chooseFocus(option.value)}
          style={[styles.baselineChoice, item.trainingFocus === option.value && styles.baselineChoiceSelected]}
        ><Text style={[styles.baselineChoiceText, item.trainingFocus === option.value && styles.baselineChoiceTextSelected]}>{option.label}</Text></Pressable>)}
      </View>
      {needsBaseline ? <>
        <Label text="Current 40-yard time" />
        <View accessibilityRole="radiogroup" style={styles.baselineChoiceRow}>
          {([
            { value: 'known' as const, label: 'I know my time' },
            { value: 'untested' as const, label: 'I haven’t tested yet' },
          ]).map(option => <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: baselineStatus === option.value }}
            onPress={() => chooseStatus(option.value)}
            style={[styles.baselineChoice, baselineStatus === option.value && styles.baselineChoiceSelected]}
          ><Text style={[styles.baselineChoiceText, baselineStatus === option.value && styles.baselineChoiceTextSelected]}>{option.label}</Text></Pressable>)}
        </View>
        {baselineStatus === 'known' ? <>
          <PerformanceTimeWheel
            label="Current 40-yard dash"
            value={item.fortyYardDashTime ?? null}
            onChange={fortyYardDashTime => update({ footballProfile: { ...item, baselineStatus: 'known', fortyYardDashTime: fortyYardDashTime ?? undefined }, sportProfileAnswered: true })}
            minimumSeconds={4}
            maximumSeconds={9}
            suggestedSeconds={5}
            showActions={false}
            showUnit
            hint={item.fortyYardDashTime ? null : 'Adjust either wheel to enter your time.'}
          />
          {item.fortyYardDashTime ? <View style={styles.timingMethodBlock}>
            <Label text="How was it timed?" />
            <View accessibilityRole="radiogroup" style={styles.timingMethodChips}>
              {([
                { value: 'hand-timed' as TimingMethod, label: 'Hand timed' },
                { value: 'electronic-timing' as TimingMethod, label: 'Electronic / laser' },
                { value: 'unknown' as TimingMethod, label: 'Not sure' },
              ]).map(option => <Chip key={option.value} label={option.label} selected={item.fortyYardTimingMethod === option.value} onPress={() => chooseTimingMethod(option.value)} />)}
            </View>
            <Text style={styles.consistencyNote}>For accurate comparisons, use the same timing method when you retest.</Text>
          </View> : null}
        </> : baselineStatus === 'untested' ? <View style={styles.baselineReassurance}><Text style={styles.baselineReassuranceText}>No problem—we’ll help you establish one later.</Text></View> : null}
      </> : null}
    </Question>;
  }
  return <Question title="Your speed foundation" subtitle="You do not need testing numbers or a position to begin.">
    <View style={styles.scopeCard}>
      <Text style={styles.scopeTitle}>General linear-speed plan</Text>
      <Text style={styles.scopeCopy}>Your plan will develop acceleration, upright speed, strength, and recovery around the schedule you provide.</Text>
    </View>
  </Question>;
}

function TargetStep({ profile, update, onContinue }: Props & { onContinue: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const sport = profile.primarySport ?? profile.sport ?? 'track-and-field';
  if (sport === 'football') {
    const item = profile.footballProfile ?? {};
    if (item.trainingFocus === 'game-speed') {
      return <Question title="What are you building toward?" subtitle="Your game-speed priorities will guide the plan instead of a 40-yard target.">
        <View style={styles.scopeCard}><Text style={styles.scopeTitle}>Direction, not a guarantee</Text><Text style={styles.scopeCopy}>Your selected priorities shape which acceleration, top-speed, and repeat-sprint sessions appear. You can review and edit the week before saving it.</Text></View>
        <PrimaryOnboardingButton title="Use my priorities" onPress={onContinue} />
      </Question>;
    }
    const target = item.targetFortyYardDashTime ?? null;
    return <Question title="What 40-yard time are you chasing?" subtitle="This target gives the pathway direction. Consistent training—not an app promise—is what closes the gap.">
      <PerformanceTimeWheel
        label="Target 40-yard dash"
        value={target}
        onChange={targetFortyYardDashTime => update({ footballProfile: { ...item, targetFortyYardDashTime: targetFortyYardDashTime ?? undefined } })}
        minimumSeconds={4}
        maximumSeconds={9}
        suggestedSeconds={target ?? item.fortyYardDashTime ?? 5}
      />
      {target ? <CommitmentHoldButton title={`Hold to lock ${target.toFixed(2)} seconds`} completedTitle={`${target.toFixed(2)} locked`} icon="◎" duration={900} onComplete={onContinue} /> : <PrimaryOnboardingButton title="I don’t know it yet" onPress={onContinue} />}
      {target ? <SecondaryOnboardingButton title="Skip target for now" onPress={onContinue} /> : null}
    </Question>;
  }
  if (sport !== 'track-and-field') {
    return <Question title="What are you building toward?" subtitle="Your selected speed qualities will guide a general linear-speed foundation. Sport-specific claims and irrelevant testing metrics stay out.">
      <View style={styles.scopeCard}><Text style={styles.scopeTitle}>Direction, not a guarantee</Text><Text style={styles.scopeCopy}>Your goals shape which acceleration, upright-speed, strength, and low-intensity sessions appear. You can review and edit the week before saving it.</Text></View>
      <PrimaryOnboardingButton title="Use my speed goals" onPress={onContinue} />
    </Question>;
  }
  const event = profile.targetEvent ?? profile.primaryEvent;
  const target = profile.targetPerformances?.find(item => item.event === event);
  const updateTarget = (time: number | null) => {
    const targets = profile.targetPerformances?.filter(item => item.event !== event) ?? [];
    update({
      targetEvent: event,
      targetPerformances: time
        ? [...targets, { event, timeSeconds: time }]
        : targets,
    });
  };
  const range = getTrackPerformanceInputRange(event);
  const targetLabel = target ? `${target.timeSeconds.toFixed(2)} seconds` : '';
  return <Question title="What are you chasing?" subtitle="Lock in a target if you have one. SprintLab uses it as direction, never as a performance promise.">
    <>
      <Label text="Target event" />
      <View style={styles.chips}>{events.map(option => <Chip key={option} label={option} selected={event === option} onPress={() => update({ targetEvent: option })} />)}</View>
    </>
    {(
      <PerformanceTimeWheel
        key={`target:${event}`}
        label={`${event} target`}
        value={target?.timeSeconds ?? null}
        onChange={updateTarget}
        minimumSeconds={range.minimum}
        maximumSeconds={range.maximum}
        suggestedSeconds={target?.timeSeconds ?? profile.personalBests.find(item => item.event === event)?.timeSeconds ?? range.suggested}
      />
    )}
    {target ? <CommitmentHoldButton title={`Hold to lock ${targetLabel}`} completedTitle={`${target.timeSeconds.toFixed(2)} locked`} icon="◎" duration={900} onComplete={onContinue} /> : <PrimaryOnboardingButton title="I’m not sure yet" onPress={onContinue} />}
    {target ? <SecondaryOnboardingButton title="Skip target for now" onPress={onContinue} /> : null}
  </Question>;
}

function ExperienceStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const options: { label: string; detail: string; value: AthleteExperienceLevel }[] = [
    {
      label: 'New to structured speed training',
      detail: 'I haven’t followed a sprint-specific program before.',
      value: 'beginner',
    },
    {
      label: 'Some structured training',
      detail: 'I’ve trained speed intentionally, but not consistently.',
      value: 'developing',
    },
    {
      label: 'Consistent structured training',
      detail: 'I regularly follow planned sprint and strength sessions.',
      value: 'intermediate',
    },
    {
      label: 'Experienced sprint training',
      detail: 'I’m comfortable with coached, progressive sprint programming.',
      value: 'advanced',
    },
  ];
  return <Question title="How experienced are you with structured speed training?">
    <View accessibilityRole="radiogroup" style={styles.stack}>
      {options.map(option => <SelectableCard
        key={option.value}
        label={option.label}
        detail={option.detail}
        selected={Boolean(profile.experienceAnswered) && profile.experienceLevel === option.value}
        onPress={() => update({ experienceLevel: option.value, experienceAnswered: true })}
      />)}
    </View>
  </Question>;
}
function FrequencyStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const options = [
    { value: 2, label: '2 days — Focused plan', detail: 'Two efficient speed-focused sessions for a busy schedule.' },
    { value: 3, label: '3 days — Core plan', detail: 'Speed, technique, and strength across three sessions.' },
    { value: 4, label: '4 days — Balanced plan', detail: 'A complete mix of faster and lower-intensity training days.' },
    { value: 5, label: '5 days — Full training week', detail: 'The most complete schedule, including speed, strength, and recovery-focused work.' },
  ];
  const chooseFrequency = (value: number) => {
    if (profile.trainingDaysPerWeek === value) return;
    update({ trainingDaysPerWeek: value, availableTrainingDays: [], exactTrainingDaysPreference: undefined });
  };
  const chooseTrainingDay = (day: TrainingDay) => {
    if (profile.availableTrainingDays.includes(day)) {
      update({ availableTrainingDays: profile.availableTrainingDays.filter(item => item !== day) });
      return;
    }
    if (profile.availableTrainingDays.length >= profile.trainingDaysPerWeek) return;
    update({ availableTrainingDays: [...profile.availableTrainingDays, day] });
  };
  const exactDaysSelected = profile.exactTrainingDaysPreference === true;
  const selectedCount = profile.availableTrainingDays.length;
  return <Question title="How many days can SprintLab plan each week?" subtitle="Count the complete plan, including speed, technique, lower-intensity work, and paired strength.">
    <View accessibilityRole="radiogroup" style={styles.stack}>{options.map(option => <SelectableCard key={option.value} label={option.label} detail={option.detail} selected={profile.trainingDaysPerWeek === option.value} onPress={() => chooseFrequency(option.value)} />)}
    </View>
    {profile.trainingDaysPerWeek >= 2 ? <View style={styles.scheduleSection}>
      <View style={styles.scheduleHeading}>
        <Text style={styles.scheduleTitle}>Want to choose the exact days?</Text>
        <Text style={styles.inputHelp}>Optional—you can let SprintLab arrange them for you.</Text>
      </View>
      <View accessibilityRole="radiogroup" style={styles.scheduleChoiceRow}>
        <Chip
          label="Yes"
          selected={exactDaysSelected}
          onPress={() => update({ exactTrainingDaysPreference: true })}
        />
        <Chip
          label="No"
          selected={profile.exactTrainingDaysPreference === false}
          onPress={() => update({ exactTrainingDaysPreference: false, availableTrainingDays: [] })}
        />
      </View>
      {exactDaysSelected ? <View style={styles.scheduleSubsection}>
        <View style={styles.scheduleCounterRow}>
          <Label text="Choose your training days" />
          <Text accessibilityLiveRegion="polite" style={styles.scheduleCounter}>{selectedCount} of {profile.trainingDaysPerWeek} days selected</Text>
        </View>
        <View style={styles.chips}>{weekdays.map(day => {
          const disabled = Boolean(profile.preferredRestDayAnswered && profile.preferredRestDay === day);
          return <Chip
            key={day}
            label={day.slice(0, 3)}
            selected={profile.availableTrainingDays.includes(day)}
            disabled={disabled}
            onPress={() => chooseTrainingDay(day)}
          />;
        })}</View>
      </View> : null}
    </View> : null}
    {profile.trainingDaysPerWeek >= 2 ? <View style={styles.scheduleSection}>
      <View style={styles.scheduleHeading}>
        <Text style={styles.scheduleTitle}>Preferred full rest day (optional)</Text>
        <Text style={styles.inputHelp}>SprintLab won’t schedule training on this day.</Text>
      </View>
      <View style={styles.chips}>
        <Chip label="No preference" selected={!profile.preferredRestDayAnswered} onPress={() => update({ preferredRestDayAnswered: false })} />
        {weekdays.map(day => {
          const disabled = exactDaysSelected && profile.availableTrainingDays.includes(day);
          return <Chip
            key={day}
            label={day.slice(0, 3)}
            selected={Boolean(profile.preferredRestDayAnswered && profile.preferredRestDay === day)}
            disabled={disabled}
            onPress={() => update({ preferredRestDay: day, preferredRestDayAnswered: true })}
          />;
        })}
      </View>
      <Text style={styles.inputHelp}>Unscheduled days remain open for team practice, competition, or rest.</Text>
    </View> : null}
  </Question>;
}
function DemandsStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const demands = profile.currentTrainingDemands ?? [];
  const placingCommitments = Boolean(profile.commitmentSchedulePlaced && !demands.includes('none'));
  const has = (demand: TrainingDemand) => demands.includes(demand);
  const demandOptions: { value: TrainingDemand; label: string }[] = [
    { value: 'team-practices', label: 'Team practices' },
    { value: 'games-or-meets', label: 'Games or meets' },
    { value: 'another-sport', label: 'Another sport' },
    { value: 'heavy-school-schedule', label: 'Busy school schedule' },
    { value: 'none', label: 'None of these' },
  ];

  const select = (value: TrainingDemand) => {
    if (value === 'none') {
      update({
        currentTrainingDemands: has('none') ? [] : ['none'],
        sportPracticeDays: [],
        gameOrCompetitionDays: [],
        gameScheduleVaries: false,
        otherSportDays: [],
        busySchoolDays: [],
        commitmentSchedulePlaced: false,
      });
      return;
    }

    const withoutNone = demands.filter(item => !(['none', 'weight-training'] as TrainingDemand[]).includes(item));
    const removing = withoutNone.includes(value);
    const next = removing ? withoutNone.filter(item => item !== value) : [...withoutNone, value];
    const clearedDetails: Partial<AthleteProfile> = {};
    if (removing && value === 'team-practices') clearedDetails.sportPracticeDays = [];
    if (removing && value === 'games-or-meets') {
      clearedDetails.gameOrCompetitionDays = [];
      clearedDetails.gameScheduleVaries = false;
    }
    if (removing && value === 'another-sport') clearedDetails.otherSportDays = [];
    if (removing && value === 'heavy-school-schedule') clearedDetails.busySchoolDays = [];
    update({
      currentTrainingDemands: next,
      commitmentSchedulePlaced: false,
      ...clearedDetails,
    });
  };

  if (!placingCommitments) {
    return <Question
      title="What else is already on your schedule?"
      subtitle="Select any regular commitments SprintLab should plan around."
    >
      <View style={styles.stack}>
        {demandOptions.map(option => <MultiSelectCard
          key={option.value}
          label={option.label}
          selected={has(option.value)}
          onPress={() => select(option.value)}
        />)}
      </View>
    </Question>;
  }

  const recurringGameDays = (profile.gameOrCompetitionDays ?? [])
    .filter((value): value is TrainingDay => weekdays.includes(value as TrainingDay));
  const chooseGameDay = (day: TrainingDay) => update({
    gameOrCompetitionDays: recurringGameDays.includes(day) ? [] : [day],
    gameScheduleVaries: false,
  });

  return <Question
    title="Place your commitments"
    subtitle="Choose the usual days. SprintLab will use them to avoid conflicts when arranging your week."
  >
    <View style={styles.stack}>
      {has('team-practices') ? <DayChooser
        title="Team practice days"
        days={profile.sportPracticeDays ?? []}
        onChange={sportPracticeDays => update({ sportPracticeDays })}
      /> : null}
      {has('games-or-meets') ? <View style={styles.dayChooser}>
        <Label text="Usual game or meet day" />
        <View style={styles.chips}>
          {weekdays.map(day => <Chip
            key={day}
            label={day.slice(0, 3)}
            selected={!profile.gameScheduleVaries && recurringGameDays.includes(day)}
            onPress={() => chooseGameDay(day)}
          />)}
          <Chip
            label="Varies"
            selected={Boolean(profile.gameScheduleVaries)}
            onPress={() => update({
              gameScheduleVaries: !profile.gameScheduleVaries,
              gameOrCompetitionDays: [],
            })}
          />
        </View>
      </View> : null}
      {has('another-sport') ? <DayChooser
        title="Other sport days"
        days={profile.otherSportDays ?? []}
        onChange={otherSportDays => update({ otherSportDays })}
      /> : null}
      {has('heavy-school-schedule') ? <DayChooser
        title="Days when training time is most limited"
        days={profile.busySchoolDays ?? []}
        onChange={busySchoolDays => update({ busySchoolDays })}
      /> : null}
    </View>
    <Text style={styles.inputHelp}>
      Busy school days guide session placement and duration. They do not remove important speed or strength work.
    </Text>
  </Question>;
}
function LimitationsStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [showWhy, setShowWhy] = useState(false);
  const noConcerns = 'No current concerns';
  const returning = 'Returning after time off';
  const coachRestriction = 'Coach restrictions';
  const medicalRestriction = 'Medical restrictions';
  const concernOptions: {
    label: string;
    area: TrainingConcernArea;
    painArea: PainArea;
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
  }[] = [
    { label: 'Hamstring', area: 'hamstring', painArea: 'hamstring', icon: 'directions-run' },
    { label: 'Knee', area: 'knee', painArea: 'knee', icon: 'accessibility-new' },
    { label: 'Achilles or ankle', area: 'achilles-or-ankle', painArea: 'achilles', icon: 'directions-walk' },
    { label: 'Back', area: 'back', painArea: 'lower-back', icon: 'airline-seat-flat' },
    { label: 'Shoulder', area: 'shoulder', painArea: 'other', icon: 'fitness-center' },
    { label: 'Other area', area: 'other', painArea: 'other', icon: 'add-circle-outline' },
  ];
  const current = profile.onboardingLimitations ?? [];
  const details = profile.trainingConcernDetails ?? [];
  const reviewing = Boolean(profile.trainingConstraintsReviewed);
  const selected = (label: string) => current.includes(label);
  const physicalLabels = concernOptions.map(option => option.label);

  const syncConcernContext = (
    nextLimitations: string[],
    nextDetails = details,
    additional: Partial<AthleteProfile> = {},
  ) => {
    const selectedOptions = concernOptions.filter(option => nextLimitations.includes(option.label));
    const selectedAreas = new Set(selectedOptions.map(option => option.area));
    const filteredDetails = nextDetails.filter(detail => selectedAreas.has(detail.area));
    update({
      onboardingLimitations: nextLimitations,
      trainingConcernDetails: filteredDetails,
      cautionAreas: [...new Set(selectedOptions.map(option => option.painArea))],
      currentPain: filteredDetails.some(detail => detail.status === 'currently-limiting'),
      trainingConstraintsReviewed: false,
      ...additional,
    });
  };

  const toggleConcern = (option: (typeof concernOptions)[number]) => {
    const active = selected(option.label);
    const next = active
      ? current.filter(label => label !== option.label)
      : [...current.filter(label => label !== noConcerns), option.label];
    syncConcernContext(next, details, option.area === 'other' && active ? { otherConcernArea: '' } : {});
  };

  const selectNoConcerns = () => {
    const nonPhysical = current.filter(label => !physicalLabels.includes(label) && label !== noConcerns);
    syncConcernContext([...nonPhysical, noConcerns], [], {
      otherConcernArea: '',
      hamstringLimitationSeverity: undefined,
    });
  };

  const toggleSituation = (label: string) => {
    const next = toggle(current, label);
    update({
      onboardingLimitations: next,
      trainingConstraintsReviewed: false,
      ...(label === returning
        ? {
            returningAfterTimeOff: next.includes(returning),
            timeAwayDuration: next.includes(returning) ? profile.timeAwayDuration : undefined,
          }
        : {}),
      ...(label === coachRestriction && !next.includes(coachRestriction) ? { coachRestrictions: '' } : {}),
      ...(label === medicalRestriction && !next.includes(medicalRestriction) ? { medicalRestrictions: '' } : {}),
    });
  };

  const setConcernStatus = (area: TrainingConcernArea, status: TrainingConcernStatus) => {
    const nextDetails = [...details.filter(detail => detail.area !== area), { area, status }];
    update({
      trainingConcernDetails: nextDetails,
      currentPain: nextDetails.some(detail => detail.status === 'currently-limiting'),
    });
  };

  const row = (
    label: string,
    icon: React.ComponentProps<typeof MaterialIcons>['name'],
    onPress: () => void,
  ) => {
    const active = selected(label);
    return <Pressable
      key={label}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.limitationChip,
        active && styles.limitationChipSelected,
        pressed && styles.limitationChipPressed,
      ]}
    >
      <MaterialIcons name={icon} size={20} style={[styles.limitationIcon, active && styles.limitationIconSelected]} />
      <Text style={[styles.limitationChipText, active && styles.limitationChipTextSelected]}>{label}</Text>
      <View style={[styles.limitationCheckbox, active && styles.limitationCheckboxSelected]}>
        {active ? <MaterialIcons name="check" size={16} color="#080D12" /> : null}
      </View>
    </Pressable>;
  };

  if (reviewing) {
    const statusOptions: { value: TrainingConcernStatus; label: string; detail: string }[] = [
      { value: 'currently-limiting', label: 'Currently limiting', detail: 'It changes what you can safely do now.' },
      { value: 'recently-cleared', label: 'Recently cleared', detail: 'You have been cleared and are rebuilding normal training.' },
      { value: 'monitoring', label: 'Monitoring', detail: 'It is not currently limiting training, but you want it tracked.' },
    ];
    const timeAwayOptions: { value: TimeAwayDuration; label: string }[] = [
      { value: 'under-2-weeks', label: 'Less than 2 weeks' },
      { value: '2-6-weeks', label: '2–6 weeks' },
      { value: '6-12-weeks', label: '6–12 weeks' },
      { value: '3-plus-months', label: '3+ months' },
    ];

    return <Question title="Review your training constraints" subtitle="Answer only the follow-ups that apply. SprintLab does not diagnose injuries.">
      <View style={styles.stack}>
        {concernOptions.filter(option => selected(option.label)).map(option => {
          const activeStatus = details.find(detail => detail.area === option.area)?.status;
          return <View key={option.area} style={styles.constraintFollowupCard}>
            <View style={styles.constraintFollowupHeader}>
              <MaterialIcons name={option.icon} size={19} color={palette.accent} />
              <Text style={styles.constraintFollowupTitle}>{option.label}</Text>
            </View>
            <Text style={styles.inputHelp}>How is this affecting training right now?</Text>
            <View style={styles.constraintStatusStack}>
              {statusOptions.map(status => <Pressable
                key={status.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: activeStatus === status.value }}
                onPress={() => setConcernStatus(option.area, status.value)}
                style={[styles.constraintStatusRow, activeStatus === status.value && styles.constraintStatusRowSelected]}
              >
                <View style={[styles.constraintRadio, activeStatus === status.value && styles.constraintRadioSelected]} />
                <View style={styles.constraintStatusCopy}>
                  <Text style={[styles.constraintStatusLabel, activeStatus === status.value && styles.constraintStatusLabelSelected]}>{status.label}</Text>
                  <Text style={styles.constraintStatusDetail}>{status.detail}</Text>
                </View>
              </Pressable>)}
            </View>
            {activeStatus === 'currently-limiting' ? <Text style={styles.constraintSafetyNotice}>
              SprintLab will not treat this answer as clearance to train. Follow guidance from a qualified medical professional.
            </Text> : null}
          </View>;
        })}
        {selected(returning) ? <View style={styles.constraintFollowupCard}>
          <View style={styles.constraintFollowupHeader}>
            <MaterialIcons name="pause-circle-outline" size={19} color={palette.accent} />
            <Text style={styles.constraintFollowupTitle}>How long were you away?</Text>
          </View>
          <View style={styles.chips}>{timeAwayOptions.map(option => <Chip
            key={option.value}
            label={option.label}
            selected={profile.timeAwayDuration === option.value}
            onPress={() => update({ timeAwayDuration: option.value })}
          />)}</View>
          <Text style={styles.inputHelp}>This adjusts starting volume and progression—not the core movements in your plan.</Text>
        </View> : null}
        {selected(coachRestriction) ? <View style={styles.constraintFollowupCard}>
          <Label text="What restriction did your coach give you?" />
          <TextInput
            accessibilityLabel="Coach restriction"
            value={profile.coachRestrictions ?? ''}
            onChangeText={coachRestrictions => update({ coachRestrictions })}
            placeholder="Record it in your coach’s words"
            placeholderTextColor={palette.muted}
            multiline
            style={styles.constraintTextInput}
          />
        </View> : null}
        {selected(medicalRestriction) ? <View style={styles.constraintFollowupCard}>
          <Label text="What restriction did your medical professional give you?" />
          <TextInput
            accessibilityLabel="Medical restriction"
            value={profile.medicalRestrictions ?? ''}
            onChangeText={medicalRestrictions => update({ medicalRestrictions })}
            placeholder="Record the restriction exactly as provided"
            placeholderTextColor={palette.muted}
            multiline
            style={styles.constraintTextInput}
          />
          <Text style={styles.constraintSafetyNotice}>SprintLab will not reinterpret or override a medical restriction.</Text>
        </View> : null}
      </View>
    </Question>;
  }

  return <Question
    title="Anything affecting your training?"
    subtitle="Include current physical concerns, time away, or restrictions from a coach or medical professional."
  >
    <View style={styles.limitationSection}>
      <Text style={styles.limitationHeading}>CURRENT PHYSICAL CONCERNS</Text>
      <View style={styles.limitationGrid}>
        {concernOptions.map(option => row(option.label, option.icon, () => toggleConcern(option)))}
        {row(noConcerns, 'check-circle-outline', selectNoConcerns)}
      </View>
      {selected('Other area') ? <TextInput
        accessibilityLabel="Other area affecting training"
        value={profile.otherConcernArea ?? ''}
        onChangeText={otherConcernArea => update({ otherConcernArea })}
        placeholder="Name the area"
        placeholderTextColor={palette.muted}
        style={styles.constraintTextInput}
      /> : null}
    </View>
    <View style={styles.limitationSection}>
      <Text style={styles.limitationHeading}>CURRENT TRAINING SITUATION</Text>
      {row(returning, 'pause-circle-outline', () => toggleSituation(returning))}
    </View>
    <View style={styles.limitationSection}>
      <Text style={styles.limitationHeading}>REQUIRED RESTRICTIONS</Text>
      <View style={styles.limitationGrid}>
        {row(coachRestriction, 'assignment-late', () => toggleSituation(coachRestriction))}
        {row(medicalRestriction, 'medical-services', () => toggleSituation(medicalRestriction))}
      </View>
    </View>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: showWhy }}
      onPress={() => setShowWhy(value => !value)}
      style={styles.whyButton}
    >
      <Text style={styles.whyButtonText}>Why are we asking this?</Text>
      <MaterialIcons name={showWhy ? 'expand-less' : 'expand-more'} size={18} color={palette.muted} />
    </Pressable>
    {showWhy ? <Text style={styles.whyCopy}>
      SprintLab uses this to adjust training load and avoid known restrictions. It does not diagnose injuries or replace medical care.
    </Text> : null}
  </Question>;
}
function SeasonStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const calendar = profile.seasonCalendar ?? { competitionStatus: 'unknown' as CompetitionStatus, priorityMeets: [] };
  const prompts = seasonDatePrompts(calendar.competitionStatus);
  const setStatus = (status: Exclude<CompetitionStatus, 'unknown'>) => {
    if (calendar.competitionStatus === status) return;
    const retainedMeets = calendar.priorityMeets.filter(item => !item.id.startsWith('onboarding-calendar:') && !item.id.startsWith('onboarding-first-meet'));
    update({
      seasonCalendar: {
        ...calendar,
        competitionStatus: status,
        seasonStartDate: null,
        seasonEndDate: null,
        firstMeetDate: null,
        championshipDate: null,
        priorityMeets: retainedMeets,
      },
      nextMeetDate: null,
      championshipDate: null,
    });
  };
  const syncDate = (key: SeasonDateKey, date: string | null) => {
    const nextCalendar = { ...calendar, [key]: date };
    const retainedMeets = nextCalendar.priorityMeets.filter(item => !item.id.startsWith('onboarding-calendar:') && !item.id.startsWith('onboarding-first-meet'));
    if (nextCalendar.firstMeetDate) {
      retainedMeets.push({
        id: `onboarding-calendar:first:${nextCalendar.firstMeetDate}`,
        name: calendar.competitionStatus === 'in-season' ? 'Next competition' : 'First competition',
        date: nextCalendar.firstMeetDate,
        priority: 'B',
        events: [profile.primaryEvent],
        estimated: true,
      });
    }
    if (nextCalendar.championshipDate) {
      retainedMeets.push({
        id: `onboarding-calendar:priority:${nextCalendar.championshipDate}`,
        name: calendar.competitionStatus === 'in-season' ? 'Most important remaining competition' : 'Most important competition',
        date: nextCalendar.championshipDate,
        priority: 'A',
        events: [profile.primaryEvent],
        estimated: true,
      });
    }
    update({
      seasonCalendar: { ...nextCalendar, priorityMeets: retainedMeets },
      nextMeetDate: nextCalendar.firstMeetDate ?? null,
      championshipDate: nextCalendar.championshipDate ?? null,
    });
  };
  const clearDates = () => {
    const retainedMeets = calendar.priorityMeets.filter(item => !item.id.startsWith('onboarding-calendar:') && !item.id.startsWith('onboarding-first-meet'));
    update({
      seasonCalendar: {
        ...calendar,
        seasonStartDate: null,
        seasonEndDate: null,
        firstMeetDate: null,
        championshipDate: null,
        priorityMeets: retainedMeets,
      },
      nextMeetDate: null,
      championshipDate: null,
    });
  };
  return <Question title="Where are you in your competitive year?" subtitle="Choose the closest status. Estimated dates are fine and can be changed later.">
    <View style={styles.stack}>{seasonStatuses.map(status => <SelectableCard key={status.value} label={status.label} detail={status.detail} selected={calendar.competitionStatus === status.value} onPress={() => setStatus(status.value)} />)}</View>
    {prompts ? <>
      <Label text={prompts[0].label} />
      <NativeDateField value={calendar[prompts[0].key]} onChange={date => syncDate(prompts[0].key, date)} accessibilityLabel={`Choose ${prompts[0].label.toLowerCase()}`} />
      <Label text={prompts[1].label} />
      <NativeDateField value={calendar[prompts[1].key]} onChange={date => syncDate(prompts[1].key, date)} accessibilityLabel={`Choose ${prompts[1].label.toLowerCase()}`} />
      <Pressable accessibilityRole="button" accessibilityLabel="I do not know either competition date yet" onPress={clearDates} style={styles.unknownDateButton}>
        <Text style={styles.unknownDateText}>I don’t know either date yet</Text>
      </Pressable>
    </> : null}
    <Text style={styles.inputHelp}>You can add your complete competition calendar later.</Text>
  </Question>;
}
function ModeStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const selected = getTrainingWorkflow(profile);
  useEffect(() => {
    if (!profile.trainingPlanModeAnswered) {
      update(trainingWorkflowChanges('sprintlab-plan'));
    }
  }, [profile.trainingPlanModeAnswered, update]);
  const modes: { workflow: TrainingWorkflow; label: string; detail: string }[] = [
    { workflow: 'sprintlab-plan', label: 'Build a SprintLab plan', detail: 'Get an editable training week based on your goals, schedule, and equipment.' },
    { workflow: 'coach-plan', label: 'Follow my coach’s plan', detail: 'Add your coach’s sessions, then use SprintLab to schedule, complete, and analyze them.' },
    { workflow: 'combined', label: 'Combine both', detail: 'Keep coach-assigned sessions while using SprintLab recommendations to fill appropriate gaps.' },
    { workflow: 'log-only', label: 'Log without a plan', detail: 'Record workouts and track progress without creating a training calendar.' },
  ];
  return <Question title="How should SprintLab help?" subtitle="Choose how you want to organize your training. You can change this later.">
    <View style={styles.stack}>{modes.map(mode => <SelectableCard key={mode.workflow} label={mode.label} detail={mode.detail} selected={selected === mode.workflow} onPress={() => update(trainingWorkflowChanges(mode.workflow))} />)}</View>
  </Question>;
}
function ReminderStep({ profile, update }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [customPickerRequest, setCustomPickerRequest] = useState(0);
  const presets = [
    { label: 'Morning', detail: '7:00 AM', hour: 7, minute: 0 },
    { label: 'After school', detail: '4:00 PM', hour: 16, minute: 0 },
    { label: 'Evening', detail: '6:30 PM', hour: 18, minute: 30 },
  ];
  const selectedTime = `${profile.workoutReminderHour ?? 16}:${profile.workoutReminderMinute ?? 0}`;
  const custom = Boolean(profile.workoutReminderCustomTime);
  const answered = Boolean(profile.workoutReminderAnswered);
  const chooseCustom = () => {
    update({
      workoutReminderEnabled: true,
      workoutReminderHour: profile.workoutReminderHour ?? 16,
      workoutReminderMinute: profile.workoutReminderMinute ?? 0,
      workoutReminderCustomTime: true,
      workoutReminderAnswered: true,
    });
    setCustomPickerRequest(current => current + 1);
  };
  return (
    <Question
      title="When should Split remind you to train?"
      subtitle="On workout days, the reminder previews the session name, exercise count, and estimated time. You can change this later in Settings."
    >
      <View style={styles.stack}>
        {presets.map(preset => (
          <SelectableCard
            key={preset.label}
            label={preset.label}
            detail={preset.detail}
            selected={answered && Boolean(profile.workoutReminderEnabled) && !custom && selectedTime === `${preset.hour}:${preset.minute}`}
            onPress={() => update({
              workoutReminderEnabled: true,
              workoutReminderHour: preset.hour,
              workoutReminderMinute: preset.minute,
              workoutReminderCustomTime: false,
              workoutReminderAnswered: true,
            })}
          />
        ))}
        <SelectableCard
          label="Custom time"
          detail={answered && profile.workoutReminderEnabled && custom
            ? reminderTimeLabel(profile.workoutReminderHour, profile.workoutReminderMinute)
            : 'Choose a time that fits your schedule.'}
          selected={answered && Boolean(profile.workoutReminderEnabled) && custom}
          onPress={chooseCustom}
        />
        <SelectableCard
          label="No workout reminders"
          detail="Keep notifications off for now."
          selected={answered && !profile.workoutReminderEnabled}
          onPress={() => update({
            workoutReminderEnabled: false,
            workoutReminderCustomTime: false,
            workoutReminderAnswered: true,
          })}
        />
      </View>
      {profile.workoutReminderEnabled && custom ? (
        <NativeTimeField
          hour={profile.workoutReminderHour ?? 16}
          minute={profile.workoutReminderMinute ?? 0}
          openRequestKey={customPickerRequest}
          hideTrigger={Platform.OS !== 'web'}
          onChange={(workoutReminderHour, workoutReminderMinute) => update({
            workoutReminderEnabled: true,
            workoutReminderHour,
            workoutReminderMinute,
            workoutReminderCustomTime: true,
            workoutReminderAnswered: true,
          })}
        />
      ) : null}
      {answered && profile.workoutReminderEnabled ? (
        <Text style={styles.reminderSummary}>
          Planned workout days at {reminderTimeLabel(profile.workoutReminderHour, profile.workoutReminderMinute)}
        </Text>
      ) : null}
    </Question>
  );
}

function SourcesStep() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const sources = [
    { name: 'World Athletics', detail: 'Coaching education resources' },
    { name: 'Peer-reviewed sprint-training research', detail: 'Speed-development and programming reviews' },
    { name: 'National Strength and Conditioning Association', detail: 'Youth and long-term athletic-development resources' },
    { name: 'IOC and British Journal of Sports Medicine', detail: 'Athlete-monitoring and training-load guidance' },
    { name: '40-yard and linear-speed research', detail: 'Acceleration and testing evidence' },
  ];
  return <Question title="Reviewed training, not random workouts" subtitle="SprintLab’s authored workout library draws from published coaching resources and peer-reviewed research.">
    <View style={styles.sourceCard}>
      {sources.map(source => (
        <View key={source.name} style={styles.researchSourceRow}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.researchSourceBadge}>
            <MaterialIcons name="check" size={16} color="#C9FF18" />
          </View>
          <View style={styles.researchSourceCopy}>
            <Text style={styles.researchSourceName}>{source.name}</Text>
            <Text style={styles.researchSourceDetail}>{source.detail}</Text>
          </View>
        </View>
      ))}
    </View>
    <Text style={styles.inputHelp}>These resources inform SprintLab’s library and planning rules. Their inclusion does not imply endorsement or partnership.</Text>
  </Question>;
}


function RevealStep({ profile, go }: { profile: AthleteProfile; go: (step: number) => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Question title="Your speed profile" subtitle="Your starting setup, ready for review.">
    <ProfileRevealCard title={profile.name.trim() || 'Athlete'}>
      <Text style={styles.revealText}>{profileSummary(profile)}</Text>
      <Text style={styles.revealDetail}>{classificationExplanation(profile)}</Text>
      <ProfileRow label="Goals" value={(profile.speedGoals ?? []).map(pretty).join(' · ') || 'Not selected'} />
      <ProfileRow label="Training" value={profile.availableTrainingDays.length ? profile.availableTrainingDays.map(day => day.slice(0, 3)).join(', ') : `${profile.trainingDaysPerWeek} days each week`} />
      <ProfileRow label="Preferred rest" value={profile.preferredRestDayAnswered ? pretty(profile.preferredRestDay) : 'No preference'} />
    </ProfileRevealCard>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit onboarding answers"
      onPress={() => go(3)}
      style={({ pressed }) => [styles.revealEdit, pressed && styles.revealEditPressed]}
    >
      <MaterialIcons name="edit" size={14} color={palette.muted} />
      <Text style={styles.revealEditText}>Edit answers</Text>
    </Pressable>
  </Question>;
}

function DayChooser({ title, days, onChange }: { title: string; days: TrainingDay[]; onChange: (days: TrainingDay[]) => void }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <View style={styles.dayChooser}><Label text={title} /><View style={styles.chips}>{weekdays.map(day => <Chip key={day} label={day.slice(0, 3)} selected={days.includes(day)} onPress={() => onChange(toggle(days, day))} />)}</View></View>; }
function ProfileRow({ label, value }: { label: string; value: string }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <View style={styles.profileRow}><Text style={styles.profileLabel}>{label}</Text><Text style={styles.profileValue}>{value}</Text></View>; }
function Label({ text }: { text: string }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <Text style={styles.label}>{text}</Text>; }
function Chip({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}><Text style={[styles.chipText, selected && styles.chipTextSelected, disabled && styles.chipTextDisabled]}>{label}</Text></Pressable>; }
type Props = { profile: AthleteProfile; update: (value: Partial<AthleteProfile>) => void };

function validateStep(step: number, profile: AthleteProfile) {
  if (step === 3 && !(profile.sports?.length)) return 'Select at least one sport or speed focus.';
  if (step === 4 && (profile.sports?.length ?? 0) > 1 && (!profile.primarySportAnswered || !profile.primarySport || !profile.sports?.includes(profile.primarySport))) return 'Choose the main focus for this speed profile.';
  if (step === 5 && profile.primarySport === 'track-and-field' && !(profile.raceDevelopmentAreas?.length)) return 'Choose one or two race areas—or choose “I’m not sure yet.”';
  if (step === 5 && profile.primarySport !== 'track-and-field' && !(profile.speedGoals?.length)) return 'Choose at least one speed quality.';
  if (step === 6 && profile.primarySport === 'track-and-field' && !profile.sportProfileAnswered) return 'Choose your primary track event. Performance times can remain blank.';
  if (step === 6 && profile.primarySport === 'football') {
    const baseline = profile.footballProfile;
    if (!baseline?.trainingFocus) return 'Choose what you’re training speed for.';
    const needsBaseline = baseline.trainingFocus === 'forty-yard' || baseline.trainingFocus === 'both';
    if (needsBaseline) {
      const status = baseline.baselineStatus ?? (baseline.fortyYardDashTime ? 'known' : undefined);
      if (!status) return 'Choose whether you know your current 40-yard time.';
      if (status === 'known' && !baseline.fortyYardDashTime) return 'Adjust the wheels to enter your current 40-yard time.';
      if (status === 'known' && !baseline.fortyYardTimingMethod) return 'Choose how your 40-yard time was measured.';
    }
  }
  if (step === 8 && !profile.experienceAnswered) return 'Choose your current speed-training experience.';
  if (step === 9 && (profile.trainingDaysPerWeek < 2 || profile.trainingDaysPerWeek > 5)) return 'Choose how many days SprintLab can plan.';
  if (step === 9 && profile.exactTrainingDaysPreference === true && profile.availableTrainingDays.length !== profile.trainingDaysPerWeek) return `Choose exactly ${profile.trainingDaysPerWeek} training days.`;
  if (step === 10 && !(profile.currentTrainingDemands?.length)) return 'Select the demands already on your schedule—or choose “None.”';
  if (step === 10 && profile.commitmentSchedulePlaced && profile.currentTrainingDemands?.includes('team-practices') && !profile.sportPracticeDays?.length) return 'Choose the days that already contain team practice.';
  if (step === 10 && profile.commitmentSchedulePlaced && profile.currentTrainingDemands?.includes('games-or-meets') && !profile.gameScheduleVaries && !profile.gameOrCompetitionDays?.length) return 'Choose the usual game or meet day—or choose “Varies.”';
  if (step === 10 && profile.commitmentSchedulePlaced && profile.currentTrainingDemands?.includes('another-sport') && !profile.otherSportDays?.length) return 'Choose the usual days for the other sport.';
  if (step === 10 && profile.commitmentSchedulePlaced && profile.currentTrainingDemands?.includes('heavy-school-schedule') && !profile.busySchoolDays?.length) return 'Choose the school days when training time is most limited.';
  if (step === 11 && !(profile.onboardingLimitations?.length)) return 'Select anything affecting training—or confirm that nothing is currently affecting it.';
  if (step === 11 && profile.trainingConstraintsReviewed) {
    const areaByLabel: Record<string, TrainingConcernArea> = {
      Hamstring: 'hamstring',
      Knee: 'knee',
      'Achilles or ankle': 'achilles-or-ankle',
      Back: 'back',
      Shoulder: 'shoulder',
      'Other area': 'other',
    };
    const selectedAreas = (profile.onboardingLimitations ?? [])
      .map(label => areaByLabel[label])
      .filter((area): area is TrainingConcernArea => Boolean(area));
    const answeredAreas = new Set((profile.trainingConcernDetails ?? []).map(detail => detail.area));
    if (selectedAreas.some(area => !answeredAreas.has(area))) return 'Choose the current status for each physical concern.';
    if (selectedAreas.includes('other') && !profile.otherConcernArea?.trim()) return 'Name the other area affecting training.';
    if (profile.onboardingLimitations?.includes('Returning after time off') && !profile.timeAwayDuration) return 'Choose approximately how long you were away.';
    if (profile.onboardingLimitations?.includes('Coach restrictions') && !profile.coachRestrictions?.trim()) return 'Record the restriction from your coach.';
    if (profile.onboardingLimitations?.includes('Medical restrictions') && !profile.medicalRestrictions?.trim()) return 'Record the restriction from your medical professional.';
  }
  if (step === 12) {
    const calendar = profile.seasonCalendar;
    const status = calendar?.competitionStatus ?? 'unknown';
    if (status === 'unknown') return 'Choose where you are in your competitive year.';
    const prompts = seasonDatePrompts(status);
    const firstDate = prompts ? calendar?.[prompts[0].key] : null;
    const secondDate = prompts ? calendar?.[prompts[1].key] : null;
    if (firstDate && secondDate && firstDate > secondDate) {
      return `${prompts?.[1].label} must be after ${prompts?.[0].label.toLowerCase()}.`;
    }
  }
  if (step === 13 && !profile.trainingPlanModeAnswered) return 'Choose how SprintLab should help.';
  if (step === 14 && !profile.workoutReminderAnswered) return 'Choose a reminder option.';
  return '';
}

function stageLabelForStep(step: number): string {
  if (step === 3) return 'Profile · 2 of 6';
  if (step === 5) return 'Profile · 4 of 6';
  if (step <= 5) return 'About you';
  if (step <= 7) return 'Your speed profile';
  if (step <= 11) return 'Your training';
  return 'Your plan';
}

function poseForStep(step: number): SplitPose {
  if (step === 1) return 'welcome';
  if (step === 3 || step === 4 || step === 6 || step === 8 || step === 10 || step === 11 || step === 13) return 'focused';
  if (step === 12) return 'calm';
  if (step === 18) return 'celebration';
  return 'listening';
}

const createStyles = (palette: Palette) => StyleSheet.create({
  loading: { flex: 1, backgroundColor: palette.bg },
  content: { gap: 16 },
  contentBare: { flex: 1, gap: 0 },
  welcomeHero: { minHeight: 610, width: '100%', maxWidth: 620, alignSelf: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 24, paddingVertical: 24, paddingHorizontal: 18, backgroundColor: '#080D12' },
  welcomeColumns: { width: '100%', justifyContent: 'center', alignItems: 'center', gap: 24, zIndex: 2 },
  mascotColumn: { width: '100%', alignItems: 'center', gap: 2 },
  mascotPressable: { minWidth: 180, minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  welcomeSplit: { width: 210, height: 210, maxWidth: '100%' },
  welcomeBubble: { position: 'relative', width: '100%', maxWidth: 420, minHeight: 80, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#2B3C49', backgroundColor: '#111922', paddingHorizontal: 18, paddingVertical: 15 },
  welcomeBubbleTail: { position: 'absolute', top: -8, left: '48%', width: 16, height: 16, transform: [{ rotate: '45deg' }], borderLeftWidth: 1, borderTopWidth: 1, borderColor: '#2B3C49', backgroundColor: '#111922' },
  welcomeBubbleText: { color: '#F5F7F8', fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  welcomeCopy: { width: '100%', maxWidth: 540, alignItems: 'center', gap: 16 },
  welcomeHeading: { color: '#F5F7F8', fontSize: 36, lineHeight: 41, fontWeight: '900', letterSpacing: -0.9, textAlign: 'center' },
  welcomeDescription: { color: '#91A0AE', fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 520 },
  welcomeReassurance: { color: '#B5C0C9', fontSize: 13, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  welcomeDot: { color: '#C9FF18', fontSize: 9 },
  welcomeButton: { width: '100%', maxWidth: 540, minHeight: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#C9FF18' },
  welcomeButtonPressed: { opacity: 0.88, transform: [{ scale: 0.975 }] },
  welcomeButtonText: { color: '#080D12', fontSize: 17, fontWeight: '900' },
  laneArcOuter: { position: 'absolute', width: 520, height: 520, borderRadius: 260, borderWidth: 1, borderColor: 'rgba(201,255,24,0.08)', right: -290, top: -260 },
  laneArcInner: { position: 'absolute', width: 420, height: 420, borderRadius: 210, borderWidth: 1, borderColor: 'rgba(201,255,24,0.055)', right: -230, top: -205 },
  question: { gap: 13 }, questionTitle: { color: palette.text, fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.5 }, subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20 }, selectionCount: { color: palette.accent, fontWeight: '900', fontSize: 12, alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 10, backgroundColor: palette.accentDark }, inputHelp: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: -3 }, stack: { gap: 9 },
  unknownDateButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 2 },
  unknownDateText: { color: palette.muted, fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  sportStack: { gap: 7 },
  sportRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 15, backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  sportRowSelected: { borderWidth: 1, borderColor: palette.accent, backgroundColor: palette.accentDark },
  sportRowPressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  sportIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface2 },
  sportIconSelected: { backgroundColor: palette.surface },
  sportCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  sportLabel: { color: palette.text, fontSize: 15, fontWeight: '900' },
  sportLabelSelected: { color: palette.accent },
  sportBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.surface2, color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  sportCheckbox: { width: 23, height: 23, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: palette.border },
  sportCheckboxSelected: { borderColor: palette.accent, backgroundColor: palette.accent },
  sportCheckmark: { color: '#080D12', fontSize: 16, fontWeight: '900', lineHeight: 18 },
  otherSportField: { gap: 7, marginTop: 2 },
  otherSportLabel: { color: palette.text, fontSize: 12, fontWeight: '900' },
  priorityStack: { gap: 8 },
  priorityRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 13, borderRadius: 15, backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  priorityRowSelected: { borderWidth: 1, borderColor: palette.accent, backgroundColor: palette.accentDark },
  priorityRowPressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  priorityCopy: { flex: 1, gap: 4 },
  priorityTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  priorityLabel: { color: palette.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  priorityLabelSelected: { color: palette.accent },
  priorityDetail: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.surface2, color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.35 },
  baselineChoiceRow: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: palette.surface2 },
  baselineChoice: { flex: 1, minHeight: 48, paddingHorizontal: 10, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  baselineChoiceSelected: { backgroundColor: palette.accentDark, borderWidth: 1, borderColor: palette.accent },
  baselineChoiceText: { color: palette.muted, fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' },
  baselineChoiceTextSelected: { color: palette.accent },
  baselineReassurance: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  baselineReassuranceText: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  timingMethodBlock: { gap: 9 },
  timingMethodChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  consistencyNote: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', backgroundColor: palette.surface },
  chipSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  chipDisabled: { opacity: 0.35 },
  chipText: { color: palette.muted, fontWeight: '800', fontSize: 12 },
  chipTextSelected: { color: palette.accent },
  chipTextDisabled: { color: palette.muted },
  scheduleSection: { gap: 12, paddingTop: 4 },
  scheduleHeading: { gap: 4 },
  scheduleTitle: { color: palette.text, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  scheduleChoiceRow: { flexDirection: 'row', gap: 8 },
  scheduleSubsection: { gap: 10 },
  scheduleCounterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  scheduleCounter: { flexShrink: 1, color: palette.accent, fontSize: 12, lineHeight: 17, fontWeight: '900', textAlign: 'right' },
  label: { color: palette.text, fontSize: 12, fontWeight: '900', marginTop: 3, textTransform: 'capitalize', letterSpacing: 0.7 },
  error: { color: palette.red, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  commitmentScreen: { flex: 1, justifyContent: 'center', gap: 10, paddingVertical: 8 },
  commitmentEyebrow: { color: palette.accent, fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 2 },
  commitmentTitle: { color: palette.text, fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -0.8 },
  commitmentSupport: { color: palette.muted, fontSize: 15, lineHeight: 22, maxWidth: 520, marginBottom: 10 },
  commitmentCard: { gap: 14, paddingHorizontal: 20, paddingVertical: 22, borderWidth: 1, borderColor: palette.border, borderRadius: 20, backgroundColor: palette.surface },
  commitmentPledge: { color: palette.text, fontSize: 19, lineHeight: 28, fontWeight: '800', maxWidth: 560 },
  commitmentSignature: { color: palette.muted, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  reminderSummary: { color: palette.accent, fontSize: 13, lineHeight: 19, fontWeight: '900', textAlign: 'center', paddingTop: 4 },
  revealText: { color: palette.text, fontSize: 16, lineHeight: 23, fontWeight: '800' },
  revealDetail: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  revealEdit: { minHeight: 44, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12 },
  revealEditPressed: { backgroundColor: palette.surface2 },
  revealEditText: { color: palette.muted, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  profileRow: { gap: 3, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 8 },
  profileLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', textTransform: 'capitalize', letterSpacing: 0.8 },
  profileValue: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  dayChooser: { gap: 8, paddingTop: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeColon: { color: palette.text, fontSize: 26, fontWeight: '900' },
  scopeCard: { gap: 7, padding: 16, borderRadius: 17, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  scopeTitle: { color: palette.accent, fontSize: 15, fontWeight: '900' },
  scopeCopy: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  sourceCard: { gap: 15, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  researchSourceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 15 },
  researchSourceBadge: { width: 24, height: 24, flexShrink: 0, borderRadius: 12, borderWidth: 1.5, borderColor: '#C9FF18', backgroundColor: 'rgba(201, 255, 24, 0.12)', alignItems: 'center', justifyContent: 'center' },
  researchSourceCopy: { flex: 1, gap: 1 },
  researchSourceName: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  researchSourceDetail: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  sourcesFooter: { width: '100%', gap: 2 },
  researchLink: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  researchLinkText: { color: palette.muted, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  secondaryBestCard: { gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  secondaryBestRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secondaryBestLabel: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '800' },
  secondaryBestInput: { width: 112, minHeight: 42 },
  limitationSection: { gap: 8 },
  limitationHeading: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  limitationGrid: { gap: 7 },
  limitationChip: { width: '100%', minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  limitationChipSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  limitationChipPressed: { transform: [{ scale: 0.992 }], opacity: 0.94 },
  limitationIcon: { width: 22, color: palette.muted, textAlign: 'center' },
  limitationIconSelected: { color: palette.accent },
  limitationChipText: { flex: 1, color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  limitationChipTextSelected: { color: palette.accent },
  limitationCheckbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  limitationCheckboxSelected: { borderColor: palette.accent, backgroundColor: palette.accent },
  constraintTextInput: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, color: palette.text, fontSize: 14, lineHeight: 20, paddingHorizontal: 13, paddingVertical: 12, textAlignVertical: 'top' },
  constraintFollowupCard: { gap: 10, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  constraintFollowupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  constraintFollowupTitle: { flex: 1, color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  constraintStatusStack: { gap: 7 },
  constraintStatusRow: { minHeight: 52, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg },
  constraintStatusRowSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  constraintRadio: { width: 18, height: 18, marginTop: 2, borderRadius: 9, borderWidth: 2, borderColor: palette.muted },
  constraintRadioSelected: { borderWidth: 5, borderColor: palette.accent, backgroundColor: palette.bg },
  constraintStatusCopy: { flex: 1, gap: 2 },
  constraintStatusLabel: { color: palette.text, fontSize: 12, lineHeight: 17, fontWeight: '900' },
  constraintStatusLabelSelected: { color: palette.accent },
  constraintStatusDetail: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  constraintSafetyNotice: { color: palette.orange, fontSize: 11, lineHeight: 17, fontWeight: '700', padding: 10, borderRadius: 10, backgroundColor: palette.surface2 },
  whyButton: { alignSelf: 'flex-start', minHeight: 44, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  whyButtonText: { color: palette.muted, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  whyCopy: { color: palette.muted, fontSize: 11, lineHeight: 17, padding: 11, borderRadius: 11, backgroundColor: palette.surface },
});
