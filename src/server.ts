import Fastify from "fastify";
import metricsPlugin from "fastify-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { trace } from "@opentelemetry/api";
import { config } from "./config.js";

process.env.OTEL_SERVICE_NAME = config.otelServiceName;

const exporter = new OTLPTraceExporter(
  config.otelExporterOtlpEndpoint
    ? { url: config.otelExporterOtlpEndpoint }
    : {},
);

const sdk = new NodeSDK({
  traceExporter: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

void sdk.start();

const logger =
  config.logMode === "pretty" || config.lokiPushUrl
    ? {
        level: config.logLevel,
        transport: {
          targets: [
            ...(config.logMode === "pretty"
              ? [
                  {
                    target: "pino-pretty",
                    options: {
                      translateTime: "HH:MM:ss Z",
                      ignore: "pid,hostname",
                    },
                  },
                ]
              : []),
            ...(config.lokiPushUrl
              ? [
                  {
                    target: "pino-loki",
                    options: {
                      host: config.lokiPushUrl,
                      labels: {
                        service: config.appName,
                        env: config.nodeEnv,
                      },
                      propsToLabels: ["level"],
                    },
                  },
                ]
              : []),
          ],
        },
      }
    : { level: config.logLevel };

const fastify = Fastify({ logger });
let appReady = false;

fastify.addHook("onReady", async () => {
  appReady = true;
});

fastify.addHook("onClose", async () => {
  appReady = false;
});

fastify.register(metricsPlugin.default, {
  endpoint: config.metricsPath,
});

fastify.addHook("preHandler", (request, _reply, done) => {
  const span = trace.getActiveSpan();
  const route =
    request.routeOptions?.url ||
    (request as { routerPath?: string }).routerPath ||
    request.url;

  if (span) {
    span.updateName(`${request.method} ${route}`);
    span.setAttribute("http.route", route);
  }

  done();
});

fastify.get("/logs", async (request) => {
  request.log.info("this is info log");
  request.log.debug("this is debug log");
  request.log.error("this is error log");
  request.log.fatal("this is fatal log");
  request.log.trace("this is trace log");

  return { message: "Hello World" };
});

fastify.get("/slow", async () => {
  await new Promise((r) => setTimeout(r, 500));
  return { ok: true };
});

const tracer = trace.getTracer("custom");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runStep = async (name: string, ms: number) => {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute("step.duration_ms", ms);
    span.addEvent("step.started");
    await sleep(ms);
    span.addEvent("step.finished");
    span.end();
  });
};

fastify.get("/work", async () => {
  const startedAt = Date.now();

  await tracer.startActiveSpan("order-workflow", async (span) => {
    span.setAttribute("workflow.type", "demo-order");
    span.addEvent("workflow.started");

    await runStep("validate-request", 800);
    await runStep("fetch-user-profile", 1200);
    await runStep("calculate-price", 900);
    await runStep("reserve-inventory", 1100);
    await runStep("create-invoice", 1000);

    span.setAttribute("workflow.total_ms", Date.now() - startedAt);
    span.addEvent("workflow.finished");
    span.end();
  });

  return {
    done: true,
    workflow: "order-workflow",
    totalMs: Date.now() - startedAt,
  };
});

fastify.get(config.livenessPath, async () => {
  return {
    status: "alive",
    name: config.appName,
    version: config.appVersion,
    uptimeSeconds: Math.floor(process.uptime()),
  };
});

fastify.get(config.readinessPath, async (_request, reply) => {
  if (!appReady || shuttingDown) {
    return reply.code(503).send({
      status: "not-ready",
      shuttingDown,
    });
  }

  return {
    status: "ready",
    name: config.appName,
    version: config.appVersion,
  };
});

const start = async () => {
  try {
    await fastify.listen({ host: config.host, port: config.port });
    fastify.log.info(
      {
        host: config.host,
        port: config.port,
        env: config.nodeEnv,
      },
      "server started",
    );
  } catch (err) {
    fastify.log.error({ err }, "server start failed");
    process.exit(1);
  }
};

let shuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  fastify.log.info({ signal }, "graceful shutdown started");

  const forceExit = setTimeout(() => {
    fastify.log.error(
      { timeoutMs: config.shutdownTimeoutMs },
      "graceful shutdown timed out, forcing exit",
    );
    process.exit(1);
  }, config.shutdownTimeoutMs);
  forceExit.unref();

  try {
    await fastify.close();
    await sdk.shutdown();
    fastify.log.info("graceful shutdown finished");
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, "error during graceful shutdown");
    clearTimeout(forceExit);
    process.exit(1);
  }
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
}

process.on("uncaughtException", (err) => {
  fastify.log.error({ err }, "uncaughtException");
  void gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  fastify.log.error({ reason }, "unhandledRejection");
  void gracefulShutdown("unhandledRejection");
});

void start();
