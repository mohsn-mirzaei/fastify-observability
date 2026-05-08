# Learn About This Project: Fastify Observability

## مشکل اصلی چه بود؟

این سرویس Fastify وقتی کندی/خطا داشت، فقط با لاگ خام قابل بررسی بود؛ یعنی:

- علت کندی دقیق هر route مشخص نبود
- نرخ خطای 5xx به‌صورت روندی دیده نمی‌شد
- مسیر کامل request (span به span) مشخص نبود
- ارتباط بین لاگ، متریک و تریس دستی و زمان‌بر بود

برای همین، پروژه به یک Observability Stack نیاز داشت تا **Metrics + Logs + Traces** را یکپارچه کند.

## چه کارهایی انجام شد و چرا؟

- Metrics با `fastify-metrics` اضافه شد تا `/metrics` برای scrape آماده باشد.
- Logs با `pino` و `pino-loki` به Loki فرستاده شد تا centralized logging داشته باشیم.
- Tracing با OpenTelemetry (`NodeSDK` + auto instrumentation + custom spans) فعال شد.
- Trace backend از Jaeger به `Tempo` منتقل شد تا با Grafana یکپارچه‌تر باشد.
- Grafana provisioning فایل‌محور شد تا datasource/dashboardها خودکار بالا بیایند.
- Dockerfile چندمرحله‌ای + compose dev/prod اضافه شد تا parity و استقرار ساده شود.
- health/readiness/liveness و graceful shutdown اضافه شد تا رفتار production-safe شود.

## چرا این استک انتخاب شد (به‌جای گزینه‌های دیگر)؟

- **Prometheus**: استاندارد cloud-native برای metrics، PromQL قوی، integration ساده با Fastify.
- **Loki**: سبک‌تر از ELK/OpenSearch برای این سناریو، label-based، ingestion ساده با `pino-loki`.
- **Tempo**: OTLP-native، هم‌خانواده Grafana، correlation بهتر trace→logs.
- **Grafana**: یک UI برای هر سه سیگنال؛ troubleshooting سریع‌تر و یکپارچه.

---

## توضیح خط‌به‌خط فایل‌های کانفیگ

### 1) `.env.example`

- `NODE_ENV=development`: حالت اجرای برنامه
- `APP_NAME=fastify-observability`: نام سرویس برای label/trace
- `APP_VERSION=1.0.0`: نسخه سرویس
- `HOST=0.0.0.0`: bind روی همه اینترفیس‌ها
- `PORT=3000`: پورت HTTP
- `LOG_LEVEL=info`: سطح لاگ
- `LOG_MODE=pretty`: قالب لاگ در توسعه
- `LOKI_PUSH_URL=http://localhost:3100`: مقصد ارسال لاگ
- `METRICS_PATH=/metrics`: مسیر متریک
- `LIVENESS_PATH=/livez`: مسیر لایونس
- `READINESS_PATH=/readyz`: مسیر ردینس
- `SHUTDOWN_TIMEOUT_MS=10000`: timeout خاموش‌سازی امن
- `OTEL_SERVICE_NAME=fastify-observability`: نام سرویس در trace
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces`: مقصد ارسال trace

### 2) `.dockerignore`

- `node_modules`: کاهش context و جلوگیری از ناسازگاری محیط
- `dist`: artifact محلی وارد image نشود
- `logs`: فایل runtime محلی وارد build نشود
- `.git`: تاریخچه git غیرضروری برای image
- `.gitignore`: بی‌نیاز در runtime
- `.env`: جلوگیری از ورود config/secret
- `pnpm-debug.log`: artifact موقت

### 3) `Dockerfile`

- `FROM node:22-alpine AS deps`: stage وابستگی‌ها
- `WORKDIR /app`: مسیر کاری
- `corepack ... pnpm`: تثبیت package manager
- `COPY package.json pnpm-lock.yaml`: ورودی نصب dependency
- `pnpm install --frozen-lockfile`: نصب قطعی و reproducible
- `FROM ... AS build`: stage build
- `COPY --from=deps ... node_modules`: reuse وابستگی‌ها
- `COPY tsconfig/src`: ورودی build
- `pnpm run build`: تولید `dist`
- `FROM ... AS runtime`: stage نهایی
- `ENV ...`: تنظیمات runtime production
- `COPY ... node_modules/dist`: انتقال نیازهای نهایی
- `EXPOSE 3000`: پورت اپ
- `USER node`: امنیت بهتر
- `CMD ["node","dist/server.js"]`: اجرای نهایی

### 4) `docker-compose.yml` (پایه)

- `services`: تعریف سرویس‌ها
- `app.build`: ساخت image اپ
- envهای app: رفتار production + اتصال به Loki/Tempo
- `ports 3000:3000`: انتشار اپ
- `healthcheck /livez`: پایش سلامت
- `prometheus.image + volume`: بارگذاری `prometheus.yml`
- `grafana.image + volumes`: provisioning + dashboards auto-load
- `loki.image + command`: اجرای Loki با config محلی
- `tempo.image + command + volume`: اجرای Tempo با `tempo.yml`
- `tempo ports 4318/3200`: ingest/query traces

### 5) `docker-compose.dev.yml`

- `app.image=node:22-alpine`: توسعه سریع بدون image نهایی
- `working_dir=/app`: اجرای commandها در پروژه
- env dev (`NODE_ENV=development`, `LOG_LEVEL=debug`)
- `command: pnpm install && pnpm dev`: نصب + watch
- volume `./:/app`: hot reload
- volume `/app/node_modules`: جلوگیری از overwrite
- `depends_on` برای Grafana: startup ترتیبی بهتر

### 6) `docker-compose.prod.yml`

- `app.build`: اجرای production-like با Dockerfile
- env production (`LOG_MODE=json`, ...)
- `restart: unless-stopped` برای پایداری سرویس‌ها
- healthcheck فعال برای بررسی مداوم سلامت

### 7) `observability/prometheus/prometheus.yml`

- `global.scrape_interval: 5s`: فرکانس scrape
- job `fastify-app` target `app:3000`: scrape متریک اپ
- job `tempo` target `tempo:3200`: متریک‌های Tempo
- job `loki` target `loki:3100`: متریک‌های Loki

### 8) `observability/tempo/tempo.yml`

- `server.http_listen_port: 3200`: API/query Tempo
- `receiver otlp/http endpoint 0.0.0.0:4318`: دریافت span
- `ingester.trace_idle_period/max_block_duration`: مدیریت flush بلوک‌ها
- `compactor.block_retention: 24h`: retention
- `storage.trace.backend: local`: ذخیره‌سازی محلی ساده
- `local.path` و `wal.path`: مسیر trace و WAL
- `metrics_generator.external_labels`: برچسب متریک‌های داخلی
- `processors [service-graphs, span-metrics]`: تولید شاخص‌های کاربردی از span

### 9) `observability/grafana/provisioning/datasources/datasources.yml`

- `apiVersion: 1`: schema provisioning
- datasource `Prometheus` با `uid=prometheus` و `url=http://prometheus:9090`
- datasource `Loki` با `uid=loki` و `url=http://loki:3100`
- `jsonData.maxLines: 1000` برای نمایش log
- datasource `Tempo` با `uid=tempo` و `url=http://tempo:3200`
- `tracesToLogsV2.datasourceUid=loki`: اتصال trace به logs
- `tags service.name -> service_name`: map برچسب trace به label لاگ
- `serviceMap.datasourceUid=prometheus`: graph سرویس‌ها
- `nodeGraph.enabled: true`: نمایش node graph

### 10) `observability/grafana/provisioning/dashboards/dashboards.yml`

- `apiVersion: 1`: schema provisioning
- provider با نام `Fastify Observability`
- `orgId: 1`: سازمان پیش‌فرض
- `folder: "Fastify"`: پوشه نمایش داشبورد
- `type: file`: خواندن داشبورد از فایل
- `disableDeletion: false`: حذف dashboardهای پاک‌شده
- `updateIntervalSeconds: 10`: بازخوانی دوره‌ای فایل‌ها
- `allowUiUpdates: true`: اجازه ویرایش UI
- `options.path: /var/lib/grafana/dashboards`: مسیر فایل‌های JSON

### 11) `observability/grafana/dashboards/fastify-overview.json`

- metadata: `uid/title/tags/refresh` برای هویت داشبورد
- panel `RPS`: نرخ درخواست بر پایه `http_request_duration_seconds_count`
- panel `P95 Latency`: محاسبه p95 با `histogram_quantile`
- panel `5xx Error Rate`: درصد خطای 5xx نسبت به کل
- panel `In-Flight Requests`: تعداد درخواست همزمان
- panel `Request Rate by Route`: نرخ هر route
- panel `Latency P50/P95/P99`: نمای توزیع latency
- panel `Status Code Rate`: نرخ پاسخ به تفکیک status code

### 12) `observability/grafana/dashboards/loki-logs.json`

- metadata: هویت داشبورد لاگ
- متغیر template `level`: فیلتر سطح لاگ از labelهای Loki
- panel `Application Logs`: stream زنده لاگ با query `{service=..., level=~"$level"}`
- panel `Logs Rate by Level`: نرخ لاگ به تفکیک level
- panel `Error Logs Rate`: نرخ خطا/بحرانی

### 13) `observability/grafana/dashboards/tempo-health.json`

- metadata: هویت داشبورد تریس
- `Spans Received / sec`: حجم ingest تریس
- `Failed Spans / sec`: نرخ spanهای ناموفق
- `Tempo Up`: سلامت سرویس tempo از متریک `up`
- `Spans Received` timeseries: روند ingest
- `Tempo Request Duration (p95)`: latency سرویس tempo

### 14) `tsconfig.json`

- `rootDir: ./src`, `outDir: ./dist`: ورودی/خروجی build
- `target: ES2020`: سازگاری runtime
- `module/moduleResolution: NodeNext`: ESM سازگار Node
- `lib: ["esnext"]`, `types: ["node"]`: تایپ‌های محیط Node
- `sourceMap/declaration/declarationMap`: خروجی‌های dev/tooling
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`: دقت type safety
- `strict: true`: سخت‌گیری تایپ
- `verbatimModuleSyntax`, `isolatedModules`: سازگاری ترنسپایل ایمن
- `noUncheckedSideEffectImports`: کاهش importهای side-effect پنهان
- `moduleDetection: force`: رفتار واضح ماژول
- `skipLibCheck: true`: سرعت build
- `include/exclude`: دامنه کامپایل

### 15) `package.json` (بخش‌های کانفیگی)

- `"type": "module"`: فعال شدن ESM
- scripts:
  - `dev`: اجرای watch با `tsx`
  - `build`: کامپایل TS
  - `start`: اجرای build خروجی
- `packageManager`: قفل نسخه pnpm
- dependencies:
  - Fastify + fastify-metrics (app + metrics)
  - OpenTelemetry packages (tracing)
  - pino-loki/loki (log shipping)
  - zod (اعتبارسنجی env config)

### 16) `.gitignore`

- `node_modules`, `dist`, `.env`, `.pnpm-store`  
  جلوگیری از ورود dependency/build/secrets/cache به git

---

## 5) الان چطور از این Observability Stack استفاده کنیم؟

## اجرا

- توسعه:
  - `docker compose -f docker-compose.dev.yml up --build`
- production-like:
  - `docker compose -f docker-compose.prod.yml up --build -d`
- ساده:
  - `docker compose up --build`

## آدرس‌ها

- App: `http://localhost:3000`
- Metrics endpoint: `http://localhost:3000/metrics`
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`
- Tempo: `http://localhost:3200`
- Grafana: `http://localhost:3001`

## تولید داده تست

- `curl -s http://localhost:3000/logs > /dev/null`
- `curl -s http://localhost:3000/slow > /dev/null`
- `curl -s http://localhost:3000/work > /dev/null`
- `for i in {1..20}; do curl -s http://localhost:3000/work > /dev/null; done`

## جریان عیب‌یابی پیشنهادی

1. در داشبورد `Fastify Overview` spike در latency یا error rate را پیدا کن.
2. route یا بازه زمانی مشکوک را جدا کن.
3. در `Tempo` trace مرتبط با همان بازه را پیدا کن (مثلا workflow `/work`).
4. از trace به logs برو (tracesToLogsV2) و خطا/context را ببین.
5. اصلاح کد یا تنظیمات را انجام بده و دوباره trendها را چک کن.

---

## 6) نکات مهم عملی

- داخل Docker، endpointهای observability باید با نام سرویس compose باشند (`tempo`, `loki`, `prometheus`)، نه `localhost`.
- برای ingestion لاگ در Loki، مقدار `LOKI_PUSH_URL` باید درست باشد.
- اگر dashboardها نیامدند، mountهای Grafana provisioning/dashboards را بررسی کن.
- اگر trace نمی‌آید، اول `OTEL_EXPORTER_OTLP_ENDPOINT` و سپس پورت `4318` را چک کن.
