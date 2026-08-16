import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..');

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next TypeScript module shape.
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
  const base = path.resolve(projectRoot, specifier.slice(2));
  const resolved = await firstExisting([base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]);
  if (!resolved) return nextResolve(specifier, context);
  return { url: pathToFileURL(resolved).href, shortCircuit: true };
}
