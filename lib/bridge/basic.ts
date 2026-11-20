import { Hand, Recommendation } from "./types";
import { handHcp, suitLength } from "./eval";
import { recommendResponderBasic } from "./recommend_basic";
import {
  dealTwoHands, opensNT, openerStaymanAnswer, openerAfterStaymanInvite, openerTransferAccept,
  transferResponderCont, openerAfterTransferInvite, openerInviteDecision, type NTSeatCall,
} from "./nt";

/* =============================================================================
   "Basic" approach (the beginner rule set already in recommend_basic.ts):
   1NT transfers + Stayman, natural NT ranges. No Bergen, Jacoby 2NT, splinters,
   Puppet Stayman, NMF, weak twos or RKC. Basic is offered only for the two
   conventions it actually contains: Stayman and Transfers.

   The Basic FIRST call is recommendResponderBasic(hand, "1NT"):
     5+ hearts -> 2D transfer; 5+ spades -> 2H transfer;
     8+ HCP with a 4-card major -> Stayman (2C), game hands included (there is no
     Puppet Stayman in Basic); 10+ -> 3NT; 8-9 -> 2NT; otherwise pass.
   Continuations: transfers and the notrump invitation reuse the No Trump family's
   own follow-ups; Stayman gets its own Basic follow-up below, because a 10+ hand
   that Stayman-ed settles in game (4M with a 4-4 fit, else 3NT) instead of inviting.
   5-5 major hands are not dealt (Basic's own first-call rule picks hearts there,
   which isn't a clean teaching point). Responders are capped at 15 HCP (no slam
   machinery in Basic).
   ============================================================================= */

export type BasicConv = "stayman" | "transfers";
type BasicKind = "transfer" | "stayman" | "notrump" | "pass";

function kindOf(best: string): BasicKind {
  if (best === "2D" || best === "2H") return "transfer";
  if (best === "2C") return "stayman";
  if (best === "Pass") return "pass";
  return "notrump"; // 2NT / 3NT
}

/** Deal an opener (1NT) / responder pair. decoy=true deals a hand where the named convention is NOT the best call. */
export function dealBasicNTPair(conv: BasicConv, decoy: boolean): { opener: Hand; responder: Hand } {
  for (let i = 0; i < 100000; i++) {
    const { a, b } = dealTwoHands();
    for (const [op, resp] of [[a, b], [b, a]] as [Hand, Hand][]) {
      if (!opensNT(op)) continue;
      const kind = kindOf(recommendResponderBasic(resp, "1NT").best);
      if (kind === "pass") continue;
      if (handHcp(resp) > 15) continue;
      if (suitLength(resp, "spades") >= 5 && suitLength(resp, "hearts") >= 5) continue;
      if (suitLength(op, "hearts") >= 4 && suitLength(op, "spades") >= 4) continue; // avoid 4-4 openers (Stayman answer)
      const isTarget = conv === "stayman" ? kind === "stayman" : kind === "transfer";
      if (decoy ? isTarget : !isTarget) continue;
      return { opener: op, responder: resp };
    }
  }
  throw new Error("[basic] could not deal a valid pair");
}

function basicStaymanCont(responder: Hand, answer: string): Recommendation {
  const he = suitLength(responder, "hearts"), sp = suitLength(responder, "spades");
  const game = handHcp(responder) >= 10;
  if (answer === "2H" && he >= 4) return game
    ? { best: "4H", acceptable: [], explanationIfNotBest: "Basic: a 4-4 heart fit and game values (10+) — bid 4♥." }
    : { best: "3H", acceptable: [], explanationIfNotBest: "Basic: a 4-4 heart fit with 8-9 — invite with 3♥." };
  if (answer === "2S" && sp >= 4) return game
    ? { best: "4S", acceptable: [], explanationIfNotBest: "Basic: a 4-4 spade fit and game values (10+) — bid 4♠." }
    : { best: "3S", acceptable: [], explanationIfNotBest: "Basic: a 4-4 spade fit with 8-9 — invite with 3♠." };
  return game
    ? { best: "3NT", acceptable: [], explanationIfNotBest: "Basic: no 4-4 major fit and game values (10+) — bid 3NT." }
    : { best: "2NT", acceptable: [], explanationIfNotBest: "Basic: no 4-4 major fit with 8-9 — invite in notrump with 2NT." };
}

export function buildBasicNTAuction(opener: Hand, responder: Hand): NTSeatCall[] {
  const calls: NTSeatCall[] = [];
  const push = (by: "opener" | "responder", rec: Recommendation) => calls.push({ by, rec });
  push("opener", { best: "1NT", acceptable: [], explanationIfNotBest: "15-17 balanced opens 1NT." });
  const first = recommendResponderBasic(responder, "1NT");
  push("responder", first);
  const kind = kindOf(first.best);

  if (kind === "stayman") {
    const ans = openerStaymanAnswer(opener);
    push("opener", { best: ans, acceptable: [], explanationIfNotBest: "Answer Stayman: 2♥/2♠ with a 4-card major, else 2♦." });
    const cont = basicStaymanCont(responder, ans);
    push("responder", cont);
    if (cont.best === "4H" || cont.best === "4S" || cont.best === "3NT") {
      push("opener", { best: "Pass", acceptable: [], explanationIfNotBest: "Responder placed the contract in game; pass." });
    } else {
      push("opener", openerAfterStaymanInvite(opener, cont.best));
    }
    return calls;
  }

  if (kind === "transfer") {
    const accept = openerTransferAccept(opener, first.best);
    push("opener", accept);
    const superAccepted = accept.best.startsWith("3");
    const cont = transferResponderCont(responder, first.best, superAccepted);
    push("responder", cont);
    if (!superAccepted) {
      const place = openerAfterTransferInvite(opener, first.best, cont.best);
      if (place) push("opener", place);
    }
    return calls;
  }

  push("opener", openerInviteDecision(opener, first.best));
  return calls;
}
