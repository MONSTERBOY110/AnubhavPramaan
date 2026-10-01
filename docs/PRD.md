# PRD: AnubhavPramaan (अनुभव प्रमाण, "proof of experience")

**Product:** AI-assisted Recognition of Prior Learning (RPL) assessment tool
**Problem statement:** SIH26242, Ministry of Skill Development and Entrepreneurship (MSDE), "AI-Assisted Skill Assessment Tool for Recognition of Prior Learning (RPL)", theme Smart Education
**Version:** 1.0, 2 Oct 2026 · **Status:** approved design, prototype in progress
Bracketed keys such as [S1] resolve to sources in `docs/PRIOR-ART.md`.

---

## 1. Problem

About 90% of India's workers are informally employed and only about 4% of young people have formal vocational training [I1]. Millions of electricians, masons and tailors learned their trade on the job and have nothing to show for it. RPL exists to certify them against NSQF levels without making them repeat training [S1].

RPL is already large: it produced 54.28 lakh of the 110.42 lakh certifications under PMKVY 2015 to 2022 [S14]. Yet the regulator and the auditor describe the same weaknesses:

- **Inconsistent scoring.** NCVET lists "variations in the assessment standards", language barriers and a shortage of tools and assessors as RPL's problems, and says pre-assessment steps such as mapping a worker's experience to a qualification "are done manually" [S1]. Its assessment agency guidelines state that multiple assessment systems lead to inconsistent outcomes [S3]. Each agency also writes its own practical test for every candidate [S6], a built-in source of variance.
- **Weak evidence trail.** The CAG found assessor contact details missing in 3,27,220 of about 3.39 lakh batches, the same or edited photos reused across batches and states, one inspector "visiting" several states on the same day in 80 cases, assessment delays of up to 1,270 days, and no retention policy for photo and video evidence [S14].
- **Controls check presence, not judgement.** Today's controls are geo-tags, face or biometric attendance and timelines [S3, S13]. No rule or product we found measures whether two assessors would score the same worker the same way (see `docs/PRIOR-ART.md`, section 4).
- **Language and literacy.** RPL candidates often cannot fill text-heavy forms. NCVET requires assessment methods in Indian languages and allows the viva in the local language [S1].

The problem statement asks for a tool that turns a structured self-declaration into a qualification match, helps assessors score practical work consistently, produces a competency profile for assessor sign-off, works offline, and proves the consistency gain on a test set.

## 2. Goals and non-goals

**Goals**
1. A low-literacy worker can complete a self-declaration by voice, in their own language, in under 10 minutes.
2. Every declaration is mapped to the closest NSQF qualification pack (QP) with an explanation a human can check, and routed by NCVET's own rule: 70% or more of learning outcomes covered means direct assessment, otherwise upskilling first [S1].
3. Assessors score against the same anchored rubric everywhere, with evidence captured per performance criterion (PC).
4. Agreement between assessors is measured, shown and improved, using standard statistics (Fleiss' kappa, weighted kappa, ICC).
5. Every certification recommendation is tamper-evident, traceable to a named assessor, and signed by a human.
6. The whole capture and scoring flow works without a network and syncs later.

**Non-goals**
- The AI never awards a score, a pass or fail, or a certificate.
- No face identification of candidates. Presence checks use the agency's existing process.
- No theory MCQ engine: assessment agencies already run these [S22].
- No replacement for Skill India Digital Hub (SIDH). We produce records shaped for it.

## 3. Users and their jobs

| User | Job to be done | Today's pain |
|---|---|---|
| **Worker (candidate)** | Prove years of skill and get a recognised certificate | Forms in English or Hindi text, travel and lost wages, unclear what is being judged |
| **Assessor** (from an NCVET-recognised assessment agency) | Assess 20 to 30 candidates per batch fairly and on time [S1] | Re-writes practicals per candidate, no shared anchors, manual marks entry, connectivity gaps |
| **Assessment agency or Sector Skill Council quality team** | Keep assessors consistent and defend results | No agreement metrics, evidence scattered, disputes hard to resolve |
| **MSDE, NCVET monitoring** | Trust RPL numbers at national scale | Audit findings on photo reuse, missing assessor IDs and delays [S14] |

## 4. The workflow

```
Bolo (speak)  ->  Milao (match)  ->  Parkho (assess)  ->  Pramaan (certify)
                                          ^                      |
                                          +---- Samaan (consistency loop) <---+
```

1. **Bolo (speak): voice self-declaration.** A guided conversation in Hindi (Bhashini languages next) asks about the work done, tools, years, materials and safety habits. The system extracts structured claims, keeps the worker's own words as quotes, reads a summary back in the same language and records the worker's confirmation. This is the digital form of the RPL self-assessment and self-declaration [S1, S11].
2. **Milao (match): explainable qualification mapping.** Claims are matched to the NOS and PCs of candidate QPs. The tool shows coverage per NOS with the quotes that support each match, applies the 70% direct-assessment rule, and for lower coverage proposes the specific NOS to upskill first.
3. **Parkho (assess): assessor co-pilot.** The assessor's tablet builds the practical plan from the QP's PCs and their marks. Two item types follow the WorldSkills and CSDCI pattern [S7, S33]:
   - **Measurement items** (for example a masonry joint within ±3 mm) are scored by rule from the reading the assessor enters.
   - **Judgement items** use a 0 to 3 scale with written anchors and example photos.
   For each PC the assessor captures photo or video evidence (time, location, device, SHA-256 hash). An AI hint shows what it can and cannot see in the evidence. If the assessor's score departs from the anchors or the hint, a one-line reason is required. Viva questions are generated from the worker's own declared experience, as NCVET requires [S1].
4. **Pramaan (certify): profile, recommendation, sign-off.** The tool produces a competency profile per NOS and PC [S1], a grade band (PMKVY 4.0: A 85% and above, B 70 to 85%, C 50 to 70% for levels 1 to 3 [S11]) and a recommendation: certify, partial credit with a bridge plan, or reassess. The assessor signs with a PIN. The record is hash-chained and verifiable by QR.
5. **Samaan (consistency): agreement measurement.** Assessors score a shared calibration set. The tool reports Fleiss' kappa for PC met or not met, weighted kappa for 0 to 3 items, ICC for totals, and a strictness index per assessor, with and without the tool's rubric and hints. It also flags integrity patterns from the CAG report: duplicate evidence across batches, impossible travel, missing assessor identity.

## 5. Requirements

Priority: **P0** = in the prototype shown in the idea submission (5 Oct 2026). **P1** = grand finale. **P2** = after.

| ID | Requirement | PS bullet | Priority |
|---|---|---|---|
| R1 | Voice self-declaration in Hindi with read-back confirmation and quotes kept as evidence | Structured self-declaration | P0 |
| R2 | Text and tap fallback for the same flow (noisy camps, speech difficulties) | Structured self-declaration | P1 |
| R3 | QP mapping with coverage per NOS, supporting quotes and the 70% route | QP mapping engine | P0 |
| R4 | At least one complete trade pack (Assistant Electrician CON/Q0602) plus a second pack (Mason General) to prove extensibility | At least one trade | P0 (pack 1), P1 (pack 2) |
| R5 | Assessor checklist generated from PCs with marks, measurement and judgement items | Guided task checklists | P0 |
| R6 | Evidence capture per PC with hash, time and location | Image or video aids | P0 |
| R7 | AI evidence hints (what is visible, what is missing), always labelled as suggestions | Image or video aids | P0 |
| R8 | Anchored 0 to 3 rubric with written anchors and exemplar images; justification required on deviation | Standardise rubrics | P0 |
| R9 | Competency profile per NOS and PC, grade band, recommendation, assessor PIN sign-off | Competency profile and sign-off | P0 |
| R10 | Tamper-evident record with QR verification page | Certification integrity | P0 |
| R11 | Agreement dashboard: Fleiss' kappa, Krippendorff's alpha, ICC, assessor strictness index | Evidence of consistency improvement | P0 (engine verified on published reference data) |
| R12 | Calibration mode and study harness, with and without tool | Evidence of consistency improvement | P1 |
| R13 | Offline capture and scoring, local outbox, later sync | Offline capable | P0 (capture and scoring), P1 (full sync) |
| R14 | Voice and AI hints queue offline and run when connected, with the delay shown honestly | Low connectivity | P1 |
| R15 | Integrity analytics: duplicate evidence by perceptual hash, impossible travel, missing assessor identity | Certification integrity | P1 |
| R16 | Import of the ministry's dummy worker-assessment data at the grand finale | PS dataset note | P1 |
| R17 | Export of the competency record as JSON shaped for SIDH and DigiLocker integration | Scale | P2 |
| R18 | More languages (Bengali, Tamil, Telugu, Marathi) and a women-heavy trade pack (Sewing Machine Operator) | Scale and inclusion | P2 |

## 6. Where the tool supports, and where it never replaces, the assessor

The PS asks for this explicitly. It is also printed on every certification record.

| Activity | Tool does | Assessor does |
|---|---|---|
| Self-declaration | Asks questions, transcribes, extracts claims, reads back | Reviews the declaration at the start of assessment |
| Qualification mapping | Suggests QP, shows coverage and quotes, applies the 70% rule as a suggestion | Confirms or changes the QP and the route |
| Practical plan | Builds tasks and viva questions from PCs and the declaration | Selects, edits or replaces tasks |
| Observation | Captures and seals evidence, shows hints about what is visible | Observes the work in person and decides |
| Measurement items | Scores the entered reading against the tolerance rule | Takes the reading |
| Judgement items | Shows anchors, exemplars and a hint | Sets the score; writes a reason when departing from anchors or hint |
| Result | Calculates totals, grade band and a recommendation | **Signs or rejects the recommendation** |
| Quality | Measures agreement and flags patterns | Agency acts on the findings |

## 7. Pilot trades

1. **Assistant Electrician, CON/Q0602 v4.0** (construction sector, NSQF 3): 8 NOS, 750 marks, its entry route includes "5th grade pass with 5 years experience", which is exactly the RPL candidate [S6]. Construction is among the largest e-Shram categories [I3], and 8,200 construction workers recently received RPL for overseas deployment [S15].
2. **Mason General, CON/Q0103**: its CSDCI assessment guide already lists tolerance-based measurement items and photo evidence, so it proves the measurement versus judgement split [S7].
3. **Sewing Machine Operator** (apparel sector) next: a women-heavy trade, relevant because 54.28% of e-Shram registrants are women [I3].

## 8. Success metrics

| Metric | How measured | Target | When |
|---|---|---|---|
| Agreement engine correctness | Fleiss' kappa, Krippendorff's alpha and ICC reproduce published reference results | Exact match to the cited values | Idea submission |
| Mapping accuracy | Top-1 QP match on a frozen labelled set of declarations, plus a held-out set of recordings | 90% or more | Idea submission |
| Offline reliability | Records captured offline that sync without loss in the end-to-end test | 100% | Idea submission |
| Inter-assessor agreement, PC met or not met | Fleiss' kappa, unassisted vs assisted, per `docs/STUDY-PROTOCOL.md` | Assisted at least 0.60 (moderate or better [M2]) and higher than unassisted | Grand finale study |
| Agreement on judgement items | Krippendorff's alpha (ordinal) | Higher with the tool than without | Grand finale study |
| Agreement on totals | ICC(2,1) | 0.75 or more (good [M3]) | Grand finale study |
| Declaration completion | Share of test users finishing by voice | 90% or more | Grand finale study |
| Time per candidate for the assessor | Timed walkthroughs | Recorded as baseline, no claim until measured | Grand finale study |

Numbers are reported only after they are measured, each labelled with what it is (published reference data, frozen synthetic set, role-play recordings). The idea submission reports engine correctness and mapping accuracy; the with-versus-without agreement study runs at the grand finale under a protocol fixed in advance (see `docs/TRD.md`, section 6).

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Speech recognition errors on dialects and noise | Read-back confirmation by the worker, editable transcript, assessor review, text fallback (R2) |
| AI hint is wrong | Hints never score; they only point to evidence. Research shows vision models are weak at absolute scoring and better as a second reader [M9, M10] |
| QPs change version often (NQR to KaushalVerse migration [S5]) | Packs are versioned JSON; every record stores the pack id and version |
| Fraud with reused or staged evidence | Hash per item, perceptual-hash duplicate check, time and location, assessor identity mandatory, append-only log |
| Privacy and consent | Consent before recording, redaction of Aadhaar and phone numbers, no face ID, written retention policy |
| Assessors resist a new tool | Fits the existing agency flow and NCVET's own app specification (offline logging, NOS and PC-wise tests, analytics by assessor) [S3] |

## 10. Glossary

- **RPL**: Recognition of Prior Learning. **NSQF**: National Skills Qualifications Framework, levels 1 to 8 [S2].
- **QP**: Qualification Pack, a set of **NOS** (National Occupational Standards), each with **PCs** (performance criteria) and marks.
- **NCVET**: National Council for Vocational Education and Training, the regulator. **AA**: assessment agency. **AB**: awarding body. **SSC**: Sector Skill Council.
- **SIDH**: Skill India Digital Hub. **NQR**: National Qualification Register.

## 11. To verify before claims go public

- Pass mark in CON/Q0602 v4.0 (the text says 70%, a table says 50%) [S6].
- Mason General QP version and level (the old QP says level 3, the assessment guide says level 4) [S7].
- Current active version of the Sewing Machine Operator QP (v2.0 was deactivated on 30 Sep 2024) [S8].
