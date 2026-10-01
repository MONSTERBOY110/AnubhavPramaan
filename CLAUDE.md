# AnubhavPramaan (अनुभव प्रमाण): AI-assisted RPL skill assessment

Smart India Hackathon 2026, idea 2 of 2 for Team PixelPaws (SIH Team ID 158120, Bengal Institute of Technology).
Problem statement **SIH26242**, Ministry of Skill Development and Entrepreneurship (MSDE):
"AI-Assisted Skill Assessment Tool for Recognition of Prior Learning (RPL)". Theme: Smart Education. Category: Software.

**One line:** an informal worker describes their work by voice in Hindi; the tool turns it into a structured self-declaration, maps it to the closest NSQF qualification pack using NCVET's own 70% rule, gives the assessor a standardised checklist with AI evidence hints, measures how consistently assessors score, and produces a tamper-evident certification recommendation that only a human assessor can sign.

## Who does the work
Only two: **the lead** (human-only tasks: decisions, logins and captchas, API keys, recordings, photos, voiceover, reviews, git, Submit) and **you, the build agent** (everything else). There are no teammate tasks. Batch what you need from the lead and ask for it early, with an estimate of the minutes it takes.

## Deadline and scope
- Idea PDF and portal form must be **submitted by 5 Oct 2026. Target: 5 Oct, 12:00 IST.** No changes are possible after submission.
- Scope until then (decided by the lead): the 6-slide idea PDF, real screenshots, and a 60 second demo video from a **thin working prototype**. The fuller prototype comes only after the deck is safe.

## Read in this order
1. `docs/internal/HANDOFF.md`: why this PS, rules, lessons from idea 1, team
2. `docs/internal/research/SIH26242-PS.md`: the PS verbatim (read it 5 times)
3. `docs/PRD.md`: users, features, support vs replace boundary
4. `docs/TRD.md`: architecture, data model, modules M1 to M8, reuse map
5. `docs/PRIOR-ART.md`: research, gap analysis, citations
6. `docs/internal/PLAN-4-DAYS.md`: day plan and gates
7. `docs/internal/DECK-CONTENT.md` and `docs/internal/PORTAL-FORM.md` when building the submission

## Hard rules
- **Never commit, push, or change git config.** The lead does all git work. Leave changes in the working tree.
- **No em dashes or en dashes anywhere**: code comments, docs, UI copy, deck, portal text. Use commas, colons, or hyphens.
- **AI suggests, the assessor decides.** No code path lets a model set a score, a pass or fail, a route, or a certificate decision. Every AI output is labelled as a suggestion, shown with its evidence, and logged.
- **Every number** in the deck, portal text, README, or UI comes from a script, a test, or a cited source, labelled with what it is (published reference data, frozen synthetic set, role-play recordings). Never simulate raters or use a model as a rater.
- Paste the PS title and theme verbatim from `docs/internal/research/SIH26242-PS.md`.
- `docs/internal/` and `.ppt-build/` are gitignored because they hold strategy and deck sources. Never copy their content into tracked files. The repo is public and its link goes on slide 3.
- Privacy by design: consent screen before any recording, no face identification, Aadhaar and phone number redaction (reuse Saakshi `lib/cert/redact.ts`), retention rules written down (DPDP Act 2023).
- Ask the lead before any change of scope, PS, trade, or name.
- Verify before claiming done: run it, show the output or a screenshot.

## Environment
- Windows 11, PowerShell primary, Git Bash available. Python is `python`, not `python3`. Set `PYTHONIOENCODING=utf-8` for any script that prints Hindi.
- pnpm for Node (Saakshi uses pnpm 10, Node 20 or newer).
- Disable or ignore the `adrian-cc` hook errors; they are noise from a plugin, not from this project.

## Reuse map (full detail in `docs/TRD.md`, section 9)
- **Base to copy:** `D:\Projects\Saakshi` (MIT, the lead's own code): Next.js 15, React 19, Tailwind 4, shadcn, zod, zustand; phase machine, rubric packs, question validation, advisory-only LLM boundary, hash-chained certificates with QR verify page, eval harness, CI.
- **Bhashini ASR, TTS, translation:** port `D:\Projects\SagarDrishti\services\agent\app\voice.py` to TypeScript server routes; browser capture from `D:\Projects\SagarDrishti\apps\web\lib\voice.ts`; Noto Indic fonts from `D:\Projects\SagarDrishti\apps\web\public\fonts` (keep the OFL notice).
- **Interview guardrails:** `D:\Projects\Viva\lib\engine\policy.ts` ("model proposes, policy disposes").
- **Deck pipeline:** `D:\Projects\SagarDrishti\.ppt-build\` (python-pptx on the official template, PowerPoint COM export).
