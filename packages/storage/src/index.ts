import { S3Storage } from "./s3.js";
import { LocalStorage } from "./local.js";
import type { StorageClient, StorageConfig } from "./types.js";

export type { StorageClient, StorageConfig } from "./types.js";
export type { S3StorageConfig, LocalStorageConfig } from "./types.js";

let _instance: StorageClient | undefined;

export function createStorage(config: StorageConfig): StorageClient {
  if (!_instance) {
    switch (config.driver) {
      case "s3":
        _instance = new S3Storage(config);
        break;
      case "local":
        _instance = new LocalStorage(config);
        break;
      default:
        throw new Error(`Unknown storage driver: ${(config as any).driver}`);
    }
  }
  return _instance;
}
