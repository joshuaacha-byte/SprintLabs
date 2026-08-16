import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Palette, useTheme } from '@/constants/sprintlab';
import { tap } from '@/utils/haptics';

const FEEDBACK_URL = 'https://sprintlab.userjot.com';

export function AppFooter() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.footer}>
      <Text style={styles.credit}>SprintLab · Joshua Acha · 2026</Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Send SprintLab feedback"
        onPress={() => { tap(); void WebBrowser.openBrowserAsync(FEEDBACK_URL, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }); }}
        style={({ pressed }) => [styles.feedback, pressed && { opacity: 0.72 }]}
      >
        <MaterialIcons name="forum" size={16} color={palette.accent} />
        <Text style={styles.feedbackText}>Send feedback</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  footer: { alignItems: 'center', gap: 9, paddingTop: 22, paddingBottom: 8, borderTopWidth: 1, borderTopColor: palette.border },
  credit: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  feedback: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15, borderRadius: 12, backgroundColor: palette.accentDark, borderWidth: 1, borderColor: '#36500E' },
  feedbackText: { color: palette.accent, fontSize: 12, fontWeight: '900' },
});
