import {
  EMAIL_CLIENTS,
  FEATURES,
  type SupportLevel,
} from "../data/email-compatibility.js";

export interface FeatureResult {
  name: string;
  category: "css" | "html" | "other";
  description: string;
  usageCount: number;
  clients: Record<string, SupportLevel>;
}

export interface ClientScore {
  id: string;
  name: string;
  icon: string;
  category: "desktop" | "web" | "mobile";
  score: number; // 0-100
}

export interface CompatibilityResult {
  overallScores: ClientScore[];
  features: FeatureResult[];
  summary: {
    totalFeaturesDetected: number;
    fullyCompatibleClients: number;
    problematicFeatures: number;
  };
}

/**
 * Mail HTML is attacker-controlled and can be up to the SMTP size limit; the
 * analysis runs in the API process, so it only looks at the start.
 */
const MAX_ANALYZED_CHARS = 512 * 1024;

/**
 * Extracts all CSS text from an HTML string:
 * - Contents of <style> blocks
 * - Inline style="..." attribute values
 */
function extractCSS(html: string): string {
  const parts: string[] = [];

  // <style> blocks. Scanned forward with sticky position instead of one lazy
  // `<style>[\s\S]*?</style>` regex, which rescans to the end of the input for
  // every unclosed <style> and goes quadratic.
  const open = /<style/gi;
  const openEnd = />/g;
  const close = /<\/style/gi;
  let pos = 0;
  while (pos < html.length) {
    open.lastIndex = pos;
    const start = open.exec(html);
    if (!start) break;
    openEnd.lastIndex = start.index;
    const gt = openEnd.exec(html);
    if (!gt) break;
    close.lastIndex = gt.index + 1;
    const end = close.exec(html);
    if (!end) break;
    parts.push(html.slice(gt.index + 1, end.index));
    pos = end.index + 1;
  }

  let m: RegExpExecArray | null;

  // inline style attributes
  const inlineRe = /style\s*=\s*["']([^"']*?)["']/gi;
  while ((m = inlineRe.exec(html)) !== null) {
    parts.push(m[1]);
  }

  return parts.join("\n");
}

/**
 * Analyzes an email's HTML content and returns compatibility scores
 * for each email client, plus per-feature support details.
 */
export function analyzeCompatibility(input: string): CompatibilityResult {
  const html = input.slice(0, MAX_ANALYZED_CHARS);
  const cssText = extractCSS(html);
  const detectedFeatures: FeatureResult[] = [];

  for (const feature of FEATURES) {
    let totalCount = 0;
    const searchTarget = feature.detectInCSS ? cssText : html;

    for (const pattern of feature.detectPatterns) {
      // Use global flag for counting
      const globalPattern = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
      );
      const matches = searchTarget.match(globalPattern);
      if (matches) totalCount += matches.length;
    }

    if (totalCount > 0) {
      detectedFeatures.push({
        name: feature.name,
        category: feature.category,
        description: feature.description,
        usageCount: totalCount,
        clients: { ...feature.support },
      });
    }
  }

  // Calculate per-client scores
  const totalFeatures = detectedFeatures.length;
  const overallScores: ClientScore[] = EMAIL_CLIENTS.map((client) => {
    if (totalFeatures === 0) {
      return {
        id: client.id,
        name: client.name,
        icon: client.icon,
        category: client.category,
        score: 100,
      };
    }

    let score = 0;
    for (const feat of detectedFeatures) {
      const level = feat.clients[client.id];
      if (level === "full") score += 1;
      else if (level === "partial") score += 0.5;
      // "none" contributes 0
    }

    return {
      id: client.id,
      name: client.name,
      icon: client.icon,
      category: client.category,
      score: Math.round((score / totalFeatures) * 100),
    };
  });

  // Sort by score descending
  overallScores.sort((a, b) => b.score - a.score);

  const problematicFeatures = detectedFeatures.filter((f) =>
    Object.values(f.clients).some((level) => level !== "full"),
  ).length;

  const fullyCompatibleClients = overallScores.filter(
    (c) => c.score === 100,
  ).length;

  return {
    overallScores,
    features: detectedFeatures,
    summary: {
      totalFeaturesDetected: totalFeatures,
      fullyCompatibleClients,
      problematicFeatures,
    },
  };
}
