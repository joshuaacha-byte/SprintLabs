import { useEffect, useMemo, useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Palette, useTheme } from '@/constants/sprintlab';
import { error, selection, tap } from '@/utils/haptics';

export function NativeDateField({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  accessibilityLabel: string;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
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
      <View style={styles.calendarHint}>
        <MaterialIcons name="calendar-month" size={18} color={palette.accent} />
        <Text style={styles.help}>Use YYYY-MM-DD in the browser. On a phone, this opens the device calendar.</Text>
      </View>
      <View style={styles.actions}>
        <Pressable disabled={!valid} onPress={() => { tap(); onChange(draft); }} style={[styles.action, !valid && styles.disabled]}>
          <Text style={styles.actionText}>Use date</Text>
        </Pressable>
        {value ? <Pressable onPress={() => { selection(); onChange(null); }} style={styles.clear}><Text style={styles.clearText}>Clear</Text></Pressable> : null}
      </View>
    </View>
  );
}

export function NativeTimeField({
  hour,
  minute,
  onChange,
  openRequestKey: _openRequestKey,
  hideTrigger: _hideTrigger,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  openRequestKey?: number;
  hideTrigger?: boolean;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
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
        onPress={() => {
          const nextHour = Math.min(23, Math.max(0, Number(hourDraft) || 0));
          const nextMinute = Math.min(59, Math.max(0, Number(minuteDraft) || 0));
          if (!Number.isFinite(Number(hourDraft)) || !Number.isFinite(Number(minuteDraft))) {
            error();
            return;
          }
          if (nextHour !== hour || nextMinute !== minute) selection();
          else tap();
          onChange(nextHour, nextMinute);
        }}
        style={styles.action}
      >
        <Text style={styles.actionText}>Apply</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  stack: { gap: 8 },
  input: { minHeight: 50, borderRadius: 14, paddingHorizontal: 14, color: palette.text, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  actions: { flexDirection: 'row', gap: 8 },
  action: { minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 11, paddingHorizontal: 14, backgroundColor: palette.accentDark },
  actionText: { color: palette.accent, fontSize: 12, fontWeight: '900' },
  clear: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12 },
  clearText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  help: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  calendarHint: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, minHeight: 48, borderRadius: 12, textAlign: 'center', color: palette.text, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, fontWeight: '900' },
  colon: { color: palette.text, fontSize: 22, fontWeight: '900' },
});
