import { describe, it, expect } from "vitest";
import { csvCell } from "../src/lib/csv.js";
import { contentDisposition } from "../src/lib/attachment.js";

describe("csvCell", () => {
  it("quotes and doubles embedded quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(7)).toBe('"7"');
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"])(
    "neutralizes formula-looking value %j",
    (v) => {
      expect(csvCell(v).startsWith(`"'`)).toBe(true);
    },
  );

  it("leaves ordinary text alone", () => {
    expect(csvCell("Hello, world")).toBe('"Hello, world"');
  });
});

describe("contentDisposition", () => {
  it("can't be broken out of by quotes or newlines in the name", () => {
    const h = contentDisposition("attachment", 'a"\r\nSet-Cookie: x=1.csv');
    expect(h).not.toMatch(/[\r\n]/);
    expect(h.match(/"/g)).toHaveLength(2);
  });

  it("keeps a UTF-8 filename* for non-ASCII names", () => {
    expect(contentDisposition("attachment", "é.csv")).toContain(
      "filename*=UTF-8''%C3%A9.csv",
    );
  });
});
