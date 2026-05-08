# Fastify Observability Stack

این پوشه همه چیز لازم برای Observability پروژه را در یک نقطه نگه می‌دارد: متریک، لاگ، تریس و داشبورد.

## این پروژه دقیقا چه چیزی دارد؟

- **Application**: سرویس `Fastify` در `src/server.ts` که:
  - متریک‌های HTTP را با `fastify-metrics` روی `METRICS_PATH` (پیش‌فرض: `/metrics`) منتشر می‌کند.
  - لاگ ساختاریافته (`pino`) تولید می‌کند و با `pino-loki` مستقیما به Loki می‌فرستد.
  - تریس OpenTelemetry (auto instrumentation + custom spans) تولید می‌کند و به OTLP endpoint می‌فرستد.
- **Prometheus**: متریک‌های سرویس `app` و همین‌طور سلامت `tempo` و `loki` را scrape می‌کند.
- **Loki**: مقصد مرکزی لاگ‌ها که لاگ‌های اپ را مستقیم از `pino-loki` دریافت می‌کند.
- **Tempo**: بک‌اند تریس که spanها را از OTLP HTTP (`4318`) دریافت می‌کند.
- **Grafana**: visualization لایه نهایی با datasourceهای `Prometheus`, `Loki`, `Tempo` و داشبوردهای آماده.

## ساختار پوشه

```text
observability/
  README.md
  prometheus/
    prometheus.yml
  tempo/
    tempo.yml
  grafana/
    dashboards/
      fastify-overview.json
      loki-logs.json
      tempo-health.json
    provisioning/
      dashboards/
        dashboards.yml
      datasources/
        datasources.yml
```

## پیاده‌سازی چطور انجام شده؟

### 1) Metrics

- پلاگین `fastify-metrics` در `src/server.ts` رجیستر شده است.
- Prometheus با job `fastify-app` سرویس `app:3000` را scrape می‌کند.
- متریک‌های کاربردی مثل نرخ درخواست، latency quantileها و status codeها در داشبورد `Fastify Overview` استفاده می‌شوند.

### 2) Logs

- اپلیکیشن لاگ‌ها را به صورت JSON (یا pretty در حالت dev محلی) می‌نویسد.
- با تنظیم `LOKI_PUSH_URL`، همان لاگ‌ها توسط `pino-loki` مستقیم به Loki ارسال می‌شوند.
- labelهای کلیدی مثل `service`, `env`, `level` روی stream قرار می‌گیرند تا query ساده‌تر شود.
- داشبورد `Fastify Logs` روی Loki برای جستجو و rate بر اساس level آماده است.

### 3) Traces

- OpenTelemetry `NodeSDK` با auto-instrumentation فعال است.
- exporter از نوع `OTLPTraceExporter` است و آدرسش از `OTEL_EXPORTER_OTLP_ENDPOINT` خوانده می‌شود.
- endpointهایی مثل `/work` spanهای custom چندمرحله‌ای می‌سازند تا خروجی tracing قابل مشاهده باشد.
- Tempo روی `4318` (ingest) و `3200` (query/API) بالا می‌آید.

### 4) Dashboards & Datasources

- Grafana provisioning فایل‌محور است و با بالا آمدن سرویس به صورت خودکار datasourceها را می‌سازد.
- سه datasource آماده:
  - `prometheus` -> `http://prometheus:9090`
  - `loki` -> `http://loki:3100`
  - `tempo` -> `http://tempo:3200`
- داشبوردها auto-load می‌شوند و نیاز به import دستی ندارند.

## چطور پروژه را بالا بیاوریم؟

### پیش‌نیاز

- Docker + Docker Compose
- برای اجرای بدون Docker: Node.js 22+ و `pnpm`

### اجرای کامل Stack (پیشنهادی)

#### Development

```bash
docker compose -f docker-compose.dev.yml up --build
```

#### Production-like

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

#### Default compose

```bash
docker compose up --build
```

### آدرس سرویس‌ها

- App: `http://localhost:3000`
- App Metrics: `http://localhost:3000/metrics`
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`
- Tempo: `http://localhost:3200`
- Grafana: `http://localhost:3001`

## چطور تست کنیم که واقعا کار می‌کند؟

### 1) تولید ترافیک و سیگنال

در ترمینال جدا چند بار این endpointها را بزن:

```bash
curl -s http://localhost:3000/logs > /dev/null
curl -s http://localhost:3000/slow > /dev/null
curl -s http://localhost:3000/work > /dev/null
```

برای load تست ساده:

```bash
for i in {1..20}; do curl -s http://localhost:3000/work > /dev/null; done
```

### 2) بررسی Metrics

- در `http://localhost:9090/targets` باید targetهای `fastify-app`, `tempo`, `loki` وضعیت `UP` داشته باشند.
- در `http://localhost:3000/metrics` باید متریک‌های HTTP دیده شوند.

### 3) بررسی Logs

- در Grafana داشبورد `Fastify Logs` را باز کن.
- باید لاگ‌های endpoint `/logs` دیده شوند (سطوح info/debug/error/fatal/trace).

### 4) بررسی Traces

- در Grafana datasource `Tempo` را انتخاب کن.
- با سرویس `fastify-observability` traceها را جستجو کن.
- برای `/work` باید spanهای مرحله‌ای مثل `validate-request` و `create-invoice` را ببینی.

### 5) Correlation در Grafana

- از trace می‌توانی به logs/mapping بروی (Tempo datasource با `tracesToLogsV2` پیکربندی شده).
- اینجا مسیر troubleshooting خیلی سریع‌تر می‌شود: از latency spike به trace و سپس به log context.

## نکات عملی

- endpoint OTLP داخل Docker باید روی `http://tempo:4318/v1/traces` باشد (نه localhost).
- اگر خارج Docker اپ را اجرا می‌کنی، از `http://localhost:4318/v1/traces` استفاده کن.
- برای ارسال لاگ به Loki باید `LOKI_PUSH_URL` در env درست تنظیم شده باشد.
- اگر داشبوردها لود نشدند، mount pathهای Grafana در compose را بررسی کن.
