import Fastify from "fastify";
import metricsPlugin from "fastify-metrics";

const fastify = Fastify({
  logger: {
    level: "info", // trace, debug, info, warn, error
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

fastify.register(metricsPlugin.default, {
  endpoint: "/metrics",
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
