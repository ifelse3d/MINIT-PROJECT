import { describe, expect, it } from "vitest";
import { isChatScreenRoute } from "./chat-screen";

// §1 (work order 109). The shell draws two different shapes of page off this
// one answer — a document the window scrolls, or a conversation with a pinned
// floor — so the interesting cases are the ones that LOOK like home.
describe("isChatScreenRoute", () => {
  it("the home page is the chat screen", () => {
    expect(isChatScreenRoute("/")).toBe(true);
  });

  it("nothing else is", () => {
    for (const path of [
      "/minutes",
      "/minutes/document",
      "/money",
      "/money/receipts",
      "/settings",
      "/settings/plan",
      "/orgs/new",
      "/calendar",
      "/login",
    ]) {
      expect(isChatScreenRoute(path)).toBe(false);
    }
  });

  it("a route that merely starts with a slash is not home", () => {
    // The obvious wrong implementation is `pathname.startsWith("/")`, which
    // would give every page in the app a pinned composer and cut its content
    // off at one viewport.
    expect(isChatScreenRoute("/inbox")).toBe(false);
    expect(isChatScreenRoute("//")).toBe(false);
  });

  it("survives an unknown pathname without deciding it is home", () => {
    // usePathname() is typed `string | null`, and null happens during the
    // first render of some Next versions. Falling back to "the chat screen"
    // there would flash a one-viewport layout on a document page.
    expect(isChatScreenRoute(null)).toBe(false);
    expect(isChatScreenRoute(undefined)).toBe(false);
    expect(isChatScreenRoute("")).toBe(false);
  });

  it("ignores query strings and hashes, which usePathname never includes", () => {
    // Documenting the contract rather than adding parsing: if a caller ever
    // hands this a full URL, it answers "not the chat screen" instead of
    // guessing — a wrong `true` breaks the page, a wrong `false` is the
    // layout every other route already uses.
    expect(isChatScreenRoute("/?welcome=1")).toBe(false);
  });
});
