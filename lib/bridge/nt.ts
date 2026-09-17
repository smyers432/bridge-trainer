import { Hand, Recommendation, Suit } from "./types";
import { countShortages, handHcp, suitLength } from "./eval";

/* =============================================================================
   "No Trump" family (opener bids 1NT, 15-17 balanced). Responder chooses:
     - Jacoby transfer  (5+ card major, any strength)         -> 2D / 2H
     - Puppet Stayman   (10+, longest major 3-4, not flat 3-card) -> 3C
     - 3NT              (10-15, no usable major)                -> 3NT
     - Quantitative 4NT (16-17, no usable major)                -> 4NT
     - Stayman          (8-9 invitational, a 4-card major)     -> 2C
     - 2NT              (8-9 balanced, no 4-card major)         -> 2NT
     - Pass             (0-7, no 5-card major)
   Full second round for every branch. Slam beyond the quantitative 4NT raise is
   still deferred (cue-bids / RKC 1430 arrive in V4): dealt responder hands in the
   Stayman/Puppet/Transfer branches stay capped so those continuations always
   place game. Puppet structure is canonical (user's Puppet doc). Transfer
   completions / super-accepts, the invitational follow-ups, and the quantitative
   4NT rebid rule use standard treatments (flagged as resolutions).
   ============================================================================= */

export type NTBranch = "stayman" | "puppet" | "transfer" | "notrump" | "quant";
type Seat = "opener" | "responder";
export type NTSeatCall = { by: Seat; rec: Recommendation };
export type NTPair = { opener: Hand; responder: Hand; branch: NTBranch };

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];

export const NT_FOCUS: { id: "mixed" | NTBranch; label: string }[] = [
  { id: "mixed", label: "Mixed" },
  { id: "stayman", label: "Stayman" },
  { id: "puppet", label: "Puppet" },
  { id: "transfer", label: "Transfer" },
  { id: "notrump", label: "2NT / 3NT" },
  { id: "quant", label: "Quant 4NT" },
];

function is4333(h: Hand): boolean {
  const l = SUITS.map((s) => suitLength(h, s)).sort((a, b) => b - a);
  return l[0] === 4 && l[3] === 3;
}
function balancedNT(h: Hand): boolean {
  const sh = countShortages(h);
  const longest = Math.max(...SUITS.map((s) => suitLength(h, s)));
  return sh.voids === 0 && sh.singletons === 0 && sh.doubletons <= 1 && longest <= 5;
}
function opensNT(h: Hand): boolean {
  const hcp = handHcp(h);
  return hcp >= 15 && hcp <= 17 && balancedNT(h);
}

/* ---------- responder's first call (which convention) ---------- */

export function recommendNTResponse(h: Hand): { rec: Recommendation; branch: NTBranch } {
  const hcp = handHcp(h);
  const sp = suitLength(h, "spades"), he = suitLength(h, "hearts");
  const longMajor = Math.max(sp, he);

  if (longMajor >= 5) {
    const toSpades = sp >= 5 && sp >= he; // 5-5 -> spades (higher)
    const bid = toSpades ? "2H" : "2D";   // 2H transfers to spades, 2D to hearts
    return {
      rec: { best: bid, acceptable: [], explanationIfNotBest: `Jacoby transfer: 5+ ${toSpades ? "spades" : "hearts"} \u2014 transfer, then describe your strength.` },
      branch: "transfer",
    };
  }
  if (hcp >= 10) {
    const has4 = sp === 4 || he === 4;
    const has3 = sp >= 3 || he >= 3;
    if (has4 || (has3 && !is4333(h))) {
      return {
        rec: { best: "3C", acceptable: has4 ? [] : ["3NT"], explanationIfNotBest: "Puppet Stayman: game values with a 3- or 4-card major \u2014 hunt the 4-4 or 5-3 major fit." },
        branch: "puppet",
      };
    }
    if (hcp >= 16) {
      return { rec: { best: "4NT", acceptable: [], explanationIfNotBest: "Quantitative slam invite: 16-17, balanced, no usable major \u2014 raise to 4NT and let opener decide." }, branch: "quant" };
    }
    return { rec: { best: "3NT", acceptable: [], explanationIfNotBest: "Game values, no usable major \u2014 bid 3NT." }, branch: "notrump" };
  }
  if (hcp >= 8) {
    const has4 = sp === 4 || he === 4;
    if (has4) return { rec: { best: "2C", acceptable: ["2NT"], explanationIfNotBest: "Stayman: invitational (8-9) with a 4-card major." }, branch: "stayman" };
    return { rec: { best: "2NT", acceptable: ["Pass"], explanationIfNotBest: "Invitational (8-9), balanced, no 4-card major \u2014 natural 2NT." }, branch: "notrump" };
  }
  return { rec: { best: "Pass", acceptable: [], explanationIfNotBest: "Too weak to invite and no 5-card major to transfer \u2014 pass." }, branch: "notrump" };
}

/* ---------- Stayman branch ---------- */

function openerStaymanAnswer(opener: Hand): string {
  const he = suitLength(opener, "hearts"), sp = suitLength(opener, "spades");
  if (he >= 4) return "2H"; // both majors bid hearts up the line (dealing avoids 4-4 here)
  if (sp >= 4) return "2S";
  return "2D";
}
function staymanResponderCont(responder: Hand, answer: string): Recommendation {
  const he = suitLength(responder, "hearts"), sp = suitLength(responder, "spades");
  if (answer === "2H" && he >= 4) return { best: "3H", acceptable: [], explanationIfNotBest: "4-4 heart fit; invite game with 3\u2665." };
  if (answer === "2S" && sp >= 4) return { best: "3S", acceptable: [], explanationIfNotBest: "4-4 spade fit; invite game with 3\u2660." };
  return { best: "2NT", acceptable: [], explanationIfNotBest: "No 4-4 fit; invite in notrump with 2NT." };
}
function openerAfterStaymanInvite(opener: Hand, cont: string): Recommendation {
  const max = handHcp(opener) >= 16;
  if (cont === "3H") return { best: max ? "4H" : "Pass", acceptable: [], explanationIfNotBest: max ? "Maximum; accept game." : "Minimum; pass the invitation." };
  if (cont === "3S") return { best: max ? "4S" : "Pass", acceptable: [], explanationIfNotBest: max ? "Maximum; accept game." : "Minimum; pass the invitation." };
  return { best: max ? "3NT" : "Pass", acceptable: [], explanationIfNotBest: max ? "Maximum; accept game in notrump." : "Minimum; pass 2NT." };
}

/* ---------- Puppet branch ---------- */

function openerPuppetAnswer(opener: Hand): string {
  const he = suitLength(opener, "hearts"), sp = suitLength(opener, "spades");
  if (he >= 5) return "3H";
  if (sp >= 5) return "3S";
  if (he === 4 || sp === 4) return "3D"; // at least one 4-card major, no 5
  return "3NT";
}
function puppetResponderCont(responder: Hand, answer: string): Recommendation {
  const he = suitLength(responder, "hearts"), sp = suitLength(responder, "spades");
  if (answer === "3H") return he >= 3
    ? { best: "4H", acceptable: [], explanationIfNotBest: "5-3 heart fit found; bid game." }
    : { best: "3NT", acceptable: [], explanationIfNotBest: "No heart fit; sign off in 3NT." };
  if (answer === "3S") return sp >= 3
    ? { best: "4S", acceptable: [], explanationIfNotBest: "5-3 spade fit found; bid game." }
    : { best: "3NT", acceptable: [], explanationIfNotBest: "No spade fit; sign off in 3NT." };
  if (answer === "3NT") return { best: "Pass", acceptable: [], explanationIfNotBest: "Opener has no major; pass 3NT." };
  // 3D: opener has a 4-card major (no 5). Bid the OTHER major to show your 4-card major.
  const h4 = he === 4, s4 = sp === 4;
  if (h4 && s4) return { best: "4D", acceptable: [], explanationIfNotBest: "Both 4-card majors \u2014 bid 4\u2666 and let opener choose." };
  if (h4) return { best: "3S", acceptable: [], explanationIfNotBest: "Show 4 hearts by bidding the other major (3\u2660), keeping opener as declarer." };
  if (s4) return { best: "3H", acceptable: [], explanationIfNotBest: "Show 4 spades by bidding the other major (3\u2665), keeping opener as declarer." };
  return { best: "3NT", acceptable: [], explanationIfNotBest: "Only a 3-card major and opener has no 5-card major; sign off in 3NT." };
}
function openerPuppetPlace(opener: Hand, cont: string): Recommendation | null {
  const he = suitLength(opener, "hearts"), sp = suitLength(opener, "spades");
  if (cont === "3S") return he >= 4 // responder showed 4 hearts
    ? { best: "4H", acceptable: [], explanationIfNotBest: "4-4 heart fit; play game in hearts." }
    : { best: "3NT", acceptable: [], explanationIfNotBest: "No heart fit; play 3NT." };
  if (cont === "3H") return sp >= 4 // responder showed 4 spades
    ? { best: "4S", acceptable: [], explanationIfNotBest: "4-4 spade fit; play game in spades." }
    : { best: "3NT", acceptable: [], explanationIfNotBest: "No spade fit; play 3NT." };
  if (cont === "4D") return sp >= 4
    ? { best: "4S", acceptable: ["4H"], explanationIfNotBest: "Pick a 4-4 fit; spades." }
    : { best: "4H", acceptable: [], explanationIfNotBest: "Pick the 4-4 heart fit." };
  return null; // 4H/4S/3NT/Pass already final
}

/* ---------- Transfer branch ---------- */

function transferTarget(firstCall: string): Suit { return firstCall === "2D" ? "hearts" : "spades"; }
function openerTransferAccept(opener: Hand, firstCall: string): Recommendation {
  const M = transferTarget(firstCall);
  const den = M === "hearts" ? "H" : "S";
  const superOK = handHcp(opener) >= 17 && suitLength(opener, M) >= 4;
  if (superOK) return { best: "3" + den, acceptable: ["2" + den], explanationIfNotBest: "Super-accept: a maximum with 4-card support jumps to 3 of the major." };
  return { best: "2" + den, acceptable: [], explanationIfNotBest: "Complete the transfer." };
}
function transferResponderCont(responder: Hand, firstCall: string, superAccepted: boolean): Recommendation {
  const M = transferTarget(firstCall);
  const den = M === "hearts" ? "H" : "S";
  const len = suitLength(responder, M);
  const hcp = handHcp(responder);
  if (superAccepted) return { best: "4" + den, acceptable: [], explanationIfNotBest: "Opener super-accepted (maximum + fit); bid game." };
  if (hcp <= 7) return { best: "Pass", acceptable: [], explanationIfNotBest: "Weak; pass and play the 5-card major partscore." };
  if (hcp <= 9) return len >= 6
    ? { best: "3" + den, acceptable: [], explanationIfNotBest: "Invitational with a 6th trump; invite in the major." }
    : { best: "2NT", acceptable: [], explanationIfNotBest: "Invitational with exactly 5; offer 2NT and let opener choose." };
  return len >= 6
    ? { best: "4" + den, acceptable: [], explanationIfNotBest: "Game values with a 6th trump; bid game in the major." }
    : { best: "3NT", acceptable: [], explanationIfNotBest: "Game values with exactly 5; offer a choice of games with 3NT." };
}
function openerAfterTransferInvite(opener: Hand, firstCall: string, cont: string): Recommendation | null {
  const M = transferTarget(firstCall);
  const den = M === "hearts" ? "H" : "S";
  const support = suitLength(opener, M) >= 3;
  const max = handHcp(opener) >= 16;
  if (cont === "2NT") return max
    ? { best: support ? "4" + den : "3NT", acceptable: [], explanationIfNotBest: "Maximum; accept game." }
    : { best: support ? "3" + den : "Pass", acceptable: [], explanationIfNotBest: "Minimum; decline game." };
  if (cont === "3" + den) return { best: max ? "4" + den : "Pass", acceptable: [], explanationIfNotBest: max ? "Maximum; accept game." : "Minimum; pass." };
  if (cont === "3NT") return support
    ? { best: "4" + den, acceptable: [], explanationIfNotBest: "With 3-card support, correct 3NT to the major-suit game." }
    : { best: "Pass", acceptable: [], explanationIfNotBest: "No fit; pass 3NT." };
  return null; // Pass / 4M already final
}

/* ---------- No-major (2NT / 3NT) branch ---------- */

function openerInviteDecision(opener: Hand, respBid: string): Recommendation {
  if (respBid === "2NT") return handHcp(opener) >= 16
    ? { best: "3NT", acceptable: [], explanationIfNotBest: "Maximum; accept the invitation to 3NT." }
    : { best: "Pass", acceptable: [], explanationIfNotBest: "Minimum; pass the 2NT invitation." };
  return { best: "Pass", acceptable: [], explanationIfNotBest: "Responder placed the contract in 3NT; pass." };
}

/* ---------- Quantitative 4NT branch ---------- */

function openerQuantDecision(opener: Hand): Recommendation {
  return handHcp(opener) >= 17
    ? { best: "6NT", acceptable: [], explanationIfNotBest: "Maximum (17); accept the slam invitation." }
    : { best: "Pass", acceptable: [], explanationIfNotBest: "Minimum (15-16); decline the quantitative slam invitation." };
}

/* ---------- assemble the full best-line auction ---------- */

export function buildNTAuction(opener: Hand, responder: Hand): NTSeatCall[] {
  const calls: NTSeatCall[] = [];
  const push = (by: Seat, rec: Recommendation) => calls.push({ by, rec });
  push("opener", { best: "1NT", acceptable: [], explanationIfNotBest: "15-17 balanced opens 1NT." });

  const { rec: firstRec, branch } = recommendNTResponse(responder);
  push("responder", firstRec);
  const first = firstRec.best;

  if (branch === "stayman") {
    const ans = openerStaymanAnswer(opener);
    push("opener", { best: ans, acceptable: [], explanationIfNotBest: "Answer Stayman: 2\u2665/2\u2660 with a 4-card major, else 2\u2666." });
    const cont = staymanResponderCont(responder, ans);
    push("responder", cont);
    push("opener", openerAfterStaymanInvite(opener, cont.best)); // accept/decline the invite
    return calls;
  }

  if (branch === "puppet") {
    const ans = openerPuppetAnswer(opener);
    push("opener", { best: ans, acceptable: [], explanationIfNotBest: "Answer Puppet: 3\u2665/3\u2660 = 5-card major; 3\u2666 = a 4-card major, no 5; 3NT = no major." });
    const cont = puppetResponderCont(responder, ans);
    push("responder", cont);
    const place = openerPuppetPlace(opener, cont.best);
    if (place) push("opener", place);
    return calls;
  }

  if (branch === "transfer") {
    const accept = openerTransferAccept(opener, first);
    push("opener", accept);
    const superAccepted = accept.best.startsWith("3");
    const cont = transferResponderCont(responder, first, superAccepted);
    push("responder", cont);
    if (!superAccepted) {
      const place = openerAfterTransferInvite(opener, first, cont.best);
      if (place) push("opener", place);
    }
    return calls;
  }

  if (branch === "quant") {
    push("opener", openerQuantDecision(opener));
    return calls;
  }

  // notrump: 2NT invite or 3NT signoff
  push("opener", openerInviteDecision(opener, first));
  return calls;
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

/* ---------- "Mixed" variety: weighted anti-clump (same fix as auction2.ts's
   dealTwoOverOnePair — see the comment there for the full rationale). An
   independent uniform draw with no memory of the last pick produces streaks
   by chance; this damps (never bans) an immediate repeat of the branch just
   dealt, cutting the odds of repeating from 20% to roughly 6% without ever
   making any branch unreachable. */
const MIXED_NT_BRANCHES: NTBranch[] = ["stayman", "puppet", "transfer", "notrump", "quant"];
let lastMixedNTBranch: NTBranch | null = null;

function nextMixedNTBranch(): NTBranch {
  const REPEAT_WEIGHT = 0.25;
  const weights = MIXED_NT_BRANCHES.map((b) => (b === lastMixedNTBranch ? REPEAT_WEIGHT : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  let pick = MIXED_NT_BRANCHES[MIXED_NT_BRANCHES.length - 1];
  for (let i = 0; i < MIXED_NT_BRANCHES.length; i++) {
    if (r < weights[i]) { pick = MIXED_NT_BRANCHES[i]; break; }
    r -= weights[i];
  }
  return pick;
}

export function dealNTPair(focus: "mixed" | NTBranch = "mixed"): NTPair {
  const target = focus === "mixed" ? nextMixedNTBranch() : focus;
  for (let i = 0; i < 100000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      if (!opensNT(op)) continue;
      const { rec, branch } = recommendNTResponse(resp);
      if (rec.best === "Pass") continue;      // no second round to grade
      if (branch !== target) continue;
      // Slam is still deferred outside the quantitative 4NT branch: keep those
      // continuations game-only. The quant branch is itself the 16-17 slam-try
      // band, so it gets no additional cap here.
      if (branch !== "quant" && handHcp(resp) > 15) continue;
      if (target === "stayman" && suitLength(op, "hearts") >= 4 && suitLength(op, "spades") >= 4) continue; // avoid 4-4 opener here
      if (focus === "mixed") lastMixedNTBranch = target;
      return { opener: op, responder: resp, branch };
    }
  }
  const { a, b } = dealTwoHands();
  const branch = recommendNTResponse(b).branch;
  if (focus === "mixed") lastMixedNTBranch = branch;
  return { opener: a, responder: b, branch };
}
