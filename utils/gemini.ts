import { GoogleGenAI } from '@google/genai';

/** Shared identity for SprintLab's single persistent File Search store (see knowledge/README.md). */
export const KNOWLEDGE_STORE_DISPLAY_NAME = 'sprintlab-knowledge';

/** Low-cost Flash-family model used for both /api/coach and the knowledge dev scripts. */
export const GEMINI_MODEL = 'gemini-flash-latest';

export function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

export async function findKnowledgeStoreName(ai: ReturnType<typeof createGeminiClient>): Promise<string | null> {
  const stores = await ai.fileSearchStores.list({ config: { pageSize: 20 } });
  for await (const store of stores) {
    if (store.displayName === KNOWLEDGE_STORE_DISPLAY_NAME && store.name) return store.name;
  }
  return null;
}
