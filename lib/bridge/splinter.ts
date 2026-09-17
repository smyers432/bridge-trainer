import { Hand, Recommendation, Suit } from "./types";
import { distributionPointsForSupport, handHcp, suitLength } from "./eval";
import { pickSplinter } from "./recommend";
import { bidRank } from "./grade";

/* =============================================================================
   Splinter bids (responder's splinter only — opener's splinter, over a new
   suit at the one or two level, is explicitly out of scope per your own call).

   Responder's splinter: a double jump in a new suit over partner's 1H/1S
   opening, showing 4+ card support, 12+ support points (matching the existing
   V1 rulebook threshold — the source doc's own "13-15" is one convention's
   style choice among several cited, and this trainer already published 12+ as
   its own house number), and a singleton or void (not the ace or king) in the
   bid suit. `pickSplinter` (in recommend.ts) already implements the exact
   suit/level mapping and was dormant until now.

   Opener's rebid: with wasted values (a K, Q, or J — at any length — in
   responder's shortness suit) sign off in game. With no wasted values (the
   suit is headed by nothing higher than the ace, or is completely empty of
   honors), explore slam with a simple Roman Keycard Blackwood (1430) ask
   — your own call, since the docs' own examples go straight to keycards.
   ============================================================================= */

export type SplinterSeatCall = { by: "opener" | "responder"; rec: Recommendation };
export type SplinterPair = { opener: Hand; responder: Hand; opening: "1H" | "1S" };

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const DEN: Record<Suit, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
const SUIT_OF: Record<string, Suit> = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };

function majorOf(opening: "1H" | "1S"): Suit { return opening === "1S" ? "spades" : "hearts"; }

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
  return { a: take(deck.slice(0, 13)), b: take(deck.slice(13, 26)) };
}

/** A normal 5+ card major opening, 12-19 HCP (same rule as the main Two Over One family). */
function opensMajor(h: Hand): "1H" | "1S" | null {
  const hcp = handHcp(h);
  if (hcp < 12 || hcp > 19) return null;
  const sp = suitLength(h, "spades"), he = suitLength(h, "hearts");
  if (sp >= 5 && sp >= he) return "1S";
  if (he >= 5 && he > sp) return "1H";
  return null;
}

/** Responder qualifies for a splinter: 4+ support, 12+ support points, and pickSplinter finds a suit. */
function qualifiesForSplinter(resp: Hand, opening: "1H" | "1S"): string | null {
  const trump = majorOf(opening);
  const tc = suitLength(resp, trump);
  if (tc < 4) return null;
  const supp = handHcp(resp) + distributionPointsForSupport(resp, trump, tc);
  if (supp < 12) return null;
  return pickSplinter(resp, opening);
}

export function dealSplinterPair(): SplinterPair {
  for (let i = 0; i < 100000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const opening = opensMajor(op);
      if (!opening) continue;
      if (!qualifiesForSplinter(resp, opening)) continue;
      return { opener: op, responder: resp, opening };
    }
  }
  // Fallback: shouldn't be needed in practice, but keeps the UI from ever stalling.
  for (let i = 0; i < 20000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const opening = opensMajor(op);
      if (opening && qualifiesForSplinter(resp, opening)) return { opener: op, responder: resp, opening };
    }
  }
  const { a, b } = dealTwoHands();
  return { opener: a, responder: b, opening: "1H" };
}

/* ---------- wasted values ---------- */

/**
 * Per the doc: "Honors in that bid suit, other than a singleton Ace, are
 * wasted values opposite responder's void or singleton. Axxx, Axx, xxxx, xxx
 * = no wasted values." Read literally that example list allows an ace at ANY
 * length (not just a singleton) alongside low cards; a K, Q, or J at any
 * length is what counts as wasted. This is a flagged resolution of a small
 * internal tension in the source doc's own wording.
 */
function hasWastedValues(opener: Hand, suit: Suit): boolean {
  const cards = opener[suit];
  return cards.includes("K") || cards.includes("Q") || cards.includes("J");
}

/* ---------- Roman Keycard Blackwood (1430), simple version ---------- */
/* Keycards = the four aces plus the king of the agreed trump suit (5 total). */

function keycards(hand: Hand, trump: Suit): number {
  const aces = SUITS.filter((s) => hand[s].includes("A")).length;
  return aces + (hand[trump].includes("K") ? 1 : 0);
}
function hasTrumpQueen(hand: Hand, trump: Suit): boolean {
  return hand[trump].includes("Q");
}

/** Responder's 1430 answer to opener's 4NT ask. */
function keycardResponse(responder: Hand, trump: Suit): Recommendation {
  let rk = keycards(responder, trump);
  if (rk > 4) rk = 4; // holding all 5 keycards is vanishingly rare; folded into the "4" step — flagged simplification
  const hasQ = hasTrumpQueen(responder, trump);
  if (rk === 0 || rk === 3) {
    return { best: "5D", acceptable: [], explanationIfNotBest: `Roman Keycard Blackwood (1430): ${rk} keycards — 5♦ shows 0 or 3.` };
  }
  if (rk === 1 || rk === 4) {
    return { best: "5C", acceptable: [], explanationIfNotBest: `Roman Keycard Blackwood (1430): ${rk} keycards — 5♣ shows 1 or 4.` };
  }
  // rk === 2
  return hasQ
    ? { best: "5S", acceptable: [], explanationIfNotBest: "Roman Keycard Blackwood (1430): 2 keycards with the trump queen — 5♠ shows 2 (or 5) with the queen." }
    : { best: "5H", acceptable: [], explanationIfNotBest: "Roman Keycard Blackwood (1430): 2 keycards without the trump queen — 5♥ shows 2 (or 5) without the queen." };
}

/**
 * Opener's decision after the keycard response. This trainer doesn't model a
 * further trump-queen ask or a grand slam try (per your own call to keep RKC
 * simple) — it caps at a small slam. Since both hands are fully known here
 * (there's no defender to hide a keycard from the engine the way there would
 * be at the table), the "1 or 4" / "0 or 3" ambiguity is resolved directly
 * from responder's actual holding rather than modeled as a real inference
 * opener would have to make — flagged simplification.
 */
function openerAfterKeycards(opener: Hand, responder: Hand, trump: Suit, responseBid: string): Recommendation {
  const M = DEN[trump];
  const total = keycards(opener, trump) + keycards(responder, trump);
  if (total >= 4) {
    return { best: "6" + M, acceptable: [], explanationIfNotBest: `Roman Keycard Blackwood: ${Math.min(total, 5)} of 5 keycards between the hands — bid the small slam.` };
  }
  // When trump is hearts, the "2 (or 5) without the queen" response is itself
  // "5H" — the same call as settling in 5 of the major, so there's nothing left
  // to bid; pass instead of repeating (or trying to bid below) responder's call.
  if (bidRank("5" + M) <= bidRank(responseBid)) {
    return { best: "Pass", acceptable: [], explanationIfNotBest: `Roman Keycard Blackwood: only ${total} of 5 keycards between the hands — too many missing for slam; responder's own call already settled at 5 of the major, so pass.` };
  }
  return { best: "5" + M, acceptable: [], explanationIfNotBest: `Roman Keycard Blackwood: only ${total} of 5 keycards between the hands — too many missing for slam; settle in 5 of the major.` };
}

/* ---------- assemble the full best-line auction ---------- */

export function buildSplinterAuction(opener: Hand, responder: Hand, opening: "1H" | "1S"): SplinterSeatCall[] {
  const calls: SplinterSeatCall[] = [];
  const push = (by: "opener" | "responder", rec: Recommendation) => calls.push({ by, rec });
  const trump = majorOf(opening);
  const M = DEN[trump];

  push("opener", { best: opening, acceptable: [], explanationIfNotBest: "5+ card major, 12-19 HCP, opens 1 of the major." });

  const splinterCall = pickSplinter(responder, opening)!;
  const splinterSuit = SUIT_OF[splinterCall.slice(1)];
  push("responder", {
    best: splinterCall, acceptable: [],
    explanationIfNotBest: `Splinter: 4+ support, 12+ support points, a singleton or void in ${splinterSuit} (not the ace or king) — show the shortness now with a double jump.`,
  });

  if (hasWastedValues(opener, splinterSuit)) {
    push("opener", { best: "4" + M, acceptable: [], explanationIfNotBest: `Wasted values opposite the splinter (a K, Q, or J in ${splinterSuit}) — sign off in game, no slam interest.` });
    push("responder", { best: "Pass", acceptable: [], explanationIfNotBest: "Opener signed off in game; pass." });
    return calls;
  }

  push("opener", { best: "4NT", acceptable: [], explanationIfNotBest: `No wasted values opposite the splinter (nothing higher than the ace in ${splinterSuit}) — the hands fit well; ask for keycards with Roman Keycard Blackwood (1430).` });
  const resp2 = keycardResponse(responder, trump);
  push("responder", resp2);
  push("opener", openerAfterKeycards(opener, responder, trump, resp2.best));
  return calls;
}
