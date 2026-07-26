import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedPrehabChoice } from '@/types';

const KEY = 'sprintlab.prehab-recommendations.v1';

export async function getSavedPrehabChoices(): Promise<SavedPrehabChoice[]> {
  const value = await AsyncStorage.getItem(KEY);
  return value ? JSON.parse(value) as SavedPrehabChoice[] : [];
}

export async function recordPrehabChoice(
  cardId: string,
  date: string,
  action: SavedPrehabChoice['action'],
) {
  const current = await getSavedPrehabChoices();
  const choice: SavedPrehabChoice = {
    id: `prehab-choice:${Date.now()}`,
    cardId,
    date,
    action,
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify([choice, ...current].slice(0, 200)));
  return choice;
}

