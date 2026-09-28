import { Hand, Suit } from "./types";

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

/**
 * Defensive invariant check for every dealt opener/responder pair.
 *
 * dealTwoHands() in each convention module draws both hands from a single
 * shuffled 52-card deck (deck.slice(0,13) / deck.slice(13,26)), which makes a
 * duplicate card mathematically impossible as long as that code stays
 * correct. This function is the safety net for "stays correct": it re-checks
 * the actual dealt hands every time and throws loudly the moment any of
 * these ever fires, so a future edit that breaks the single-shared-deck
 * invariant (e.g. generating each hand from its own independent shuffle) is
 * caught immediately during development/testing, not discovered later by a
 * user spotting a duplicate card on screen.
 *
 * Checks: each hand has exactly 13 cards; no suit's combined card count
 * between the two hands exceeds 13; and no single (suit, rank) card is held
 * by both hands, or twice within one hand.
 */
export function assertValidPair(a: Hand, b: Hand, context: string): void {
  const aCount = SUITS.reduce((sum, s) => sum + a[s].length, 0);
  const bCount = SUITS.reduce((sum, s) => sum + b[s].length, 0);
  if (aCount !== 13) {
    throw new Error(`[dealValidate:${context}] hand A has ${aCount} cards, expected 13`);
  }
  if (bCount !== 13) {
    throw new Error(`[dealValidate:${context}] hand B has ${bCount} cards, expected 13`);
  }
  for (const s of SUITS) {
    const seen = new Set<string>();
    for (const r of a[s]) {
      if (seen.has(r)) {
        throw new Error(`[dealValidate:${context}] hand A holds the ${r} of ${s} more than once`);
      }
      seen.add(r);
    }
    for (const r of b[s]) {
      if (seen.has(r)) {
        throw new Error(`[dealValidate:${context}] both hands hold the ${r} of ${s}`);
      }
      seen.add(r);
    }
    if (seen.size > 13) {
      throw new Error(`[dealValidate:${context}] suit ${s} has ${seen.size} cards dealt between the two hands, more than a full suit`);
    }
  }
}
