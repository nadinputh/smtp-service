export type RuleColor =
  "indigo" | "blue" | "green" | "yellow" | "orange" | "red" | "purple" | "pink";

const INACTIVE =
  "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700";

// Tailwind only keeps class names it can see written out, so each color spells
// its classes in full instead of building them from the name.
export const RULE_COLOR_CLASSES: Record<
  RuleColor,
  { active: string; inactive: string; dot: string; swatch: string }
> = {
  indigo: {
    active:
      "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600 text-indigo-800 dark:text-indigo-200",
    inactive: INACTIVE,
    dot: "bg-indigo-500",
    swatch: "bg-indigo-500",
  },
  blue: {
    active:
      "bg-blue-100 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 text-blue-800 dark:text-blue-200",
    inactive: INACTIVE,
    dot: "bg-blue-500",
    swatch: "bg-blue-500",
  },
  green: {
    active:
      "bg-green-100 dark:bg-green-900/30 border-green-400 dark:border-green-600 text-green-800 dark:text-green-200",
    inactive: INACTIVE,
    dot: "bg-green-500",
    swatch: "bg-green-500",
  },
  yellow: {
    active:
      "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500 dark:border-yellow-600 text-yellow-900 dark:text-yellow-200",
    inactive: INACTIVE,
    dot: "bg-yellow-400",
    swatch: "bg-yellow-400",
  },
  orange: {
    active:
      "bg-orange-100 dark:bg-orange-900/30 border-orange-400 dark:border-orange-600 text-orange-900 dark:text-orange-200",
    inactive: INACTIVE,
    dot: "bg-orange-500",
    swatch: "bg-orange-500",
  },
  red: {
    active:
      "bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-600 text-red-800 dark:text-red-200",
    inactive: INACTIVE,
    dot: "bg-red-500",
    swatch: "bg-red-500",
  },
  purple: {
    active:
      "bg-purple-100 dark:bg-purple-900/30 border-purple-400 dark:border-purple-600 text-purple-800 dark:text-purple-200",
    inactive: INACTIVE,
    dot: "bg-purple-500",
    swatch: "bg-purple-500",
  },
  pink: {
    active:
      "bg-pink-100 dark:bg-pink-900/30 border-pink-400 dark:border-pink-600 text-pink-800 dark:text-pink-200",
    inactive: INACTIVE,
    dot: "bg-pink-500",
    swatch: "bg-pink-500",
  },
};

export const RULE_COLORS = Object.keys(RULE_COLOR_CLASSES) as RuleColor[];

export function ruleColor(color: string | null | undefined) {
  return RULE_COLOR_CLASSES[color as RuleColor] ?? RULE_COLOR_CLASSES.indigo;
}
