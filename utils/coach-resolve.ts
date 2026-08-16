import type { PlanChangeProposal } from '@/types';
import { getScheduledDayForDate } from '@/utils/storage';
import { getLibraryWorkout } from '@/utils/workout-library';
import { describeProposal, type ProposalDisplay } from '@/utils/coach';

// SprintLab Coach UI Phase C-2: the AsyncStorage-backed half of proposal display resolution,
// kept separate from utils/coach.ts's pure describeProposal() so that pure logic stays testable
// under plain Node (see scripts/verify-coach-proposal.ts) without pulling in React Native's
// AsyncStorage module, which utils/storage.ts requires.

/** Resolves the workout titles a proposal references against live storage/library so the card can show real names instead of bare ids. Read-only — never mutates anything. */
export async function resolveProposalDisplay(proposal: PlanChangeProposal): Promise<ProposalDisplay> {
  const day = await getScheduledDayForDate(proposal.date);
  const currentTitle = day.kind === 'workout' ? day.workout?.title : undefined;
  let newTitle: string | undefined;
  if (proposal.newWorkoutId) {
    const libraryWorkout = await getLibraryWorkout(proposal.newWorkoutId);
    newTitle = libraryWorkout?.name;
  }
  return describeProposal(proposal, { currentTitle, newTitle });
}
