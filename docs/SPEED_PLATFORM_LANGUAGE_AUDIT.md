# SprintLab speed-platform language audit

Completed during the multi-sport architecture pass.

## Make universal

- Product description, onboarding, empty states, training plans, workout/session labels, history, progress, and performance-result labels use **athlete**, **speed session**, **training plan**, and **performance result**.
- `AthleteProfile` adds sport, speed goals, training context, sport schedule constraints, and optional sport-specific profiles.
- Timing records support a test name, meters or yards, timing method, start type, direction pattern, surface, and notes.

## Keep track-specific

- Track events, personal bests, block-start experience, meet dates, championship dates, wind, track curve, race-model cues, sprint volume in meters, and meet preparation remain track-only metadata.
- Existing track categories and authored workout prescriptions are preserved unchanged.
- Track-only filters are labelled **Track event pathway** and **Track event** instead of being presented as universal filters.

## Broader data names

- `SpeedPathway` is the universal pathway layer. Existing short/long track pathways map to `track-short-sprint` and `track-long-sprint`.
- `PerformanceTest` is the universal equivalent of a best sprint time; it retains the selected unit and timing method.
- `TrainingContext` is the universal equivalent of a track season phase; the legacy `SeasonPhase` is retained for the track workout library.

## Backward compatibility

- No local records are deleted or renamed.
- A profile without `sport` migrates to `track-and-field`, preserves primary/secondary events and personal bests, and receives a nested `TrackProfile`.
- Legacy Workout Library records are given track sport metadata when read. Existing drafts, revisions, and custom records are retained.
- Existing planned workouts, completed sessions, compact logs, History records, and track timing fields remain readable.

## Deliberate scope boundary

The app has structure, labels, filters, storage migration, and timing support for multi-sport speed development. It does **not** add unreviewed football, soccer, basketball, or other sport-specific workout prescriptions or a sport-specific plan generator in this pass.
