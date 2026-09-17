import { Hand, Rank, Recommendation, Suit } from "./types";
import { countShortages, handHcp, suitLength } from "./eval";
import { recommendResponder } from "./recommend";

/* =============================================================================
   V2 Stayman auction engine.
   Scope (v1 of V2): uncontested; opener is a 15-17 balanced 1NT with AT MOST ONE
   4-card major; responder is balanced (4432/4333) with a 4-card major and 8-12 HCP
   so that 2C Stayman is the system-best first call. This keeps the continuation
   set tight: raise (fit) / 2NT / 3NT / 4M. Both-majors openers, Smolen, and
   5+-suit rebids are deferred to a later V2 pass.
   ============================================================================= */

export type Role = "opener" | "responder";
export type Pair = { opener: Hand; responder: Hand };

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];

function dealTwoHands(): { a: Hand; b: Hand } {
  const deck: Array<{ suit: Suit; rank: Rank }> = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const order: Record<Rank, number> = RANKS.reduce((acc, r, i) => { acc[r] = RANKS.length - i; return acc; }, {} as Record<Rank, number>);
  const take = (cards: Array<{ suit: Suit; rank: Rank }>): Hand => {
    const h: Hand = { spades: [], hearts: [], diamonds: [], clubs: [] };
    for (const c of cards) h[c.suit].push(c.rank);
    for (const s of SUITS) h[s].sort((x, y) => order[y] - order[x]);
    return h;
  };
  return { a: take(deck.slice(0, 13)), b: take(deck.slice(13, 26)) };
}

/** Balanced with no 5-card suit (shapes 4432 / 4333). */
function balancedNo5(h: Hand): boolean {
  const sh = countShortages(h);
  if (sh.voids > 0 || sh.singletons > 0 || sh.doubletons > 1) return false;
  return SUITS.every((s) => suitLength(h, s) <= 4);
}

/** Balanced 1NT shape (4333 / 4432 / 5332). */
function balancedNT(h: Hand): boolean {
  const sh = countShortages(h);
  return sh.voids === 0 && sh.singletons === 0 && sh.doubletons <= 1;
}

function isValidOpener(h: Hand): boolean {
  const hcp = handHcp(h);
  if (hcp < 15 || hcp > 17) return false;
  if (!balancedNT(h)) return false;
  const he = suitLength(h, "hearts"), sp = suitLength(h, "spades");
  if (he > 4 || sp > 4) return false;          // no 5-card major
  if (he === 4 && sp === 4) return false;       // at most one 4-card major (v1 scope)
  return true;
}

function isValidResponder(h: Hand): boolean {
  const hcp = handHcp(h);
  if (hcp < 8 || hcp > 12) return false;
  if (!balancedNo5(h)) return false;
  const has4Major = suitLength(h, "hearts") === 4 || suitLength(h, "spades") === 4;
  if (!has4Major) return false;
  return recommendResponder(h, "1NT").best === "2C"; // Stayman is the best first call
}

export function dealStaymanPair(): Pair {
  for (let i = 0; i < 40000; i++) {
    const { a, b } = dealTwoHands();
    if (isValidOpener(a) && isValidResponder(b)) return { opener: a, responder: b };
    if (isValidOpener(b) && isValidResponder(a)) return { opener: b, responder: a };
  }
  // Fallback (extremely rare): return last attempt shaped as best we can.
  const { a, b } = dealTwoHands();
  return { opener: a, responder: b };
}

/** Opener's rebid after 1NT-2C, given at-most-one 4-card major. */
export function openerStaymanResponse(opener: Hand): "2D" | "2H" | "2S" {
  if (suitLength(opener, "hearts") === 4) return "2H";
  if (suitLength(opener, "spades") === 4) return "2S";
  return "2D";
}

/** Responder's best first call (Stayman for our dealt hands). */
export function responderFirstBest(responder: Hand): Recommendation {
  return recommendResponder(responder, "1NT");
}

/** Opener's best opening call for our dealt hands. */
export function openerFirstBest(): Recommendation {
  return { best: "1NT", acceptable: [], explanationIfNotBest: "15-17 balanced with no 5-card major opens 1NT." };
}

/** Responder's graded continuation after opener's Stayman response. */
export function continuationBest(responder: Hand, openerResp: string): Recommendation {
  const hcp = handHcp(responder);
  const invite = hcp <= 9; // 8-9 invitational; 10-12 game
  const fitMajor: Suit | null = openerResp === "2H" ? "hearts" : openerResp === "2S" ? "spades" : null;
  const fit = fitMajor !== null && suitLength(responder, fitMajor) >= 4;

  if (fit && fitMajor) {
    const threeM = fitMajor === "hearts" ? "3H" : "3S";
    const fourM = fitMajor === "hearts" ? "4H" : "4S";
    if (invite) {
      return { best: threeM, acceptable: ["2NT"],
        explanationIfNotBest: "4-4 major fit + invitational (8-9): raise to 3 of the major. 2NT is an acceptable invite but hides the fit." };
    }
    return { best: fourM, acceptable: ["3NT"],
      explanationIfNotBest: "4-4 major fit + game values (10-12): sign off in 4 of the major. 3NT is playable but the 4-4 fit usually plays better." };
  }

  if (invite) {
    return { best: "2NT", acceptable: [],
      explanationIfNotBest: "No 4-4 major fit + invitational (8-9): invite in notrump with 2NT." };
  }
  return { best: "3NT", acceptable: [],
    explanationIfNotBest: "No 4-4 major fit + game values (10-12): bid 3NT." };
}

/** Convenience: does a 4-4 major fit exist for this pair after Stayman? */
export function fitInfo(pair: Pair, openerResp: string): { fit: boolean; major: Suit | null } {
  const major: Suit | null = openerResp === "2H" ? "hearts" : openerResp === "2S" ? "spades" : null;
  return { fit: major !== null && suitLength(pair.responder, major) >= 4, major };
}
