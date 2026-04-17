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
    STORAGE_LOCAL_PATH: z.string().default("/data/"),

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
    SMTP_HOST: z.string().default("0.0.0.0"),
    SMTP_PORTS: z.string().optional(), // Comma-separated additional ports, e.g. "2525,1025"

    // API Server
    API_PORT: z.coerce.number().default(3001),
    API_HOST: z.string().default("0.0.0.0"),

    // App Mode
    APP_MODE: z.enum(["testing", "production"]).default("testing"),

    // Auth
    JWT_SECRET: z.string().min(16),

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
    TRACKING_BASE_URL: z.string().default("http://localhost:3002"),

    // Cleanup
    CLEANUP_MAX_AGE_HOURS: z.coerce.number().default(24),
  })
  .superRefine((data, ctx) => {
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
