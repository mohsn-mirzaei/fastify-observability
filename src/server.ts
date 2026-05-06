import Fastify from "fastify";

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

// endpoint info log
fastify.get("/info-log", async (request, reply) => {
  request.log.info("this is info log");
  return { message: "Hello World" };
});

// endpoint debug-log
fastify.get("/debug-log/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  request.log.debug(`this is debug log: ${id}`);

  return { message: "Hello World" };
});

// endpoint error-log
fastify.get("/error-log", async (request, reply) => {
  request.log.error("this is error log");

  return { message: "Hello World" };
});

// endpoint warn-log
fastify.get("/warn-log", async (request, reply) => {
  request.log.warn("this is warn log");

  return { message: "Hello World" };
});

// endpoint warn-log
fastify.get("/all-log", async (request, reply) => {
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
