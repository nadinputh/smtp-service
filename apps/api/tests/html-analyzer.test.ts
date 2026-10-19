import { describe, it, expect } from "vitest";
import { analyzeCompatibility } from "../src/lib/html-analyzer.js";

const names = (html: string) =>
  analyzeCompatibility(html).features.map((f) => f.name);

describe("analyzeCompatibility detection", () => {
  it("finds CSS in <style> blocks and inline styles", () => {
    const found = analyzeCompatibility(
      `<style>.a{display:flex}</style><p style="border-radius:4px">x</p>`,
    ).features;
    const text = JSON.stringify(found).toLowerCase();
    expect(text).toContain("flex");
    expect(text).toContain("radius");
  });

  it("reads several <style> blocks, any case, and ignores an unclosed one", () => {
    expect(
      names(`<STYLE>a{box-shadow:0 0 1px #000}</STYLE><style>b{opacity:.5}</style>`)
        .length,
    ).toBeGreaterThanOrEqual(2);
    // no closing tag: its CSS is not read (the <style> tag itself still counts)
    expect(JSON.stringify(names(`<style>a{box-shadow:0 0 1px #000}`))).not.toMatch(
      /shadow/i,
    );
    expect(JSON.stringify(names(`<style>a{box-shadow:0 0 1px #000}</style>`))).toMatch(
      /shadow/i,
    );
  });

  it("detects gradients/urls in background shorthand and stylesheet links", () => {
    const gradient = JSON.stringify(
      analyzeCompatibility(
        `<style>a{background: #fff linear-gradient(red, blue)}</style>`,
      ).features,
    ).toLowerCase();
    expect(gradient).toContain("gradient");
    expect(
      names(`<link rel="stylesheet" href="x.css">`).length,
    ).toBeGreaterThan(0);
  });

  it("reports full compatibility when nothing is detected", () => {
    const r = analyzeCompatibility("plain text");
    expect(r.features).toEqual([]);
    expect(r.overallScores.every((c) => c.score === 100)).toBe(true);
  });
});

describe("analyzeCompatibility on hostile input", () => {
  // Each of these took 20s-3min at ~1 MB before the patterns were fixed.
  const N = 150_000;
  const cases: Record<string, string> = {
    "unclosed <style>": "<style>".repeat(N),
    "<link without >": "<link ".repeat(N),
    "background: on one line": "<style>" + "background:".repeat(N) + "</style>",
    "custom property runs": "<style>" + "--a".repeat(N) + "</style>",
    "multi-megabyte input": "<p>x</p>".repeat(1_500_000),
  };
  for (const [label, html] of Object.entries(cases)) {
    it(`finishes quickly: ${label}`, () => {
      const start = Date.now();
      analyzeCompatibility(html);
      expect(Date.now() - start).toBeLessThan(1500);
    });
  }
});
