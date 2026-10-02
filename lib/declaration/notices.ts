// What the worker reads when the AI could not process an answer (lead, 2 Oct 13:02): the provider's
// content filter refused it. The transcript is kept, the claims come from the rules, and the
// worker or a helper can check the words or type a short summary. Shared by the extract route and
// the Bolo screen, so both say the same thing.

export const CONTENT_FILTER_NOTICE = {
  hi: "यह जवाब अपने-आप प्रोसेस नहीं हो सका। कृपया इसे जाँच लें या एक छोटा सार लिख दें।",
  en: "This answer could not be processed automatically, please check or type a short summary.",
} as const;

/** The label on claims found by the rules after the content filter refused the answer. */
export const CONTENT_FILTER_LABEL =
  "Rule-based extraction (the AI provider's content filter declined this answer)";
