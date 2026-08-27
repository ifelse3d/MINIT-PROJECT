import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The layout kit /settings is built from.
//
// 2026-08-22, J looking at the shipped page: "SETTING 這裏就太亂了，也複雜。"
// That was right, and the reason is structural, not cosmetic:
//
//   * Every card carried a full explanatory PARAGRAPH, always open. With all
//     three languages switched on — which is how J actually runs it, and how a
//     mixed BM/Chinese/English committee will run it — each of those paragraphs
//     prints THREE TIMES. The tax-status warning alone was nine lines of red.
//   * So the page read as a wall of prose with a few controls hidden in it.
//     Somebody looking for "change my password" had to read four paragraphs
//     about receipts and s.44(6) to find out it was not there.
//
// The fix is not to delete the explanations — our users are beginners and the
// explanations are the reason the page is trustworthy. It is to make the page
// SCANNABLE first and readable second:
//
//   SettingsSection  a small heading + one card, so related settings sit
//                    together and the eye can skip a whole group.
//   SettingsRow      label on the left, control on the right, one line each.
//                    A person scanning for a control now sees only controls.
//   help=            the long paragraph, folded into "Apa ini? · 这是什么？",
//                    one tap away and never in the way.
//
// Trilingual note: because <Tri> joins the languages that are switched on, a
// SHORT label costs three short labels and a paragraph costs three paragraphs.
// Labels here are deliberately two or three words. Length is a design decision
// in this product, not a writing style.
// ---------------------------------------------------------------------------

export function SettingsSection({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="v2-glass divide-y divide-[color:var(--v2-border)] overflow-hidden rounded-md">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  label,
  /** Optional one-LINE clarification. Anything longer belongs in `help`. */
  sub,
  /** The long explanation, folded away. */
  help,
  children,
}: {
  label: React.ReactNode;
  sub?: React.ReactNode;
  help?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-[46%]">
        <p className="text-base font-semibold">{label}</p>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
        {help && <HelpNote>{help}</HelpNote>}
      </div>
      {children && <div className="min-w-0 sm:flex-1">{children}</div>}
    </div>
  );
}

/** A full-width row for controls that need the whole line (the size picker,
 *  the usage bar, the danger zone). Same padding, no label column. */
export function SettingsBlock({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 p-4">{children}</div>;
}

/** "What is this?" — the disclosure the long explanations live behind.
 *
 *  <details> and not a state hook on purpose: it works before hydration, it is
 *  keyboard- and screen-reader-native, and Ctrl+F finds text inside a closed
 *  one in Chrome. A person who cannot work a computer should not depend on our
 *  JavaScript to read an explanation. */
export function HelpNote({ children }: { children: React.ReactNode }) {
  return (
    <details className="group mt-1.5">
      <summary className="w-fit cursor-pointer list-none text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">
        <Tri bm="Apa ini?" zh="这是什么？" en="What is this?" />
      </summary>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
