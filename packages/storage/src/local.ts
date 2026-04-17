import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile, rm, unlink, access } from "node:fs/promises";
import { join, dirname, isAbsolute, resolve } from "node:path";
import { Readable } from "node:stream";
import type { StorageClient, LocalStorageConfig } from "./types.js";

function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

export class LocalStorage implements StorageClient {
  private basePath: string;

  constructor(config: LocalStorageConfig) {
    const base = isAbsolute(config.basePath)
      ? config.basePath
      : resolve(findProjectRoot(), config.basePath);
    this.basePath = join(base, config.bucket);
  }

  private resolve(key: string): string {
    // Prevent path traversal
    const resolved = join(this.basePath, key);
    if (!resolved.startsWith(this.basePath)) {
      throw new Error("Invalid key: path traversal detected");
    }
    return resolved;
  }

  async ensureBucket(): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    console.log(`✅ Local storage directory ready: ${this.basePath}`);
  }

  async putObject(
    key: string,
    data: Readable | Buffer,
    _size?: number,
    _contentType?: string,
  ): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(dirname(filePath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await writeFile(filePath, data);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await writeFile(filePath, Buffer.concat(chunks));
    }
  }

  async getObject(key: string): Promise<Readable> {
    const filePath = this.resolve(key);
    await access(filePath);
    return createReadStream(filePath);
  }

  async getObjectAsBuffer(key: string): Promise<Buffer> {
    const { readFile } = await import("node:fs/promises");
    const filePath = this.resolve(key);
    return readFile(filePath);
  }

  async removeObject(key: string): Promise<void> {
    const filePath = this.resolve(key);
    try {
      await unlink(filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async removeObjects(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.removeObject(key)));
  }
}
