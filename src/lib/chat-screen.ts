// ---------------------------------------------------------------------------
// WHICH ROUTES ARE A CHAT SCREEN (work order 109 §1, J: 「爲什麽不是放在
// 下面，像 CLAUDE 或者 GPT 這樣」).
//
// Almost every page in this app is a DOCUMENT: it starts at the top, it is as
// long as its content, and the window scrolls it. The home page is not one of
// those. It is a conversation, and a conversation has a floor — the typing box
// sits at the bottom of the SCREEN and stays there while the talk above it
// grows and scrolls on its own.
//
// Those two shapes need different height plumbing (`min-h-screen` + document
// scroll vs. a fixed-height flex column that owns its own scrolling pane), so
// the shell has to know which one it is drawing. That decision is one line of
// logic and it is HERE, not inside the shell's JSX, because it is the kind of
// line that gets copied into a second place and then disagrees with itself —
// and because "is / is not the chat screen" is exactly the sort of thing a
// unit test can hold still while the layout around it changes.
//
// 🔴 Sub-routes are deliberately NOT included. `/minutes` is a workspace with
// a step rail; giving it a pinned composer would cut its document in half.
// ---------------------------------------------------------------------------

/**
 * True when this path renders as a full-height chat screen: the conversation
 * scrolls inside its own pane and the composer is pinned to the bottom of the
 * window. Today that is the home page and nothing else.
 */
export function isChatScreenRoute(pathname: string | null | undefined): boolean {
  return pathname === "/";
}
