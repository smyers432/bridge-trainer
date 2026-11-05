import { Hand, Opening, Recommendation, Suit } from "./types";
import { countShortages, handHcp, suitLength } from "./eval";
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
 * Dummy-point scale for the competitive cue bid (user ruling 2026-11-05):
 * Responder will be dummy, so shortness in the side suits counts toward the
 * 10-point cue-bid threshold. Applied with 3+ trumps. NOTE: this is the
 * heavier "4+ trumps" scale also used for 3-card support, which differs from
 * DIST.support_exactly_3_trump (3/2/1) used elsewhere in the engine -- kept
 * in one named constant so it is a one-line change.
 */
const CUE_DUMMY_POINTS = { void: 5, singleton: 3, doubleton: 1 } as const;

/** HCP + dummy points for a 3+ card fit with opener's major (side-suit shortness only). */
function cueTotalPoints(hand: Hand, trump: Suit, tc: number): number {
  if (tc < 3) return handHcp(hand);
  const { voids, singletons, doubletons } = countShortages(hand, trump);
  return (
    handHcp(hand) +
    voids * CUE_DUMMY_POINTS.void +
    singletons * CUE_DUMMY_POINTS.singleton +
    doubletons * CUE_DUMMY_POINTS.doubleton
  );
}

/**
 * Responder's call over interference (1H/1S - [overcall or X] - ?).
 *
 * Competitive rules (user rulings 2026-10-28 and 2026-11-05; Sutton's
 * materials do not cover competitive auctions, so these are the user's own):
 *   - Bergen raises are OFF after an overcall.
 *   - Cue bid (LHO's suit, one level higher; artificial, forcing): 3+ cards
 *     in opener's major AND 10+ total points (HCP + dummy points, scale
 *     above). It absorbs Bergen limit raises, Jacoby 2NT and splinters over
 *     an overcall. Takes priority over a double when a hand fits both.
 *   - Negative double (X): 4+ cards in the UNBID major, 6+ HCP when the
 *     overcall is at the 1 level, 10+ HCP when it is at the 2 level. If the
 *     overcall is in the other major there is no unbid major, so no double.
 *   - Constructive raise (Bergen 3C hand, 7-9 support points, 4+ trumps):
 *     a simple raise of opener's major at the cheapest legal level.
 *   - Redouble (over a takeout double): 10+ HCP, fewer than 4-card support,
 *     no natural call better than 1NT forcing (unchanged).
 *   - Otherwise the ordinary natural call stands if it still outranks the
 *     overcall; else pass.
 * Responder-only; opener's rebid in competition is not modelled yet.
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

  const overRank = bidRank(interference.bid);
  const overLevel = parseInt(interference.bid[0], 10);
  const overSuit = interference.suit!;

  // (1) Cue bid: 3+ support and 10+ total points -- checked first, ahead of
  // every natural call, double and raise.
  const total = cueTotalPoints(hand, trump, tc);
  if (tc >= 3 && total >= 10) {
    const cueBid = overLevel + 1 + DEN[overSuit];
    return {
      best: cueBid,
      acceptable: [],
      explanationIfNotBest:
        `Cue-bid of LHO's suit: ${tc}-card support for opener's major and ${total} total points (${hcp} HCP + dummy points) -- Bergen, Jacoby 2NT and splinters are off after an overcall, so a cue-bid of the overcalled suit (artificial, forcing) shows a fit and 10+ points.`,
    };
  }

  // (2) Constructive raise: the Bergen 3C hand (7-9 support points, 4+ trumps)
  // becomes a simple raise at the cheapest legal level.
  if (natural.best === "3C") {
    const twoM = "2" + DEN[trump];
    const raise = bidRank(twoM) > overRank ? twoM : "3" + DEN[trump];
    return {
      best: raise,
      acceptable: [],
      explanationIfNotBest:
        `Simple raise: Bergen raises are off after an overcall, so a constructive raise (7\u20139 support points, 4+ trumps) is just a natural raise of opener's major -- a cue-bid is reserved for 3+ card support and 10+ total points.`,
    };
  }

  // (3) If the natural call still outranks the overcall, nothing changes.
  if (natural.best !== "Pass" && natural.best !== "3D" && bidRank(natural.best) > overRank) {
    return { ...natural, explanationIfNotBest: natural.explanationIfNotBest + " (Still available over the overcall.)" };
  }

  // (4) Negative double: 4+ cards in the unbid major, 6+ HCP at the 1 level,
  // 10+ HCP at the 2 level. No unbid major if the overcall is in the other major.
  const otherMajor: Suit = trump === "hearts" ? "spades" : "hearts";
  if (overSuit !== otherMajor && suitLength(hand, otherMajor) >= 4) {
    const need = overLevel === 1 ? 6 : 10;
    if (hcp >= need) {
      return {
        best: "X",
        acceptable: [],
        explanationIfNotBest:
          `Negative double: 4+ cards in the unbid major (${otherMajor}) and ${hcp} HCP (needs ${need}+ over a ${overLevel}-level overcall) -- the double shows the unbid major without committing to a suit contract.`,
      };
    }
  }

  return {
    best: "Pass",
    acceptable: [],
    explanationIfNotBest:
      "No call fits over the overcall: not enough support/points for a cue-bid (3+ trumps and 10+ total points), no 4-card unbid major with enough HCP for a negative double (6+ at the 1 level, 10+ at the 2 level), and no natural call that outranks the overcall.",
  };
}
