import { Hand, Opening, Rank, Recommendation, Suit } from "./types";
import { countShortages, distributionPointsForSupport, handHcp, handLosers, suitLength, suitLosers, supportPoints } from "./eval";
import { recommendResponder } from "./recommend";
import { bidRank } from "./grade";

/* =============================================================================
   V3 "Two Over One" family: 2/1 game force + Bergen + Jacoby 2NT, unified, with
   a graded second round (opener's rebid; bounded responder continuation).
   Slam machinery and splinters are deferred, so dealt hands are capped to
   game-only values and the family excludes splinter responses.
   Canonical Jacoby 2NT opener-rebid ladder is from the user's Convention #5.
   Bergen opener continuation thresholds are a flagged resolution.
   ============================================================================= */

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const DEN: Record<Suit, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
const SUIT_OF: Record<string, Suit> = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };

export type Pair2 = { opener: Hand; responder: Hand; opening: Opening; firstCall: string };
export type ResponseCat = "two_one" | "bergen" | "jacoby" | "one_nt" | "simple_raise";
export type Focus = "mixed" | ResponseCat | "drury" | "splinter";

export const FOCUS_OPTIONS: { id: Focus; label: string }[] = [
  { id: "mixed", label: "Mixed" },
  { id: "two_one", label: "2-over-1" },
  { id: "one_nt", label: "1NT forcing" },
  { id: "bergen", label: "Bergen" },
  { id: "jacoby", label: "Jacoby 2NT" },
  { id: "simple_raise", label: "Simple Raise / HSGT" },
  { id: "drury", label: "Reverse Drury" },
  { id: "splinter", label: "Splinter + RKC" },
];

function majorOf(opening: Opening): Suit { return opening === "1S" ? "spades" : "hearts"; }
function suitOfCall(bid: string): Suit | null { const d = bid.slice(1); return SUIT_OF[d] ?? null; }
function isBalanced(h: Hand): boolean {
  const sh = countShortages(h);
  return sh.voids === 0 && sh.singletons === 0 && sh.doubletons <= 1;
}

/**
 * Which family bucket a first call belongs to (null if not in the 2/1 family).
 * Opening-aware because "2H" is ambiguous on its own: a new-suit 2/1 GF call
 * over 1S, but a plain simple raise of hearts when opening is 1H. "2S" is
 * likewise the simple raise of spades (never a 2/1 GF call in this system).
 */
export function familyCategory(call: string, opening: Opening): ResponseCat | null {
  if (call === "2NT") return "jacoby";
  if (call === "3C" || call === "3D") return "bergen";
  if (call === "1NT") return "one_nt";
  if (call === "2H" && opening === "1H") return "simple_raise";
  if (call === "2S" && opening === "1S") return "simple_raise";
  if (call === "2C" || call === "2D" || call === "2H") return "two_one";
  return null;
}

function dealTwoHands(): { a: Hand; b: Hand } {
  const deck: Array<{ suit: Suit; rank: Rank }> = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const order: Record<Rank, number> = RANKS.reduce((acc, r, i) => { acc[r] = RANKS.length - i; return acc; }, {} as Record<Rank, number>);
  const take = (cards: Array<{ suit: Suit; rank: Rank }>): Hand => {
    const h: Hand = { spades: [], hearts: [], diamonds: [], clubs: [] };
    for (const c of cards) h[c.suit].push(c.rank);
    for (const s of SUITS) h[s].sort((x, y) => order[y] - order[x]);
    return h;
  };
  return { a: take(deck.slice(0, 13)), b: take(deck.slice(13, 26)) };
}

/** Does this hand open 1H or 1S in our system (5+ major, 12-19, not a 1NT/2C hand)? */
function opensMajor(h: Hand): Opening | null {
  const hcp = handHcp(h);
  if (hcp < 12 || hcp > 19) return null;
  const sp = suitLength(h, "spades"), he = suitLength(h, "hearts");
  if (sp >= 5 && sp >= he) return "1S";
  if (he >= 5 && he > sp) return "1H";
  return null;
}

/** Is responder's system-best call a member of the 2/1 family (2/1 GF, Bergen, Jacoby, 1NT forcing, simple raise)? */
export function familyCall(responder: Hand, opening: Opening): string | null {
  const best = recommendResponder(responder, opening).best;
  if (best === "3C" || best === "3D" || best === "2NT") return best;          // Bergen / Jacoby
  if (best === "2C" || best === "2D") return best;                             // 2/1 minor
  if (best === "2H" && opening === "1S") return best;                          // 2/1 in hearts
  if (best === "1NT") return best;                                            // 1NT forcing
  if (best === "2H" && opening === "1H") return best;                          // simple raise of 1H (HSGT)
  if (best === "2S" && opening === "1S") return best;                          // simple raise of 1S (HSGT)
  return null; // splinters, 1S-first, weak freaks, etc. are not in this family
}

/** Soundness/slam caps so dealt hands keep bounded (game-only) second rounds honest. */
function acceptable(opener: Hand, responder: Hand, opening: Opening, call: string): boolean {
  const trump = majorOf(opening);
  const cat = familyCategory(call, opening);
  if (cat === "simple_raise") return true; // already tightly bounded (3-card support, 8-9 support pts) by recommendResponder
  if (cat === "jacoby") {
    const sp = handHcp(responder) + distributionPointsForSupport(responder, trump, suitLength(responder, trump));
    return sp <= 14; // game-only, no slam try
  }
  if (cat === "two_one") return handHcp(responder) <= 16; // GF, not slammish
  if (cat === "one_nt") {
    // Keep opener out of the 18-19 jump zone so the bounded continuation stays game-only,
    // and admit only 1NT shapes with a clean second round:
    //  (a) 3-card support (delayed raise: 2M with 5-9, 3M with 10-12), or
    //  (b) no support but balanced and 6-9 (responder passes opener's minimum rebid).
    if (handHcp(opener) > 17) return false;
    const tc = suitLength(responder, trump);
    if (tc === 3) return true;
    return isBalanced(responder) && handHcp(responder) <= 9;
  }
  return true; // Bergen is inherently <= 11
}

/* ---------- "Mixed" variety: weighted anti-clump ----------
   An independent uniform draw (any of the 5 categories, 20% each, every single
   time) produces streaks by pure chance — several Bergen hands in a row is
   expected every so often, not a flaw in any one deal but in this selection
   step having no memory of the last one. This damps (never bans) an immediate
   repeat: whichever category was just dealt gets a quarter of its normal
   weight on the next draw, so repeating drops to roughly 6% instead of 20% —
   a run of 2 becomes uncommon and a run of 4+ becomes vanishingly rare —
   while still leaving every category reachable every time. */
const MIXED_CATS: ResponseCat[] = ["two_one", "one_nt", "bergen", "jacoby", "simple_raise"];
let lastMixedCat: ResponseCat | null = null;

function nextMixedCategory(): ResponseCat {
  const REPEAT_WEIGHT = 0.25;
  const weights = MIXED_CATS.map((c) => (c === lastMixedCat ? REPEAT_WEIGHT : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  let pick = MIXED_CATS[MIXED_CATS.length - 1];
  for (let i = 0; i < MIXED_CATS.length; i++) {
    if (r < weights[i]) { pick = MIXED_CATS[i]; break; }
    r -= weights[i];
  }
  return pick;
}

export function dealTwoOverOnePair(focus: Focus = "mixed"): Pair2 {
  // Reverse Drury is deliberately excluded from "mixed": it widens the opener's HCP
  // floor to a light 10-11 (3rd/4th seat), which would misrepresent a normal 2/1 auction
  // if it turned up unannounced in the general pool. It's its own focus (see drury.ts).
  const target: Focus = focus === "mixed" ? nextMixedCategory() : focus;
  for (let i = 0; i < 80000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const opening = opensMajor(op);
      if (!opening) continue;
      const call = familyCall(resp, opening);
      if (!call) continue;
      if (familyCategory(call, opening) !== target) continue;
      if (!acceptable(op, resp, opening, call)) continue;
      if (focus === "mixed") lastMixedCat = target as ResponseCat;
      return { opener: op, responder: resp, opening, firstCall: call };
    }
  }
  // Fallback: any family hand (ignore focus) so the UI never stalls. Still records
  // whatever category actually got dealt, so the anti-clump memory stays truthful.
  for (let i = 0; i < 20000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const opening = opensMajor(op);
      if (!opening) continue;
      const call = familyCall(resp, opening);
      if (call && acceptable(op, resp, opening, call)) {
        if (focus === "mixed") {
          const cat = familyCategory(call, opening);
          if (cat) lastMixedCat = cat;
        }
        return { opener: op, responder: resp, opening, firstCall: call };
      }
    }
  }
  const { a, b } = dealTwoHands();
  const opening = opensMajor(a) || "1S";
  const firstCall = familyCall(b, opening) || "2D";
  if (focus === "mixed") {
    const cat = familyCategory(firstCall, opening);
    if (cat) lastMixedCat = cat;
  }
  return { opener: a, responder: b, opening, firstCall };
}

/* ---------- Opener's rebid (the graded second round in the opener seat) ---------- */

/** 1M-2NT: canonical Convention #5 ladder. */
export function jacoby2ntRebid(opener: Hand, opening: Opening): Recommendation {
  const trump = majorOf(opening);
  const M = DEN[trump];
  const sides = SUITS.filter((s) => s !== trump);
  const shorts = sides.filter((s) => suitLength(opener, s) <= 1);
  if (shorts.length) {
    shorts.sort((x, y) => bidRank("3" + DEN[x]) - bidRank("3" + DEN[y]));
    const s = shorts[0];
    return { best: "3" + DEN[s], acceptable: [],
      explanationIfNotBest: `Jacoby 2NT: show your shortness \u2014 a new suit at the 3 level is a singleton or void (here ${DEN[s] === "C" ? "clubs" : DEN[s] === "D" ? "diamonds" : DEN[s] === "H" ? "hearts" : "spades"}).` };
  }
  const side5 = sides.find((s) => suitLength(opener, s) >= 5);
  if (side5) {
    // Note: a 5-card side suit forces a side singleton/void, so the shortness
    // branch above always fires first. Retained defensively but effectively dead;
    // dedicated 5-5 two-suiter handling (4-level side suit) is deferred.
    return { best: "4" + DEN[side5], acceptable: ["3" + M],
      explanationIfNotBest: "Jacoby 2NT: a new suit at the 4 level shows a good 5-card side suit." };
  }
  const hcp = handHcp(opener);
  if (hcp >= 16) return { best: "3" + M, acceptable: ["3NT"],
    explanationIfNotBest: "Jacoby 2NT: 16+ with good trumps and no shortness \u2014 bid 3 of the major (slow arrival, slam interest)." };
  if (hcp >= 14) return { best: "3NT", acceptable: ["4" + M],
    explanationIfNotBest: "Jacoby 2NT: an average opening with no shortness rebids 3NT." };
  return { best: "4" + M, acceptable: [],
    explanationIfNotBest: "Jacoby 2NT: a minimum with no shortness jumps to 4 of the major (fast arrival, no slam interest)." };
}

/** 1M-3C / 1M-3D (Bergen): accept game or decline to 3M. Thresholds are a flagged resolution. */
export function bergenRebid(opener: Hand, opening: Opening, firstCall: string): Recommendation {
  const trump = majorOf(opening);
  const M = DEN[trump];
  const sp = handHcp(opener) + distributionPointsForSupport(opener, trump, suitLength(opener, trump));
  const threeM = "3" + M, fourM = "4" + M;
  if (firstCall === "3C") { // responder 7-9
    return sp >= 17
      ? { best: fourM, acceptable: [], explanationIfNotBest: "Over Bergen 3\u2663 (7-9), a strong opener accepts game." }
      : { best: threeM, acceptable: [], explanationIfNotBest: "Over Bergen 3\u2663 (7-9), a minimum signs off in 3 of the major." };
  }
  // 3D: responder 10-11
  return sp >= 14
    ? { best: fourM, acceptable: [], explanationIfNotBest: "Over Bergen 3\u2666 (10-11, limit), a sound opener bids game." }
    : { best: threeM, acceptable: [], explanationIfNotBest: "Over Bergen 3\u2666 (10-11), a dead minimum declines to 3 of the major." };
}

/** 1M-2x (2/1 GF): natural rebid. support-raise -> new suit -> rebid major -> 2NT. */
export function twoOverOneRebid(opener: Hand, opening: Opening, firstCall: string): Recommendation {
  const trump = majorOf(opening);
  const M = DEN[trump];
  const respSuit = suitOfCall(firstCall)!;
  const respIsMajor = respSuit === "hearts"; // only 2H is a major 2/1 (over 1S)
  const support = suitLength(opener, respSuit) >= 4 || (respIsMajor && suitLength(opener, respSuit) >= 3);

  if (support) {
    return { best: "3" + DEN[respSuit], acceptable: [],
      explanationIfNotBest: "2/1 GF: raise responder's suit to show the fit." };
  }
  // new 4+ side suit (not trump, not responder's suit), cheapest legal call
  const cand = SUITS.filter((s) => s !== trump && s !== respSuit && suitLength(opener, s) >= 4)
    .map((s) => (bidRank("2" + DEN[s]) > bidRank(firstCall) ? "2" + DEN[s] : "3" + DEN[s]))
    .sort((x, y) => bidRank(x) - bidRank(y));
  if (cand.length) {
    return { best: cand[0], acceptable: [],
      explanationIfNotBest: "2/1 GF: show a second suit (new suit, natural) before rebidding a 5-card major or notrump." };
  }
  const rebidMajor = bidRank("2" + M) > bidRank(firstCall) ? "2" + M : "3" + M;
  if (suitLength(opener, trump) >= 6) {
    return { best: rebidMajor, acceptable: [],
      explanationIfNotBest: "2/1 GF: with a 6-card major and no side suit, rebid the major." };
  }
  if (isBalanced(opener)) {
    return { best: "2NT", acceptable: [rebidMajor],
      explanationIfNotBest: "2/1 GF: a balanced minimum with no support and no second suit rebids 2NT." };
  }
  return { best: rebidMajor, acceptable: ["2NT"],
    explanationIfNotBest: "2/1 GF: with no support and no second suit, rebid the 5-card major." };
}

/** 1M-1NT (forcing): natural rebid. Note: rebidding the major here needs 6 (per the summaries). */
export function onetntRebid(opener: Hand, opening: Opening): Recommendation {
  const trump = majorOf(opening);
  const M = DEN[trump];
  const hcp = handHcp(opener);
  if (hcp >= 18 && isBalanced(opener)) {
    return { best: "2NT", acceptable: [], explanationIfNotBest: "1NT forcing: 18-19 balanced rebids 2NT." };
  }
  if (suitLength(opener, trump) >= 6) {
    return { best: "2" + M, acceptable: [], explanationIfNotBest: "1NT forcing: rebidding the major promises a 6th card." };
  }
  // Second suit at the 2 level, below the major (no reverse): 1S -> H/D/C, 1H -> D/C.
  const secondSuits: Suit[] = trump === "spades" ? ["hearts", "diamonds", "clubs"] : ["diamonds", "clubs"];
  const four = secondSuits.filter((s) => suitLength(opener, s) >= 4)
    .sort((x, y) => suitLength(opener, y) - suitLength(opener, x) || bidRank("2" + DEN[x]) - bidRank("2" + DEN[y]));
  if (four.length) {
    return { best: "2" + DEN[four[0]], acceptable: [], explanationIfNotBest: "1NT forcing: show a real 4+ card second suit at the 2 level." };
  }
  // Balanced minimum, no biddable second suit: rebid the longer (or cheaper) minor, possibly 3 cards.
  const minor = suitLength(opener, "diamonds") > suitLength(opener, "clubs") ? "2D" : "2C";
  return { best: minor, acceptable: minor === "2C" ? ["2D"] : ["2C"],
    explanationIfNotBest: "1NT forcing: with no 6-card major and no 4-card side suit, rebid your better minor (may be 3 cards)." };
}

/**
 * Help Suit Game Try (HSGT): opener's rebid after a simple raise (1M-2M) with
 * 3-card support, 8-9 support points. Losing Trick Count decides:
 *   <=5 losers: enough on its own, bid game outright.
 *   6 losers: make a game try in the weakest qualifying side suit (3+ cards,
 *     >=2 losers there — asking about a suit you need help in, not a strong one).
 *     When more than one suit qualifies, ask about the one with the MOST losers
 *     (most in need of help); ties broken by suit order (spades>hearts>diamonds>clubs).
 *   >=7 losers: too many losers even with a raise — pass.
 */
function helpSuitGameTry(opener: Hand, opening: Opening): Recommendation {
  const trump = majorOf(opening);
  const M = DEN[trump];
  const losers = handLosers(opener);
  if (losers <= 5) {
    return { best: "4" + M, acceptable: [], explanationIfNotBest: `Help Suit Game Try: only ${losers} losers opposite a raise — bid game outright, no need to ask.` };
  }
  if (losers >= 7) {
    return { best: "Pass", acceptable: [], explanationIfNotBest: `Help Suit Game Try: ${losers} losers opposite a raise — too many losers for game; pass.` };
  }
  // Only a suit ranking BELOW trump can be asked about: over a 1H opening,
  // spades outranks hearts, so asking in 3S and then "declining" back to 3 of
  // the major (3H) would be an illegal downward call. (Bug: this used to
  // include spades as a candidate over 1H and produced illegal auctions like
  // 1H-2H-3S-3H whenever spades happened to be the weakest side suit — the
  // same defect as Reverse Drury's ask-suit selection, fixed the same way.)
  const sides = SUITS.filter((s) => s !== trump && bidRank("3" + DEN[s]) < bidRank("3" + M));
  const candidates = sides
    .map((s) => ({ s, losers: suitLosers(opener, s) }))
    .filter((c) => suitLength(opener, c.s) >= 3 && c.losers >= 2)
    .sort((a, b) => b.losers - a.losers); // most losers (weakest) first; stable sort keeps SUITS order on ties
  if (candidates.length) {
    const pick = candidates[0].s;
    return { best: "3" + DEN[pick], acceptable: [], explanationIfNotBest: `Help Suit Game Try: 6 losers — ask about ${pick} (your weakest 3+-card side suit) before deciding on game.` };
  }
  return { best: "4" + M, acceptable: [], explanationIfNotBest: "Help Suit Game Try: 6 losers but no clear suit to ask about — bid game." };
}

/**
 * HSGT "help" criteria for responder's follow-up: singleton or void in the asked
 * suit; an ace- or king-high holding of 2-3 cards (generalizing the doc's "K9 or
 * K87" / "A2 or A65" examples — flagged as a resolution, since the doc gives
 * illustrative hands rather than a fully general rule); a 4-card suit headed by
 * QJ (generalizing "QJ43"); or, only at the maximum of the raise (9 support
 * points here), a plain low doubleton.
 */
export function hasHelp(hand: Hand, suit: Suit, atMax: boolean): boolean {
  const cards = hand[suit];
  const len = cards.length;
  if (len === 0) return true;
  if (len === 1) return true;
  const hasA = cards.includes("A"), hasK = cards.includes("K");
  if (len <= 3 && (hasA || hasK)) return true;
  if (len === 4 && cards.includes("Q") && cards.includes("J")) return true;
  if (len === 2) return atMax;
  return false;
}

export function openerRebid(opener: Hand, opening: Opening, firstCall: string): Recommendation {
  if (firstCall === "2NT") return jacoby2ntRebid(opener, opening);
  if (firstCall === "3C" || firstCall === "3D") return bergenRebid(opener, opening, firstCall);
  if (firstCall === "1NT") return onetntRebid(opener, opening);
  if ((firstCall === "2H" && opening === "1H") || (firstCall === "2S" && opening === "1S")) {
    return helpSuitGameTry(opener, opening);
  }
  return twoOverOneRebid(opener, opening, firstCall);
}

/* ---------- Responder's bounded continuation (responder seat, no slam) ---------- */

export function responderContinuation(pair: Pair2, openerRebidBid: string): Recommendation {
  const { opener, responder, opening, firstCall } = pair;
  const trump = majorOf(opening);
  const M = DEN[trump];

  if (firstCall === "2NT") {
    // Opener may already have placed the contract (most commonly a minimum
    // jumping straight to game). Repeating that same game bid as responder's
    // "next call" isn't a legal or sensible follow-up — pass once opener has
    // already reached (or passed) the spot responder would otherwise sign off
    // in. (Bug: this used to hard-code "4M" unconditionally, which produced
    // impossible auctions like 1S-2NT-4S-4S in roughly 30% of Jacoby hands —
    // any time opener held a minimum with no shortness.)
    if (bidRank(openerRebidBid) >= bidRank("4" + M)) {
      return { best: "Pass", acceptable: [],
        explanationIfNotBest: "Opener already placed the contract in game; pass." };
    }
    return { best: "4" + M, acceptable: [],
      explanationIfNotBest: "With game-only values, sign off in game in the agreed major (slam is out of scope here)." };
  }
  if (firstCall === "3C" || firstCall === "3D") {
    return { best: "Pass", acceptable: [],
      explanationIfNotBest: "You have shown your range with the Bergen raise; respect opener's decision and pass." };
  }
  if ((firstCall === "2H" && opening === "1H") || (firstCall === "2S" && opening === "1S")) {
    // Help Suit Game Try: opener either already settled the contract (game or pass -
    // rubber-stamp Pass to close the auction), or made a game try we must answer.
    if (openerRebidBid === "4" + M || openerRebidBid === "Pass") {
      return { best: "Pass", acceptable: [], explanationIfNotBest: "Opener already settled the contract; pass." };
    }
    const askedSuit = SUIT_OF[openerRebidBid.slice(1)];
    const atMax = supportPoints(responder, trump, suitLength(responder, trump)) >= 9;
    const help = askedSuit ? hasHelp(responder, askedSuit, atMax) : false;
    return help
      ? { best: "4" + M, acceptable: [], explanationIfNotBest: `Help Suit Game Try: you have help in ${askedSuit} — accept and bid game.` }
      : { best: "3" + M, acceptable: [], explanationIfNotBest: `Help Suit Game Try: no help in ${askedSuit} — decline and return to 3 of the major.` };
  }
  if (firstCall === "1NT") {
    const tc = suitLength(responder, trump);
    if (tc >= 3) {
      const supp = handHcp(responder) + distributionPointsForSupport(responder, trump, tc);
      if (supp >= 10) {
        return { best: "3" + M, acceptable: [],
          explanationIfNotBest: "1NT forcing then jump: 3-card support with 10-12 is a delayed limit raise." };
      }
      // 5-9 with 3-card support: simple preference to the major (pass if opener already sits in 2M).
      if (openerRebidBid === "2" + M) {
        return { best: "Pass", acceptable: [],
          explanationIfNotBest: "Minimum with 3-card support: opener's 2-of-the-major rebid is the right level; pass." };
      }
      return { best: "2" + M, acceptable: [],
        explanationIfNotBest: "1NT forcing then 2M: show the delayed 3-card raise (5-9) as simple preference." };
    }
    return { best: "Pass", acceptable: [],
      explanationIfNotBest: "A balanced minimum with no fit passes opener's minimum rebid." };
  }

  // 2/1 GF: place the game. A fit exists whenever opener raises responder's own
  // suit — major OR MINOR — since that's an explicit 4+ card holding opener just
  // showed. Absent that, a major fit still exists whenever responder holds 3+
  // cards in opener's ORIGINALLY-BID major — that fit was already established
  // the moment opener opened 1M (which promises 5+ cards there), regardless of
  // what opener's rebid shows afterward. A new suit or a balanced 2NT rebid adds
  // information; it never denies the major suit opener opened in the first
  // place. (Previously this only recognized a raise of responder's suit when
  // that suit was hearts, missing the equally common case of opener raising a
  // 2/1 response in clubs or diamonds — e.g. 1S-2D-3D — and instead defaulting
  // to 3NT or opener's major even though a minor fit was just agreed. Flagged
  // and fixed at the user's request.)
  const rebidSuit = suitOfCall(openerRebidBid);
  const respSuit = suitOfCall(firstCall)!;
  const openerRaisedRespSuit = rebidSuit === respSuit;
  const ownMajorFit = suitLength(responder, trump) >= 3;
  if (openerRaisedRespSuit) {
    const isMinor = respSuit === "diamonds" || respSuit === "clubs";
    const level = isMinor ? "5" : "4";
    return {
      best: level + DEN[respSuit], acceptable: [],
      explanationIfNotBest: isMinor
        ? `Opener raised your ${respSuit} to show 4+ card support — that's the agreed fit; bid game there (a minor-suit game needs the 5 level).`
        : "A major fit is agreed; bid game in the major.",
    };
  }
  if (ownMajorFit) {
    return {
      best: "4" + M, acceptable: ["3NT"],
      explanationIfNotBest: `Opener's 1${M} promised 5+ cards there, and you hold 3+ — that 8-card-or-better fit was established from the opening bid; prefer it to notrump.`,
    };
  }
  return { best: "3NT", acceptable: [], explanationIfNotBest: "No major fit is established; place the game in 3NT." };
}
