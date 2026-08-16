// Development-only smoke test for POST /api/coach. Requires `npx expo start` (or `npm run web`)
// running locally first. Not part of the shipped app; run manually with:
//   node --experimental-strip-types ./scripts/dev-test-coach.ts
const url = process.env.SPRINTLAB_DEV_URL ?? 'http://localhost:8081/api/coach';

async function main() {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello SprintLab Coach' }),
  });
  const body = await response.json().catch(() => null);
  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error('Request to /api/coach failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
