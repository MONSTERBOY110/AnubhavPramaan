// Persona cards for the role-play recordings (the held-out set). They say what experience to
// describe, not what words to use: the speaker answers in their own words.

export type Persona = { id: string; title: string; brief: string[]; required: boolean };

export const PERSONAS: Persona[] = [
  {
    id: "R01",
    title: "Fully experienced electrician, about 12 years",
    required: true,
    brief: [
      "Flats and houses: conduit pipes in slabs and walls, pulling wires, switch boards, fittings, earthing.",
      "Building sites: temporary lights, cables, joints, replacing bulbs and switches.",
      "Distribution boards with MCBs; testing with a tester, multimeter or megger; finding faults.",
      "Safety habits, working with helpers and the supervisor, planning the day's work.",
    ],
  },
  {
    id: "R02",
    title: "Partly experienced helper, about 3 years",
    required: true,
    brief: [
      "Mostly house wiring as a helper: pipes in walls, pulling wires, fixing switch boards.",
      "Has not done site lighting or distribution boards alone: say so when asked.",
      "Some safety habits; follows what the senior electrician says.",
    ],
  },
  {
    id: "R03",
    title: "Site electrician, about 8 years",
    required: true,
    brief: [
      "Mainly construction sites: temporary lighting, cables on poles or underground, shifting lights as work moves.",
      "Distribution boxes on site: MCBs, earthing, daily checks, switching off in the evening, fault finding.",
      "Some house wiring too. Wears gloves and helmet, reports hazards.",
    ],
  },
  {
    id: "R04",
    title: "Experienced, but answers very briefly (optional)",
    required: false,
    brief: ["Answer each question in one short sentence, the way a shy or busy worker would."],
  },
  {
    id: "R05",
    title: "Speaks Hinglish (optional)",
    required: false,
    brief: [
      "Any experience level; mix English words freely, e.g. wiring, MCB, conduit, testing, safety.",
    ],
  },
];
