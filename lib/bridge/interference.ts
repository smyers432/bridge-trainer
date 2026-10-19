import { Hand, Opening, Recommendation, Suit } from "./types";
import { handHcp, lengthPoints, suitLength } from "./eval";
import { bidRank } from "./grade";
import { recommendResponder } from "./recommend";

/* =============================================================================
   Competitive bidding (V6): a single scripted opponent call injected right
   after Opener's 1H/1S opening, before Responder's first call. No opponent
   hand is dealt -- per the user's explicit instruction, this just scripts a
   LEGAL call that forces a real decision, nothing more. Scope (confirmed):
   Responder only, 1H/1S openings only, overcalls and takeout doubles only,
   one interference point only (not over Responder's call, not in later
   rounds). Opener's rebid-in-competition is a later release.
   ============================================================================= */

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const DEN: Record<Suit, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };

export type InterventionMode = "none" | "with" | "mixed";
export type InterferenceKind = "overcall" | "double";

export type Interference = {
  kind: InterferenceKind;
  bid: string;       // "X" for a takeout double, else a suit-bid string ("1S", "2D", ...)
  suit: Suit | null;  // the overcalled suit, or null for a double
};

function openingTrump(op: "1H" | "1S"): Suit {
  return op === "1H" ? "hearts" : "spades";
}

/** "Mixed" draws interference at a 1-in-3 rate -- confirmed with the user: higher
 *  than the real-world overcall/double frequency, deliberately, to maximize reps
 *  on the new decision rather than faithfully model how often it comes up. */
export const MIXED_INTERFERENCE_RATE = 1 / 3;

export function shouldDealInterference(mode: InterventionMode): boolean {
  if (mode === "with") return true;
  if (mode === "mixed") return Math.random() < MIXED_INTERFERENCE_RATE;
  return false;
}

/**
 * Script LHO's call over a 1H/1S opening. 50/50 a takeout double or a simple
 * suit overcall (no stated preference from the user -- flagged default, easy
 * to change); the overcall suit is random among the three suits opener didn't
 * open, with the level set to whatever's legal (1-level if that suit outranks
 * the opening, otherwise 2-level).
 */
export function pickInterference(opening: "1H" | "1S"): Interference {
  if (Math.random() < 0.5) return { kind: "double", bid: "X", suit: null };
  const trump = openingTrump(opening);
  const others = SUITS.filter((s) => s !== trump);
  const suit = others[Math.floor(Math.random() * others.length)];
  const openRank = bidRank(opening);
  const oneLevel = "1" + DEN[suit];
  const bid = bidRank(oneLevel) > openRank ? oneLevel : "2" + DEN[suit];
  return { kind: "overcall", bid, suit };
}

/** The scripted-call "recommendation" shown in the auction (not something the
 *  user is graded on -- it just needs explanatory text for the Coach/UI). */
export function interferenceSeatCall(interference: Interference): Recommendation {
  if (interference.kind === "double") {
    return {
      best: "X",
      acceptable: [],
      explanationIfNotBest:
        "LHO doubles for takeout: opening-range values, support for the unbid suits -- a scripted interference call (no opponent hand is dealt).",
    };
  }
  return {
    best: interference.bid,
    acceptable: [],
    explanationIfNotBest:
      `LHO overcalls ${interference.bid}: a 5+ card suit and opening-range values -- a scripted interference call (no opponent hand is dealt).`,
  };
}

/**
 * Responder's call over interference (1H/1S - [overcall or X] - ?).
 *
 * Standard-textbook negative-double / redouble thresholds -- there's no
 * Sutton-specific guidance yet for competitive auctions, so these are
 * flagged defaults for the user to correct, same as every other threshold
 * in this engine started out:
 *   - Negative double: 6+ HCP, fewer than 4 cards in opener's major, and the
 *     overcall took away the natural (no-interference) call.
 *   - Redouble: 10+ HCP, fewer than 4 cards in opener's major, and the
 *     natural call would otherwise have been the catch-all 1NT forcing --
 *     redouble shows the extra strength a quiet 1NT forcing can't, now that
 *     LHO has doubled.
 *   - Cue-bid (LHO's own suit, one level higher): when the overcall blocks
 *     a hand that's game-forcing by this system's OWN cutoff (13+ HCP +
 *     length -- the identical number recommend.ts already uses for the
 *     natural 2/1 game force) and there's no 4-card support for opener's
 *     major to raise with instead. A cue-bid here is artificial and
 *     forcing -- it says "game-forcing values, no fit shown yet" without
 *     committing to a suit, keeping the force alive instead of underselling
 *     the hand as a plain negative double would. Added per the user's
 *     explicit flag that resolving every blocked game-forcing hand as a
 *     double was training an incorrect strategy.
 *
 * Known v1 simplification: this cue-bid promises values only, the same way
 * recommend.ts's own natural 2/1 call does not yet distinguish "game-force,
 * no 4-card support" hands by suit quality -- it doesn't yet layer in a
 * second-round "cue-bid shows a fit" meaning for when responder DOES hold
 * 4-card support but the overcall happened to reach high enough to block
 * even a support bid (today's engine never deals an overcall that high, so
 * this can't currently occur, but a future release raising the overcall
 * ceiling would need to revisit it).
 */
export function recommendResponderOverInterference(
  hand: Hand,
  opening: "1H" | "1S",
  interference: Interference
): Recommendation {
  const trump = openingTrump(opening);
  const tc = suitLength(hand, trump);
  const hcp = handHcp(hand);
  const natural = recommendResponder(hand, opening);

  if (interference.kind === "double") {
    // A double never consumes bidding space, so the natural call is almost
    // always still correct -- it just isn't forcing the way it is in a
    // quiet auction. The one hand that changes its answer is real extra
    // strength (10+) with no fit and no natural call better than 1NT: over
    // a double, redouble is the more descriptive way to show that.
    if (tc < 4 && hcp >= 10 && natural.best === "1NT") {
      return {
        best: "XX",
        acceptable: [natural.best],
        explanationIfNotBest:
          "Redouble: 10+ HCP, fewer than 4-card support for opener's major, no natural call better than 1NT forcing -- redouble shows the extra strength now that LHO has doubled.",
      };
    }
    return {
      ...natural,
      explanationIfNotBest:
        natural.explanationIfNotBest +
        " (LHO's double doesn't take away any bidding room -- the call is unchanged, just no longer forcing opener to bid again.)",
    };
  }

  // Overcall: if the natural call still outranks it, nothing changes -- a
  // real fit (4+ support), a strong 2/1 game force, or a Jacoby/splinter hand
  // almost always still has a live natural call the overcall didn't reach.
  const overRank = bidRank(interference.bid);
  if (natural.best !== "Pass" && bidRank(natural.best) > overRank) {
    return { ...natural, explanationIfNotBest: natural.explanationIfNotBest + " (Still available over the overcall.)" };
  }

  // The overcall ate the natural call's bidding room (typically a blocked
  // 1-level new suit or a blocked 1NT forcing). A hand that's game-forcing
  // by this system's own cutoff (same 13+ HCP+length recommend.ts uses for
  // the natural 2/1 call) shouldn't be downgraded to a plain negative
  // double just because the overcall landed on its suit -- cue-bid LHO's
  // suit instead to keep the force alive.
  const naturalPoints = handHcp(hand) + lengthPoints(hand);
  if (tc < 4 && naturalPoints >= 13 && interference.suit) {
    const cueLevel = parseInt(interference.bid[0], 10) + 1;
    const cueBid = cueLevel + DEN[interference.suit];
    return {
      best: cueBid,
      acceptable: [],
      explanationIfNotBest:
        `Cue-bid: ${naturalPoints} HCP+length (game-forcing by this system's own cutoff), fewer than 4-card support for opener's major, and the overcall took the natural call away -- cue-bidding LHO's own suit (artificial, forcing) keeps the force alive instead of underselling the hand with a negative double.`,
    };
  }

  // Below game-forcing strength: show values via a negative double, or pass.
  if (tc < 4 && hcp >= 6) {
    return {
      best: "X",
      acceptable: [],
      explanationIfNotBest:
        "Negative double: 6+ HCP, fewer than 4-card support for opener's major, and the overcall took away the natural call -- double shows values without committing to a suit.",
    };
  }
  return { best: "Pass", acceptable: ["X"], explanationIfNotBest: "Too weak to act over the overcall (fewer than 6 HCP, no fit)." };
}
