import { Grade, Opening, Recommendation } from "./types";

export function gradeBid(userBid: string, rec: Recommendation): Grade {
  if (userBid === rec.best) return "BEST";
  if (rec.acceptable.includes(userBid)) return "ACCEPTABLE";
  return "SYSTEM_VIOLATION";
}

const DENOM_IDX: Record<string, number> = { C: 0, D: 1, H: 2, S: 3, NT: 4 };

export function bidRank(bid: string): number {
  if (bid === "Pass") return -1;
  return parseInt(bid[0], 10) * 5 + DENOM_IDX[bid.slice(1)];
}

export function legalBid(bid: string, opening: Opening): boolean {
  return bid === "Pass" || bidRank(bid) > bidRank(opening);
}

export const BID_ROWS: string[][] = [
  ["Pass"],
  ["1C", "1D", "1H", "1S", "1NT"],
  ["2C", "2D", "2H", "2S", "2NT"],
  ["3C", "3D", "3H", "3S", "3NT"],
  ["4C", "4D", "4H", "4S", "4NT"],
  ["5C", "5D", "5H", "5S", "5NT"], // Roman Keycard (1430) responses/sign-offs; 5D is also the diamond weak-two game level
  ["6C", "6D", "6H", "6S", "6NT"], // small-slam bids (6NT retained for the quantitative-4NT slam accept, No Trump family)
];
