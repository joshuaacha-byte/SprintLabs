import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Eyebrow, ScreenTitle } from '@/components/sprint-ui';
import { AppFooter } from '@/components/app-footer';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { AthleteProfile, AthleteSport, CompletedWorkoutSession, EventPathway, EventTag, LibraryApprovalStatus, LibraryAthleteLevel, LibrarySeasonPhase, LibrarySurface, LibraryWorkout, LibraryWorkoutCategory, ScheduledDay, SpeedGoal, SpeedPathway, TrainingContext, WorkoutLibraryFilters } from '@/types';
import { defaultWorkoutLibraryFilters, filterLibraryWorkouts, getLibraryWorkouts } from '@/utils/workout-library';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { getCompletedWorkoutSessions, getWeekSchedule } from '@/utils/storage';
import { LIBRARY_DISCIPLINES, libraryCategoryLabels, type LibraryDiscipline, type LibraryDisciplineId } from '@/utils/library-taxonomy';
import { recentlyUsed, recommendedForProfile, relevantToWeek } from '@/utils/library-retrieval';
import { selection, tap } from '@/utils/haptics';

const RESEARCH_URL = 'https://drive.google.com/drive/folders/1YsqqaUz08VPK9mdFMTppX06NRzJmjwqb?usp=sharing';

const categories: LibraryWorkoutCategory[] = ['acceleration', 'maximum-velocity', 'starts', 'speed-endurance', 'special-endurance', 'tempo-recovery', 'strength', 'plyometrics', 'core-bodyweight', 'testing', 'meet-preparation', 'multidirectional-acceleration', 'deceleration', 'change-of-direction', 'reactive-agility', 'repeated-sprint-ability', 'resisted-sprinting', 'assisted-sprint-exposure', 'combine-preparation', 'field-conditioning', 'court-speed', 'explosive-power', 'sport-practice-recovery', 'game-day-preparation'];
const levels: LibraryAthleteLevel[] = ['foundation', 'developing', 'trained', 'advanced'];
const phases: LibrarySeasonPhase[] = ['general-preparation', 'specific-preparation', 'pre-competition', 'competition', 'taper', 'transition'];
const pathways: EventPathway[] = ['short-sprint-100-200', 'long-sprint-200-400', 'shared'];
const events: EventTag[] = ['60m', '100m', '200m', '400m'];
const surfaces: LibrarySurface[] = ['track', 'track-curve', 'turf', 'level-grass', 'hill', 'gym', 'pool', 'indoor', 'home'];
const statusTabs: { value: LibraryApprovalStatus; label: string; description: string }[] = [
  { value: 'approved', label: 'Ready to use', description: 'Reviewed sessions you can add to your plan or start now.' },
  { value: 'draft', label: 'In review', description: 'Documented ideas awaiting review. They cannot be started or suggested.' },
  { value: 'archived', label: 'Archived', description: 'Retained for reference, but excluded from plans and workout starts.' },
];
const sports: AthleteSport[] = ['track-and-field', 'football', 'soccer', 'basketball', 'baseball', 'softball', 'lacrosse', 'rugby', 'volleyball', 'general-athletic-performance', 'other'];
const speedGoals: SpeedGoal[] = ['acceleration', 'maximum-velocity', 'multidirectional-speed', 'repeated-sprint-ability', 'speed-endurance', 'explosive-power', 'combine-testing', 'general-speed-development'];
const speedPathways: SpeedPathway[] = ['track-short-sprint', 'track-long-sprint', 'linear-acceleration', 'maximum-velocity', 'multidirectional-field-sport', 'repeated-sprint-field-sport', 'court-speed', 'combine-preparation', 'general-speed-development', 'logging-only'];
const trainingContexts: TrainingContext[] = ['offseason', 'preseason', 'in-season', 'postseason', 'return-to-training', 'general-development'];

const label = (value: string) => value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

type LibraryView = 'home' | 'category' | 'search';

function Chip({ label: text, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Pressable onPress={() => { if (!selected) selection(); onPress(); }} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{text}</Text></Pressable>;
}

export default function LibraryScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [workouts, setWorkouts] = useState<LibraryWorkout[]>([]);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [schedule, setSchedule] = useState<ScheduledDay[]>([]);
  const [sessions, setSessions] = useState<CompletedWorkoutSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<LibraryView>('home');
  const [activeDiscipline, setActiveDiscipline] = useState<LibraryDiscipline | null>(null);
  const [filters, setFilters] = useState<WorkoutLibraryFilters>(defaultWorkoutLibraryFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([getLibraryWorkouts(), getAthleteProfile(), getWeekSchedule(), getCompletedWorkoutSessions()]).then(([workoutResult, profileResult, scheduleResult, sessionResult]) => {
      setWorkouts(workoutResult);
      setProfile(profileResult);
      setSchedule(scheduleResult);
      setSessions(sessionResult);
      setLoaded(true);
    });
  }, []));

  const approved = useMemo(() => workouts.filter(workout => workout.approvalStatus === 'approved'), [workouts]);
  const disciplineCounts = useMemo(() => {
    const counts = new Map<LibraryDisciplineId, number>();
    for (const workout of approved) {
      const discipline = LIBRARY_DISCIPLINES.find(item => item.categories.includes(workout.primaryCategory));
      if (discipline) counts.set(discipline.id, (counts.get(discipline.id) ?? 0) + 1);
    }
    return counts;
  }, [approved]);
  const recommended = useMemo(() => recommendedForProfile(workouts, profile, 8), [workouts, profile]);
  const forThisWeek = useMemo(() => relevantToWeek(workouts, schedule, 8), [workouts, schedule]);
  const recent = useMemo(() => recentlyUsed(workouts, sessions, 8), [workouts, sessions]);

  const visible = useMemo(() => filterLibraryWorkouts(workouts, filters), [workouts, filters]);
  const categoryWorkouts = useMemo(() => activeDiscipline ? approved.filter(workout => activeDiscipline.categories.includes(workout.primaryCategory)) : [], [activeDiscipline, approved]);

  const change = <K extends keyof WorkoutLibraryFilters>(key: K, value: WorkoutLibraryFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const openWorkout = (workout: LibraryWorkout) => { tap(); router.push({ pathname: '/library-detail', params: { id: workout.id } }); };
  const openDiscipline = (discipline: LibraryDiscipline) => { tap(); setActiveDiscipline(discipline); setView('category'); };
  const backToHome = () => { tap(); setView('home'); setActiveDiscipline(null); };
  const openSearch = () => { tap(); setFilters(defaultWorkoutLibraryFilters); setView('search'); };

  if (view === 'category' && activeDiscipline) {
    return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Library" onPress={backToHome} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
      <Eyebrow>Browse by training intent</Eyebrow>
      <ScreenTitle subtitle={activeDiscipline.description}>{activeDiscipline.label}</ScreenTitle>
      <Text style={styles.count}>{categoryWorkouts.length} {categoryWorkouts.length === 1 ? 'workout' : 'workouts'}</Text>
      {categoryWorkouts.map(workout => <Pressable key={workout.id} onPress={() => openWorkout(workout)}><WorkoutCard workout={workout} /></Pressable>)}
      {!categoryWorkouts.length ? <Card style={styles.empty}><MaterialIcons name="filter-alt-off" size={26} color={palette.muted} /><Text style={styles.emptyTitle}>No Approved sessions yet</Text><Text style={styles.emptyText}>Check back as more {activeDiscipline.label.toLowerCase()} sessions are reviewed.</Text></Card> : null}
      <AppFooter />
    </ScrollView></SafeAreaView>;
  }

  if (view === 'search') {
    const activeStatus = statusTabs.find(tab => tab.value === filters.status) ?? statusTabs[0];
    const selectStatus = (status: LibraryApprovalStatus) => { const next = { ...defaultWorkoutLibraryFilters, status }; if (JSON.stringify(filters) !== JSON.stringify(next)) selection(); setFilters(next); };
    return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Library" onPress={backToHome} style={styles.back}><MaterialIcons name="arrow-back" size={22} color={palette.text} /></Pressable>
      <Eyebrow>Search & advanced filters</Eyebrow>
      <ScreenTitle subtitle="Search every session, or narrow by sport, event, level, equipment, and more.">All workouts</ScreenTitle>
      <View style={styles.statusTabs}>{statusTabs.map(tab => <Pressable key={tab.value} onPress={() => selectStatus(tab.value)} style={[styles.statusTab, filters.status === tab.value && styles.statusTabActive]}><Text style={[styles.statusTabLabel, filters.status === tab.value && styles.statusTabLabelActive]}>{tab.label}</Text></Pressable>)}</View>
      <Text style={styles.statusHelp}>{activeStatus.description}</Text>
      <View style={styles.searchRow}><View style={styles.search}><MaterialIcons name="search" size={20} color={palette.muted} /><TextInput value={filters.query} onChangeText={value => change('query', value)} placeholder="Search workouts, cues, equipment…" placeholderTextColor={palette.muted} style={styles.searchInput} /></View><Pressable accessibilityRole="button" accessibilityLabel={filtersOpen ? 'Hide filters' : 'Show filters'} onPress={() => { tap(); setFiltersOpen(current => !current); }} style={[styles.filterButton, filtersOpen && styles.filterButtonOpen]}><MaterialIcons name="tune" size={19} color={filtersOpen ? '#0B1000' : palette.accent} /></Pressable></View>
      {filtersOpen && <Card style={styles.filterCard}>
        <View style={styles.filterTitleRow}><Text style={styles.filterTitle}>Narrow {activeStatus.label.toLowerCase()}</Text><Pressable onPress={() => selectStatus(activeStatus.value)}><Text style={styles.clear}>Clear filters</Text></Pressable></View>
        <FilterGroup title="Sport" values={['all', ...sports]} active={filters.sport ?? 'all'} display={value => value === 'all' ? 'All' : label(value)} onSelect={value => change('sport', value as WorkoutLibraryFilters['sport'])} />
        <FilterGroup title="Speed goal" values={['all', ...speedGoals]} active={filters.speedGoal ?? 'all'} display={label} onSelect={value => change('speedGoal', value as WorkoutLibraryFilters['speedGoal'])} />
        <FilterGroup title="Speed pathway" values={['all', ...speedPathways]} active={filters.speedPathway ?? 'all'} display={label} onSelect={value => change('speedPathway', value as WorkoutLibraryFilters['speedPathway'])} />
        <FilterGroup title="Training context" values={['all', ...trainingContexts]} active={filters.trainingContext ?? 'all'} display={label} onSelect={value => change('trainingContext', value as WorkoutLibraryFilters['trainingContext'])} />
        <FilterGroup title="Category" values={['all', ...categories]} active={filters.category} display={value => value === 'all' ? 'All' : libraryCategoryLabels[value as LibraryWorkoutCategory]} onSelect={value => change('category', value as WorkoutLibraryFilters['category'])} />
        <FilterGroup title="Athlete level" values={['all', ...levels]} active={filters.athleteLevel} display={label} onSelect={value => change('athleteLevel', value as WorkoutLibraryFilters['athleteLevel'])} />
        <FilterGroup title="Training season" values={['all', ...phases]} active={filters.seasonPhase} display={label} onSelect={value => change('seasonPhase', value as WorkoutLibraryFilters['seasonPhase'])} />
        <FilterGroup title="Track event pathway" values={['all', ...pathways]} active={filters.pathway} display={value => value === 'all' ? 'All' : value === 'short-sprint-100-200' ? '100/200 short' : value === 'long-sprint-200-400' ? '200/400 long' : 'Shared'} onSelect={value => change('pathway', value as WorkoutLibraryFilters['pathway'])} />
        <FilterGroup title="Track event" values={['all', ...events]} active={filters.eventTag} display={value => value === 'all' ? 'All' : value} onSelect={value => change('eventTag', value as WorkoutLibraryFilters['eventTag'])} />
        <FilterGroup title="Surface" values={['all', ...surfaces]} active={filters.surface} display={label} onSelect={value => change('surface', value as WorkoutLibraryFilters['surface'])} />
        <FilterGroup title="Duration" values={['all', 'under-45', '45-60', '61-75', 'over-75']} active={filters.duration} display={value => ({ all: 'All', 'under-45': '<45 min', '45-60': '45–60', '61-75': '61–75', 'over-75': '75+ min' })[value] ?? value} onSelect={value => change('duration', value as WorkoutLibraryFilters['duration'])} />
        <Text style={styles.filterLabel}>Equipment</Text>
        <TextInput value={filters.equipment === 'all' ? '' : filters.equipment} onChangeText={value => change('equipment', value || 'all')} placeholder="e.g. cones, sled, court" placeholderTextColor={palette.muted} style={styles.equipmentInput} />
        <Text style={styles.filterLabel}>Sort</Text>
        <View style={styles.chips}>{(['relevance', 'name', 'duration', 'recently-updated', 'progression'] as const).map(value => <Chip key={value} label={value === 'recently-updated' ? 'Recently updated' : label(value)} selected={filters.sort === value} onPress={() => change('sort', value)} />)}</View>
      </Card>}
      <Text style={styles.count}>{loaded ? `${visible.length} ${visible.length === 1 ? 'workout' : 'workouts'}` : 'Loading…'}</Text>
      {loaded && visible.map(workout => <Pressable key={workout.id} onPress={() => openWorkout(workout)}><WorkoutCard workout={workout} /></Pressable>)}
      {loaded && !visible.length && <Card style={styles.empty}><MaterialIcons name="filter-alt-off" size={28} color={palette.muted} /><Text style={styles.emptyTitle}>No {activeStatus.label.toLowerCase()} workouts match</Text><Text style={styles.emptyText}>Clear the filters or choose another library status above.</Text></Card>}
      <AppFooter />
    </ScrollView></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Eyebrow>Human-authored sessions</Eyebrow>
    <ScreenTitle subtitle="Browse the curated speed-development library by what you need today.">Library</ScreenTitle>

    <View style={styles.quickActions}>
      <Pressable onPress={() => { tap(); router.push({ pathname: '/workout-builder', params: { mode: 'unplanned' } }); }} style={styles.quickAction}><MaterialIcons name="add-circle-outline" size={20} color={palette.accent} /><View style={{ flex: 1 }}><Text style={styles.quickTitle}>Start an unplanned workout</Text><Text style={styles.quickCopy}>Build a one-off session without changing the weekly plan.</Text></View><MaterialIcons name="chevron-right" size={21} color={palette.muted} /></Pressable>
      <Pressable onPress={() => { tap(); router.push('/plan-preview'); }} style={styles.quickAction}><MaterialIcons name="calendar-month" size={20} color={palette.accent} /><View style={{ flex: 1 }}><Text style={styles.quickTitle}>Build my week</Text><Text style={styles.quickCopy}>Preview profile-matched Approved sessions before saving.</Text></View><MaterialIcons name="chevron-right" size={21} color={palette.muted} /></Pressable>
    </View>

    {recommended.length ? <DiscoveryRow title="Recommended for you" workouts={recommended} onPress={openWorkout} /> : null}
    {forThisWeek.length ? <DiscoveryRow title="Relevant to your week" workouts={forThisWeek} onPress={openWorkout} /> : null}
    {recent.length ? <DiscoveryRow title="Recently used" workouts={recent} onPress={openWorkout} /> : null}

    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Browse by training intent</Text></View>
    <View style={styles.disciplineGrid}>
      {LIBRARY_DISCIPLINES.map(discipline => <Pressable key={discipline.id} onPress={() => openDiscipline(discipline)} style={styles.disciplineTile}>
        <View style={styles.disciplineIcon}><MaterialIcons name={discipline.icon as keyof typeof MaterialIcons.glyphMap} size={22} color={palette.accent} /></View>
        <Text style={styles.disciplineLabel}>{discipline.label}</Text>
        <Text style={styles.disciplineCount}>{disciplineCounts.get(discipline.id) ?? 0} sessions</Text>
      </Pressable>)}
    </View>

    <Pressable accessibilityRole="button" onPress={openSearch} style={styles.searchEntry}>
      <MaterialIcons name="search" size={19} color={palette.muted} />
      <Text style={styles.searchEntryText}>Search & advanced filters</Text>
      <MaterialIcons name="chevron-right" size={21} color={palette.muted} />
    </Pressable>

    <Card style={styles.ruleCard}>
      <MaterialIcons name="verified-user" size={20} color={palette.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.ruleText}>Only reviewed, Approved sessions can be suggested or started.</Text>
        <Pressable accessibilityRole="link" onPress={() => { tap(); void WebBrowser.openBrowserAsync(RESEARCH_URL); }} style={styles.researchLink}>
          <Text style={styles.researchText}>Explore the research behind SprintLab</Text>
          <MaterialIcons name="open-in-new" size={15} color={palette.accent} />
        </Pressable>
      </View>
    </Card>
    <AppFooter />
  </ScrollView></SafeAreaView>;
}

function DiscoveryRow({ title, workouts, onPress }: { title: string; workouts: LibraryWorkout[]; onPress: (workout: LibraryWorkout) => void }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.discoverySection}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discoveryRow}>
      {workouts.map(workout => <Pressable key={workout.id} onPress={() => onPress(workout)} style={styles.discoveryCard}>
        <Text style={styles.discoveryCategory}>{libraryCategoryLabels[workout.primaryCategory]}</Text>
        <Text numberOfLines={2} style={styles.discoveryName}>{workout.name}</Text>
        <Text style={styles.discoveryMeta}>{workout.metrics.estimatedDurationMinutes[0]}–{workout.metrics.estimatedDurationMinutes[1]} min</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}

function FilterGroup({ title, values, active, display, onSelect }: { title: string; values: readonly string[]; active: string; display: (value: string) => string; onSelect: (value: string) => void }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <View><Text style={styles.filterLabel}>{title}</Text><View style={styles.chips}>{values.map(value => <Chip key={value} label={display(value)} selected={active === value} onPress={() => onSelect(value)} />)}</View></View>; }

function WorkoutCard({ workout }: { workout: LibraryWorkout }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); const duration = workout.metrics.estimatedDurationMinutes; const trackOnly = (workout.sports ?? ['track-and-field']).every(sport => sport === 'track-and-field'); return <Card style={styles.workoutCard}><View style={styles.cardHead}><View style={{ flex: 1 }}><Text style={styles.workoutName}>{workout.name}</Text><Text style={styles.purpose} numberOfLines={2}>{workout.purpose}</Text></View><Text style={[styles.status, workout.approvalStatus === 'approved' ? styles.approved : workout.approvalStatus === 'draft' ? styles.draft : styles.archived]}>{workout.approvalStatus}</Text></View><View style={styles.chips}><Text style={styles.category}>{libraryCategoryLabels[workout.primaryCategory]}</Text>{(workout.speedGoals ?? []).map(goal => <Text key={goal} style={styles.metaChip}>{label(goal)}</Text>)}</View><View style={styles.cardMetrics}><CardMetric label="Duration" value={duration[0] === duration[1] ? `${duration[0]} min` : `${duration[0]}–${duration[1]} min`} /><CardMetric label={trackOnly ? 'Sprint vol.' : 'Speed work'} value={trackOnly ? `${workout.metrics.totalSprintVolumeMeters}m` : label(workout.directionPattern ?? 'linear')} /><CardMetric label="Intensity" value={trackOnly ? `${workout.metrics.highIntensitySprintVolumeMeters}m` : (workout.speedPathways ?? []).map(label).join(', ') || '—'} /></View><Text style={styles.compatibility} numberOfLines={1}>{trackOnly ? `${workout.eventTags.join(' · ')} · ` : ''}{(workout.sports ?? ['track-and-field']).map(label).join(', ')} · {workout.athleteLevels.map(label).join(', ')} · {workout.surface.required.map(label).join(', ')}</Text></Card>; }
function CardMetric({ label: text, value }: { label: string; value: string }) { const palette = useTheme(); const styles = useMemo(() => createStyles(palette), [palette]); return <View style={styles.metric}><Text style={styles.metricLabel}>{text}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const createStyles = (palette: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, page: { padding: 20, paddingBottom: 38, gap: 16 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  ruleCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderColor: '#405020' }, ruleText: { color: palette.muted, fontSize: 12, lineHeight: 17 }, researchLink: { minHeight: 34, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }, researchText: { color: palette.accent, fontSize: 11, fontWeight: '900' },
  quickActions: { gap: 8 }, quickAction: { minHeight: 66, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }, quickTitle: { color: palette.text, fontSize: 13, fontWeight: '900' }, quickCopy: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  discoverySection: { gap: 10 }, discoveryRow: { gap: 10, paddingRight: 20 }, discoveryCard: { width: 168, minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 12, gap: 5, justifyContent: 'space-between' }, discoveryCategory: { color: palette.accent, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 }, discoveryName: { color: palette.text, fontSize: 13, fontWeight: '800', lineHeight: 17 }, discoveryMeta: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  sectionHead: { marginTop: 2 }, sectionTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  disciplineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  disciplineTile: { flexBasis: '47%', flexGrow: 1, minHeight: 108, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 13, gap: 8 },
  disciplineIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.accentDark, alignItems: 'center', justifyContent: 'center' },
  disciplineLabel: { color: palette.text, fontSize: 13, fontWeight: '900' }, disciplineCount: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  searchEntry: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 14 }, searchEntryText: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '800' },
  statusTabs: { flexDirection: 'row', gap: 7 }, statusTab: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }, statusTabActive: { borderColor: palette.accent, backgroundColor: palette.accentDark }, statusTabLabel: { color: palette.muted, fontSize: 11, fontWeight: '900' }, statusTabLabelActive: { color: palette.accent }, statusHelp: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  searchRow: { flexDirection: 'row', gap: 9 }, search: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', gap: 8, paddingHorizontal: 12, alignItems: 'center' }, searchInput: { flex: 1, minHeight: 48, color: palette.text, fontSize: 13 }, filterButton: { width: 50, borderWidth: 1, borderColor: palette.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, filterButtonOpen: { backgroundColor: palette.accent, borderColor: palette.accent }, filterCard: { gap: 11 }, filterTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, filterTitle: { color: palette.text, fontSize: 15, fontWeight: '900' }, clear: { color: palette.accent, fontSize: 12, fontWeight: '900' }, filterLabel: { color: palette.muted, fontSize: 10, letterSpacing: .7, fontWeight: '900', marginBottom: 6 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { minHeight: 31, paddingHorizontal: 9, borderRadius: 9, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2 }, chipSelected: { borderColor: palette.accent, backgroundColor: palette.accentDark }, chipText: { color: palette.muted, fontSize: 10, fontWeight: '800' }, chipTextSelected: { color: palette.accent }, equipmentInput: { minHeight: 43, borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface2, color: palette.text, paddingHorizontal: 11, fontSize: 13 },
  count: { color: palette.muted, fontSize: 11, fontWeight: '900', letterSpacing: .7 }, workoutCard: { gap: 10 }, cardHead: { flexDirection: 'row', gap: 10 }, workoutName: { color: palette.text, fontSize: 16, fontWeight: '900' }, purpose: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, status: { alignSelf: 'flex-start', fontSize: 9, fontWeight: '900', textTransform: 'capitalize', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, overflow: 'hidden' }, approved: { color: palette.accent, backgroundColor: palette.accentDark }, draft: { color: palette.orange, backgroundColor: '#2A1B0C' }, archived: { color: palette.red, backgroundColor: '#301719' }, category: { color: palette.accent, backgroundColor: palette.accentDark, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 7, fontSize: 10, fontWeight: '900' }, metaChip: { color: palette.text, backgroundColor: palette.surface2, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 7, fontSize: 10, fontWeight: '800' }, cardMetrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 8 }, metricLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', textTransform: 'capitalize' }, metricValue: { color: palette.text, fontSize: 11, fontWeight: '900', marginTop: 3 }, compatibility: { color: palette.muted, fontSize: 10, textTransform: 'capitalize' }, empty: { alignItems: 'center', gap: 8, paddingVertical: 32 }, emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '900' }, emptyText: { color: palette.muted, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
