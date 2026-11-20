import { Hand, Rank, Recommendation, Suit } from "./types";
import { assertValidPair } from "./dealValidate";
import { handHcp, lengthPoints } from "./eval";
import { bidRank } from "./grade";
import { stopped } from "./nmf";

/* =============================================================================
   OVERCALL seat (V8, first release): the OPPONENT on the student's right (RHO) opens
   one of a suit, and the student -- sitting in the direct seat -- decides whether and
   how to compete. One decision, one graded call; nothing is bid after it.

   The four answers dealt:
     Pass            no action
     Simple overcall a suit
     Takeout double  X
     1NT overcall    15-18 balanced with the opponent's suit stopped

   Sources and rulings (Sutton is the authority; where she is silent the user said
   "standard ACBL"):
     - Overcall strength and length: Sutton's cuebid-raise page says a 1-level overcall
       promises 8-16 HCP (10-17 total points) and a 5-card suit (6 preferred in a minor).
       Standard ACBL adds a two-level requirement of 11+ HCP and a good suit (judgment call:
       11-16 HCP; 2 of the top 3 honors, or 3 of the top 5). One-level suit quality is
       "decent" = 2 of the top 5 honors (judgment call).
     - Takeout double (Sutton, Doubles #3): opening points counting dummy points, shortness
       in the opponent's suit, ideally 4-card support for the unbid suits. The USER set the
       minimum at 13 points. Points = HCP + dummy points for the shortness in the opponent's
       suit only (void 5 / singleton 3 / doubleton 1, the project's 4+-trump scale -- judgment
       call). Shape test (judgment call): at most 2 cards in the opponent's suit, at least 3 in
       every unbid suit, and 4+ in an unbid major.
     - 1NT overcall: 15-18 balanced with a stopper (standard ACBL; Sutton gives 15-18 for
       the 2NT overcall of a weak two). Stopper = A, Kx, Qxx or Jxxx (same test as NMF).
     - When a hand qualifies for both a suit overcall and a takeout double, the overcall is
       best and the double is acceptable.

   NOT dealt (kept out so no hand is ambiguous): 19+ HCP; 17-18 HCP hands that are not a
   takeout double or a 1NT overcall (the "big double" is a later release); balanced 15-18
   with no stopper; two-suiters with 5+ cards in two suits (Michaels / Unusual NT are the
   next release -- rulings are already recorded); 7+ card suits and 6-card suits with
   10 HCP or less (jump / preemptive overcalls are not modeled); 15+ HCP passes.
   Not modeled at all: vulnerability, balancing seat, the opponents' later calls, partner's
   response.

   RHO's opening hand is dealt from the same deck (so the student's hand is consistent with
   it) and opens a 1-level suit: 12+ HCP (or HCP + length points 13+), not 15-17 balanced
   (1NT), not 20+ balanced (2NT), not 22+ (2C); longest 5+ card major (5-5 -> spades), else
   the longer minor (4-4 or 5-5 -> 1D, 3-3 -> 1C).
   ============================================================================= */

export type OvercallKind = "pass" | "suit" | "double" | "nt";
export type OvercallOpening = "1C" | "1D" | "1H" | "1S";
export type OvercallPair = {
  opponent: Hand;   // RHO, the opening hand
  user: Hand;       // the student (overcaller)
  opening: OvercallOpening;
  kind: OvercallKind;
  rec: Recommendation;
};

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const DEN: Record<Suit, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
const SUIT_OF: Record<string, Suit> = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };
const GLYPH: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const RANK_OF: Record<Suit, number> = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };
const isMajor = (s: Suit) => s === "spades" || s === "hearts";

function len(h: Hand, s: Suit): number { return h[s].length; }
function isBalanced(h: Hand): boolean {
  const lens = SUITS.map((s) => len(h, s));
  return !lens.some((n) => n <= 1) && lens.filter((n) => n === 2).length <= 1;
}
function count(h: Hand, s: Suit, ranks: Rank[]): number { return ranks.filter((r) => h[s].includes(r)).length; }
const TOP3: Rank[] = ["A", "K", "Q"];
const TOP5: Rank[] = ["A", "K", "Q", "J", "10"];

/** One-level overcall suit: decent = 2 of the top 5 honors. Two-level: good = 2 of the top 3, or 3 of the top 5. */
function suitOkAt(h: Hand, s: Suit, level: 1 | 2): boolean {
  if (level === 1) return count(h, s, TOP5) >= 2;
  return count(h, s, TOP3) >= 2 || count(h, s, TOP5) >= 3;
}

/* ---------- RHO's opening ---------- */

export function opponentOpening(h: Hand): OvercallOpening | null {
  const hcp = handHcp(h), lp = lengthPoints(h);
  const longest = Math.max(...SUITS.map((s) => len(h, s)));
  if (hcp > 21 || longest >= 7) return null;
  if (isBalanced(h)) {
    if (hcp < 12 || (hcp >= 15 && hcp <= 17) || hcp >= 20) return null;
  } else if (hcp + lp < 13) return null;
  if (longest >= 6 && hcp <= 10) return null;
  const sp = len(h, "spades"), he = len(h, "hearts"), di = len(h, "diamonds"), cl = len(h, "clubs");
  if (sp >= 5 && sp >= he) return "1S";
  if (he >= 5) return "1H";
  if (di > cl) return "1D";
  if (cl > di) return "1C";
  return di >= 4 ? "1D" : "1C";
}

/* ---------- the student's decision ---------- */

export function classifyOvercall(h: Hand, opening: OvercallOpening): { kind: OvercallKind; rec: Recommendation } | null {
  const oppSuit = SUIT_OF[opening[1]];
  const oppSym = GLYPH[oppSuit];
  const hcp = handHcp(h);
  const longest = Math.max(...SUITS.map((s) => len(h, s)));
  if (hcp >= 19 || longest >= 7 || (longest === 6 && hcp <= 10)) return null;
  if (SUITS.filter((s) => len(h, s) >= 5).length >= 2) return null; // two-suiters: next release

  // 1NT overcall
  if (isBalanced(h) && hcp >= 15 && hcp <= 18) {
    if (!stopped(h, oppSuit)) return null;
    return {
      kind: "nt",
      rec: { best: "1NT", acceptable: [], explanationIfNotBest: `1NT overcall: ${hcp} HCP (15-18), balanced, with the opponent's ${oppSym} stopped.` },
    };
  }

  // takeout double
  const oppLen = len(h, oppSuit);
  const unbid = SUITS.filter((s) => s !== oppSuit);
  const shape = oppLen <= 2 && unbid.every((s) => len(h, s) >= 3) && unbid.filter(isMajor).some((s) => len(h, s) >= 4);
  const dp = oppLen === 0 ? 5 : oppLen === 1 ? 3 : oppLen === 2 ? 1 : 0;
  const pts = hcp + dp;
  const canDouble = shape && pts >= 13;
  const shortWord = oppLen === 0 ? "void" : oppLen === 1 ? "singleton" : "doubleton";

  // simple overcall (at most one 5+ card suit reaches here)
  const five = unbid.filter((s) => len(h, s) >= 5).map((s) => {
    const level: 1 | 2 = bidRank("1" + DEN[s]) > bidRank(opening) ? 1 : 2;
    return { s, level, bid: level + DEN[s] };
  });
  const cand = five.find((c) =>
    c.level === 1 ? hcp >= 8 && hcp <= 16 && suitOkAt(h, c.s, 1) : hcp >= 11 && hcp <= 16 && suitOkAt(h, c.s, 2));

  if (cand) {
    const sym = GLYPH[cand.s];
    const why = cand.level === 1
      ? `Simple overcall: a ${len(h, cand.s)}-card ${sym} suit with decent quality and ${hcp} HCP — a one-level overcall shows 8-16 HCP. Bid ${cand.bid[0]}${sym}.`
      : `Simple overcall: a ${len(h, cand.s)}-card ${sym} suit with good quality and ${hcp} HCP — a two-level overcall needs 11+ HCP and a good suit. Bid ${cand.bid[0]}${sym}.`;
    return {
      kind: "suit",
      rec: {
        best: cand.bid,
        acceptable: canDouble ? ["X"] : [],
        explanationIfNotBest: why + (canDouble ? ` A takeout double is also acceptable: you have ${pts} points (${hcp} HCP + ${dp} for the ${shortWord} in ${oppSym}) and support for the unbid suits.` : ""),
      },
    };
  }
  if (canDouble) {
    return {
      kind: "double",
      rec: {
        best: "X", acceptable: [],
        explanationIfNotBest: `Takeout double: ${hcp} HCP + ${dp} dummy points for the ${shortWord} in ${oppSym} = ${pts} points (13+ needed), short in the opponent's suit with support for the unbid suits. It asks partner to pick a suit.`,
      },
    };
  }

  // pass: only clear passes are dealt
  if (hcp >= 15) return null;
  let why: string;
  if (hcp < 8) why = `Pass: ${hcp} HCP is too weak to overcall or double.`;
  else if (five.length) {
    const c = five[0];
    if (c.level === 2 && hcp < 11) why = `Pass: a two-level overcall needs 11+ HCP and you have ${hcp}.`;
    else if (!suitOkAt(h, c.s, c.level)) why = `Pass: the ${GLYPH[c.s]} suit isn't good enough to overcall${c.level === 2 ? " at the two level (2 of the top 3 honors, or 3 of the top 5)" : " (2 of the top 5 honors)"}.`;
    else why = "Pass: no action fits this hand.";
  } else if (shape) why = `Pass: ${pts} points counting dummy points is short of the 13 needed for a takeout double.`;
  else why = `Pass: no 5-card suit to overcall, and the shape isn't right for a takeout double (short in ${oppSym}, 3+ cards in each unbid suit, a 4-card unbid major).`;
  return { kind: "pass", rec: { best: "Pass", acceptable: [], explanationIfNotBest: why } };
}

/* ---------- dealing ---------- */

function dealTwoHands(): { a: Hand; b: Hand } {
  const deck: Array<{ suit: Suit; rank: string }> = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const order: Record<string, number> = RANKS.reduce((a, r, i) => { a[r] = RANKS.length - i; return a; }, {} as Record<string, number>);
  const take = (cards: Array<{ suit: Suit; rank: string }>): Hand => {
    const h: Hand = { spades: [], hearts: [], diamonds: [], clubs: [] };
    for (const c of cards) (h[c.suit] as string[]).push(c.rank);
    for (const s of SUITS) (h[s] as string[]).sort((x, y) => order[y] - order[x]);
    return h as Hand;
  };
  const a = take(deck.slice(0, 13));
  const b = take(deck.slice(13, 26));
  assertValidPair(a, b, "overcall");
  return { a, b };
}

/** Deal a pair whose best call is `wanted` (pass / suit / double / nt). */
export function dealOvercallPair(wanted: OvercallKind): OvercallPair {
  for (let i = 0; i < 400000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, us] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const opening = opponentOpening(op);
      if (!opening) continue;
      const c = classifyOvercall(us, opening);
      if (!c || c.kind !== wanted) continue;
      return { opponent: op, user: us, opening, kind: c.kind, rec: c.rec };
    }
  }
  throw new Error("[overcall] could not deal a valid pair");
}

/** Mixed: pass 25%, simple overcall 35%, takeout double 25%, 1NT overcall 15%. */
export function pickOvercallKind(): OvercallKind {
  const r = Math.random();
  return r < 0.25 ? "pass" : r < 0.6 ? "suit" : r < 0.85 ? "double" : "nt";
}

export function buildOvercallAuction(p: OvercallPair): Array<{ by: "rho" | "overcaller"; rec: Recommendation }> {
  const suit = SUIT_OF[p.opening[1]];
  return [
    {
      by: "rho",
      rec: {
        best: p.opening, acceptable: [],
        explanationIfNotBest: `RHO opens ${p.opening[0]}${GLYPH[suit]}: ${isMajor(suit) ? "a 5+ card major" : "the longer minor"} with opening strength.`,
      },
    },
    { by: "overcaller", rec: p.rec },
  ];
}
