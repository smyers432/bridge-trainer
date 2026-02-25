import { Hand, Rank, Suit } from "@/lib/bridge/types";

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomHand(): Hand {
  const deck: Array<{ suit: Suit; rank: Rank }> = [];

  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ suit: s, rank: r });
    }
  }

  const shuffled = shuffle(deck);
  const dealt = shuffled.slice(0, 13);

  const hand: Hand = { spades: [], hearts: [], diamonds: [], clubs: [] };
  for (const c of dealt) {
    hand[c.suit].push(c.rank);
  }

  // Sort for nicer display (A K Q ... 2)
  const rankOrder: Record<Rank, number> = {
    A: 13,
    K: 12,
    Q: 11,
    J: 10,
    "10": 9,
    "9": 8,
    "8": 7,
    "7": 6,
    "6": 5,
    "5": 4,
    "4": 3,
    "3": 2,
    "2": 1
  };

  for (const s of SUITS) {
    hand[s].sort((a, b) => rankOrder[b] - rankOrder[a]);
  }

  return hand;
}
