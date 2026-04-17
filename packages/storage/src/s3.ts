import * as Minio from "minio";
import { Readable } from "node:stream";
import type { StorageClient, S3StorageConfig } from "./types.js";

export class S3Storage implements StorageClient {
  private client: Minio.Client;
  private bucket: string;

  constructor(config: S3StorageConfig) {
    this.client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      useSSL: config.useSSL,
      pathStyle: true,
    });
    this.bucket = config.bucket;
  }

  async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        console.log(`✅ Created S3 bucket: ${this.bucket}`);
      }
    } catch (err: any) {
      if (
        err?.code === "AccessDenied" ||
        err?.message?.includes("Access Denied")
      ) {
        throw new Error(
          `S3 access denied — check credentials. Original: ${err.message}`,
        );
      }
      throw err;
    }
  }

  async putObject(
    key: string,
    data: Readable | Buffer,
    size?: number,
    contentType?: string,
  ): Promise<void> {
    const metaData = contentType ? { "Content-Type": contentType } : {};
    await this.client.putObject(this.bucket, key, data, size, metaData);
  }

  async getObject(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, key);
  }

  async getObjectAsBuffer(key: string): Promise<Buffer> {
    const stream = await this.getObject(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async removeObject(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async removeObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.removeObjects(this.bucket, keys);
  }
}
