// Uploads documents from knowledge/ into SprintLab's single persistent Gemini File Search
// store. Safe to re-run: reuses the existing store by display name (never creates a duplicate)
// and skips any document whose display name is already present in the store.
//
// Usage:
//   node --experimental-strip-types ./scripts/knowledge-upload.ts
//   node --experimental-strip-types ./scripts/knowledge-upload.ts --refresh   (re-upload everything)
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findKnowledgeStoreName, getGeminiClient, KNOWLEDGE_STORE_DISPLAY_NAME } from './lib/gemini-client.ts';

const KNOWLEDGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../knowledge');
const SKIP_FILES = new Set(['readme.md', '.gitkeep']);
const refresh = process.argv.includes('--refresh');

async function findOrCreateStore(ai: Awaited<ReturnType<typeof getGeminiClient>>) {
  const existingName = await findKnowledgeStoreName(ai);
  if (existingName) {
    console.log(`Reusing existing File Search store: ${existingName}`);
    return existingName;
  }
  const created = await ai.fileSearchStores.create({ config: { displayName: KNOWLEDGE_STORE_DISPLAY_NAME } });
  if (!created.name) throw new Error('Store creation did not return a resource name.');
  console.log(`Created new File Search store: ${created.name}`);
  return created.name;
}

async function existingDocumentNames(ai: Awaited<ReturnType<typeof getGeminiClient>>, storeName: string) {
  const names = new Set<string>();
  const documents = await ai.fileSearchStores.documents.list({ parent: storeName, config: { pageSize: 20 } });
  for await (const doc of documents) {
    if (doc.displayName) names.add(doc.displayName);
  }
  return names;
}

async function deleteDocumentsByDisplayName(ai: Awaited<ReturnType<typeof getGeminiClient>>, storeName: string, displayName: string) {
  const documents = await ai.fileSearchStores.documents.list({ parent: storeName, config: { pageSize: 20 } });
  for await (const doc of documents) {
    if (doc.displayName === displayName && doc.name) {
      await ai.fileSearchStores.documents.delete({ name: doc.name });
      console.log(`  Deleted previous document for refresh: ${displayName}`);
    }
  }
}

async function waitForUpload(ai: Awaited<ReturnType<typeof getGeminiClient>>, operation: Awaited<ReturnType<typeof ai.fileSearchStores.uploadToFileSearchStore>>) {
  let current = operation;
  while (!current.done) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    current = await ai.operations.get({ operation: current });
  }
  if (current.error) throw new Error(`Upload failed: ${JSON.stringify(current.error)}`);
  return current.response;
}

async function main() {
  const ai = getGeminiClient();
  const storeName = await findOrCreateStore(ai);

  let files: string[] = [];
  try {
    files = readdirSync(KNOWLEDGE_DIR)
      .filter(name => !name.startsWith('.') && !SKIP_FILES.has(name.toLowerCase()))
      .filter(name => statSync(path.join(KNOWLEDGE_DIR, name)).isFile());
  } catch {
    console.log('knowledge/ directory not found or unreadable — nothing to upload.');
    return;
  }

  if (!files.length) {
    console.log('knowledge/ has no documents yet. Add SprintLab training documents there, then re-run this script.');
    return;
  }

  const already = refresh ? new Set<string>() : await existingDocumentNames(ai, storeName);

  for (const file of files) {
    if (already.has(file)) {
      console.log(`Skipping ${file} (already uploaded — pass --refresh to re-upload).`);
      continue;
    }
    if (refresh) await deleteDocumentsByDisplayName(ai, storeName, file);

    console.log(`Uploading ${file}...`);
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const operation = await ai.fileSearchStores.uploadToFileSearchStore({
      fileSearchStoreName: storeName,
      file: filePath,
      config: { displayName: file },
    });
    const response = await waitForUpload(ai, operation);
    console.log(`  Done: ${response?.documentName ?? file}`);
  }

  console.log(`\nStore: ${storeName}`);
  console.log('Done. Run `npm run knowledge:test -- "<question>"` to test retrieval.');
}

main().catch(error => {
  console.error('knowledge:upload failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
