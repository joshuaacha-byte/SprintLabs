import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, Platform } from 'react-native';

export type ThemePreference = 'dark' | 'light' | 'system';

const THEME_PREFERENCE_KEY = 'sprintlab:theme-preference';

export function applyThemePreference(preference: ThemePreference) {
  if (Platform.OS === 'web' || 'document' in globalThis) return;
  const setColorScheme = (Appearance as typeof Appearance & {
    setColorScheme?: (scheme: 'dark' | 'light' | null) => void;
  }).setColorScheme;
  if (typeof setColorScheme === 'function') {
    setColorScheme.call(Appearance, preference === 'system' ? null : preference);
  }
}

export async function getThemePreference(): Promise<ThemePreference> {
  const saved = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  return saved === 'light' || saved === 'system' || saved === 'dark' ? saved : 'dark';
}

export async function saveThemePreference(preference: ThemePreference) {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  applyThemePreference(preference);
}
