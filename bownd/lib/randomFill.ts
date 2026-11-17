// bownd/lib/randomFill.ts
// Random fill for event rails (owner ruling, Mark 2026-11-15
// 20:17): "The home menu should be randomized to have it full
// until we begin to fill it up. Nothing should be empty if no
// data random fill within category parameters" — and, minutes
// later, the standing form: "Nothing should be empty ever."
//
// Every filled rail is composed in this order:
//   (a) the section's own rule-based picks, in rule order —
//       never trimmed, never displaced;
//   (b) RANDOM picks from the section's parameter tiers, in
//       tier order. Each tier is a parameter set the section
//       defines (its category/tag match first, then the
//       widenings of it the section declares);
//   (c) if the catalog genuinely lacks enough in-parameter
//       events, the rail stays short — fill NEVER fabricates
//       an event, a venue, or a time that does not exist.
// As real programming arrives (venue-submitted and featured
// content becomes the rule-based picks), it displaces the
// randomness on its own: picks always lead the rail.
//
// The shuffle is seeded by a fingerprint of the catalog itself,
// so a given catalog always produces the same fill — computed
// once per catalog change (callers memoize on the catalog),
// never reshuffled on re-render. When the catalog changes,
// the fill may change with it.
//
// Within a section an event NEVER repeats. Across sections on
// the same screen, repeats are avoided while the catalog
// allows: callers pass one shared `used` set — typically
// pre-seeded with every section's rule picks, so a fill never
// steals a pick another section earned — sections fill in
// render order, and a section may reuse an event another
// section already shows only after every unused in-parameter
// event has been offered to it.

/** FNV-1a 32-bit — tiny stable string hash for shuffle seeds. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG (same seed, same stream). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Order-independent fingerprint of a catalog: the sorted event
 * ids, hashed. Same catalog contents → same fingerprint, on
 * every load, regardless of fetch order.
 */
export function catalogFingerprint(items: ReadonlyArray<{ id: string }>): string {
  const ids = items.map((e) => e.id).sort();
  return `${items.length}:${fnv1a32(ids.join("|")).toString(36)}`;
}

/** Fisher-Yates shuffle driven by a seed key — deterministic. */
export function stableShuffle<T>(items: readonly T[], seedKey: string): T[] {
  const rand = mulberry32(fnv1a32(seedKey));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Fill one rail: `picks` first (deduped, rule order, never
 * trimmed — a section whose rules overfill keeps them all),
 * then random picks from `tiers` in tier order until the rail
 * reaches `target` or the tiers run dry.
 *
 * Parameter fit outranks freshness: a tier is exhausted —
 * first its events not already shown elsewhere on the screen
 * (the shared `used` set), then, only if the tier still cannot
 * complete the rail, its already-shown events — before the
 * next, wider tier is touched. A cross-section repeat
 * therefore happens only when the catalog forces it: either
 * the section's own parameters ran dry, or no unused event
 * remains at all. Every id in the returned rail is added to
 * `used`.
 */
export function fillRail<T extends { id: string }>(
  picks: readonly T[],
  tiers: ReadonlyArray<readonly T[]>,
  target: number,
  seedKey: string,
  used?: Set<string>,
): T[] {
  const result: T[] = [];
  const inResult = new Set<string>();
  for (const p of picks) {
    if (inResult.has(p.id)) continue;
    inResult.add(p.id);
    result.push(p);
  }
  for (let t = 0; t < tiers.length && result.length < target; t++) {
    for (const avoidUsed of [true, false]) {
      if (result.length >= target) break;
      const candidates = tiers[t].filter(
        (e) => !inResult.has(e.id) && !(avoidUsed && used !== undefined && used.has(e.id)),
      );
      for (const e of stableShuffle(candidates, `${seedKey}|tier${t}`)) {
        if (result.length >= target) break;
        inResult.add(e.id);
        result.push(e);
      }
    }
  }
  if (used) {
    for (const e of result) used.add(e.id);
  }
  return result;
}
