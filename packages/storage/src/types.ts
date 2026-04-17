import { Readable } from "node:stream";

export interface StorageClient {
  ensureBucket(): Promise<void>;
  putObject(
    key: string,
    data: Readable | Buffer,
    size?: number,
    contentType?: string,
  ): Promise<void>;
  getObject(key: string): Promise<Readable>;
  getObjectAsBuffer(key: string): Promise<Buffer>;
  removeObject(key: string): Promise<void>;
  removeObjects(keys: string[]): Promise<void>;
}

export interface S3StorageConfig {
  driver: "s3";
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
  bucket: string;
}

export interface LocalStorageConfig {
  driver: "local";
  basePath: string;
  bucket: string;
}

export type StorageConfig = S3StorageConfig | LocalStorageConfig;
