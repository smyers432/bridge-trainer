import { Hand, Rank, Suit } from "./types";

/**
 * Canonical support-point distribution table (Bidding System Rulebook v1 §2).
 * Counted only in side suits when raising partner; never in the trump suit.
 */
export const DIST = {
  support_4plus_trump: { void: 5, singleton: 3, doubleton: 1 },
  support_exactly_3_trump: { void: 3, singleton: 2, doubleton: 1 },
} as const;

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export function rankHcp(rank: Rank): number {
  switch (rank) {
    case "A": return 4;
    case "K": return 3;
    case "Q": return 2;
    case "J": return 1;
    default: return 0;
  }
}

export function handHcp(hand: Hand): number {
  return SUITS.flatMap((s) => hand[s]).reduce((sum, r) => sum + rankHcp(r), 0);
}

export function suitLength(hand: Hand, suit: Suit): number {
  return hand[suit].length;
}

/**
 * Classic "long suit" length points: 1 point for every card beyond the 4th,
 * in EVERY suit (summed, not just the longest) — a 5-card suit is +1, a
 * 6-card suit +2, a 7-card suit +3, etc.
 *
 * Per classic point-count theory this is a PRE-FIT evaluation tool only:
 *  - Use it for your own hand's general suit-contract strength before any
 *    trump fit is known — e.g. deciding whether to open, or evaluating a
 *    natural (non-raise) response or rebid.
 *  - Never use it for notrump hands (1NT/2NT and their responses run on HCP
 *    alone — there's no trump suit to ruff long cards through).
 *  - Never use it once a trump fit is agreed — at that point you switch to
 *    support points (shortness in your OTHER suits, see
 *    distributionPointsForSupport below) instead. Counting both length and
 *    support points on the same hand double-counts the same distributional
 *    strength.
 */
export function lengthPoints(hand: Hand): number {
  return SUITS.reduce((sum, s) => sum + Math.max(0, hand[s].length - 4), 0);
}

export function countShortages(
  hand: Hand,
  excludeSuit?: Suit
): { voids: number; singletons: number; doubletons: number } {
  let voids = 0, singletons = 0, doubletons = 0;
  for (const s of SUITS) {
    if (excludeSuit && s === excludeSuit) continue;
    const len = hand[s].length;
    if (len === 0) voids++;
    else if (len === 1) singletons++;
    else if (len === 2) doubletons++;
  }
  return { voids, singletons, doubletons };
}

export function distributionPointsForSupport(
  hand: Hand,
  trumpSuit: Suit,
  trumpCount: number
): number {
  const table =
    trumpCount >= 4 ? DIST.support_4plus_trump
    : trumpCount === 3 ? DIST.support_exactly_3_trump
    : null;
  if (!table) return 0;
  const { voids, singletons, doubletons } = countShortages(hand, trumpSuit);
  return voids * table.void + singletons * table.singleton + doubletons * table.doubleton;
}

/** HCP + distribution points for a given trump fit (the raise-strength metric). */
export function supportPoints(hand: Hand, trumpSuit: Suit, trumpCount: number): number {
  return handHcp(hand) + distributionPointsForSupport(hand, trumpSuit, trumpCount);
}

/**
 * Losing Trick Count (per the Help Suit Game Try convention doc):
 *   3+ cards: 3 losers minus the number of A/K/Q held in the suit.
 *   exactly 2 cards: 2 losers minus the number of A/K held (Q doesn't count for a doubleton).
 *   singleton: the Ace = 0 losers, anything else = 1 loser.
 *   void: 0 losers.
 * Counted the same way in every suit, including the trump suit.
 */
export function suitLosers(hand: Hand, suit: Suit): number {
  const cards = hand[suit];
  const len = cards.length;
  if (len === 0) return 0;
  const hasA = cards.includes("A"), hasK = cards.includes("K"), hasQ = cards.includes("Q");
  if (len === 1) return hasA ? 0 : 1;
  if (len === 2) return 2 - (Number(hasA) + Number(hasK));
  return 3 - (Number(hasA) + Number(hasK) + Number(hasQ));
}

export function handLosers(hand: Hand): number {
  return SUITS.reduce((sum, s) => sum + suitLosers(hand, s), 0);
}
