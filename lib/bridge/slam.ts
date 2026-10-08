import { Hand, Suit } from "./types";
import { suitLength, supportPoints } from "./eval";

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

/**
 * Slam-exploration heuristics for the game-forcing families (Jacoby 2NT,
 * 2/1 Game Force, and a Bergen raise opener is strong enough to accept to
 * game). Real slam bidding is a judgment art; this file encodes a
 * simplified, explainable approximation suited to a trainer -- documented so
 * it's easy to retune later:
 *
 *  - "First-round control" of a suit = holding the ace, or being void.
 *  - Combined strength = each hand's own support points for the agreed
 *    trump suit (HCP + shortness in the OTHER suits), added together --
 *    the same metric the raise ladders elsewhere in this app already use.
 *  - 33+ combined support points is the classic "count to 33" guideline for
 *    a small slam to be worth bidding in a suit contract -- that's the
 *    threshold for treating the auction as "in the slam zone," i.e. worth
 *    going slow for. Actually LANDING in slam additionally requires the
 *    partnership to hold first-round control of at least 3 of the 4 suits
 *    (missing two key aces is a real reason to stop in game even with the
 *    high card strength for slam).
 *
 * This intentionally does NOT model a formal asking convention (Blackwood /
 * Roman Keycard) -- the partnership "goes slow" via a natural cue bid (or a
 * long/strong second suit) and the final contract is then placed directly
 * from combined strength + controls. That's the philosophy the user asked
 * for: don't rush to game when slam is worth a look, but you don't have to
 * reach it either. Grand slam is deferred to a later release (it needs a
 * 7-level row added to the bid-entry grid, which currently tops out at 6).
 */

export type SlamVerdict = "game" | "small_slam";

/** Does `hand` hold first-round control (the ace, or a void) of `suit`? */
export function hasFirstRoundControl(hand: Hand, suit: Suit): boolean {
  const cards = hand[suit];
  return cards.length === 0 || cards.includes("A");
}

/** How many of the 4 suits does the PARTNERSHIP hold first-round control of? */
export function combinedControls(a: Hand, b: Hand): number {
  return SUITS.filter((s) => hasFirstRoundControl(a, s) || hasFirstRoundControl(b, s)).length;
}

/** Combined support-point strength for the agreed trump suit. */
export function combinedStrength(a: Hand, b: Hand, trump: Suit): number {
  return supportPoints(a, trump, suitLength(a, trump)) + supportPoints(b, trump, suitLength(b, trump));
}

/** Is this pair's combined strength even worth a slow, exploratory auction? */
export function inSlamZone(a: Hand, b: Hand, trump: Suit): boolean {
  return combinedStrength(a, b, trump) >= 33;
}

/** Final placement once both hands (and therefore their controls) are known. */
export function judgeSlam(a: Hand, b: Hand, trump: Suit): SlamVerdict {
  if (inSlamZone(a, b, trump) && combinedControls(a, b) >= 3) return "small_slam";
  return "game";
}

/**
 * The cheapest side suit (not trump, not already shown) where `hand` holds
 * first-round control. Cue bids go up the line, cheapest first -- showing
 * controls in ascending order is what makes a bid a "cue bid" rather than a
 * natural suit bid.
 */
export function cheapestCueBid(hand: Hand, trump: Suit, alreadyShown: Suit[] = []): Suit | null {
  const RANK: Record<Suit, number> = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };
  const candidates = SUITS
    .filter((s) => s !== trump && !alreadyShown.includes(s) && hasFirstRoundControl(hand, s))
    .sort((x, y) => RANK[x] - RANK[y]);
  return candidates[0] ?? null;
}

/**
 * A natural "long and/or strong" second suit worth showing as a slam probe
 * when there's no cue bid available: 5+ cards, or a strong 4-card suit
 * headed by at least two of the top three honors (A/K/Q).
 */
export function longOrStrongSecondSuit(hand: Hand, trump: Suit, alreadyShown: Suit[] = []): Suit | null {
  const candidates = SUITS.filter((s) => s !== trump && !alreadyShown.includes(s));
  const qualifies = (s: Suit) => {
    const cards = hand[s];
    if (cards.length >= 5) return true;
    if (cards.length === 4) {
      const topHonors = (["A", "K", "Q"] as const).filter((h) => cards.includes(h)).length;
      return topHonors >= 2;
    }
    return false;
  };
  const good = candidates.filter(qualifies).sort((x, y) => hand[y].length - hand[x].length);
  return good[0] ?? null;
}
