import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGeminiClient, findKnowledgeStoreName, GEMINI_MODEL, KNOWLEDGE_STORE_DISPLAY_NAME } from '../../utils/gemini.ts';

/** Minimal .env.local reader for standalone node scripts (Expo only auto-loads it inside `expo start`). */
function loadEnvLocal() {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env.local');
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, 'utf8');
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export function getGeminiClient() {
  loadEnvLocal();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env.local first.');
  }
  return createGeminiClient(apiKey);
}

export { findKnowledgeStoreName, GEMINI_MODEL, KNOWLEDGE_STORE_DISPLAY_NAME };
