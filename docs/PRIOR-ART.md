# Prior art and research: AI-assisted RPL assessment in India

Compiled 1 to 2 Oct 2026 for PS SIH26242. Every fact carries a source key; keys resolve in section 10.
Must-cite references for the idea deck are marked ★.

---

## 1. What the regulator says

**NCVET Guidelines for Recognition of Prior Learning, 11 Aug 2023 [S1★]**
- RPL has 4 categories. Category 1 covers NSQF levels 1 to 3.5, which is our target group.
- Category 1 flow: pre-screening, then 12 to 15 hours of orientation. **"Direct assessment" applies when the candidate's experiential learning maps to 70% or more of the qualification's learning outcomes**; otherwise upskilling comes first.
- Hands-on assessment happens "only in the physical mode". Objective questions may be asked as a viva "in the local language".
- Batches of at most 20 to 30 candidates, every candidate assessed on practicals.
- "Every assessment shall be proctored and supported with digital and video evidences with geotagging."
- Questions must be based on prior job experience and mapped to the performance criteria (PCs). The result report must analyse performance per NOS and per PC.
- With no experience certificate, a candidate may self-declare by affidavit plus an aptitude test.
- Awarding bodies and assessment agencies must "promote self-assessment", and assessment methods "shall be carried out in Indian Languages".
- NCVET itself names RPL's gaps: **variations in assessment standards, language barriers, and too few tools and assessors**. It says pre-assessment steps such as enrolment and mapping learning outcomes to a qualification **"are done manually"** and should be automated.

**NSQF notification, June 2023 [S2★]:** 13 levels (1, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8), five descriptor domains, 30 notional hours per credit, micro-credentials of 7.5 to 30 hours.

**Assessment agency guidelines, May 2024 [S3★]:** multiple assessment systems lead "to inconsistent outcomes". The assessor app must log location and time "even in an offline mode"; tests are generated NOS-wise and PC-wise; analytics are broken down by assessor; assessors must be proficient in Indian languages. The guidelines never use the word "rubric".

**Qualification Pack structure [S6, S8, S9]:** a QP header (sector, level, credits, NCO-2015 code, entry routes, NQR code) and a set of NOS. Each NOS has PCs, knowledge and understanding items, generic skills, and a marks table (theory, practical, project, viva). PC marks are set "proportional to its importance", but "individual assessment agencies will create unique evaluations for skill practical for every student", which is a structural source of variance.

**National Qualification Register:** 2,685 active and 5,820 archived qualifications as of 4 May 2025 [S4], migrating to KaushalVerse since 22 Jul 2025 [S5]. QP versions change often, so packs must be versioned.

## 2. How RPL assessment works today

- **PMKVY 4.0 [S11★]:** RPL at accredited centres or employer premises; pre-screening by certified trainers using the SSC or awarding body format plus a "self-assessment test"; at least 30 hours of classroom time (up to 132); certification at the NSQF level fixed during pre-screening; Aadhaar-enabled biometric attendance; grades for levels 1 to 3 of A (85% and above), B (70% to 85%) and C (50% to 70%); QR-coded certificates on DigiLocker; payout of ₹2,000 per candidate at a centre and ₹1,700 at employer premises. Online RPL only if NCVET-aligned; digital RPL of gig workers deferred.
- **Process:** the awarding body assigns an assessment agency on Skill India Digital Hub (SIDH) the day an RPL batch is created [S12]. NSDC's older assessor app handled batch lists, marks entry, biometric login and geo-tagging [S20].
- **Monitoring, Dec 2025 [S13]:** face-authenticated, geo-fenced attendance and assessor biometric attendance. Listed severe violations include bribing or intimidating assessors and enrolling RPL candidates "without prior experience". The candidate feedback form asks "Was the assessor fair?" and whether the assessment was in the local language.
- **Capacity [S15, S18]:** 139 awarding bodies, 68 assessment agencies, 13,844 assessors certified between Apr 2024 and Nov 2025; a target national pool of 1 lakh trainers and assessors.

## 3. What the audit found: CAG Report No. 20 of 2025, PMKVY 2015 to 2022 [S14★]

- RPL produced **54.28 lakh of 110.42 lakh** PMKVY certifications, preferred partly because it costs less; PMKVY 2.0 certified 51.21 lakh against a 40 lakh target.
- Assessor contact details were "null/none" in **3,27,220 of about 3.39 lakh batches**, covering 93 lakh certified candidates.
- In RPL with Best-in-Class Employers (12.64 lakh certified, ₹167.56 crore), the **same or edited photos were reused** across batches and states; 45 inspection reports used one photo; in **80 cases one inspector "visited" several states on the same day**.
- In the 8 audited states, assessments were delayed by up to **1,270 days** and certification by up to 1,257 days (50.95% of batches).
- There was **no retention policy** for photo and video evidence.
- MSDE's response, the Feb 2025 SOP [S12], addresses timelines and penalties; a text search found no mention of "practical", "evidence" or "language".

## 4. Existing tools and the gap

**India**
- **SIDH** links training, assessment, certification, credits and jobs; integrates Bhashini (23 languages), e-Shram, DigiLocker and Aadhaar; 1.6 crore or more registrations [S15]. No public tool on it maps a worker's self-declaration to a QP.
- **Assessment360** (vendor material) claims an assessor app with time-stamped photo and video per task "against marking rubrics", offline exams, 12 or more languages and moderation [S21]. Closest commercial product.
- **Wheebox, Mercer Mettl, SHL** focus on theory tests and proctoring [S22]. **Eklavvya** offers generated questions, video interviews and AI proctoring [S23].

**Global**
- **Australia:** Queensland's web self-assessment matches a person to a qualification in 10 to 15 minutes [S24]; the VETASSESS AI-enabled RPL pilot (Dec 2025, A$3M) maps documents to units while human assessors decide [S26]; Cloud Assess has an AI marking assistant and an offline app [S27]. A sector warning: AI makes document-based RPL easy to fake, and observed performance is "the one form of evidence AI cannot fake" [S28].
- **EU:** the 2012 Council Recommendation sets four phases (identification, documentation, assessment, certification) [S29]; the EU Skills Profile Tool is a multilingual interview tool [S31]; ESCO v1.2.1 lists 3,039 occupations and 13,939 skills [S30]; SkillLab profiles skills with AI in 27 languages mapped to ESCO [S32].
- **ILO:** an RPL learning package [S25]; 2025 costing guidelines covering e-RPL in Bangladesh, Colombia's use of AI in designing assessment tools, and assessor time and travel as core costs [S24].
- **WorldSkills:** "measurement" items score full marks or zero; "judgement" items use a 0 to 3 scale against benchmarks, scored by 3 experts [S33]. This is the template for our rubric.

**Gap matrix** (✓ yes per public material, ◐ partial, ✗ not found in public material)

| Capability | SIDH | Assessment360 | Theory-test vendors | VETASSESS AI RPL | Cloud Assess | SkillLab | **AnubhavPramaan** |
|---|---|---|---|---|---|---|---|
| Voice-first self-declaration in Indian languages | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ✓ |
| Declaration mapped to NOS and PCs with quotes | ✗ | ✗ | ✗ | ◐ (documents) | ✗ | ◐ (ESCO) | ✓ |
| NCVET 70% direct-assessment route | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| PC-level evidence capture | ◐ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ |
| AI as second reader, never scorer | ✗ | ✗ | ◐ (proctoring) | ✓ | ◐ | ✗ | ✓ |
| Anchored rubric with deviation justification | ✗ | ◐ | ✗ | ✗ | ◐ | ✗ | ✓ |
| Inter-assessor agreement measured | ✗ | ◐ (moderation) | ✗ | ✗ | ✗ | ✗ | ✓ |
| Offline capture with tamper-evident sync | ✗ | ◐ | ✗ | ✗ | ◐ | ✗ | ✓ |

**What none of them combines:** voice-first local-language self-declaration for low-literacy workers mapped to NOS and PCs; PC-level AI aids feeding a human sign-off; built-in measurement of inter-assessor agreement; offline-first capture with tamper-evident sync.

## 5. Methods we adopt

**Agreement statistics**
- Cohen's kappa for 2 raters; Fleiss' kappa for many raters on categorical outcomes [M4]; weighted kappa or Krippendorff's alpha for ordinal 0 to 3 levels; ICC for totals.
- Kappa interpretation: below 0.60 inadequate, 0.60 to 0.79 moderate, 0.80 to 0.90 strong [M2]. ICC: below 0.5 poor, 0.5 to 0.75 moderate, 0.75 to 0.9 good, above 0.9 excellent [M3★].

**Typical values in practical-skill exams**
- Clinical skills exams (OSCE), meta-analysis: reliability 0.66 across stations and 0.78 within a station [M5].
- Examiner stringency or leniency explained 12% of score variance in a UK medical exam [M6].
- 10 examiners scoring the same 4 videos of mock oral exams agreed on pass, borderline or fail at a **Fleiss' kappa of 0.07**, with disagreement concentrated on borderline candidates [M7★]. Our grand finale study copies this design.

**Rubrics:** a review of 75 studies found rubrics improve scoring reliability, especially when analytic, task-specific, and backed by exemplars and rater training [M1★].

**AI on practical evidence**
- Machine-learning skill assessment from surgical video exceeds 80% accuracy, but standard datasets are lacking [M8].
- GPT-4V comes close to human judges on pairwise comparison but is weak at absolute scoring (r about 0.49) [M9]. **So our AI detects checklist observables and flags disagreements; it never sets a score.**
- An Indian Olympiad study found AI grading correlated 0.91 to 0.97 with official marks and recommends it "as a second reader or audit tool under examiner control" [M10]; in another study about 17% of AI-graded answers were routed to manual review [M11].

**Voice**
- Bhashini: voice in 22 languages, text in 36, more than 350 models [V1].
- IndicVoices: 23.7K hours from 51K speakers (7,348 hours at publication) [V2★].
- IndicConformer: open (MIT) ASR for all 22 scheduled languages, making on-device offline recognition feasible later [V3].
- Text-free interface design for low-literacy users [V4].

## 6. Impact context

- About 82% of India's workforce is in the informal sector and about 90% is informally employed; only 4% of youth have had formal vocational training [I1★].
- PLFS 2025: 4.2% of people aged 15 to 59 have formal vocational training; 61.6 crore workers [I2].
- e-Shram: 31.89 crore registrations, 54.28% of them women, linked to SIDH [I3].
- PMKVY 2015 to Dec 2025: 1.64 crore trained or oriented, 1.29 crore certified [S16].
- 79% of RPL candidates said they benefited (AJNIFM 2025) and 52% reported higher earnings (NITI Aayog) [S17].
- PMKVY 4.0 reached 15.65% of its 3-year target, and PMKVY 5.0 reportedly shifts weight from RPL to short-term training [S19]. RPL's credibility is the issue this tool addresses.
- The restructured Skill India Programme carries ₹8,800 crore; 600 or more handbooks translated into 8 languages [S18]. PM Vishwakarma has 30 lakh registered artisans, including masons and tailors [I5].

## 7. SIH 2025 context

MSDE and NCVET posed five problem statements in SIH 2025 (personalised learning paths, blockchain skill credentialing, IoT training-equipment monitoring, a micro-credential aggregator, multilingual content localisation) [H1]; their finale ran at SKIT Jaipur with 25 teams from 11 states [H2]. None covered assessment or RPL. A verified competency record from this tool is exactly the input that credentialing and micro-credential systems need.

## 8. Pilot trade facts

- **Assistant Electrician, CON/Q0602 v4.0** (Construction Skill Development Council of India): NSQF 3, 13 credits, NCO-2015/7411.0100; 8 NOS (tools, temporary lighting, low-voltage wiring, low-voltage panels, health and safety, teamwork, planning, employability); each NOS 30 theory and 70 practical; 750 marks in total (230 theory, 520 practical); entry route "5th grade pass with 5 years experience" [S6★].
- **Mason General, CON/Q0103** (CSDCI assessment guide): 8 NOS, each 80% practical, 12% MCQ and 8% viva; 70% needed per NOS; 5 practical tasks in 5 h 30 min; a ready PC checklist and tolerance sheet, for example overall wall length ±4 mm, joint thickness ±3 mm and plumb ±5 mm at 5 marks each, full marks only within tolerance; judgement items such as "acceptable" pointing; the assessor photographs the trainee at work and the finished job; records kept for 3 years [S7★].
- **Sewing Machine Operator, AMH/Q0301 v2.0:** NSQF 3; entry "5th class plus 1 year experience"; 400 marks (106 theory, 246 practical, 48 viva); 70% pass; v2.0 deactivated on 30 Sep 2024 [S8].
- **Plumber General, PSC/Q0104 v5.0:** NSQF 4, 400 marks, 70% pass; entry requires class 12 or Assistant Plumber, so Assistant Plumber is the better RPL pilot [S9].

## 9. Open verification items
- CON/Q0602 v4.0 pass mark: the text says 70%, a table says 50%.
- Mason General version and level: the old QP says level 3, the assessment guide says level 4.
- The current active version of Sewing Machine Operator.
- SIH 2025 MSDE winners (no authoritative list found).
- Assessment360 and NSDC assessor app details come from vendor or blog pages, not official sources.

## 10. Sources

**Regulation and schemes**
- [S1] NCVET RPL Guidelines, 2023: https://ncvet.gov.in/wp-content/uploads/2023/08/Final-RPL-guidelines.pdf
- [S2] NSQF notification, June 2023: https://ncvet.gov.in/wp-content/uploads/2023/07/National-Skills-Qualification-Framework-notification-June-2023.pdf
- [S3] NCVET assessment agency guidelines, 2024: https://www.ncvet.gov.in/wp-content/uploads/2024/05/Comprehensive-Revised-AA-guidelines-02052024_1.pdf
- [S4] NSQC 43rd meeting minutes: https://ncvet.gov.in/wp-content/uploads/2025/06/MoM-43rd-NSQC.pdf
- [S5] NQR: https://www.nqr.gov.in/ and https://x.com/NCVETIndia/status/1948350285166100484
- [S6] Assistant Electrician QP CON/Q0602 v4.0: https://s3.ap-south-1.amazonaws.com/nsdcproddocuments/qpPdf/CON_Q0602_v4.0.pdf
- [S7] CSDCI Mason General assessment guide: https://www.csdcindia.org/wp-content/uploads/2023/05/AG_Mason-General.pdf
- [S8] Sewing Machine Operator QP AMH/Q0301 v2.0: https://nqr.gov.in/sites/default/files/AMH_Q0301_v2.0%20Sewing%20Machine%20Operator.pdf
- [S9] Plumber General QP PSC/Q0104: https://cssda.cg.nic.in/CourseQPFile/902_QP_PSC_Q0104.pdf
- [S11] PMKVY 4.0 guidelines: https://www.msde.gov.in/static/uploads/2024/02/PMKVY-4.0-Guidelines_final-copy.pdf
- [S12] MSDE SOP, Feb 2025: https://www.msde.gov.in/static/uploads/2024/02/ec312f8037f503d2d759bab91165b00f.pdf
- [S13] PMKVY 4.0 monitoring guidelines, Dec 2025: https://www.msde.gov.in/static/uploads/2025/12/d0261385e51c5a4b94d05f5f563c7c12.pdf
- [S14] CAG Report No. 20 of 2025: https://cag.gov.in/uploads/download_audit_report/2025/Report-No.-20-of-2025_PA-PMKVY_English-PDF-A-06943abec463479.68516873.pdf
- [S15] PIB, 2025: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2217881
- [S16] PIB: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2238230
- [S17] PIB: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2241240
- [S18] Cabinet decision, Skill India Programme: https://www.pmindia.gov.in/en/news_updates/cabinet-approves-continuation-and-restructuring-of-skill-india-programme/
- [S19] Careers360 on PMKVY targets: https://news.careers360.com/pmkvy-pm-kaushal-vikas-yojana-15-pc-target-skill-india-development-msde-plan-voucher-loan-outcome-bond-apaar-id-new-format

**Products and international practice**
- [S20] NSDC assessor app (blog): https://blog.mantratec.com/aadhaar-based-biometric-fingerprint-scanner-for-nsdc-assessor-assessment-process
- [S21] Assessment360: https://assessment360.ai/vocational.html
- [S22] Wheebox, Mettl, NCVET agency list: https://wheebox.com/sectorSkill.obj , https://mettl.com/skills-assessment-test/ , https://ncvet.gov.in/assessment-agencies/
- [S23] Eklavvya: https://www.eklavvya.com/ai-skill-assessment/
- [S24] ILO RPL costing and financing guidelines, 2025: https://www.ilo.org/sites/default/files/2025-08/Recognition%20of%20Prior%20Learning_Guidelines%20on%20costing%20and%20financing.pdf
- [S25] ILO RPL learning package: https://www.ilo.org/publications/recognition-prior-learning-rpl-learning-package
- [S26] VETASSESS AI-enabled RPL pilot: https://www.vetassess.com.au/news/new-pilot-leads-the-way-in-ai-enabled-recognition-of-prior-learning
- [S27] Cloud Assess AI marking assistant: https://cloudassess.com/blog/ai-marking-assistant/
- [S28] CAQA on AI and VET assessment integrity: https://caqa.com.au/blogs/news/the-machine-in-the-room-artificial-intelligence-recognition-and-the-integrity-of-vet-assessment
- [S29] EU Council Recommendation on validation, 2012: https://www.cedefop.europa.eu/files/Council_Recommendation_on_the_validation_20_December_2012.pdf
- [S30] ESCO occupations: https://esco.ec.europa.eu/en/classification/occupation_main
- [S31] EU Skills Profile Tool: https://digital-skills-jobs.europa.eu/en/learning-space/resources/eu-skills-profile-tool-third-country-nationals
- [S32] SkillLab (EIB story): https://www.eib.org/en/stories/refugees-labour-market
- [S33] WorldSkills technical description: https://worldskillseurope.org/application/files/7817/1387/4841/ES2025_TD19_en.pdf

**Methods**
- [M1] Jonsson and Svingby 2007, rubrics and reliability: https://doi.org/10.1016/j.edurev.2007.05.002
- [M2] McHugh 2012, interrater reliability and kappa: https://pmc.ncbi.nlm.nih.gov/articles/PMC3900052/
- [M3] Koo and Li 2016, ICC guideline: https://pmc.ncbi.nlm.nih.gov/articles/PMC4913118/
- [M4] Fleiss 1971; Landis and Koch 1977: https://doi.org/10.1037/h0031619 , https://doi.org/10.2307/2529310
- [M5] OSCE reliability meta-analysis: https://doi.org/10.1111/j.1365-2923.2011.04075.x
- [M6] Examiner stringency study: https://pubmed.ncbi.nlm.nih.gov/16919156/
- [M7] Schauber et al. 2024: https://doi.org/10.1007/s10459-024-10328-0
- [M8] ML surgical skill assessment review: https://www.nature.com/articles/s41746-022-00566-0
- [M9] GPT-4V as a judge: https://arxiv.org/abs/2402.04788
- [M10] AI grading as second reader: https://arxiv.org/abs/2608.20521
- [M11] AI grading with manual review routing: https://arxiv.org/abs/2601.00730

**Voice**
- [V1] Bhashini (PIB document, Feb 2026): https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/feb/doc202629784101.pdf
- [V2] IndicVoices: https://aclanthology.org/2024.findings-acl.639/ , https://huggingface.co/datasets/ai4bharat/IndicVoices
- [V3] IndicConformer: https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
- [V4] Text-free UI for low-literacy users: https://dl.acm.org/doi/10.1162/itid.2007.4.1.37

**Impact**
- [I1] ILO India Employment Report 2024: https://www.ilo.org/media/534736/download
- [I2] PLFS 2025 press note: https://www.mospi.gov.in/uploads/latestReleases/latest_release_1774607827733_3e8964a9-268b-4cc9-ad65-cfc8a9e32f08_Press_note_AR_PLFS_2025_23032025_V2.1_26032026_final.pdf
- [I3] e-Shram: https://www.pib.gov.in/PressNoteDetails.aspx?NoteId=159705
- [I5] PM Vishwakarma: https://www.thehawk.in/news/science/pm-vishwakarma-scheme-achieves-registration-target-of-30-lakh-beneficiaries

**SIH context**
- [H1] SIH Navigator: https://sih-nav.vercel.app/
- [H2] SIH 2025 finale at SKIT: https://engineering.careers360.com/articles/skit-successfully-inaugurates-smart-india-hackathon-2025-grand-finale-36-hour-innovation-marathon-underway

## Must-cite list for the idea deck (slide 6)
S1 NCVET RPL Guidelines · S2 NSQF 2023 · S3 NCVET assessment agency guidelines · S11 PMKVY 4.0 · S14 CAG Report 20/2025 · S6 and S7 CSDCI Assistant Electrician QP and Mason assessment guide · I1 ILO India Employment Report 2024 · M1 Jonsson and Svingby 2007 · M7 Schauber et al. 2024 with M3 Koo and Li 2016 · V2 IndicVoices
