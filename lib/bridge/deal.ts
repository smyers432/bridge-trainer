import { Deal, FocusMode, Hand, Opening, Rank, Recommendation, Suit } from "./types";
import { recommendResponder } from "./recommend";
import { recommendResponderBasic } from "./recommend_basic";
import { countShortages, suitLength } from "./eval";

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];

export function randomHand(): Hand {
  const deck: Array<{ suit: Suit; rank: Rank }> = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const hand: Hand = { spades: [], hearts: [], diamonds: [], clubs: [] };
  for (const c of deck.slice(0, 13)) hand[c.suit].push(c.rank);
  const order: Record<Rank, number> = RANKS.reduce((acc, r, i) => {
    acc[r] = RANKS.length - i; return acc;
  }, {} as Record<Rank, number>);
  for (const s of SUITS) hand[s].sort((a, b) => order[b] - order[a]);
  return hand;
}

function majorTrump(op: Opening): Suit {
  return op === "1S" ? "spades" : "hearts";
}

type ModeDef = {
  id: FocusMode;
  label: string;
  openings: Opening[];
  rec: "std" | "basic";
  pred: (h: Hand, op: Opening, r: Recommendation) => boolean;
};

export const MODES: ModeDef[] = [
  { id: "random_all", label: "Random (all)", openings: ["1C","1D","1H","1S","1NT"], rec: "std", pred: () => true },
  { id: "basic", label: "Basic", openings: ["1NT","1H","1S","1C","1D"], rec: "basic", pred: () => true },
  { id: "two_over_one", label: "2 over 1", openings: ["1H","1S","1D"], rec: "std",
    pred: (_h, _op, r) => /^2[CDH]$/.test(r.best) },
  { id: "bergen", label: "Bergen raises", openings: ["1H","1S"], rec: "std",
    pred: (h, op, r) => suitLength(h, majorTrump(op)) >= 4 && ["3C","3D","3H","3S"].includes(r.best) },
  { id: "jacoby_2nt", label: "Jacoby 2NT", openings: ["1H","1S"], rec: "std",
    pred: (_h, _op, r) => r.best === "2NT" },
  { id: "splinter", label: "Splinters", openings: ["1H","1S"], rec: "std",
    pred: (h, op, r) => {
      const trump = majorTrump(op);
      const sh = countShortages(h, trump);
      return ["3S","4C","4D","4H"].includes(r.best) && suitLength(h, trump) >= 4 && sh.voids + sh.singletons > 0;
    } },
  { id: "nt_transfers", label: "NT transfers", openings: ["1NT"], rec: "std",
    pred: (_h, _op, r) => ["2D","2H"].includes(r.best) },
  { id: "nt_stayman", label: "NT Stayman", openings: ["1NT"], rec: "std",
    pred: (_h, _op, r) => r.best === "2C" },
  { id: "nt_texas", label: "NT Texas", openings: ["1NT"], rec: "std",
    pred: (_h, _op, r) => ["4D","4H"].includes(r.best) },
  { id: "nt_puppet", label: "NT Puppet", openings: ["1NT"], rec: "std",
    pred: (_h, _op, r) => r.best === "3C" },
];

export const FOCUS_UI: { id: FocusMode; label: string }[] = MODES.map((m) => ({ id: m.id, label: m.label }));

export function dealForMode(id: FocusMode): Deal {
  const mode = MODES.find((m) => m.id === id) || MODES[0];
  const rec = mode.rec === "basic" ? recommendResponderBasic : recommendResponder;
  for (let i = 0; i < 6000; i++) {
    const opening = mode.openings[Math.floor(Math.random() * mode.openings.length)];
    const hand = randomHand();
    const r = rec(hand, opening);
    if (mode.pred(hand, opening, r)) return { opening, hand, rec: r, recName: mode.rec };
  }
  const opening = mode.openings[0];
  const hand = randomHand();
  return { opening, hand, rec: rec(hand, opening), recName: mode.rec, relaxed: true };
}
