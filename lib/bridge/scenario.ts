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
  userIndices: number[];            // every call the user makes in this auction
  scoredIndex: number;              // the LAST user call (stamped + counted) —
                                     // everything earlier the user makes must match
                                     // the system's call to proceed, but isn't graded
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
  // Every index belonging to this seat is interactive. Most branches only ever
  // give a seat two calls (e.g. opener's opening + rebid in the 2/1 family), but
  // several NT/Drury/Splinter lines give opener a THIRD decision further down the
  // auction — e.g. 1NT-2H-2S-3NT-?, where opener must choose Pass or 4S after
  // responder's game-forcing transfer continuation. Capping this at the first two
  // role-matching indices (the old behavior) silently auto-picked that later
  // decision with the engine's own recommendation instead of asking the user, and
  // then graded nothing — the bug where a real decision (correct to game or not)
  // never became a testable choice. Keeping every one of the seat's indices here
  // means fillEngine() (which auto-fills only the OTHER seat's calls) stops short
  // at each of them, and onUserBid grades only the last one (scoredIndex) while
  // gating the earlier ones to the system's own call, exactly as before.
  const mine = calls.map((c, i) => (c.by === role ? i : -1)).filter((i) => i >= 0);
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
