import { Hand, Rank, Recommendation, Suit } from "./types";
import { handHcp, suitLength } from "./eval";
import { bidRank } from "./grade";

/* =============================================================================
   Weak Two Bids: a 6-card suit in diamonds, hearts, or spades (never clubs),
   5-10 HCP, opened at the 2 level. An entirely new opening-bid family —
   opener's hand never qualifies for a normal 1-of-a-major or 1NT opening, so
   this is its own Convention, dealt from its own pool, not a focus within Two
   Over One or No Trump.

   Preemptive jump overcalls and "interference over the weak two" are both
   explicitly about opponents entering the auction, which you scoped out
   ("primary bidding conventions that can be done without opponents being
   involved in bidding") — neither is implemented here.

   Suit-quality gate: per your call, dealt hands must meet the doc's own test
   (2 of the top 3 honors, or 3 of the top 5 with at least one being the ace
   or king — the parenthetical the doc states explicitly, which rules out a
   suit such as Q-J-10-x-x-x with no ace or king; a secondary/general source
   allows that shape, but Patricia Sutton's own doc is this project's
   authority). Vulnerability and seat aren't modeled anywhere else in this
   trainer (see Reverse Drury's own flagged simplification), so the
   vulnerable-strength suit-quality standard is applied uniformly — flagged.
   ============================================================================= */

export type WeakTwoSeatCall = { by: "opener" | "responder"; rec: Recommendation };
export type WeakTwoPair = { opener: Hand; responder: Hand; openSuit: Suit };

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const DEN: Record<Suit, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
const SUIT_OF: Record<string, Suit> = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };
const OPEN_SUITS: Suit[] = ["spades", "hearts", "diamonds"]; // never clubs

export const WEAK_TWO_FOCUS: { id: "mixed"; label: string }[] = [{ id: "mixed", label: "Mixed" }];

function isMajor(s: Suit): boolean { return s === "spades" || s === "hearts"; }
function gameLevel(s: Suit): number { return isMajor(s) ? 4 : 5; } // minor game (diamonds) needs the 5 level

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

/** 2 of the top 3 (A/K/Q), or 3 of the top 5 (A/K/Q/J/10) with at least one ace or king. */
function suitQualityOk(hand: Hand, suit: Suit): boolean {
  const cards = hand[suit];
  const top3 = (["A", "K", "Q"] as Rank[]).filter((h) => cards.includes(h)).length;
  if (top3 >= 2) return true;
  const top5 = (["A", "K", "Q", "J", "10"] as Rank[]).filter((h) => cards.includes(h)).length;
  const hasAK = cards.includes("A") || cards.includes("K");
  return top5 >= 3 && hasAK;
}

/** A qualifying weak-two opening in one specific suit, or null. */
function opensWeakTwoIn(hand: Hand, suit: Suit): boolean {
  if (suitLength(hand, suit) !== 6) return false;
  const hcp = handHcp(hand);
  if (hcp < 5 || hcp > 10) return false;
  if (!suitQualityOk(hand, suit)) return false;
  // Little strength outside the suit: at most one ace or king outside it.
  const outsideHonors = SUITS.filter((s) => s !== suit)
    .reduce((n, s) => n + (hand[s].includes("A") ? 1 : 0) + (hand[s].includes("K") ? 1 : 0), 0);
  if (outsideHonors > 1) return false;
  // No other 4-card major.
  const otherMajors = SUITS.filter((s) => isMajor(s) && s !== suit);
  if (otherMajors.some((s) => suitLength(hand, s) >= 4)) return false;
  return true;
}

function opensWeakTwo(hand: Hand): Suit | null {
  for (const s of OPEN_SUITS) if (opensWeakTwoIn(hand, s)) return s;
  return null;
}

export function dealWeakTwoPair(): WeakTwoPair {
  for (let i = 0; i < 100000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const openSuit = opensWeakTwo(op);
      if (!openSuit) continue;
      return { opener: op, responder: resp, openSuit };
    }
  }
  const { a, b } = dealTwoHands();
  return { opener: a, responder: b, openSuit: "hearts" };
}

/* ---------- responder's decision (captain of the hand) ---------- */

/** A crude but concrete notrump-stopper test: ace; king with a guard; or Q-J with a guard. */
function hasStopper(hand: Hand, suit: Suit): boolean {
  const c = hand[suit];
  if (c.includes("A")) return true;
  if (c.includes("K") && c.length >= 2) return true;
  if (c.includes("Q") && c.includes("J") && c.length >= 2) return true;
  return false;
}

function cheapestCallIn(suit: Suit, aboveBid: string): string {
  for (let level = 2; level <= 7; level++) {
    const call = level + DEN[suit];
    if (bidRank(call) > bidRank(aboveBid)) return call;
  }
  return "7" + DEN[suit];
}

export function weakTwoResponse(responder: Hand, openSuit: Suit): Recommendation {
  const hcp = handHcp(responder);
  const tc = suitLength(responder, openSuit);
  const openBid = "2" + DEN[openSuit];

  // 3NT: opener's weak two is in diamonds (a preempt in a minor), responder has no real
  // diamond fit but can count 9 tricks with the other three suits stopped.
  if (openSuit === "diamonds" && tc < 2 && hcp >= 13) {
    const others = SUITS.filter((s) => s !== "diamonds");
    if (others.every((s) => hasStopper(responder, s))) {
      return {
        best: "3NT", acceptable: [],
        explanationIfNotBest: "Other three suits stopped with enough tricks to count nine — bid 3NT rather than raising a minor-suit preempt.",
      };
    }
  }

  // Game with support and real values.
  if (tc >= 2 && hcp >= 15) {
    const M = DEN[openSuit];
    return {
      best: gameLevel(openSuit) + M, acceptable: [],
      explanationIfNotBest: `2+ card support and ${hcp} points (better than an opening hand) — the hands fit; bid game outright.`,
    };
  }

  // 2NT: forcing feature ask (15+, no clear fit to just raise to game).
  if (hcp >= 15) {
    return { best: "2NT", acceptable: [], explanationIfNotBest: "15+ points with no clear fit for opener's suit — ask for a feature with the forcing 2NT." };
  }

  // New suit, forcing: 5+ cards, some game interest.
  if (hcp >= 10) {
    const candidates = SUITS.filter((s) => s !== openSuit && suitLength(responder, s) >= 5)
      .sort((a, b) => suitLength(responder, b) - suitLength(responder, a) || bidRank(cheapestCallIn(a, openBid)) - bidRank(cheapestCallIn(b, openBid)));
    if (candidates.length) {
      const s = candidates[0];
      return {
        best: cheapestCallIn(s, openBid), acceptable: [],
        explanationIfNotBest: `5+ cards in ${s} and interest in game — a new suit here is forcing; opener will raise with 3-card support or return to the weak two suit.`,
      };
    }
  }

  // Preemptive raise (Law of Total Tricks approximation — vulnerability isn't modeled
  // anywhere in this trainer, so 4+ support alone triggers the raise-to-game rather
  // than conditioning it on "not vulnerable" the way the doc does — flagged).
  if (tc >= 4) {
    const M = DEN[openSuit];
    return {
      best: gameLevel(openSuit) + M, acceptable: [],
      explanationIfNotBest: "4+ card support: with 6 (opener) + 4 (you) = 10+ trumps, raise all the way to game (Law of Total Tricks) even without extra values.",
    };
  }

  // Simple raise: to play, not forcing (RONF).
  if (tc >= 2) {
    const M = DEN[openSuit];
    return { best: "3" + M, acceptable: [], explanationIfNotBest: "A raise of opener's suit is to play (RONF) — opener should pass." };
  }

  return { best: "Pass", acceptable: [], explanationIfNotBest: "A weak hand with nothing constructive to say — pass." };
}

/** Is this response the forcing "new suit" action (as opposed to 2NT, 3NT, a raise, game, or pass)? */
function isForcingNewSuit(bid: string, openSuit: Suit): boolean {
  if (bid === "2NT" || bid === "3NT" || bid === "Pass") return false;
  const suit = SUIT_OF[bid.slice(1)];
  return !!suit && suit !== openSuit;
}

/* ---------- opener's follow-up (only over 2NT or a new suit — both forcing) ---------- */

function outsideFeatureSuit(opener: Hand, openSuit: Suit): Suit | null {
  const found = SUITS.filter((s) => s !== openSuit && (opener[s].includes("A") || opener[s].includes("K")));
  return found.length ? found[0] : null; // the opening gate caps outside A/K at one, so this is unambiguous
}

function openerAfterFeatureAsk(opener: Hand, openSuit: Suit): Recommendation {
  const hcp = handHcp(opener);
  if (hcp <= 7) {
    return { best: "3" + DEN[openSuit], acceptable: [], explanationIfNotBest: "Minimum (5-7) with no outside feature — rebid your suit at the 3 level." };
  }
  const feature = outsideFeatureSuit(opener, openSuit);
  if (feature) {
    return {
      best: "3" + DEN[feature], acceptable: [],
      explanationIfNotBest: `Maximum (8-10) with an outside feature — show the ace or king in ${feature}.`,
    };
  }
  return { best: "3NT", acceptable: [], explanationIfNotBest: "Maximum (8-10) with no outside feature — a solid suit runs itself in notrump; bid 3NT." };
}

function openerAfterNewSuit(opener: Hand, openSuit: Suit, newSuit: Suit, responderBid: string): Recommendation {
  if (suitLength(opener, newSuit) >= 3) {
    const raiseLevel = parseInt(responderBid[0], 10) + 1;
    return {
      best: raiseLevel + DEN[newSuit], acceptable: [],
      explanationIfNotBest: `3-card support for your ${newSuit} — raise it.`,
    };
  }
  return {
    best: cheapestCallIn(openSuit, responderBid), acceptable: [],
    explanationIfNotBest: `No support for ${newSuit} — return to your own suit at the lowest available level.`,
  };
}

/* ---------- assemble the full best-line auction ---------- */

export function buildWeakTwoAuction(opener: Hand, responder: Hand, openSuit: Suit): WeakTwoSeatCall[] {
  const calls: WeakTwoSeatCall[] = [];
  const push = (by: "opener" | "responder", rec: Recommendation) => calls.push({ by, rec });

  push("opener", {
    best: "2" + DEN[openSuit], acceptable: [],
    explanationIfNotBest: "6-card suit, 5-10 HCP, sound suit quality, little outside strength, no other 4-card major — open a weak two.",
  });

  const resp = weakTwoResponse(responder, openSuit);
  push("responder", resp);

  if (resp.best === "2NT") {
    push("opener", openerAfterFeatureAsk(opener, openSuit));
  } else if (isForcingNewSuit(resp.best, openSuit)) {
    const newSuit = SUIT_OF[resp.best.slice(1)];
    push("opener", openerAfterNewSuit(opener, openSuit, newSuit, resp.best));
  }
  // 3NT, a raise, a direct game bid, or Pass are all non-forcing — opener must not bid again.

  return calls;
}
