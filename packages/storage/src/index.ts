import * as Minio from "minio";
import { Readable } from "node:stream";

let _client: Minio.Client | undefined;

export interface StorageConfig {
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
  bucket: string;
}

let _bucket: string;

export function getStorageClient(config: StorageConfig): Minio.Client {
  if (!_client) {
    _client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      useSSL: config.useSSL,
      pathStyle: true,
    });
    _bucket = config.bucket;
  }
  return _client;
}

export async function ensureBucket(client: Minio.Client, bucket: string) {
  try {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
      console.log(`✅ Created MinIO bucket: ${bucket}`);
    }
  } catch (err: any) {
    // bucketExists throws S3Error on access denied / invalid creds
    if (
      err?.code === "AccessDenied" ||
      err?.message?.includes("Access Denied")
    ) {
      throw new Error(
        `MinIO access denied — check MINIO_ACCESS_KEY and MINIO_SECRET_KEY. Original: ${err.message}`,
      );
    }
    throw err;
  }
}

export async function putObject(
  client: Minio.Client,
  bucket: string,
  key: string,
  stream: Readable | Buffer,
  size?: number,
  contentType?: string,
): Promise<void> {
  const metaData = contentType ? { "Content-Type": contentType } : {};
  await client.putObject(bucket, key, stream, size, metaData);
}

export async function getObject(
  client: Minio.Client,
  bucket: string,
  key: string,
): Promise<Readable> {
  return client.getObject(bucket, key);
}

export async function getObjectAsBuffer(
  client: Minio.Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const stream = await getObject(client, bucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function removeObject(
  client: Minio.Client,
  bucket: string,
  key: string,
): Promise<void> {
  await client.removeObject(bucket, key);
}

export async function removeObjects(
  client: Minio.Client,
  bucket: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  await client.removeObjects(bucket, keys);
}
