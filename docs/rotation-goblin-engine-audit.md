# Decision Engine audit — 2026-09-23

Audited upstream main `07d181b57f03d534704cca8f12b9798cb8a0c219`.

## Findings and fixes

- Canonical technical history, separate labels, live data and chart derivation pass existing validators: 41,396 daily states, 8,603 weekly labels, 17 ETFs. Engine training uses 8,161 mature observations.
- Completed manual refresh 35777452353 has no corresponding status recorder in the fetched run history. Previous recorded run was 35777238880. The missing event's platform cause is unproven. Added manual, push and hourly reconciliation, selecting the newest completed main push/schedule/manual refresh from the API. Unchanged markers are not recommitted; failed/missing deployments are retried. Recorder executions serialize.
- Old outer validation folds included shared boundary weeks twice. Fold intervals are now half-open except the last endpoint.
- Feature response bins and percentile distributions were already fit on training rows only. Added explicit 126-session label maturity checks in addition to the 190-calendar-day purge.
- Old component diagnostics selected final weights but did not independently validate that blended score. Added nested chronological weight selection within each outer training period. Outer evaluation compares sectors in the same week, and includes the original-weight and simple relative-strength baselines.
- UI now distinguishes score bands and in-sample response calibration from independently calibrated expected returns or buy instructions.

## Independent combined-score check

Equal-weight average across five outer folds; top-minus-bottom quintile spreads within each week, measured against the existing blended 3M/6M monthly-normalized target.

| Method | Average spread (pp/month) | Positive folds |
| --- | ---: | ---: |
| Nested learned blend | 0.9338 | 5/5 |
| Original component weights, same fitted feature curves | 0.6622 | 4/5 |
| Raw three-month relative performance | 0.4886 | 2/5 |
| Three-month relative performance, above-200DMA candidates ranked first | 0.5353 | 3/5 |

The learned blend beats the original-weight baseline in 3/5 folds, not every fold. These are descriptive ranking diagnostics, not portfolio returns, statistical significance, or after-cost results. Forward labels overlap and ETFs are correlated. No independent untouched final holdout or transaction-cost backtest is claimed.

## Scope and remaining interpretation limits

- Current universe includes commodities, bonds, currencies, international equities and managed futures; this is a mixed ETF ranking, not a pure sector-only experiment.
- Current high scores do not require rising RSI, a fresh crossover, or an early-rotation setup. On the audited snapshot, PDBC/XLK/SMH/XLE all have golden-cross ages above 260 sessions and prices 13–22% above their 200DMA. XLE has negative one-month relative performance. Do not equate STRONG with early entry.
- Golden-cross age is stored in canonical history but is not a fitted feature; the 50/200 spread is fitted. Adding age or an early-rotation gate would change the model and needs separate testing.
- Feature response curves are non-monotonic decile averages learned from outcomes. Component scores are percentiles of fitted responses, not raw bullishness percentiles. Their weighted sum is not itself an exact historical percentile or win probability.
- Historical edge is an in-sample weighted response estimate; it is not independent calibration of the final combined score.
- Existing research `maxDrawdown` labels mean worst move from entry, not peak-to-trough drawdown. The current model does not use those labels. Rename/migrate them before risk reporting; no risk-label migration was silently performed here.
- Final weights after removing duplicate boundary observations are approximately 44.4% trend, 32.8% recovery, 9.3% momentum state, 9.0% relative momentum and 4.5% relative performance.

## Verification

- Regression tests perturb future outcomes and confirm first-fold weight selection is unchanged; validate nonduplicated outer weeks and label maturity.
- Status regression test verifies latest manual run selection, PR exclusion and idempotent recording.
- Engine, market-data and historical-data validators pass.
- TypeScript production build and four existing status-card tests pass.
- These checks do not certify unrelated TTS/player tests or investment profitability.
