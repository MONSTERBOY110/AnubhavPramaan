# AnubhavPramaan (अनुभव प्रमाण)

AI-assisted skill assessment for Recognition of Prior Learning. An informal worker describes their work by voice in Hindi. The tool turns it into a structured self-declaration, maps it to the closest NSQF qualification pack with NCVET's 70% rule, gives the assessor a standardised checklist with AI evidence hints, and seals a tamper-evident record that only a human assessor can sign.

Smart India Hackathon 2026, problem statement **SIH26242**, Ministry of Skill Development and Entrepreneurship (MSDE): **"AI-Assisted Skill Assessment Tool for Recognition of Prior Learning (RPL)"**. Theme: Smart Education. Team PixelPaws.

> **AI suggests, the assessor decides.** No code path lets a model set a score, a pass or fail, a route or a certificate decision. Every AI output is labelled as a suggestion, shown with its evidence, and logged next to the assessor's decision in the record.

**Status:** working prototype for the idea round, October 2026. It is not for real certification: the demo assessor is public, and Hindi speech runs on labelled development stand-ins until the Bhashini key is issued.

## How it works

| Step | Who | What the prototype does |
|---|---|---|
| **Bolo** (speak) | Worker, on a phone or camp kiosk | Consent screen first. 8 questions in Hindi, each can be heard aloud. Answer by voice, with an uploaded recording, or by typing. The words as heard are shown and can be corrected; Aadhaar, PAN and phone numbers are redacted. The AI suggests claims, each tied to a quote that must appear word for word in the answer, and the worker hears a read-back before confirming. |
| **Milao** (match) | Assessor | Links claims to the performance criteria (PCs) of each qualification pack, constrained to the pack's own PC ids. Shows coverage per NOS, applies NCVET's rule (70% or more suggests direct assessment, otherwise upskilling first) [1], lists the gaps, and quotes the worker as evidence. The assessor confirms or changes the qualification and route; a change needs a reason. |
| **Parkho** (assess) | Assessor, on a tablet | Checklist built from the pack's PCs. Measurement items are scored by rule against a sourced tolerance. Judgement items use the WorldSkills 0 to 3 scale [2] with written anchors for every PC. Openly licensed reference photos show what the work looks like. Each photo of the candidate's work gets a SHA-256, a perceptual hash and a time, plus a place if the assessor taps "Record place". An AI hint says per observable "visible", "not visible" or "cannot tell", never a level; when the assessor's level contradicts it, a one-line reason is required. Works with the network off. |
| **Pramaan** (certify) | Assessor | Profile per NOS, PMKVY 4.0 grade band [3] and a recommendation, shown as a suggestion. Sign-off with assessor id and PIN, offline too: an HMAC proof waits in the outbox, never the PIN. The server recomputes every mark, checks for reused photos and impossible travel, and seals a hash-chained record with a QR code to a public verify page. |
| **Samaan** (consistency) | Agency | Fleiss' kappa, Krippendorff's alpha, ICC, bootstrap intervals and a strictness index per assessor, shown on published reference data. Calibration sets (`/calibrate`) let assessors score the same photos, unaided or with the tool's anchors; agreement is computed from their own scores once two people have scored, never from simulated raters. |

**Scoring rules** (`lib/assess/`): a PC judged at level 1 ("meets industry standard") or above earns its marks and level 0 earns none, as measurement items earn full marks or none; a PC not scored counts as not shown. A NOS is met at the pass mark the pack states (70% for CON/Q0602).

**Try the assessor flow:** demo assessor `AS-0142`, PIN `2468`. Every record it signs says it is a demo and not a real certification.

## Qualification packs

`packs/qp/` holds two packs extracted by script from the official PDFs (`tools/extract_qp.py`, cross-checked by a second extractor in `tools/verify_pack_text.py`), each with the PDF's URL and SHA-256:

- **Assistant Electrician, CON/Q0602 v4.0, NSQF level 3** (pilot): 119 PCs. Every judgement PC has anchors and observables, adapted from the CSDCI assessment guide where it covers the activity; the 2 measurement items each name their source.
- **Mason General, CON/Q0103 v1.0**: 165 PCs. The QP is deactivated, so this pack only shows that mapping tells trades apart; it never scores a candidate.

The PC counts are asserted in `tests/unit/packs.test.ts`. A new trade is a new pack: the extracted text plus a reviewed overlay of anchors, observables, tolerances and Hindi synonyms.

## Evidence so far

Each number says what it was measured on.

**Agreement engine, on published reference data.** `tests/unit/agreement.test.ts` reproduces the published results of Shrout and Fleiss (1979, ICCs of Table 4) and Krippendorff (2011, alpha examples), checked against the original papers, and of Fleiss (1971, kappa 0.430), checked against published reproductions because the 1971 paper is closed access. This shows the statistics are computed correctly. It does not show that the tool improves agreement.

**Mapping, on a frozen synthetic set.** 20 synthetic Hindi declarations (full, partial, short, Hinglish, another trade) with expected qualification, PCs and route, frozen by SHA-256 before any mapper code existed (`eval/mapping/FROZEN.md`). Keyword baseline, no LLM, run on 2 Oct 2026 (`eval/mapping/runs/20261002-0259-frozen-keyword.json`):

- top-1 qualification: 19 of 20
- PC links: precision 65.1%, recall 66.8% (micro average)
- route agreement: 18 of 20 under the flat coverage rule, 15 of 20 under the weighted rule

LLM mapper (Azure AI Foundry `gpt-5-mini`, prompts extract-v1 and link-v4, tuned on a separate two-declaration dev set only), one run on 2 Oct 2026, scored under the reporting rule written in `eval/mapping/FROZEN.md` before any score was seen (`eval/mapping/runs/20261002-1204-frozen-llm.scored.json`):

- all 20 declarations: top-1 qualification 20 of 20; PC links precision 92.5%, recall 86.3% (micro average); route agreement 19 of 20 under the flat rule, 17 of 20 under the weighted rule. 2 of 156 answers (in D02 and D06) were blocked by the provider's content filter and handled by rule-based extraction, as in the live app.
- the 18 declarations in which every claim came from the model: top-1 18 of 18; precision 91.3%, recall 86.5%; route agreement 18 of 18 (flat), 16 of 18 (weighted).
- on average 21,661 prompt and 15,037 completion tokens per declaration.

The declarations and the pack synonyms were both written with AI help and share trade vocabulary, so these numbers are likely optimistic. Results for the held-out role-play recordings by the project lead will be added here once they are run.

**With versus without the tool: not measured yet.** That needs several independent human raters. We never simulate raters or use a model as a rater. The study is fixed in advance in [`docs/STUDY-PROTOCOL.md`](docs/STUDY-PROTOCOL.md), to run with real assessors on the ministry's dummy assessment data.

## Run it

Needs Node 20 or newer and pnpm 10.

```bash
pnpm install
cp .env.example .env.local   # every key is optional
pnpm dev                     # http://localhost:3000
```

Without keys the app still runs: mapping uses the keyword baseline, claim extraction uses rules, photo hints say they are unavailable, and the voice routes report that no recogniser is configured. `.env.example` explains each key: Bhashini for Hindi speech (the production path), ElevenLabs Scribe as a labelled development stand-in with Groq Whisper as its speech fallback, Azure AI Foundry (`gpt-5-mini`) for the text model and the photo hints, Upstash for a durable record store.

```bash
pnpm test                    # unit tests, mocked providers, no keys needed
pnpm test:e2e                # Playwright; starts the dev server
pnpm typecheck && pnpm lint
AP_EVAL_MODE=keyword AP_EVAL_SET=frozen npx vitest run --config vitest.eval.config.mts
```

## Privacy

- Consent before any recording; declining records nothing.
- Aadhaar, PAN, phone and other long numbers are redacted on the server from transcripts and from the assessor's reasons before they are sealed in a record (`lib/cert/redact.ts`).
- No face identification anywhere.
- Records keep text, scores, decisions and hashes. Speech audio, photos and video are not stored in them; in this prototype photos stay on the tablet.
- A place is taken only when the assessor taps "Record place", rounded to about 1 km, and used only for the travel check.
- Records expire after 3 years, the period the CSDCI assessment guide sets for assessment evidence [4]; the design follows the Digital Personal Data Protection Act, 2023.
- The speech stand-ins are for development and role-play audio only, never real worker data. Production uses Bhashini.

## Repository

| Path | Contents |
|---|---|
| `app/` | Pages (`/declare`, `/match/[id]`, `/assess/[id]`, `/profile/[id]`, `/verify/[id]`, `/samaan`, `/calibrate`) and API routes |
| `components/` | Screens for Bolo, Milao, Parkho, Pramaan and calibration |
| `lib/` | Declaration, mapping, scoring, certificate chain, integrity checks, agreement statistics, voice, offline outbox |
| `packs/qp/` | Qualification packs, their reviewed overlays and extraction sources |
| `eval/mapping/` | Frozen eval set, runner and run logs |
| `tools/` | Pack extraction and checks (Python) |
| `docs/` | Product and technical requirements, prior art, study protocol |

## Sources

1. NCVET, Guidelines for Recognition of Prior Learning, 2023. https://ncvet.gov.in/wp-content/uploads/2023/08/Final-RPL-guidelines.pdf
2. WorldSkills Europe, EuroSkills 2025 Technical Description TD19, section 4.6. https://worldskillseurope.org/application/files/7817/1387/4841/ES2025_TD19_en.pdf
3. MSDE, PMKVY 4.0 Guidelines. https://www.msde.gov.in/static/uploads/2024/02/PMKVY-4.0-Guidelines_final-copy.pdf
4. CSDCI, Mason General assessment guide. https://www.csdcindia.org/wp-content/uploads/2023/05/AG_Mason-General.pdf

More sources and the gap analysis are in [`docs/PRIOR-ART.md`](docs/PRIOR-ART.md).

## Licence

Code: MIT, see `LICENSE`. Fonts: Noto Sans and Noto Sans Devanagari under the SIL Open Font License 1.1, see `public/fonts/`. Reference and calibration photos: Wikimedia Commons, each with its author and licence in `public/evidence/ATTRIBUTION.md`. Qualification pack text is quoted from the official documents linked in each pack.
