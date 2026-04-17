/**
 * Email client compatibility database.
 * Based on caniemail.com data — maps CSS/HTML features to support levels
 * across major email clients.
 *
 * Support levels: "full" | "partial" | "none"
 */

export type SupportLevel = "full" | "partial" | "none";

export interface EmailClient {
  id: string;
  name: string;
  icon: string; // lucide icon name
  category: "desktop" | "web" | "mobile";
}

export interface FeatureEntry {
  name: string;
  category: "css" | "html" | "other";
  description: string;
  /** regex patterns to detect this feature in HTML/CSS */
  detectPatterns: RegExp[];
  /** Whether patterns match against CSS properties (true) or raw HTML (false) */
  detectInCSS: boolean;
  support: Record<string, SupportLevel>;
}

export const EMAIL_CLIENTS: EmailClient[] = [
  {
    id: "apple-mail",
    name: "Apple Mail",
    icon: "lucide:apple",
    category: "desktop",
  },
  {
    id: "apple-mail-ios",
    name: "iOS Mail",
    icon: "lucide:smartphone",
    category: "mobile",
  },
  { id: "gmail-web", name: "Gmail", icon: "lucide:mail", category: "web" },
  {
    id: "gmail-android",
    name: "Gmail Android",
    icon: "lucide:smartphone",
    category: "mobile",
  },
  {
    id: "outlook-web",
    name: "Outlook.com",
    icon: "lucide:globe",
    category: "web",
  },
  {
    id: "outlook-windows",
    name: "Outlook Win",
    icon: "lucide:monitor",
    category: "desktop",
  },
  {
    id: "outlook-mac",
    name: "Outlook Mac",
    icon: "lucide:monitor",
    category: "desktop",
  },
  { id: "yahoo", name: "Yahoo Mail", icon: "lucide:mail", category: "web" },
  {
    id: "thunderbird",
    name: "Thunderbird",
    icon: "lucide:mail",
    category: "desktop",
  },
  {
    id: "samsung-mail",
    name: "Samsung Mail",
    icon: "lucide:smartphone",
    category: "mobile",
  },
];

const CLIENT_IDS = EMAIL_CLIENTS.map((c) => c.id);

/** Helper to build a support map from an array of [clientId, level] tuples */
function s(
  defaults: SupportLevel,
  overrides: [string, SupportLevel][] = [],
): Record<string, SupportLevel> {
  const map: Record<string, SupportLevel> = {};
  for (const id of CLIENT_IDS) map[id] = defaults;
  for (const [id, level] of overrides) map[id] = level;
  return map;
}

export const FEATURES: FeatureEntry[] = [
  // ─── CSS Layout ─────────────────────────────────────────
  {
    name: "flexbox",
    category: "css",
    description: "CSS Flexbox (display: flex)",
    detectPatterns: [/display\s*:\s*flex/i, /display\s*:\s*inline-flex/i],
    detectInCSS: true,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
      ["samsung-mail", "full"],
    ]),
  },
  {
    name: "grid",
    category: "css",
    description: "CSS Grid (display: grid)",
    detectPatterns: [/display\s*:\s*grid/i, /display\s*:\s*inline-grid/i],
    detectInCSS: true,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
      ["samsung-mail", "partial"],
    ]),
  },
  {
    name: "float",
    category: "css",
    description: "CSS float property",
    detectPatterns: [/float\s*:\s*(left|right)/i],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "partial"]]),
  },
  {
    name: "position",
    category: "css",
    description: "CSS position (absolute/relative/fixed)",
    detectPatterns: [/position\s*:\s*(absolute|relative|fixed|sticky)/i],
    detectInCSS: true,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
      ["samsung-mail", "full"],
    ]),
  },

  // ─── CSS Box Model ──────────────────────────────────────
  {
    name: "border-radius",
    category: "css",
    description: "Rounded corners",
    detectPatterns: [
      /border-radius\s*:/i,
      /border-(?:top|bottom)-(?:left|right)-radius\s*:/i,
    ],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "none"]]),
  },
  {
    name: "box-shadow",
    category: "css",
    description: "Box shadow effect",
    detectPatterns: [/box-shadow\s*:/i],
    detectInCSS: true,
    support: s("full", [
      ["outlook-windows", "none"],
      ["gmail-web", "none"],
      ["gmail-android", "none"],
      ["yahoo", "none"],
    ]),
  },
  {
    name: "box-sizing",
    category: "css",
    description: "Box sizing model",
    detectPatterns: [/box-sizing\s*:/i],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "none"]]),
  },
  {
    name: "margin",
    category: "css",
    description: "CSS margin property",
    detectPatterns: [
      /(?<![a-z-])margin\s*:/i,
      /margin-(?:top|right|bottom|left)\s*:/i,
    ],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "partial"]]),
  },
  {
    name: "padding",
    category: "css",
    description: "CSS padding property",
    detectPatterns: [
      /(?<![a-z-])padding\s*:/i,
      /padding-(?:top|right|bottom|left)\s*:/i,
    ],
    detectInCSS: true,
    support: s("full"),
  },
  {
    name: "width-height",
    category: "css",
    description: "Width/height properties (including max/min)",
    detectPatterns: [
      /(?<![a-z-])(?:max-|min-)?width\s*:/i,
      /(?<![a-z-])(?:max-|min-)?height\s*:/i,
    ],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "partial"]]),
  },
  {
    name: "overflow",
    category: "css",
    description: "CSS overflow control",
    detectPatterns: [/overflow\s*:/i, /overflow-[xy]\s*:/i],
    detectInCSS: true,
    support: s("partial", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
      ["outlook-windows", "none"],
    ]),
  },

  // ─── CSS Background ─────────────────────────────────────
  {
    name: "background-color",
    category: "css",
    description: "Background color",
    detectPatterns: [/background-color\s*:/i],
    detectInCSS: true,
    support: s("full"),
  },
  {
    name: "background-image",
    category: "css",
    description: "CSS background image / gradient",
    detectPatterns: [
      /background-image\s*:/i,
      /background\s*:.*url\(/i,
      /background\s*:.*(?:linear|radial)-gradient/i,
    ],
    detectInCSS: true,
    support: s("full", [
      ["outlook-windows", "none"],
      ["gmail-web", "partial"],
      ["gmail-android", "partial"],
    ]),
  },
  {
    name: "gradient",
    category: "css",
    description: "CSS gradients (linear/radial)",
    detectPatterns: [/(?:linear|radial|conic)-gradient\s*\(/i],
    detectInCSS: true,
    support: s("full", [
      ["outlook-windows", "none"],
      ["gmail-web", "none"],
      ["gmail-android", "none"],
      ["yahoo", "partial"],
    ]),
  },

  // ─── CSS Text ───────────────────────────────────────────
  {
    name: "color",
    category: "css",
    description: "Text color",
    detectPatterns: [/(?<![a-z-])color\s*:/i],
    detectInCSS: true,
    support: s("full"),
  },
  {
    name: "font-family",
    category: "css",
    description: "Font family declaration",
    detectPatterns: [/font-family\s*:/i],
    detectInCSS: true,
    support: s("full"),
  },
  {
    name: "font-size",
    category: "css",
    description: "Font size",
    detectPatterns: [/font-size\s*:/i],
    detectInCSS: true,
    support: s("full"),
  },
  {
    name: "line-height",
    category: "css",
    description: "Line height",
    detectPatterns: [/line-height\s*:/i],
    detectInCSS: true,
    support: s("full"),
  },
  {
    name: "text-align",
    category: "css",
    description: "Text alignment",
    detectPatterns: [/text-align\s*:/i],
    detectInCSS: true,
    support: s("full"),
  },
  {
    name: "text-decoration",
    category: "css",
    description: "Text decoration (underline, etc.)",
    detectPatterns: [
      /text-decoration\s*:/i,
      /text-decoration-(?:color|style|line)\s*:/i,
    ],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "partial"]]),
  },
  {
    name: "text-transform",
    category: "css",
    description: "Text transform (uppercase, etc.)",
    detectPatterns: [/text-transform\s*:/i],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "partial"]]),
  },
  {
    name: "text-shadow",
    category: "css",
    description: "Text shadow effect",
    detectPatterns: [/text-shadow\s*:/i],
    detectInCSS: true,
    support: s("full", [
      ["outlook-windows", "none"],
      ["gmail-web", "none"],
      ["gmail-android", "none"],
    ]),
  },
  {
    name: "letter-spacing",
    category: "css",
    description: "Letter spacing",
    detectPatterns: [/letter-spacing\s*:/i],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "partial"]]),
  },
  {
    name: "word-spacing",
    category: "css",
    description: "Word spacing",
    detectPatterns: [/word-spacing\s*:/i],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "none"]]),
  },

  // ─── CSS Visual ─────────────────────────────────────────
  {
    name: "opacity",
    category: "css",
    description: "Element opacity",
    detectPatterns: [/opacity\s*:/i],
    detectInCSS: true,
    support: s("full", [
      ["outlook-windows", "none"],
      ["gmail-web", "none"],
      ["gmail-android", "none"],
    ]),
  },
  {
    name: "transform",
    category: "css",
    description: "CSS transforms (rotate, scale, etc.)",
    detectPatterns: [/(?<![a-z-])transform\s*:/i],
    detectInCSS: true,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
    ]),
  },
  {
    name: "transition",
    category: "css",
    description: "CSS transitions / animations",
    detectPatterns: [
      /transition\s*:/i,
      /animation\s*:/i,
      /animation-name\s*:/i,
    ],
    detectInCSS: true,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
    ]),
  },
  {
    name: "outline",
    category: "css",
    description: "Element outline",
    detectPatterns: [
      /(?<![a-z-])outline\s*:/i,
      /outline-(?:color|style|width)\s*:/i,
    ],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "none"]]),
  },
  {
    name: "visibility",
    category: "css",
    description: "CSS visibility property",
    detectPatterns: [/visibility\s*:/i],
    detectInCSS: true,
    support: s("full", [
      ["gmail-web", "none"],
      ["gmail-android", "none"],
    ]),
  },
  {
    name: "display",
    category: "css",
    description: "CSS display (block, inline-block, none, table)",
    detectPatterns: [
      /display\s*:\s*(?:block|inline-block|none|table|table-cell|table-row)/i,
    ],
    detectInCSS: true,
    support: s("full", [["outlook-windows", "partial"]]),
  },

  // ─── CSS Advanced ───────────────────────────────────────
  {
    name: "media-query",
    category: "css",
    description: "@media queries (responsive design)",
    detectPatterns: [/@media\s/i],
    detectInCSS: false,
    support: s("full", [
      ["gmail-web", "none"],
      ["gmail-android", "none"],
      ["yahoo", "none"],
      ["outlook-windows", "none"],
    ]),
  },
  {
    name: "font-face",
    category: "css",
    description: "@font-face (web fonts)",
    detectPatterns: [/@font-face\s*\{/i],
    detectInCSS: false,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
      ["samsung-mail", "full"],
    ]),
  },
  {
    name: "css-variables",
    category: "css",
    description: "CSS custom properties (variables)",
    detectPatterns: [/--[a-zA-Z][\w-]*\s*:/i, /var\s*\(\s*--/i],
    detectInCSS: false,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
    ]),
  },
  {
    name: "calc",
    category: "css",
    description: "calc() function",
    detectPatterns: [/calc\s*\(/i],
    detectInCSS: false,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
      ["samsung-mail", "partial"],
    ]),
  },

  // ─── HTML Elements ──────────────────────────────────────
  {
    name: "html-table",
    category: "html",
    description: "<table> for layout",
    detectPatterns: [/<table[\s>]/i],
    detectInCSS: false,
    support: s("full"),
  },
  {
    name: "html-div",
    category: "html",
    description: "<div> element",
    detectPatterns: [/<div[\s>]/i],
    detectInCSS: false,
    support: s("full"),
  },
  {
    name: "html-semantic",
    category: "html",
    description:
      "Semantic elements (<article>, <section>, <nav>, <header>, <footer>)",
    detectPatterns: [/<(?:article|section|nav|header|footer|main|aside)[\s>]/i],
    detectInCSS: false,
    support: s("full", [["outlook-windows", "partial"]]),
  },
  {
    name: "html-image",
    category: "html",
    description: "<img> element",
    detectPatterns: [/<img[\s>]/i],
    detectInCSS: false,
    support: s("full"),
  },
  {
    name: "html-picture",
    category: "html",
    description: "<picture> / <source> for responsive images",
    detectPatterns: [/<picture[\s>]/i, /<source[\s>]/i],
    detectInCSS: false,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
    ]),
  },
  {
    name: "html-video",
    category: "html",
    description: "<video> element",
    detectPatterns: [/<video[\s>]/i],
    detectInCSS: false,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
    ]),
  },
  {
    name: "html-svg",
    category: "html",
    description: "Inline <svg>",
    detectPatterns: [/<svg[\s>]/i],
    detectInCSS: false,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
      ["samsung-mail", "full"],
    ]),
  },
  {
    name: "html-form",
    category: "html",
    description: "Form elements (<form>, <input>, <button>, <select>)",
    detectPatterns: [/<(?:form|input|button|select|textarea)[\s>]/i],
    detectInCSS: false,
    support: s("none", [
      ["apple-mail", "partial"],
      ["apple-mail-ios", "partial"],
      ["thunderbird", "partial"],
    ]),
  },
  {
    name: "html-anchor",
    category: "html",
    description: "<a> links",
    detectPatterns: [/<a[\s>]/i],
    detectInCSS: false,
    support: s("full"),
  },
  {
    name: "html-list",
    category: "html",
    description: "<ul>, <ol>, <li> lists",
    detectPatterns: [/<(?:ul|ol)[\s>]/i],
    detectInCSS: false,
    support: s("full", [["outlook-windows", "partial"]]),
  },
  {
    name: "srcset",
    category: "html",
    description: "srcset attribute for responsive images",
    detectPatterns: [/srcset\s*=/i],
    detectInCSS: false,
    support: s("none", [
      ["apple-mail", "full"],
      ["apple-mail-ios", "full"],
      ["thunderbird", "full"],
      ["outlook-mac", "full"],
      ["samsung-mail", "full"],
    ]),
  },

  // ─── Other Features ─────────────────────────────────────
  {
    name: "style-block",
    category: "other",
    description: "<style> block in <head>",
    detectPatterns: [/<style[\s>]/i],
    detectInCSS: false,
    support: s("full", [
      ["gmail-web", "partial"],
      ["gmail-android", "partial"],
    ]),
  },
  {
    name: "link-stylesheet",
    category: "other",
    description: 'External stylesheet (<link rel="stylesheet">)',
    detectPatterns: [/<link[^>]*rel=["']stylesheet["']/i],
    detectInCSS: false,
    support: s("none"),
  },
  {
    name: "role-attribute",
    category: "other",
    description: "ARIA role attributes",
    detectPatterns: [/role\s*=\s*["']/i],
    detectInCSS: false,
    support: s("full", [
      ["outlook-windows", "none"],
      ["gmail-web", "none"],
      ["gmail-android", "none"],
    ]),
  },
  {
    name: "data-attributes",
    category: "other",
    description: "data-* attributes",
    detectPatterns: [/data-[a-z][\w-]*\s*=/i],
    detectInCSS: false,
    support: s("full", [
      ["gmail-web", "none"],
      ["gmail-android", "none"],
      ["outlook-windows", "none"],
    ]),
  },
];
