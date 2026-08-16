# SprintLab TestFlight Release Checklist

SprintLab is ready for a small private beta after the owner completes the device checks below. The app remains a prototype: training data is stored only on the device, and deleting the app can remove it permanently.

## Before building

- Complete onboarding once as a track athlete and once as a general-speed or football athlete.
- Confirm a single selected sport skips the unnecessary main-focus question.
- Confirm multiple selected sports require a deliberate main focus.
- Confirm the first generated week says **Save this week**, not **Replace current week**.
- Run the profiles in `PLANNER_TEST_SCENARIOS.md` and review the selected workouts.
- Confirm trained track profiles receive authored strength work on high-output days.
- Confirm beginners receive a more conservative structure without an empty plan.
- Confirm practices, competitions, preferred rest days, and coach/log-only modes affect the week correctly.

## Workout and data checks

- Complete one planned workout and one unplanned workout.
- Confirm the first strength set can fill later sets while every set remains editable.
- Confirm History shows the completed workout after restarting the app.
- Confirm Progress updates completed sessions, actual sprint meters, timed reps, and milestones.
- Test green readiness, yellow warm-up reassessment, soreness 5/5, and a red pain response.
- Confirm maximal work cannot start when the readiness result restricts it.
- Confirm post-session recovery suggestions appear after finishing a workout.
- Confirm the reminder preview and custom time work on a physical iPhone.

## Interface checks

- Check onboarding and the main tabs in Dark, Light, and System appearance.
- Check an iPhone in portrait orientation and an iPad or wide browser window.
- Confirm Split's speech is readable in both themes.
- Confirm the onboarding counter stays on one line.
- Confirm inactive bottom-navigation labels remain readable.
- Confirm the feedback and research links open successfully.

## Destructive reset check

1. Create a profile, generated week, readiness entry, completed log, custom library change, and reminder.
2. Use **Erase all local app data** in Settings.
3. Confirm the app returns to mandatory onboarding.
4. Confirm the old plan, profile, logs, readiness, library edits, active workout, and reminders do not return.

## App Store Connect preparation

- Use the correct Apple Developer account and agreements.
- Create the app record with bundle identifier `com.joshacha.sprintlab`.
- Complete export-compliance answers; SprintLab currently declares no non-exempt encryption.
- Complete TestFlight beta-app information, including a concise testing description and contact details.
- Provide a privacy policy or beta privacy notice explaining local-only storage, notifications, feedback links, and deletion behavior.
- Set an appropriate age rating and avoid medical, injury-prevention, or guaranteed-performance claims.
- Add tester notes identifying the app as an early sprint and general-speed training prototype.

## Release gate

Do not upload or invite testers until:

- TypeScript, lint, planner verification, and the iOS production export pass.
- The owner completes the physical-device checks above.
- No release-blocking crash, empty-plan path, broken reset, or unreadable theme remains.
- The exact approved source is committed and pushed to GitHub.

