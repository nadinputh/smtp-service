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
 * Extracts all CSS text from an HTML string:
 * - Contents of <style> blocks
 * - Inline style="..." attribute values
 */
function extractCSS(html: string): string {
  const parts: string[] = [];

  // <style> blocks
  const styleBlockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleBlockRe.exec(html)) !== null) {
    parts.push(m[1]);
  }

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
export function analyzeCompatibility(html: string): CompatibilityResult {
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
