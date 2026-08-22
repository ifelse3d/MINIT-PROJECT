import { NotesReview } from "./notes-review";

// Steps 1-2 of the /minutes flow: read the photo, check what Minit read.
// Who attended lives on /minutes/attendance — see notes-review.tsx for why.
export default function MinutesPage() {
  return <NotesReview />;
}
