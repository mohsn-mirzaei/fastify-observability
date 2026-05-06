This is a high-level observability flowchart for the project (based on `Fastify + Prometheus + Loki/Promtail + Jaeger + Grafana`):

```mermaid
flowchart LR
    U[Client / Browser / Curl] --> A[Fastify App :3000]

    subgraph App Observability inside the app
      A --> M[/metrics endpoint\nfastify-metrics/]
      A --> L[Structured Logs\nPino -> logs/app.log]
      A --> T[OpenTelemetry Spans\nAuto + Custom]
    end

    %% Metrics path
    M --> P[Prometheus :9090\nscrape every 5 seconds]

    %% Logs path
    L --> PT[Promtail\nread /app/logs/*.log]
    PT --> LK[Loki :3100]

    %% Traces path
    T --> OTLP[OTLP HTTP Exporter\nlocalhost:4318/v1/traces]
    OTLP --> J[Jaeger :16686 UI\n+ OTLP ingestion]

    %% Visualization
    P --> G[Grafana :3001]
    LK --> G
    J --> G
```

Overall flow:

- Each request enters `Fastify`, and **three signals** are produced at the same time: Metrics, Logs, and Traces.
- **Metrics** are exposed via the `/metrics` endpoint and scraped by Prometheus.
- **Logs** are written to `logs/app.log`, collected by Promtail, and sent to Loki.
- **Traces** are generated with OpenTelemetry (automatic + custom spans such as `/work`) and sent to Jaeger via OTLP.
- **Grafana** is the observability/dashboard layer that displays Prometheus and Loki data together (and Jaeger too, if the datasource is configured).
