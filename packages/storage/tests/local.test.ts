import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorage } from "../src/local.js";

let root: string;
let storage: LocalStorage;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mp-storage-"));
  await mkdir(join(root, "emails-sibling"), { recursive: true });
  storage = new LocalStorage({
    driver: "local",
    basePath: root,
    bucket: "emails",
  } as never);
  await storage.ensureBucket();
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe("LocalStorage key validation", () => {
  it("stores and reads keys inside the bucket", async () => {
    await storage.putObject("raw/a.eml", Buffer.from("hello"));
    expect((await storage.getObjectAsBuffer("raw/a.eml")).toString()).toBe(
      "hello",
    );
  });

  it("rejects keys that climb out of the bucket", async () => {
    await expect(
      storage.putObject("../escape.txt", Buffer.from("x")),
    ).rejects.toThrow(/traversal/);
  });

  it("rejects a sibling directory that merely shares the bucket name prefix", async () => {
    await expect(
      storage.putObject("../emails-sibling/x", Buffer.from("x")),
    ).rejects.toThrow(/traversal/);
    await expect(
      readFile(join(root, "emails-sibling", "x")),
    ).rejects.toThrow();
  });

  it("rejects absolute paths and the bucket root", async () => {
    await expect(storage.getObjectAsBuffer("/etc/passwd")).rejects.toThrow();
    await expect(storage.removeObject("")).rejects.toThrow(/traversal/);
  });
});
