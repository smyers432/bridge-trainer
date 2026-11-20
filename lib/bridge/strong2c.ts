import { Hand, Rank, Recommendation, Suit } from "./types";
import { assertValidPair } from "./dealValidate";
import { countShortages, handHcp, lengthPoints, suitLength, supportPoints } from "./eval";

/* =============================================================================
   Strong 2-Club opening -- Patricia Sutton, 2016 (convention 20) is the authority;
   David Lindop's "What's Standard?" (Better Bridge, May/June 2005) supplies the
   examples and is overridden wherever the two disagree.

   Opening: 2C is artificial and forcing -- a BALANCED 22+ HCP hand, or an UNBALANCED
   hand worth 22+ points counting distribution.

   Responder (Sutton):
     2D           artificial waiting -- 0-7 points, plus every hand unsuitable for a positive
     2H/2S/3C/3D  positive, 8+ points, game forcing, a "good" 5+ card suit
                  (2 of the top 3 honors)
     2NT          positive, balanced, 8+ points, game forcing

   Opener's rebid after 2D:
     balanced     2NT = 22-24 HCP (not forcing), 3NT = 25-27 HCP (4NT = 28-30: not dealt,
                  the doc itself calls such hands rare and has no agreement for them)
     unbalanced   the longest 5+ card suit (higher-ranking of equal suits); forcing to
                  game unless opener immediately rebids the suit

   Responder's second call:
     over 2NT/3NT   NT-auction methods: Stayman, Jacoby transfers (any strength over 2NT),
                    3NT/pass to play, quantitative 4NT (Gerber is not needed on the
                    hands dealt); over 3NT only with slam interest
     over a major  (Sutton) 3+ trumps & 4+ points -> raise to 3M; 4+ trumps & 0-3 -> 4M;
                  other 0-3 -> 3C double negative; a 5+ card suit; else 2NT. Points =
                  support points when there is a fit, else HCP.

   Scope of the DRILL (the user's call): 2C - response - opener's rebid - responder's
   second call, the last call being the scored one. A POSITIVE response ends the
   auction (the doc says only that it "develops naturally"); positive-response hands
   are dealt to the RESPONDER seat only. Judgment calls beyond Sutton's text are
   marked "(judgment call)" below and listed in V7_NMF_NOTES.md.
   ============================================================================= */

export type S2CSeatCall = { by: "opener" | "responder"; rec: Recommendation };
export type S2CKind = "waiting" | "positive";
export type S2COpenerType = "nt2" | "nt3" | "major";
export type S2CPair = {
  opener: Hand;
  responder: Hand;
  kind: S2CKind;
  openerType: S2COpenerType;
  majorSuit: Suit | null; // the suit opener rebids (openerType "major")
};

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const DEN: Record<Suit, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
const GLYPH: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const RANK_OF: Record<Suit, number> = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };

/** Responder HCP at which a quantitative 4NT slam try is made (judgment call -- Sutton gives no number). */
export const SLAM_OVER_2NT = 9;   // 22-24 + 9 = 31-33+
export const SLAM_OVER_3NT = 7;   // 25-27 + 7 = 32-34+
/** Share of waiting-response deals with a 2NT/3NT rebid in which responder has slam interest. */
const SLAM_SHARE = 0.3;
/** Share of responder-seat deals that are positive responses. */
const POSITIVE_SHARE = 0.2;

function isBalanced(h: Hand): boolean {
  const sh = countShortages(h);
  return sh.voids === 0 && sh.singletons === 0 && sh.doubletons <= 1;
}

/* ---------- classifying hands ---------- */

/**
 * Does this hand open 2C with a rebid the drill models? Returns the rebid type, or null.
 *   balanced 22-24 -> nt2, 25-27 -> nt3 (28+ is not dealt)
 *   unbalanced: HCP + length points >= 22 (judgment call: Sutton's "22+ points including
 *   distribution", counted as 1 per card past the fourth), at least 17 HCP (judgment call),
 *   and the longest suit is a 5+ card MAJOR (judgment call: minor-suit rebids collide with
 *   the 3C double negative and the 5-level minor game, so they are not dealt).
 */
export function classifyOpener(h: Hand): { type: S2COpenerType; suit: Suit | null } | null {
  const hcp = handHcp(h);
  if (isBalanced(h)) {
    if (hcp >= 22 && hcp <= 24) return { type: "nt2", suit: null };
    if (hcp >= 25 && hcp <= 27) return { type: "nt3", suit: null };
    return null;
  }
  if (hcp < 17 || hcp > 30 || hcp + lengthPoints(h) < 22) return null;
  const maxLen = Math.max(...SUITS.map((s) => suitLength(h, s)));
  if (maxLen < 5) return null;
  if (suitLength(h, "spades") === maxLen) return { type: "major", suit: "spades" };
  if (suitLength(h, "hearts") === maxLen) return { type: "major", suit: "hearts" };
  return null;
}

function goodSuit(h: Hand, s: Suit): boolean {
  const c = h[s];
  return c.length >= 5 && (["A", "K", "Q"] as Rank[]).filter((r) => c.includes(r)).length >= 2;
}

/** Responder's positive response: { call } , "ambiguous" (not dealt), or null = a waiting hand. */
export function positiveCall(h: Hand): { call: string; suit: Suit | null } | "ambiguous" | null {
  if (handHcp(h) < 8) return null;
  const good = SUITS.filter((s) => goodSuit(h, s));
  if (good.length > 0) {
    // A balanced hand with a good 5-card suit could show either the suit or 2NT: Sutton
    // doesn't rank them, so such hands are not dealt.
    if (isBalanced(h)) return "ambiguous";
    good.sort((a, b) => suitLength(h, b) - suitLength(h, a) || RANK_OF[b] - RANK_OF[a]);
    const s = good[0];
    const major = s === "spades" || s === "hearts";
    return { call: (major ? "2" : "3") + DEN[s], suit: s };
  }
  if (isBalanced(h)) return { call: "2NT", suit: null };
  return null;
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
  assertValidPair(a, b, "strong2c");
  return { a, b };
}

function slamThreshold(t: S2COpenerType): number { return t === "nt3" ? SLAM_OVER_3NT : SLAM_OVER_2NT; }

/**
 * Deal a pair. allowPositive=false (opener seat) -> always a 2D waiting auction.
 * Target mix of opener rebids in waiting deals: 2NT 35%, 3NT 10%, a major 55%; in 2NT/3NT
 * deals 30% have a responder with slam interest.
 */
export function dealStrong2CPair(allowPositive: boolean): S2CPair {
  const kind: S2CKind = allowPositive && Math.random() < POSITIVE_SHARE ? "positive" : "waiting";
  const r = Math.random();
  const wantType: S2COpenerType = r < 0.35 ? "nt2" : r < 0.45 ? "nt3" : "major";
  const wantSlam = Math.random() < SLAM_SHARE;
  for (let i = 0; i < 400000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const oc = classifyOpener(op);
      if (!oc) continue;
      const pos = positiveCall(resp);
      if (pos === "ambiguous") continue;
      if (kind === "positive") {
        if (pos === null) continue;
        return { opener: op, responder: resp, kind, openerType: oc.type, majorSuit: oc.suit };
      }
      if (pos !== null) continue;                       // waiting deals: a true waiting hand
      if (oc.type !== wantType) continue;
      if (oc.type !== "major") {
        const slam = handHcp(resp) >= slamThreshold(oc.type);
        if (slam !== wantSlam) continue;
      }
      return { opener: op, responder: resp, kind, openerType: oc.type, majorSuit: oc.suit };
    }
  }
  throw new Error("[strong2c] could not deal a valid pair");
}

/* ---------- the bids ---------- */

export function openingRec(): Recommendation {
  return {
    best: "2C",
    acceptable: [],
    explanationIfNotBest: `Strong, artificial, forcing 2${GLYPH.clubs}: a balanced hand of 22+ HCP, or an unbalanced hand worth 22+ points counting distribution.`,
  };
}

export function responderFirstCall(h: Hand): Recommendation {
  const hcp = handHcp(h);
  const pos = positiveCall(h);
  if (pos && pos !== "ambiguous") {
    if (pos.suit) {
      const sym = GLYPH[pos.suit];
      return {
        best: pos.call, acceptable: [],
        explanationIfNotBest: `Positive response: 8+ points and a good 5+ card suit (2 of the top 3 honors) — bid it, ${pos.call[0]}${sym}. Game forcing, and it shows slam interest.`,
      };
    }
    return {
      best: "2NT", acceptable: [],
      explanationIfNotBest: "Positive response: a balanced hand with 8+ points and no good suit to show — 2NT, game forcing.",
    };
  }
  return {
    best: "2D", acceptable: [],
    explanationIfNotBest: hcp <= 7
      ? `With 0-7 points you cannot make a positive response — bid the artificial waiting 2${GLYPH.diamonds} and let opener describe the hand.`
      : `You have 8+ points but neither a good 5+ card suit (2 of the top 3 honors) nor a balanced hand — the hand is unsuitable for a positive response, so bid the artificial waiting 2${GLYPH.diamonds}.`,
  };
}

export function openerRebid(p: S2CPair): Recommendation {
  if (p.openerType === "nt2") {
    return { best: "2NT", acceptable: [], explanationIfNotBest: "Balanced with 22-24 HCP: rebid 2NT. This rebid is not forcing." };
  }
  if (p.openerType === "nt3") {
    return { best: "3NT", acceptable: [], explanationIfNotBest: "Balanced with 25-27 HCP: jump to 3NT." };
  }
  const s = p.majorSuit as Suit;
  const bid = "2" + DEN[s];
  return {
    best: bid, acceptable: [],
    explanationIfNotBest: `Unbalanced: bid your longest 5+ card suit, ${bid[0]}${GLYPH[s]} (the higher-ranking of equal suits). Partner is forced to game unless you immediately rebid the suit.`,
  };
}

/** Cheapest legal call in `suit` above `above` (a 2M rebid). */
function cheapestCall(suit: Suit, above: string): string {
  const rank = (b: string) => parseInt(b[0], 10) * 5 + ["C", "D", "H", "S", "NT"].indexOf(b.slice(1));
  for (let level = 2; level <= 7; level++) {
    const c = level + DEN[suit];
    if (rank(c) > rank(above)) return c;
  }
  return "7" + DEN[suit];
}

/** Responder's longest 5+ card suit other than `except` (higher-ranking of equals), or null. */
function ownSuit(h: Hand, except: Suit | null): Suit | null {
  const cand = SUITS.filter((s) => s !== except && suitLength(h, s) >= 5);
  if (cand.length === 0) return null;
  cand.sort((a, b) => suitLength(h, b) - suitLength(h, a) || RANK_OF[b] - RANK_OF[a]);
  return cand[0];
}

export function responderSecondCall(p: S2CPair, rebid: string): Recommendation {
  const h = p.responder;
  const hcp = handHcp(h);
  const sp = suitLength(h, "spades"), he = suitLength(h, "hearts");

  /* ---- over a notrump rebid: NT-auction methods ---- */
  if (rebid === "2NT" || rebid === "3NT") {
    const lvl = rebid === "2NT" ? 3 : 4; // 3C/3D/3H over 2NT, 4C/4D/4H over 3NT
    const slamAt = rebid === "2NT" ? SLAM_OVER_2NT : SLAM_OVER_3NT;
    const toSpades = sp >= 5 && sp >= he;
    // Over 2NT a 5+ card major always transfers (as after any NT opening: with a weak hand
    // it is the sign-off, with game values opener's completion is followed by 3NT/4M).
    // Over 3NT, which is already game, responder only bids on with slam interest.
    if ((sp >= 5 || he >= 5) && (rebid === "2NT" || hcp >= slamAt)) {
      const bid = lvl + (toSpades ? "H" : "D"); // xH transfers to spades, xD to hearts
      return {
        best: bid, acceptable: [],
        explanationIfNotBest: `Transfers are on after a notrump rebid: with a 5+ card ${toSpades ? "spade" : "heart"} suit bid ${bid[0]}${toSpades ? GLYPH.hearts : GLYPH.diamonds} and let opener complete the transfer, then place the contract (pass with a very weak hand, otherwise game).`,
      };
    }
    const minHcp = rebid === "2NT" ? 4 : slamAt;
    if (hcp < minHcp) {
      return {
        best: "Pass", acceptable: [],
        explanationIfNotBest: rebid === "2NT"
          ? "Opener's 2NT shows 22-24 HCP and is not forcing; with 0-3 points, no 5-card major to transfer to and no game values \u2014 pass."
          : `Opener's 3NT shows 25-27 HCP and is already game; with fewer than ${slamAt} points there is no slam interest \u2014 pass.`,
      };
    }
    if (sp === 4 || he === 4) {
      const bid = lvl + "C";
      return {
        best: bid, acceptable: [],
        explanationIfNotBest: `Stayman is on after a notrump rebid: with a 4-card major bid ${bid[0]}${GLYPH.clubs} to look for a 4-4 fit.`,
      };
    }
    if (hcp >= slamAt) {
      return {
        best: "4NT", acceptable: [],
        explanationIfNotBest: `Quantitative 4NT: no major to show and ${slamAt}+ points opposite ${rebid === "2NT" ? "22-24" : "25-27"} — invite slam; opener bids it with a maximum and passes with a minimum.`,
      };
    }
    return { best: "3NT", acceptable: [], explanationIfNotBest: "You have game values (4+ points opposite 22-24), no major to look for and no slam interest — bid 3NT." };
  }

  /* ---- over a rebid of a major (2H / 2S): Sutton's responder rebids ----
     Points = support points when responder has 3+ trumps (the project's raise metric), else HCP.
       3+ trumps, 4+ points        -> raise to 3M (sets trumps; new suits are then control cuebids)
       4+ trumps, 0-3 points       -> jump raise to game, 4M (good trumps, no slam interest)
       0-3 points otherwise        -> 3C, the double negative
       a 5+ card suit              -> bid it at the cheapest level
       otherwise                   -> the cheapest NT (2NT), a catch-all with no stopper promise */
  const M: Suit = rebid === "2S" ? "spades" : "hearts";
  const sym = GLYPH[M];
  const supp = suitLength(h, M);
  const fit = supp >= 3;
  const pts = fit ? supportPoints(h, M, supp) : hcp;
  if (fit && pts >= 4) {
    return {
      best: "3" + DEN[M], acceptable: [],
      explanationIfNotBest: `With 3+ card ${sym} support and 4+ points, raise to 3${sym}. This sets the trump suit and starts the search for slam (new suits are then first-round control cuebids).`,
    };
  }
  if (supp >= 4) {
    return {
      best: "4" + DEN[M], acceptable: [],
      explanationIfNotBest: `With 4+ card ${sym} support but only 0-3 points, jump raise to game: 4${sym}. This shows good trump support and no interest in slam.`,
    };
  }
  if (pts <= 3) {
    return {
      best: "3C", acceptable: [],
      explanationIfNotBest: `3${GLYPH.clubs} is the double negative: 0-3 points and no suitable raise.`,
    };
  }
  const own = ownSuit(h, M);
  if (own) {
    const bid = cheapestCall(own, rebid);
    return {
      best: bid, acceptable: [],
      explanationIfNotBest: `No ${sym} support: bid your 5+ card suit, ${bid[0]}${GLYPH[own]}. It wasn't good enough for an immediate positive response, so it shows a suit that is not top quality.`,
    };
  }
  return {
    best: "2NT", acceptable: [],
    explanationIfNotBest: "No support, no 5-card suit, 4+ points: bid notrump at the cheapest level, 2NT. It is a catch-all that keeps the auction going and doesn't promise stoppers.",
  };
}

/* ---------- assemble the best-line auction ---------- */

export function buildStrong2CAuction(p: S2CPair): S2CSeatCall[] {
  const calls: S2CSeatCall[] = [];
  calls.push({ by: "opener", rec: openingRec() });
  calls.push({ by: "responder", rec: responderFirstCall(p.responder) });
  if (p.kind === "positive") return calls; // the doc says only that the auction "develops naturally"
  const rb = openerRebid(p);
  calls.push({ by: "opener", rec: rb });
  calls.push({ by: "responder", rec: responderSecondCall(p, rb.best) });
  return calls;
}
