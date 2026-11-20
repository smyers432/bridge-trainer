import type { Opening } from "./types";
import { dealScenario, finish, type Role, type Scenario, type SeatCall, type InterventionMode } from "./scenario";
import { dealNMFPair, buildNMFAuction } from "./nmf";
import { dealSplinterPair, buildSplinterAuction } from "./splinter";
import { dealBasicNTPair, buildBasicNTAuction } from "./basic";
import { dealStrong2CPair, buildStrong2CAuction } from "./strong2c";
import { dealOvercallPair, pickOvercallKind, buildOvercallAuction, type OvercallKind } from "./overcall";

/* =============================================================================
   Practice structure (V7): the user picks a bidding APPROACH, a SEAT, and a
   CONVENTION (or Mixed). This file maps those three choices onto the engine
   modules; every convention keeps its own generator and rulebook.

   Approach
     "two_over_one" -- the Sutton 2/1 rule set the trainer was built on: all ten
                       conventions.
     "basic"        -- the beginner rule set in recommend_basic.ts (1NT transfers +
                       Stayman, natural NT ranges; no Bergen/Jacoby/splinters/Puppet/
                       NMF/weak twos/RKC). Offered ONLY for Stayman and Transfers.
   Convention
     Bergen, Jacoby 2NT, NMF, Weak Two, Stayman, Puppet Stayman, Transfers, Splinter
     raises, RKC, Strong 2C -- or Mixed, which draws a convention at random each
     deal and does not say which one it is until the deal is graded. Under 2/1, Mixed is 40%
     1NT conventions (Stayman / Puppet / Transfers) and 60% the other seven, split evenly; a
     repeat of the last convention is made less likely, never impossible.
   Scoring is unchanged: the LAST call the user makes is the scored one; every
   earlier call of theirs must match the system's call, and if it doesn't the system
   shows its call and the user continues without it being scored.
   Decoy hands (deals where the picked convention is NOT the best call) exist in
   nmf.ts and basic.ts behind a flag but are OFF -- a specific-convention drill deals
   the convention every time.
   ============================================================================= */

export type Approach = "two_over_one" | "basic";
export type ConvId = "bergen" | "jacoby_2nt" | "nmf" | "weak_two" | "stayman" | "puppet" | "transfers" | "splinter" | "rkc" | "strong2c";
export type ConvChoice = "mixed" | ConvId | OvercallKind; // OvercallKind only applies to the overcaller seat
export type { Role, InterventionMode };

export const APPROACHES: { id: Approach; label: string }[] = [
  { id: "two_over_one", label: "2/1" },
  { id: "basic", label: "Basic" },
];

export const CONV_LABEL: Record<ConvId, string> = {
  bergen: "Bergen", jacoby_2nt: "Jacoby 2NT", nmf: "New Minor Forcing", weak_two: "Weak Two",
  stayman: "Stayman", puppet: "Puppet Stayman", transfers: "Transfers", splinter: "Splinter raises", rkc: "RKC", strong2c: "Strong 2\u2663",
};

export const CONV_CHIPS: { id: ConvChoice; label: string }[] = [
  { id: "mixed", label: "Mixed" },
  { id: "bergen", label: "Bergen" },
  { id: "jacoby_2nt", label: "Jacoby 2NT" },
  { id: "nmf", label: "NMF" },
  { id: "weak_two", label: "Weak Two" },
  { id: "stayman", label: "Stayman" },
  { id: "puppet", label: "Puppet Stayman" },
  { id: "transfers", label: "Transfers" },
  { id: "splinter", label: "Splinter raises" },
  { id: "rkc", label: "RKC" },
  { id: "strong2c", label: "Strong 2\u2663" },
];

export const OVERCALL_CHIPS: { id: ConvChoice; label: string }[] = [
  { id: "mixed", label: "Mixed" },
  { id: "suit", label: "Simple overcall" },
  { id: "double", label: "Takeout double" },
  { id: "nt", label: "1NT overcall" },
  { id: "pass", label: "Pass" },
];
const OVERCALL_LABEL: Record<OvercallKind, string> = { suit: "Simple overcall", double: "Takeout double", nt: "1NT overcall", pass: "Pass" };
const OVERCALL_IDS: string[] = ["suit", "double", "nt", "pass"];

// Overcall seat (V8): RHO opens one of a suit; the student makes the one graded call (overcall.ts).
function dealOvercall(choice: ConvChoice): Scenario {
  const kind: OvercallKind = OVERCALL_IDS.includes(choice) ? (choice as OvercallKind) : pickOvercallKind();
  const p = dealOvercallPair(kind);
  const calls = buildOvercallAuction(p) as SeatCall[];
  return {
    convention: "overcall", role: "overcaller", opener: p.opponent, responder: p.user, opening: p.opening,
    calls, userIndices: [1], scoredIndex: 1, userHand: p.user, partnerHand: p.opponent, conv: OVERCALL_LABEL[p.kind],
  };
}

const ALL: ConvId[] = ["bergen", "jacoby_2nt", "nmf", "weak_two", "stayman", "puppet", "transfers", "splinter", "rkc", "strong2c"];

export function availableConventions(approach: Approach): ConvId[] {
  return approach === "basic" ? ["stayman", "transfers"] : ALL;
}

/* ---------- Mixed: 40% No Trump / 60% everything else, anti-clump within each group ---------- */

// Under 2/1 Mixed, 40% of deals are 1NT-opening conventions (Stayman, Puppet Stayman,
// Transfers) and 60% come from every other convention, split evenly among them.
// Under Basic the pool is all NT, so every Mixed deal is a 1NT opening.
export const MIXED_NT_SHARE = 0.4;
const NT_CONVS: ConvId[] = ["stayman", "puppet", "transfers"];
const lastMixed: Record<Approach, ConvId | null> = { two_over_one: null, basic: null };

function pickWeighted(pool: ConvId[], last: ConvId | null): ConvId {
  const REPEAT_WEIGHT = 0.25; // a repeat of the last convention is less likely, never impossible
  const weights = pool.map((c) => (c === last ? REPEAT_WEIGHT : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    if (r < weights[i]) return pool[i];
    r -= weights[i];
  }
  return pool[pool.length - 1];
}

function nextMixed(approach: Approach): ConvId {
  const pool = availableConventions(approach);
  const nt = pool.filter((c) => NT_CONVS.includes(c));
  const other = pool.filter((c) => !NT_CONVS.includes(c));
  const group = nt.length === 0 ? other : other.length === 0 ? nt : Math.random() < MIXED_NT_SHARE ? nt : other;
  const pick = pickWeighted(group, lastMixed[approach]);
  lastMixed[approach] = pick;
  return pick;
}

/* ---------- dealing ---------- */

export function dealPractice(
  approach: Approach,
  role: Role,
  choice: ConvChoice,
  intervention: InterventionMode = "none"
): Scenario {
  if (role === "overcaller") return dealOvercall(choice); // 2/1 only; Basic and the convention list don't apply
  const pool = availableConventions(approach);
  const conv: ConvId = choice === "mixed" ? nextMixed(approach) : pool.includes(choice as ConvId) ? (choice as ConvId) : pool[0];
  const scen = dealConvention(approach, role, conv, intervention);
  scen.conv = CONV_LABEL[conv];
  return scen;
}

function dealConvention(approach: Approach, role: Role, conv: ConvId, intervention: InterventionMode): Scenario {
  switch (conv) {
    case "bergen":
      return dealScenario("two_over_one", role, "bergen", intervention);
    case "jacoby_2nt":
      return dealScenario("two_over_one", role, "jacoby", intervention);
    case "weak_two":
      return dealScenario("weak_two", role, "mixed");
    case "puppet":
      return dealScenario("no_trump", role, "puppet");
    case "stayman":
    case "transfers": {
      if (approach === "basic") {
        const p = dealBasicNTPair(conv, false);
        return finish("no_trump", role, p.opener, p.responder, "1NT", buildBasicNTAuction(p.opener, p.responder) as SeatCall[]);
      }
      return dealScenario("no_trump", role, conv === "stayman" ? "stayman" : "transfer");
    }
    case "splinter": {
      // Ends at opener's rebid: the 4M sign-off, or the 4NT keycard ask (where RKC begins).
      const p = dealSplinterPair();
      return finish("two_over_one", role, p.opener, p.responder, p.opening as Opening, buildSplinterAuction(p.opener, p.responder, p.opening, "splinter") as SeatCall[]);
    }
    case "rkc": {
      // The 1430 line after a splinter where opener has no wasted values and asks with 4NT.
      // The opening and the splinter are played for the user (the drill starts at 4NT), so
      // the user's calls are opener's 4NT ask + final decision, or responder's keycard answer.
      const p = dealSplinterPair({ wasted: false });
      const calls = buildSplinterAuction(p.opener, p.responder, p.opening, "rkc") as SeatCall[];
      const s = finish("two_over_one", role, p.opener, p.responder, p.opening as Opening, calls);
      const userIndices = s.userIndices.filter((i) => i >= 2);
      return { ...s, userIndices, scoredIndex: userIndices[userIndices.length - 1] };
    }
    case "strong2c": {
      // 2C - 2D/positive - opener's rebid - responder's second call (strong2c.ts).
      // Positive-response hands are dealt to the responder seat only.
      const p = dealStrong2CPair(role === "responder");
      return finish("two_over_one", role, p.opener, p.responder, "2C" as Opening, buildStrong2CAuction(p) as SeatCall[]);
    }
    case "nmf": {
      const p = dealNMFPair(false);
      return finish("two_over_one", role, p.opener, p.responder, p.opening as Opening, buildNMFAuction(p) as SeatCall[]);
    }
  }
}
