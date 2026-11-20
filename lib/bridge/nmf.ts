import { Hand, Recommendation, Suit } from "./types";
import { assertValidPair } from "./dealValidate";
import { countShortages, handHcp, rankHcp, suitLength } from "./eval";

/* =============================================================================
   New Minor Forcing (NMF) -- Patricia Sutton, 2022 (convention 12), RESPONDER
   practice only (opener-role drills are a later release).

   Practice shape: the WHOLE auction is dealt and the user bids every call of their
   own seat (responder: the 1M response, the NMF call, the placing call; opener: the
   opening, the 1NT rebid, the reply to NMF). Three kinds of deal keep NMF from being
   automatic -- "nmf" (5-card major, 11-14: bid NMF) and two decoys where NMF is NOT
   best: "six" (6+ card major: invite 3M / bid 4M) and "four" (only a 4-card major,
   balanced: natural 2NT invite / 3NT).

   Auction family (responder's major is bid, opener rebids 1NT = 12-14 balanced):
     (a) 1C/1D - 1H/1S - 1NT - NMF (the unbid minor: 2D over 1C, 2C over 1D)
     (c) 1H - 1S - 1NT - NMF (no minor has been bid; responder uses her BETTER
         minor -- Sutton: "may be semi-natural")
   NMF is artificial and forcing for one round, shows 11+ points, and asks opener
   whether she has 3-card support for responder's major (or, over a 1S response,
   4 hearts). It is NOT used in competition. Not built yet (no reply tables in the
   Sutton doc): NMF after a 2C/2D minor rebid, and the 3-level NMF over 2NT.

   Opener's reply (Sutton's table, with the priority order below):
     1. 4 hearts (over a 1S response, variants a only)          -> 2H (takes priority
                                                                   over spade support)
     2. 3-card support: 12-13 HCP -> 2M, 14 HCP -> 3M
     3. otherwise, minimum (12-13): 2NT with stoppers in both unbid suits, else the
        cheap rebid of the opening suit (2D / 2H). Over 1C the cheap rebid (2C) is
        BELOW the 2D NMF bid and therefore illegal, so 2NT is the minimum reply there.
     4. otherwise, maximum (14): 5+ cards in the opening minor (3m), else the other
        minor with 4 cards (3m), else 3NT. In variant (c) the maximum reply is 3NT
        with both minors stopped, else 3H.

   Responder's choices (all thresholds beyond Sutton's own text are flagged
   judgment calls -- see NMF_INTEGRATION notes):
     - the NMF call itself (5-card major, 11-14 HCP); with a 6+ card major NMF is
       optional: invite (3M, 11-12) or game (4M, 13+) is best and NMF is acceptable.
     - the placing call after opener's reply, per responderPlace() below.
   ============================================================================= */

export type NMFSeatCall = { by: "opener" | "responder"; rec: Recommendation };
export type NMFOpening = "1C" | "1D" | "1H";
export type NMFVariant = "minor" | "major"; // (a) minor opening / (c) 1H-1S-1NT
export type NMFKind = "nmf" | "six" | "four";
export type NMFPair = {
  opener: Hand;
  responder: Hand;
  opening: NMFOpening;
  response: "1H" | "1S";
  major: Suit;      // responder's suit
  nmfSuit: Suit;    // the minor responder bids as NMF
  variant: NMFVariant;
  kind: NMFKind;    // nmf = NMF is best; six / four = decoys (see header)
};

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const DEN: Record<Suit, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
const GLYPH: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };

function isBalanced(h: Hand): boolean {
  const sh = countShortages(h);
  return sh.voids === 0 && sh.singletons === 0 && sh.doubletons <= 1;
}

/**
 * Stopper test (judgment call -- Sutton gives no definition): the ace; the king
 * with at least one other card; the queen with at least two others; the jack with
 * at least three others.
 */
export function stopped(h: Hand, s: Suit): boolean {
  const c = h[s], n = c.length;
  if (c.includes("A")) return true;
  if (c.includes("K") && n >= 2) return true;
  if (c.includes("Q") && n >= 3) return true;
  if (c.includes("J") && n >= 4) return true;
  return false;
}

function suitHcp(h: Hand, s: Suit): number {
  return h[s].reduce((sum, r) => sum + rankHcp(r as never), 0);
}

/**
 * Variant (c) NMF suit: the longer minor; equal length -> the one with more HCP;
 * still equal -> clubs (judgment call -- Sutton says only "choose her better minor").
 */
export function betterMinor(h: Hand): Suit {
  const c = h.clubs.length, d = h.diamonds.length;
  if (d > c) return "diamonds";
  if (c > d) return "clubs";
  return suitHcp(h, "diamonds") > suitHcp(h, "clubs") ? "diamonds" : "clubs";
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
  assertValidPair(a, b, "nmf");
  return { a, b };
}

/** Opening suit for a balanced 12-14 hand with no 5-card major: longer minor; 4-4 -> 1D; 3-3 -> 1C. */
function minorOpening(h: Hand): "1C" | "1D" {
  const d = h.diamonds.length, c = h.clubs.length;
  if (d > c) return "1D";
  if (c > d) return "1C";
  return d >= 4 ? "1D" : "1C";
}

/** Responder's suit: the longer major (5+); equal lengths -> spades. */
function responseSuit(h: Hand): Suit | null {
  const sp = h.spades.length, he = h.hearts.length;
  if (sp >= 5 && sp >= he) return "spades";
  if (he >= 5 && he > sp) return "hearts";
  return null;
}

/** Decoy "four": no 5-card major; responder bids a 4-card major (hearts first when 4-4) and is balanced. */
function fourCardResponse(h: Hand): Suit | null {
  if (suitLength(h, "spades") >= 5 || suitLength(h, "hearts") >= 5) return null;
  if (!isBalanced(h)) return null;
  if (suitLength(h, "hearts") === 4) return "hearts";
  if (suitLength(h, "spades") === 4) return "spades";
  return null;
}

function tryPair(op: Hand, resp: Hand, majorVariant: boolean, kind: NMFKind): NMFPair | null {
  const rHcp = handHcp(resp);
  if (rHcp < 11 || rHcp > 14) return null;
  const major = kind === "four" ? fourCardResponse(resp) : responseSuit(resp);
  if (!major) return null;
  const mlen = suitLength(resp, major);
  if (kind === "six" ? mlen < 6 : kind === "nmf" ? mlen !== 5 : mlen !== 4) return null;
  if (kind === "four" && majorVariant) return null;

  const oHcp = handHcp(op);
  if (oHcp < 12 || oHcp > 14 || !isBalanced(op)) return null;

  if (majorVariant) {
    // 1H - 1S - 1NT: 5 hearts, balanced; spades <= 3 (4 spades would have raised).
    if (major !== "spades") return null;
    if (suitLength(op, "hearts") !== 5 || suitLength(op, "spades") > 3) return null;
    return { opener: op, responder: resp, opening: "1H", response: "1S", major, nmfSuit: betterMinor(resp), variant: "major", kind };
  }

  // 1m - 1M - 1NT: no 5-card major (it would have been opened); no 4+ support for
  // the response; over a 1H response no 4 spades either (opener would have bid 1S).
  if (suitLength(op, "spades") >= 5 || suitLength(op, "hearts") >= 5) return null;
  if (suitLength(op, major) >= 4) return null;
  if (major === "hearts" && suitLength(op, "spades") >= 4) return null;
  const opening = minorOpening(op);
  return {
    opener: op, responder: resp, opening, response: major === "spades" ? "1S" : "1H", major,
    nmfSuit: opening === "1D" ? "clubs" : "diamonds", variant: "minor", kind,
  };
}

/** Which kind of reply opener's call is, as responder's placing ladder needs it. */
type ReplyKind = "hearts4" | "support_min" | "support_max" | "nt_min" | "cheap_min" | "nt3_max" | "minor_max";
function replyKind(p: NMFPair, reply: string): ReplyKind {
  const M = DEN[p.major];
  if (reply === "2" + M) return "support_min";
  if (reply === "3" + M) return "support_max";
  if (p.variant === "minor" && p.major === "spades" && reply === "2H") return "hearts4";
  if (reply === "2NT") return "nt_min";
  if (reply === "3NT") return "nt3_max";
  if (reply === "2D" || reply === "2H") return "cheap_min"; // the cheap rebid of the opening suit
  return "minor_max"; // 3C / 3D / 3H
}
const MIN_KINDS: ReplyKind[] = ["support_min", "nt_min", "cheap_min"];

/**
 * Deal a pair. decoy=false -> kind "nmf" (NMF is best). decoy=true -> a "six" or
 * "four" hand (NMF is not best). For kind "nmf" the deal never contains a 2H
 * (4-hearts) reply -- Sutton doesn't say how the auction continues there -- and never
 * a responder with exactly 12 HCP facing a MINIMUM reply, the invitational zone, which
 * the doc doesn't resolve (any 3-level bid is forcing).
 */
export function dealNMFPair(decoy: boolean): NMFPair {
  const kind: NMFKind = decoy ? (Math.random() < 0.5 ? "six" : "four") : "nmf";
  const majorVariant = Math.random() < 0.25;
  for (let i = 0; i < 200000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const p = tryPair(op, resp, majorVariant, kind);
      if (!p) continue;
      if (kind === "nmf") {
        const k = replyKind(p, openerReply(p).best);
        if (k === "hearts4") continue;
        if (MIN_KINDS.includes(k) && handHcp(resp) === 12) continue;
      }
      return p;
    }
  }
  throw new Error("[nmf] could not deal a valid pair");
}

/* ---------- the bids ---------- */

export function nmfBid(p: NMFPair): string { return "2" + DEN[p.nmfSuit]; }

/** Opener's reply to NMF (Sutton's table + the priority order in the header). */
export function openerReply(p: NMFPair): Recommendation {
  const op = p.opener, M = DEN[p.major], sym = GLYPH[p.major];
  const hcp = handHcp(op);
  const isMax = hcp >= 14;
  const nmfSym = GLYPH[p.nmfSuit];

  // 1. 4 hearts over a 1S response -- takes priority over spade support.
  if (p.variant === "minor" && p.major === "spades" && suitLength(op, "hearts") >= 4) {
    return { best: "2H", acceptable: [], explanationIfNotBest: `New Minor Forcing: 2${GLYPH.hearts} shows 4 hearts (min or max) and takes priority over spade support — you are looking for a 4-4 heart fit.` };
  }
  // 2. 3-card support.
  if (suitLength(op, p.major) === 3) {
    return isMax
      ? { best: "3" + M, acceptable: [], explanationIfNotBest: `New Minor Forcing: 3-card ${sym} support and a maximum (14) — jump to 3${sym}.` }
      : { best: "2" + M, acceptable: [], explanationIfNotBest: `New Minor Forcing: 3-card ${sym} support and a minimum (12-13) — bid 2${sym}.` };
  }
  // 3/4. No support: minimum or maximum, with no 4-card heart suit to show.
  const stoppersOk = p.variant === "major"
    ? stopped(op, "clubs") && stopped(op, "diamonds")
    : stopped(op, p.major === "spades" ? "hearts" : "spades") && stopped(op, p.nmfSuit);
  if (!isMax) {
    if (p.opening === "1C") {
      return { best: "2NT", acceptable: [], explanationIfNotBest: `New Minor Forcing over 1${GLYPH.clubs}: no support, no 4 hearts, minimum — the cheap rebid (2${GLYPH.clubs}) is below the 2${nmfSym} NMF bid, so 2NT is the minimum reply.` };
    }
    if (stoppersOk) {
      return { best: "2NT", acceptable: [], explanationIfNotBest: "New Minor Forcing: no support, no 4 hearts, a minimum with stoppers in the unbid suits — bid 2NT." };
    }
    const cheap = p.opening === "1D" ? "2D" : "2H";
    return { best: cheap, acceptable: [], explanationIfNotBest: `New Minor Forcing: no support, no 4 hearts, a minimum — the cheap rebid of your suit (${cheap[0]}${GLYPH[p.opening === "1D" ? "diamonds" : "hearts"]}) says so.` };
  }
  // maximum
  if (p.variant === "major") {
    return stoppersOk
      ? { best: "3NT", acceptable: [], explanationIfNotBest: "New Minor Forcing: no spade support, a maximum, and both minors stopped — bid 3NT." }
      : { best: "3H", acceptable: [], explanationIfNotBest: `New Minor Forcing: no spade support, a maximum, minors not both stopped — rebid your 5-card heart suit at the 3 level.` };
  }
  if (p.opening === "1D") {
    if (suitLength(op, "diamonds") >= 5) return { best: "3D", acceptable: [], explanationIfNotBest: `New Minor Forcing: a maximum with 5+ diamonds — rebid 3${GLYPH.diamonds}.` };
    if (suitLength(op, "clubs") >= 4) return { best: "3C", acceptable: [], explanationIfNotBest: `New Minor Forcing: a maximum with 4 clubs — bid 3${GLYPH.clubs}.` };
  } else {
    if (suitLength(op, "clubs") >= 5) return { best: "3C", acceptable: [], explanationIfNotBest: `New Minor Forcing: a maximum with 5+ clubs — rebid 3${GLYPH.clubs}.` };
    if (suitLength(op, "diamonds") >= 4) return { best: "3D", acceptable: [], explanationIfNotBest: `New Minor Forcing: a maximum with 4 diamonds — bid 3${GLYPH.diamonds}.` };
  }
  return { best: "3NT", acceptable: [], explanationIfNotBest: "New Minor Forcing: no support, no 4 hearts, a maximum with stoppers — bid 3NT." };
}

/** Responder's NMF call (or, with a 6+ card major, the direct alternatives). */
export function responderNMFCall(p: NMFPair): Recommendation {
  const hcp = handHcp(p.responder), M = DEN[p.major], sym = GLYPH[p.major];
  const bid = nmfBid(p);
  if (p.kind === "four") {
    const best = hcp >= 13 ? "3NT" : "2NT";
    return {
      best, acceptable: [],
      explanationIfNotBest: `With only a 4-card major there is no 5-card suit to find a fit for, so New Minor Forcing isn't needed: bid it naturally \u2014 ${hcp >= 13 ? "3NT with 13+" : "2NT inviting with 11-12"}.`,
    };
  }
  if (p.kind === "six") {
    const best = hcp >= 13 ? "4" + M : "3" + M;
    return {
      best, acceptable: [bid],
      explanationIfNotBest: hcp >= 13
        ? `With a 6+ card ${sym} you don't need New Minor Forcing: you know the fit is there — bid game, 4${sym}, with 13+. (NMF is also acceptable.)`
        : `With a 6+ card ${sym} you don't need New Minor Forcing: invite with 3${sym} on 11-12. (NMF is also acceptable.)`,
    };
  }
  const ask = p.major === "spades" && p.variant === "minor" ? "3-card spade support, or 4 hearts" : `3-card ${p.major} support`;
  return p.variant === "major"
    ? { best: bid, acceptable: [], explanationIfNotBest: `New Minor Forcing: 1${GLYPH.hearts}-1${GLYPH.spades}-1NT has bid both majors and no minor, so bid your better minor (${bid[0]}${GLYPH[p.nmfSuit]}) as the artificial, forcing NMF — 11+ HCP, asking about ${ask}.` }
    : { best: bid, acceptable: [], explanationIfNotBest: `New Minor Forcing: partner rebid 1NT (12-14 balanced) and you hold 11+ HCP with a 5-card ${sym} — bid the unbid minor (${bid[0]}${GLYPH[p.nmfSuit]}), artificial and forcing, asking about ${ask}.` };
}

/** Responder's placing call after opener's reply. See the judgment calls in the header. */
export function responderPlace(p: NMFPair, reply: string): Recommendation {
  const R = handHcp(p.responder), M = DEN[p.major], sym = GLYPH[p.major];
  switch (replyKind(p, reply)) {
    case "support_max":
      return { best: "4" + M, acceptable: [], explanationIfNotBest: `Opener showed a maximum with 3-card ${sym} support — you must get to game: 4${sym}.` };
    case "nt3_max":
      return { best: "Pass", acceptable: [], explanationIfNotBest: "Opener showed a maximum with stoppers and bid game; pass 3NT." };
    case "minor_max":
      return { best: "3NT", acceptable: ["4" + M], explanationIfNotBest: "Opener showed a maximum and denied support — you must get to game; 3NT (4 of your major with a 5-2 fit is also reasonable)." };
    case "support_min":
      return R >= 13
        ? { best: "4" + M, acceptable: [], explanationIfNotBest: `Opener has 3-card ${sym} support and a minimum (12-13); with 13+ you have game values — bid 4${sym}.` }
        : R === 11
          ? { best: "Pass", acceptable: [], explanationIfNotBest: `Opener has 3-card ${sym} support and a minimum — with only 11 HCP there is no game; pass 2${sym}.` }
          : { best: "3" + M, acceptable: ["4" + M], explanationIfNotBest: `A minimum plus 12 is the invitational zone — 3${sym}.` }; // not dealt
    case "nt_min":
      return R >= 13
        ? { best: "3NT", acceptable: ["4" + M], explanationIfNotBest: "Opener has a minimum with stoppers, no fit; with 13+ you have game values — 3NT." }
        : R === 11
          ? { best: "Pass", acceptable: [], explanationIfNotBest: "Opener has a minimum with stoppers and no fit; with only 11 HCP there is no game — pass 2NT." }
          : { best: "3NT", acceptable: ["Pass"], explanationIfNotBest: "Invitational zone." }; // not dealt
    case "cheap_min": {
      return R >= 13
        ? { best: "3NT", acceptable: ["4" + M], explanationIfNotBest: "Opener has a minimum and denied support; with 13+ you have game values — 3NT." }
        : R === 11
          ? { best: "2" + M, acceptable: [], explanationIfNotBest: `Opener has a minimum and denied support; with only 11 HCP sign off in your 5-card suit, 2${sym} — opener may pass a 2-level bid.` }
          : { best: "3NT", acceptable: ["2" + M], explanationIfNotBest: "Invitational zone." }; // not dealt
    }
    case "hearts4":
    default:
      // Not dealt in drills: Sutton's doc doesn't say how the auction continues after 2H.
      return { best: "3NT", acceptable: [], explanationIfNotBest: "Continuation after opener's 2♥ is not covered by the Sutton doc." };
  }
}

/* ---------- assemble the best-line auction ---------- */

/** Opener's decision after a natural invitation (3M with a 6-card suit, or 2NT): accept with the maximum (14). */
function openerAfterInvite(p: NMFPair, invite: string): Recommendation {
  const isMax = handHcp(p.opener) >= 14;
  const accept = invite === "2NT" ? "3NT" : "4" + DEN[p.major];
  return isMax
    ? { best: accept, acceptable: [], explanationIfNotBest: "Responder invited and you hold the maximum (14) \u2014 accept and bid game." }
    : { best: "Pass", acceptable: [], explanationIfNotBest: "Responder invited and you hold a minimum (12-13) \u2014 decline by passing." };
}

export function buildNMFAuction(p: NMFPair): NMFSeatCall[] {
  const calls: NMFSeatCall[] = [];
  const push = (by: "opener" | "responder", rec: Recommendation) => calls.push({ by, rec });

  const openWhy = p.opening === "1H"
    ? "A balanced 12-14 hand with a 5-card heart suit opens 1\u2665."
    : "A balanced 12-14 hand with no 5-card major opens its longer minor (1\u2666 with 4-4 minors, 1\u2663 with 3-3).";
  push("opener", { best: p.opening, acceptable: [], explanationIfNotBest: openWhy });
  // A jump shift in the major (2H / 2S) is an acceptable alternative with game-forcing values
  // (13+ HCP) and a 5+ card major; the one-level response is still best (it is forcing and keeps room).
  const jumpShift = handHcp(p.responder) >= 13 && suitLength(p.responder, p.major) >= 5 ? ["2" + DEN[p.major]] : [];
  push("responder", { best: p.response, acceptable: jumpShift, explanationIfNotBest: `Your longest major (${p.kind === "four" ? "4" : "5+"} cards) \u2014 bid it up the line at the one level.${jumpShift.length ? " A jump shift (" + jumpShift[0][0] + GLYPH[p.major] + ") is acceptable with 13+ HCP, but the one-level response is best." : ""}` });
  push("opener", { best: "1NT", acceptable: [], explanationIfNotBest: "Balanced 12-14 with no 4-card support for your major \u2014 rebid 1NT." });
  const call = responderNMFCall(p);
  push("responder", call);

  if (p.kind === "nmf") {
    const reply = openerReply(p);
    push("opener", reply);
    push("responder", responderPlace(p, reply.best));
    return calls;
  }
  if (call.best === "3NT" || call.best === "4" + DEN[p.major]) return calls; // game bid: auction over
  push("opener", openerAfterInvite(p, call.best)); // 3M or 2NT invitation
  return calls;
}

