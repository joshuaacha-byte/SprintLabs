import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card, PrimaryButton, ScreenTitle } from '@/components/sprint-ui';
import { Palette, useTheme } from '@/constants/sprintlab';
import type { CoachResponsePayload, PlanChangeProposal } from '@/types';
import { buildCurrentAthleteAIContext } from '@/utils/ai-context-live';
import { applyAIPlanChange } from '@/utils/plan-change-apply';

// SprintLab Intelligence I-2: smallest development-safe surface for reviewing a Gemini
// plan-change proposal end to end (ask -> proposal -> local validation -> approve/dismiss
// -> apply). Not the final Coach chat experience — a real Coach screen is later product work.

const localDateKey = (date = new Date()) => date.toLocaleDateString('en-CA');

type Phase = 'idle' | 'loading' | 'error' | 'answered';
type ApplyPhase = 'idle' | 'applying' | 'applied' | 'failed' | 'dismissed';

export default function CoachDevScreen() {
  const palette = useTheme();
  const styles = useStyles();
  const [message, setMessage] = useState('I missed Friday\'s workout and can only train Saturday or Sunday. What should I change?');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<CoachResponsePayload | null>(null);
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle');
  const [applyResult, setApplyResult] = useState<string | null>(null);

  async function ask() {
    setPhase('loading');
    setError(null);
    setResponse(null);
    setApplyPhase('idle');
    setApplyResult(null);
    try {
      const today = localDateKey();
      const context = await buildCurrentAthleteAIContext();
      if (!context) {
        setPhase('error');
        setError('No local athlete profile yet — complete onboarding before testing Coach.');
        return;
      }
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context, today }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 429) {
        setPhase('error');
        setError('Gemini rate-limited this request (429). Free-tier quota is exhausted for today — try again later.');
        return;
      }
      if (!res.ok || !body) {
        setPhase('error');
        setError(body?.error ?? `Coach request failed (status ${res.status}).`);
        return;
      }
      setResponse(body as CoachResponsePayload);
      setPhase('answered');
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Coach request failed.');
    }
  }

  async function approve(proposal: PlanChangeProposal) {
    setApplyPhase('applying');
    setApplyResult(null);
    const result = await applyAIPlanChange(proposal);
    if (result.ok) {
      setApplyPhase('applied');
      setApplyResult(`Applied. Updated: ${result.updatedDates.join(', ')}.`);
    } else {
      setApplyPhase('failed');
      setApplyResult(result.errors.join(' '));
    }
  }

  function dismiss() {
    setApplyPhase('dismissed');
    setApplyResult('Kept the original plan. No changes were made.');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Coach (dev)' }} />
      <ScreenTitle subtitle="Development-only surface for SprintLab Intelligence I-2. Not the final Coach UI.">
        Ask Coach
      </ScreenTitle>

      <Card style={styles.card}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          style={styles.input}
          placeholder="Ask a training question…"
          placeholderTextColor={palette.muted}
        />
        <PrimaryButton title={phase === 'loading' ? 'Asking…' : 'Ask Coach'} onPress={ask} disabled={phase === 'loading'} />
      </Card>

      {phase === 'loading' && <ActivityIndicator color={palette.accent} style={{ marginTop: 16 }} />}

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {response && (
        <Card style={styles.card}>
          <Text style={styles.label}>Answer</Text>
          <Text style={styles.answerText}>{response.message}</Text>
        </Card>
      )}

      {response?.proposal && (
        <Card style={styles.proposalCard}>
          <Text style={styles.label}>Proposed plan change</Text>
          <ProposalDetail proposal={response.proposal} styles={styles} />
          <Text style={styles.reasonText}>{response.proposal.reason}</Text>
          {response.proposal.confidence && (
            <Text style={styles.confidenceText}>Confidence: {response.proposal.confidence}</Text>
          )}

          {applyPhase === 'idle' && (
            <View style={styles.actionsRow}>
              <View style={{ flex: 1 }}>
                <PrimaryButton title="Apply" onPress={() => approve(response.proposal!)} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton title="Keep Original / Dismiss" onPress={dismiss} />
              </View>
            </View>
          )}
          {applyPhase === 'applying' && <ActivityIndicator color={palette.accent} style={{ marginTop: 12 }} />}
          {applyResult && (
            <Text style={[styles.resultText, applyPhase === 'failed' && styles.errorText]}>{applyResult}</Text>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

function ProposalDetail({ proposal, styles }: { proposal: PlanChangeProposal; styles: ReturnType<typeof useStyles> }) {
  const rows: [string, string][] = [['Type', proposal.type], ['Date', proposal.date]];
  if (proposal.toDate) rows.push(['New date', proposal.toDate]);
  if (proposal.workoutId) rows.push(['Current workout', proposal.workoutId]);
  if (proposal.newWorkoutId) rows.push(['New workout', proposal.newWorkoutId]);
  if (typeof proposal.modifier === 'number') rows.push(['Volume modifier', `${proposal.modifier}x`]);
  if (proposal.recoveryTitle) rows.push(['Recovery title', proposal.recoveryTitle]);
  return (
    <View style={{ gap: 4 }}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text style={styles.detailValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function useStyles() {
  const palette = useTheme();
  return createStyles(palette);
}

const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 16, paddingBottom: 48, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' },
  card: { gap: 12 },
  errorCard: { gap: 12, borderColor: palette.red },
  input: { color: palette.text, fontSize: 15, minHeight: 80, textAlignVertical: 'top', borderColor: palette.border, borderWidth: 1, borderRadius: 12, padding: 12 },
  label: { color: palette.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  answerText: { color: palette.text, fontSize: 15, lineHeight: 22 },
  errorText: { color: palette.red, fontSize: 14, lineHeight: 20 },
  proposalCard: { gap: 12, borderColor: palette.accent },
  reasonText: { color: palette.text, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  confidenceText: { color: palette.muted, fontSize: 13 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailLabel: { color: palette.muted, fontSize: 13 },
  detailValue: { color: palette.text, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  resultText: { color: palette.text, fontSize: 13, marginTop: 8 },
});
