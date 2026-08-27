import { redirect } from "next/navigation";

// §7.2 (violet redesign): /settings redirects to the most-visited,
// lowest-risk screen. The thirteen settings pages are directly linkable;
// this route exists so the rail's pinned entry and old bookmarks land well.
export default function SettingsIndex() {
  redirect("/settings/display");
}
