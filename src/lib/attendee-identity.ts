// ---------------------------------------------------------------------------
// WHO IS THIS ATTENDEE? — the one identity rule (I4, work order 81).
//
// B-6 (work order 51) made name+note the identity of a ROSTER row: two people
// who share a name are told apart by the society's own note（大）（小）. The
// attendance list kept merging on the bare name — ticking 「Ali (青年組)」
// also ticked 「Ali (婦女組)」, and once one was added the other showed
// "already added". This key makes every place that compares attendees agree
// with the roster's rule.
//
// JSON.stringify, not string concatenation: a separator character can appear
// inside a name, and a collision here silently merges two real people.
// An absent note and an empty note are the SAME person — old data (attendees
// saved before notes existed) must keep matching itself.
// ---------------------------------------------------------------------------

export function attendeeIdentityKey(name: string, note?: string | null): string {
  return JSON.stringify([
    name.trim().toLowerCase(),
    (note ?? "").trim().toLowerCase(),
  ]);
}
