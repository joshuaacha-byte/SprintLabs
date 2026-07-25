# SprintLab Project Context and Handoff

Last updated: July 25, 2026

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

### Workout Library foundation (started July 24)

- A separate typed Workout Library contract now distinguishes its sprint taxonomy from the prototype's older weekly-plan model: all ten library categories, approval states, event pathways/tags, athlete levels, phases, surfaces, intensity/recovery prescriptions, five structured sections, calculated volume metrics, safety/source notes, progression family, and lifecycle timestamps
- The local `sprintlab.workouts.v1` repository persists schema/seed versions. Seed version 2 replaces only the old generated placeholder records with authored content; seed version 3 adds sport metadata while preserving revisions, drafts, and user-created workouts
- The author-supplied starter inventory is represented with its exact catalog metadata split: 38 approved, 4 draft, and 2 archived records
- The Library tab supports search plus category, approval status, athlete-level, phase, pathway, event, surface, equipment, duration, and sort controls; default status is Approved
- Library detail shows compatibility, metrics, all section containers, guidance, safety, sources, lifecycle status, duplicate-as-draft, archive, and restore-to-draft controls
- Approved records cannot be silently changed; copying creates a Draft and archiving retains the record while immediately removing it from future recommendation eligibility
- Approval validation re-computes sprint and high-intensity volume from section items, rejects missing required information, blocks assisted/downhill and advanced drop-jump approval, and checks special-endurance restrictions
- All 44 records now contain their authored warm-up, sprint work, plyometrics, strength, cooldown, intensity, recovery, cues, modifications, safety, and source guidance. Approved-record sprint and fast-zone volumes reconcile from the structured sections; the four Draft and two Archived records intentionally preserve their document status/TBD or archived state.
- Do not yet add a Use Workout action or selector: that comes after athlete onboarding and the deterministic eligibility/ranking rules are implemented.

### Speed-platform architecture pass (July 24)

- The product now uses **athlete** and **speed session** as universal language; track-specific language remains only where a workout or profile is actually track-specific
- `AthleteProfile` gained backward-compatible sport, speed goals, competition level, training context, schedule-constraint, access, and optional Track/Football/Soccer/Basketball/Baseball-Softball/General-Speed profiles
- Old local AthleteProfile records migrate to `track-and-field`, retain their events and personal bests, and receive a TrackProfile; no stored records are intentionally deleted or renamed
- `SpeedPathway`, universal performance-test/timing metadata, expanded workout-category values, sport-aware workout metadata, and `ClassificationResult` are available for the later deterministic selector
- Workout Library filtering now includes sport, speed goal, speed pathway, and training context. Existing authored library records are safely tagged as track records when read; no unreviewed non-track prescriptions were added
- The new local Athlete Profile route lets an athlete select sport, up to three speed goals, background, a sport-appropriate top test, and training context. It is an initial setup surface, not a plan generator
- The Athlete Profile route now contains Split’s 14-screen conversational onboarding: welcome; name; sport; speed goals; sport-specific baseline; experience; realistic frequency; existing demands; environment; equipment; limitations; app mode; profile reveal; and a press-and-hold commitment. It auto-saves an incomplete draft locally and resumes after the app closes. Saving the completed profile clears only the draft, never a plan, workout, log, or History record
- Split is a local original stopwatch-guide asset with deterministic dialogue (not a live AI). The dialogue responds to sport, access, experience, coach-plan use, and team-practice load. The onboarding deliberately uses Welcome, Listening, Focused, Calm, and Celebration pose variants at relevant steps.
- Existing local profiles migrate without deletion. They receive safe defaults for `onboardingComplete`, training demands, limitations, and turf access. A local profile with incomplete onboarding opens the profile flow; completed profiles continue directly to the existing tabs.
- The onboarding uses Expo-compatible React Native animations only. No accounts, APIs, payments, subscriptions, or workout generation were added.
- See `docs/SPEED_PLATFORM_LANGUAGE_AUDIT.md` for the full language/data compatibility audit

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
- Numeric sleep input (0–24, including halves)
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
- Split does not mention missing track access until after the environment step has been answered.
- Sport profile fields now favor familiar optional benchmarks: football 40-yard/vertical/5-10-5, basketball vertical/three-quarter court/lane agility, baseball-softball home-to-first/60-yard, volleyball jumps, and soccer position plus an optional known team test. General athletes see an explicitly optional, guided custom-test form.
- The Today avatar uses the saved first initial rather than a hard-coded placeholder.
- The readiness and final-review scales explain both ends of their ranges. Sleep accepts only realistic decimal hours from 0–24.
- The final review no longer asks for body weight every session. Existing historical records remain readable.
- Track rep timing says it is optional; marking a rep Done is enough. Adding work names the relevant section and offers section-specific suggestions or a custom entry.
- Seed speed workouts now expose meaningful target intensity ranges in their session details and structured tracking values.
- Profile & Settings contains a development-only, confirmation-gated **Erase all local app data** action for testing. It removes only AsyncStorage keys beginning with `sprintlab.`: local profile/draft, plans, active/completed sessions, history, progress summaries, library edits, and logs.
- Archive and restore explain their lifecycle behavior; archiving removes an item from normal selection, while restoring returns it as a Draft requiring review.

### Deterministic track plan selector and Settings pass (July 25)

- The Today avatar now opens a real **Profile & Settings** screen rather than restarting onboarding. It summarizes the saved athlete profile, links to profile editing, Library, and plan preview, and keeps the confirmation-gated full local-data reset in a clearly labeled development section.
- The onboarding **Current training demands** multi-select now toggles correctly: tapping a selected item removes it, while `None` remains mutually exclusive with the other demands.
- A track-first deterministic selector now combines the athlete's primary sport, event, goals, experience, available days, session duration, season phase, surfaces, and equipment with the local Workout Library.
- The selector only considers existing recommendation-eligible **Approved** records. Draft and Archived records are never used, and the selector returns a transparent no-match state instead of fabricating a workout.
- Coach-created-plan and logging-only modes remain protected: the selector explains that the current plan stays in control and does not overwrite it.
- Multi-sport profiles remain supported, but automatic planning intentionally requires Track & field as the current primary focus until another sport pathway has a reviewed workout library.
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

## Key files

- `app/(tabs)/index.tsx` — pre-workout Today dashboard
- `app/(tabs)/plan.tsx` — editable recurring weekly schedule
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
- `utils/plan-selector.ts` — track-first hard gates, deterministic ranking, alternatives, explanations, and Library-to-Plan conversion
- `utils/training-history.ts` — History filtering, labels, soreness/key-sprint summaries, and duplicate-plan conversion
- `utils/domain-adapters.ts` — converts prototype plans and completed sessions into full structured domain records
- `utils/progress.ts` — date-safe weekly adherence, streak, sprint-series, recovery-trend, and recent-session aggregation
- `utils/workout-session.ts` — plan normalization, snapshot creation, actual-result initialization, status derivation, and coverage helpers
- `utils/athlete-profile.ts` — local athlete-profile persistence, old-track-profile migration, sport defaults, and speed-pathway mapping
- `utils/sport-copy.ts` — reusable sport-aware product, competition, pathway, and performance labels
- `app/profile.tsx` — local multi-sport athlete-profile setup
- `components/split-moment.tsx` — compact reusable Split guidance/celebration moment
- `docs/SPEED_PLATFORM_LANGUAGE_AUDIT.md` — universal-versus-track language audit and migration notes

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

### iPhone cannot reach Metro over LAN

Expo Go repeatedly failed to reach the Mac development server over normal Wi-Fi and the iPhone Personal Hotspot. Safari on the iPhone also could not reach the Metro URL. The macOS firewall was reportedly off, and Expo Go local-network permission was enabled.

Tunnel mode is also unusable at present:

```text
CommandError: ngrok tunnel took too long to connect.
```

`@expo/ngrok` was installed successfully, so the remaining tunnel failure is connectivity rather than a missing tunnel package.

Until this is diagnosed, use the web build on the Mac. Do not confuse `npx expo start --web` with a phone-compatible Metro session. Expo Go cannot connect to the web-only session.

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

1. On the iPhone, test Thursday/Friday/another current day against Plan, then test Readiness → Start → extra rep/set/exercise → Review → Save → History/Progress and restart the app to confirm persistence.
2. Use the prototype during a real workout and record friction or missing information.
3. Test Profile & Settings, edit-profile return behavior, and the full local-data reset on a throwaway device/browser state.
4. Review and save one deterministic track week, then confirm Today follows the correct saved weekday and the plan remains editable afterward.
5. Add dated meet-window logic and recent completed-session/high-CNS history to the selector before calling it adaptive; the current selector builds a recurring profile-based week and does not yet rewrite it from readiness or recent logs.
6. Add lightweight capture controls for surface, starting method, footwear, weather, and numeric pain severity instead of leaving those fields unknown.
7. Add reusable user-authored workout templates. Training History already includes date-specific duplicate-session actions.
8. After several real sessions exist, review whether the Progress series and recovery trends answer useful training questions without extra logging burden.
9. Add Supabase only after the personal workflow is proven.

## Instructions for the next Codex session

1. Read `AGENTS.md` and this entire file before changing code.
2. Inspect the current worktree; do not rely only on this summary.
3. Preserve the narrow sprinter-first scope and rule-based planning decision.
4. Do not introduce Supabase, AI, payments, or native-only modules without an explicit product reason and user approval.
5. Keep changes small enough to test and run TypeScript checks afterward.
6. Do not overwrite unrelated or user-created changes.
7. Update this handoff when a meaningful feature, decision, dependency, command, or known issue changes.
