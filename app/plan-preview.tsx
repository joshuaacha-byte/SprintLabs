import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SplitMoment } from '@/components/split-moment';
import { Card, Eyebrow, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { palette } from '@/constants/sprintlab';
import { workoutSourceNames } from '@/data/workout-sources';
import type { LibraryWorkout } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import {
  buildDeterministicWeeklyPlan,
  replaceSuggestedWorkout,
  type WeeklyPlanSuggestion,
} from '@/utils/plan-selector';
import { saveWeekSchedule } from '@/utils/storage';
import { getLibraryWorkouts } from '@/utils/workout-library';

export default function PlanPreviewScreen() {
  const router = useRouter();
  const [workouts, setWorkouts] = useState<LibraryWorkout[]>([]);
  const [result, setResult] = useState<WeeklyPlanSuggestion | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([getAthleteProfile(), getLibraryWorkouts()]).then(([profile, library]) => {
      setWorkouts(library);
      if (!profile) {
        router.replace('/profile');
        return;
      }
      setResult(buildDeterministicWeeklyPlan(profile, library));
    });
  }, [router]);

  const save = () => {
    if (!result || result.status !== 'ready') return;
    Alert.alert(
      'Replace the current training week?',
      'The reviewed suggestion will become your recurring Monday–Sunday plan. Existing History and completed workouts will not change.',
      [
        { text: 'Keep current plan', style: 'cancel' },
        {
          text: 'Save suggested week',
          onPress: async () => {
            setSaving(true);
            await saveWeekSchedule(result.schedule);
            setSaving(false);
            router.replace('/plan');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close plan preview" onPress={() => router.back()} style={styles.iconButton}>
            <MaterialIcons name="close" color={palette.text} size={22} />
          </Pressable>
          <Eyebrow>Plan preview</Eyebrow>
        </View>

        {!result ? (
          <Card><Text style={styles.loading}>Checking your profile against Approved workouts…</Text></Card>
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
              onPress={() => router.replace(result.status === 'coach-managed' ? '/plan' : '/settings')}
            />
          </>
        ) : (
          <>
            <ScreenTitle subtitle="Nothing changes until you review and save this week.">
              Suggested training week
            </ScreenTitle>
            <SplitMoment
              title="I matched the plan to your profile."
              message={result.summary}
              pose="focused"
            />

            <Card style={styles.rulesCard}>
              <View style={styles.ruleHead}>
                <MaterialIcons name="verified-user" size={20} color={palette.accent} />
                <Text style={styles.ruleTitle}>How this preview was built</Text>
              </View>
              <Bullet>Only existing Approved library records were eligible.</Bullet>
              <Bullet>Event, season, experience, surface, and required equipment were hard filters.</Bullet>
              <Bullet>Consecutive available days do not receive back-to-back high-speed targets.</Bullet>
              <Bullet>Draft and Archived workouts were excluded.</Bullet>
            </Card>

            <View style={styles.week}>
              {result.suggestions.map(suggestion => {
                const workout = workouts.find(item => item.id === suggestion.workoutId);
                const sources = workout?.sourceNotes.map(source => workoutSourceNames[source.sourceId] ?? source.sourceId) ?? [];
                return (
                  <Card key={suggestion.dayIndex} style={styles.dayCard}>
                    <View style={styles.dayHead}>
                      <View style={styles.dayBadge}>
                        <Text style={styles.dayBadgeText}>{result.schedule.find(day => day.dayIndex === suggestion.dayIndex)?.shortLabel}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workoutName}>{suggestion.plannedWorkout.title}</Text>
                        <Text style={styles.workoutMeta}>
                          {suggestion.targetCategory.replaceAll('-', ' ')} · {suggestion.plannedWorkout.durationMinutes} min
                        </Text>
                      </View>
                      <Text style={styles.approved}>APPROVED</Text>
                    </View>

                    <Text style={styles.purpose}>{suggestion.plannedWorkout.purpose}</Text>
                    <InfoBlock title="Why this fits" items={suggestion.whyThisFits} />
                    {suggestion.harderOptionsExcluded.length ? (
                      <InfoBlock title="Why harder options were excluded" items={suggestion.harderOptionsExcluded} />
                    ) : null}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Required setup</Text>
                      <Text style={styles.detailValue}>{suggestion.requiredSetup}</Text>
                    </View>
                    <View style={styles.stopBox}>
                      <MaterialIcons name="report-problem" size={17} color={palette.orange} />
                      <Text style={styles.stopText}>{suggestion.stopRule}</Text>
                    </View>
                    {sources.length ? (
                      <Text style={styles.sources}>Sources · {sources.join(' · ')}</Text>
                    ) : null}

                    {suggestion.alternatives.length ? (
                      <View style={styles.alternatives}>
                        <Text style={styles.detailLabel}>Approved alternatives</Text>
                        <View style={styles.altButtons}>
                          {suggestion.alternatives.map(alternative => (
                            <Pressable
                              key={alternative.workoutId}
                              accessibilityRole="button"
                              onPress={() => setResult(current =>
                                current?.status === 'ready'
                                  ? replaceSuggestedWorkout(current, suggestion.dayIndex, alternative.workoutId, workouts)
                                  : current)}
                              style={styles.altButton}>
                              <Text style={styles.altText}>{alternative.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>

            <Card style={styles.warningCard}>
              {result.warnings.map(warning => <Bullet key={warning}>{warning}</Bullet>)}
            </Card>
            <PrimaryButton title={saving ? 'Saving…' : 'Save this training week'} onPress={save} disabled={saving} />
            <Pressable onPress={() => router.back()} style={styles.keepButton}>
              <Text style={styles.keepText}>Keep my current plan</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return <View style={styles.bulletRow}><Text style={styles.bullet}>•</Text><Text style={styles.bulletText}>{children}</Text></View>;
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return <View style={styles.infoBlock}><Text style={styles.infoTitle}>{title}</Text>{items.map(item => <Bullet key={item}>{item}</Bullet>)}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, paddingBottom: 44, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  loading: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  reasonCard: { gap: 8 },
  rulesCard: { gap: 8, borderColor: '#405020' },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  ruleTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { color: palette.accent, fontSize: 16, lineHeight: 18, fontWeight: '900' },
  bulletText: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 18 },
  week: { gap: 12 },
  dayCard: { gap: 13 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  dayBadge: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentDark },
  dayBadgeText: { color: palette.accent, fontSize: 11, fontWeight: '900' },
  workoutName: { color: palette.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  workoutMeta: { color: palette.muted, fontSize: 10, marginTop: 4, textTransform: 'capitalize' },
  approved: { color: palette.accent, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  purpose: { color: palette.text, fontSize: 12, lineHeight: 18 },
  infoBlock: { backgroundColor: palette.surface2, borderRadius: 13, padding: 11, gap: 5 },
  infoTitle: { color: palette.text, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  detailRow: { gap: 4 },
  detailLabel: { color: palette.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  detailValue: { color: palette.text, fontSize: 12, lineHeight: 18 },
  stopBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#2A1B0C', padding: 11, borderRadius: 12 },
  stopText: { flex: 1, color: palette.orange, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  sources: { color: palette.muted, fontSize: 9, lineHeight: 14 },
  alternatives: { gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 11 },
  altButtons: { gap: 7 },
  altButton: { minHeight: 42, justifyContent: 'center', borderRadius: 11, backgroundColor: palette.surface2, paddingHorizontal: 12 },
  altText: { color: palette.accent, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  warningCard: { gap: 7, borderStyle: 'dashed' },
  keepButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  keepText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
});
