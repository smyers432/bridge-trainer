import type { Hand, Opening, Recommendation } from "@/lib/bridge/types";
import { handHcp, suitLength } from "@/lib/bridge/eval";

/**
 * BASIC MODE (beginner track)
 * - No conventions except:
 *   * Over 1NT: Stayman (2C) and Jacoby transfers (2D/2H), Texas optional only if you want later
 * - New suits are forcing one round (even in Basic), per your choice.
 */
export function recommendResponderBasic(hand: Hand, opening: Opening): Recommendation {
  const hcp = handHcp(hand);
  const sp = suitLength(hand, "spades");
  const he = suitLength(hand, "hearts");

  // --- Over 1NT (Basic conventions) ---
  if (opening === "1NT") {
    // Transfers with 5+ major
    if (he >= 5) {
      return {
        best: "2D",
        acceptable: [],
        explanationIfNotBest: "With 5+ hearts, use 2♦ as a transfer to hearts."
      };
    }
    if (sp >= 5) {
      return {
        best: "2H",
        acceptable: [],
        explanationIfNotBest: "With 5+ spades, use 2♥ as a transfer to spades."
      };
    }

    // Stayman with a 4-card major and invitational+ values (simple threshold)
    if (hcp >= 8 && (he >= 4 || sp >= 4)) {
      return {
        best: "2C",
        acceptable: ["2NT", "3NT"],
        explanationIfNotBest:
          "With invitational+ values and a 4-card major, 2♣ (Stayman) is best to look for a 4-4 fit."
      };
    }

    // Simple NT invites / game (Basic)
    if (hcp >= 10) {
      return { best: "3NT", acceptable: ["2NT"], explanationIfNotBest: "With game values opposite 15–17, 3NT is best." };
    }
    if (hcp >= 8) {
      return { best: "2NT", acceptable: ["Pass"], explanationIfNotBest: "With invitational values opposite 15–17, 2NT is best." };
    }
    return { best: "Pass", acceptable: ["2NT"], explanationIfNotBest: "With weak values and no major to show, pass is best." };
  }

  // --- Over suit openings (Basic, but new suit is forcing one round) ---
  // For V1 Basic, keep it simple:
  // - With 4+ support, raise (no Bergen/Jacoby/splinters).
  // - Otherwise, bid a 4+ suit at the one level if possible (forcing one round).
  // - Otherwise, bid 1NT/2NT/3NT by strength.

  const openerSuit = opening === "1H" ? "hearts" : opening === "1S" ? "spades" : opening === "1D" ? "diamonds" : "clubs";
  const trumpLen = suitLength(hand, openerSuit);

  if (opening === "1H" || opening === "1S") {
    if (trumpLen >= 4) {
      if (hcp >= 10) return { best: opening === "1H" ? "3H" : "3S", acceptable: [opening === "1H" ? "2H" : "2S"], explanationIfNotBest: "With support and values, raise your partner’s major." };
      return { best: opening === "1H" ? "2H" : "2S", acceptable: [], explanationIfNotBest: "With 4+ support, raise partner’s major." };
    }

    // Show the other major if you have 4 (forcing one round)
    if (opening === "1H" && sp >= 4) return { best: "1S", acceptable: ["1NT"], explanationIfNotBest: "With 4+ spades, bid 1♠ (forcing one round)." };

    // Otherwise NT by strength (simple)
    if (hcp >= 13) return { best: "3NT", acceptable: ["2NT", "1NT"], explanationIfNotBest: "With game values and no fit, aim for 3NT." };
    if (hcp >= 10) return { best: "2NT", acceptable: ["1NT"], explanationIfNotBest: "With invitational values and no fit, 2NT is best." };
    if (hcp >= 6) return { best: "1NT", acceptable: [], explanationIfNotBest: "With some values and no fit, 1NT is the practical choice." };
    return { best: "Pass", acceptable: ["1NT"], explanationIfNotBest: "With very weak values and no fit, pass is best." };
  }

  // Over 1C/1D (Basic): show a 4-card major first (forcing one round), else NT
  if (he >= 4) return { best: "1H", acceptable: ["1S", "1NT"], explanationIfNotBest: "Over a minor, show a 4-card major first (forcing one round)." };
  if (sp >= 4) return { best: "1S", acceptable: ["1NT"], explanationIfNotBest: "Over a minor, show a 4-card major first (forcing one round)." };

  if (hcp >= 13) return { best: "3NT", acceptable: ["2NT", "1NT"], explanationIfNotBest: "With game values and no major, 3NT is best." };
  if (hcp >= 10) return { best: "2NT", acceptable: ["1NT"], explanationIfNotBest: "With invitational values and no major, 2NT is best." };
  if (hcp >= 6) return { best: "1NT", acceptable: [], explanationIfNotBest: "With some values and no major, 1NT is the practical choice." };
  return { best: "Pass", acceptable: ["1NT"], explanationIfNotBest: "With very weak values, pass is best." };
}
