"use client";

import React, { useState, useCallback, useEffect } from "react";
import type { Grade, Hand, Recommendation, Suit } from "@/lib/bridge/types";
import { handHcp, DIST, distributionPointsForSupport } from "@/lib/bridge/eval";
import { bidRank, BID_ROWS, gradeBid } from "@/lib/bridge/grade";
import { dealScenario, CONVENTIONS, NT_FOCUS, WEAK_TWO_FOCUS, type Convention, type Role, type Scenario, type AnyFocus } from "@/lib/bridge/scenario";
import { FOCUS_OPTIONS } from "@/lib/bridge/auction2";

const PALETTE = {
  bg: "#EFEAE0", card: "#FBF9F4", baize: "#14493A", ink: "#1B1B1A",
  red: "#B0121A", gold: "#B8892B", line: "#DAD2C4",
  best: "#1E7A46", acc: "#B8892B", viol: "#B0121A", muted: "#6B6459",
};
const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const GLYPH: Record<Suit, string> = { spades: "\u2660", hearts: "\u2665", diamonds: "\u2666", clubs: "\u2663" };
const DENOM_GLYPH: Record<string, string> = { C: "\u2663", D: "\u2666", H: "\u2665", S: "\u2660", NT: "NT" };
const REDS = new Set<Suit>(["hearts", "diamonds"]);
const tierMeta: Record<Grade, { label: string; color: string }> = {
  BEST: { label: "Best", color: PALETTE.best },
  ACCEPTABLE: { label: "Acceptable", color: PALETTE.acc },
  SYSTEM_VIOLATION: { label: "System violation", color: PALETTE.viol },
};

function sym(bid: string) {
  if (bid === "Pass") return "Pass";
  return bid[0] + (DENOM_GLYPH[bid.slice(1)] || bid.slice(1));
}
function BidText({ bid, size = 15 }: { bid: string; size?: number }) {
  if (bid === "Pass") return <span style={{ fontWeight: 700 }}>Pass</span>;
  const level = bid[0], denom = bid.slice(1);
  const isRed = denom === "H" || denom === "D";
  return (
    <span style={{ fontWeight: 700, fontSize: size }}>
      {level}<span style={{ color: isRed ? PALETTE.red : PALETTE.ink }}>{DENOM_GLYPH[denom]}</span>
    </span>
  );
}
/**
 * Support-point breakdown for a hand raising `trump`, matching eval.ts's
 * distributionPointsForSupport exactly (same DIST table, same 3+/4+ trump-count
 * cutoff) so this display can never drift from what the engine actually scores
 * with. Returns null below 3-card support, where the support-point table simply
 * doesn't apply (there's no fit to raise).
 */
function supportBreakdown(hand: Hand, trump: Suit) {
  const tc = hand[trump].length;
  if (tc < 3) return null;
  const hcp = handHcp(hand);
  const dist = distributionPointsForSupport(hand, trump, tc);
  const table = tc >= 4 ? DIST.support_4plus_trump : DIST.support_exactly_3_trump;
  const parts: Array<{ suit: Suit; kind: "void" | "singleton" | "doubleton"; pts: number }> = [];
  for (const s of SUITS) {
    if (s === trump) continue;
    const len = hand[s].length;
    if (len === 0) parts.push({ suit: s, kind: "void", pts: table.void });
    else if (len === 1) parts.push({ suit: s, kind: "singleton", pts: table.singleton });
    else if (len === 2) parts.push({ suit: s, kind: "doubleton", pts: table.doubleton });
  }
  return { hcp, dist, total: hcp + dist, parts };
}

function SuitGlyph({ s }: { s: Suit }) {
  return <span style={{ color: REDS.has(s) ? PALETTE.red : PALETTE.ink }}>{GLYPH[s]}</span>;
}

function HandDiagram({ hand, label, trumpSuit }: { hand: Hand; label: string; trumpSuit?: Suit | null }) {
  const sb = trumpSuit ? supportBreakdown(hand, trumpSuit) : null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: PALETTE.muted, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", rowGap: 5, alignItems: "center" }}>
        {SUITS.map((s) => (
          <React.Fragment key={s}>
            <div style={{ fontSize: 18, color: REDS.has(s) ? PALETTE.red : PALETTE.ink }}>{GLYPH[s]}</div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 17, letterSpacing: 2, color: REDS.has(s) ? PALETTE.red : PALETTE.ink }}>
              {hand[s].length ? hand[s].join(" ") : <span style={{ color: PALETTE.muted }}>{"\u2014"}</span>}
            </div>
            <div style={{ fontSize: 12, color: PALETTE.muted, textAlign: "right" }}>{hand[s].length}</div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 6 }}><strong style={{ color: PALETTE.ink }}>{handHcp(hand)}</strong> HCP</div>
      {sb && (
        <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 3, lineHeight: 1.5 }}>
          {sb.dist > 0 ? (
            <>
              <strong style={{ color: PALETTE.ink }}>{sb.hcp}</strong> HCP {"+"} <strong style={{ color: PALETTE.ink }}>{sb.dist}</strong> for{" "}
              {sb.parts.map((p, i) => (
                <React.Fragment key={p.suit}>
                  {i > 0 ? ", " : ""}{p.kind} <SuitGlyph s={p.suit} /> {"(+"}{p.pts}{")"}
                </React.Fragment>
              ))}
              {" = "}<strong style={{ color: PALETTE.ink }}>{sb.total}</strong> support points raising <SuitGlyph s={trumpSuit!} />
            </>
          ) : (
            <>No shortness bonus (no void, singleton, or doubleton outside <SuitGlyph s={trumpSuit!} />) {"\u2014"} <strong style={{ color: PALETTE.ink }}>{sb.total}</strong> support points raising <SuitGlyph s={trumpSuit!} /></>
          )}
        </div>
      )}
    </div>
  );
}

export default function V3PracticePage() {
  const [convention, setConvention] = useState<Convention>("two_over_one");
  const [role, setRole] = useState<Role>("responder");
  const [focus, setFocus] = useState<AnyFocus>("mixed");
  const [scen, setScen] = useState<Scenario | null>(null);
  const [placed, setPlaced] = useState<string[]>([]);
  const [pendingFix, setPendingFix] = useState(false);
  const [firstTier, setFirstTier] = useState<Grade | null>(null);
  const [scored, setScored] = useState<{ bid: string; tier: Grade; rec: Recommendation } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [stats, setStats] = useState<Record<Grade, number>>({ BEST: 0, ACCEPTABLE: 0, SYSTEM_VIOLATION: 0 });
  const [coach, setCoach] = useState({ open: false, loading: false, text: "", err: "" });

  const fillEngine = useCallback((arr: string[], s: Scenario): string[] => {
    const a = [...arr];
    while (a.length < s.calls.length && !s.userIndices.includes(a.length)) a.push(s.calls[a.length].rec.best);
    return a;
  }, []);

  const newDeal = useCallback((conv: Convention, r: Role, f: AnyFocus) => {
    const s = dealScenario(conv, r, f);
    setScen(s);
    setPlaced(fillEngine([], s));
    setPendingFix(false); setFirstTier(null); setScored(null); setReveal(false);
    setCoach({ open: false, loading: false, text: "", err: "" });
  }, [fillEngine]);

  useEffect(() => { newDeal(convention, role, focus); }, [convention, role, focus, newDeal]);

  if (!scen) return null;
  // Support points (HCP + shortness bonus) only mean anything in the Two Over
  // One family, where opener's 1H/1S is the trump suit both seats may raise —
  // No Trump has no trump suit, and Weak Two's own raise logic doesn't use
  // this table, so trumpSuit stays null there and the breakdown line is hidden.
  const twoOverOneTrump: Suit | null =
    convention === "two_over_one" ? (scen.opening === "1S" ? "spades" : scen.opening === "1H" ? "hearts" : null) : null;
  const done = placed.length === scen.calls.length;
  const nextIndex = placed.length;
  const boxActive = !done && !pendingFix && nextIndex < scen.calls.length && scen.userIndices.includes(nextIndex);

  function onUserBid(bid: string) {
    if (!scen) return;
    const idx = placed.length;
    const rec = scen.calls[idx].rec;
    const tier = gradeBid(bid, rec);
    if (idx !== scen.scoredIndex) {
      // an earlier (gated) user call: must be BEST to proceed
      setFirstTier(tier);
      if (tier !== "BEST") { setPendingFix(true); return; }
      setPlaced(fillEngine([...placed, bid], scen));
      return;
    }
    setPlaced(fillEngine([...placed, bid], scen));
    setScored({ bid, tier, rec });
    setStats((s) => ({ ...s, [tier]: s[tier] + 1 }));
  }
  function continueWithBest() {
    if (!scen) return;
    const rec = scen.calls[placed.length].rec;
    setPendingFix(false);
    setPlaced(fillEngine([...placed, rec.best], scen));
  }

  async function askCoach() {
    if (!scen) return;
    setCoach({ open: true, loading: true, text: "", err: "" });
    const scoredRec = scen.calls[scen.scoredIndex].rec;
    try {
      const res = await fetch("/api/coach", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opening: scen.opening, hand: scen.userHand, hcp: handHcp(scen.userHand),
          userBid: scored?.bid ?? null, tier: scored?.tier ?? null, best: scoredRec.best,
          auction: placed.join(" - "),
          note: `Convention: ${convention === "no_trump" ? "No Trump (1NT opening)" : convention === "weak_two" ? "Weak Two (2D/2H/2S opening)" : "Two Over One"}. The student is in the ${role} seat; their ${role === "opener" ? "rebid" : "continuation"} is being graded.`,
        }),
      });
      const data = await res.json();
      if (data.error) setCoach({ open: true, loading: false, text: "", err: data.error });
      else setCoach({ open: true, loading: false, text: data.text || "No response.", err: "" });
    } catch {
      setCoach({ open: true, loading: false, text: "", err: "Couldn't reach the coach. The grade and explanation still stand." });
    }
  }

  // auction rows
  const rows: Array<[string | null, string | null]> = [];
  placed.forEach((bid, i) => {
    if (scen.calls[i].by === "opener") rows.push([bid, null]);
    else if (rows.length) rows[rows.length - 1][1] = bid;
    else rows.push([null, bid]);
  });

  const lastBid = placed.length ? placed[placed.length - 1] : null;
  const legal = (bid: string) => !lastBid || bid === "Pass" || bidRank(bid) > bidRank(lastBid);

  let prompt = "Deal complete.";
  if (!done) {
    if (pendingFix) prompt = "That isn't the system call here.";
    else if (nextIndex === scen.userIndices[0]) prompt = role === "opener" ? "Your opening call." : "Your call as responder.";
    else prompt = `Partner bid ${sym(placed[nextIndex - 1])}. ${role === "opener" ? "Your rebid?" : "Your call?"}`;
  }

  const fixRec = scen.calls[Math.min(placed.length, scen.calls.length - 1)].rec;
  const total = stats.BEST + stats.ACCEPTABLE + stats.SYSTEM_VIOLATION;
  const btnBase: React.CSSProperties = {
    fontFamily: "inherit", cursor: "pointer", border: `1px solid ${PALETTE.line}`, borderRadius: 8,
    background: PALETTE.card, color: PALETTE.ink, padding: "9px 0", minWidth: 54,
  };
  const chip = (on: boolean): React.CSSProperties => ({
    fontFamily: "inherit", cursor: "pointer", borderRadius: 999,
    border: `1px solid ${on ? PALETTE.baize : PALETTE.line}`, background: on ? PALETTE.baize : PALETTE.card,
    color: on ? "#F4EFE4" : PALETTE.muted, padding: "6px 14px", fontSize: 13, fontWeight: on ? 700 : 500, textTransform: "capitalize",
  });

  return (
    <div style={{ background: PALETTE.bg, minHeight: "100vh", color: PALETTE.ink, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <style>{`
        .bidbtn:hover:not(:disabled){ background:#F3EEE3; } .bidbtn:disabled{ opacity:.32; cursor:default; }
        .chip:focus-visible,.bidbtn:focus-visible,.ghost:focus-visible{ outline:2px solid ${PALETTE.gold}; outline-offset:2px; }
        @keyframes stampin{ from{ transform:scale(.9) rotate(-2deg); opacity:0 } to{ transform:scale(1) rotate(-2deg); opacity:1 } }
        @media (prefers-reduced-motion: reduce){ .stamp{ animation:none !important } }
      `}</style>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 40px" }}>
        <header style={{ background: PALETTE.baize, color: "#F4EFE4", borderRadius: "0 0 14px 14px", padding: "18px 20px" }}>
          <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#BED8CB" }}>Two-round auction drill</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 800 }}>Auction Trainer</h1>
            <div style={{ fontSize: 12, color: "#BED8CB" }}>Standard 2/1 (Sutton-style) v1</div>
          </div>
        </header>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "16px 0 4px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: PALETTE.muted }}>Convention</span>
            {CONVENTIONS.map((c) => (
              <button key={c.id} className="chip" onClick={() => { setConvention(c.id); setFocus("mixed"); }} style={chip(c.id === convention)}>{c.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: PALETTE.muted }}>Seat</span>
            {(["responder", "opener"] as Role[]).map((r) => (
              <button key={r} className="chip" onClick={() => setRole(r)} style={chip(r === role)}>{r}</button>
            ))}
          </div>
        </div>

        {(() => {
          const opts = convention === "no_trump" ? NT_FOCUS : convention === "weak_two" ? WEAK_TWO_FOCUS : FOCUS_OPTIONS;
          if (opts.length <= 1) return null;
          return (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "4px 0" }}>
              <span style={{ fontSize: 13, color: PALETTE.muted }}>Response</span>
              {opts.map((f) => (
                <button key={f.id} className="chip" onClick={() => setFocus(f.id)} style={chip(f.id === focus)}>{f.label}</button>
              ))}
            </div>
          );
        })()}

        {convention === "two_over_one" && focus === "drury" && (
          <div style={{ fontSize: 12.5, color: PALETTE.muted, fontStyle: "italic", margin: "2px 0 4px" }}>
            Partner opened in the 3rd or 4th seat, after 1-2 earlier passes {"—"} you (as responder) have already passed too.
          </div>
        )}
        {convention === "two_over_one" && focus === "splinter" && (
          <div style={{ fontSize: 12.5, color: PALETTE.muted, fontStyle: "italic", margin: "2px 0 4px" }}>
            Responder holds 4+ card support, 12+ support points, and a singleton or void on the side {"—"} splinter now instead of Jacoby 2NT.
          </div>
        )}

        <section style={{ background: PALETTE.card, border: `1px solid ${PALETTE.line}`, borderRadius: 14, padding: 20, marginTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: PALETTE.muted, marginBottom: 8 }}>Auction</div>
              <div style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: PALETTE.baize, color: "#F4EFE4", fontSize: 12 }}>
                  <div style={{ padding: "6px 10px" }}>Opener{role === "opener" ? " (you)" : ""}</div>
                  <div style={{ padding: "6px 10px", borderLeft: "1px solid rgba(255,255,255,.15)" }}>Responder{role === "responder" ? " (you)" : ""}</div>
                </div>
                {rows.length === 0 && <div style={{ padding: 10, fontSize: 13, color: PALETTE.muted }}>Your call opens the auction.</div>}
                {rows.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${PALETTE.line}` }}>
                    <div style={{ padding: "8px 10px" }}>{r[0] ? <BidText bid={r[0]} /> : ""}</div>
                    <div style={{ padding: "8px 10px", borderLeft: `1px solid ${PALETTE.line}` }}>{r[1] ? <BidText bid={r[1]} /> : ""}</div>
                  </div>
                ))}
              </div>
            </div>
            <HandDiagram hand={scen.userHand} label={`Your hand (${role})`} trumpSuit={twoOverOneTrump} />
          </div>

          <div style={{ marginTop: 16, fontSize: 14, color: pendingFix ? PALETTE.viol : PALETTE.ink, fontWeight: pendingFix ? 700 : 500 }}>{prompt}</div>

          {!done && !pendingFix && (
            <div style={{ marginTop: 10 }}>
              {BID_ROWS.map((rowArr, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, justifyContent: rowArr.length === 1 ? "flex-start" : "space-between" }}>
                  {rowArr.map((bid) => (
                    <button key={bid} className="bidbtn" disabled={!boxActive || !legal(bid)} onClick={() => onUserBid(bid)}
                      style={{ ...btnBase, flex: rowArr.length === 1 ? "0 0 auto" : 1, padding: rowArr.length === 1 ? "9px 22px" : btnBase.padding }}>
                      <BidText bid={bid} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {pendingFix && (
            <div style={{ marginTop: 12, borderLeft: `3px solid ${PALETTE.viol}`, background: "#FBEDED", borderRadius: "0 8px 8px 0", padding: "12px 14px" }}>
              <div style={{ fontSize: 14.5, marginBottom: 6 }}>
                The system call here is <BidText bid={fixRec.best} /> . <span style={{ color: PALETTE.muted }}>{fixRec.explanationIfNotBest}</span>
              </div>
              <button className="ghost" onClick={continueWithBest}
                style={{ fontFamily: "inherit", cursor: "pointer", border: "none", borderRadius: 8, background: PALETTE.baize, color: "#F4EFE4", padding: "8px 16px", fontWeight: 700, fontSize: 13 }}>
                Continue with {sym(fixRec.best)}
              </button>
            </div>
          )}

          {done && scored && (
            <div style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div className="stamp" style={{ animation: "stampin .18s ease", transform: "rotate(-2deg)", border: `2.5px solid ${tierMeta[scored.tier].color}`, color: tierMeta[scored.tier].color, borderRadius: 8, padding: "6px 12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, fontSize: 14, whiteSpace: "nowrap" }}>
                {tierMeta[scored.tier].label}
              </div>
              <div style={{ flex: 1, minWidth: 220, fontSize: 15, lineHeight: 1.5 }}>
                {scored.tier === "BEST"
                  ? <div>Correct. That&apos;s the system-best call.</div>
                  : <div><div style={{ marginBottom: 4 }}>Best call: <BidText bid={scored.rec.best} /> .</div><div style={{ color: PALETTE.muted }}>{scored.rec.explanationIfNotBest}</div></div>}
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="ghost" onClick={() => newDeal(convention, role, focus)}
              style={{ fontFamily: "inherit", cursor: "pointer", border: "none", borderRadius: 8, background: PALETTE.baize, color: "#F4EFE4", padding: "10px 18px", fontWeight: 700, fontSize: 14 }}>New deal</button>
            {done && (
              <button className="ghost" onClick={() => setReveal((v) => !v)}
                style={{ fontFamily: "inherit", cursor: "pointer", border: `1px solid ${PALETTE.line}`, borderRadius: 8, background: PALETTE.card, color: PALETTE.ink, padding: "10px 18px", fontWeight: 700, fontSize: 14 }}>
                {reveal ? "Hide partner's hand" : "Show partner's hand"}
              </button>
            )}
            <button className="ghost" onClick={askCoach} disabled={coach.loading}
              style={{ fontFamily: "inherit", cursor: coach.loading ? "default" : "pointer", border: `1px solid ${PALETTE.gold}`, borderRadius: 8, background: PALETTE.card, color: PALETTE.gold, padding: "10px 18px", fontWeight: 700, fontSize: 14 }}>
              {coach.loading ? "Coach is thinking\u2026" : "Ask the coach"}
            </button>
          </div>

          {reveal && done && (
            <div style={{ marginTop: 14 }}><HandDiagram hand={scen.partnerHand} label={`Partner's hand (${role === "opener" ? "responder" : "opener"})`} trumpSuit={twoOverOneTrump} /></div>
          )}

          {coach.open && (coach.text || coach.err) && (
            <div aria-live="polite" style={{ marginTop: 14, borderLeft: `3px solid ${PALETTE.gold}`, background: "#FBF6EC", borderRadius: "0 8px 8px 0", padding: "12px 14px", fontSize: 14.5, lineHeight: 1.55 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: PALETTE.gold, marginBottom: 6 }}>Coach</div>
              {coach.err ? <div style={{ color: PALETTE.muted }}>{coach.err}</div> : <div style={{ whiteSpace: "pre-wrap" }}>{coach.text}</div>}
            </div>
          )}
        </section>

        <section style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          {(["BEST", "ACCEPTABLE", "SYSTEM_VIOLATION"] as Grade[]).map((k) => (
            <div key={k} style={{ flex: 1, minWidth: 120, background: PALETTE.card, border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: tierMeta[k].color }}>{stats[k]}</div>
              <div style={{ fontSize: 12, color: PALETTE.muted }}>{k === "SYSTEM_VIOLATION" ? "Violations" : tierMeta[k].label}{total ? ` \u00b7 ${Math.round((stats[k] / total) * 100)}%` : ""}</div>
            </div>
          ))}
        </section>

        <footer style={{ marginTop: 22, fontSize: 11.5, color: PALETTE.muted, lineHeight: 1.5 }}>
          Two-round drill. Grading is deterministic (Rulebook v1); the second call is scored. Coach is live AI for explanation only.
          V5 scope: Two Over One (2/1 GF + Bergen + Jacoby 2NT + 1NT forcing + Simple Raise/Help Suit Game Try + Reverse Drury + Splinter with a simple Roman Keycard 1430 follow-up), No Trump (Stayman, Puppet, Jacoby transfers, 2NT/3NT, and a quantitative 4NT slam invite), and Weak Two Bids (2D/2H/2S openings, responder's full decision tree, opener's feature-ask and new-suit follow-ups). Unusual NT, Western Cuebid, preemptive jump overcalls, and interference over a weak two are deferred — all of them require modeling opponents' calls, which this trainer doesn't yet do.
        </footer>
      </div>
    </div>
  );
}
