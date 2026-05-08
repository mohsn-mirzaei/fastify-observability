# Observability Architecture (Updated Stack)

این پروژه الان با استک زیر کار می‌کند:

- Fastify (app)
- Prometheus (metrics)
- Loki + pino-loki (logs)
- Tempo (traces)
- Grafana (dashboards + explore)

> نکته: `Jaeger` حذف شده و tracing backend اصلی پروژه `Tempo` است.

```mermaid
flowchart LR
    U[Client / Browser / Curl] --> A[Fastify App :3000]

    subgraph In-App Signals
      A --> M[/metrics endpoint\nfastify-metrics/]
      A --> L[Structured Logs\nPino + pino-loki]
      A --> T[OpenTelemetry Spans\nAuto + Custom]
    end

    %% Metrics
    M --> P[Prometheus :9090\nscrape every 5s]

    %% Logs
    L --> LK[Loki :3100]

    %% Traces
    T --> OTLP[OTLP HTTP Exporter\n/app -> http://tempo:4318/v1/traces]
    OTLP --> TP[Tempo :4318 ingest\n:3200 query]

    %% Visualization
    P --> G[Grafana :3001]
    LK --> G
    TP --> G
```

## Flow خلاصه

- هر request وارد Fastify می‌شود و هم‌زمان سه سیگنال تولید می‌شود: `Metrics`, `Logs`, `Traces`.
- متریک‌ها از `/metrics` توسط Prometheus scrape می‌شوند.
- لاگ‌ها توسط `pino-loki` مستقیما از اپلیکیشن به Loki ارسال می‌شوند.
- تریس‌ها با OpenTelemetry تولید و از OTLP به Tempo فرستاده می‌شوند.
- Grafana روی هر سه datasource (Prometheus/Loki/Tempo) دید یکپارچه ارائه می‌دهد.

## فایل‌های کلیدی

- `observability/prometheus/prometheus.yml`
- `observability/tempo/tempo.yml`
- `observability/grafana/provisioning/datasources/datasources.yml`
- `observability/grafana/provisioning/dashboards/dashboards.yml`
- `observability/grafana/dashboards/*.json`
