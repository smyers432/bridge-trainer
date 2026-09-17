import { Hand, Opening, Recommendation, Suit } from "./types";
import { handHcp, suitLength } from "./eval";

/**
 * BASIC MODE (beginner track): 1NT transfers + Stayman, simple suit raises,
 * new suit forcing one round, natural NT ranges. No Bergen/Jacoby/splinter.
 */
export function recommendResponderBasic(hand: Hand, opening: Opening): Recommendation {
  const hcp = handHcp(hand);
  const sp = suitLength(hand, "spades");
  const he = suitLength(hand, "hearts");

  if (opening === "1NT") {
    if (he >= 5) return { best: "2D", acceptable: [], explanationIfNotBest: "5+ hearts: 2\u2666 transfer." };
    if (sp >= 5) return { best: "2H", acceptable: [], explanationIfNotBest: "5+ spades: 2\u2665 transfer." };
    if (hcp >= 8 && (he >= 4 || sp >= 4)) return { best: "2C", acceptable: ["2NT", "3NT"], explanationIfNotBest: "4-card major, invitational+: Stayman (2\u2663)." };
    if (hcp >= 10) return { best: "3NT", acceptable: ["2NT"], explanationIfNotBest: "Game values: 3NT." };
    if (hcp >= 8) return { best: "2NT", acceptable: ["Pass"], explanationIfNotBest: "Invitational: 2NT." };
    return { best: "Pass", acceptable: ["2NT"], explanationIfNotBest: "Too weak." };
  }

  if (opening === "1H" || opening === "1S") {
    const trump: Suit = opening === "1H" ? "hearts" : "spades";
    const tl = suitLength(hand, trump);
    const r3 = opening === "1H" ? "3H" : "3S";
    const r2 = opening === "1H" ? "2H" : "2S";
    if (tl >= 4) {
      if (hcp >= 10) return { best: r3, acceptable: [r2], explanationIfNotBest: "Support + values: raise your partner's major." };
      return { best: r2, acceptable: [], explanationIfNotBest: "4+ support: raise partner's major." };
    }
    if (opening === "1H" && sp >= 4) return { best: "1S", acceptable: ["1NT"], explanationIfNotBest: "4+ spades: bid 1\u2660 (forcing)." };
    if (hcp >= 13) return { best: "3NT", acceptable: ["2NT", "1NT"], explanationIfNotBest: "Game values, no fit: aim for 3NT." };
    if (hcp >= 10) return { best: "2NT", acceptable: ["1NT"], explanationIfNotBest: "Invitational, no fit: 2NT." };
    if (hcp >= 6) return { best: "1NT", acceptable: [], explanationIfNotBest: "Some values, no fit: 1NT." };
    return { best: "Pass", acceptable: ["1NT"], explanationIfNotBest: "Very weak: pass." };
  }

  if (he >= 4) return { best: "1H", acceptable: ["1S", "1NT"], explanationIfNotBest: "Show a 4-card major first." };
  if (sp >= 4) return { best: "1S", acceptable: ["1NT"], explanationIfNotBest: "Show a 4-card major first." };
  if (hcp >= 13) return { best: "3NT", acceptable: ["2NT", "1NT"], explanationIfNotBest: "Game values, no major: 3NT." };
  if (hcp >= 10) return { best: "2NT", acceptable: ["1NT"], explanationIfNotBest: "Invitational, no major: 2NT." };
  if (hcp >= 6) return { best: "1NT", acceptable: [], explanationIfNotBest: "Some values, no major: 1NT." };
  return { best: "Pass", acceptable: ["1NT"], explanationIfNotBest: "Very weak: pass." };
}
