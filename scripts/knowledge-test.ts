// Standalone retrieval test against SprintLab's Gemini File Search store. Not connected to
// /api/coach — this only proves Gemini can retrieve and reason from knowledge/ documents.
// Makes exactly ONE Gemini request; all grounding/citation info below is read from that same
// response, never fetched with a follow-up call.
//
// Usage:
//   node --experimental-strip-types ./scripts/knowledge-test.ts
//   node --experimental-strip-types ./scripts/knowledge-test.ts "your question here"
import { findKnowledgeStoreName, GEMINI_MODEL, getGeminiClient } from './lib/gemini-client.ts';

const DEFAULT_QUESTION = 'How does SprintLab\'s Season Engine change training for a sprinter approaching an A-priority meet, and what type of session does that phase call for?';

// Minimal shapes for the parts of the raw Interactions API response this script reads.
// Field names (snake_case) match the actual wire JSON, not the SDK's internal TS aliases.
type FileCitation = {
  type: 'file_citation';
  file_name?: string;
  document_uri?: string;
  page_number?: number;
  source?: string;
};
type TextContent = { type: 'text'; text: string; annotations?: Array<FileCitation | { type: string }> };
type Step = { type: string; content?: TextContent[] };

function extractCitations(steps: Step[]) {
  const seen = new Map<string, FileCitation>();
  for (const step of steps) {
    if (step.type !== 'model_output' || !step.content) continue;
    for (const part of step.content) {
      if (part.type !== 'text' || !part.annotations) continue;
      for (const annotation of part.annotations) {
        if (annotation.type !== 'file_citation') continue;
        const citation = annotation as FileCitation;
        const key = `${citation.file_name ?? citation.document_uri ?? 'unknown'}:${citation.page_number ?? ''}`;
        if (!seen.has(key)) seen.set(key, citation);
      }
    }
  }
  return [...seen.values()];
}

async function main() {
  const ai = getGeminiClient();
  const storeName = await findKnowledgeStoreName(ai);
  if (!storeName) {
    console.error('No SprintLab knowledge store found. Run `npm run knowledge:upload` first.');
    process.exitCode = 1;
    return;
  }

  const question = process.argv[2] ?? DEFAULT_QUESTION;

  let interaction: Awaited<ReturnType<typeof ai.interactions.create>>;
  try {
    interaction = await ai.interactions.create({
      model: GEMINI_MODEL,
      input: question,
      tools: [{ type: 'file_search', file_search_store_names: [storeName] }],
    });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      console.error('Gemini rate-limited this request (429). Stopping — not retrying automatically.');
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const steps = (interaction.steps ?? []) as unknown as Step[];
  const fileSearchUsed = steps.some(step => step.type === 'file_search_call');
  const citations = extractCitations(steps);

  console.log('SPRINTLAB KNOWLEDGE TEST\n');
  console.log('Question:');
  console.log(question + '\n');
  console.log('Answer:');
  console.log((interaction.output_text ?? '(no text returned)') + '\n');
  console.log('Grounding:');
  console.log(`File Search used: ${fileSearchUsed ? 'YES' : 'NO'}`);

  if (fileSearchUsed) {
    console.log('\nSources retrieved:');
    if (citations.length) {
      for (const citation of citations) {
        console.log(`- ${citation.file_name ?? citation.document_uri ?? 'Unknown document'}`);
        if (citation.page_number !== undefined) console.log(`  Page: ${citation.page_number}`);
      }
    } else {
      console.log('- (File Search ran, but this response exposed no document/page citation metadata.)');
    }
  }
}

main().catch(error => {
  console.error('knowledge:test failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
