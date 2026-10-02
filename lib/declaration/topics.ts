// The voice interview's topics, in the order they are asked (TRD M1). The same list is printed in
// eval/mapping/README.md, so the frozen eval set and the live interview ask the same questions.
// Each topic names the NOS it mostly speaks to; the interview may skip a topic whose NOS is already
// covered by earlier answers.

export type Topic = {
  id: string;
  /** Hindi question, read aloud by TTS and shown on screen. */
  q: string;
  /** English gloss for the assessor's screen. */
  en: string;
  nos: string[];
};

export const ELECTRICIAN_TOPICS: Topic[] = [
  {
    id: "intro",
    q: "अपने काम के बारे में बताइए। कितने साल से कर रहे हैं, कहाँ-कहाँ काम किया है?",
    en: "Tell us about your work: how many years, and where?",
    nos: [],
  },
  {
    id: "tools",
    q: "कौन-कौन से औज़ार और मीटर चलाते हैं, और उनसे क्या-क्या करते हैं?",
    en: "Which tools and meters do you use, and for what?",
    nos: ["CON/N0602"],
  },
  {
    id: "wiring",
    q: "मकान या बिल्डिंग में वायरिंग कैसे करते हैं? शुरू से आख़िर तक बताइए।",
    en: "How do you do wiring in a house or building, start to finish?",
    nos: ["CON/N0604"],
  },
  {
    id: "site-lighting",
    q: "कंस्ट्रक्शन साइट पर अस्थायी लाइट का काम किया है? क्या-क्या करते हैं?",
    en: "Have you set up temporary lighting on construction sites? What do you do?",
    nos: ["CON/N0603"],
  },
  {
    id: "panels",
    q: "डिस्ट्रीब्यूशन बोर्ड या पैनल लगाने, जोड़ने या ठीक करने का काम किया है?",
    en: "Have you installed, connected or repaired distribution boards or panels?",
    nos: ["CON/N0605"],
  },
  {
    id: "safety",
    q: "काम के समय अपनी और दूसरों की सुरक्षा के लिए क्या-क्या करते हैं?",
    en: "What do you do to keep yourself and others safe at work?",
    nos: ["CON/N9001"],
  },
  {
    id: "team-planning",
    q: "टीम में काम कैसे करते हैं, और काम शुरू करने से पहले तैयारी कैसे करते हैं?",
    en: "How do you work in a team, and how do you prepare before starting?",
    nos: ["CON/N8001", "CON/N8002"],
  },
  {
    id: "other",
    q: "फ़ोन से भुगतान, पैसों का हिसाब या ग्राहक से बात, ये सब कैसे करते हैं?",
    en: "How do you handle phone payments, keeping accounts and talking to customers?",
    nos: ["DGT/VSQ/N0101"],
  },
];
