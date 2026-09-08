import { MALAYSIAN_STATES } from "@/lib/eroses-committee";

// ---------------------------------------------------------------------------
// 130 §11 (101 §8 / 119 A-9): WHICH STATE IS THIS ADDRESS IN — by code.
//
// The add-to-roster card pre-fills what the notes carried for a new office
// bearer (IC number, address, occupation). eROSES also wants the Negeri, and
// a Malaysian address usually says it twice: a five-digit postcode (whose
// first two digits name the state) and, most of the time, the state's name.
// Both are looked up here — pure, tested, never the AI — so the person only
// has to say "yes".
//
// Postcode ranges follow Pos Malaysia's allocation. A postcode that is not
// five digits, or that falls in a gap, gives null; the state name in the
// text is tried first because it is the stronger signal (a postcode can be
// misread from handwriting, a spelled-out "Selangor" seldom is).
//
// 寧缺勿濫: null means "ask the person", never a guess.
// ---------------------------------------------------------------------------

export type MalaysianState = (typeof MALAYSIAN_STATES)[number];

/** The ways people write each state — lowercase, no punctuation. */
const STATE_ALIASES: ReadonlyArray<[MalaysianState, string[]]> = [
  ["Johor", ["johor", "johor darul takzim", "johor darul ta'zim"]],
  ["Kedah", ["kedah", "kedah darul aman"]],
  ["Kelantan", ["kelantan", "kelantan darul naim"]],
  ["Melaka", ["melaka", "malacca"]],
  ["Negeri Sembilan", ["negeri sembilan", "n sembilan", "n. sembilan", "n.sembilan"]],
  ["Pahang", ["pahang", "pahang darul makmur"]],
  ["Perak", ["perak", "perak darul ridzuan"]],
  ["Perlis", ["perlis"]],
  ["Pulau Pinang", ["pulau pinang", "penang", "p pinang", "p. pinang", "p.pinang"]],
  ["Sabah", ["sabah"]],
  ["Sarawak", ["sarawak"]],
  ["Selangor", ["selangor", "selangor darul ehsan"]],
  ["Terengganu", ["terengganu", "terengganu darul iman"]],
  ["WP Kuala Lumpur", ["kuala lumpur", "wp kuala lumpur", "w.p. kuala lumpur", "wilayah persekutuan kuala lumpur", "kl"]],
  ["WP Labuan", ["labuan", "wp labuan", "w.p. labuan", "wilayah persekutuan labuan"]],
  ["WP Putrajaya", ["putrajaya", "wp putrajaya", "w.p. putrajaya", "wilayah persekutuan putrajaya"]],
];

/** Pos Malaysia's postcode allocation, by the first two digits. */
const POSTCODE_STATE: ReadonlyArray<[number, number, MalaysianState]> = [
  [1, 2, "Perlis"],
  [5, 9, "Kedah"],
  [10, 14, "Pulau Pinang"],
  [15, 18, "Kelantan"],
  [20, 24, "Terengganu"],
  [25, 28, "Pahang"],
  [39, 39, "Pahang"], // Cameron Highlands
  [49, 49, "Pahang"], // Genting Highlands
  [69, 69, "Pahang"], // Bukit Fraser
  [30, 36, "Perak"],
  [40, 48, "Selangor"],
  [63, 64, "Selangor"],
  [68, 68, "Selangor"],
  [50, 60, "WP Kuala Lumpur"],
  [62, 62, "WP Putrajaya"],
  [70, 73, "Negeri Sembilan"],
  [75, 78, "Melaka"],
  [79, 86, "Johor"],
  [87, 87, "WP Labuan"],
  [88, 91, "Sabah"],
  [93, 98, "Sarawak"],
];

function normalise(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[，、,;；/\\()（）\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** The state named in the text, if any of its spellings appears as a whole word/phrase. */
export function stateNamedIn(address: string): MalaysianState | null {
  const hay = normalise(address);
  // Longest alias first so "negeri sembilan" is not beaten by a shorter one
  // and "kuala lumpur" wins over a lone "kl" typed elsewhere.
  const candidates = STATE_ALIASES.flatMap(([state, aliases]) =>
    aliases.map((a) => ({ state, alias: normalise(a).trim() })),
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const { state, alias } of candidates) {
    if (alias === "kl") {
      // Two letters: only as its own word, never inside a longer one.
      if (/ kl /.test(hay)) return state;
      continue;
    }
    if (hay.includes(` ${alias} `)) return state;
  }
  return null;
}

/** The state a five-digit Malaysian postcode belongs to, or null. */
export function stateFromPostcode(address: string): MalaysianState | null {
  const m = /(?:^|\D)(\d{5})(?!\d)/.exec(address);
  if (!m) return null;
  const prefix = Number(m[1].slice(0, 2));
  for (const [lo, hi, state] of POSTCODE_STATE) {
    if (prefix >= lo && prefix <= hi) return state;
  }
  return null;
}

/**
 * The Negeri for an address: the state it names, else the state its
 * postcode belongs to, else null (ask the person). Empty input → null.
 */
export function stateFromAddress(address: string | null | undefined): MalaysianState | null {
  if (!address || address.trim() === "") return null;
  return stateNamedIn(address) ?? stateFromPostcode(address);
}
