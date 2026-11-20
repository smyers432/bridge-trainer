# V7 — Approach / Seat / Convention restructure + New Minor Forcing

## New structure (page.tsx + lib/bridge/practice.ts)
1. **Bidding approach**: 2/1 (the Sutton rule set) or Basic (the beginner rule set in recommend_basic.ts).
2. **Seat**: responder or opener.
3. **Conventions**: Mixed, Bergen, Jacoby 2NT, NMF, Weak Two, Stayman, Puppet Stayman, Transfers, Splinter raises, RKC.
   Mixed draws a convention at random (an immediate repeat is made less likely, never impossible) and the page names the convention only AFTER grading ("Convention in this deal").
- **Scoring is unchanged**: the last call the user makes is scored; earlier user calls must match the system's call — if not, the system shows its call and the user continues, unscored.
- Opponents selector kept (2/1 + responder + Mixed/Bergen/Jacoby 2NT only).
- 2/1 GF, 1NT forcing, Simple Raise/HSGT, quantitative 4NT and the old Splinter+RKC chip are no longer reachable from the UI (code untouched).
- Decoy hands (deals where the picked convention is not the best call) exist behind a flag in nmf.ts (`dealNMFPair(true)`) and basic.ts (`dealBasicNTPair(conv, true)`) but are OFF — a specific-convention drill always deals that convention.

## Assumptions to confirm
- **Basic** offers only Stayman and Transfers (the two conventions recommend_basic.ts contains); the other chips are greyed out under Basic. Basic Stayman includes game-strength hands (no Puppet in Basic): 4-4 fit -> 3M (8-9) / 4M (10+); no fit -> 2NT / 3NT. 5-5 major hands are not dealt; responders capped at 15 HCP.
- **Splinter raises** now ends at opener's rebid (4M sign-off, or the 4NT keycard ask).
- **RKC** = the 1430 line after a splinter where opener has no wasted values. The opening and the splinter are played for the user, so the user's calls are opener's 4NT ask + final decision, or responder's keycard answer. RKC after Jacoby 2NT slow arrival is NOT built: the current rulebook deliberately has no keycard ask on that path, and adding one would change existing grading.
- NMF: see below.

## NMF (Sutton 2022) — responder AND opener
- The whole auction is dealt; the user bids every call of their own seat (responder: 1M, NMF, placing call; opener: 1m/1H opening, 1NT rebid, reply to NMF); last call scored.
- Opener's 1NT rebid = 12-14 balanced. NMF = 11+ HCP (plain HCP); responder dealt 11-14 HCP with a 5-card major.
- Reply priority: 4 hearts (2H, only over a 1S response) > 3-card support (2M with 12-13, 3M with 14) > minimum (2NT with stoppers in both unbid suits, else cheap rebid) > maximum (5+ cards in opening minor, else the 4-card other minor, else 3NT).
- No 4-card-major reply exists over a 1H response: opener would have rebid 1S.
- **CHANGED from the question list**: after 1C-1S-1NT-2D the cheap rebid 2C is illegal (below 2D), so the minimum reply there is 2NT (stoppers not required).
- JUDGMENT: opening suit with balanced 12-14 and no 5-card major = longer minor, 4-4 -> 1D, 3-3 -> 1C (so over 1D/1C the max replies 3m cover every non-fit hand; 3NT is effectively reachable only after 1H-1S-1NT).
- JUDGMENT: stopper = A; Kx; Qxx; Jxxx.
- JUDGMENT: 1H-1S-1NT: NMF suit = longer minor, then more HCP, then clubs; opener's reply is not altered by NMF being "semi-natural".
- JUDGMENT: responder's placing call. Max reply -> game (4M with support; 3NT with 4M acceptable otherwise; pass 3NT). Min reply -> 13+ game (4M / 3NT), 11 stop (pass 2M / pass 2NT / sign off 2M after the cheap rebid). Responder with exactly 12 HCP facing a minimum reply is NOT dealt (invitational zone; Sutton says any 3-level bid is forcing).
- Not dealt / not built: 2H (4 hearts) replies (no continuation in the doc), NMF after a minor rebid (1C-1S-2C-2D), 3-level NMF over 2NT, 3C sign-off with a weak long-club hand.

## Verification
- `tsc --noEmit` clean. eslint: only the 5 errors that already exist at HEAD in page.tsx (setState-in-effect, unescaped apostrophes in the footer).
- Fuzz: 1,500 deals for each of 2 approaches x 2 seats x 10 convention choices (Mixed included): 0 illegal auctions, 0 duplicate cards, correct convention label every time, user calls always on the user's seat with the last one scored, Basic never gives a non-Stayman/Transfers deal, Mixed spreads roughly evenly across the nine (2/1) or two (Basic) conventions, Splinter drills never contain keycard calls, RKC drills always start at 4NT.
- Book "Now Try These" hands 1-3 reproduce the expected NMF auctions.
- NOT tested: live in a browser, and the Coach endpoint with the new rulebook text.
- Not committed or pushed.

## Addendum: Reverse Drury restored as a convention option (2/1 only)
- Chip "Reverse Drury" (uses drury.ts unchanged; not offered under Basic). Because the 3rd/4th-seat, already-passed context is part of the problem and the auction table doesn't show passes, the page prints that context line for Drury deals (it doesn't name the convention, so Mixed still hides it until grading).

## Addendum: Mixed weighting and the Strong 2C convention (Nov 19)

**Mixed weighting.** Under 2/1, Mixed draws a group first: 40% the 1NT conventions (Stayman, Puppet Stayman, Transfers; split evenly), 60% the other eight conventions (split evenly). The "repeat of the last convention is less likely" rule applies inside each group. Under Basic the pool is all NT, so every Mixed deal is a 1NT opening. Measured over 20,000 deals: NT 39.9%.

**Strong 2C** (`lib/bridge/strong2c.ts`; Sutton 2016 is the authority, Lindop's 2005 article is examples only). Drill = 2C, response, opener's rebid, responder's second call (last call scored). 2/1 only.
- Opening: balanced 22+ HCP, or unbalanced worth 22+ points. Judgment calls: points = HCP + 1 per card past the 4th, at least 17 HCP, and the longest suit must be a 5+ card MAJOR (minor-suit rebids are not dealt). Balanced rebids: 22-24 = 2NT, 25-27 = 3NT; 28-30 (4NT) is not dealt.
- Responder's first call (Sutton): 2D waiting (0-7, or any hand unsuitable for a positive); 2H/2S/3C/3D positive (8+, 5+ card suit with 2 of the top 3 honors); 2NT positive (balanced 8+). A balanced hand that also has a good 5-card suit is ambiguous and is not dealt. Lindop bids 2D with a balanced 9-count in his example 5; Sutton says 2NT, so the drill says 2NT.
- A positive response ends the auction (the doc stops there). About 20% of responder-seat deals are positives; the opener seat only gets 2D auctions. (Assumption: question left unanswered.)
- Over a 2NT/3NT rebid: NT-auction methods. Over 2NT: a 5+ card major transfers at any strength (3D/3H), else pass with 0-3, Stayman 3C with a 4-card major, 4NT quantitative with 9+, else 3NT. Over 3NT: only with 7+ points (4C Stayman / 4D-4H transfers / 4NT), otherwise pass. The 9+ and 7+ slam thresholds are judgment calls; 30% of NT-rebid deals are dealt with a slam-interest responder so the 4NT call actually comes up.
- Over a rebid of a major (Sutton; the user's earlier pass / 4M / 4NT-RKC variant was reverted on Nov 19 because it contradicted her): points = support points when responder has 3+ trumps, else HCP (judgment call: Sutton says only "points"). 3+ trumps and 4+ points: raise to 3M. 4+ trumps and 0-3: jump to 4M. Otherwise 0-3: 3C double negative. Then a 5+ card suit, else 2NT. RKC is not part of the drill.
- Deal mix: 35% 2NT rebid, 10% 3NT, 55% major.
- Verification: tsc clean; 12,000 Strong 2C deals plus 7,200 deals across every approach x seat x convention with 0 failures; Lindop example 2 reproduces (2C 2D 2NT 3C).

**Standing rule (Nov 19):** Sutton is the authority and the default everywhere. Any direction that contradicts her is implemented only as an explicit user override and flagged as such; where the user is silent, Sutton's text is used.

**Reverse Drury removed from the convention list (Nov 20).** At the user's direction it is no longer a chip, no longer in Mixed (2/1 Mixed is now 40% NT / 60% the other seven, ~8.6% each), and its 3rd/4th-seat context line is gone. `drury.ts` and the "drury" focus in `scenario.ts` are left in place, unused by the practice screen. Note: the module was built as "3rd or 4th seat, after one or two prior passes"; the user's stated reason for removing it was that Reverse Drury applies only after three passes. That differs from the module's rule and has not been checked against Sutton's Drury page.

## V8 addendum: Overcall seat (first release)
- New Seat chip "overcall": RHO opens one of a suit (overcall.ts), the student makes one graded call: Pass, simple overcall, takeout double, or 1NT overcall. 2/1 only. Decision chips: Mixed / Simple overcall / Takeout double / 1NT overcall / Pass.
- Rulings from the user: takeout double minimum 13 points; "standard ACBL" for simple overcalls; no jump overcalls; Michaels / Unusual NT / cuebid raises / advancer deferred.
- Sutton-based: 1-level overcall 8-16 HCP, 5+ card suit; takeout double = opening points counting dummy points, short in the opponent's suit.
- Judgment calls (not Sutton): two-level overcall 11-16 HCP with a good suit (2 of top 3, or 3 of top 5); one-level suit needs 2 of top 5 honors; dummy points void 5 / singleton 3 / doubleton 1; double shape (<=2 in opp suit, 3+ in each unbid, 4+ unbid major); 1NT overcall 15-18 balanced with a stopper (standard ACBL); suit overcall best and X acceptable when both fit; RHO opening definition.
- Not dealt: 19+ HCP, 17-18 HCP without a clean call, two-suiters, 7+ card suits, 6-card suits with <=10 HCP, balanced 15-18 without a stopper.
- Not modeled: vulnerability, balancing seat, opponents' later calls, partner's response.
