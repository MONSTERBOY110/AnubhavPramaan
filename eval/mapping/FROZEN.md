# FROZEN: mapping eval set

Frozen at: 2026-10-02 02:19 IST
Set hash: `2e1ae590c66bf34cda24bb2f99fff8594799f1976abf972cf2768cd88ee38a55`

The 20 declarations below were written and labelled **before any mapper code existed**:
at the time of freezing `lib/mapping/` did not exist and there was no claim-extraction logic (no
extraction prompt and no model call; only a browser fetch stub for an endpoint not yet built). The
label rules are in `README.md`. `tests/unit/frozen-set.test.ts` recomputes every hash on each test
run.

What this set is: a frozen synthetic set written by AI agents (D01 by the build agent, the rest by
three writing agents following the same rules), checked by `check_labels.py` (spans verbatim, PC
ids valid) and `review_set.py` (label rules 7 and 8, no dashes, no identifier-like digits). Numbers
measured on it are reported as "frozen synthetic set". It is not real worker data, and nobody
outside the build has labelled it.

Known limitations, stated before any result exists:
- The same agents wrote the text and the labels, so the set measures agreement with these label
  rules, not with an independent human labeller. The held-out role-play recordings are the
  independent check.
- The six full-experience declarations cover most PCs by design, so their labels overlap heavily
  (largest pairwise Jaccard 0.88, D02 and D05).
- D16 (Roman-script Hinglish) follows a similar structure to D01 with a different persona and
  different labels (Jaccard 0.71).
- D13 has no supported PC at all ("हाँ, किया है"): any QP or route suggestion for it is wrong by
  construction unless the mapper declines to suggest.

## Files

| File | SHA-256 (LF line endings) |
|---|---|
| D01.json | `f49ddcd1d18ac30b61fc8d02e52c6b4a8cb282663ad126a37feb830fe492aa88` |
| D02.json | `3cf672e987616fc9763553b87047d0f1ce3a1010d3b2598f42db310c8bd24de1` |
| D03.json | `0f051fcb57890a12c4654b2ac03d4f2b8712b1bc32cf22b91b40399da88a3208` |
| D04.json | `1bef3dd632a3be2956fe384ac3ee1aafee18f2621d67ae3dd72db656305dfb83` |
| D05.json | `1240cf1fefe0ac3b230f8773bbeabab6bbfa030483808493c01ead58df75e850` |
| D06.json | `60b3f5c4c9c3b810c99d690cb6b95f5d82bb8fa839a761157f0528bfe44996ff` |
| D07.json | `bb78d73d28f5dc67989d4f608055863fd961cfd26285431a413192addfc1e6e7` |
| D08.json | `1737795808cd82974db22abceb44721f6da0df1ae4a967f5f0e3021e40a70835` |
| D09.json | `b6244bf0f75333fc6bab5ed31f25e4c391aef7fe5b5ef28508b49839148fda16` |
| D10.json | `60739806298a3b2cb4d138f400b472f884bf6f80b3ddec5ecfaf98a31d8ee8b1` |
| D11.json | `7691d43ff63a9c921348cd445f3eca1ee5fd1bbcb70610760ed84d14f5b53721` |
| D12.json | `ecec099c60086bfaebbf9f29571951af8a8cef719e5e197b7e123878f4df4215` |
| D13.json | `8b86ac28fb21c3f0bda40728f231111538c830c53bf78e6d709c81f882e61987` |
| D14.json | `3c6bfb0153e04d111d4142f06613413bb1d7c08424019c49662deb5c91b77c65` |
| D15.json | `c9004626c28435972c8d809d13ac38ce0bff8000d3cd82e1b1ebea19f3af3a41` |
| D16.json | `bc951068f20e266d64ed2acfc710c3cb2bd559315557cfeecc2662a74b1af965` |
| D17.json | `0f4c616778cee13c329310e4471b9ec0721fec34150513666cd899bbcee2bdb7` |
| D18.json | `6bd793847739b93dbec266cc0599d69f65074e257b4b91b6f42bb21c27d1898b` |
| D19.json | `57551318b8ea99f479c6bf0649e3e8f42c346787fa8ac946f58f9ab235ccf3ed` |
| D20.json | `c282fa001a498d35b38067a1a907a6f5eb1128e71737bf3e8460d810ada3be2f` |

## Inputs the labels refer to

| Input | SHA-256 |
|---|---|
| eval/mapping/README.md (label rules) | `d2f3070820e1348981924a712a91868256804b514475675d43b3f912f2150fd6` |
| CON/Q0602 v4.0 (extracted) | `15d462f27bfcc386f95956b78ace59ea9063b133c12f90162c401fbb8ef1bd14` |
| CON/Q0103 v1.0 (extracted) | `d34e8a5ed1ff2943a43aab0cfc8b0e4b764dc655f0191d665a7e9c546581a671` |

## Route labels

Each file stores the route under both rules, derived by `check_labels.py` from the PC labels:
`routeFlat` (covered PCs / all PCs, the TRD rule) and `routeWeighted` (QP weightage and element
marks). Which rule the product uses is a design decision recorded in the project docs; the eval
reports agreement under the rule in use and states which.

## Corrections

None so far.

## Reporting rule

- 2026-10-02 11:51 IST (lead): an LLM run reports numbers only when every declaration completes with
  no link error and no extraction fallback; otherwise it is "incomplete, not reported", with the list
  of failures. A rule-based fallback is never mixed into an AI number.
- Amendment, 2026-10-02 13:03 IST (lead), decided before any frozen scores were viewed (no LLM run on
  this set had computed or shown a score; the keyword baseline runs below use no model): a block by
  Azure's content filter is a fixed property of the deployed system, not an infrastructure failure.
  An answer the provider's content filter refuses is handled by rule-based extraction, as in the live
  app, and the declaration counts as complete. Such a run reports two numbers: the headline over all
  declarations, with a note of how many answers the filter blocked and in which declarations; and
  the pure-AI number over only the declarations with zero fallbacks. Any other fallback, and any link
  error, still makes a run "incomplete, not reported". Model, prompts and labels stay the same, and
  LLM run 2 is scored as it stands, without a rerun.

## Runs

- 2026-10-02 02:45 IST: keyword mode, n=20: top-1 QP 18/20; PC links micro P 62.0% R 69.0%; route agreement flat 17/20, weighted 16/20; models none; file `eval/mapping/runs/20261002-0245-frozen-keyword.json`
- 2026-10-02 02:59 IST: keyword mode, n=20: top-1 QP 19/20; PC links micro P 65.1% R 66.8%; route agreement flat 18/20, weighted 15/20; models none; file `eval/mapping/runs/20261002-0259-frozen-keyword.json`
- Why the 02:59 run exists: a unit test on sentences outside this set found that the keyword baseline's phonetic key let short words collide (करनी, a trowel, matched करता, does; तराई, curing, matched तार, wire; PPE matched पाइप). Fix: a one-word synonym must match a whole word with a key of 3 or more consonants. No label changed. Both runs stay listed; the later run reflects the fixed code.
- 2026-10-02 11:30 IST: llm mode, azure:gpt-5-mini, prompts extract-v1 and link-v4, n=20: stopped by hand at 11:51 with no result (LLM run 1). It wrote no progress, cached one declaration (D07 at 11:50:41, a minute before the stop, with complete replies, so later runs with the same configuration reuse it), and the deployment showed almost no use, so the lead stopped it as stalled. Nothing from it is reported. Before the rerun the gateway gained a hard deadline per attempt and bounded retries, the runner gained live progress per call and per declaration, the link reply's output budget went from 4,096 to 16,000 tokens, and the reporting rule became: numbers only when every declaration completes with no link error and no extraction fallback. Prompts, labels and model are unchanged.
- 2026-10-02 12:04 IST: llm mode, azure:gpt-5-mini, prompts extract-v1 and link-v4, n=20: incomplete, not reported (2 of 20 declarations failed: D02 1 extraction fallback(s); D06 1 extraction fallback(s)); file `eval/mapping/runs/20261002-1204-frozen-llm.json` LLM run 2, a rerun after run 1's infrastructure failure with the same prompts, labels and model; D07 came from run 1's cache. All 20 declarations completed with link errors 0. Both failures are Azure's input content filter refusing the answer about tools (`sexual: medium`, a false positive on electrician speech), so that answer fell back to rules; prompts and frozen text cannot change, and at 13:02 the lead found the filter cannot be changed either (not our resource), so the amended rule above applies and the run is scored below without a rerun. Tokens per declaration 21,661 in and 15,037 out; 44 minutes.
- 2026-10-02 12:04 IST (LLM run 2, scored 13:12 IST from its saved rows, no rerun): llm mode, n=20: top-1 QP 20/20; PC links micro P 92.5% R 86.3%; route agreement flat 19/20, weighted 17/20; note: 2 of 156 answers (D02, D06) blocked by the provider's content filter and handled by rule-based extraction, as in the live app; azure:gpt-5-mini, prompts extract-v1 and link-v4, tokens per declaration 21661 in and 15037 out, link errors 0, extraction fallbacks 2 (content filter only); pure AI, the 18 declarations with zero fallbacks: top-1 QP 18/18; PC links micro P 91.3% R 86.5%; route agreement flat 18/18, weighted 16/18; tokens per declaration 21270 in and 14464 out; 1 of 20 from the cache of an earlier run with this configuration (D07); file `eval/mapping/runs/20261002-1204-frozen-llm.scored.json`
