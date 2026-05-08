## ۱. OpenTelemetry اصلاً چیه و چرا لازمش داریم؟

تصور کن یه برنامهٔ Node.js داری که کلی سرویس توش با هم حرف می‌زنن (مثلاً Express API، دیتابیس، صف پیام و …). وقتی یه درخواست از کاربر میاد، از چندین بخش مختلف عبور می‌کنه. اگر کند بشه، چطوری بفهمی مشکل دقیقاً کجاست؟ یا اگر خطایی رخ بده، چطوری مسیر کامل درخواست رو دنبال کنی؟

اینجا **OpenTelemetry** (مخفف OTel) به دادمون می‌رسه. یه ابزار استاندارد و اوپن‌سورس که سه کار اصلی انجام میده:

- **Tracing** (ردیابی): مسیر یه درخواست رو از ابتدا تا انتها با تمام پرش‌هاش بین سرویس‌ها نشون میده.
- **Metrics** (معیارها): عدد و رقم‌هایی مثل تعداد درخواست‌ها، زمان پاسخ، مصرف مموری و … جمع‌آوری می‌کنه.
- **Logging** (ثبت رویداد): لاگ‌ها رو به‌صورت ساختاریافته به Traceها وصل می‌کنه.

امروز تمرکزمون روی **Tracing** هست، چون گلوگاه اصلی برای فهمیدن رفتار سیستمه. آخرش هم یه اشارهٔ کوچیک به Metrics و Logs می‌کنیم.

---

## ۲. مفاهیم مامان‌بابایی (ولی مهم!)

قبل از کد زدن، چندتا واژه رو خیلی ساده تعریف کنیم:

- **Trace**: یه سفر کامل یه درخواست از لحظهٔ ورود تا خروج. مثل یه رشته مروارید که از دونه‌های ریزتر درست شده.
- **Span**: هر دونه از اون مرواریدها. یه Span یعنی «یه واحد کار مشخص» (مثلاً رسیدگی به یه درخواست HTTP، یه کوئری به دیتابیس، صدا زدن یه API بیرونی). Span می‌تونه Spanهای بچه (Child) داشته باشه.
- **Context**: یه شیء نامرئی که توی برنامه می‌چرخه و می‌گه «الان در کدوم Trace و کدوم Span هستیم». اجازه میده Spanها به هم وصل بشن.
- **Attributes**: یه سری کلید-مقدار که روی Span سوار می‌کنیم (مثلاً `http.method: GET`، `user.id: 123`).
- **Events**: یه نقطهٔ زمانی خاص داخل Span که یه چیزی رو ثبت می‌کنیم (مثلاً «کوئری شروع شد»).

حالا بریم سراغ عمل.

---

## ۳. پروژهٔ نمونه و نصب پکیج‌ها

یه پروژهٔ Node.js ساده با Express می‌سازیم. اگر نداری، یه پوشه بساز و داخلش `npm init -y` بزن. بعد پکیج‌های زیر رو نصب کن:

```bash
npm install express
npm install @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/instrumentation-http @opentelemetry/instrumentation-express
npm install @opentelemetry/exporter-trace-otlp-http
```

اگه گفتی اینا چی هستن:

- `@opentelemetry/api`: اینترفیس استاندارد OTel که کدت باهاش حرف می‌زنه (مثل `trace.getTracer`).
- `@opentelemetry/sdk-trace-node`: پیاده‌سازی واقعی برای Node.js که کار جمع‌آوری و پردازش Spanها رو انجام میده.
- `@opentelemetry/instrumentation-http` و `instrumentation-express`: میان به‌طور خودکار ماژول‌های `http` و `express` رو رصد می‌کنن و بدون اینکه دست به کد Express بزنی، Span می‌سازن.
- `@opentelemetry/exporter-trace-otlp-http`: صادرکننده‌ای که Traceها رو با پروتکل OTLP (پروتکل استاندارد OTel) به یه بک‌اند مثل Jaeger یا Collector می‌فرسته. (بعداً استفاده می‌کنیم).

---

## ۴. اضافه کردن OpenTelemetry به برنامه (ردیابی خودکار)

فایل `app.js` رو با محتوای زیر بساز:

```javascript
const express = require("express");
const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.send("سلام دنیا!");
});

app.get("/user/:id", (req, res) => {
  // اینجا یه کمی کار واقعی فرض می‌کنیم
  const userId = req.params.id;
  // فرضاً یه کوئری دیتابیس
  setTimeout(() => {
    res.json({ id: userId, name: "Ali" });
  }, 100);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
```

فعلاً هیچ اثری از OTel نیست. حالا یه فایل جداگانه به اسم `tracing.js` می‌سازیم که فقط وظیفهٔ راه‌اندازی OTel رو داره:

```javascript
// tracing.js
const opentelemetry = require("@opentelemetry/sdk-trace-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const { ConsoleSpanExporter } = require("@opentelemetry/sdk-trace-base");
const { Resource } = require("@opentelemetry/resources");
const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");

// 1. یک صادرکنندهٔ ساده به کنسول (برای تست)
const consoleExporter = new ConsoleSpanExporter();

// 2. تنظیم Resource (مشخصات سرویس ما)
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: "my-nodejs-service",
  [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
});

// 3. ساختن و راه‌اندازی SDK
const sdk = new opentelemetry.NodeSDK({
  resource: resource,
  traceExporter: consoleExporter, // صادر کردن Traceها به کنسول
  instrumentations: [getNodeAutoInstrumentations()], // رصد خودکار HTTP، Express و ...
});

sdk.start(); // اوپن‌تله‌متری فعال!
```

حالا **مهم‌ترین نکته**: فایل `tracing.js` باید **قبل از هر چیز دیگری** در برنامه لود بشه. پس `app.js` رو اینطوری تغییر بده:

```javascript
// خیلی خیلی بالا، قبل از همه requireها
require("./tracing");

const express = require("express");
// ... بقیه کدها (همان که نوشتیم)
```

برنامه رو اجرا کن: `node app.js` و بعد با مرورگر یا curl به آدرس `http://localhost:3000/user/42` درخواست بده. توی کنسول یه چیز شبیه این می‌بینی (خلاصه‌شده):

```
{
  traceId: '...',
  parentSpanId: undefined,
  name: 'GET /user/:id',
  kind: 1,
  attributes: { http.method: 'GET', http.target: '/user/42', ... },
  status: { code: 0 },
  ...
}
{
  traceId: '...',
  parentSpanId: 'همون span id قبلی',
  name: 'middleware - query',
  ...
}
```

**چه اتفاقی افتاد؟** کد Express ما بدون اینکه دستی کاری کنیم، خودکار Instrument شد. متد `getNodeAutoInstrumentations()` کلی کتابخونه‌ی محبوب رو ساپورت می‌کنه و براشون Span تولید می‌کنه.

---

## ۵. فرستادن Traceها به Jaeger (برای دیدن گرافیکی)

چاپ توی کنسول خوبه ولی حوصله‌سربره. می‌خوایم Traceها رو توی **Jaeger** ببینیم که یه UI قشنگ و جستجو داره. اول Jaeger رو با Docker بالا بیار:

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

- پورت `16686` رابط کاربری Jaeger.
- پورت `4318` دریافت‌کنندهٔ OTLP/HTTP (همون پروتکلی که Exporter باهاش صحبت می‌کنه).

حالا `tracing.js` رو عوض می‌کنیم تا به‌جای کنسول، Traceها رو به Jaeger بفرسته:

```javascript
const opentelemetry = require("@opentelemetry/sdk-trace-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { Resource } = require("@opentelemetry/resources");
const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");

// exporter جدید به جای ConsoleSpanExporter
const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces", // آدرس پیش‌فرض Jaeger برای OTLP
});

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: "my-nodejs-service",
  [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
});

const sdk = new opentelemetry.NodeSDK({
  resource,
  traceExporter: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

باز برنامه رو اجرا کن و چندتا درخواست به آدرس‌های مختلف بزن. بعد برو به `http://localhost:16686`. سرویس `my-nodejs-service` رو انتخاب کن و دکمهٔ Find Traces رو بزن. Traceها رو می‌بینی! روی هرکدوم کلیک کن، Spanها رو با زمانشون و رابطهٔ والد-فرزندی می‌بینی.

---

## ۶. اینسترومنتیشن دستی: Spanهای سفارشی خودمون

تا اینجا فقط چیزایی که کتابخونه‌های آماده پوشش دادن رو دیدیم. اما داخل منطق کسب‌و‌کار خودمون هم دلمون می‌خواد Span بسازیم. مثلاً وقتی یه کاربر رو از دیتابیس می‌خونیم یا یه فایل رو پردازش می‌کنیم.

کد `app.js` رو اینطوری تغییر بده (بخش کاربر):

```javascript
const { trace } = require("@opentelemetry/api");
const express = require("express");
const app = express();
const port = 3000;

// گرفتن یک Tracer با اسم مشخص (می‌تونه اسم ماژول باشه)
const tracer = trace.getTracer("user-service");

app.get("/user/:id", async (req, res) => {
  const userId = req.params.id;

  // شروع یک Span جدید به عنوان فرزند Span جاری (که Express خودکار ساخته)
  const span = tracer.startSpan("fetch-user-from-db");
  // اضافه کردن Attribute
  span.setAttribute("user.id", userId);

  try {
    // شبیه‌سازی کوئری دیتابیس
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        // می‌تونیم رویداد ثبت کنیم
        span.addEvent("query-executed", { "db.row_count": 1 });
        resolve();
      }, 100);
    });

    res.json({ id: userId, name: "Ali" });
  } catch (error) {
    span.setStatus({ code: 2, message: error.message }); // کد 2 یعنی خطا
    span.recordException(error);
    res.status(500).send("Internal error");
  } finally {
    span.end(); // حتماً Span رو پایان بده
  }
});

// ... بقیه
```

نکته‌ها:

- `tracer.startSpan('fetch-user-from-db')` یک Span فرزند می‌سازد که پدرش همان Span ورودی Express است (OpenTelemetry Context رو خودکار از Async Local Storage می‌خواند).
- `span.setAttribute` کلید-مقدار اضافه می‌کنه.
- `span.addEvent` برای ثبت یک رویداد در یک لحظهٔ خاص (مثل لاگ سبک).
- `span.setStatus` وضعیت Span رو مشخص می‌کنه (کد 0 یعنی موفق، 2 یعنی خطا).
- حواست باشه حتماً `span.end()` صدا زده بشه، حتی اگر خطا بیفته.

حالا Trace رو توی Jaeger نگاه کن: زیر Span اصلی GET /user/:id یه Span فرزند به اسم `fetch-user-from-db` می‌بینی با attributes خودش.

---

## ۷. پوشش متریک‌ها و لاگ‌ها (سریع ولی مفید)

### ۷.۱. متریک‌ها (Metrics)

OpenTelemetry می‌تونه خودکار متریک‌هایی مثل `http.server.duration` (مدت‌زمان درخواست‌های HTTP) جمع کنه. برای شروع، فقط کافیه چندتا پکیج نصب کنی:

```bash
npm install @opentelemetry/sdk-metrics @opentelemetry/exporter-prometheus
```

و در `tracing.js` (در واقع بهتره یک فایل `instrumentation.js` بسازی) متریک‌ها رو هم راه بندازی:

```javascript
const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");

// Prometheus exporter که خودش یک سرور HTTP روی پورت 9464 بالا میاره
const prometheusExporter = new PrometheusExporter({ port: 9464 });
const meterProvider = new MeterProvider();
meterProvider.addMetricReader(prometheusExporter);
```

بعد در `NodeSDK` می‌تونی `meterProvider` رو ست کنی. اما فعلاً آشنایی کلی داشته باش که داستان از چه قراره. متریک‌ها به صورت خودکار توسط Instrumentationها جمع می‌شن و می‌تونی با Prometheus و Grafana نمایششون بدی.

### ۷.۲. لاگ‌ها (Logging)

هدف OTel اینه که لاگ‌ها رو به Traceها متصل کنه. ساده‌ترین راه: از کتابخونهٔ لاگ مورد علاقه‌ات (مثل Pino یا Winston) استفاده کن و Trace ID و Span ID رو توی لاگ‌ها بذار:

```javascript
const { trace } = require("@opentelemetry/api");

function logWithTrace(message) {
  const currentSpan = trace.getSpan(trace.getActiveContext());
  const traceId = currentSpan?.spanContext().traceId;
  const spanId = currentSpan?.spanContext().spanId;
  console.log(JSON.stringify({ traceId, spanId, message }));
}
```

بعداً توی سیستم لاگ جمع‌آوری می‌تونی لاگ‌ها رو کنار Traceها ببینی. وینستون و پینو هم middlewareهایی دارن که این کار رو خودکار انجام میدن.

---

## ۸. خلاصهٔ مسیر پیشنهادی برای یه پروژهٔ واقعی

1. **فایل راه‌اندازی OTel** رو قبل از همهٔ `require`ها لود کن.
2. از `getNodeAutoInstrumentations()` استفاده کن تا HTTP، Express، دیتابیس‌ها (با نصب instrumentation مخصوص) و … خودکار ردیابی بشن.
3. یک exporter به بک‌اند واقعی (Jaeger، Zipkin، یا OpenTelemetry Collector) وصل کن. برای محیط توسعه همون Jaeger با Docker عالیه.
4. هر جایی که منطق اختصاصی داری، Span دستی بزن با `tracer.startSpan`.
5. اونجایی که خروجی می‌گیری، صفات معنادار (user.id، order.id، …) ست کن تا توی جستجو به کار بیان.
6. اگر کندی دیدی، Trace رو باز می‌کنی و زمان هر Span رو نگاه می‌کنی تا گلوگاه پیدا بشه.

---

## ۹. چند تا نکتهٔ خودمونی

- **لازم نیست تمام کد رو با OTel پر کنی**. کتابخونه‌های خودکار خیلی از چیزا رو پوشش میدن. فقط جاهای حساس رو خودت Span بذار.
- **همیشه `span.end()`**. فرقی نمی‌کنه خطا بیاد یا نه. بهترین کار `try/finally` هست.
- **Context خودکار منتقل می‌شه**. لازم نیست manual context propagation انجام بدی، مگر اینکه از صف‌های پیام یا تایمرهای دستی استفاده کنی که async local storage گم بشه. (باز هم OTel راه حل داره.)
- **از Collector استفاده کن**. در محیط Production، به جای اینکه مستقیم Traceها رو از Node.js به Jaeger بفرستی، یک OpenTelemetry Collector می‌ذاری وسط. کارش جمع‌آوری، فیلتر، نمونه‌برداری و ارسال به بک‌اندهای مختلفه. (الان بدون هم راه می‌افته.)
