import { redirect } from "next/navigation";

// §3.2 (violet redesign): the glossary lives at /settings/glossary now —
// "Our words" is a settings screen, and one route means one nav entry.
// This permanent-feeling redirect keeps every existing link working.
export default function GlossaryRedirect() {
  redirect("/settings/glossary");
}
