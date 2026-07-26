import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '@/constants/sprintlab';

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDate = (value?: string | null) => {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export function NativeDateField({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  accessibilityLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseDate(value), [value]);
  const change = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || !date) return;
    onChange(localDateKey(date));
  };
  return (
    <View style={styles.stack}>
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={() => setOpen(true)} style={styles.field}>
        <Text style={value ? styles.value : styles.placeholder}>{value ? selected.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : 'Choose a date'}</Text>
        <Text style={styles.icon}>▣</Text>
      </Pressable>
      {open ? (
        <View style={styles.pickerPanel}>
          <DateTimePicker
            value={selected}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={change}
            minimumDate={new Date(new Date().getFullYear() - 1, 0, 1)}
            maximumDate={new Date(new Date().getFullYear() + 5, 11, 31)}
            accentColor={palette.accent}
            themeVariant="dark"
          />
          {Platform.OS === 'ios' ? <Pressable onPress={() => setOpen(false)} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable> : null}
        </View>
      ) : null}
      {value ? <Pressable onPress={() => onChange(null)} style={styles.clear}><Text style={styles.clearText}>Clear date</Text></Pressable> : null}
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
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Date(2026, 0, 1, hour, minute, 0, 0), [hour, minute]);
  const [draft, setDraft] = useState(selected);

  useEffect(() => {
    if (!open) setDraft(selected);
  }, [open, selected]);

  const change = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || !date) return;
    setDraft(date);
    if (Platform.OS === 'android') onChange(date.getHours(), date.getMinutes());
  };
  return (
    <View style={styles.stack}>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose workout reminder time" onPress={() => setOpen(true)} style={styles.field}>
        <Text style={styles.value}>{selected.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
        <Text style={styles.icon}>◷</Text>
      </Pressable>
      {open ? (
        <View style={styles.pickerPanel}>
          <DateTimePicker value={draft} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={change} themeVariant="dark" />
          {Platform.OS === 'ios' ? (
            <Pressable
              onPress={() => {
                onChange(draft.getHours(), draft.getMinutes());
                setOpen(false);
              }}
              style={styles.done}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  field: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 15, paddingHorizontal: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  value: { flex: 1, color: palette.text, fontSize: 15, fontWeight: '800' },
  placeholder: { flex: 1, color: palette.muted, fontSize: 15 },
  icon: { color: palette.accent, fontSize: 19, fontWeight: '900' },
  pickerPanel: { overflow: 'hidden', borderRadius: 16, padding: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  done: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.accentDark },
  doneText: { color: palette.accent, fontSize: 13, fontWeight: '900' },
  clear: { minHeight: 38, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 },
  clearText: { color: palette.muted, fontSize: 11, fontWeight: '800' },
});
