# Study protocol: assessor agreement with and without AnubhavPramaan

**Status:** pre-registration. No data have been collected and no result exists.
**Version:** 1.0, 2 Oct 2026. **Problem statement:** SIH26242, Ministry of Skill Development and Entrepreneurship (MSDE), "AI-Assisted Skill Assessment Tool for Recognition of Prior Learning (RPL)", theme Smart Education [1].

The problem statement asks for "Evidence of consistency improvement over unassisted manual scoring (e.g., inter-assessor agreement on a test set)" [1]. That evidence needs several independent human raters, so the study is fixed here before it runs at the Smart India Hackathon 2026 grand finale, and anyone can check the published analysis against it.

## 1. Question and hypotheses

Do assessors scoring the same evidence agree more with the tool's support than without it?

- **Unaided:** the PC text and the 0 to 3 scale only, in the same evidence viewer.
- **Assisted:** the same, plus the PC's written anchors, observables, exemplar images where available, and AI evidence hints that never give a level (section 7).

| | Hypothesis | Met when |
|---|---|---|
| H1, primary | Agreement on levels (Krippendorff's alpha, ordinal) is higher assisted than unaided | The 95% CI of the difference lies wholly above 0 |
| H2 | Assisted agreement on PC met or not met (Fleiss' kappa) reaches 0.60, below which McHugh calls agreement inadequate [2] (stricter than Landis and Koch, whose "moderate" starts at 0.41 [3]) | Estimate of 0.60 or more |
| H3 | Assisted agreement on item totals (ICC(2,1)) reaches 0.75, "good" in Koo and Li [4] | Estimate of 0.75 or more |

Accuracy and strictness are also reported (section 5). H2 and H3 are secondary, uncorrected for multiple testing. Following Koo and Li [4], every estimate comes with its 95% CI, and the report notes any lower bound below its threshold. **Results are published whether or not they favour the tool.**

## 2. Design

The design follows Schauber et al. 2024, where 10 examiners scored the same 4 video-recorded candidates in a structured oral exam and agreed on pass, borderline or fail at a Fleiss' kappa of only 0.07 [5]. A within-rater crossover gives every rater both conditions but no repeated item:

| Group | Block 1: unaided | Block 2: assisted |
|---|---|---|
| A | Set X | Set Y |
| B | Set Y | Set X |

- Each condition covers both sets, matched in difficulty (section 3), so set difficulty cannot favour either condition.
- **Randomisation:** rater codes are shuffled within each background (section 4), listed qualified first, and dealt alternately to A and B, so groups differ by at most one rater; each rater's item order is shuffled too. Draws use mulberry32 from `lib/agreement/bootstrap.ts` (seed 2 for allocation, seed 3 for item order), so anyone can repeat them.
- Everyone first scores one practice item, unaided and not analysed. A scripted briefing on anchors and hints precedes block 2.
- **Washout:** none is possible, since anchors cannot be unlearned; hence unaided always comes first, then a break. Practice or fatigue effects therefore cannot be separated from the effect of assistance, as the results will state.
- Raters get no feedback on scores or the key until both blocks end.

## 3. Items

An **item** is the evidence of one candidate's work (photos or a short video) with 3 to 5 judgement PCs (section 7) of the Assistant Electrician qualification pack CON/Q0602 v4.0 [6] that can be judged from it.

- **Number:** 12 to 20 items, half per set (design target, set by session time rather than a power calculation). Koo and Li advise at least 30 samples and 3 raters [4], so intervals will be wide.
- **Source:** the ministry's dummy worker-assessment data, which the problem statement says will be provided [1]. If it has no usable photos or videos of electrical work, openly licensed media (CC0, CC BY or CC BY-SA) are used, each listed with title, author, source, licence and any change such as cropping. Scores supplied with the dummy data become the key only if the ministry states how they were set.
- **Answer key:** before the session, a qualified electrician or ITI instructor who does not rate judges every PC from the evidence using only the PC text and the WorldSkills labels (section 5), independent of the tool's anchors and hints, and removes PCs that cannot be judged. The key stays hidden until scoring ends; its SHA-256 hash is published before scoring starts. Without such a person, accuracy is not reported.
- **Matching:** items ranked by key total are paired, and a mulberry32 draw (seed 1) sends one of each pair to X. Where possible, met and not met PCs each make up at least a quarter of the key (design target). Without a key, pairs match on PC count and NOS.
- Exemplar images never come from study items.

## 4. Raters

- **Eligible:** adults who read the language of the materials: certified assessors, ITI instructors and electricians (recorded as "qualified"), and trained volunteers without an electrical qualification ("volunteer"). Everyone gets the same scripted briefing and gives informed consent first (section 8).
- **Target:** 6 to 10 raters (design target). The study runs only if at least 4, 2 per group, complete both blocks.
- **Not eligible:** the development team and the key setter.
- **Human raters only:** no model, script or simulated rater produces any analysed score.
- Raters work alone on separate devices and never see others' scores; the facilitator reads a fixed script and does not comment on items.

## 5. Measures and analysis, fixed now

A **unit** is one PC on one item. Raters give each unit a level from 0 to 3, and both conditions show the WorldSkills labels: 0 below industry standard, 1 meets it, 2 meets and in specific respects exceeds it, 3 wholly exceeds it and is excellent [7]. **Met** means level 1 or above. An **item total** is the item's level sum as a percentage of its maximum (3 per PC). A **block** is one set scored by one group in one condition.

| Measure | Computed on | Use |
|---|---|---|
| Krippendorff's alpha, ordinal [8] | Levels, all units per condition; unscored cells stay empty, which alpha allows | H1, primary: assisted minus unaided |
| Fleiss' kappa [9] | Met or not met, both sets pooled per condition (kappa allows different raters per unit); if group sizes differ, computed per block and averaged | H2, and the difference |
| ICC(2,1), two-way random, absolute agreement [10] | Item totals per block (a complete matrix), averaged over the condition's two blocks | H3, and the difference |
| Accuracy | Share of unit ratings matching the key on met or not met; mean absolute difference from the key level | Descriptive |
| Strictness index | Per rater and condition: mean over units of the rater's level minus the other raters' mean on that unit (positive lenient, negative strict) | Descriptive |
| Time per item | Seconds from opening an item to its last level (session log); median per condition | Descriptive |

- **Confidence intervals:** 95% percentile bootstrap over items, each item keeping its units and ratings; 2,000 resamples; mulberry32 seed 1; quantiles by linear interpolation. A difference recomputes both conditions on the same resample. Resamples where a statistic is undefined are dropped and counted.
- **Guard rule:** if agreement rises while accuracy falls, the result is not called an improvement, because agreeing on a wrong answer is not better scoring.
- **Subgroup:** if each group has at least 3 qualified raters, the analysis is repeated for them alone.
- **Software:** the project's `lib/agreement` module. Its tests (`tests/unit/agreement.test.ts`) reproduce the Fleiss (1971) example [9], Shrout and Fleiss (1979) Tables 3 and 4 [10], and Krippendorff (2011) examples A to C, including ordinal alpha 0.815 [8]. Fleiss (1971) is closed access, so its values come from published reproductions recorded in `data/reference/`. The analysis script uses this module; changing it after scoring starts is a deviation.
- Analyses not listed here are labelled exploratory.

## 6. Handling problems

- **Missing scores:** the study screen requires a level on every unit. A level still missing enters alpha as missing; for kappa and ICC, its unit or item is dropped from both conditions, and the count is reported.
- **Dropouts:** a rater who stops early is excluded from all statistics; their scores are published only if their consent stands.
- **No variance:** unanimous items stay in, as unanimity is part of what is measured; a statistic undefined for a whole condition is reported as such, beside raw percent agreement.
- **No hints:** if hints cannot be produced, the study still runs and is reported as a test of anchors, observables and exemplars.
- **Deviations** are logged with time, reason and who decided, and listed with the results.
- **Published after the session:** item list with licences, PC selection, frozen hints, key, raw scores, session log, and the analysis script with its output. Ministry data is published only with the ministry's permission; otherwise its item ids and file hashes are.

## 7. What the tool does and does not do during the study

- **Hints, not scores:** per observable, a hint says "visible", "not visible" or "cannot tell" with a one-line reason, never a level or a total. Hints are generated once before the session, stored with their hash and model version, and shown identically to every assisted rater.
- **Deviation reasons:** if a level contradicts the hint (met while an observable is not visible, or not met while every observable is visible; rule in `docs/TRD.md`, M4, as at the fixing commit), the screen asks for a one-line reason. Both are stored and published.
- **Nothing is auto-scored:** the tool scores only measurement PCs, by rule against sourced tolerances; the study leaves them out, as they would raise assisted agreement for reasons unrelated to judgement. Raters see no total, grade or recommendation.

## 8. Ethics and data

- **Consent:** each rater signs after reading a notice that, as section 5 of the Digital Personal Data Protection Act, 2023 requires [11], states what personal data is collected and why, how to withdraw consent or raise a grievance, and how to complain to the Data Protection Board. Withdrawal deletes that rater's scores (from the current version, if already published) and the link between their name and code; only the withdrawal is logged.
- **Raters:** names and contacts stay on consent forms, kept offline and apart from scores. Published data carries rater codes and background category only.
- **Candidates:** the materials hold no personal data of candidates. Names in dummy data are replaced by item codes; Aadhaar, PAN and phone numbers are redacted with `lib/cert/redact.ts`; faces are blurred or cropped; the tool does no face identification.
- **Retention:** consent forms and study records are kept for 3 years, the period the CSDCI assessment guide sets for assessment records [12], then deleted. Published pseudonymous data stays public.
- **Risk** is minimal; any ethics review the organisers require is obtained first.

## 9. Timeline

1. This protocol is committed publicly before the grand finale.
2. Before the session: the item list, PC selection, frozen hints, key hash, briefing scripts and analysis script are committed.
3. The session runs at the grand finale.
4. Within 7 days (design commitment): everything in section 6 is published, with a result for every hypothesis.

Fixed by commit: (filled in by the lead when committed)

**Amendments** (each with date and reason; git history shows every change): none.

## 10. References

Keys in brackets, such as M2, match `docs/PRIOR-ART.md`.

1. Smart India Hackathon 2026, problem statement SIH26242. https://sih.gov.in/sih2026PS
2. McHugh ML (2012). Interrater reliability: the kappa statistic. Biochemia Medica 22(3), 276-282. https://pmc.ncbi.nlm.nih.gov/articles/PMC3900052/ (M2)
3. Landis JR, Koch GG (1977). The measurement of observer agreement for categorical data. Biometrics 33(1), 159-174. https://doi.org/10.2307/2529310 (M4)
4. Koo TK, Li MY (2016). A guideline of selecting and reporting intraclass correlation coefficients for reliability research. Journal of Chiropractic Medicine 15(2), 155-163. https://pmc.ncbi.nlm.nih.gov/articles/PMC4913118/ (M3)
5. Schauber SK, et al. (2024). Inconsistencies in rater-based assessments mainly affect borderline candidates: but using simple heuristics might improve pass-fail decisions. Advances in Health Sciences Education 29, 1749-1767. https://doi.org/10.1007/s10459-024-10328-0 (M7)
6. CSDCI. Qualification Pack CON/Q0602 v4.0, Assistant Electrician. https://s3.ap-south-1.amazonaws.com/nsdcproddocuments/qpPdf/CON_Q0602_v4.0.pdf (S6)
7. WorldSkills Europe (2024). EuroSkills 2025 Technical Description TD19, section 4.6, Assessment and marking using judgement. https://worldskillseurope.org/application/files/7817/1387/4841/ES2025_TD19_en.pdf (S33)
8. Krippendorff K (2011). Computing Krippendorff's alpha-reliability. Departmental Papers (ASC) 43, Annenberg School for Communication, University of Pennsylvania. https://repository.upenn.edu/asc_papers/43
9. Fleiss JL (1971). Measuring nominal scale agreement among many raters. Psychological Bulletin 76(5), 378-382. https://doi.org/10.1037/h0031619 (M4)
10. Shrout PE, Fleiss JL (1979). Intraclass correlations: uses in assessing rater reliability. Psychological Bulletin 86(2), 420-428. https://doi.org/10.1037/0033-2909.86.2.420
11. The Digital Personal Data Protection Act, 2023 (No. 22 of 2023). https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
12. CSDCI. Assessment Guide, Mason General. https://www.csdcindia.org/wp-content/uploads/2023/05/AG_Mason-General.pdf (S7)
