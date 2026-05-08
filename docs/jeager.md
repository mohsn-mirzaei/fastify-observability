## مشکل کجاست؟

فرض کن چند تا سرویس داری: یکی کاربر رو چک می‌کنه، یکی محصول، یکی سبد خرید. یه کاربر خطا می‌بینه ولی تو نمی‌دونی دقیقاً کدوم سرویس کند شده یا خراب شده. باهاشون‌چه کار می‌کنی؟ لاگ نگاه می‌کنی؟ سخته، چون درخواست از چند تا سرویس گذشته.

اینجا **ردیابی توزیع‌شده (Distributed Tracing)** به کارت میاد. یه درخواست رو مثل یه نخ دنبال می‌کنه از اول تا آخر. **Jaeger** یکی از معروف‌ترین ابزارهای این کاره.

## Jaeger چیه؟

یه ابزار متن‌باز که شرکت Uber ساخته. کارش اینه که بهت نشون بده یک درخواست (مثلاً GET /api/checkout) از کجا رد شده، هر مرحله چقدر طول کشیده، کجا خطا خورده. بعد یه UI قشنگ داره که می‌تونی ببینی.

## چند تا مفهوم ساده

- **Trace**: یعنی کل ماجرای یک درخواست. مثلاً از مرورگر تا چند سرویس و برگشت.
- **Span**: یه قدم از اون ماجرا. مثلاً دریافت اطلاعات کاربر از دیتابیس، یا فراخوانی یه API خارجی.
- **Context**: یه کد یا شناسه که همراه درخواست از سرویسی به سرویس دیگه می‌ره، تا همه بدونن این درخواست مربوط به همون trace هست.

## راه‌اندازی Jaeger برای تست (با Docker)

ساده‌ترین راه اینه که Jaeger رو با Docker اجرا کنی. توی ترمینال تایپ کن:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

بعد از اجرا، رابط کاربری Jaeger روی آدرس `http://localhost:16686` کار می‌کنه. همین حالا برو ببین خالیه، بعداً traceها رو نشون می‌ده.

## حالا بریم سراغ Node.js

فرض می‌کنم یه پروژه ساده Express داری. اول یه پوشه جدید بساز و初始化 کن:

```bash
mkdir jaeger-demo
cd jaeger-demo
npm init -y
npm install express @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/instrumentation-http @opentelemetry/instrumentation-express @opentelemetry/resources @opentelemetry/semantic-conventions
```

**توضیح کوتاه:**  
OpenTelemetry یه استاندارده که اطلاعات رو از برنامه جمع می‌کنه و به جاگر (یا هر جای دیگه) می‌فرسته. ما داریم ازش استفاده می‌کنیم.

## تنظیمات اولیه (فایل tracing.js)

یه فایل جدید به اسم `tracing.js` بساز و این رو توش بنویس:

```javascript
// tracing.js
const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const {
  ExpressInstrumentation,
} = require("@opentelemetry/instrumentation-express");
const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
const { Resource } = require("@opentelemetry/resources");
const {
  SEMRESATTRS_SERVICE_NAME,
} = require("@opentelemetry/semantic-conventions");

const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces", // آدرس جمع‌آوری Jaeger
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: "my-awesome-service", // اسم سرویس خودت
  }),
  traceExporter: exporter,
  instrumentations: [
    new HttpInstrumentation(), // برای رصد درخواست‌های HTTP خروجی
    new ExpressInstrumentation(), // برای رصد Express
  ],
});

sdk.start();
console.log("Tracing started");
```

## بریم یه اپ ساده بسازیم (فایل app.js)

```javascript
// app.js
const express = require("express");
const app = express();
const port = 3000;

// اول tracing رو راه بنداز
require("./tracing");

// یه تابع ساده که کار سنگین می‌کنه
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Endpoint اول: سلام
app.get("/hello", async (req, res) => {
  await delay(100); // شبیه کار واقعی
  res.json({ message: "Hello from Node.js!" });
});

// Endpoint دوم: که خودش به hello زنگ می‌زنه (برای نشون دادن tracing)
app.get("/call-hello", async (req, res) => {
  // اینجا می‌خوایم یه درخواست به /hello بزنیم. HttpInstrumentation خودکار یه span می‌سازه.
  const fetch = await import("node-fetch"); // اگه node-fetch نصب نیست: npm install node-fetch
  const response = await fetch.default(`http://localhost:${port}/hello`);
  const data = await response.json();
  res.json({ result: data, traceWorked: true });
});

app.listen(port, () => {
  console.log(`App running on http://localhost:${port}`);
});
```

نکته: `node-fetch` رو نصب کن:

```bash
npm install node-fetch
```

## اجرا کن

اول ترمینال اول: مطمئن شو جاگر داره اجرا می‌شه (دستور docker بالا).

ترمینال دوم: برنامه رو اجرا کن:

```bash
node app.js
```

بزن تو مرورگر:

- `http://localhost:3000/hello`
- `http://localhost:3000/call-hello`

حالا برو به رابط Jaeger: `http://localhost:16686`

توی قسمت **Service**، `my-awesome-service` رو انتخاب کن، بعد **Find Traces**. یه سری trace می‌بینی. یکی رو باز کن، می‌بینی که دو تا span داره: یکی کل درخواست به `/call-hello`، یکی درخواست داخلی به `/hello`. حتی می‌بینی هر کدوم چقدر طول کشیده.

## اگه بخوای خودت span دستی بسازی

گاهی می‌خوای یه قسمتی از کد رو خودت اندازه بگیری، بدون اینکه درخواست HTTP باشه. مثلاً کار با دیتابیس. اینجوری:

```javascript
const { trace } = require("@opentelemetry/api");

app.get("/manual-span", async (req, res) => {
  const tracer = trace.getTracer("my-tracer");
  const span = tracer.startSpan("doing-some-work");

  // کار واقعی...
  await delay(50);

  span.end();
  res.json({ done: true });
});
```

این span هم توی همون trace نشون داده می‌شه (چون context به طور خودکار منتقل می‌شه).

## چطور context رو بین سرویس‌ها بفرستم؟

برای اینکه یه درخواست از سرویس A به سرویس B بره و جاگر بفهمه که هر دو به هم ربط دارن، باید هدرهای خاصی رو همراه request بفرستی. اگه از `HttpInstrumentation` استفاده کنی، خودکار این کار رو می‌کنه. اما اگه می‌خوای دستی بفرستی، از `context` و `propagation` استفاده کن. تو مرحله پیشرفته‌تر لازم میشه.

## جمع‌بندی برای یه نودجی‌اس کار

1. **جاگر به درد پروژه‌های چندسرویسی یا معماری میکروسرویس می‌خوره.** برای یه اپ ساده شاید زیادی باشه.
2. **با Docker راحت راه میفته.** دستوری که دادم همه چی رو یجا داره (UI + collector).
3. **برای Node.js از OpenTelemetry استفاده کن** (ما از OTLP exporter استفاده کردیم که جدیدتر از Jaeger exporter قدیمیه).
4. **با نصب `HttpInstrumentation` و `ExpressInstrumentation` خیلی از کارها خودکار رصد می‌شه.**
5. **برای کد خودت، span دستی بساز** تا بتونی ببینی هر تابع چقدر زمان می‌بره.
6. **UI جاگر (`localhost:16686`) رو یادت باشه.** می‌تونی بر اساس service, operation, duration, tags فیلتر کنی و ببینی کدوم درخواست‌ها کند بودن یا خطا داشتن.

## اشتباهات رایج

- فراموش نکن `tracing.js` رو اول از همه `require` کنی، قبل از هر چیز دیگه‌ای.
- پورت‌ها رو درست ست کن (جاگر: 4318 برای OTLP HTTP، UI: 16686).
- اگه تو Docker Desktop هستی، شاید به جای localhost باید از host.docker.internal استفاده کنی، ولی برای همه چیز روی localhost خودت معمولاً خوب کار می‌کنه.
- برای خطاها: می‌تونی رو span یه `recordException` صدا بزنی و status خطا بذاری:

```javascript
try {
  // کاری که ممکنه خطا بده
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
}
```

## قدم بعدی

بعد از این که راحت شدی، می‌تونی:

- از **Sampler** استفاده کنی (مثلاً فقط ۱۰٪ درخواست‌ها رو ذخیره کن تا فشار کم بشه).
- جاگر رو با Elasticsearch یا Cassandra برای نگهداری طولانی‌مدت تنظیم کنی.
- با **Log correlation** کار کنی (یعنی traceId رو به لاگ‌هات اضافه کنی تا لاگ و trace رو به هم ربط بدی).
