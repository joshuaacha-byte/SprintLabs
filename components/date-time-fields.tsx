import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '@/constants/sprintlab';

export function NativeDateField({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  accessibilityLabel: string;
}) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft);
  return (
    <View style={styles.stack}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={draft}
        onChangeText={setDraft}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={palette.muted}
        maxLength={10}
        style={styles.input}
      />
      <View style={styles.actions}>
        <Pressable onPress={() => valid && onChange(draft)} style={[styles.action, !valid && styles.disabled]}>
          <Text style={styles.actionText}>Use date</Text>
        </Pressable>
        {value ? <Pressable onPress={() => onChange(null)} style={styles.clear}><Text style={styles.clearText}>Clear</Text></Pressable> : null}
      </View>
      <Text style={styles.help}>On iPhone and Android this opens the device calendar.</Text>
    </View>
  );
}

export function NativeTimeField({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  const [hourDraft, setHourDraft] = useState(String(hour));
  const [minuteDraft, setMinuteDraft] = useState(String(minute).padStart(2, '0'));
  useEffect(() => {
    setHourDraft(String(hour));
    setMinuteDraft(String(minute).padStart(2, '0'));
  }, [hour, minute]);
  return (
    <View style={styles.timeRow}>
      <TextInput value={hourDraft} onChangeText={value => setHourDraft(value.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" style={styles.timeInput} />
      <Text style={styles.colon}>:</Text>
      <TextInput value={minuteDraft} onChangeText={value => setMinuteDraft(value.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" style={styles.timeInput} />
      <Pressable
        onPress={() => onChange(Math.min(23, Math.max(0, Number(hourDraft) || 0)), Math.min(59, Math.max(0, Number(minuteDraft) || 0)))}
        style={styles.action}
      >
        <Text style={styles.actionText}>Apply</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  input: { minHeight: 50, borderRadius: 14, paddingHorizontal: 14, color: palette.text, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  actions: { flexDirection: 'row', gap: 8 },
  action: { minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 11, paddingHorizontal: 14, backgroundColor: palette.accentDark },
  actionText: { color: palette.accent, fontSize: 12, fontWeight: '900' },
  clear: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12 },
  clearText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  help: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, minHeight: 48, borderRadius: 12, textAlign: 'center', color: palette.text, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, fontWeight: '900' },
  colon: { color: palette.text, fontSize: 22, fontWeight: '900' },
});
