import { isIP } from "node:net";
import { z } from "zod";

const envSchema = z
  .object({
    // PostgreSQL
    DATABASE_URL: z.string().url(),

    // Redis
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),

    // Storage
    STORAGE_DRIVER: z.enum(["s3", "local"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().default("./data"),

    // MinIO / S3 (required when STORAGE_DRIVER=s3)
    MINIO_ENDPOINT: z.string().default("localhost"),
    MINIO_PORT: z.coerce.number().default(9000),
    MINIO_ACCESS_KEY: z.string().optional(),
    MINIO_SECRET_KEY: z.string().optional(),
    MINIO_BUCKET: z.string().default("emails"),
    MINIO_USE_SSL: z
      .string()
      .default("false")
      .transform((v) => v === "true"),

    // SMTP Server
    SMTP_PORT: z.coerce.number().default(2525),
    SMTP_HOST: z.string().default("localhost"), // advertised/external hostname, not a bind address
    SMTP_BIND_HOST: z.string().default("0.0.0.0"),
    SMTP_PORTS: z.string().optional(), // Comma-separated additional ports, e.g. "2525,1025"

    // API Server
    API_PORT: z.coerce.number().default(3001),
    API_HOST: z.string().default("0.0.0.0"),

    // App Mode
    APP_MODE: z.enum(["testing", "production"]).default("testing"),

    // Auth
    JWT_SECRET: z.string().min(16),

    // Encrypts DKIM private keys at rest (AES-256-GCM). Required in
    // production; generate with `openssl rand -base64 32`.
    DKIM_ENCRYPTION_KEY: z.string().min(32).optional(),
    // Set while rotating DKIM_ENCRYPTION_KEY: the old value, so keys
    // encrypted with it stay readable and are re-encrypted on API start.
    DKIM_ENCRYPTION_KEY_PREVIOUS: z.string().min(32).optional(),

    // From address for server-originated mail (password reset, forwards).
    // In production it must be on a domain verified under Domains, so the
    // mail is DKIM-signed and can be delivered.
    SYSTEM_EMAIL_FROM: z.email().optional(),

    // Public IP of this relay, published in the SPF record and checked by
    // domain verification.
    SENDING_IP: z
      .string()
      .refine((v) => isIP(v) !== 0, "must be an IPv4 or IPv6 address")
      .optional(),

    // OAuth2 PKCE
    OAUTH2_ENABLED: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    OAUTH2_ISSUER_URL: z.string().url().optional(),
    OAUTH2_CLIENT_ID: z.string().optional(),
    OAUTH2_REDIRECT_URI: z.string().url().optional(),
    OAUTH2_SCOPES: z.string().default("openid profile email"),

    // LDAP
    LDAP_ENABLED: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    LDAP_URL: z.string().optional(),
    LDAP_BIND_DN: z.string().optional(),
    LDAP_BIND_PASSWORD: z.string().optional(),
    LDAP_SEARCH_BASE: z.string().optional(),
    LDAP_SEARCH_FILTER: z.string().default("(uid={{username}})"),

    // Tracking
    TRACKING_BASE_URL: z.string().default("http://localhost:3001"),

    // Web app (used to build links in system emails, e.g. password reset)
    WEB_APP_URL: z.string().default("http://localhost:2121/admin/smtp"),

    // CORS
    CORS_ORIGINS: z.string().optional(), // Comma-separated allowed origins

    // Cleanup
    CLEANUP_MAX_AGE_HOURS: z.coerce.number().default(24),
    CLEANUP_BATCH_SIZE: z.coerce.number().default(500),

    // API rate limit: requests per user (or IP) per minute
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  })
  .superRefine((data, ctx) => {
    if (data.APP_MODE === "production" && !data.SYSTEM_EMAIL_FROM) {
      ctx.addIssue({
        code: "custom",
        path: ["SYSTEM_EMAIL_FROM"],
        message: "SYSTEM_EMAIL_FROM is required when APP_MODE=production",
      });
    }
    if (data.APP_MODE === "production" && !data.DKIM_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DKIM_ENCRYPTION_KEY"],
        message: "DKIM_ENCRYPTION_KEY is required when APP_MODE=production",
      });
    }
    if (data.STORAGE_DRIVER === "s3") {
      if (!data.MINIO_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["MINIO_ACCESS_KEY"],
          message: "MINIO_ACCESS_KEY is required when STORAGE_DRIVER=s3",
        });
      }
      if (!data.MINIO_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["MINIO_SECRET_KEY"],
          message: "MINIO_SECRET_KEY is required when STORAGE_DRIVER=s3",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error(
        "❌ Invalid environment variables:",
        result.error.flatten().fieldErrors,
      );
      throw new Error("Invalid environment variables");
    }
    _env = result.data;
  }
  return _env;
}

export { envSchema };

/** From address for server-originated mail. */
export function systemEmailFrom(env: Pick<Env, "SYSTEM_EMAIL_FROM">): string {
  return env.SYSTEM_EMAIL_FROM ?? "noreply@mailpocket.local";
}
