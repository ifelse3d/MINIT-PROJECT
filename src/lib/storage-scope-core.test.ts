import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adoptLegacyKey,
  clearMinitLocalData,
  scopedKey,
  setCurrentScope,
} from "./storage-scope-core";

// A minimal localStorage the storage-scope helpers can run against in the
// node test environment.
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    _map: map,
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  (globalThis as Record<string, unknown>).window = { localStorage: storage };
  setCurrentScope("user-1:7");
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  setCurrentScope("anon:none");
});

describe("scopedKey", () => {
  it("prefixes with minit: and the current user:org scope", () => {
    expect(scopedKey("money:donations:v1")).toBe(
      "minit:user-1:7:money:donations:v1",
    );
  });

  it("changes when the scope changes — two accounts never share a key", () => {
    const a = scopedKey("minutes:v1");
    setCurrentScope("user-2:7");
    const b = scopedKey("minutes:v1");
    expect(a).not.toBe(b);
  });
});

describe("adoptLegacyKey", () => {
  it("MOVES a pre-scoping blob: scoped key filled, legacy key gone", () => {
    storage.setItem("minit.events", '[{"id":"e1"}]');
    adoptLegacyKey("minit:user-1:7:events:v1", "minit.events");
    expect(storage.getItem("minit:user-1:7:events:v1")).toBe('[{"id":"e1"}]');
    // The global copy must stop existing, or the NEXT account reads it too.
    expect(storage.getItem("minit.events")).toBeNull();
  });

  it("never overwrites data already under the scoped key", () => {
    storage.setItem("minit:user-1:7:events:v1", '["scoped"]');
    storage.setItem("minit.events", '["legacy"]');
    adoptLegacyKey("minit:user-1:7:events:v1", "minit.events");
    expect(storage.getItem("minit:user-1:7:events:v1")).toBe('["scoped"]');
  });

  it("does nothing when there is no legacy blob", () => {
    adoptLegacyKey("minit:user-1:7:events:v1", "minit.events");
    expect(storage.getItem("minit:user-1:7:events:v1")).toBeNull();
  });
});

describe("clearMinitLocalData", () => {
  it("removes every scope's records and the legacy data keys, keeps device preferences", () => {
    storage.setItem("minit:user-1:7:money:donations:v1", "[]"); // this account
    storage.setItem("minit:user-2:9:minutes:v1", "{}"); // ANOTHER account
    storage.setItem("minit.minutes.v1", "{}"); // pre-scoping data
    storage.setItem("minit.textSize.v1", "lg"); // device preference
    storage.setItem("minit.theme.v1", "dark"); // device preference
    storage.setItem("unrelated", "x");

    clearMinitLocalData();

    expect(storage.getItem("minit:user-1:7:money:donations:v1")).toBeNull();
    expect(storage.getItem("minit:user-2:9:minutes:v1")).toBeNull();
    expect(storage.getItem("minit.minutes.v1")).toBeNull();
    expect(storage.getItem("minit.textSize.v1")).toBe("lg");
    expect(storage.getItem("minit.theme.v1")).toBe("dark");
    expect(storage.getItem("unrelated")).toBe("x");
  });
});
