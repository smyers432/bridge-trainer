import { Hand, Recommendation, Suit } from "./types";
import { countShortages, handHcp, suitLength, suitLosers, supportPoints } from "./eval";
import { hasHelp } from "./auction2";

/* =============================================================================
   Reverse Drury: used ONLY when partner opens 1H or 1S in the 3rd or 4th seat
   (i.e. after 1-2 prior passes), and responder — having already passed — holds
   3+-card support and 10+ support points. Responder's 2C is artificial and
   forcing, asking whether opener opened light or has a full opener.

   Opener's rebid ladder (all thresholds beyond the doc's own examples are
   judgment calls — flagged as resolutions, same as the V3/V3.1 pattern):
     18+                                        -> 3NT (choice of game)
     15-17 balanced                             -> 2NT
     10-11 (light)                              -> 2M (no interest in game)
     12-17, has a qualifying ask-suit           -> new-suit ask (HSGT-style;
                                                    only spades/clubs over 1H or
                                                    hearts/clubs over 1S qualify,
                                                    since 2D is claimed by the relay)
     12-14, no ask-suit                         -> 2D relay (full, nothing extra)
     15-17 unbalanced, no ask-suit              -> 4M (game, no slam interest —
                                                    folds the doc's separate "3M
                                                    invite" case into the game bid;
                                                    flagged simplification)

   Responder's follow-up depends on which rebid opener made; see the
   responderAfter* functions below. The 2D relay's own follow-up can itself be
   an invitation (3M), which then needs one more call from opener.
   ============================================================================= */

export type DrurySeatCall = { by: "opener" | "responder"; rec: Recommendation };
export type DruryPair = { opener: Hand; responder: Hand; opening: "1H" | "1S" };

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const DEN: Record<Suit, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
const SUIT_OF: Record<string, Suit> = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };

function majorOf(opening: "1H" | "1S"): Suit { return opening === "1S" ? "spades" : "hearts"; }
function isBalanced(h: Hand): boolean {
  const sh = countShortages(h);
  return sh.voids === 0 && sh.singletons === 0 && sh.doubletons <= 1;
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
  return { a: take(deck.slice(0, 13)), b: take(deck.slice(13, 26)) };
}

/**
 * A 3rd/4th-seat major opening: 5+ card major, 10-19 HCP (the light end, 10-11,
 * is what the Rule of 15 / a light 3rd-seat opening allows; we don't model the
 * exact seat or spade-count rule, just the resulting HCP floor — flagged).
 */
function opensMajorLate(h: Hand): "1H" | "1S" | null {
  const hcp = handHcp(h);
  if (hcp < 10 || hcp > 19) return null;
  const sp = suitLength(h, "spades"), he = suitLength(h, "hearts");
  if (sp >= 5 && sp >= he) return "1S";
  if (he >= 5 && he > sp) return "1H";
  return null;
}

/** Responder has already passed: cap raw HCP so the hand doesn't look like an opener of its own. */
function qualifiesForDrury(resp: Hand, opening: "1H" | "1S"): boolean {
  if (handHcp(resp) > 12) return false;
  const trump = majorOf(opening);
  const tc = suitLength(resp, trump);
  if (tc < 3) return false;
  return supportPoints(resp, trump, tc) >= 10;
}

export function dealDruryPair(): DruryPair {
  for (let i = 0; i < 100000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      const opening = opensMajorLate(op);
      if (!opening) continue;
      if (!qualifiesForDrury(resp, opening)) continue;
      return { opener: op, responder: resp, opening };
    }
  }
  const { a, b } = dealTwoHands();
  return { opener: a, responder: b, opening: "1H" };
}

/* ---------- opener's rebid over 2C ---------- */

type RebidKind = "light" | "relay" | "ask" | "bal_15_17" | "bal_18plus" | "game";

function classifyOpenerRebid(opener: Hand, opening: "1H" | "1S"): { kind: RebidKind; askSuit?: Suit } {
  const hcp = handHcp(opener);
  if (hcp >= 18) return { kind: "bal_18plus" };
  if (hcp >= 15 && hcp <= 17 && isBalanced(opener)) return { kind: "bal_15_17" };
  if (hcp <= 11) return { kind: "light" };

  // Over 1H, spades is excluded even though the doc lists it as a candidate:
  // spades outranks hearts, so an ask in 3S followed by a "decline" back to "3
  // of the major" would require bidding 3H *after* 3S — an illegal downward
  // call. Only a suit that ranks below the agreed trump can be a help-suit ask
  // (which is also why diamonds is off the table over 1S: it's claimed by the
  // relay, not because of rank). Clubs is always safe since it ranks lowest.
  // (Bug: this used to include spades over 1H and produced illegal auctions
  // like 1H-2C-3S-3H in about 2% of Reverse Drury hands. Flagged and fixed at
  // the user's request.)
  const askCandidates: Suit[] = opening === "1H" ? ["clubs"] : ["hearts", "clubs"];
  const qualifying = askCandidates
    .map((s) => ({ s, losers: suitLosers(opener, s) }))
    .filter((c) => suitLength(opener, c.s) >= 3 && c.losers >= 2)
    .sort((a, b) => b.losers - a.losers);
  if (qualifying.length) return { kind: "ask", askSuit: qualifying[0].s };
  if (hcp <= 14) return { kind: "relay" };
  return { kind: "game" }; // 15-17 unbalanced, no ask-suit: folds the doc's separate 3M-invite case
}

function openerDruryRebid(opener: Hand, opening: "1H" | "1S"): Recommendation {
  const trump = majorOf(opening);
  const M = DEN[trump];
  const c = classifyOpenerRebid(opener, opening);
  if (c.kind === "light") return { best: "2" + M, acceptable: [], explanationIfNotBest: "Reverse Drury: opened light in a late seat — show minimum, no interest in game." };
  if (c.kind === "relay") return { best: "2D", acceptable: [], explanationIfNotBest: "Reverse Drury: a full opening hand (12-14), nothing extra — relay with 2♦ for responder to describe further." };
  if (c.kind === "ask") return { best: "3" + DEN[c.askSuit!], acceptable: [], explanationIfNotBest: `Reverse Drury: extra values with a suit that needs help — ask about ${c.askSuit} (Help Suit Game Try style).` };
  if (c.kind === "bal_15_17") return { best: "2NT", acceptable: [], explanationIfNotBest: "Reverse Drury: 15-17 balanced — show it with 2NT." };
  if (c.kind === "bal_18plus") return { best: "3NT", acceptable: [], explanationIfNotBest: "Reverse Drury: 18+ — offer a choice of game with 3NT." };
  return { best: "4" + M, acceptable: [], explanationIfNotBest: "Reverse Drury: clear extra values, no slam interest — bid game." };
}

/* ---------- responder's follow-ups ---------- */

function responderAfterLight(): Recommendation {
  return { best: "Pass", acceptable: [], explanationIfNotBest: "Opener admitted a light opening; respect it and pass." };
}

function responderAfterRelay(responder: Hand, trump: Suit): Recommendation {
  const M = DEN[trump];
  const supp = supportPoints(responder, trump, suitLength(responder, trump));
  if (supp >= 13) return { best: "4" + M, acceptable: [], explanationIfNotBest: "Reverse Drury: opener confirmed a full opener and you hold a big hand (13+) — bid game." };
  if (supp >= 11) return { best: "3" + M, acceptable: [], explanationIfNotBest: "Reverse Drury: opener confirmed a full opener; invite with 11-12 — bid 3 of the major." };
  return { best: "2" + M, acceptable: [], explanationIfNotBest: "Reverse Drury: opener confirmed a full opener but nothing extra; sign off with your minimum (10)." };
}

function openerAfterRelayInvite(opener: Hand, trump: Suit): Recommendation {
  const M = DEN[trump];
  return handHcp(opener) >= 14
    ? { best: "4" + M, acceptable: [], explanationIfNotBest: "Reverse Drury: a bit extra (14) accepts the invite — bid game." }
    : { best: "Pass", acceptable: [], explanationIfNotBest: "Reverse Drury: a bare minimum (12-13) declines the invite — pass." };
}

function responderAfterAsk(responder: Hand, trump: Suit, askSuit: Suit): Recommendation {
  const M = DEN[trump];
  const atMax = supportPoints(responder, trump, suitLength(responder, trump)) >= 13;
  const help = hasHelp(responder, askSuit, atMax);
  return help
    ? { best: "4" + M, acceptable: [], explanationIfNotBest: `Reverse Drury: you have help in ${askSuit} — accept and bid game.` }
    : { best: "3" + M, acceptable: [], explanationIfNotBest: `Reverse Drury: no help in ${askSuit} — decline and return to 3 of the major.` };
}

function responderAfterBal15_17(responder: Hand, trump: Suit): Recommendation {
  const M = DEN[trump];
  return isBalanced(responder)
    ? { best: "3NT", acceptable: [], explanationIfNotBest: "Reverse Drury: opener is balanced 15-17 and so are you — prefer notrump." }
    : { best: "4" + M, acceptable: [], explanationIfNotBest: "Reverse Drury: opener is balanced but you have shape — play game in the major." };
}

function responderAfterBal18plus(responder: Hand, trump: Suit): Recommendation {
  const M = DEN[trump];
  return isBalanced(responder)
    ? { best: "Pass", acceptable: [], explanationIfNotBest: "Reverse Drury: opener offered a choice of games (18+); you're balanced too — accept 3NT." }
    : { best: "4" + M, acceptable: [], explanationIfNotBest: "Reverse Drury: opener offered a choice of games; your shape says play the major — correct to game there." };
}

function responderAfterGame(): Recommendation {
  return { best: "Pass", acceptable: [], explanationIfNotBest: "Opener already bid game with no slam interest; pass." };
}

/* ---------- assemble the full best-line auction ---------- */

export function buildDruryAuction(opener: Hand, responder: Hand, opening: "1H" | "1S"): DrurySeatCall[] {
  const calls: DrurySeatCall[] = [];
  const push = (by: "opener" | "responder", rec: Recommendation) => calls.push({ by, rec });
  const trump = majorOf(opening);
  const M = DEN[trump];

  push("opener", { best: opening, acceptable: [], explanationIfNotBest: "5+ card major opens light in a late seat, or with a full opening hand." });
  push("responder", { best: "2C", acceptable: [], explanationIfNotBest: "Reverse Drury: already passed, 3+ support and 10+ points — ask whether partner opened light or has a full opener." });

  const rebid = openerDruryRebid(opener, opening);
  push("opener", rebid);

  if (rebid.best === "2" + M) { push("responder", responderAfterLight()); return calls; }
  if (rebid.best === "2D") {
    const cont = responderAfterRelay(responder, trump);
    push("responder", cont);
    if (cont.best === "3" + M) push("opener", openerAfterRelayInvite(opener, trump));
    return calls;
  }
  if (rebid.best === "2NT") { push("responder", responderAfterBal15_17(responder, trump)); return calls; }
  if (rebid.best === "3NT") { push("responder", responderAfterBal18plus(responder, trump)); return calls; }
  if (rebid.best === "4" + M) { push("responder", responderAfterGame()); return calls; }

  // otherwise it's the suit ask: "3" + DEN[askSuit]
  const askSuit = SUIT_OF[rebid.best.slice(1)];
  push("responder", responderAfterAsk(responder, trump, askSuit));
  return calls;
}
