import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppFooter } from '@/components/app-footer';
import { NativeDateField, NativeTimeField } from '@/components/date-time-fields';
import { SplitMoment } from '@/components/split-moment';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { Palette, useTheme } from '@/constants/sprintlab';
import { workoutLibrarySourceSummary } from '@/data/workout-sources';
import type { AthleteProfile, MeetPriority } from '@/types';
import { athleteFirstName, getAthleteProfile, getTrainingWorkflow, resetAllSprintLabLocalData, resetOnboardingCompletionFlag, saveAthleteProfile, trainingWorkflowLabel } from '@/utils/athlete-profile';
import { deriveSeasonPhase } from '@/utils/season-engine';
import { reminderTimeLabel, scheduleWorkoutReminderTest, syncWorkoutReminders } from '@/utils/workout-reminders';
import { getThemePreference, saveThemePreference, type ThemePreference } from '@/utils/theme-preference';
import { requestSprintLabIntroLaunch, resetSprintLabIntroSeen } from '@/utils/sprintlab-intro';
import { getNotificationPermissionStatus, resetNotificationOptInDecision } from '@/utils/notification-permission';
import { resetCoachIntroSeen } from '@/utils/coach-discovery';
import { clearDismissedCoachTriggerIds, hasGeneratedDevTestData } from '@/utils/storage';
import { useCoach } from '@/components/coach-context';
import { completeStep, error, selection, success, tap, warning } from '@/utils/haptics';

const pretty = (value: string) => value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const RESEARCH_URL = 'https://drive.google.com/drive/folders/1YsqqaUz08VPK9mdFMTppX06NRzJmjwqb?usp=sharing';
// Light mode is temporarily disabled app-wide (see constants/sprintlab.ts useTheme). The picker
// below is gated behind this flag rather than removed, so it's a one-line change to restore.
const LIGHT_MODE_ENABLED = false;

export default function SettingsScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [meetName, setMeetName] = useState('');
  const [meetDate, setMeetDate] = useState<string | null>(null);
  const [meetPriority, setMeetPriority] = useState<MeetPriority>('B');
  const [themePreference, setThemePreference] = useState<ThemePreference>('dark');
  const [devTestDataActive, setDevTestDataActive] = useState(false);
  const { resetConversation } = useCoach();

  useFocusEffect(useCallback(() => {
    void getAthleteProfile().then(setProfile);
    void getThemePreference().then(setThemePreference);
    if (__DEV__) void hasGeneratedDevTestData().then(setDevTestDataActive);
  }, []));

  const chooseTheme = async (preference: ThemePreference) => {
    if (themePreference === preference) return;
    setThemePreference(preference);
    try {
      await saveThemePreference(preference);
      selection();
    } catch {
      error();
    }
  };

  const editProfile = () => { tap(); router.push({ pathname: '/profile', params: { mode: 'edit' } }); };

  const replayIntroTour = async () => {
    tap();
    await requestSprintLabIntroLaunch();
    router.replace('/');
  };

  // Saving a TIME preference never touches the native permission API by itself — that only ever
  // happens from the dedicated Notifications setup screen's own "Enable" action. If permission
  // isn't already granted, this hands off there instead of prompting inline.
  const setReminder = async (enabled: boolean, hour = 16, minute = 0, customTime = false, emitFeedback = true) => {
    if (!profile) return;
    try {
      const saved = await saveAthleteProfile({
        ...profile,
        workoutReminderEnabled: enabled,
        workoutReminderHour: hour,
        workoutReminderMinute: minute,
        workoutReminderCustomTime: customTime,
        workoutReminderAnswered: true,
      });
      setProfile(saved);

      if (!enabled) { await syncWorkoutReminders({ profile: saved }); return; }

      const permission = await getNotificationPermissionStatus();
      if (permission !== 'granted') { tap(); router.push('/notifications-setup'); return; }

      const result = await syncWorkoutReminders({ profile: saved });
      if (emitFeedback) completeStep();
      if (result.status === 'scheduled') {
        const next = result.nextAt
          ? ` The next is ${new Date(result.nextAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
          : ' No future workout currently matches the saved weekly schedule.';
        Alert.alert('Workout reminders updated', `${result.count} upcoming session preview${result.count === 1 ? '' : 's'} scheduled.${next}`);
      }
    } catch {
      error();
      Alert.alert('Could not update reminders', 'Please try again.');
    }
  };

  const testReminder = async () => {
    const result = await scheduleWorkoutReminderTest(profile);
    if (result.status === 'permission-denied') {
      warning();
      Alert.alert('Notifications are off', 'Allow notifications for SprintLab in iPhone Settings, then try the test again.');
      return;
    }
    if (result.status === 'unsupported') {
      error();
      Alert.alert('Test on your phone', 'Local notifications are not available in the browser preview.');
      return;
    }
    completeStep();
    Alert.alert('Test scheduled', 'Leave SprintLab open or place it in the background. A preview should appear in about five seconds.');
  };

  const resetApp = () => {
    Alert.alert(
      'Erase all local SprintLab data?',
      'This permanently removes every SprintLab record stored on this device — profile and onboarding answers, plan and schedule, workout sessions and readiness history, PRs and progress, Coach state, settings and notification setup, and any development test data. It cannot be undone, and it does not change the iPhone notification permission itself.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase everything',
          style: 'destructive',
          onPress: async () => {
            warning();
            await resetAllSprintLabLocalData();
            resetConversation();
            router.replace('/profile');
          },
        },
      ],
    );
  };

  // Developer Tools: lightweight, non-destructive testing controls. None of these touch the
  // athlete's saved profile answers, plan, workout history, logs, or PRs — each clears/flips
  // exactly the one narrow flag its name describes. Kept visible in every build (no __DEV__ gate)
  // until this section is deliberately removed before public release.
  const resetFirstLaunchFlags = async () => {
    tap();
    await Promise.all([resetOnboardingCompletionFlag(), resetSprintLabIntroSeen()]);
    success();
    Alert.alert('First-launch flags reset', 'Close and reopen SprintLab to see the real first-launch sequence. Your profile, plan, and history are unchanged.');
  };

  const resetNotificationSetup = async () => {
    tap();
    await resetNotificationOptInDecision();
    success();
    Alert.alert('Notification setup reset', 'SprintLab will treat notification opt-in as never asked again. This does not change the device’s actual system notification permission.');
  };

  const resetCoachTestState = async () => {
    tap();
    await Promise.all([resetCoachIntroSeen(), clearDismissedCoachTriggerIds()]);
    success();
    Alert.alert('Coach test state reset', 'The “Ask Coach” intro bubble and dismissed local triggers can surface again. Coach’s conversation itself isn’t saved between launches, so there’s nothing else to clear.');
  };

  const addCompetition = async () => {
    if (!profile || !meetName.trim() || !meetDate) {
      error();
      Alert.alert('Add a name and date', 'Enter a clear competition name and choose its date.');
      return;
    }
    try {
      const calendar = profile.seasonCalendar ?? { competitionStatus: 'unknown' as const, priorityMeets: [] };
      const saved = await saveAthleteProfile({
        ...profile,
        seasonCalendar: {
          ...calendar,
          priorityMeets: [...calendar.priorityMeets, {
            id: `meet:${Date.now()}`,
            name: meetName.trim(),
            date: meetDate,
            priority: meetPriority,
            events: [profile.primaryEvent],
          }].sort((a, b) => a.date.localeCompare(b.date)),
          datesConfirmedAt: new Date().toISOString(),
        },
      });
      setProfile(saved);
      setMeetName('');
      setMeetDate(null);
      setMeetPriority('B');
      await syncWorkoutReminders({ profile: saved });
      success();
    } catch {
      error();
      Alert.alert('Could not add competition', 'Please try again.');
    }
  };

  const removeCompetition = (id: string) => {
    if (!profile?.seasonCalendar) return;
    Alert.alert('Remove competition?', 'The date will stop affecting future plan suggestions.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        warning();
        const saved = await saveAthleteProfile({
          ...profile,
          seasonCalendar: { ...profile.seasonCalendar!, priorityMeets: profile.seasonCalendar!.priorityMeets.filter(meet => meet.id !== id) },
        });
        setProfile(saved);
        await syncWorkoutReminders({ profile: saved });
      } },
    ]);
  };

  const sports = profile?.sports?.length
    ? profile.sports.map(pretty).join(' · ')
    : pretty(profile?.sport ?? 'track-and-field');
  const goals = profile?.speedGoals?.length ? profile.speedGoals.map(pretty).join(' · ') : 'No goals selected';
  const days = profile?.availableTrainingDays.length
    ? profile.availableTrainingDays.map(day => pretty(day).slice(0, 3)).join(', ')
    : `${Math.max(0, profile?.trainingDaysPerWeek ?? 0)} sessions per week`;
  const phase = profile ? deriveSeasonPhase(profile) : null;
  const fortyYard = profile?.footballProfile?.fortyYardDashTime;
  const targetFortyYard = profile?.footballProfile?.targetFortyYardDashTime;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close settings" onPress={() => { tap(); router.back(); }} style={styles.iconButton}>
            <MaterialIcons name="close" color={palette.text} size={22} />
          </Pressable>
          <Eyebrow>Profile & settings</Eyebrow>
        </View>

        <ScreenTitle subtitle="Review the context SprintLab uses for planning, logging, and display preferences.">
          {athleteFirstName(profile) || 'Athlete'}
        </ScreenTitle>

        <SplitMoment
          title="Your profile stays editable."
          message="Update your sports, schedule, access, or goals whenever your training situation changes."
          pose="listening"
        />

        <Card style={styles.profileCard}>
          <SettingRow label="Sports" value={sports} />
          <SettingRow label="Primary focus" value={pretty(profile?.primarySport ?? profile?.sport ?? 'track-and-field')} />
          <SettingRow label="Speed goals" value={goals} />
          <SettingRow label="Availability" value={days} />
          <SettingRow label="Preferred rest day" value={profile?.preferredRestDayAnswered === false ? 'No preference' : pretty(profile?.preferredRestDay ?? 'sunday')} />
          <SettingRow label="Season" value={phase ? pretty(phase.phase) : pretty(profile?.trainingContext ?? profile?.seasonPhase ?? 'general-development')} />
          {profile?.primarySport === 'football' && fortyYard ? <SettingRow label="Current 40-yard" value={`${fortyYard.toFixed(2)}s`} /> : null}
          {profile?.primarySport === 'football' && targetFortyYard ? <SettingRow label="Target 40-yard" value={`${targetFortyYard.toFixed(2)}s`} /> : null}
          {profile?.primarySport === 'track-and-field' ? <SettingRow label="Target" value={profile?.targetPerformances?.length ? profile.targetPerformances.map(target => `${target.event} · ${target.timeSeconds.toFixed(2)}s`).join(' · ') : 'No target time saved'} /> : null}
          <SettingRow label="App mode" value={trainingWorkflowLabel(profile ? getTrainingWorkflow(profile) : null)} last />
        </Card>

        {LIGHT_MODE_ENABLED ? <Card style={styles.libraryCard}>
          <Eyebrow>Appearance</Eyebrow>
          <Text style={styles.cardTitle}>Choose your display</Text>
          <Text style={styles.cardCopy}>SprintLab starts in Dark mode. Choose Light, or follow your phone only when System is selected.</Text>
          <View style={styles.themeOptions}>
            {([
              ['dark', 'Dark'],
              ['light', 'Light'],
              ['system', 'System'],
            ] as const).map(([value, label]) => {
              const selected = themePreference === value;
              return <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={value} onPress={() => void chooseTheme(value)} style={[styles.themeOption, selected && styles.themeOptionSelected]}>
                <MaterialIcons name={value === 'dark' ? 'dark-mode' : value === 'light' ? 'light-mode' : 'settings-brightness'} size={18} color={selected ? palette.accent : palette.muted} />
                <Text style={[styles.themeOptionText, selected && styles.themeOptionTextSelected]}>{label}</Text>
              </Pressable>;
            })}
          </View>
        </Card> : null}

        <Card style={styles.calendarCard}>
          <View style={styles.reminderHeading}>
            <View style={styles.reminderIcon}><MaterialIcons name="event" size={20} color={palette.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Competition calendar</Text>
              <Text style={styles.cardCopy}>A dates are highest priority. B dates matter, and C dates are lower-priority tune-ups. The season engine uses these dates as hard planning context.</Text>
            </View>
          </View>
          {phase ? <View style={styles.phasePanel}><Text style={styles.phaseName}>{pretty(phase.phase)}</Text><Text style={styles.phaseReason}>{phase.explanation}</Text></View> : null}
          {(profile?.seasonCalendar?.priorityMeets ?? []).map(meet => <View key={meet.id} style={styles.meetRow}>
            <View style={[styles.priorityBadge, meet.priority === 'A' && styles.priorityA]}><Text style={styles.priorityText}>{meet.priority}</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.meetName}>{meet.name}</Text><Text style={styles.meetDate}>{meet.date}{meet.estimated ? ' · estimated' : ''}</Text></View>
            <Pressable accessibilityLabel={`Remove ${meet.name}`} onPress={() => removeCompetition(meet.id)} style={styles.removeMeet}><MaterialIcons name="close" size={18} color={palette.red} /></Pressable>
          </View>)}
          <TextInput value={meetName} onChangeText={setMeetName} placeholder="Competition name" placeholderTextColor={palette.muted} style={styles.input} />
          <NativeDateField value={meetDate} onChange={setMeetDate} accessibilityLabel="Choose competition date" />
          <View style={styles.priorityRow}>{(['A', 'B', 'C'] as MeetPriority[]).map(priority => <Pressable key={priority} onPress={() => { if (meetPriority !== priority) { selection(); setMeetPriority(priority); } }} style={[styles.priorityOption, meetPriority === priority && styles.priorityOptionActive]}><Text style={[styles.priorityOptionText, meetPriority === priority && styles.priorityOptionTextActive]}>{priority} priority</Text></Pressable>)}</View>
          <Pressable onPress={() => void addCompetition()} style={styles.addMeet}><MaterialIcons name="add" size={18} color={palette.accent} /><Text style={styles.addMeetText}>Add competition</Text></Pressable>
        </Card>

        <Card style={styles.reminderCard}>
          <View style={styles.reminderHeading}>
            <View style={styles.reminderIcon}>
              <MaterialIcons name="notifications-active" size={20} color={palette.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Workout reminders</Text>
              <Text style={styles.cardCopy}>On planned workout days, get a preview with the session name, exercise count, and estimated duration.</Text>
            </View>
          </View>
          <View style={styles.reminderOptions}>
            {[
              { label: '7:00 AM', hour: 7, minute: 0 },
              { label: '4:00 PM', hour: 16, minute: 0 },
              { label: '6:30 PM', hour: 18, minute: 30 },
            ].map(option => {
              const selected = Boolean(profile?.workoutReminderEnabled)
                && profile?.workoutReminderHour === option.hour
                && profile?.workoutReminderMinute === option.minute;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.label}
                  onPress={() => void setReminder(true, option.hour, option.minute, false)}
                  style={[styles.reminderOption, selected && styles.reminderOptionSelected]}
                >
                  <Text style={[styles.reminderOptionText, selected && styles.reminderOptionTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>Custom reminder time</Text>
          <NativeTimeField
            hour={profile?.workoutReminderHour ?? 16}
            minute={profile?.workoutReminderMinute ?? 0}
            onChange={(hour, minute) => void setReminder(true, hour, minute, true, false)}
          />
          <View style={styles.reminderStatus}>
            <Text style={styles.reminderStatusText}>
              {profile?.workoutReminderEnabled
                ? `Enabled at ${reminderTimeLabel(profile.workoutReminderHour, profile.workoutReminderMinute)}`
                : 'Reminders are off'}
            </Text>
            {profile?.workoutReminderEnabled ? (
              <Pressable accessibilityRole="button" onPress={() => void setReminder(false)} style={styles.turnOffButton}>
                <Text style={styles.turnOffText}>Turn off</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/notifications-setup'); }} style={styles.textAction}>
            <Text style={styles.textActionLabel}>Notification permission</Text>
            <MaterialIcons name="arrow-forward" size={17} color={palette.accent} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void testReminder()} style={styles.testReminder}>
            <MaterialIcons name="notifications-none" size={18} color={palette.accent} />
            <Text style={styles.testReminderText}>Send a test preview in 5 seconds</Text>
          </Pressable>
        </Card>

        <View style={styles.actionStack}>
          <PrimaryButton title="Edit athlete profile" onPress={editProfile} />
          <Pressable onPress={() => { tap(); router.push('/plan-preview'); }} style={styles.secondaryAction}>
            <MaterialIcons name="auto-awesome" size={19} color={palette.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.secondaryTitle}>Build a suggested training week</Text>
              <Text style={styles.secondaryCopy}>Preview approved library sessions before anything changes.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={palette.muted} />
          </Pressable>
        </View>

        <Card style={styles.libraryCard}>
          <Eyebrow>Training library</Eyebrow>
          <Text style={styles.cardTitle}>Reviewed records, not random workouts</Text>
          <Text style={styles.cardCopy}>
            SprintLab’s track, 40-yard, and general linear-speed planners can choose only existing Approved workouts. Draft and Archived records are never suggested.
          </Text>
          <View style={styles.sourceList}>
            {workoutLibrarySourceSummary.map(source => (
              <View key={source} style={styles.sourceRow}>
                <MaterialIcons name="verified" size={16} color={palette.accent} />
                <Text style={styles.sourceText}>{source}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={() => { tap(); void WebBrowser.openBrowserAsync(RESEARCH_URL); }} style={styles.textAction}>
            <Text style={styles.textActionLabel}>Explore the research behind SprintLab</Text>
            <MaterialIcons name="open-in-new" size={17} color={palette.accent} />
          </Pressable>
          <Pressable onPress={() => { tap(); router.push('/library'); }} style={styles.textAction}>
            <Text style={styles.textActionLabel}>Open Workout Library</Text>
            <MaterialIcons name="arrow-forward" size={17} color={palette.accent} />
          </Pressable>
        </Card>

        <Card style={styles.dataCard}>
          <View style={styles.reminderHeading}>
            <View style={styles.reminderIcon}>
              <MaterialIcons name="phonelink-lock" size={20} color={palette.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Your data is local for now</Text>
              <Text style={styles.cardCopy}>
                SprintLab stores your profile, plans, and training history on this device. There is no cloud backup yet, so deleting the app or erasing local data can permanently remove it.
              </Text>
            </View>
          </View>
        </Card>

        <Card style={styles.devCard}>
          <Eyebrow>Developer Tools</Eyebrow>
          <Text style={styles.cardTitle}>Internal testing panel</Text>
          <Text style={styles.cardCopy}>Visible in every build, including EAS/TestFlight, until this section is deliberately removed before public release.</Text>

          <Text style={styles.devSectionLabel}>REPLAY</Text>
          <View style={styles.devRowGroup}>
            <Pressable accessibilityRole="button" onPress={editProfile} style={styles.devRow}>
              <View style={styles.devRowIcon}><MaterialIcons name="replay" size={17} color={palette.accent} /></View>
              <Text style={styles.devRowText}>Replay onboarding</Text>
              <MaterialIcons name="chevron-right" size={19} color={palette.muted} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void replayIntroTour()} style={styles.devRow}>
              <View style={styles.devRowIcon}><MaterialIcons name="play-circle-outline" size={17} color={palette.accent} /></View>
              <Text style={styles.devRowText}>Replay SprintLab intro</Text>
              <MaterialIcons name="chevron-right" size={19} color={palette.muted} />
            </Pressable>
          </View>

          <Text style={styles.devSectionLabel}>RESET TESTING STATE</Text>
          <View style={styles.devRowGroup}>
            <Pressable accessibilityRole="button" onPress={() => void resetFirstLaunchFlags()} style={styles.devRow}>
              <View style={styles.devRowIcon}><MaterialIcons name="restart-alt" size={17} color={palette.accent} /></View>
              <Text style={styles.devRowText}>Reset first-launch flags</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void resetNotificationSetup()} style={styles.devRow}>
              <View style={styles.devRowIcon}><MaterialIcons name="notifications-off" size={17} color={palette.accent} /></View>
              <Text style={styles.devRowText}>Reset notification setup</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void resetCoachTestState()} style={styles.devRow}>
              <View style={styles.devRowIcon}><MaterialIcons name="forum" size={17} color={palette.accent} /></View>
              <Text style={styles.devRowText}>Reset Coach test state</Text>
            </Pressable>
          </View>

          {__DEV__ ? <>
            <Text style={styles.devSectionLabel}>DEVELOPMENT DATA</Text>
            {devTestDataActive ? <View style={styles.activeBanner}><MaterialIcons name="science" size={14} color={palette.orange} /><Text style={styles.activeBannerText}>TEST DATA ACTIVE</Text></View> : null}
            <Text style={styles.cardCopy}>Generates real completed sessions through SprintLab&apos;s own streak/PR/milestone engine, for inspecting progression without weeks of real training. Hidden outside development builds.</Text>
            <View style={styles.devRowGroup}>
              <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/dev-data'); }} style={styles.devRow}>
                <View style={styles.devRowIcon}><MaterialIcons name="science" size={17} color={palette.accent} /></View>
                <Text style={styles.devRowText}>Development Data Controls</Text>
                <MaterialIcons name="chevron-right" size={19} color={palette.muted} />
              </Pressable>
            </View>
          </> : null}

          <View style={styles.devDivider} />
          <Pressable onPress={resetApp} style={styles.dangerButton}>
            <MaterialIcons name="delete-forever" size={20} color={palette.red} />
            <Text style={styles.dangerText}>Erase all local app data</Text>
          </Pressable>
        </Card>
        <AppFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={[styles.settingRow, last && styles.settingRowLast]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 20, paddingBottom: 42, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  profileCard: { paddingVertical: 4 },
  settingRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.border, gap: 4 },
  settingRowLast: { borderBottomWidth: 0 },
  settingLabel: { color: palette.muted, fontSize: 11, fontWeight: '800', textTransform: 'capitalize', letterSpacing: 0.8 },
  settingValue: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  actionStack: { gap: 10 },
  reminderCard: { gap: 13 },
  calendarCard: { gap: 12 },
  reminderHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  reminderIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentDark },
  reminderOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', textTransform: 'capitalize', letterSpacing: .7 },
  reminderOption: { minHeight: 42, flexGrow: 1, minWidth: 94, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.bg },
  reminderOptionSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  reminderOptionText: { color: palette.muted, fontSize: 12, fontWeight: '900' },
  reminderOptionTextSelected: { color: palette.accent },
  reminderStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 11 },
  reminderStatusText: { flex: 1, color: palette.text, fontSize: 12, fontWeight: '800' },
  turnOffButton: { paddingVertical: 7, paddingHorizontal: 10 },
  turnOffText: { color: palette.red, fontSize: 12, fontWeight: '900' },
  testReminder: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg },
  testReminderText: { color: palette.accent, fontSize: 11, fontWeight: '900' },
  secondaryAction: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderWidth: 1, borderColor: palette.border, borderRadius: 16, backgroundColor: palette.surface },
  secondaryTitle: { color: palette.text, fontSize: 14, fontWeight: '900' },
  secondaryCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  libraryCard: { gap: 11 },
  dataCard: { gap: 11 },
  phasePanel: { gap: 4, borderRadius: 12, padding: 12, backgroundColor: palette.accentDark, borderWidth: 1, borderColor: '#38520F' },
  phaseName: { color: palette.accent, fontSize: 12, fontWeight: '900', textTransform: 'capitalize', letterSpacing: .8 },
  phaseReason: { color: palette.text, fontSize: 11, lineHeight: 16 },
  meetRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.border },
  priorityBadge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface2 },
  priorityA: { backgroundColor: palette.accentDark },
  priorityText: { color: palette.accent, fontSize: 12, fontWeight: '900' },
  meetName: { color: palette.text, fontSize: 13, fontWeight: '900' },
  meetDate: { color: palette.muted, fontSize: 10, marginTop: 3 },
  removeMeet: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg, color: palette.text, paddingHorizontal: 13 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityOption: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: palette.border },
  priorityOptionActive: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  priorityOptionText: { color: palette.muted, fontSize: 10, fontWeight: '900' },
  priorityOptionTextActive: { color: palette.accent },
  addMeet: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: palette.accentDark },
  addMeetText: { color: palette.accent, fontWeight: '900', fontSize: 12 },
  cardTitle: { color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  cardCopy: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  sourceList: { gap: 8 },
  sourceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sourceText: { flex: 1, color: palette.text, fontSize: 12, lineHeight: 17 },
  themeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 4 },
  themeOption: { minHeight: 44, flexGrow: 1, flexBasis: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: palette.border, borderRadius: 13, backgroundColor: palette.surface2 },
  themeOptionSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark },
  themeOptionText: { color: palette.muted, fontWeight: '900', fontSize: 12 },
  themeOptionTextSelected: { color: palette.accent },
  textAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 },
  textActionLabel: { color: palette.accent, fontSize: 12, fontWeight: '900' },
  devCard: { gap: 12, borderColor: palette.border },
  devSectionLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 2 },
  activeBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, borderRadius: 8, backgroundColor: '#2A1B0C', paddingHorizontal: 9, alignSelf: 'flex-start' },
  activeBannerText: { color: palette.orange, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  devRowGroup: { gap: 8 },
  devRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: palette.surface2, paddingHorizontal: 12 },
  devRowIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  devRowText: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '800' },
  devDivider: { height: 1, backgroundColor: palette.border, marginVertical: 2 },
  dangerButton: { minHeight: 48, borderRadius: 13, backgroundColor: '#2A1418', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dangerText: { color: palette.red, fontWeight: '900', fontSize: 13 },
});
