# Cloud Native and 12-Factor Notes

This project follows 12-factor principles where possible for a single Fastify service.

1. Codebase

- Single codebase in one repo, multiple deploys can be created by environment variables.

2. Dependencies

- Dependencies are declared in `package.json` and locked with `pnpm-lock.yaml`.

3. Config

- Runtime config is externalized to environment variables in `src/config.ts`.
- See `.env.example` for supported variables.

4. Backing Services

- OpenTelemetry endpoint is treated as an attached resource through `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Prometheus/Loki/Tempo/Grafana remain replaceable external services.

5. Build, Release, Run

- `Dockerfile` is multi-stage:
  - build stage creates artifacts (`dist`)
  - runtime stage runs immutable build output

6. Processes

- App is designed as a stateless process.
- No in-memory session or local persistence is required for correctness.

7. Port Binding

- HTTP server binds to `HOST`/`PORT` from env.

8. Concurrency

- Horizontal scaling can be done by running multiple container instances.
- The app avoids local state that prevents safe replication.

9. Disposability

- Graceful shutdown on `SIGINT`/`SIGTERM`.
- Shutdown timeout is configurable by `SHUTDOWN_TIMEOUT_MS`.

10. Dev/Prod Parity

- Same app process and same image layout can run in all environments.
- Only env vars change between environments.

11. Logs

- Logs are emitted to stdout as structured JSON by default in production (`LOG_MODE=json`).
- Pretty logging is available for local development (`LOG_MODE=pretty`).

12. Admin Processes

- One-off admin tasks can run using the same image and release artifacts.
- Build and runtime commands are reproducible from package scripts.

## Cloud-native runtime endpoints

- Liveness probe: `GET /livez` (configurable with `LIVENESS_PATH`)
- Readiness probe: `GET /readyz` (configurable with `READINESS_PATH`)
- Metrics endpoint: `GET /metrics` (configurable with `METRICS_PATH`)
