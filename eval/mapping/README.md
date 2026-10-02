# Mapping eval set (frozen)

Twenty synthetic Hindi self-declarations, each labelled with the Qualification Pack (QP) it should
map to and the performance criteria (PCs) it supports. The set was written and frozen **before any
mapper code existed**; its SHA-256 hashes are in `FROZEN.md`. After freezing, a label changes only
through a logged correction with a reason, recorded in `FROZEN.md`.

**What it is:** a frozen synthetic set written by the build agent. It measures how well the mapper
turns a declaration into QP, PC and route suggestions. It is not real worker data, and its numbers
are always reported as "frozen synthetic set". The independent check is the held-out set of
role-play voice recordings made by the project lead, who plays an electrician in their own words.

## Packs

| QP | Version | PCs | Note |
|---|---|---|---|
| CON/Q0602 Assistant Electrician | 4.0 | 119 | Pilot pack, NSQF 3, active (NSQC approval 08/05/2025) |
| CON/Q0103 Mason General | 1.0 | 165 | Second pack for trade discrimination only. Its own cover says deactivated on 01/04/2022; it is the version the CSDCI assessment guide is built on |

PC ids are `<NOS id>.PC<n>`, for example `CON/N0604.PC6`, read within the expected QP.

## Files

`declarations/Dnn.json`, one per declaration:

- `category`: `full` (fully experienced), `partial`, `short` (very short answers), `hinglish`
  (code-mixed), `other-trade` (a mason, not an electrician)
- `style`: `hindi` (Devanagari), `hinglish-devanagari` (Devanagari with English words in Latin
  script), `hinglish-roman` (Latin script)
- `turns`: the interview, one answer per question, as a transcript would show it
- `labels`: one entry per supported PC, with the shortest verbatim span of an answer that supports it
- `expected`: written by `check_labels.py --write` from the labels alone: QP, sorted PC ids, flat and
  weighted coverage, and the route under each rule

## Interview topics

The same topics the voice interview asks about, in this order:

| topic | question (Hindi) | mainly about |
|---|---|---|
| intro | अपने काम के बारे में बताइए। कितने साल से कर रहे हैं, कहाँ-कहाँ काम किया है? | years, setting |
| tools | कौन-कौन से औज़ार और मीटर चलाते हैं, और उनसे क्या-क्या करते हैं? | CON/N0602 |
| wiring | मकान या बिल्डिंग में वायरिंग कैसे करते हैं? शुरू से आख़िर तक बताइए। | CON/N0604 |
| site-lighting | कंस्ट्रक्शन साइट पर अस्थायी लाइट का काम किया है? क्या-क्या करते हैं? | CON/N0603 |
| panels | डिस्ट्रीब्यूशन बोर्ड या पैनल लगाने, जोड़ने या ठीक करने का काम किया है? | CON/N0605 |
| safety | काम के समय अपनी और दूसरों की सुरक्षा के लिए क्या-क्या करते हैं? | CON/N9001 |
| team-planning | टीम में काम कैसे करते हैं, और काम शुरू करने से पहले तैयारी कैसे करते हैं? | CON/N8001, CON/N8002 |
| other | फ़ोन से भुगतान, पैसों का हिसाब या ग्राहक से बात, ये सब कैसे करते हैं? | DGT/VSQ/N0101 |

A declaration may skip topics or answer in one word; that is part of what is being tested.

## Labelling rules

1. A PC is supported when the worker says, in the first person, that they do or have done the
   activity the PC describes, or a concrete activity that is plainly an instance of it.
2. Each label cites the shortest verbatim span of one answer that supports it. The checker rejects
   a span that is not an exact substring.
3. Not supported: general claims ("सब काम आता है"), knowing about something without doing it,
   negations ("जनरेटर की सर्विस मैं नहीं करता"), someone else's work ("उस्ताद पैनल बनाते थे"),
   and plans for the future.
4. One span may support several PCs when it names each activity. The QP repeats some activities in
   two NOS (for example guiding helpers is in CON/N8001.PC5 and CON/N8002.PC10); both are labelled.
5. Labels for a mason declaration use the mason pack only. A mason's work that touches electrical
   work (cutting a chase for a conduit) is not an electrician PC.
6. Routes are never typed by hand. `check_labels.py --write` derives them from the labels.
7. CON/N0603 (temporary lighting) and CON/N0605 (temporary distribution boards) are about
   temporary installations on construction sites, as their titles say. The same kind of work in a
   home or a shop supports the closest general PC instead (CON/N0602 for using circuit breakers and
   meters, CON/N0604 for wiring in permanent structures).
8. A neon line tester is a tool, not a measuring instrument: it can support finding faults
   (CON/N0602.PC3) or testing a circuit (CON/N0604.PC10), not CON/N0602.PC8 or PC10, which name
   meters such as a multimeter, tong tester or megger.

## Coverage and route, as computed from the labels

- **Flat:** covered PCs divided by all PCs in the QP (the design document's rule).
- **Weighted:** each PC carries the QP's own weight: the NOS weightage (for CON/Q0602, 20, 20, 20,
  20, 5, 5, 5, 5) times its element's share of the NOS marks, split equally among the PCs of that
  element. The weights sum to 1.
- **Route:** 70% or more gives "direct-assessment", otherwise "upskill-first" (NCVET RPL Guidelines,
  2023). It is computed under both rules; which rule the product uses is a recorded design decision.

The route here is a label for evaluating a suggestion. In the product the assessor confirms or
changes the QP and the route.

## Held-out set (role-play recordings)

Fixed before any recording exists, so it cannot be fitted to the results:

1. The project lead records 3 to 5 role-play declarations (one answer per interview topic, 16 kHz
   mono WAV) from persona cards that describe experience, not words. Audio stays private.
2. Each answer is transcribed by the same speech recogniser the app uses, and the provider is
   recorded with the transcript (Bhashini, or a labelled stand-in while its key is pending).
3. PC labels are written from those transcripts with the rules above and hashed **before the
   mapper runs on them**. Labels describe what the transcript says, so speech recognition errors
   that drop words are not counted against the mapper; they are reported separately.
4. The mapper then runs once. Results are reported as "role-play recordings, n = ...".

## Commands

```bash
python eval/mapping/check_labels.py                 # verify every file, print the table
python eval/mapping/check_labels.py --write --only D02,D03   # derive expected for these files
```

Set `PYTHONIOENCODING=utf-8` on Windows so the Hindi prints.
