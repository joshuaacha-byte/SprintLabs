# SprintLab Project Context and Handoff

Last updated: August 21, 2026 (deterministic plan-engine MVP corrections; equipment removed from strength selection)

Read this document before making product or code changes. It preserves the decisions, goals, completed work, known issues, and next steps from the original planning and prototype sessions.

## One-sentence product definition

SprintLab is a speed-development platform for athletes. It combines personalized workout planning, workout execution, training logs, progress tracking, and eventually adaptive coaching to help athletes accelerate faster, reach higher speeds, and transfer speed to their sport.

The simpler comparison is: speed training built for athletes, with track sprinting as the first complete pathway.

## What we are actually building

The long-term product is a sprint-training operating system. It should help an athlete:

1. See the correct workout for today.
2. Complete it with useful guidance.
3. Record what actually happened.
4. Understand performance and recovery patterns.
5. Eventually receive sensible, controlled adjustments to the next plan.

The first version is deliberately smaller: a training log and workout companion that is better than Notes, spreadsheets, screenshots, coach texts, and memory.

## Target user

Start with high-school and college sprinters who:

- Run the 100m, 200m, or 400m.
- Train three to six days per week.
- May have a coach but lack organized tracking.
- Want structured offseason or independent training.
- Need sprinting, lifting, recovery, and meets in one place.

The data model now supports football, soccer, basketball, baseball, softball, lacrosse, rugby, volleyball, and general athletic performance. Do not treat that as permission to generate sport-specific programs yet: track is still the only complete, reviewed workout pathway. Do not broaden the early product to distance runners, a full team-sport tactics product, nutrition coaching, or physical-therapy rehabilitation.

## Core product loop

### Plan

Show session type, purpose, warm-up, sprint work, strength work, cooldown, target intensity, rest periods, and estimated duration.

### Train

Let athletes check off work, record sprint times and lifting numbers, use rest timers, skip or modify exercises, and view brief coaching cues.

### Log

Record completion, RPE, sleep, energy, soreness, pain, sprint times, lifting results, optional body weight, optional weather/wind, and notes.

### Learn

Turn logs into completion, volume, sleep, soreness, sprint-time, and PR trends plus weekly summaries.

### Adapt

Eventually recommend sensible changes after missed sessions, schedule changes, limited equipment, poor recovery, elevated soreness, or strong progress. This must be decision support, not medical diagnosis or fake injury-risk precision.

## Important product decisions

- The app is sprint-specific, not a generic running app.
- Sprint sessions and lifting should be planned together.
- Training plans should be rule-based before AI is introduced.
- AI should explain, summarize, substitute, and propose bounded changes; it should not freely invent training.
- Logging should take less than two minutes after a session.
- Today is a pre-workout dashboard, not a screen that pretends readiness has already been entered.
- The main flow is Plan → Readiness → Workout Mode → Post-workout Log → Progress.
- The Plan is the athlete's personal recurring training week. Every weekday stores its own workout or rest-day state, and Today reads the current weekday automatically.
- Planned workouts and actual workout records are different data models. The plan is an editable blueprint; starting creates a frozen snapshot; History stores the completed footprint separately.
- Workout Mode never mutates the planned calendar workout. It edits only the active session's actual results.
- Readiness is a required decision before starting: the athlete must complete it or explicitly confirm a skip.
- The readiness signal is deterministic decision support, not an injury diagnosis or medical clearance. Low recovery inputs produce explained yellow flags; severe/acute pain or expected hesitation at maximum speed produces a red stop-and-reassess signal.
- A future streak should reward completing scheduled training, not pressure an athlete to train every day or avoid needed rest.
- The first success metric is repeated personal use, not downloads.
- Do not add accounts, payments, subscriptions, community, video biomechanics, Apple Watch, or injury prediction during the clickable prototype.
- Own the real codebase. Avoid locking the product into a no-code platform.

## Technical stack

- Expo SDK 54
- React Native
- TypeScript
- Expo Router
- AsyncStorage for prototype persistence
- Expo Notifications for local workout reminders
- Expo WebBrowser for the in-app feedback board
- React Native Web for browser testing
- Future iOS and Android support from one codebase

Later additions, only when justified:

- Supabase for authentication, Postgres data, and storage
- EAS Build for installable builds
- TestFlight for private iPhone beta distribution
- Product analytics
- RevenueCat for subscriptions
- A protected server-side AI API
- Computer-vision tooling much later

## Current implementation

The Stage 1 clickable prototype exists in `/Users/joshuaacha/Desktop/sprintlab`.

### Domain model foundation

- A separate strongly typed domain layer now defines AthleteProfile, Exercise, WorkoutSection, Workout, ScheduledWorkout, ExerciseResult, ReadinessCheck, TrainingLog, and WeeklyPlan
- Sprint events, age/competition categories, athlete levels, season phases, workout/section categories, workout status, approval status, surfaces, equipment, pain areas, starting methods, footwear, weather, wind, goals, access levels, and rating scales use explicit unions
- The domain TrainingLog stores the planned workout snapshot alongside actual exercise results so later analysis does not depend on an editable plan
- Sprint rep records contain status, time, distance, intensity target, planned rest, surface, starting method, footwear, and wind
- Pain reports contain an exact area, optional numeric severity, classification, side, and description
- Complete sample objects demonstrate every domain model and compile against the exported contracts
- The older compact log used by current History and Progress is now explicitly named TrainingLogSummary to distinguish it from the full domain TrainingLog
- No existing screens were redesigned or connected to AthleteProfile/WeeklyPlan during this foundation pass

### Workout Library and season engine (updated July 26)

- A separate typed Workout Library contract now distinguishes its sprint taxonomy from the prototype's older weekly-plan model: approval states, event pathways/tags, athlete levels, phases, surfaces, intensity/recovery prescriptions, six structured sections, calculated volume metrics, safety/source notes, progression family, and lifecycle timestamps
- The local `sprintlab.workouts.v1` repository persists schema/seed versions. Seed version 4 upgrades older approved starter records to the reviewed V2 content while preserving user-created drafts and edits
- The author-supplied V2 inventory is represented with its exact catalog metadata split: 47 approved, 4 draft, and 2 archived records (53 total)
- The Library tab supports search plus category, approval status, athlete-level, phase, pathway, event, surface, equipment, duration, and sort controls; default status is Approved
- The primary Library view now exposes three plain-language collections with counts: **Ready to use**, **In review**, and **Archived**. Draft and archived records remain visible and recoverable but cannot be started or selected by the automatic planner.
- An approved workout can be started immediately through the readiness gate or assigned to a chosen weekday, with replacement confirmation if that day already contains a workout.
- Library also links directly to the weekly-plan preview and to a one-off unplanned-workout builder. A one-off session is saved to History without silently changing the recurring plan.
- Library detail shows compatibility, metrics, all section containers, guidance, safety, sources, lifecycle status, duplicate-as-draft, archive, and restore-to-draft controls
- Approved records cannot be silently changed; copying creates a Draft and archiving retains the record while immediately removing it from future recommendation eligibility
- Approval validation re-computes sprint and high-intensity volume from section items, rejects missing required information, blocks assisted/downhill and advanced drop-jump approval, and checks special-endurance restrictions
- Approved records contain authored warm-up, sprint work, plyometrics, strength, core/bodyweight, cooldown, intensity, recovery, cues, modifications, safety, and source guidance. The V2 additions include two strength records, five plyometric records, and two core/bodyweight records. The four Draft and two Archived records intentionally preserve their document status/TBD or archived state.
- The deterministic selector now uses approved library records only. It derives a transparent season phase from competition dates, respects track event/pathway/experience/surface/equipment gates, blocks practice/game/rest days, applies meet-window restrictions, and avoids stacking high-CNS work. If season information is missing it asks for calendar context instead of silently guessing.
- The local competition calendar stores named priority meets with date, A/B/C priority, and an estimated-date marker. An explicit season override remains available for review rather than silently replacing the calendar.

### Speed-platform architecture pass (July 24)

- The product now uses **athlete** and **speed session** as universal language; track-specific language remains only where a workout or profile is actually track-specific
- `AthleteProfile` gained backward-compatible sport, speed goals, competition level, training context, schedule-constraint, access, and optional Track/Football/Soccer/Basketball/Baseball-Softball/General-Speed profiles
- Old local AthleteProfile records migrate to `track-and-field`, retain their events and personal bests, and receive a TrackProfile; no stored records are intentionally deleted or renamed
- `SpeedPathway`, universal performance-test/timing metadata, expanded workout-category values, sport-aware workout metadata, and `ClassificationResult` are available for the later deterministic selector
- Workout Library filtering now includes sport, speed goal, speed pathway, and training context. Existing authored library records are safely tagged as track records when read; no unreviewed non-track prescriptions were added
- The new local Athlete Profile route lets an athlete select sport, up to three speed goals, background, a sport-appropriate top test, and training context. It is an initial setup surface, not a plan generator
- The Athlete Profile route now contains Split’s focused 18-step conversational onboarding: welcome; name; multiple sports; a separate required primary focus; race-development areas for track or speed goals for other athletes; track or 40-yard baseline; optional target performance; experience; realistic plan frequency plus preferred rest day; existing demands and schedule days; limitations; season/competition calendar; app mode; reminder time; reviewed sources; a staged plan-build explanation; profile reveal; and a press-and-hold commitment. It auto-saves an incomplete draft locally and resumes after the app closes. Saving the completed profile clears only the draft, never a plan, workout, log, or History record.
- Onboarding now collects only information that changes the experience: track athletes choose a primary event; every athlete chooses experience, plan frequency, current schedule demands, limitations or nothing currently, season status, and app mode. Practice and competition demands require weekdays so the selector can protect them. Training environment, equipment, typical duration, positions, and unused sport metrics were removed from onboarding and may remain editable in Settings where relevant.
- Split is a local original stopwatch-guide asset with deterministic dialogue (not a live AI). The dialogue responds to sport, access, experience, coach-plan use, and team-practice load. The onboarding deliberately uses Welcome, Listening, Focused, Calm, and Celebration pose variants at relevant steps.
- Existing local profiles migrate without deletion. They receive safe defaults for onboarding, training demands, limitations, turf access, targets, race-development areas, and season calendar. A local profile with incomplete onboarding is hard-routed into the profile flow; back gestures cannot bypass it. Completed profiles continue directly to the existing tabs.
- The onboarding uses Expo-compatible React Native animations only. No accounts, APIs, payments, subscriptions, or workout generation were added.
- See `docs/SPEED_PLATFORM_LANGUAGE_AUDIT.md` for the full language/data compatibility audit

### Prehab, readiness, reminders, and product polish (July 26)

- The prehab recommendation engine contains ten reviewed local recommendation cards and a deterministic safety gate. Sharp/worsening pain, swelling, limping, severe symptoms, medical restrictions, or an acute grab produce stop/refer guidance and no exercises. Uncertain or mild one-sided symptoms produce recovery education only. Clear or ordinary symmetrical soreness may produce no more than three optional low-cost recommendations.
- Prehab is explicitly decision support, not diagnosis, clearance, rehabilitation, or injury prevention. Today supports viewing, saving, dismissing, and reporting symptoms. Adding a recommendation directly into an active workout remains intentionally deferred until it can also update session content and duration safely.
- Local workout reminders can be enabled during onboarding or Settings, use presets or a custom time, and preview the scheduled session name, exercise count, and estimated duration. Team practices, competition days, and preferred rest days affect plan-day eligibility.
- The root app now has a short SprintLab startup screen. The Expo native splash uses the SDK 54 config plugin and fade behavior; Expo Go does not exactly reproduce a release splash.
- Settings now supports profile editing, competition-calendar management, custom reminder times, feedback, and a development-only confirmed full local-data reset.
- Daily challenges were removed from the MVP on July 26 after device testing. The concept is intentionally paused until the core plan, training, and logging loop proves useful.
- Progress now includes the athlete's target, known baseline, current derived training phase, and early milestones without fake projections or performance guarantees.
- Today, Plan, Library, History, Progress, and Settings include `SprintLab prototype · Joshua Acha · 2026` plus a feedback link to `https://sprintlab.userjot.com`.
- The interface uses layered green depth effects with native views so it remains compatible with Expo Go; no new gradient dependency was required.

### Reminder and onboarding-plan connection correction (July 26)

- The onboarding custom-reminder option now has its own stored selection state. Choosing **Custom time** opens the native phone time selector even when the currently selected time happens to match a preset such as 4:00 PM.
- Workout-reminder permission checks now use Expo's explicit granted state as well as the status fallback before scheduling local notifications.
- The onboarding shell now uses the app's safe-area provider and a lower content inset, keeping the back button and progress bar below the iPhone status widgets.
- After a new athlete selects **Build my training plan** or **A mix of all three**, completing onboarding sends them to the reviewed plan preview. The weekly suggestion reads their profile's training frequency or explicit available days, preferred rest day, practice/competition days, access, equipment, and season context before the athlete chooses to save it.
- When an athlete selects a session frequency rather than individual days, the selector now fills an unblocked alternative day if a default day conflicts with the preferred rest day, practice, or competition. Explicitly selected available days remain respected rather than replaced.

### Today tab

- Pre-workout dashboard with a clear three-step order: check in, review, train
- Daily readiness is empty until the athlete completes it
- Readiness summary can be edited after saving
- Starting is gated until readiness is completed or deliberately skipped
- Personalized planned-session card with purpose, duration, exercise count, and section counts
- Automatically displays the current weekday's saved session rather than always falling back to Monday
- Displays a recovery-focused rest-day card when the current weekday is marked as rest
- Direct actions to edit the session or start Workout Mode
- Each weekday's edited workout is saved locally
- An unfinished active session appears as Resume rather than silently creating a second session

### Readiness check-in

- Sleep duration, sleep quality, explosive/neural readiness, mental focus, fuel/hydration, and general soreness
- A whole-body localized tightness/pulling/pain question rather than a hamstring-only check
- Conditional follow-up for sensation type, sprinter-relevant body location, expected hesitation at 100% speed, and optional notes
- Selecting Other as the body location requires a typed specific area, which is preserved with the readiness record and surfaced in review and History
- A live green/yellow/red result with the exact answers that triggered it and short safety-conscious guidance
- Sleep below the prototype's eight-hour recovery target, low sleep quality, low explosive readiness, low focus, insufficient fuel/hydration, elevated soreness, or a non-acute localized issue creates a yellow flag
- Severe/acute pain or expected hesitation at maximum speed overrides other answers with a red signal
- Stored by date so a new day starts empty
- Explicitly presented as pattern tracking rather than injury diagnosis
- Skipping requires a second in-screen confirmation and is stored as an explicit readiness decision

### Workout editor

- Editable workout title, purpose, and estimated duration
- Estimated duration is stored as a numeric minute value
- Sprint-specific Warm-up, Track, Plyometrics, Strength, Conditioning, and Cooldown sections
- Exercises can be removed from each section
- Each section has its own Add action
- Local suggested exercises are available without pretending to be AI prescriptions
- Athletes can also create a custom exercise with their own details
- Edited workouts persist to their selected weekday and feed Today and Workout Mode on the correct day
- Track and Strength plans include structured targets so the active session can create the correct number of reps or sets

### Workout Mode

- Separate focused execution screen inspired by the useful interaction pattern in Arrow, without copying its branding or layouts
- Starting deep-copies the current planned workout into a frozen active-session snapshot
- New sessions capture the local scheduled date and weekday so Progress can compare completed sessions with the weekly plan; older records fall back to their start date
- Large elapsed workout stopwatch counts upward from 00:00
- Optional rest countdown starts at 00:00 and is visually labeled separately
- Track conditions are set once per session with Indoor, No wind gauge, Still, Headwind, Tailwind, or Measured options
- A measured session condition stores a signed wind reading in m/s; any individual rep can optionally override the session conditions
- Track exercises record each planned rep with actual time, completed/skipped status, and an optional quick feel of Smooth, Flat, Tight, or Stopped
- Strength exercises record each planned set with actual load, reps, completed/skipped status, and exercise notes
- Any exercise can store a structured change reason such as tightness/pain, fatigue, coach adjustment, weather, equipment/space, time/schedule, or a typed Other reason
- Athletes can add extra Track reps and Strength sets while training
- Athletes can add suggested or custom exercises to any section while training
- In-session additions are stored only with that session and do not modify the weekly schedule
- Warm-up, Plyometrics, Conditioning, and Cooldown remain completion-based
- Live completed/partial exercise coverage
- Persistent rest timer with start/pause, reset, and 30-second adjustments
- Leaving Workout Mode preserves the active session for Resume
- Review Workout opens the final planned-versus-actual screen

### Plan tab

- Clearly labeled personal training week
- Seven real saved weekday entries covering acceleration, recovery, maximum velocity, tempo, speed endurance, strength, and rest
- Today follows the correct weekday entry automatically
- Any weekday workout can be edited, and a rest day can be turned into a workout
- Any workout can be marked as a rest day
- Move swaps two scheduled weekdays without losing either session
- Existing prototype edits saved under the old Today key migrate into Monday so they are not discarded

### Final review / post-workout log

- Displays scheduled targets beside summarized completed rep, set, checklist, skip, and note data
- Displays session conditions, per-rep condition override counts, rep-feel summaries, structured change reasons, and any specific readiness area
- Identifies exercises that were added during the workout
- Clearly warns when the workout is partial
- Lets the athlete go back and update results before saving
- Workout-completed toggle
- RPE scale
- Energy scale
- Sleep-duration picker from 0–14 hours in 15-minute increments, with confirmation for unusually low or high values
- Hamstring and general soreness scales
- Best sprint time
- Notes
- Logs saved locally through AsyncStorage
- The completed session, including the frozen plan snapshot and actual results, is saved separately from the editable plan
- Every newly saved completed session also embeds a full domain TrainingLog containing its planned workout, structured actual results, readiness/recovery values, modification reasons, and session context
- Session context currently defaults uncaptured surface, starting method, footwear, and weather values to `unknown`; numeric pain severity remains `null` unless explicitly available, while the existing minor/niggle/severe classification is preserved
- A smaller summary log is also saved for Progress calculations and older-session compatibility
- The active session is cleared only after final review is saved

### Current onboarding and execution polish (July 24)

- Split is larger in the onboarding so the guide remains readable on desktop and mobile layouts.
- Athletes can select multiple sports with checkboxes, then set one primary sport for the current speed profile; the legacy `sport` field remains the primary value so earlier local data remains compatible.
- Speed-goal selection displays a live `0/3` counter and enforces the three-goal limit with unique goal values.
- Split no longer comments on track access during onboarding. Training location and equipment were removed from the required flow to keep setup short; existing optional profile fields remain backward compatible.
- Onboarding asks only for track event times or an optional football 40-yard time. Position, vertical-jump, shuttle, agility, and unrelated general-sport test questions were removed because the current planner does not use them.
- The Today avatar uses the saved first initial rather than a hard-coded placeholder.
- The readiness and final-review scales explain both ends of their ranges. Sleep uses a capped duration picker and confirms unusual values.
- The final review no longer asks for body weight every session. Existing historical records remain readable.
- Track rep timing says it is optional; marking a rep Done is enough. Adding work names the relevant section and offers section-specific suggestions or a custom entry.
- Seed speed workouts now expose meaningful target intensity ranges in their session details and structured tracking values.
- Profile & Settings contains a development-only, confirmation-gated **Erase all local app data** action for testing. It disables scheduled workout reminders, clears all local AsyncStorage, and returns to mandatory onboarding so stale profiles, plans, sessions, history, library edits, or drafts cannot reappear.
- Archive and restore explain their lifecycle behavior; archiving removes an item from normal selection, while restoring returns it as a Draft requiring review.

### Deterministic track plan selector and Settings pass (July 25)

- The Today avatar now opens a real **Profile & Settings** screen rather than restarting onboarding. It summarizes the saved athlete profile, links to profile editing, Library, and plan preview, and keeps the confirmation-gated full local-data reset in a clearly labeled development section.
- The onboarding **Current training demands** multi-select now toggles correctly: tapping a selected item removes it, while `None` remains mutually exclusive with the other demands.
- A deterministic selector now combines the athlete's primary sport, event or 40-yard pathway, goals, experience, available days, team-practice/competition load, preferred rest day, and season phase with the local Workout Library.
- The selector only considers existing recommendation-eligible **Approved** records. Draft and Archived records are never used, and the selector returns a transparent no-match state instead of fabricating a workout.
- Coach-created-plan and logging-only modes remain protected: the selector explains that the current plan stays in control and does not overwrite it.
- Multi-sport profiles remain supported. Track & field uses the full event-specific system; football uses the reviewed 40-yard pathway; other supported sports use the reviewed general linear-speed foundation.
- The selector applies event/pathway, athlete-level, season-phase, surface, and required-equipment hard gates; ranks matches deterministically; avoids back-to-back high-speed targets on consecutive selected days; and provides up to two eligible alternatives.
- Every proposed day explains why it fits, why harder work may be excluded, required setup, a stop rule, and the readable names of the supporting source groups.
- The athlete reviews the full suggested week before saving. Saving requires confirmation and replaces only the editable recurring week; History and completed sessions remain unchanged.
- Selected Library records are converted into normal SprintLab planned workouts with authored Warm-up, Track, Plyometrics, Strength, and Cooldown content. Track work keeps rep-level recording and Strength keeps set-level recording in Workout Mode.
- The supplied July 2026 Workout Library documents were re-audited against the source. All 44 local records already contain the documented sprint, plyometric, strength/bodyweight, cooldown, intensity, recovery, cue, modification, safety, and source content, so no duplicate seed content was introduced.
- Readable source-name mappings now appear in Library detail, Settings, and plan preview instead of presenting only internal source IDs.
- Split now appears purposefully in Settings, plan preview/no-match guidance, and the completed-workout review. The completion appearance uses a small Expo-compatible fade/scale celebration without adding a heavy animation dependency.
- The principal onboarding, Today, Plan, Readiness, Workout, Log, Progress, Settings, and plan-preview content containers now use centered maximum widths so phone layouts remain fluid while tablet and desktop content does not stretch excessively.

### History tab

- Uses a dedicated locally stored full `TrainingLog` collection; existing completed sessions migrate into it automatically without losing prior records
- Lists newest sessions first with date, workout name/category, completion status, RPE, best timed sprint, and a soreness indicator
- Search covers workout names, session notes, and readiness notes
- Filters cover date range, workout category, completion status, and event pathway
- A detail screen presents full readiness/recovery data, planned versus actual work, rep-by-rep sprint results, strength summaries, modification reasons, conditions, and notes
- Saved-log edits preserve the planned workout snapshot while allowing corrections to actual session summary and recorded rep/set data
- A completed workout can be duplicated to a specific future date; the date-specific copy takes priority over the recurring weekday plan when that date arrives
- Deletion requires confirmation and removes the record from History, completed-session storage, compact Progress summaries, and the full TrainingLog collection
- Includes both manual-entry and no-history/filtered-empty paths back to Today or Log

### Progress tab

- Real Monday–Sunday scheduled completion showing completed sessions over workout days due
- Seven-day states for completed, partial, missed, current, upcoming, and rest days
- Rest and future days never reduce completion
- A scheduled-session consistency streak that skips rest days and does not fail an unfinished current day
- Sprint-time series grouped by distance and exercise, so different drills at the same distance are not treated as equivalent
- Each sprint series uses the fastest completed timed rep from each session and shows date, rep feel, and effective conditions
- Per-rep conditions override session conditions; legacy numeric wind values remain supported
- Fourteen-day sleep, session-RPE, and general-soreness trends with missing sleep excluded from averages
- Five recent sessions with manual-entry status, exercise coverage, RPE, sleep, sprint result, and conditions
- Progress uses completed session records for planned adherence and sprint results, while manual logs remain eligible for recovery and recent-session summaries
- All charts use native React Native views; no chart dependency was added

### Streak system and post-workout celebration (added August 10)

- Two distinct, fully derived streaks (never persisted/cached — recomputed from schedule + completed-session history on every call, so edits/deletes recalculate with no drift):
  - **Plan Streak** (`utils/streaks.ts` → `calculatePlanStreak`) — consecutive *scheduled workout days* completed in a row. Rest/absent-from-schedule days are neutral (skip, don't break). A scheduled day only counts complete when a session's own `scheduledDate` explicitly equals that date and `review.completed` is true — never inferred from same-day coincidence, workout name, or day-of-week. A missed scheduled day breaks the streak once it has passed; today never breaks it while still incomplete.
  - **Consistency Streak** (`calculateConsistencyStreak`) — consecutive prior *weeks* (Monday–Sunday, current open week excluded) where completed/eligible ≥ 80% exactly (no rounding). Eligible = scheduled workout days that have already occurred that week. A week with zero eligible days is neutral.
  - `calculateCurrentWeekCompletion` returns the live, still-open week's completed/due/percentage/day-by-day breakdown for display.
  - `getWorkoutCompletionCelebrationState` diffs streaks immediately before vs. after a just-saved session and returns a `CelebrationKind` (`started` | `incremented` | `maintained` | `one-off`) plus milestone flags (Plan: 1/3/5/10/25/50/100; Consistency: 1/3/5/10/25/52 weeks).
  - Note: this intentionally reimplements day/week iteration locally rather than reusing `buildScheduledSessionStreak`/`buildWeeklyProgress` in `utils/progress.ts`, because those older functions match completions by date-coincidence (`session.scheduledDate ?? startedAt`) rather than requiring explicit linkage — correct for the general weekly-progress display and History's older streak number, but not strict enough for Plan/Consistency Streak's "no automatic one-off counting" rule. Both implementations remain in the codebase; `utils/progress.ts`'s functions are still used by History's own (unrelated, untouched) streak display and the weekly grid.
- Post-workout celebration (`components/workout-completion-celebration.tsx`, wired in `app/log.tsx`'s `save()`): only renders after the completed session is saved, the associated scheduled session is updated, and streaks are recalculated — a failed save shows the existing retry alert and never shows the celebration or changes any streak. Full-screen overlay with a 4-stage animation (completion → streak number → weekly row → Continue action), Reduce Motion crossfade fallback, haptics via the existing `utils/haptics.ts` service, and copy that explicitly avoids inventing a reward for sessions that don't move the streak (the "maintained" / one-off cases say so honestly).
- `app/(tabs)/progress.tsx`'s overview card shows both streaks by name (`Plan Streak` / `Consistency Streak`) — previously a single metric was mislabeled "Consistency streak" while actually computing the Plan Streak number.
- Tests: `scripts/verify-streaks.ts` (`npm run verify:streaks`) — 25 assertions covering the spec's edge cases (first-ever completion, rest/open-day gaps, missed/rescheduled/deleted scheduled days, duplicate saves, unlinked vs. linked one-offs, partial saves, week-boundary and exactly-80%-vs-79% cases, current open week, timezone-safe local date keys, legacy sessions with no `scheduledDate`).

## Key files

- `app/(tabs)/index.tsx` — pre-workout Today dashboard
- `app/(tabs)/plan.tsx` — editable recurring weekly schedule
- `utils/streaks.ts` — Plan Streak / Consistency Streak / post-workout celebration-state computation
- `components/workout-completion-celebration.tsx` — post-save celebration overlay
- `app/plan-preview.tsx` — deterministic Approved-workout weekly-plan review
- `app/settings.tsx` — athlete preferences, profile actions, Library explanation, and development reset
- `app/(tabs)/library.tsx` — searchable, filterable curated workout catalog
- `app/library-detail.tsx` — library workout detail and lifecycle controls
- `app/(tabs)/history.tsx` — saved-session history
- `app/history-detail.tsx` — full TrainingLog detail, edit, duplicate, and delete actions
- `app/(tabs)/progress.tsx` — calculated progress view
- `app/(tabs)/_layout.tsx` — bottom-tab navigation
- `app/readiness.tsx` — daily readiness check-in
- `app/workout-builder.tsx` — section-based workout editor and local exercise suggestions
- `app/workout.tsx` — active workout execution and rest timer
- `app/log.tsx` — post-workout log form
- `components/sprint-ui.tsx` — shared visual components
- `constants/sprintlab.ts` — app color palette
- `data/workouts.ts` — sample workout and weekly plan data
- `data/workout-library.ts` — authored starter-catalog metadata and seed records
- `data/workout-sources.ts` — readable source labels for approved-library explanations
- `data/domain-samples.ts` — compiling examples for every full domain model
- `types/index.ts` — workout and log models
- `types/domain.ts` — stable athlete, exercise, workout, schedule, readiness, result, log, and weekly-plan contracts
- `types/workout-library.ts` — typed curated-library contract
- `utils/storage.ts` — AsyncStorage persistence
- `utils/workout-library.ts` — versioned local library repository, validation, lifecycle actions, filters, and sorting
- `utils/plan-selector.ts` — sport/pathway hard gates, deterministic ranking, general-speed and 40-yard foundations, alternatives, explanations, and Library-to-Plan conversion
- `utils/training-history.ts` — History filtering, labels, soreness/key-sprint summaries, and duplicate-plan conversion
- `utils/domain-adapters.ts` — converts prototype plans and completed sessions into full structured domain records
- `utils/progress.ts` — date-safe weekly adherence, streak, sprint-series, recovery-trend, and recent-session aggregation
- `utils/workout-session.ts` — plan normalization, snapshot creation, actual-result initialization, status derivation, and coverage helpers
- `utils/athlete-profile.ts` — local athlete-profile persistence, old-track-profile migration, sport defaults, and speed-pathway mapping
- `utils/sport-copy.ts` — reusable sport-aware product, competition, pathway, and performance labels
- `app/profile.tsx` — local multi-sport athlete-profile setup
- `components/split-moment.tsx` — compact reusable Split guidance/celebration moment
- `docs/SPEED_PLATFORM_LANGUAGE_AUDIT.md` — universal-versus-track language audit and migration notes
- `components/sprintlab-intro-context.tsx` / `components/sprintlab-intro-overlay.tsx` — first-time product tour state and spotlight rendering
- `utils/sprintlab-intro-steps.ts` — tour step copy/order/spotlight-target config
- `utils/sprintlab-intro.ts` — tour "seen" flag and one-shot launch-request handoff

Some untouched Expo starter files still exist. They are not part of the active SprintLab UI and can be removed carefully during later cleanup.

## Verification completed

- All four visible tabs were opened successfully in the browser by the owner.
- TypeScript completed without errors after the storage dependency was installed.
- A clean Expo web export completed successfully.
- The connected Today → Log → Progress flow passed TypeScript and a clean Expo web export after implementation.
- `@react-native-async-storage/async-storage` version 2.2.0 is installed and recorded in `package.json` and `package-lock.json`.
- The reorganized Today → Workout Editor → Workout Mode → Post-workout Log flow passed TypeScript and a clean Expo web export.
- The clean export produced all new routes, including Readiness, Workout Builder, Workout Mode, Log, History, Plan, and Progress.
- A browser walkthrough confirmed Today loads, the workout editor exposes section-specific suggestions and custom inputs, an exercise can be checked in Workout Mode, and Finish Workout opens the correct post-session summary.
- The planned-versus-actual architecture passes TypeScript. The first clean web export confirmed every route still statically renders after the model change.
- The final source passes `npx tsc --noEmit`, and the final Expo web export produced all 15 static routes without errors.
- A clean-state browser walkthrough confirmed the required readiness gate, the inline two-step Skip decision, the numeric `80 min` estimate, the count-up workout stopwatch, the separate `00:00` rest countdown, the frozen plan snapshot, rep-level Track entry, set-level Strength entry, completion-only supporting sections, the final planned-versus-actual review, a separate History record, and an unchanged editable Plan.
- The walkthrough specifically preserved and reviewed a `3.12s` sprint result and a strength load of `185`, confirming actual-result inputs save while they are typed.
- The expanded readiness flow passes TypeScript and a clean Expo web export of all 15 routes. A clean-state browser walkthrough confirmed a `6.5h` sleep answer produces an explained yellow signal, and severe/acute hamstring pain plus expected hesitation at maximum speed produces an explained red signal. Both saved summaries appeared correctly on Today.
- The July 23 weekly-plan and flexible-workout pass completed `npx tsc --noEmit` with exit code 0.
- The same pass completed `npx expo lint` with exit code 0 and no warnings after removing the unused readiness state and correcting the stopwatch effect dependency.
- A fresh web interaction walkthrough could not be completed for this pass because Metro accepted the localhost server but did not answer the first web request on the 2017 iMac. This is recorded as a verification limitation, not as a passed browser check.
- The July 24 logging-data pass completed `npx tsc --noEmit` and `npx expo lint` with no errors or warnings.
- The same logging-data pass completed a clean Expo web export of all routes. An iPhone interaction check is still required for the new condition pickers, rep-feel chips, change reasons, and History summaries.
- The July 24 Progress pass completed focused calculation checks for due workout days, partial sessions, rest-safe streaks, missing sleep, drill-specific sprint grouping, condition overrides, and recent-session summaries.
- The Progress pass completed `npx tsc --noEmit`, `npx expo lint`, and a clean Expo web export of all 15 routes.
- A 390 × 844 browser review caught and fixed an initial horizontal overflow in the weekly day row. The corrected empty-data Progress screen fits the mobile viewport and hydrates to the current weekly plan.
- The July 24 domain-model pass completed `npx tsc --noEmit`, `npx expo lint`, and a clean Expo web export of all 15 routes.
- A focused adapter check confirmed that a completed workout preserves its plan, rep time, distance, intensity target, rest duration, surface, starting method, footwear, RPE, and pain classification in the embedded domain TrainingLog.
- The July 24 Training History pass completed `npx tsc --noEmit` and `npx expo lint` with no errors or warnings. A web export was started but remained bundling on the 2017 iMac alongside the existing LAN Metro server, so it must be confirmed in a later bounded run rather than treated as passed.
- The July 24 Workout Library foundation pass completed `npx tsc --noEmit` and `npx expo lint` with no errors or warnings. Static inventory checks confirmed the document's required 38 approved, 4 draft, and 2 archived records.
- The July 24 Workout Library content-authoring pass replaced the generated section placeholders with the supplied authored prescriptions across all 44 records, bumped the local seed to version 2 with a safe placeholder-only migration, and completed `npx tsc --noEmit` plus `npx expo lint` with no errors or warnings.
- The July 24 speed-platform architecture pass completed `npx tsc --noEmit`, `npx expo lint`, and a clean Expo web export. It added sport-aware profile migration, sport/pathway/timing contracts, universal Library filters and copy, a local Athlete Profile setup route, and the language audit without deleting local training data or adding non-track prescriptions.
- The July 24 onboarding pass completed `npx tsc --noEmit`, `npx expo lint`, and a clean Expo web export. It adds validation, back/continue navigation, progress indicators, partial local draft persistence, resume behavior, safety acknowledgement, and final local profile saving. It does not generate a plan.
- The July 25 selector/Settings pass completed `npx tsc --noEmit`, `npm run lint`, `git diff --check`, and a clean Expo production-web export of all 22 static routes, including the new Settings and plan-preview routes.
- The July 26 MVP planning pass removed the paused daily-challenge experiment; added native iPhone date/time controls, PR and target-time wheels, a five-second reminder preview, reminder conflict checks, persistent prehab states, and an editable plan-preview flow with why/swap/move/remove controls. It completed `npx tsc --noEmit`, `npm run lint`, and `git diff --check` without code errors.
- A fresh production-web export for the July 26 pass reached Metro static rendering but did not finish within the bounded verification window on the 2017 iMac. It was stopped without reporting a bundle error; the new native date/time and notification behaviors still require the iPhone checklist below.
- Responsive source review confirmed centered maximum-width containers on onboarding, Today, Plan, Readiness, Workout, Log, Progress, Settings, and plan preview. The production bundle could not be interacted with through the isolated in-app browser because that browser could not reach the Mac's localhost server; a final phone/tablet visual walkthrough remains a manual device check rather than a claimed automated pass.

The owner should still confirm the same persistence loop once in Expo Go on the iPhone:

1. Confirm Start routes to Readiness when no decision exists.
2. Complete Readiness or deliberately use the two-step Skip flow.
3. Edit today's planned workout and save it.
4. Start Workout Mode and verify the plan remains unchanged afterward.
5. Set session Track conditions, record a sprint time and rep feel, add one per-rep condition override, enter a lifting load/reps result, skip or modify one exercise with a structured reason, and complete a checklist exercise.
6. Review the conditions, rep feel, change reason, and actual results before saving.
7. Confirm those details appear in History and that the session still contributes to Progress.
8. Refresh or restart the app and confirm the plan, active draft, and completed History persist independently.

## How to run the current prototype

From Terminal:

```bash
cd ~/Desktop/sprintlab
npx expo start --web --clear
```

Then open `http://localhost:8081` on the Mac if the browser does not open automatically.

The 2017 Intel iMac builds slowly. Clean web bundles have taken several minutes, and the latest run stopped emitting progress without producing files. Do not assume a changing build is frozen, but use a bounded wait and verify that output files are actually created.

## Known development issues

### iPhone/Metro connection history

Expo Go previously failed to reach the Mac development server over normal Wi-Fi, and tunnel mode repeatedly timed out. The app has since been opened and tested successfully on the user's phone. Treat connectivity as intermittent development-environment behavior rather than an application-code failure.

Tunnel mode is also unusable at present:

```text
CommandError: ngrok tunnel took too long to connect.
```

`@expo/ngrok` was installed successfully, so the remaining tunnel failure is connectivity rather than a missing tunnel package.

Use the normal Expo server for Expo Go and `npx expo start --web` only for browser checks. If LAN access fails again, first verify that the current Metro server is running and use the active network-interface address; do not keep retrying ngrok indefinitely.

Possible later diagnostics include verifying the actual active network-interface IP, comparing it with the IP embedded in Expo’s QR code, and forcing the correct packager hostname if Expo selects the wrong interface.

### Old missing-storage browser error

The browser once displayed:

```text
@react-native-async-storage/async-storage could not be found
```

That was an old server session started before installation finished. The package is now installed. Stop the old server and restart with `npx expo start --web --clear` if it reappears.

### npm cache ownership

The user’s default npm cache contains root-owned files, causing an `EPERM` error during one installation. The storage package was installed successfully using a temporary writable npm cache. Do not run broad or destructive permission commands casually. If a future install fails, diagnose the exact cache path before changing ownership.

## Product roadmap

### Stage 1 — Personal sprint log (current, usable flow built)

Pre-workout Today screen, daily readiness, editable workout sections, active-workout checklist, rest timer, post-workout log, history, progress, sample plan, and local persistence.

Success test: it is easier and more useful than the owner’s current Notes/spreadsheet workflow and works during real training.

### Stage 2 — Structured workout companion (partly started)

Planned-versus-actual records, rep-level sprint time/wind entry, lifting load/reps by set, completion-only sections, skip states, exercise notes, final review, the dedicated execution screen, the rest timer, extra reps/sets, and in-session exercises now exist. Remaining work includes stronger skip/modify reasons, coaching cues, duplication, and reusable templates.

### Stage 3 — Training planner / real personal app

Onboarding, athlete profile, events, experience, schedule, equipment, season phase, meet date, controlled workout templates, editable calendar, Supabase accounts, cloud saving, and basic offline behavior.

Success test: the owner uses it consistently for two weeks instead of Notes.

### Stage 4 — Progress and readiness / private beta

Weekly sprint and lifting volume, high-intensity exposures, readiness check-ins, better progress views, notifications, feedback reporting, error tracking, TestFlight, and five to fifteen testers.

Success test: other sprinters use it without repeated reminders.

### Stage 5 — Intelligent assistant

Weekly summaries, workout explanations, equipment/location substitutions, missed-session rescheduling proposals, trend summaries, and fatigue/soreness flags inside controlled boundaries.

### Stage 6 — Adaptive training

Automatic plan adjustments, meet tapering, progression/deload logic, fatigue-aware volume, event-specific periodization, and integrated sprint lifting.

### Stage 7 — Meet Mode

Taper, packing list, schedule, warm-up timing, event cues, race results, wind, reaction time, notes, recap, and next-cycle recommendations.

### Stage 8 — Video analysis

Begin with upload, slow motion, frame stepping, manual drawing, comparisons, and coach comments. Automated biomechanics is technically difficult and should not be promised early.

### Stage 9 — Coach platform

Rosters, assigned workouts, team templates, attendance, completion/readiness dashboards, alerts, groups, comments, video review, and season calendar.

### Stage 10 — Optional recruiting/community expansion

Recruiting profiles and small sprint-specific groups only if evidence supports them. A social feed is not assumed to be necessary.

## Business direction

Two possible long-term customers:

- Athlete subscription: free logging with paid planning, adaptation, and analysis.
- Coach/team subscription: roster-based pricing, assigned training, and team dashboards.

The athlete experience proves demand. The coach product may eventually create stronger recurring revenue.

TestFlight belongs in private beta, not the initial prototype. It requires the paid Apple Developer Program. Because the current owner is under 18, a parent/guardian or appropriate organization may need to own the developer membership; never falsify age or account information.

## Immediate next steps

The weekly selector was rebuilt around explicit microcycle roles rather than choosing categories one slot at a time. General preparation now uses high/low organization, protects open/rest days, supports controlled maximum-velocity and speed-endurance exposures, pairs Approved authored strength or no-gym work with high-output days, and refuses to insert generic tempo when a role has no safe match. Draft and Archived records remain ineligible.

The onboarding frequency question means total SprintLab training days, not maximal sprint sessions. Two days produces a focused acceleration/upright-speed structure; three adds a low/support day; four adds another complementary low or quality role; and a trained athlete choosing five may receive three separated quality exposures and two lower-output days. A foundation athlete is not given a third demanding sprint day. The remaining days stay open for rest, team obligations, or the athlete's coach.

The supported planning scope is now explicit:

- Track & field uses the researched short- and long-sprint pathways.
- Football uses reviewed 40-yard early-acceleration and transition/finish sessions.
- Soccer, basketball, baseball/softball, General speed, and Other currently use a clearly labeled general linear-speed foundation.
- Lacrosse, rugby, and volleyball are no longer presented as dedicated main pathways, though old stored profile values remain readable.
- Onboarding asks only for track event times or an optional football 40-yard time. Positions, vertical jump, shuttle, agility, and unrelated test fields are not collected.

Eight Approved library records now support the non-track fallback without inventing workouts: general acceleration, upright exposure, low support, in-season microdose, trained acceleration integration, limited-space acceleration, 40-yard start/early acceleration, and 40-yard transition/finish. The actual selector is verified against short-sprint, long-sprint, trained football, beginner football, soccer/general-speed, court-only, and in-season profiles by `scripts/verify-plan-pathways.ts`.

The onboarding includes a reviewed-sources explanation and a short real plan-building sequence. The logo is saved in app assets and configured for the app icon/splash. New installs default to Dark; Settings can explicitly select Dark, Light, or System, and the app follows the phone only when System is selected. The workout screen copies the first strength set's load and reps into later empty sets while keeping every set editable, and the timer label now reads simply `WORKOUT TIME`.

Weekly progression is transparent and enabled by default. Recent completion, RPE, soreness, and readiness may automatically hold the week, remove one high-output exposure, or advance one session through an authored Approved progression link. It changes only the upcoming preview, shows exactly what changed, and provides Undo/Edit before saving. It never rewrites completed history or claims to predict performance.

Profile & Settings now discloses that this prototype stores data locally and has no cloud backup. Deleting the app or using the development erase control can permanently remove profiles, plans, and history.

Readiness now uses a duration picker, separates food from hydration, compares sleep with the athlete's recent baseline when enough history exists, treats general soreness 5/5 as a maximal-sprinting restriction, and requires a Better / Same / Worse warm-up reassessment on yellow decisions. Red decisions and incompatible maximal work are launch gates, not just warning copy.

Prehab/recovery recommendations moved to the post-session review. They use the athlete's profile, restrictions, session type, and logged readiness without asking for another symptom report. Training Progress now counts only completed actual sprint meters, plus seven-day volume, high-intensity meters, and timed reps.

Automated architecture scenarios live in `scripts/verify-planner-architecture.ts`; actual production-selector pathway tests live in `scripts/verify-plan-pathways.ts`; the owner's phone test profiles and expected outcomes live in `PLANNER_TEST_SCENARIOS.md`.

1. Run the ten profiles in `PLANNER_TEST_SCENARIOS.md` on an iPhone and compare the explanation and week structure before saving.
2. For the trained 400 m general-preparation profile, confirm a five-day preview shows high / low / high / low / high, two different strength pairings, no repeated tempo filler, and two open/rest days.
3. Repeat that profile without a weight room and confirm Approved no-gym strength/bodyweight sections replace gym work without downgrading the entire week.
4. Test a green readiness day, yellow Better/Same/Worse reassessment, soreness 5/5, and a red pain response. Confirm maximal work cannot launch when restricted.
5. Complete a full session and verify the post-session recovery cards, History detail, and actual-meter totals survive an app restart.
6. Manually test all three Library collections: start one Approved workout, add another to an empty weekday, replace a populated weekday after confirmation, archive/restore a disposable Draft, and confirm Draft/Archived workouts never appear in automatic suggestions.
7. Verify the automatic weekly adjustment card with actual completed-session data. Confirm its Undo/Edit path before describing the planner as adaptive; changes apply only to the editable upcoming preview and never rewrite History.
8. Starting-gun audio, Supabase/accounts, AI, and payments remain deliberately outside this pass.

## Release-candidate verification (July 27, 2026)

The final stabilization pass also:

- Keeps the sport-focus question only for athletes who select multiple sports.
- Adds 60m to the complete short-sprint pathway and verifies it through the production selector.
- Removes normal workout access and equipment as planning gates, so missing blocks or a stored location answer cannot collapse a trained plan into basic filler.
- Gives trained track athletes authored weighted strength support while reserving the basic bodyweight sequence for true beginners.
- Reduces workout-screen scrolling with bulk rep completion and first-set strength propagation.
- Adds modest session, actual-meter, and strength milestones without turning the prototype into a reward game.
- Centers readiness metrics and fixes theme-aware date/time controls, onboarding speech, and bottom navigation.
- Uses the display name **SprintLab** and verifies that the 1024 × 1024 iOS icon is opaque.

The following checks passed from the release-candidate source:

```text
npx tsc --noEmit
npm run lint
npm run verify:planner
npx expo export --platform ios --clear
git diff --check
```

The production-selector matrix covers 60m, short sprint, long sprint, football, team-load, general-speed, coach-plan, and log-only paths. `TESTFLIGHT_RELEASE_CHECKLIST.md` is the final physical-device and App Store Connect gate. Passing automated checks does not replace that device test.

## Instructions for the next Codex session

1. Read `AGENTS.md` and this entire file before changing code.
2. Inspect the current worktree; do not rely only on this summary.
3. Preserve the narrow sprinter-first scope and rule-based planning decision.
4. Do not introduce Supabase, AI, payments, or native-only modules without an explicit product reason and user approval.
5. Keep changes small enough to test and run TypeScript checks afterward.
6. Do not overwrite unrelated or user-created changes.
7. Update this handoff when a meaningful feature, decision, dependency, command, or known issue changes.
# Onboarding welcome redesign (July 30, 2026)

- Replaced the generic first onboarding step with a dedicated responsive SprintLab hero.
- Phones use a centered vertical layout; landscape tablets use a bounded two-column layout with a larger Split mascot, attached dialogue, and a focused profile-building CTA.
- The welcome screen is intentionally dark, uses subtle track-lane arcs, has restrained Split motion and light CTA haptics, and does not show onboarding progress before the athlete makes a choice.
- Development reset actions are no longer visible in the interface. In development builds, long-press Split on the welcome screen to open the hidden debug menu.
- Steps 2–18, onboarding persistence, profile migration, plan data, logs, and navigation behavior were preserved.

# SprintLab Intelligence I-2: controlled plan modification (August 15, 2026)

Builds on I-1A–I-1C (secure Gemini backend, File Search knowledge layer, live athlete context in `/api/coach`). Gemini can now propose a structured plan change; SprintLab validates and applies it only after the athlete approves. Nothing is ever auto-applied server-side.

- `types/ai-plan-change.ts` defines `PlanChangeProposal` (flat shape, `type` discriminant — chosen over a real TS union because that is what reliably survives Gemini's JSON schema) and the JSON Schema sent to Gemini via `response_format`. Supported types: `move_workout`, `replace_workout`, `change_workout_variant`, `adjust_volume`, `add_recovery_day`, `remove_future_workout`.
- The live plan model already distinguishes the recurring weekly template (`ScheduledDay[]` via `getWeekSchedule`) from date-specific instances (`FutureWorkoutOverride[]`, which win over the recurring day for that one date). All AI-driven mutations write date-specific overrides only — they never touch the recurring template, so a proposal can never silently change the athlete's permanent weekly pattern.
- `types/index.ts`'s `FutureWorkoutOverride` gained an optional `kind: 'workout' | 'rest'` (defaults to `'workout'` for existing records) so a single future date can also be overridden to rest without a workout payload. `utils/storage.ts` gained `saveRestDateOverride` and `getScheduledDayForDate`; `getScheduledDay` now honors a rest-kind override.
- `utils/plan-change-validator.ts` is the deterministic, storage-free integrity gate: rejects past dates, rejects any date that already has a saved `TrainingLog` (real history, regardless of completion status), requires the proposal's `workoutId` to match what's actually scheduled (this is the staleness check), requires `newWorkoutId` to be an Approved Workout Library record, and keeps `adjust_volume`'s modifier inside a 0.5–1.2 sane range. It does not re-coach Gemini or re-derive the Season Engine — only structural/data-integrity checks.
- `utils/plan-change-apply.ts::applyAIPlanChange` is the single write path. It always re-fetches live plan state and re-runs the validator immediately before writing (never trusts state captured when the proposal was generated), so a plan that changed between proposal and approval fails safely instead of applying. It reuses `libraryWorkoutToPlannedWorkout` (existing plan-selector conversion) and the override storage helpers rather than a second mutation system.
- `/api/coach` (`app/api/coach+api.ts`) now requests structured JSON output (`{ message, proposal: null | PlanChangeProposal }`) from Gemini's Interactions API via `response_format`. The route only shape-checks the proposal before returning it — real validation happens on-device against live storage. The route still never writes to storage.
- `app/coach-dev.tsx` is a minimal development-only review surface (not the final Coach UI, which doesn't exist yet): ask a question, see the answer, and if a proposal comes back, review old→new/reason/confidence with Apply / Keep Original buttons. Apply calls `applyAIPlanChange` directly against local storage.
- Offline tests: `scripts/verify-ai-plan-change.ts` (`npm run verify:ai-plan-change`) — 11 assertions against the validator and the `scaleWorkoutVolume` transform, no Gemini call required.
- One-shot live verification: `scripts/dev-test-coach-plan-change.ts` (`npm run test:coach-plan-change`) — sends the missed-Friday/limited-days scenario to a running dev server once, then locally validates whatever proposal comes back. Never calls `applyAIPlanChange`. The one attempt run for this pass hit the documented 20/day free-tier 429 (confirmed via an isolated direct-SDK call, not a code defect); `/api/coach` now forwards a real `429` status instead of masking it as `502` so this is distinguishable going forward. Live verification with an actual proposal is still owed — retry on a fresh quota day.
- `npx tsc --noEmit` and `npx expo lint` both pass clean after this pass.
- Not built yet (deliberately deferred per I-2 scope): automatic/background adaptation, a real Coach chat UI, video/nutrition/injury/meet intelligence, coach dashboards.

# First-time SprintLab product tour (August 16, 2026)

An interactive, in-app walkthrough that spotlights the real Today screen (and a real-data Progress
preview) instead of a generic slideshow — deliberately not another onboarding questionnaire.

- **Trigger**: `app/plan-preview.tsx`'s `save()` sets a one-shot handoff flag (`requestSprintLabIntroLaunch`, `utils/sprintlab-intro.ts`) only when `!replacingExistingWeek && !hasSeenSprintLabIntro()` — i.e. the first plan a given install ever saves, and only if the tour has never run. Existing installs (which already have a saved week schedule from before this feature existed) never qualify, so no pre-existing athlete is retroactively forced through it. On that condition it navigates to Today (`/`) instead of the usual `/plan`; otherwise the regenerate/replace flow is unchanged.
- Today (`app/(tabs)/index.tsx`) consumes that flag once per focus (`consumeSprintLabIntroLaunchRequest`, which atomically clears it) and calls the tour's `start()`. The same flag/consume mechanism is reused by a low-key **Settings → "Replay the SprintLab intro"** link (not prominent, sits between the local-data-storage card and the dev-only section), so first-run and manual replay share one code path.
- `components/sprintlab-intro-context.tsx` (`SprintLabIntroProvider`, mounted at `app/_layout.tsx` root alongside `CoachProvider`) owns all tour state: active step, a `View` ref registry any screen can register into via `useIntroTarget(id)`, and a real-data fetch (`countPlannedWorkoutsCompleted`, `calculateConsistencyStreak`, `calculateCurrentWeekCompletion`, `buildSprintSeries`, `buildMilestoneCollection`) for the Progress moment.
- `components/sprintlab-intro-overlay.tsx` renders the spotlight: it measures the registered real target (`measureInWindow`, with a short retry loop for layout timing) and draws four dimmed rectangles around it — a true cutout, not a screenshot or recreated copy, so the athlete sees their actual generated workout/readiness line/Coach launcher live underneath. A fifth transparent rect over the cutout still swallows taps so the athlete can't accidentally trigger the real action mid-tour. Steps with no target (the Progress preview and the final reveal) render a centered card instead.
- Four moments plus a final reveal, in `utils/sprintlab-intro-steps.ts` (copy/order/targets — the only file to touch to reorder, edit, add, or remove a step): **workout** (spotlights whatever real card is in Today's hero slot — the workout card, an intentional-rest card, or the open-day card, whichever actually renders that day), **readiness** (spotlights Today's check-in line, with a small animated "Readiness check → Session adjusted" demo — never mutates real readiness/workout data), **coach** (spotlights the real, already-globally-mounted `CoachLauncher` button and shows three informational example prompt chips — never sends a real message or opens the real overlay), **progress** (no navigation to the real Progress tab; instead a centered card shows real milestone data reused via `utils/milestones.ts`, deliberately picking one representative locked milestone per category — training/consistency/performance — so a brand-new athlete sees what's ahead, e.g. "FIRST REP," never a discouraging "0 of X" empty state), **final** ("You're ready" / "Start training" closes the tour and leaves the athlete on Today, which remains the default landing screen).
- Skip is available on every step except the final reveal (which has its own equivalent close action). Either path calls `markSprintLabIntroSeen()`.
- Verified in-browser end-to-end (seeded a real generated plan via a completed onboarding draft, saved it through the actual plan-preview flow, and confirmed the tour auto-launched on Today, stepped through all five moments with the real workout/rest-day card, real Coach launcher, and real milestone data, closed cleanly on both "Start training" and Skip, and the Settings replay link re-launched it independent of the persisted "seen" flag). `npx tsc --noEmit` and `npx expo lint` both pass clean.

# Plan-build loading screen redesign (August 15, 2026)

Replaced onboarding step 16's plan-build visual (previously an elliptical "track loop" progress ring with a five-stage sentence readout) with a faithful translation of an approved Figma Make loading-screen prototype, while keeping the step's real generation-gating logic completely intact.

- `components/plan-build-loading.tsx` is new and now owns everything the removed `PlanBuildTrack`/`PlanBuildStep` functions in `app/profile.tsx` used to (that block, its `TRACK_*` geometry helpers, and its dedicated styles were deleted from `app/profile.tsx`, not just superseded). `app/profile.tsx` now only imports `PlanBuildStep` from it and renders it unchanged at `step === 16`.
- The real-generation gate is unchanged: it still calls `getLibraryWorkouts()` + `buildDeterministicWeeklyPlan(profile, library)` and only allows the READY state once that resolves — the ~9.8s animated sequence runs on its own clock and never fakes completion. If the animation finishes before the real result, it holds at 99% with idle motion until the result lands (does not falsely show 100/READY); if generation finishes first, the animation is simply allowed to play out to its own completion.
- Central visualization is a `react-native-svg` + `react-native-reanimated` circular instrument (300° progress arc, rotating decorative rings, orbiting dots, tick marks, distance markers, center reticle) driven by shared values on the UI thread; only the displayed integer percent crosses back to a React state via `useAnimatedReaction`/`runOnJS`.
- The "PERSONALIZING FOR YOU" checklist reflects the athlete's actual saved answers (event(s) or pathway, whether a performance baseline exists, real training-day count, whether goals were set, the actual protected practice/competition day, closing with a generic "weekly load balanced") — the Figma source's checklist text was generic placeholder copy; this app wires it to real profile data instead, matching the design's own intent ("SprintLab is actually using the answers the athlete just provided").
- Typography was deliberately not carried over from the Figma prototype (`Inter`/`Barlow Condensed`, CSS `em` letter-spacing). The screen uses the same system-font, heavy-weight (700–900), small-caps-uppercase-label convention already used everywhere else in the app (see `components/sprint-ui.tsx`'s `Eyebrow`/`title` and `app/plan-preview.tsx`'s label styles), and the "Continue to my week" / "Try again" CTAs reuse the existing shared `PrimaryOnboardingButton` rather than a bespoke button.
- `components/onboarding.tsx`'s `OnboardingLayout` gained an optional `bare` prop (default off, only used by step 16) that suppresses the ambient glow background and page padding for a true full-bleed screen; `app/profile.tsx` also hides `OnboardingProgress` (the step counter/back-button bar) for step 16 only. No other step's presentation changed.
- No new dependencies — `react-native-svg` and `react-native-reanimated` were already installed and already used elsewhere in onboarding for the previous version of this exact step.
- Known non-blocking web-preview-only console warning: `react-native-svg`'s web renderer emits the ring/arc rotation shorthand (`originX`/`originY`/`rotation` props) as a raw `transform-origin` SVG attribute, which React's dev-mode DOM validator flags as "did you mean transformOrigin" — cosmetic, does not affect rendering or behavior, does not reproduce on native iOS/Android, and isn't something fixable from this app's code without abandoning those props.
- Verified in-browser end-to-end: seeded a real onboarding draft at step 16 with a sample profile, confirmed the progress bar/back button are hidden, the checklist reflects that profile's real data, the sequence resolves to READY only after generation completes, and tapping "Continue to my week" correctly advances into the existing step 17 (profile reveal) with all other onboarding chrome/state intact. `npx tsc --noEmit` and `npx expo lint` both pass clean.

# SprintLab Coach UI: C-1 launcher/overlay, C-2 real backend, C-3 local adaptive triggers (August 15, 2026)

The persistent Split launcher (`components/coach-launcher.tsx`) and full chat overlay (`components/coach-overlay.tsx`) are built on top of the I-2 backend, replacing the `app/coach-dev.tsx` review-only surface as the athlete-facing entry point (that dev screen is kept for direct proposal debugging, not removed).

- `components/coach-context.tsx` (`CoachProvider`/`useCoach`) owns all conversation state and is the only file that calls `/api/coach` or `applyAIPlanChange`; the launcher and overlay only render state and call `sendMessage`/`applyProposal`/`dismissProposal`. In-memory only — a fresh app launch starts the conversation empty.
- `utils/coach-routes.ts` is an explicit allowlist of routes where the launcher appears (Today, Plan, History, Progress, Library, Library detail, History detail) — a new route stays hidden until deliberately added, rather than a denylist that silently grants every new screen a floating button.
- `utils/coach.ts` (pure) / `utils/coach-resolve.ts` (AsyncStorage) hold suggestion-chip prompts, conversation-history bounding, friendly non-leaky error copy, and proposal-card display text (resolves workout titles against live storage/library so cards never show raw ids or JSON). Tested offline in `scripts/verify-coach-proposal.ts` (`npm run verify:coach-proposal`).
- **C-3 — local adaptive triggers**: `utils/coach-triggers.ts` (pure) is deterministic, local, non-AI logic answering only "is there something here that may be worth Split reviewing with the athlete?" — it never decides how training should change. Six trigger types: `missed_workout`, `multiple_missed_sessions`, `high_rpe`, `repeated_high_effort`, `low_readiness`, `meet_approaching`. Every trigger reuses an existing computed signal rather than inventing judgment: `buildWeeklyProgress`'s day status (`missed`) for the two missed-session types, `buildRecentSessions`' logged RPE (1-10 scale, `app/log.tsx`) for the two effort types (thresholds: 9+ for a single standout session, 2-of-last-3 at 8+ for a demanding stretch), the existing readiness result's `red`/`yellow` level for `low_readiness` (never re-derived), and `deriveSeasonPhase`'s A/B-priority `nextMeet` within 7 days for `meet_approaching`. Each `CoachTrigger` carries `{ id, type, priority: 'low'|'medium'|'high', title, message, suggestedPrompt, date?, entityId? }` — no invented risk scores, no diagnostic wording (`message` stays observational: "That session was harder than usual," never "you are overtrained"). `detectCoachTriggers` returns every active trigger sorted highest-priority-first then most-recent-first; `selectActiveCoachTrigger` picks the first one whose stable event-based `id` (e.g. `missed_workout:2026-08-14`, `high_rpe:<trainingLogId>`) isn't already dismissed, so a dismissed occurrence stays quiet but a later, different occurrence of the same type is still eligible. `utils/coach-triggers-live.ts` gathers live storage/season data and calls both. `utils/storage.ts` gained `getDismissedCoachTriggerIds`/`addDismissedCoachTriggerId` (a capped list, not a single overwritten value). `CoachProvider` evaluates the active trigger once at app boot (matching how the rest of the app treats decision-support signals — a fresh explained check each open, not a background poll), drives the existing `hasAttention`/`activeTrigger` state, and dismisses it the moment Coach is opened. The overlay renders a lightweight accent-bordered banner (trigger `message` + a `title`-labeled chip) above the normal greeting/suggestion chips whenever `activeTrigger` is set — tapping the chip calls the exact same `sendMessage(displayText, promptOverride)` path as every other suggestion chip (`displayText` = `title`, `promptOverride` = `suggestedPrompt`), so it is not a new send mechanism. Opening Coach and rendering the banner never call `/api/coach` — only an explicit send does, and when one happens while a trigger is active, `sendMessage` attaches a compact `activeTrigger: { type, date, message }` (never the full detected list) to the request; `app/api/coach+api.ts` shape-validates it and folds it into the prompt as a `SPLIT NOTICED` line the system instruction treats as a hint, not a directive. Tested offline in `scripts/verify-coach-triggers.ts` (`npm run verify:coach-triggers`, 23 assertions covering every trigger's positive/negative case, priority/recency ordering, and dismissal-by-id semantics). Two spec items — "opening Coach makes no API call" and "the suggested-prompt chip reuses the exact C-2 send path" — are architectural properties confirmed by source inspection rather than an executable test, since this project has no React Native component-test harness.
- `npx tsc --noEmit`, `npx expo lint`, and every existing `verify:*` script (`coach-proposal`, `ai-plan-change`, `ai-context`, `streaks`, `planner`) all pass clean after C-3. Not yet verified in-browser or on-device — this is local logic gated on real athlete history (a missed day, red/yellow readiness, an unusually demanding session, a near-term A/B meet), which isn't practical to seed through the isolated in-app browser; the offline assertions are the primary coverage for this pass. Owner should confirm on a real profile with at least one missed scheduled day, one flagged readiness check-in, and one near-term priority meet before treating C-3 as device-verified. Zero Gemini requests were made during this pass.

# Readiness/workout polish pass, icon consistency, personalization, Coach Moments, and notification permission flow (August 16, 2026)

A targeted cleanup pass across several existing surfaces — no redesign, no new architecture beyond what each item needed.

- **Readiness sleep-duration wheel**: the drag track in `app/readiness.tsx`'s `SleepDurationQuestion` is rebuilt on a single `Animated.Value` — 1:1 finger tracking while dragging, a native-feeling momentum flick on release via `Animated.decay` seeded from real release velocity, hard clamping so it can't overshoot the 0–14h track, and a guaranteed final `Animated.timing` snap to the nearest 15-minute step. Fixed a real stale-closure bug the old `PanResponder` had (memoized once, closed over changing `value`/`onChange`) with ref-based latest-value access. Same values/range/surrounding UI as before.
- **Readiness answer color semantics**: `AnswerSemantic = 'positive' | 'caution' | 'negative' | 'neutral'` is set per-question (not derived from raw numbers), via a `direction: 'higher-better' | 'higher-worse'` prop on the shared `ScaleQuestion` and a per-option `semantic` on `CategoricalQuestion` — so soreness (higher = worse) and sleep quality (higher = better) map correctly, and "training fasted as usual" is `positive` rather than being penalized for being a lower-effort-sounding option. `semanticTint()` reuses the same restrained green/orange/red tokens as the existing result screen (`palette.success`/`orange`/`red` on dark tinted backgrounds) only on the *selected* state — unselected chips keep their existing neutral styling, so the screen doesn't turn into a rainbow.
- **Coach "thinking" state**: `components/coach-thinking.tsx` replaces the plain `ActivityIndicator` + "Split is thinking…" row in `components/coach-overlay.tsx` with a gently pulsing Split mark, three typing-style dots, and elapsed-time-staged status copy — no fake percentages, and an honest "taking longer than usual" message past ~16s since a Coach response can occasionally run long.
- **Workout execution — end early / partial completion**: `app/workout.tsx` gained a secondary "End workout early" link (visually subordinate to the primary Finish flow, only shown once something is incomplete) with a plain, non-guilt-based confirmation. `types/domain.ts`'s `WorkoutCompletionStatus` already distinguished `completed-as-planned | completed-with-modifications | partial | stopped | skipped`; the real gaps were no UI path to reach `partial`/`stopped` with real unfinished work, a missing `partial` branch in `utils/streaks.ts` (Plan/Consistency Streak — `utils/progress.ts`'s older weekly-adherence functions already had it), Today (`app/(tabs)/index.tsx`) treating an ended-early day as if untouched, and `components/workout-completion-celebration.tsx` mislabeling it a generic "one-off." All four now understand the distinction. History (`app/(tabs)/history.tsx`, `app/history-detail.tsx`) shows real coverage — "Ended early · 5 of 8 items completed" — instead of a bare "Completed." Ending early never marks remaining items complete, fabricates results, or deletes what was actually done.
- **Icon consistency**: `utils/workout-icons.ts` centralizes `sectionIconName()` (used by both `app/workout.tsx` and `app/workout-builder.tsx`) and one shared `WORKOUT_ICON_FALLBACK = 'sports'`. The real bug found: `workout.tsx`'s old inline fallback returned the string `'exercise'`, which isn't a valid MaterialIcons glyph — it silently rendered nothing/broken on device, not just "not ideal." "Starts" now uses `rocket-launch` instead of the generic shared `directions-run` (in Plan Preview's category map and Library's discipline icon), so it no longer reads as an arbitrary sprint-running glyph shared with three other categories.
- **Personalization**: `utils/athlete-profile.ts` gained `athleteFirstName()`, `athleteInitial()`, `possessive()`, and `possessiveTitle()` — a single source of truth with clean "Your ___" fallbacks when no name is saved. Applied to the Speed Profile reveal title, Settings' title, the onboarding commitment signature, the post-workout completion celebration ("Nice work, Joshua"), and Coach's generic opening greeting; Today's existing name-based greeting/avatar now routes through the same helper instead of its own inline logic. Deliberately *not* applied to tab names or every screen title (Plan/Library/Progress stay generic) per the "don't mechanically rename everything" instruction.
- **Coach Moments**: `types/coach-moment.ts` + `utils/coach-moments.ts` (pure, local-first — no Gemini calls) detect PRs (real before/after comparison against `buildSprintSeries`, not a guess), unusually high RPE, first-ever workout, and celebration-worthy streak/weekly-completion states (reusing the existing `getWorkoutCompletionCelebrationState` from `utils/streaks.ts` rather than a second scoring system). `selectPrimaryCoachMoment()` picks exactly one by priority so moments never stack. `components/coach-moment-card.tsx` renders the result — a distinct "NEW BEST" treatment for PRs — with an optional "Ask Split about this →" handoff that calls the existing `useCoach().sendMessage(displayText, promptOverride)` path with the moment's context pre-seeded, so Gemini is only ever invoked by an explicit athlete tap, never automatically when a moment appears. Wired into the post-workout completion flow only for this first pass (not scattered across every screen) — Today/Progress/History placements are a natural next step, not built yet.

## Notification permission flow (August 16, 2026)

Fixed the app requesting the native/system notification permission too early (immediately on choosing a reminder time, both in onboarding and Settings) instead of only after the athlete opts in through SprintLab's own explanation.

- `utils/notification-permission.ts` is now the **only** file in the codebase that calls `Notifications.requestPermissionsAsync()` (verified by repo-wide grep) — `getNotificationPermissionStatus()` is read-only and safe to call anywhere (never prompts), `requestNotificationPermission()` is the single gated call, and `getNotificationOptInDecision()`/`setNotificationOptInDecision()` persist the athlete's own SprintLab-level choice (`'enabled' | 'not-now'`), separate from the OS permission status, so a "Not Now" doesn't get re-asked automatically.
- `components/notification-setup-card.tsx` is the shared explanation UI ("Stay on top of your training" / Enable / Not Now), with distinct restrained states for already-granted and system-denied (the denied state links to device settings via `openSystemNotificationSettings()` instead of silently failing or re-prompting, since the OS won't show its own dialog again after a denial). Used both inline inside onboarding's reminder step and as the standalone `app/notifications-setup.tsx` screen (reachable anytime from Settings → "Notification permission").
- `utils/workout-reminders.ts`'s `syncWorkoutReminders()` no longer calls the native API directly — it only *asks* the centralized helper to request permission when a caller explicitly passes `requestPermission: true`, and that flag is now only ever set from the two athlete-initiated "Enable" actions (the onboarding gate and the standalone screen). The automatic boot-time sync (`app/_layout.tsx`'s `initializeWorkoutNotifications`) and Settings' reminder-time picker both call it without that flag, so choosing a preset/custom time only saves the preference — permission is requested exclusively from SprintLab's own explanation screen.
- `app/profile.tsx`'s onboarding `ReminderStep` no longer requests permission from picking a preset/custom time (previously the actual early-prompt bug). It still saves the time preference immediately (unchanged auto-advance feel), then checks status: if already granted, continues straight through; if not, the step switches in place to the shared `NotificationSetupCard` gate before advancing. Choosing "No workout reminders" skips the gate entirely — no ask when the athlete doesn't want reminders. The custom-time sub-flow's "Continue" button moved from a step-external footer ternary into the step itself so it could participate in the same gate.
- `app/settings.tsx`'s reminder-time picker follows the same rule: if permission is already granted, tapping a preset schedules directly (never re-asks, per spec); otherwise it hands off to `/notifications-setup` instead of prompting inline. Turning reminders off never touches permission at all.
- Existing users updating to this version: nothing forces them through a new screen — `getNotificationPermissionStatus()` reflects whatever the OS already knows (including a prior grant from before this change), so a returning user with reminders already working sees no new prompt.
- `npx tsc --noEmit` and `npx expo lint` pass clean for the whole pass (readiness/workout/icons/personalization/Coach Moments/notifications together). Not yet verified in-browser/on-device — the sleep-wheel momentum feel, semantic color rendering, and permission-gate screens should be confirmed on a real iPhone (the isolated in-app browser can't exercise native gesture momentum or the real OS permission dialog).

## Rest timer restored to timestamp-based, persisted state (August 19, 2026)

The in-app rest timer had not actually disappeared — `app/workout.tsx` already had a working `rest` state and a compact `restStrip` footer — but it had two real problems: it auto-started counting down the instant a rep/set was marked complete (no athlete opt-in), and it was plain `setInterval`-decremented component state with no persistence, so it reset on any remount and would read wrong after the app was backgrounded (JS suspension doesn't pause the real clock, but a decrementing counter has no way to know that).

- `types/index.ts` gained `RestTimerState` (`totalSeconds`, `next`, `running`, `endsAt?`, `remainingSeconds`) and `ActiveWorkoutSession.restTimer` — the countdown now lives on the persisted session itself, the same place `elapsedSeconds`/`executionStartedAt` already do, rather than in local-only component state.
- `utils/rest-timer.ts` (new, pure) holds the wall-clock math: `restRemainingSeconds()` is the one function every read site uses, and while running it always computes `endsAt - now` rather than trusting a stored counter — so a value read the instant the app returns from background/lock is correct on the very first render, never stale. `createRestTimer`/`startRestTimer`/`pauseRestTimer`/`addRestSeconds`/`finishRestTimer` are the only ways `restTimer` is ever mutated.
- `app/workout.tsx`: `beginRest()` now creates the timer in a not-started state after a completed rep/set (immediately visible, matching "make starting extremely low-friction") but never sets `running: true` itself, and no-ops if a `restTimer` already exists (guarantees exactly one can ever be active). A new `RestCard` component renders three states — not started (large duration + "Start rest · Skip"), running/paused (live countdown + "+30 sec · Pause/Resume · Skip"), and finished (frozen at `00:00`, "REST COMPLETE", requires an explicit "Continue" tap so it can't silently vanish before being noticed). `hapticSuccess()` fires exactly once when a running timer's remaining time reaches zero. Skipping/pausing/finishing only ever touches `session.restTimer` — never `actualResults`, so it cannot mark a rep/set complete.
- Verified in-browser: start → pause → resume → +30 → skip; countdown reaching zero (both live and via a simulated already-expired `endsAt`); a full page reload while a timer was running correctly recomputed the exact remaining time from the real elapsed wall-clock gap (stronger than an ordinary background/foreground cycle — this is the same mechanism); an exercise with no prescribed rest shows no rest UI at all after completion. Confirmed via direct storage inspection that `restTimer` exists in exactly one place (the active session) and nowhere else. `npx tsc --noEmit` and `npx expo lint` pass clean.

## Readiness body redesign, sleep-screen polish, and the training-plan-mode fix (August 19, 2026)

**Readiness redesign** (`app/readiness.tsx` only — the header/progress shell was explicitly left untouched): every question body now matches the reference mockups via a small set of reusable, config-driven pieces rather than one-off JSX per question. `ReadinessQuestionIntro` (icon badge + title + description), `ScaleQuestion` (five tall semantic cards with a directional glyph, a big number, and an athlete-facing word — e.g. Heavy/Tight/Normal/Light/Springy for leg readiness — never generic "1 2 3 4 5"), `CategoricalQuestion` (icon-card grid for 2-3 option questions like fueling/hydration/localized-issue, a simpler stacked list kept for the long symptom-location option set), `WhyWeAsk`, `TapToContinueHint`, and `ReadinessNextUp` (a "Next up: {actual next question}" preview computed live from `sequence[currentIndex + 1]`, never hardcoded). `semanticTint()` was narrowed so a 'positive' answer resolves to the same plain lime selected-card fill the mockups show (matching "Lime selected-card treatment" as an explicit requirement) — the tinted red/orange treatment is reserved for genuinely 'caution'/'negative' answers (severe soreness, an injury "Yes", severe-acute pain), preserving the earlier safety-color-coding work without turning the screen into a red/yellow/green rainbow. Every underlying stored value (1-5 scale numbers, `ReadinessFuelStatus`, booleans), `evaluateReadiness()`, and the result screen are byte-for-byte unchanged — verified live in-browser end to end, including that a 4/5 soreness answer still produced the correct yellow "Modify & monitor" result.
- `SleepDurationQuestion` additionally got the requested standalone polish: a centered crescent-moon icon, centered title/subtitle, a "8 hr" value readout in a lime-outlined glowing card (steppers now flank it directly), and a new "Aim for 8+ hours" guidance card. The drag/momentum physics, 15-minute step precision, and stored value semantics are completely unchanged; a light haptic tick was added on each half-hour crossed while dragging (reuses the existing `selection()` haptic, no new haptics plumbing).

**Training-plan-mode bug fix**: the athlete's onboarding choice (`AthleteProfile.trainingPlanMode` → `utils/athlete-profile.ts`'s `getTrainingWorkflow()`) was already correctly collected and persisted — `app/(tabs)/plan.tsx` even already rendered an accurate workflow banner ("Coach plan protected" / "Logging without a plan"). The actual bug was one level lower: `utils/storage.ts`'s `getWeekSchedule()` unconditionally seeded and persisted the hardcoded `defaultWeekSchedule` (6 workouts + 1 rest) for *any* athlete the first time it was called, with zero workflow awareness — so a coach-led or logging-only athlete's Plan/Today always rendered that fake generated week underneath an otherwise-honest banner.
- `data/workouts.ts` gained `OPEN_DAY_RESTTITLE` (hoisted out of `app/(tabs)/index.tsx`, which previously duplicated the same literal for a related but narrower purpose) and `openWeekSchedule()` — an honest all-seven-days-open template used only for `coach-plan`/`log-only` workflows.
- `utils/storage.ts`: `normalizeSchedule()` now reconciles against a passed-in template (`defaultWeekSchedule` or `openWeekSchedule()`) instead of hardcoding the default, so a coach-plan athlete's five untouched days stay genuinely open instead of being backfilled with canned sprint sessions. `getWeekSchedule()` picks the template via the athlete's real workflow (`getScheduleTemplate()`) and safely migrates existing local data: an auto-seeded (never `hasSavedWeekSchedule`) fake week gets replaced with the open template the moment the workflow says it shouldn't exist, while any genuinely saved schedule — including a coach-plan athlete's own manually-added day — is never touched.
- `app/(tabs)/plan.tsx`: the day-grid view (now correctly data-driven, required no other changes for `sprintlab-plan`/`combined`/`coach-plan`) early-returns to a new `LogOnlyPlanView` for `workflow === 'log-only'` — "Log your training" + Log a workout/Browse library actions + a real "This week" list built from `getCompletedWorkoutSessions()` filtered to the current Mon–Sun week, or an honest "No sessions yet this week" empty state. No generated weekly structure of any kind.
- Today (`app/(tabs)/index.tsx`) needed no logic changes beyond importing the hoisted `OPEN_DAY_RESTTITLE` constant — its existing `needsPlanSetup` gate was already correctly scoped to `sprintlab-plan`/`combined` only, and its existing "No SprintLab workout planned" + "Start an unplanned workout" fallback already reads correctly once the underlying data is honest. Plan/Consistency Streak, weekly-adherence, and Coach Moments' missed-session triggers all key off `ScheduledDay.kind` — since an open day is `kind: 'rest'`, they already treat it as neutral (never "missed") with no changes needed there either.
- Verified in-browser for Athlete B (coach-led) and Athlete C (logging-only): Plan and Today both show the correct honest state (0 training days / 7 open days, "Coach-led training" / "Log your training"), and the state survives a full page reload (confirmed via direct `sprintlab:week-schedule` storage inspection — all seven days `kind: 'rest'`, `restTitle: 'Open / existing training'`). Athlete A (sprintlab-plan) path was not touched and was re-confirmed by source inspection to still use `defaultWeekSchedule` exactly as before.
- `npx tsc --noEmit` and `npx expo lint` both pass clean for the whole pass.

## Developer Tools: always-visible testing panel (August 19, 2026)

`app/settings.tsx`'s Development section was gated behind `{__DEV__ ? ... : null}`, which is why "Erase all local app data" disappeared from EAS/TestFlight builds (`__DEV__` is false there). That gate is now removed — Developer Tools is unconditionally rendered until the owner deliberately removes it before public release. (`app/profile.tsx`'s separate hidden long-press-Split debug menu, a different/more obscure entry point, was left as-is — out of scope for this pass, which was specifically about the Settings panel.)

- Traced the actual erase implementation first: `resetAllSprintLabLocalData()` (`utils/athlete-profile.ts`) already calls `AsyncStorage.clear()` — a full store wipe, not a per-key list — so it was already comprehensive (confirmed against a full inventory of every `sprintlab*` AsyncStorage key in the codebase). No change was needed there; only its visibility was gated.
- Consolidated testing controls into one always-visible `Card` in Settings: **Replay** (Replay onboarding, Replay SprintLab intro) and **Reset testing state** (Reset first-launch flags, Reset notification setup, Reset Coach test state), with **Erase all local app data** kept visually separated (a divider + its own red/destructive styling) at the bottom. The card's own border is now neutral (`palette.border`, not the old reddish `#54262A`) so only the erase button reads as dangerous.
- **Replay onboarding** reuses the exact existing `/profile?mode=edit` route (no duplicate onboarding implementation) — confirmed by source inspection that editing mode always starts at step 1 with the saved profile pre-loaded as answers, and its `finish()` only calls `saveAthleteProfile`, never touching plan/history/logs.
- **Reset first-launch flags** — new `resetOnboardingCompletionFlag()` (athlete-profile.ts, flips the saved profile's `onboardingComplete` back to `false` without touching any other field) + new `resetSprintLabIntroSeen()` (sprintlab-intro.ts). Does not itself navigate anywhere — the real mandatory-onboarding redirect (`app/_layout.tsx`) only fires on the next app launch, matching "reset the flags, then close/reopen to test."
- **Reset notification setup** — new `resetNotificationOptInDecision()` (notification-permission.ts) clears only SprintLab's own opt-in-decision flag; explicitly does not and cannot touch the real OS permission, which only the device's own Settings can reset.
- **Reset Coach test state** — new `resetCoachIntroSeen()` (coach-discovery.ts) + `clearDismissedCoachTriggerIds()` (storage.ts). Coach's conversation itself is never persisted (`components/coach-context.tsx` already starts empty every launch), so there was nothing to invent there — confirmed by an `AsyncStorage` grep across every coach-related file before deciding what this button actually does.
- Investigated and deliberately did **not** add a "Reset milestone/celebration state" control: `utils/milestones.ts` and the workout-completion celebration (`utils/streaks.ts`) hold no persisted "already seen" flag at all — every milestone/celebration is derived live from real completed-session/streak data on each computation, so there is no flag to reset; the achievement already "replays" naturally whenever the underlying real condition is met again.

## Coach: deployed API backend, fixing "Split couldn't reach SprintLab" in installed builds (August 19, 2026)

**Bug**: Coach worked in local dev but failed from an installed EAS build with a generic network error. **Root cause**: `components/coach-context.tsx` called `fetch('/api/coach', ...)` — a bare relative path. `app/api/coach+api.ts` is an Expo Router API route, a server-side handler that only ever runs under the Metro dev server (which serves `/api/*` over the same connection as the JS bundle) or a genuinely deployed server export — it was **never** bundled into the native EAS app binary, and no server had ever actually been deployed anywhere. In a standalone installed build with no Metro attached, the relative fetch had no origin to resolve against and failed client-side before any request left the device, landing in the generic `COACH_ERROR_COPY.network` catch.

**Fix implemented (not just diagnosed):**
- Ran `npx expo export -p web` (uses the existing `app.json` `web.output: "server"`) then `eas deploy --prod`, which deployed `app/api/coach+api.ts` as a real hosted server at `https://sprintlab.expo.app` (stable production alias; the CLI also produces a fresh per-deployment URL each time, but the app should always target the stable alias). Verified end-to-end with `curl` against `https://sprintlab.expo.app/api/coach` — confirmed a real Gemini round trip, not just a reachable route.
- Set `GEMINI_API_KEY` as an EAS **project environment variable** (`eas env:set production --name GEMINI_API_KEY --visibility sensitive`) so the deployed server has it at runtime — the key was already read correctly server-side (`process.env.GEMINI_API_KEY` in `coach+api.ts`) and is still never sent to or bundled into the client.
- Set `EXPO_PUBLIC_API_BASE_URL=https://sprintlab.expo.app` as an EAS environment variable for all three build environments (development/preview/production), so it gets inlined into the client bundle at `eas build` time.
- `components/coach-context.tsx` now builds its request URL as `` `${process.env.EXPO_PUBLIC_API_BASE_URL ?? ''}/api/coach` `` instead of a bare relative path. When the env var is unset (local `expo start`, where `.env.local` deliberately has no `EXPO_PUBLIC_API_BASE_URL`), this still resolves to the same relative `/api/coach` that already worked in dev. In an EAS build, it resolves to the deployed server's absolute URL.
- Added temporary `[Coach]`/`[coach api]` diagnostic `console` logging (client-side gated behind `__DEV__`, server-side unconditional since server logs are already environment-appropriate) distinguishing: request never reached a server (network/DNS failure), 429 rate limit, other non-2xx response, malformed/unparseable response body, missing `GEMINI_API_KEY` on the server, Gemini returning empty/unparseable output, and any other unhandled Gemini-call exception. These are intentionally temporary and can be stripped later.
- **Redeploying after future `app/api/coach+api.ts` changes** requires re-running `npx expo export -p web && npx eas deploy --prod` — this does not happen automatically on `eas build` or `git push`.
- `npx tsc --noEmit` and `npx expo lint` both pass clean.
- Verified in-browser: the panel renders unconditionally (no `__DEV__` check remains in the source), and each of the three reset buttons was fired against seeded flag values and confirmed via direct `localStorage` inspection to clear exactly its own key(s) while leaving the athlete's real saved plan/schedule data untouched. `npx tsc --noEmit` and `npx expo lint` pass clean.

## Deterministic plan-engine MVP corrections (August 21, 2026)

Preceded by a full audit (`PLAN_ENGINE_QA_REPORT.md`, `plan-engine-qa-results.json`, `scripts/audit-plan-engine.ts` — 390 onboarding-combination runs against the real `buildDeterministicWeeklyPlan()`) that found 3 Critical and 2 High issues in the deterministic plan selector. This pass fixed the ones explicitly scoped for an MVP (not a periodization system, not AI plan generation):

- **Priority messaging honesty**: onboarding/reveal copy (`utils/onboarding-copy.ts`'s `classificationExplanation()`) and the plan-build loading checklist (`components/plan-build-loading.tsx`) no longer claim improvement priorities shape the starting week — they're saved for Coach/future use, and the copy says so. The priority fields themselves (`speedGoals`, `raceDevelopmentAreas`) are unchanged and still fully persisted.
- **Phase periodization disabled for the MVP**: `utils/plan-selector.ts` now exports `MVP_GENERATION_PHASE = 'general-preparation'` — the single, doc-commented constant every workout-eligibility check and `buildWeeklyArchitecture()` call now uses, instead of the athlete's derived season phase. The three `no-match` early-returns keyed on `season.phase === 'needs-calendar'` are gone. A real derived season phase (or missing calendar) can no longer block or alter generation; `deriveSeasonPhase()` is still called and its result still feeds meet-proximity safety narrowing (`meetWindowAllowsWorkout`) and summary/warning copy. The phase-specific role functions in `utils/weekly-architecture.ts` (`specificPreparation`/`preCompetition`/`competition`/`taper`/`transition`) and `generalSpeedRoles`'s `inSeason` branch are untouched in source, just unreachable from this MVP path — ready for future phase-aware work.
- **200m/400m long-sprint routing fixed**: `utils/weekly-architecture.ts`'s `isLongSprint` (only ever `event === '400m'`) is renamed `isLongSprintPathwayEvent` and now covers `'200m' || '400m'`, matching `profilePathway()`'s existing `'long-sprint-200-400'` classification. 200m plans now select the same long-sprint-oriented records as 400m (e.g. `ACC-04`, `TEM-02`, and — depending on level/phase — `MAX-05`/`SED-05`) instead of silently reusing 100m's exact workout IDs.
- **Deterministic strength selection expanded, then corrected to remove equipment**: the hardcoded `STR-01`/`STR-02` day-index alternation is replaced by `strengthPreferenceOrder(level, purposeSlot)`. An initial version also used onboarding gym-equipment answers to gate STR-03 for no-equipment profiles — that was explicitly reverted the same day; **equipment availability does not, and must not, customize base-plan generation.** `data/workout-library.ts`'s equipment metadata and `AthleteProfile.weightRoomAccess`/`homeEquipment` are untouched and still fully stored; base generation just doesn't read them. The final design depends only on library level and `purposeSlot` (a 0-based ordinal of paired-strength occurrences so far this week — the MVP architecture always pairs strength exactly twice per week, first on the acceleration/force-purpose session, then on the maximum-velocity/explosive-purpose one, for every sport/event/day-count): foundation/developing get STR-01 (force)/STR-02 (explosive); trained/advanced get STR-04 (posterior-chain)/STR-05 (unilateral) as the primary, more specialized choice for each purpose, with STR-01/STR-02 and finally STR-03 kept as fallbacks. STR-03 remains an approved no-gym record and a legitimate future equipment-aware-alternatives target (not built in this pass) — it is never auto-selected from profile equipment.
- **Strength-distribution validation** (390-run audit, by `LibraryAthleteLevel`): foundation and developing plans select STR-01/STR-02 100% of the time (0% STR-04/05); trained and advanced plans select STR-04/STR-05 100% of the time (0% STR-01/02); STR-03 is never selected in the current matrix (it's a safety-net fallback with no scenario that currently forces it — expected, not a bug). This is a clean, deterministic level+purpose split, not an accidental skew; STR-04/05 are confirmed reachable (contradicting the original audit's Medium #5) without STR-01/02 becoming unreachable for the levels that should use them.
- **Verification**: `scripts/verify-plan-engine-audit-regressions.ts` asserts: no `no-match` from season phase across all 6 phases + missing calendar; correct day count; no duplicate IDs; no consecutive-high days; 200m ≠ 100m and can select long-sprint records; STR-04/STR-05 reachable for advanced; **a no-equipment profile and a fully-equipped profile produce the byte-identical plan**; priorities persist unchanged and remain inert to plan generation. Re-ran the full 390-combo audit: `no-match` count 19 → **0**; STR-04/05 now selected in 310/390 runs (was 0). Pre-existing `scripts/verify-plan-pathways.ts` had 5 assertions updated (hardcoded STR-01/02-only expectations for trained athletes broadened to include STR-04/05; the `inSeason` football test rewritten to assert a competition-phase override now produces the identical plan to general-preparation, proving phase periodization is truly inert). `npm run verify:planner`, `npx tsc --noEmit`, `npx expo lint` all pass clean.
- **Deliberately not changed** (per explicit MVP scope): non-football sports (soccer/basketball/baseball/general) still share one generic pathway — disclosed as intentional for the MVP, not fixed. `'unsupported-sport'` status remains dead code. `'softball'`/`'elite'` remain uncollectable via the onboarding UI (unrelated to plan generation). Equipment-aware workout alternatives ("Don't have this equipment?") are a possible future feature, not built now.
