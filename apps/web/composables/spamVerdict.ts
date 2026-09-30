import type { BadgeTone } from "./badgeTones";

/** Spam score → verdict, tone and text color; the one place the thresholds live. */
export function spamVerdict(score: number | null | undefined): {
  label: "Clean" | "Suspicious" | "Spam";
  tone: BadgeTone;
  text: string;
} {
  const s = score ?? 0;
  if (s < 3)
    return {
      label: "Clean",
      tone: "success",
      text: "text-green-700 dark:text-green-400",
    };
  if (s < 6)
    return {
      label: "Suspicious",
      tone: "warning",
      text: "text-yellow-800 dark:text-yellow-300",
    };
  return {
    label: "Spam",
    tone: "danger",
    text: "text-red-700 dark:text-red-400",
  };
}
