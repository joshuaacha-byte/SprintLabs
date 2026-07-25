import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SplitMoment } from '@/components/split-moment';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { palette } from '@/constants/sprintlab';
import { workoutLibrarySourceSummary } from '@/data/workout-sources';
import type { AthleteProfile } from '@/types';
import { getAthleteProfile, resetAllSprintLabLocalData, resetAthleteOnboarding } from '@/utils/athlete-profile';

const pretty = (value: string) => value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function SettingsScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<AthleteProfile | null>(null);

  useFocusEffect(useCallback(() => {
    void getAthleteProfile().then(setProfile);
  }, []));

  const editProfile = async () => {
    await resetAthleteOnboarding();
    router.replace('/profile');
  };

  const resetApp = () => {
    Alert.alert(
      'Erase all local SprintLab data?',
      'This testing action permanently removes this device’s profile, plan, workouts, readiness, History, Progress, and local library changes. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase everything',
          style: 'destructive',
          onPress: async () => {
            await resetAllSprintLabLocalData();
            router.replace('/profile');
          },
        },
      ],
    );
  };

  const sports = profile?.sports?.length
    ? profile.sports.map(pretty).join(' · ')
    : pretty(profile?.sport ?? 'track-and-field');
  const goals = profile?.speedGoals?.length ? profile.speedGoals.map(pretty).join(' · ') : 'No goals selected';
  const days = profile?.availableTrainingDays.length
    ? profile.availableTrainingDays.map(day => pretty(day).slice(0, 3)).join(', ')
    : `${Math.max(0, profile?.trainingDaysPerWeek ?? 0)} sessions per week`;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close settings" onPress={() => router.back()} style={styles.iconButton}>
            <MaterialIcons name="close" color={palette.text} size={22} />
          </Pressable>
          <Eyebrow>Profile & settings</Eyebrow>
        </View>

        <ScreenTitle subtitle="Review the context SprintLab uses for planning, logging, and display preferences.">
          {profile?.name.trim() || 'Athlete'}
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
          <SettingRow label="Season" value={pretty(profile?.trainingContext ?? profile?.seasonPhase ?? 'general-development')} />
          <SettingRow label="App mode" value={pretty(profile?.trainingPlanMode ?? 'not-selected')} last />
        </Card>

        <View style={styles.actionStack}>
          <PrimaryButton title="Edit athlete profile" onPress={editProfile} />
          <Pressable onPress={() => router.push('/plan-preview')} style={styles.secondaryAction}>
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
            SprintLab’s track planner can choose only existing Approved workouts. Draft and Archived records are never suggested.
          </Text>
          <View style={styles.sourceList}>
            {workoutLibrarySourceSummary.map(source => (
              <View key={source} style={styles.sourceRow}>
                <MaterialIcons name="verified" size={16} color={palette.accent} />
                <Text style={styles.sourceText}>{source}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={() => router.push('/library')} style={styles.textAction}>
            <Text style={styles.textActionLabel}>Open Workout Library</Text>
            <MaterialIcons name="arrow-forward" size={17} color={palette.accent} />
          </Pressable>
        </Card>

        {__DEV__ ? (
          <Card style={styles.devCard}>
            <Eyebrow>Development</Eyebrow>
            <Text style={styles.cardTitle}>Testing controls</Text>
            <Text style={styles.cardCopy}>Use this only when you intentionally want a completely clean local app.</Text>
            <Pressable onPress={resetApp} style={styles.dangerButton}>
              <MaterialIcons name="delete-forever" size={20} color={palette.red} />
              <Text style={styles.dangerText}>Erase all local app data</Text>
            </Pressable>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.settingRow, last && styles.settingRowLast]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 20, paddingBottom: 42, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  profileCard: { paddingVertical: 4 },
  settingRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.border, gap: 4 },
  settingRowLast: { borderBottomWidth: 0 },
  settingLabel: { color: palette.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  settingValue: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  actionStack: { gap: 10 },
  secondaryAction: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderWidth: 1, borderColor: palette.border, borderRadius: 16, backgroundColor: palette.surface },
  secondaryTitle: { color: palette.text, fontSize: 14, fontWeight: '900' },
  secondaryCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  libraryCard: { gap: 11 },
  cardTitle: { color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  cardCopy: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  sourceList: { gap: 8 },
  sourceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sourceText: { flex: 1, color: palette.text, fontSize: 12, lineHeight: 17 },
  textAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 },
  textActionLabel: { color: palette.accent, fontSize: 12, fontWeight: '900' },
  devCard: { gap: 10, borderColor: '#54262A' },
  dangerButton: { minHeight: 48, borderRadius: 13, backgroundColor: '#2A1418', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dangerText: { color: palette.red, fontWeight: '900', fontSize: 13 },
});
