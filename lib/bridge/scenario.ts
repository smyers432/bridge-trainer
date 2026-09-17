import { Hand, Opening, Recommendation } from "./types";
import { dealTwoOverOnePair, openerRebid, responderContinuation, type Focus } from "./auction2";
import { recommendResponder } from "./recommend";
import { dealNTPair, buildNTAuction, NT_FOCUS, type NTBranch } from "./nt";
import { dealDruryPair, buildDruryAuction } from "./drury";
import { dealSplinterPair, buildSplinterAuction } from "./splinter";
import { dealWeakTwoPair, buildWeakTwoAuction, WEAK_TWO_FOCUS } from "./weaktwo";

export type Convention = "two_over_one" | "no_trump" | "weak_two";
export type Role = "opener" | "responder";
export type SeatCall = { by: Role; rec: Recommendation };

export type Scenario = {
  convention: Convention;
  role: Role;
  opener: Hand;
  responder: Hand;
  opening: Opening;                 // 1NT for No Trump; 1H/1S for 2/1
  calls: SeatCall[];                // full best-line auction (variable length)
  userIndices: number[];            // up to the first two calls the user makes
  scoredIndex: number;              // the last user call (stamped + counted)
  userHand: Hand;
  partnerHand: Hand;
};

export const CONVENTIONS: { id: Convention; label: string }[] = [
  { id: "two_over_one", label: "Two Over One" },
  { id: "no_trump", label: "No Trump" },
  { id: "weak_two", label: "Weak Two" },
];

export { NT_FOCUS, WEAK_TWO_FOCUS };
export type { NTBranch };
export type AnyFocus = Focus | NTBranch;

function finish(convention: Convention, role: Role, opener: Hand, responder: Hand, opening: Opening, calls: SeatCall[]): Scenario {
  const mine = calls.map((c, i) => (c.by === role ? i : -1)).filter((i) => i >= 0).slice(0, 2);
  const scoredIndex = mine[mine.length - 1];
  return {
    convention, role, opener, responder, opening, calls,
    userIndices: mine, scoredIndex,
    userHand: role === "opener" ? opener : responder,
    partnerHand: role === "opener" ? responder : opener,
  };
}

export function dealScenario(convention: Convention, role: Role, focus: AnyFocus = "mixed"): Scenario {
  if (convention === "no_trump") {
    const p = dealNTPair(focus as "mixed" | NTBranch);
    const calls = buildNTAuction(p.opener, p.responder) as SeatCall[];
    return finish(convention, role, p.opener, p.responder, "1NT", calls);
  }

  if (convention === "weak_two") {
    const p = dealWeakTwoPair();
    const calls = buildWeakTwoAuction(p.opener, p.responder, p.openSuit) as SeatCall[];
    const opening = ("2" + { spades: "S", hearts: "H", diamonds: "D", clubs: "C" }[p.openSuit]) as Opening;
    return finish(convention, role, p.opener, p.responder, opening, calls);
  }

  if (focus === "drury") {
    const p = dealDruryPair();
    const calls = buildDruryAuction(p.opener, p.responder, p.opening) as SeatCall[];
    return finish(convention, role, p.opener, p.responder, p.opening, calls);
  }

  if (focus === "splinter") {
    const p = dealSplinterPair();
    const calls = buildSplinterAuction(p.opener, p.responder, p.opening) as SeatCall[];
    return finish(convention, role, p.opener, p.responder, p.opening, calls);
  }

  const p = dealTwoOverOnePair(focus as Focus);
  const oRebid = openerRebid(p.opener, p.opening, p.firstCall);
  const calls: SeatCall[] = [
    { by: "opener", rec: { best: p.opening, acceptable: [], explanationIfNotBest: "A 5+ card major, 12-19 HCP, opens 1 of the major." } },
    { by: "responder", rec: recommendResponder(p.responder, p.opening) },
    { by: "opener", rec: oRebid },
    { by: "responder", rec: responderContinuation(p, oRebid.best) },
  ];
  return finish(convention, role, p.opener, p.responder, p.opening, calls);
}
