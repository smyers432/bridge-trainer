import { Hand, Opening, Recommendation, Suit } from "./types";
import {
  countShortages,
  distributionPointsForSupport,
  handHcp,
  suitLength,
} from "./eval";

function openingTrump(op: Opening): Suit | null {
  if (op === "1H") return "hearts";
  if (op === "1S") return "spades";
  return null;
}

/** Splinter bid for the shortest side singleton/void, at the correct level. */
export function pickSplinter(hand: Hand, op: "1H" | "1S"): string | null {
  const trump = openingTrump(op)!;
  const sides = (["spades", "hearts", "diamonds", "clubs"] as Suit[]).filter((s) => s !== trump);
  let best: Suit | null = null, bestLen = 99;
  for (const s of sides) {
    const len = suitLength(hand, s);
    if (len < bestLen) { bestLen = len; best = s; }
  }
  if (!best || bestLen > 1) return null;
  const map: Record<Suit, string> =
    op === "1H"
      ? { clubs: "4C", diamonds: "4D", spades: "3S", hearts: "3H" }
      : { clubs: "4C", diamonds: "4D", hearts: "4H", spades: "3S" };
  return map[best];
}

function overOneMajor(hand: Hand, op: "1H" | "1S"): Recommendation {
  const hcp = handHcp(hand);
  const trump = openingTrump(op)!;
  const tc = suitLength(hand, trump);
  const sp = suitLength(hand, "spades");
  const he = suitLength(hand, "hearts");
  const di = suitLength(hand, "diamonds");
  const cl = suitLength(hand, "clubs");
  const sh = countShortages(hand, trump);
  const hasShort = sh.voids + sh.singletons > 0;
  const supp = hcp + distributionPointsForSupport(hand, trump, tc);
  const raise = op === "1H" ? "3H" : "3S";
  const simple = op === "1H" ? "2H" : "2S";

  // (A) Four-plus-card support ladder (support points)
  if (tc >= 4) {
    if (tc >= 5 && supp < 10 && (hasShort || sh.doubletons >= 2)) {
      return {
        best: op === "1H" ? "4H" : "4S",
        acceptable: [raise],
        explanationIfNotBest:
          "Weak freak: 5+ trumps, weak, with distribution (Law of Total Trumps).",
      };
    }
    if (supp >= 12) {
      if (hasShort) {
        const spl = pickSplinter(hand, op);
        if (spl) {
          return {
            best: spl,
            acceptable: ["2NT"],
            explanationIfNotBest:
              "Splinter: 4+ support, 12+ support points, side singleton/void \u2014 show the shortness now.",
          };
        }
        return { best: "2NT", acceptable: [raise], explanationIfNotBest: "Jacoby 2NT (game-forcing raise)." };
      }
      return {
        best: "2NT",
        acceptable: ["3D"],
        explanationIfNotBest: "Jacoby 2NT: 12+ support points, 4+ trumps, no side shortness.",
      };
    }
    if (supp >= 10) {
      return { best: "3D", acceptable: [simple], explanationIfNotBest: "Bergen limit raise: 10\u201311 support points, 4-card support." };
    }
    if (supp >= 7) {
      return { best: "3C", acceptable: [simple], explanationIfNotBest: "Bergen constructive raise: 7\u20139 support points, 4-card support." };
    }
    return { best: raise, acceptable: [simple], explanationIfNotBest: "Preemptive raise: \u22646 support points, 4-card support." };
  }

  // (C-1) Over 1H with 4+ spades: show 1S first
  if (op === "1H" && sp >= 4) {
    if (hcp >= 13) {
      return { best: "1S", acceptable: ["2C", "2D", "1NT"], explanationIfNotBest: "Show 4+ spades at the one level first \u2014 a one-level new suit is forcing." };
    }
    if (hcp >= 6) {
      return { best: "1S", acceptable: ["1NT"], explanationIfNotBest: "Show 4+ spades at the one level (forcing); preferred to 1NT." };
    }
    return { best: "Pass", acceptable: ["1S"], explanationIfNotBest: "Too weak to respond." };
  }

  // (C-2) Game force, no 4-card support: 2/1 in the longest biddable 2-level suit
  if (hcp >= 13) {
    // Over 1S a heart suit (5+) is a live 2/1 at 2H; minors need 4+. Over 1H only the minors.
    const opts: Array<[string, number, string]> =
      op === "1S"
        ? [["hearts", he, "2H"], ["diamonds", di, "2D"], ["clubs", cl, "2C"]]
        : [["diamonds", di, "2D"], ["clubs", cl, "2C"]];
    const viable = opts
      .filter(([s, len]) => (s === "hearts" ? len >= 5 : len >= 4))
      .sort((a, b) => b[1] - a[1]); // longest first; stable sort keeps higher-ranking suit on ties
    if (viable.length) {
      const alts = viable.slice(1).map((v) => v[2]);
      return {
        best: viable[0][2],
        acceptable: [...alts, "1NT"],
        explanationIfNotBest:
          "2/1 game force: 13+ HCP, no 4-card support \u2014 bid your longest suit at the two level.",
      };
    }
    return {
      best: "1NT",
      acceptable: [],
      explanationIfNotBest:
        "1NT forcing: game values but no biddable 2-level suit; show strength next round.",
    };
  }

  // (B) Three-card support ladder (support points)
  if (tc === 3) {
    if (supp >= 10) return { best: "1NT", acceptable: [simple], explanationIfNotBest: "1NT forcing, then jump to 3M next round (3-card limit raise, 10\u201312)." };
    if (supp >= 8) return { best: simple, acceptable: ["1NT"], explanationIfNotBest: "Constructive single raise: 8\u20139 support points, 3-card support." };
    if (supp >= 6) return { best: "1NT", acceptable: [simple], explanationIfNotBest: "1NT forcing, then 2M next round (5\u20137, 3-card support)." };
    return { best: "Pass", acceptable: ["1NT"], explanationIfNotBest: "Too weak to respond." };
  }

  // (C-3) No support
  if (hcp >= 6) return { best: "1NT", acceptable: ["Pass"], explanationIfNotBest: "1NT forcing: 6\u201312, no fit and no one-level suit to show." };
  return { best: "Pass", acceptable: ["1NT"], explanationIfNotBest: "Too weak to respond." };
}

function balanced4333(hand: Hand): boolean {
  const l = (["spades", "hearts", "diamonds", "clubs"] as Suit[])
    .map((s) => suitLength(hand, s)).sort((a, b) => b - a);
  return l[0] === 4 && l[1] === 3 && l[2] === 3 && l[3] === 3;
}

function overOneNT(hand: Hand): Recommendation {
  const hcp = handHcp(hand);
  const sp = suitLength(hand, "spades");
  const he = suitLength(hand, "hearts");

  if (he >= 6 && hcp >= 10) return { best: "4D", acceptable: ["2D"], explanationIfNotBest: "Texas transfer: 6+ hearts, game values \u2014 place the contract at once." };
  if (sp >= 6 && hcp >= 10) return { best: "4H", acceptable: ["2H"], explanationIfNotBest: "Texas transfer: 6+ spades, game values \u2014 place the contract at once." };
  if (he >= 5) return { best: "2D", acceptable: ["4D"], explanationIfNotBest: "Jacoby transfer to hearts (5+ hearts)." };
  if (sp >= 5) return { best: "2H", acceptable: ["4H"], explanationIfNotBest: "Jacoby transfer to spades (5+ spades)." };

  const has3 = sp === 3 || he === 3;
  const sh = countShortages(hand);
  const short = sh.voids + sh.singletons > 0;
  if (hcp >= 10 && has3 && !balanced4333(hand) && short) {
    return { best: "3C", acceptable: ["3NT"], explanationIfNotBest: "Puppet Stayman: 3-card major + shortness + 10+ \u2014 hunt the 5-3 major fit." };
  }
  if (hcp >= 8 && (sp >= 4 || he >= 4)) {
    return { best: "2C", acceptable: ["3NT"], explanationIfNotBest: "Stayman: 4-card major with invitational-or-better values." };
  }
  if (hcp >= 10) return { best: "3NT", acceptable: ["2NT"], explanationIfNotBest: "Game values opposite 15\u201317, no major plan." };
  if (hcp >= 8) return { best: "2NT", acceptable: ["Pass"], explanationIfNotBest: "Invitational, balanced." };
  return { best: "Pass", acceptable: ["2NT"], explanationIfNotBest: "Too weak to invite." };
}

function overMinor(hand: Hand, op: "1C" | "1D"): Recommendation {
  const hcp = handHcp(hand);
  const sp = suitLength(hand, "spades");
  const he = suitLength(hand, "hearts");
  const di = suitLength(hand, "diamonds");
  const cl = suitLength(hand, "clubs");

  if (he >= 4) return { best: "1H", acceptable: ["1S", "1NT"], explanationIfNotBest: "Show a 4-card major up the line." };
  if (sp >= 4) return { best: "1S", acceptable: ["1NT"], explanationIfNotBest: "Show a 4-card major." };
  if (op === "1C" && di >= 4 && hcp >= 6) return { best: "1D", acceptable: ["1NT"], explanationIfNotBest: "Over 1\u2663, show a real diamond suit before 1NT." };
  if (op === "1D" && cl >= 4 && hcp >= 13) return { best: "2C", acceptable: ["1NT"], explanationIfNotBest: "1\u2666\u20132\u2663 is game forcing (2/1)." };
  if (hcp >= 6) return { best: "1NT", acceptable: [], explanationIfNotBest: "Natural 1NT (no 4-card major)." };
  return { best: "Pass", acceptable: ["1NT"], explanationIfNotBest: "Too weak to respond." };
}

export function recommendResponder(hand: Hand, opening: Opening): Recommendation {
  if (opening === "1NT") return overOneNT(hand);
  if (opening === "1H" || opening === "1S") return overOneMajor(hand, opening);
  if (opening === "1C" || opening === "1D") return overMinor(hand, opening);
  // 2D/2H/2S (Weak Two) openings are handled entirely by their own dedicated
  // module (weaktwo.ts) and never reach this function — kept exhaustive for the type checker.
  return { best: "Pass", acceptable: [], explanationIfNotBest: "Not reachable: Weak Two auctions are built by weaktwo.ts." };
}
