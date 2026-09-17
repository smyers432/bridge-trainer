export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type Rank =
  | "A" | "K" | "Q" | "J"
  | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";

export type Opening = "1C" | "1D" | "1H" | "1S" | "1NT" | "2D" | "2H" | "2S";

export type Grade = "BEST" | "ACCEPTABLE" | "SYSTEM_VIOLATION";

export type Hand = Record<Suit, Rank[]>;

export type Recommendation = {
  best: string;
  acceptable: string[];
  explanationIfNotBest: string;
};

export type FocusMode =
  | "random_all"
  | "basic"
  | "two_over_one"
  | "bergen"
  | "jacoby_2nt"
  | "splinter"
  | "nt_transfers"
  | "nt_stayman"
  | "nt_texas"
  | "nt_puppet";

export type Deal = {
  opening: Opening;
  hand: Hand;
  rec: Recommendation;
  recName: "std" | "basic";
  relaxed?: boolean;
};
