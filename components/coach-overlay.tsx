import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { splitImages } from '@/components/onboarding';
import { CoachMarkdown } from '@/components/coach-markdown';
import { CoachActionCard } from '@/components/coach-action-card';
import { CoachThinkingIndicator } from '@/components/coach-thinking';
import { useCoach, type CoachOpenContext, type CoachProposalMessage } from '@/components/coach-context';
import { Palette, useTheme } from '@/constants/sprintlab';
import { athleteFirstName, getAthleteProfile } from '@/utils/athlete-profile';
import { SUGGESTION_PROMPTS } from '@/utils/coach';
import { tap } from '@/utils/haptics';

// SprintLab Coach UI Phase C-2: renders whatever components/coach-context.tsx's conversation
// state holds — real Coach responses, proposal cards, loading, and errors. This file never
// calls /api/coach or applyAIPlanChange directly; it only calls sendMessage/applyProposal/
// dismissProposal from useCoach() and renders the result.

const SUGGESTIONS = Object.keys(SUGGESTION_PROMPTS);

// Only the generic "no specific context" greeting uses the athlete's name — every
// surface-specific greeting below already reads as personal/situational on its own, so adding a
// name to each of them would just repeat "Joshua" on every open rather than adding anything.
function greetingForContext(context: CoachOpenContext | null, firstName: string | null): string {
  if (!context) return firstName ? `Hey ${firstName}, what’s on your mind?` : 'What’s on your mind?';
  if (context.entityLabel) return `Want to talk through ${context.entityLabel}?`;
  switch (context.surface) {
    case 'today': return 'Here to help with today’s session.';
    case 'plan': return 'Want to talk through your week?';
    case 'history': return 'Looking back at your training?';
    case 'progress': return 'Let’s look at how things are trending.';
    case 'library': return 'Need help finding the right session?';
    case 'library-detail': return 'Questions about this workout?';
    case 'history-detail': return 'Want to talk through this session?';
    default: return firstName ? `Hey ${firstName}, what’s on your mind?` : 'What’s on your mind?';
  }
}

export function CoachOverlay() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const { isOpen, closeCoach, openContext, activeTrigger, messages, isSending, sendMessage, applyProposal, dismissProposal } = useCoach();
  const [draft, setDraft] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void getAthleteProfile().then(profile => { if (active) setFirstName(athleteFirstName(profile)); });
    return () => { active = false; };
  }, [isOpen]);

  // Full safe-area breathing room above the home indicator when the keyboard is closed; once the
  // keyboard is showing, the KeyboardAvoidingView has already pushed the composer to sit just
  // above it, so the extra inset would only add an ugly gap between the composer and the keyboard.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const submit = (displayText: string, promptOverride?: string) => {
    if (isSending) return;
    tap();
    void sendMessage(displayText, promptOverride);
    setDraft('');
  };

  return <Modal visible={isOpen} transparent animationType="slide" onRequestClose={closeCoach}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close SprintLab Coach" onPress={closeCoach} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Image source={splitImages.listening} style={styles.headerSplit} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Split</Text>
            <Text style={styles.headerSubtitle}>SprintLab Coach</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeCoach} style={styles.closeButton}>
            <MaterialIcons name="close" size={20} color={palette.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {activeTrigger ? <View style={styles.triggerBanner}>
            <MaterialIcons name="auto-awesome" size={15} color={palette.accent} />
            <View style={styles.triggerBannerBody}>
              <Text style={styles.triggerBannerText}>{activeTrigger.message}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={isSending}
                onPress={() => submit(activeTrigger.title, activeTrigger.suggestedPrompt)}
                style={[styles.triggerChip, isSending && styles.chipDisabled]}
              >
                <Text style={styles.triggerChipText}>{activeTrigger.title}</Text>
              </Pressable>
            </View>
          </View> : null}

          <Text style={styles.greeting}>{greetingForContext(openContext, firstName)}</Text>

          <View style={styles.chipRow}>
            {SUGGESTIONS.map(suggestion => (
              <Pressable key={suggestion} accessibilityRole="button" disabled={isSending} onPress={() => submit(suggestion, SUGGESTION_PROMPTS[suggestion])} style={[styles.chip, isSending && styles.chipDisabled]}>
                <Text style={styles.chipText}>{suggestion}</Text>
              </Pressable>
            ))}
          </View>

          {messages.length > 0 ? <View style={styles.messages}>
            {messages.map(message => {
              if (message.kind === 'proposal') {
                return <ProposalCard key={message.id} message={message} styles={styles} palette={palette} onApply={() => applyProposal(message.id)} onDismiss={() => dismissProposal(message.id)} />;
              }
              if (message.kind === 'action') {
                return <CoachActionCard key={message.id} message={message} />;
              }
              if (message.kind === 'error') {
                return <View key={message.id} style={styles.errorBubble}>
                  <MaterialIcons name="error-outline" size={15} color={palette.red} />
                  <Text style={styles.errorBubbleText}>{message.text}</Text>
                </View>;
              }
              return <View key={message.id} style={[styles.messageBubble, message.kind === 'athlete' ? styles.messageAthlete : styles.messageSplit]}>
                {message.kind === 'athlete'
                  ? <Text style={styles.messageAthleteText}>{message.text}</Text>
                  : <CoachMarkdown>{message.text}</CoachMarkdown>}
              </View>;
            })}
          </View> : null}

          {isSending ? <CoachThinkingIndicator /> : null}
        </ScrollView>

        <View style={[styles.inputRow, { paddingBottom: keyboardVisible ? 10 : insets.bottom + 12 }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask Split…"
            placeholderTextColor={palette.muted}
            style={styles.input}
            editable={!isSending}
            returnKeyType="send"
            onSubmitEditing={() => submit(draft)}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!draft.trim() || isSending} onPress={() => submit(draft)} style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}>
            <MaterialIcons name="arrow-upward" size={19} color="#0A0E07" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function ProposalCard({ message, styles, palette, onApply, onDismiss }: {
  message: CoachProposalMessage;
  styles: ReturnType<typeof createStyles>;
  palette: Palette;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { display, status } = message;
  return <View style={styles.proposalCard}>
    <Text style={styles.messageSplitText}>{message.text}</Text>
    <View style={styles.proposalBody}>
      <Text style={styles.proposalAction}>{display.actionLabel}</Text>
      <Text style={styles.proposalSubject}>{display.subjectTitle}</Text>
      <View style={styles.proposalChangeRow}>
        <Text style={styles.proposalFrom} numberOfLines={1}>{display.fromLabel}</Text>
        <MaterialIcons name="arrow-forward" size={14} color={palette.muted} />
        <Text style={styles.proposalTo} numberOfLines={1}>{display.toLabel}</Text>
      </View>
      <Text style={styles.proposalReason}>{message.proposal.reason}</Text>
    </View>

    {status === 'pending' ? <View style={styles.proposalActions}>
      <Pressable accessibilityRole="button" onPress={onApply} style={styles.applyButton}>
        <Text style={styles.applyButtonText}>Apply</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.keepButton}>
        <Text style={styles.keepButtonText}>Keep Original</Text>
      </Pressable>
    </View> : null}

    {status === 'applying' ? <View style={styles.proposalStatusRow}><ActivityIndicator size="small" color={palette.accent} /><Text style={styles.proposalStatusText}>Applying…</Text></View> : null}
    {status === 'applied' ? <View style={styles.proposalStatusRow}><MaterialIcons name="check-circle" size={16} color={palette.success} /><Text style={styles.proposalStatusText}>Applied</Text></View> : null}
    {status === 'dismissed' ? <Text style={styles.proposalStatusText}>Kept original plan</Text> : null}
    {status === 'stale' ? <Text style={[styles.proposalStatusText, styles.proposalStatusError]}>{message.statusNote}</Text> : null}
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { maxHeight: '82%', backgroundColor: palette.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: palette.border, paddingBottom: 8 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.border, marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  headerSplit: { width: 40, height: 40 },
  headerCopy: { flex: 1 },
  headerTitle: { color: palette.text, fontSize: 16, fontWeight: '900' },
  headerSubtitle: { color: palette.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, gap: 14 },
  triggerBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 14, borderWidth: 1, borderColor: palette.accent, backgroundColor: palette.surface2, padding: 12 },
  triggerBannerBody: { flex: 1, gap: 9 },
  triggerBannerText: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  triggerChip: { alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  triggerChipText: { color: '#0A0E07', fontSize: 12, fontWeight: '800' },
  greeting: { color: palette.text, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: palette.surface2, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  chipDisabled: { opacity: 0.5 },
  chipText: { color: palette.text, fontSize: 12, fontWeight: '700' },
  messages: { gap: 8, marginTop: 4 },
  messageBubble: { maxWidth: '86%', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  messageAthlete: { alignSelf: 'flex-end', backgroundColor: palette.accent },
  messageAthleteText: { color: '#0A0E07', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  messageSplit: { alignSelf: 'flex-start', backgroundColor: palette.surface2, borderWidth: 1, borderColor: palette.border },
  messageSplitText: { color: palette.text, fontSize: 13, lineHeight: 18 },
  errorBubble: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', maxWidth: '90%', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: 'rgba(255,98,98,0.1)', borderWidth: 1, borderColor: 'rgba(255,98,98,0.3)' },
  errorBubbleText: { flex: 1, color: palette.red, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  proposalCard: { alignSelf: 'stretch', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: palette.accent, backgroundColor: palette.surface2, padding: 13 },
  proposalBody: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 9 },
  proposalAction: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  proposalSubject: { color: palette.text, fontSize: 14, fontWeight: '800' },
  proposalChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  proposalFrom: { flexShrink: 1, color: palette.muted, fontSize: 12, fontWeight: '700' },
  proposalTo: { flexShrink: 1, color: palette.text, fontSize: 12, fontWeight: '800' },
  proposalReason: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 4, fontStyle: 'italic' },
  proposalActions: { flexDirection: 'row', gap: 8 },
  applyButton: { flex: 1, minHeight: 40, borderRadius: 11, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  applyButtonText: { color: '#0A0E07', fontSize: 13, fontWeight: '900' },
  keepButton: { flex: 1, minHeight: 40, borderRadius: 11, backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  keepButtonText: { color: palette.text, fontSize: 13, fontWeight: '800' },
  proposalStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  proposalStatusText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  proposalStatusError: { color: palette.red },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 10 },
  input: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg, color: palette.text, paddingHorizontal: 14, fontSize: 14 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.4 },
});
