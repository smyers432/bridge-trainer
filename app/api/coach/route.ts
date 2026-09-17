import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Claude Sonnet 5: current flagship, and roughly half the per-token cost of Sonnet 4.6.
const MODEL = "claude-sonnet-5";

const RULEBOOK = `Canonical 2/1 (Sutton-style) v1. Metric rule: 2/1 and new-suit decisions use HCP (2/1 GF = 13+ HCP); major-suit RAISES use support points = HCP + distribution (4+ trumps: void 5 / singleton 3 / doubleton 1; exactly 3 trumps: void 3 / singleton 2 / doubleton 1).
Over 1M with 4+ support: <=6 support pts = 3M preempt; 7-9 = 3C Bergen; 10-11 = 3D Bergen; 12+ no side shortness = Jacoby 2NT; 12+ with side singleton/void = splinter (double jump in the short suit; splinter beats Jacoby). 5+ trumps, weak, distributional = 4M weak freak.
Over 1M with 3-card support: 5-7 = 1NT forcing then 2M; 8-9 = 2M single raise; 10-12 = 1NT forcing then 3M.
Over 1H with 4+ spades: bid 1S first. No support, 6-12 = 1NT forcing; <6 = Pass.
No Trump family (partner opened 1NT, 15-17 balanced). Responder's first call: 5+ card major (any strength) = Jacoby transfer (2D->hearts, 2H->spades), including 6-card majors (no Texas in this system). Otherwise, 10+ points (game forcing): with a 3- or 4-card major (but not a flat 3-card major in 4-3-3-3) = Puppet Stayman (3C); with no usable major and 10-15 = 3NT; with no usable major and 16-17 = 4NT (natural, quantitative slam invite). Otherwise 8-9 invitational: with a 4-card major = Stayman (2C); balanced with no 4-card major = 2NT natural invite. 0-7 with no 5-card major = Pass.
Over a minor: 4-card major up the line; 1C then 4+ diamonds & 6+ = 1D; 1D-2C is game forcing.
No Trump second round. Stayman (1NT-2C, invitational 8-9): opener answers 2D (no 4-card major) / 2H / 2S; responder raises a 4-4 major fit to 3M (invitational) or bids 2NT with no fit; opener then accepts game with a maximum (16-17) or passes with a minimum. Jacoby transfer: opener completes (2M), or super-accepts by jumping to 3M with a maximum plus 4-card support; after a simple completion responder passes when weak (0-7), invites with 2NT (5-card major) or 3M (6-card) at 8-9, and bids 3NT (5-card) or 4M (6-card) with game values; opener then places the contract. Puppet Stayman (1NT-3C, 10+): opener bids 3H/3S with a 5-card major, 3D with a 4-card major (no 5), or 3NT with no major. Over 3H/3S responder bids game with a 3-card fit else 3NT. Over 3D responder bids the OTHER major to show a 4-card major (4 hearts -> 3S, 4 spades -> 3H), 4D with both, or 3NT with only a 3-card major; opener then places the 4-4 fit or bids 3NT. Over a 1NT-2NT invitation opener passes with 15 and bids 3NT with 16-17; over a direct 3NT opener passes. Over a quantitative 4NT invite (1NT-4NT, no major fit, responder 16-17), opener passes with a minimum (15-16) and bids 6NT only with a maximum (17); cue-bids and Roman Key Card Blackwood are out of scope in this trainer (V4).
Two Over One auction, opener's rebid (second round):
- After Jacoby 2NT (1M-2NT): a new suit at the 3 level = singleton/void (shortness); 3 of the major = 16+ with good trumps, no shortness (slow arrival, slam interest); 3NT = average opening, no shortness; 4 of the major = minimum, no shortness, no slam interest (fast arrival). Shortness is shown first when present.
- After Bergen 3C (7-9): accept game (4M) with a strong opener, otherwise sign off in 3M. After Bergen 3D (10-11, limit): bid game (4M) with a sound opener, decline to 3M only with a dead minimum.
- After a 2/1 GF response (2C/2D/2H): raise responder's suit with support; else bid a new 4+ side suit (natural, cheapest) to show shape; else rebid a 6-card major; else 2NT with a balanced minimum (rebidding a 5-card major is acceptable). In a game-forcing auction opener need not jump and may rebid a 5-card major for lack of a better call.
- After a 1NT forcing response (1M-1NT): opener must bid again. Rebidding the major promises 6 (a 5-card major may NOT be rebid here, unlike after a 2/1). Otherwise show a 4+ card second suit at the 2 level below the major; with none, rebid your better minor (which may be only 3 cards). 18-19 balanced jumps to 2NT. Responder then, with 3-card support, shows a delayed raise: 2M with 5-9, jump to 3M with 10-12; a balanced minimum with no fit passes opener's minimum rebid.
- After a simple raise (1M-2M, 3-card support, 8-9 support points): Help Suit Game Try (HSGT). Compute opener's Losing Trick Count (LTC): per suit, 3+ cards = 3 minus A/K/Q held; 2 cards = 2 minus A/K held; singleton = 0 with the ace else 1; void = 0. <=5 losers: bid game (4M) outright. 6 losers: bid a new suit at the 3 level in the weakest qualifying 3+-card side suit (>=2 losers there; most losers wins ties, then suit rank) asking for help. >=7 losers: pass. Responder accepts (bids game) with help in the asked suit — a singleton or void; an ace- or king-high holding of 2-3 cards; a 4-card suit headed by QJ; or, only at the top of the raise (9 support points), a plain doubleton — else returns to 3 of the major.
- After a splinter (1M-2NT-range hand with a side singleton/void, shown as a double jump — see the opening rule above): opener looks for wasted values in responder's shortness suit — a king, queen, or jack there (at any length) is wasted; nothing higher than the ace (or the suit is empty) is not. With wasted values, sign off in game (4M). With no wasted values, the hands fit well — ask for keycards with a simple Roman Keycard Blackwood (1430): 4NT asks, and responder answers on the 1430 step scale (keycards = the four aces plus the trump king, 5 total) — 5C = 1 or 4, 5D = 0 or 3, 5H = 2 (or 5) without the trump queen, 5S = 2 (or 5) with the trump queen. Opener then totals the keycards held between the two hands: 4 or more bids the small slam (6M); fewer settles in 5 of the major. This trainer does not model a further trump-queen ask or grand slams — it caps at the small slam.
Responder's continuation here is bounded to placing game (slam methods are out of scope in this trainer): after Jacoby 2NT sign off in 4M; after Bergen pass opener's decision; after a 2/1, bid game in the major if opener raises responder's own suit, OR if responder holds 3+ cards in opener's ORIGINALLY-OPENED major (that fit was established by the 5+-card opening bid itself and stands regardless of what opener's rebid shows — a new suit or a balanced 2NT rebid adds information, it never denies the opening suit), otherwise 3NT; after a simple raise, per the HSGT rule above.
Reverse Drury (partner opens 1H or 1S in the 3rd or 4th seat — i.e. after 1-2 prior passes; responder has already passed too, with 3+-card support and 10+ support points): responder's 2C is artificial and forcing, asking whether opener opened light or has a full opener. Opener's rebid: 18+ = 3NT (offers a choice of game); 15-17 balanced = 2NT; 10-11 (light) = 2 of the major (no game interest — responder passes); 12-17 with a qualifying help-suit (spades or clubs over 1H, hearts or clubs over 1S only — diamonds is unavailable, claimed by the relay) = a new-suit ask at the 3 level, Help Suit Game Try style; 12-14 with no such suit = 2D relay (full opener, nothing extra); 15-17 unbalanced with no such suit = 4 of the major (game, no slam interest). After the 2D relay: responder signs off at 2 of the major with a bare 10 support points, invites with 3 of the major at 11-12 (opener then accepts with 14, declines with 12-13), or bids game with 13+. After the suit ask: responder accepts with help there (same criteria as HSGT) else returns to 3 of the major. After 2NT: a balanced responder prefers 3NT, else corrects to game in the major. After 3NT: a balanced responder passes (accepting 3NT), else corrects to game in the major.
Weak Two Bids (opened 2D, 2H, or 2S only — never clubs, which opens at the 3 level): a 6-card suit, 5-10 HCP, 2 of the top 3 honors (A/K/Q) or 3 of the top 5 (A/K/Q/J/10) with at least one ace or king among them, no more than one ace or king outside the suit, and no other 4-card major. Opener must not bid again unless responder bids 2NT or a new suit — both forcing; every other responder call ends the auction. Responder (captain of the hand): with a long, solid diamond suit and no real diamond fit but the other three suits stopped and 13+ points, bid 3NT (counting nine tricks rather than raising a minor preempt). With 2+ card support and 15+ points, bid game outright (4 of a major, or 5 diamonds). With 15+ and no clear fit, bid the forcing 2NT, asking opener for a feature. With 10-14 and a good 5+ card side suit, bid it as a forcing new suit (interest in game); opener raises with 3-card support or returns to the weak two suit at its lowest level. With 4+ card support (Law of Total Tricks: 6 + 4 = 10 trumps), raise all the way to game even without extra values. With 2-3 card support and nothing more to say, make a single non-forcing raise (to play — opener passes). Otherwise, pass. Over the 2NT feature ask: opener rebids the suit at the 3 level with a minimum (5-7) and no outside feature; shows an outside ace or king at the 3 level with a maximum (8-10) and a feature; bids 3NT with a maximum and no feature (a suit solid enough to run). Preemptive jump overcalls and interference over a weak two both require modeling the opponents' calls, which this trainer doesn't do, and are not implemented; neither are Unusual Notrump and the Western Cuebid, for the same reason.`;

const SYSTEM = `You are a concise bridge bidding coach for the partnership's own 2/1 system (rules below). Grading is already done deterministically \u2014 do not grade. Explain the reasoning in 110 words or fewer, plain and specific, using support points where relevant. If the student's bid was BEST, confirm briefly and add at most one refinement; if it was not BEST, say why the best bid is better. Do not lecture.

SYSTEM RULES:
${RULEBOOK}`;

type CoachBody = {
  opening?: string;
  hand?: Record<string, string[]>;
  hcp?: number;
  userBid?: string | null;
  tier?: string | null;
  best?: string;
  auction?: string;
  note?: string;
};

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Coach is not configured: set ANTHROPIC_API_KEY." });
  }
  try {
    const { opening, hand, hcp, userBid, tier, best, auction, note } = (await req.json()) as CoachBody;
    const handStr = hand
      ? (["spades", "hearts", "diamonds", "clubs"] as const)
          .map((s) => `${s[0].toUpperCase()}: ${hand[s]?.join(" ") || "void"}`)
          .join("  |  ")
      : "(hand unavailable)";
    const verdict = tier
      ? `The student bid ${userBid} and it was graded ${tier}. The system-best bid is ${best}.`
      : `The student has not bid yet. The system-best bid is ${best}.`;
    const auctionLine = auction ? `\nAuction so far: ${auction}.` : "";
    const noteLine = note ? `\n${note}` : "";
    const userMsg = `DEAL:\nPartner opened ${opening}. The student holds ${handStr}. HCP = ${hcp}.${auctionLine}${noteLine}\n${verdict}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Coach unavailable (HTTP ${res.status}).` });
    }
    const data = await res.json();
    const text = (data.content || [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return NextResponse.json({ text: text || "No response." });
  } catch {
    return NextResponse.json({ error: "Coach error \u2014 the grade and rulebook note still stand." });
  }
}
