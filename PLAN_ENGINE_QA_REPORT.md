# SprintLab Plan-Engine QA Audit

**Update, August 21, 2026: Critical #1–#3, High #1–#2 fixed.** See [Fixes applied](#fixes-applied-august-21-2026) below for the diff summary, updated regression results, and the re-run 390-combo baseline (`plan-engine-qa-results.json`, now 0 `no-match`). The findings below this point are preserved as the original audit record — read them as "what the engine looked like before this pass."

**Correction, same day: equipment removed from base strength selection.** An initial version of the strength-selection fix (below) used the athlete's onboarding gym-equipment answers to choose between STR-01/02/04/05 and force STR-03 for no-equipment profiles. That was corrected — equipment availability no longer affects base-plan generation at all. See [Equipment-independence correction](#equipment-independence-correction-august-21-2026) at the end of this document.

Generated: August 20, 2026. Baseline data: [`plan-engine-qa-results.json`](plan-engine-qa-results.json) (390 runs).

## Files created for this audit (all temporary, all yours to delete)

| File | Purpose |
|---|---|
| `scripts/audit-plan-engine.ts` | The harness. Imports and calls the real `buildDeterministicWeeklyPlan()` (`utils/plan-selector.ts`) with the real `starterWorkoutLibrary` (`data/workout-library.ts`) — no reimplementation. Enumerates every onboarding combination, writes `plan-engine-qa-results.json`. |
| `scripts/verify-plan-engine-audit-regressions.ts` | New automated regression tests (see bottom of this report). |
| `scripts/show-representative-plans.ts` | Prints 5 complete representative weeks via the real production selector (used for the equipment-independence correction's verification). |
| `plan-engine-qa-results.json` | Raw machine-readable output of all 390 runs — the baseline for comparing future changes. |
| `PLAN_ENGINE_QA_REPORT.md` | This report. |

Run either script with:
```bash
node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/audit-plan-engine.ts
node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-plan-engine-audit-regressions.ts
```

---

## 1. How the system currently works

`app/plan-preview.tsx` and `components/plan-build-loading.tsx` both call one function, `buildDeterministicWeeklyPlan(profile, workouts)` in `utils/plan-selector.ts`. There is no other plan-generation path — Gemini is not involved (confirmed by inspection; not invoked in this audit).

The pipeline for a track-and-field athlete:

1. **`selectedDays(profile)`** picks which weekdays are open, based on `trainingDaysPerWeek`/`availableTrainingDays`, minus the preferred rest day, sport-practice days, other-sport days, and any competition within 7 days.
2. **`deriveSeasonPhase(profile)`** (`utils/season-engine.ts`) turns the athlete's season calendar into one of 6 `LibrarySeasonPhase` values, or `'needs-calendar'` if incomplete.
3. **`buildWeeklyArchitecture({ event, phase, level, sessionCount })`** (`utils/weekly-architecture.ts`) returns a fixed sequence of "slots" (e.g. *Acceleration + strength*, *Extensive tempo*, *Maximum velocity + strength*...) for that phase, trimmed to `sessionCount` days. **This function's inputs are only `event`, `phase`, `level`, and `sessionCount` — it never receives the athlete's improvement priorities.**
4. For each slot, **`rankedForSlot`/`rankedForCategory`** scores every Approved library workout that hard-matches the event/pathway/level/phase, and picks the top-scoring one. The score is `category fit + event + phase + goal + duration − progressionLevel`; `goal` is the only place `speedGoals` (derived from the priorities screen) enters the algorithm, worth **10 of ~100 points**, and only as a tiebreak among workouts already in the correct category.
5. Non-track sports (football/soccer/basketball/baseball/general/other) skip steps 3–4 entirely and instead use **`buildGeneralSpeedWeek`**, whose role list (`generalSpeedRoles()`) branches only on `sessionCount`, a `football` boolean, `inSeason` boolean, `level`, and pain/return-to-training/taper regression — never on sport identity beyond "is it football or not," and never on priorities at all. Each role's workout is picked by **`firstEligibleById`**, a straight ID-list lookup with no scoring, so `speedGoals` has literally no code path to influence it.

## 2. Methodology

The harness builds `AthleteProfile` objects field-for-field the way `app/profile.tsx` actually writes them (same `primarySport`/`sport`/`speedGoals`/`raceDevelopmentAreas` assignments, same option catalogues copied from the UI's own arrays — `sports[]`, `events[]`, `ExperienceStep` options, `FrequencyStep` options, `raceAreas[]`, `SPORT_GOAL_ORDER`/`DEFAULT_GOAL_ORDER`). It starts from the same `sampleAthleteProfile` base already used by the project's own `scripts/verify-plan-pathways.ts`, blocks no extra days, and pins season phase via `seasonPhaseOverride` (the same mechanism that script uses) so phase is a controlled variable rather than calendar-math noise.

Three matrices, run against every onboarding value with **no cross-product explosion for dimensions the code structurally can't connect** (see Critical #1 — crossing priorities against every experience×day combination would only multiply identical results):

- **Core (160 runs):** sport × (track event, for track only) × experience × day-count, phase fixed to `general-preparation`, priorities fixed to "none selected."
- **Priority (188 runs):** for each sport (and each track event), every valid onboarding priority combination — all 29 track combinations (8 single areas + 21 valid pairs of the 7 non-"unsure" areas), and every sport-specific `speedGoals` combination (10–15 each) — at one representative experience/day-count.
- **Phase (42 runs):** for each sport, all 6 `LibrarySeasonPhase` values at one representative experience/day-count.

---

## 3. Critical issues

### C1 — Improvement priorities have zero observable effect on the generated plan

Confirmed empirically: **all 188 priority-matrix runs, across all 7 sports and all 4 track events, produced exactly 1 distinct `workoutIdSignature` per sport/event** — every one of the 29 track priority combinations (e.g. "The start and first 30" vs. "Speed endurance" vs. "I'm not sure yet") yields the *identical* week, down to the exact workout ID. Same for every non-track sport's `speedGoals` selections.

Root cause, from §1: `buildWeeklyArchitecture` (which decides *which categories* appear on which days — the part of the plan an athlete would actually notice) never receives `speedGoals`/`raceDevelopmentAreas` as input, for any sport. The one place `speedGoals` is read at all (`categoryScore`'s `goalScore`, track only) is a 10-point tiebreak among workouts already in the same category — and empirically it never changes the outcome, because at a given event/level/phase/category there is consistently only one Approved eligible candidate, so the tiebreak never has anything to break.

**This means the entire "Where do you lose your races?" / "What do you want to improve most?" onboarding screen is currently decorative.** An athlete who says their weakness is the start gets the same plan as one who says it's the finish.

### C2 — Non-track sports get no plan at all in pre-competition, taper, or transition

19 of 390 runs returned `no-match`. All but one are non-track sports in `pre-competition`, `taper`, or `transition`:

```
football/soccer/basketball/baseball/general/other × {pre-competition, taper, transition} → no-match
```

`generalSpeedRoles()` only branches on `inSeason` (i.e. `phase === 'competition'`) vs. everything else — there is no dedicated role set for pre-competition, taper, or transition, so it falls through to the general-preparation-style role list, whose preferred workout IDs (`GEN-ACC-*`, `GEN-MAX-*`, etc.) and fallback IDs don't have those phases in their `seasonPhases`. Every eligible session fails the hard gate and the whole week is rejected.

**Effect:** a football/soccer/basketball/baseball/general-speed athlete who is in pre-competition, tapering for a big event, or just came off a season gets **an empty "no safe complete week could not be matched" screen** — not a smaller plan, not a rest week, nothing. Track athletes are not affected the same way (see M1 below for one narrower track taper gap).

### C3 — 5 of 6 non-track sports are byte-identical to each other

At the representative config (4 days, intermediate, general-preparation), soccer, basketball, baseball, general-athletic-performance, and "other" all produced this exact same plan:

```
Mon: GEN-ACC-02 + STR-01   Tue: GEN-LOW-01   Thu: GEN-MAX-02 + STR-02   Sat: CORE-02
```

Only football differs (using `F40-*` combine-prep records instead of `GEN-*`). This holds across the entire core matrix, not just one sample point — confirmed by re-checking all sport×experience×day-count core rows. A basketball guard, a baseball pitcher, and someone who picked "general speed" with no sport context at all currently receive the identical week. `generalSpeedRoles()`'s only sport-aware branch is a single `football` boolean; there is no basketball/soccer/baseball-specific role, workout ID, or pairing anywhere in the selector.

---

## 4. High-severity issues

### H1 — Track 200m is programmed identically to 60m/100m, contradicting the codebase's own event classification

`profilePathway()` (`utils/plan-selector.ts`) classifies `200m` under `'long-sprint-200-400'` — the same pathway as `400m` — for workout-eligibility filtering. But `weekly-architecture.ts`'s `isLongSprint(event)` checks `event === '400m'` only, so the *category sequence and exact workout IDs* selected for 200m are identical to 60m/100m at every experience level, day count, and phase tested (confirmed across the full core matrix: 60m/100m/200m produce the same `workoutIdSignature`; only 400m differs). The codebase's own pathway model says 200m belongs with 400m; the architecture layer disagrees with it and 200m never gets the differentiation its own classification implies it should receive.

### H2 — Strength pairing is hardcoded to two records, regardless of experience or phase

`preferredStrengthIds` in `buildDeterministicWeeklyPlan` (track) and the equivalent in `buildGeneralSpeedWeek` are both hardcoded to alternate between `STR-01`/`STR-02` only. Confirmed by the unreachable-workout scan (§6): `STR-04` ("Posterior Chain + Lower-Leg Strength") and `STR-05` ("Unilateral Sprint Strength") — both marked eligible for `foundation` through `advanced` — are **never selected in any of the 390 runs, including advanced 5-day plans.** An advanced athlete's paired strength work is identical to a developing athlete's.

---

## 5. Medium-severity issues

### M1 — Track taper phase partially fails (100m representative)
`track-and-field:100m:taper` returned `no-match`: 2 of 5 slots (Tuesday "Recovery/mobility," Saturday "Technical rehearsal") had no Approved `TEM-03`/`TEM-04` record matching the pathway+phase combination. Only 100m was swept across all 6 phases in this pass (to keep the phase matrix a manageable size) — recommend re-running the phase matrix for 60m/200m/400m before treating this as 100m-specific.

### M2 — `'unsupported-sport'` is dead code
`WeeklyPlanSuggestion`'s status union includes `'unsupported-sport'`, but it is never returned anywhere in `plan-selector.ts` (confirmed by grep — the string appears exactly once, in the type declaration). Every sport, including the catch-all `'other'`, currently falls through to `buildGeneralSpeedWeek` instead. Either the gate was intended for `'other'`/unhandled sports and was never wired up, or the status is stale and should be removed.

### M3 — Experience-level differentiation is real but weak by any duration/volume signal an athlete would see
Every experience level *does* select a distinct set of workout IDs at the same sport/day-count (no "beginner === advanced" collisions found anywhere in the core matrix). But the estimated total weekly duration barely moves: e.g. track 100m, 4 days — beginner 344 min/week vs. advanced 356 min/week (3.5% difference). The real progression is presumably encoded in each authored record's sets/reps/intensity, which this audit's duration proxy doesn't fully capture — but it means a plan's headline stats give almost no visible signal that a beginner and advanced plan differ.

### M4 — One duration inversion: beginner exceeds advanced
`track-and-field:60m:5d`: beginner totals 387 min/week vs. advanced's 376 min/week. Cause: at 5 days, `generalSpeedRoles`'s beginner/developing branch swaps in a 5th "Elastic movement foundation" plyometric day, while advanced gets a 5th "integration" sprint day — different session types, not simply "more," but worth a sanity pass since a foundation-level week should not out-total an advanced week.

### M5 — 24 of 64 Approved workouts (37.5%) never reachable through onboarding-driven generation
See §6. 16 of those are not even reachable as a displayed swap "alternative" — fully inert content given today's onboarding inputs.

### M6 — Two onboarding-collectable values are unreachable through the actual UI
`AthleteSport` includes `'softball'`, but `app/profile.tsx`'s `sports[]` array only offers `'baseball'` labeled "Baseball / softball" — `'softball'` as a stored value can never be produced. `AthleteExperienceLevel` includes `'elite'`, never offered by `ExperienceStep`'s options. Neither breaks anything today (both map through cleanly if ever set programmatically), but any workout-library entry that specifically targets `'softball'` distinctly from `'baseball'` would be unreachable too.

---

## 6. Unreachable templates / workouts

Of 64 Approved workouts, **24 never appear in any of the 390 generated plans.** Of those, **16 don't even appear as a displayed swap alternative** (fully dead under current selection logic):

`STA-02, MAX-03, MAX-05, SED-02, SED-05, SPE-01, SPE-02, SPE-03, SPE-04, STR-04, STR-05, PLY-02, PLY-03, TST-03, MEET-02, MEET-03`

These cluster into two groups:
- **Advanced/specific-prep+ track records** (`MAX-03/05`, `SED-02/05`, all four `SPE-*`, `STA-02`) — these only qualify in `specific-preparation`/`pre-competition`/`competition`, phases the core+priority matrices didn't sweep for every event/experience combination; some may become reachable with a fuller phase×event×experience sweep and are flagged here rather than in the Critical section pending that follow-up.
- **Structurally hardcoded out** (`STR-04/05`, `PLY-02/03`, `TST-03`, `MEET-02/03`) — these are excluded by hardcoded ID lists (H2) rather than by any onboarding input, so no onboarding combination will ever surface them regardless of season/phase.

The other 8 (`ACC-05/06`, `MAX-04`, `PLY-04/05`, `TST-01/02`, `MEET-01`) are shown as swap alternatives but never the default pick.

Full detail (levels, phases, sports each targets) is in `plan-engine-qa-results.json` → `unreachedApprovedWorkouts`.

---

## 7. What worked correctly

- **No duplicate workout IDs** within any generated week, in any of the 371 `ready` results.
- **No consecutive high-intensity days** in any result — the weekly architecture's high/low alternation held everywhere tested.
- **Day count is always correct** — every `ready` result scheduled exactly the requested number of days.
- **Experience level always changes the selected workout IDs** (see M3 for the caveat on how *visible* that change is).
- **Football is genuinely differentiated** from the other non-track sports (H2/C3 only affects the other five).

---

## 8. Severity-ranked issue list

| # | Severity | Issue |
|---|---|---|
| C1 | **Critical** | Improvement priorities (both track and non-track) have no effect on the generated plan. |
| C2 | **Critical** | Non-track sports return no plan at all in pre-competition/taper/transition. |
| C3 | **Critical** | 5 of 6 non-track sports (all except football) produce byte-identical plans. |
| H1 | High | Track 200m gets 100m's architecture despite being classified with 400m's pathway. |
| H2 | High | Paired strength work is hardcoded to 2 records regardless of experience/phase. |
| M1 | Medium | Track taper phase partially fails (2 slots, 100m representative). |
| M2 | Medium | `'unsupported-sport'` status is declared but never returned — dead gate. |
| M3 | Medium | Experience-level volume differentiation is real but nearly invisible in duration terms. |
| M4 | Medium | One beginner-exceeds-advanced duration inversion (60m, 5-day). |
| M5 | Medium | 37.5% of the Approved library is unreachable through onboarding-driven generation. |
| M6 | Low | `'softball'` and `'elite'` are collectable-in-type but unreachable through the actual onboarding UI. |

---

## 9. Recommended fixes (Critical/High only)

**C1 — Improvement priorities:** Give `buildWeeklyArchitecture` (or a new layer above it) an input derived from `speedGoals`/`raceDevelopmentAreas` that can actually change which *slot* categories appear — e.g. bias toward an extra acceleration-tagged slot when `first-step-quickness`/`start-and-first-30` is selected, or an extra speed-endurance slot when that's the stated weakness — rather than only nudging the tiebreak score inside an already-fixed category. For non-track sports, `firstEligibleById` needs to accept a scored candidate list (reusing `categoryScore`) instead of a flat ID lookup, so `speedGoals` has any code path to matter at all.

**C2 — Missing phase coverage:** Add `pre-competition`/`taper`/`transition` role sets to `generalSpeedRoles()` (mirroring the track selector's `preCompetition()`/`taper()`/`transition()` functions in `weekly-architecture.ts`), backed by workout records whose `seasonPhases` actually include those phases — or, at minimum, extend the `GEN-LOW-01`/`GEN-MICRO-01`-style records' `seasonPhases` arrays and reuse them as this phase's fallback so athletes get a reduced week instead of nothing.

**C3 — Sport differentiation:** Either author sport-specific role/workout sets for basketball/soccer/baseball the way football has `F40-*`, or — if the product intent is genuinely "one generic non-football pathway for every other sport" — make that explicit (e.g. in the UI copy) rather than implying sport-aware programming that isn't there.

**H1 — 200m architecture:** Change `isLongSprint` (or `buildWeeklyArchitecture`'s event check) to use the same `profilePathway()`-derived classification the eligibility filter already uses, so 200m consistently gets long-sprint treatment everywhere or nowhere, not one and not the other.

**H2 — Strength pairing:** Make the strength-pairing ID list level/phase-aware (e.g. via `firstEligibleById` scored against `STR-01..05` with a level filter) instead of a hardcoded `STR-01`/`STR-02` alternation.

---

## Fixes applied (August 21, 2026)

Scoped MVP corrections only — no periodization system, no AI plan generation. Files changed:

- `utils/plan-selector.ts` — added `MVP_GENERATION_PHASE` (exported constant, doc-commented) as the single phase used for all workout-eligibility gating; removed the `needs-calendar` and phase-based `no-match` early returns in `buildDeterministicWeeklyPlan`/`buildGeneralSpeedWeek`/`firstEligibleById`; disabled the `inSeason`-derived role branch in `generalSpeedRoles` calls; replaced the hardcoded `STR-01`/`STR-02` alternation with `strengthPreferenceOrder()`, keyed by level + sprint-session purpose only (see the [Equipment-independence correction](#equipment-independence-correction-august-21-2026) below — the first version of this incorrectly also used equipment, and was corrected same-day).
- `utils/weekly-architecture.ts` — renamed `isLongSprint` → `isLongSprintPathwayEvent`, now `event === '200m' || event === '400m'`, matching `profilePathway()`'s classification.
- `utils/onboarding-copy.ts` — `classificationExplanation()` no longer claims goals shape the week; states event/schedule/experience do, and that priorities are saved for Coach/future use.
- `components/plan-build-loading.tsx` — "Goals calibrated" → "Priorities saved".
- `scripts/verify-plan-pathways.ts` (pre-existing repo test) — updated 4 assertions that hardcoded `STR-01`/`STR-02` as the only valid trained-athlete strength IDs (now `STR-01/02/04/05`), and rewrote the `inSeason` test to assert the new guarantee (a competition-phase override produces the identical plan to general-preparation) instead of the old disabled reduced-volume behavior.
- `scripts/verify-plan-engine-audit-regressions.ts` — rewritten; asserts all 8 items from the corrections request (see below).

**Results after the fix, re-running the full 390-combo audit:**

| | Before | After |
|---|---|---|
| `no-match` (any dimension) | 19 | **0** |
| Duplicate workout IDs | 0 | 0 |
| Consecutive high-intensity days | 0 | 0 |
| Runs where STR-04 or STR-05 is selected | 0 | **290 / 390** |
| 100m vs 200m workout-ID signature (4d, intermediate) | identical | **different** — 200m now matches 400m (`ACC-04`, `TEM-02` instead of `ACC-02`, `TEM-01`) |

Full regression suite (`scripts/verify-plan-engine-audit-regressions.ts`) passes, asserting: no `no-match` across all 6 `LibrarySeasonPhase` values and a missing calendar (track + soccer); correct day count for every onboarding day-count option; no duplicate IDs at 5-day/advanced across 6 sports; no consecutive-high pairs across all 6 phases; 200m differs from 100m and can select `ACC-04`/`TEM-02`/`MAX-05`/`SED-05`; an advanced 5-day track plan selects `STR-04` and/or `STR-05`; a no-equipment profile and a fully-equipped profile produce the byte-identical plan (see the [Equipment-independence correction](#equipment-independence-correction-august-21-2026) below — an earlier version of this fix incorrectly used equipment to select strength, since corrected); two profiles differing only in stored priorities produce the identical plan while their `raceDevelopmentAreas`/`speedGoals` remain intact on the profile object. Pre-existing repo scripts `scripts/verify-plan-pathways.ts` and `npm run verify:planner` also pass. `npx tsc --noEmit` and `npx expo lint` are clean.

**Deliberately not fixed in this pass** (out of the agreed MVP scope): Critical #3 from the original audit (5 of 6 non-track sports still share one generic pathway — only football is differentiated; the corrections request explicitly says this is intentional and disclosed for the MVP, not a bug to fix now), Medium #1 (track taper's 2-slot gap is moot now that phase is never gated), Medium #2 (`'unsupported-sport'` still dead code), Medium #6 (`'softball'`/`'elite'` still unreachable via onboarding UI — unrelated to plan generation).

## 10. Automated regression tests added

`scripts/verify-plan-engine-audit-regressions.ts` (`node --experimental-strip-types --loader ./scripts/alias-loader.mjs ./scripts/verify-plan-engine-audit-regressions.ts`), current contents (superseding the list originally written here):

1. No `no-match` due to season phase, across all 6 `LibrarySeasonPhase` values (track + soccer) and a missing calendar.
2. Correct scheduled-day count for every onboarding day-count option (track).
3. No duplicate workout IDs within a week, across 6 sports at 5 days/advanced.
4. No consecutive high-intensity days, across all 6 phases.
5. 200m differs from 100m and can select an existing long-sprint/curve-oriented record; correct day count and ordering hold for 200m specifically.
6. A representative advanced 5-day track plan selects STR-04 and/or STR-05.
7. A no-equipment profile and a fully-equipped profile produce the byte-identical plan (equipment does not customize base-plan generation).
8. Two profiles differing only in stored priorities produce the identical plan, while their `raceDevelopmentAreas`/`speedGoals` remain intact and unmutated on the profile object.

**Deliberately not asserted:** non-football-sport differentiation (Critical #3 — soccer/basketball/baseball/general still intentionally share one generic pathway per the MVP scope decision, not a bug).

## Equipment-independence correction (August 21, 2026)

A follow-up correction removed gym-equipment onboarding answers from base strength selection entirely. What changed and why:

- **Removed**: `hasLoadedStrengthEquipment()` and the equipment-based `strengthCandidates` workout-array filter that had been added to `utils/plan-selector.ts`. Base-plan generation no longer reads `profile.weightRoomAccess` or `profile.homeEquipment` anywhere.
- **`strengthPreferenceOrder()` redesigned** to depend only on (a) the athlete's `LibraryAthleteLevel` and (b) which purpose-slot of the week a pairing fills — a 0-based ordinal of paired-strength occurrences so far this week, not a raw day index. The MVP architecture (`utils/weekly-architecture.ts`'s `generalPreparation()`, and `generalSpeedRoles()` in `plan-selector.ts`) always places exactly two paired-strength sessions per week in a fixed order: first an acceleration/force-purpose session, then a maximum-velocity/explosive-purpose one — true for every sport, event, and day-count the MVP produces. So purpose-slot 0/1 reliably identifies *which sprint session's purpose* is being paired, not an arbitrary position.
  - Foundation/developing → STR-01 (force-oriented) on the force slot, STR-02 (explosive) on the explosive slot — the two records whose own authored copy describes them as the complete foundational pair for every level.
  - Trained/advanced → STR-04 (posterior-chain) on the force slot, STR-05 (unilateral) on the explosive slot — the more specialized progression appropriate once an athlete has moved past the foundational template. STR-01/STR-02 remain listed as a fallback (not needed today, since STR-04/05 are always eligible under the MVP phase, but present so a future level/phase gate can't silently leave a day unpaired).
  - STR-03 is listed last in every case: an approved, always-eligible safety net that is a legitimate pick if the preferred records are ever ineligible or already used — never a default, and never selected because of equipment.
- **Equipment metadata is untouched** in both the workout library (`data/workout-library.ts` — every record's `equipmentRequired`/`equipmentOptional` fields are unchanged) and in `AthleteProfile` (`weightRoomAccess`, `homeEquipment` are still collected and stored exactly as before). Nothing was deleted; the base plan-generation code simply no longer reads them.
- **Future scope, not built now**: the intended future experience is that SprintLab always generates its canonical recommended strength session, with a user-facing "Don't have this equipment?" prompt surfacing alternatives (e.g., STR-03, or another approved record) underneath. That alternatives UI/interaction is not implemented in this pass.

See the strength-distribution analysis and representative plans the agent reported directly in the conversation for this correction's verification output (390-run distribution table, 5 full example weeks via the real `buildDeterministicWeeklyPlan()`).
