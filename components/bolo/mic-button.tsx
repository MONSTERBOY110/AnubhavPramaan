"use client";

/** The one large control on the worker's screen: tap to speak, tap again to finish. */
export function MicButton({
  recording,
  level,
  disabled,
  onStart,
  onStop,
}: {
  recording: boolean;
  level: number;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const ring = recording ? 10 + Math.round(level * 26) : 0;
  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled}
      aria-pressed={recording}
      aria-label={recording ? "रुकें (Stop)" : "बोलें (Speak)"}
      className={`relative grid size-28 place-items-center rounded-full text-white transition-[box-shadow,background-color] duration-100 disabled:opacity-40 motion-reduce:transition-none ${
        recording ? "bg-alert" : "bg-ink hover:bg-[#25306b]"
      }`}
      style={{
        boxShadow: recording
          ? `0 0 0 ${ring}px rgba(224,122,31,0.28)`
          : "0 6px 18px rgba(27,37,89,0.25)",
      }}
    >
      {recording ? (
        <span className="size-8 rounded-[6px] bg-white" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
