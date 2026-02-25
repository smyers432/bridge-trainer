import system from "@/lib/system_v1.json";
import { Hand, Rank, Suit } from "@/lib/bridge/types";

export function rankHcp(rank: Rank): number {
  switch (rank) {
    case "A":
      return 4;
    case "K":
      return 3;
    case "Q":
      return 2;
    case "J":
      return 1;
    default:
      return 0;
  }
}

export function handHcp(hand: Hand): number {
  const all = [...hand.spades, ...hand.hearts, ...hand.diamonds, ...hand.clubs];
  return all.reduce((sum, r) => sum + rankHcp(r), 0);
}

export function suitLength(hand: Hand, suit: Suit): number {
  return hand[suit].length;
}

export function countShortages(
  hand: Hand,
  excludeSuit?: Suit
): { voids: number; singletons: number; doubletons: number } {
  let voids = 0,
    singletons = 0,
    doubletons = 0;

  for (const s of ["spades", "hearts", "diamonds", "clubs"] as Suit[]) {
    if (excludeSuit && s === excludeSuit) continue;
    const len = hand[s].length;
    if (len === 0) voids++;
    else if (len === 1) singletons++;
    else if (len === 2) doubletons++;
  }

  return { voids, singletons, doubletons };
}

export function distributionPointsForSupport(
  hand: Hand,
  trumpSuit: Suit,
  trumpCount: number
): number {
  const he = (system as any).hand_evaluation;

  const table =
    trumpCount >= 4
      ? he?.distribution_points?.support_4plus_trump
      : trumpCount === 3
        ? he?.distribution_points?.support_exactly_3_trump
        : null;

  if (!table) return 0;

  const { voids, singletons, doubletons } = countShortages(hand, trumpSuit);

  return (
    voids * table.void +
    singletons * table.singleton +
    doubletons * table.doubleton
  );
}
