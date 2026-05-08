import { z } from "zod";

const trimOptional = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const envSchema = z.object({
  NODE_ENV: z.string().trim().default("development"),
  APP_NAME: z.string().trim().default("fastify-observability"),
  APP_VERSION: z
    .string()
    .trim()
    .default(process.env.npm_package_version ?? "0.0.0"),
  HOST: z.string().trim().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().trim().default("info"),
  LOG_MODE: z
    .enum(["pretty", "json"])
    .default(process.env.NODE_ENV === "production" ? "json" : "pretty"),
  LOKI_PUSH_URL: z.preprocess(trimOptional, z.string().url().optional()),
  METRICS_PATH: z.string().trim().default("/metrics"),
  READINESS_PATH: z.string().trim().default("/readyz"),
  LIVENESS_PATH: z.string().trim().default("/livez"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  OTEL_SERVICE_NAME: z.string().trim().default("fastify-observability"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
    trimOptional,
    z.string().url().optional(),
  ),
});

const parsedEnv = envSchema.parse(process.env);

export const config = {
  nodeEnv: parsedEnv.NODE_ENV,
  appName: parsedEnv.APP_NAME,
  appVersion: parsedEnv.APP_VERSION,
  host: parsedEnv.HOST,
  port: parsedEnv.PORT,
  logLevel: parsedEnv.LOG_LEVEL,
  logMode: parsedEnv.LOG_MODE,
  ...(parsedEnv.LOKI_PUSH_URL ? { lokiPushUrl: parsedEnv.LOKI_PUSH_URL } : {}),
  metricsPath: parsedEnv.METRICS_PATH,
  readinessPath: parsedEnv.READINESS_PATH,
  livenessPath: parsedEnv.LIVENESS_PATH,
  shutdownTimeoutMs: parsedEnv.SHUTDOWN_TIMEOUT_MS,
  otelServiceName: parsedEnv.OTEL_SERVICE_NAME,
  ...(parsedEnv.OTEL_EXPORTER_OTLP_ENDPOINT
    ? { otelExporterOtlpEndpoint: parsedEnv.OTEL_EXPORTER_OTLP_ENDPOINT }
    : {}),
};
