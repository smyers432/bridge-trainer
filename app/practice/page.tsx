"use client";

import { useEffect, useMemo, useState } from "react";
import system from "@/lib/system_v1.json";

import type { Grade, Hand, Opening, Suit } from "@/lib/bridge/types";
import { handHcp, distributionPointsForSupport, suitLength } from "@/lib/bridge/eval";
import { randomHand } from "@/lib/bridge/deal";
import { recommendResponder } from "@/lib/bridge/recommend";

type FocusMode =
  | "BASIC"
  | "RANDOM_ALL"
  | "BERGEN"
  | "JACOBY_2NT"
  | "SPLINTER"
  | "TWO_OVER_ONE"
  | "NT_TRANSFERS"
  | "NT_STAYMAN"
  | "NT_TEXAS"
  | "NT_PUPPET";

function openingToDisplay(opening: Opening): string {
  switch (opening) {
    case "1C":
      return "1♣";
    case "1D":
      return "1♦";
    case "1H":
      return "1♥";
    case "1S":
      return "1♠"
case "1NT":
      return "1NT";
  }
}

function openingToTrumpSuit(opening: Opening): Suit | null {
  if (opening === "1H") return "hearts";
  if (opening === "1S") return "spades";
  return null;
}

function pickOpeningForFocus(mode: FocusMode): Opening {
  // NT-focused modes
  if (
    mode === "NT_TRANSFERS" ||
    mode === "NT_STAYMAN" ||
    mode === "NT_TEXAS" ||
    mode === "NT_PUPPET"
  ) {
    return "1NT";
  }

  // Major-opening convention modes
  if (
    mode === "BERGEN" ||
    mode === "JACOBY_2NT" ||
    mode === "SPLINTER" ||
    mode === "TWO_OVER_ONE"
  ) {
    return Math.random() < 0.5 ? "1H" : "1S";
  }

  // BASIC or RANDOM_ALL: allow all openings
  const openings: Opening[] = ["1C", "1D", "1H", "1S", "1NT"];
  return openings[Math.floor(Math.random() * openings.length)];
}

function suitSymbol(suit: Suit): string {
  switch (suit) {
    case "spades":
      return "♠";
    case "hearts":
      return "♥";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
  }
}

function handDisplay(hand: Hand): string {
  const show = (arr: string[]) => arr.join(" ");
  return `♠ ${show(hand.spades)}
♥ ${show(hand.hearts)}
♦ ${show(hand.diamonds)}
♣ ${show(hand.clubs)}`;
}

export default function PracticePage() {
  const [opening, setOpening] = useState<Opening>("1H");
  const [selectedBid, setSelectedBid] = useState<string | null>(null);
  const [handSeed, setHandSeed] = useState<number>(1);
const [hand, setHand] = useState<Hand | null>(null);
const [focusMode, setFocusMode] = useState<FocusMode>("RANDOM_ALL");
const [showDevHint, setShowDevHint] = useState<boolean>(false);
useEffect(() => {
    setHand(randomHand());
  }, [handSeed]);

const [score, setScore] = useState({
  total: 0,
  best: 0,
  acceptable: 0,
  wrong: 0,
  streak: 0
});

const [history, setHistory] = useState<
  Array<{ opening: Opening; handText: string; chosen: string; grade: Grade; best: string }>
>([]);

const safeHand: Hand = hand ?? { spades: [], hearts: [], diamonds: [], clubs: [] };
  const trumpSuit = openingToTrumpSuit(opening);
  const hcp = useMemo(() => handHcp(safeHand), [hand]);
  const trumpCount = useMemo(() => (trumpSuit ? suitLength(safeHand, trumpSuit) : 0), [hand, trumpSuit]);
  const distPts = useMemo(
    () => (trumpSuit ? distributionPointsForSupport(safeHand, trumpSuit, trumpCount) : 0),
    [hand, trumpSuit, trumpCount]
  );
  const supportPts = hcp + distPts;

  const rec = useMemo(() => recommendResponder(safeHand, opening), [hand, opening]);

  function gradeBid(bid: string): Grade {
    if (bid === rec.best) return "BEST";
    if (rec.acceptable.includes(bid)) return "ACCEPTABLE";
    return "SYSTEM_VIOLATION";
  }

  const bids = [
    "Pass",
    "1C",
    "1D",
    "1H",
    "1S",
    "1NT",
    "2C",
    "2D",
    "2H",
    "2S",
    "2NT",
    "3C",
    "3D",
    "3H",
    "3S",
    "4C",
    "4D",
    "4H",
    "4S"
  ];

  const grade = selectedBid ? gradeBid(selectedBid) : null;

  function handleOpeningChange(next: Opening) {
    setOpening(next);
    setSelectedBid(null);
  }

  function newHand() {
  setSelectedBid(null);
  setOpening(pickOpeningForFocus(focusMode));
  setHandSeed((x) => x + 1);
}

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 980 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Don't You Have a Better Bid</h1>

      <div style={{ marginTop: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label>
<label>
  Focus:{" "}
  <select
    value={focusMode}
    onChange={(e) => {
      const next = e.target.value as FocusMode;
      setFocusMode(next);
      setOpening(pickOpeningForFocus(next));
      setSelectedBid(null);
    }}
    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc" }}
  >
  
  <option value="BASIC">Basic (no conventions)</option>
<option value="RANDOM_ALL">Random (all conventions)</option>

<option value="BERGEN">Bergen raises</option>
<option value="JACOBY_2NT">Jacoby 2NT</option>
<option value="SPLINTER">Splinters</option>
<option value="TWO_OVER_ONE">2/1 game forcing</option>

<option value="NT_TRANSFERS">1NT Transfers</option>
<option value="NT_STAYMAN">1NT Stayman</option>
<option value="NT_TEXAS">1NT Texas</option>
<option value="NT_PUPPET">1NT Puppet Stayman</option>

  </select>
</label>

<label style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <input
    type="checkbox"
    checked={showDevHint}
    onChange={(e) => setShowDevHint(e.target.checked)}
  />
  Show dev hint
</label>
          Opener bid:{" "}
          <select
            value={opening}
            onChange={(e) => handleOpeningChange(e.target.value as Opening)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="1C">1♣</option>
            <option value="1D">1♦</option>
            <option value="1H">1♥</option>
            <option value="1S">1♠</option>
            <option value="1NT">1NT</option>
          </select>
        </label>

        <button
          onClick={newHand}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "white"
          }}
        >
          New hand
        </button>

        <div>
          Auction: <strong>{openingToDisplay(opening)}</strong> — ?
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 300 }}>
          <div>
            HCP: <strong>{hcp}</strong>
          </div>

          {trumpSuit ? (
            <>
              <div>
                {suitSymbol(trumpSuit)} support: <strong>{trumpCount}</strong>
              </div>
              <div>
                Dist pts (fit table): <strong>{distPts}</strong>
              </div>
              <div>
                Support pts: <strong>{supportPts}</strong>
              </div>
            </>
          ) : (
            <div style={{ color: "#666", marginTop: 6 }}>No trump fit assumed yet (minor opening context).</div>
          )}
        </div>

        <pre style={{ margin: 0, padding: 12, background: "#f5f5f5", borderRadius: 10, minWidth: 280 }}>
          {handDisplay(safeHand)}
        </pre>
      </div>

{showDevHint && (
  <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
    <div style={{ fontSize: 13, color: "#444" }}>
      Dev hint: Best = <strong>{rec.best}</strong>
      {rec.acceptable.length ? (
        <>
          {" "}
          | Acceptable: <strong>{rec.acceptable.join(", ")}</strong>
        </>
      ) : null}
    </div>
    <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
      (We’ll hide this in “real practice mode” once the engine is mature.)
    </div>
  </div>
)}
      <h2 style={{ marginTop: 18, fontSize: 18, fontWeight: 700 }}>Choose your bid</h2>

      <div style={{ marginTop: 10 }}>
        {bids.map((bid) => (
          <button
            key={bid}
            onClick={() => setSelectedBid(bid)}
            style={{
              margin: 4,
              padding: "8px 12px",
              cursor: "pointer",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: selectedBid === bid ? "#e6f0ff" : "white"
            }}
          >
            {bid}
          </button>
        ))}
      </div>

      {selectedBid && (
        <div style={{ marginTop: 18, padding: 12, borderRadius: 12, border: "1px solid #ddd" }}>
          <div>
            You chose: <strong>{selectedBid}</strong>
          </div>
          <div style={{ marginTop: 8, fontSize: 18 }}>
            Result: <strong>{grade}</strong>
          </div>

          {grade !== "BEST" && (
            <div style={{ marginTop: 10, color: "#333" }}>
              <div>
                Best bid is <strong>{rec.best}</strong>.
              </div>
              <div style={{ marginTop: 6 }}>{rec.explanationIfNotBest}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 12, color: "#666" }}>
        System loaded: <strong>{(system as any).meta?.name}</strong> • Default scoring:{" "}
        <strong>{(system as any).meta?.scoring_default}</strong>
      </div>
    </main>
  );
}
