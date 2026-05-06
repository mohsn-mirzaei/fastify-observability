import Fastify from "fastify";
import metricsPlugin from "fastify-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { trace } from "@opentelemetry/api";

process.env.OTEL_SERVICE_NAME ??= "fastify-observability";

const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
});

const sdk = new NodeSDK({
  traceExporter: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

const fastify = Fastify({
  logger: {
    level: "info", // trace, debug, info, warn, error
    transport: {
      targets: [
        {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
        {
          target: "pino/file",
          options: { destination: "./logs/app.log" },
        },
      ],
    },
  },
});

fastify.register(metricsPlugin.default, {
  endpoint: "/metrics",
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

// endpoint warn-log
fastify.get("/logs", async (request, reply) => {
  request.log.info("this is info log");
  request.log.debug("this is debug log");
  request.log.error("this is error log");
  request.log.fatal("this is fatal log");
  request.log.trace("this is trace log");
  request.log.silent("this is silent log");
  request.log.level;

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

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log("Server running on http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
