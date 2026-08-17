import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCoach } from '@/components/coach-context';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { CoachMoment } from '@/types/coach-moment';
import { tap } from '@/utils/haptics';

// Renders a single already-selected CoachMoment (see utils/coach-moments.ts for how it was
// derived and prioritized). A PR gets its own distinct "NEW BEST" treatment; every other moment
// type shares one restrained card. Tapping "Ask Split" is the only thing that ever triggers a
// real Gemini call — opening Coach with the moment's context already attached via the same
// sendMessage(displayText, promptOverride) path every other suggestion chip in the app uses, so
// the athlete never has to restate what just happened.

export function CoachMomentCard({ moment }: { moment: CoachMoment }) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { openCoach, sendMessage } = useCoach();

  const askSplit = () => {
    if (!moment.handoff) return;
    tap();
    openCoach({ surface: moment.handoff.surface });
    void sendMessage(moment.handoff.displayText, moment.handoff.promptOverride);
  };

  if (moment.type === 'pr-recorded' && moment.pr) {
    return <View style={styles.prCard}>
      <View style={styles.prHead}>
        <MaterialIcons name="bolt" size={14} color={palette.accent} />
        <Text style={styles.prLabel}>NEW BEST</Text>
      </View>
      <Text style={styles.prEvent}>{moment.pr.event}</Text>
      <Text style={styles.prTime}>{moment.pr.newTimeSeconds}s</Text>
      <View style={styles.prDeltaRow}>
        <Text style={styles.prPrevious}>Previous · {moment.pr.previousTimeSeconds}s</Text>
        <Text style={styles.prDelta}>−{moment.pr.improvementSeconds.toFixed(2)}s</Text>
      </View>
      {moment.handoff ? <Pressable accessibilityRole="button" onPress={askSplit} style={styles.handoffRow}>
        <Text style={styles.handoffText}>{moment.handoff.displayText}</Text>
        <MaterialIcons name="arrow-forward" size={14} color={palette.accent} />
      </Pressable> : null}
    </View>;
  }

  return <View style={styles.card}>
    <View style={styles.iconWrap}><MaterialIcons name="auto-awesome" size={14} color={palette.accent} /></View>
    <View style={styles.body}>
      <Text style={styles.headline}>{moment.headline}</Text>
      {moment.body ? <Text style={styles.bodyText}>{moment.body}</Text> : null}
      {moment.handoff ? <Pressable accessibilityRole="button" onPress={askSplit} style={styles.handoffRowInline}>
        <Text style={styles.handoffText}>{moment.handoff.displayText}</Text>
        <MaterialIcons name="arrow-forward" size={13} color={palette.accent} />
      </Pressable> : null}
    </View>
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(201,255,24,0.16)',
    backgroundColor: 'rgba(201,255,24,0.05)',
    padding: 13,
  },
  iconWrap: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentDark },
  body: { flex: 1, gap: 3 },
  headline: { color: palette.text, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  bodyText: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  handoffRowInline: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  prCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: 'rgba(201,255,24,0.07)',
    padding: 16,
    gap: 4,
  },
  prHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prLabel: { color: palette.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  prEvent: { color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  prTime: { color: palette.text, fontSize: 34, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  prDeltaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  prPrevious: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  prDelta: { color: palette.accent, fontSize: 14, fontWeight: '900' },
  handoffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(201,255,24,0.2)', paddingTop: 10 },
  handoffText: { color: palette.accent, fontSize: 12, fontWeight: '800' },
});
