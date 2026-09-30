// One tone palette for every badge, pill and count in the app. All pairs are
// AA for 12px text in both themes.
export const BADGE_TONES = {
  success:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  warning:
    "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  purple:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  indigo:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  neutral: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;
