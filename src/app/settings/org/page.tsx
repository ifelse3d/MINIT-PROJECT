import { redirect } from "next/navigation";

// The morning's four-page split put the organisation's settings here; the
// afternoon's violet redesign (§7.2) split them further. This route only
// ever existed for a few hours — the redirect catches any bookmark from
// that window.
export default function OrgSettingsRedirect() {
  redirect("/settings/general");
}
