## پینو اصلاً چی هست؟

پینو یه کتابخونهٔ لاگ‌گیری (Logging) برای **Node.js** هست. کارش اینه که پیام‌ها، خطاها و هر اطلاعاتی که برنامه‌ات نیاز داری ثبت کنی رو خیلی سریع و سبک ضبط می‌کنه.  
چرا میگیم سریع؟ چون پینو به‌جای اینکه خودش کلی کار اضافی بکنه، خروجی رو به صورت **JSON** (همون آبجکت‌های کلید-مقدار) تولید می‌کنه و عملیات سنگین (مثل فرمت‌کردن یا نوشتن توی فایل) رو میده دست یه ابزار دیگه (ترنسپورت یا prettifier). اینطوری برنامه‌ات کند نمیشه.  
خلاصه: یه لاگر JSON-محور و فوق‌العاده چابک که مخصوص پروژه‌های واقعی و پرداده طراحی شده.

---

## چرا پینو بهتر از بقیه‌است؟ (مقایسهٔ ساده)

- **سرعت**: تست‌ها نشون میدن پینو از `winston`, `bunyan` و حتی `console.log` توی لاگ‌های حجیم سریع‌تره.
- **ساختارمند بودن**: خروجی همیشه JSON تمیزه. لاگ‌ها توی Elasticsearch, Splunk, Loki و هر ابزار تحلیل لاگ خیلی راحت اندیس می‌شن.
- **سبکی**: خود کتابخونه کوچیکه و وابستگی خیلی کمی داره.
- **سادگی**: API اش خیلی ساده‌ست؛ شبیه به `console.log` کار می‌کنی ولی کلی امکانات بیشتر داری.

---

## قدم صفر: نصب

پروژهٔ Node.js ات رو باز کن و توی ترمینال بزن:

```bash
npm install pino
```

اگه برای محیط توسعه می‌خوای لاگ‌ها رو خوشگل ببینی، پینو-پرتی (pino-pretty) رو هم نصب کن:

```bash
npm install --save-dev pino-pretty
```

---

## قدم اول: اولین لاگ ما

ببین چقدر ساده‌ست:

```javascript
const pino = require("pino"); // یا import pino from 'pino' برای ESM

// یه نمونه از لاگر بساز
const logger = pino();

// حالا لاگ بگیر، عین console.log
logger.info("سلام دنیا!");
logger.warn("هشدار: فضای دیسک کمه.");
logger.error({ error: new Error("اوپس!") }, "یه خطای بزرگ افتاد.");
```

اگه همینجوری اجرا کنی، خروجی یه JSON شلوغ می‌بینی که شاید توی چشم آدمیزاد زشت باشه، ولی ماشین عاشقشه:

```json
{
  "level": 30,
  "time": 1715000000000,
  "pid": 1234,
  "hostname": "MyPC",
  "msg": "سلام دنیا!"
}
```

نگران نباش، بعداً خوشگلش می‌کنیم.

---

## قدم دوم: تنظیمات اولیه پینو (Options)

وقتی پینو رو می‌سازی ( pino(...) ) می‌تونی کلی چیز تنظیم کنی. مهم‌ترین‌هاش:

```javascript
const logger = pino({
  level: "debug", // حداقل سطح لاگ (info یه پیش‌فرضه)
  formatters: {
    // شکل خروجی رو شخصی‌سازی کن
    level(label) {
      return { level: label }; // به‌جای عدد، اسم level رو بذار
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime, // زمان ISO بذار
  redact: ["password", "token"], // امنیتی: این کلیدها تو لاگ پاک بشن
  base: { pid: false, hostname: false }, // خلاصه‌تر: pid و hostname چاپ نشه
  messageKey: "message", // اسم کلید پیام اصلی (پیش‌فرض msg)
});
```

اگه `level` رو بذاری `'debug'`، همهٔ لاگ‌های debug به بالا رو می‌گیری. ترتیب سطح‌ها از کمترین به بیشترین:  
`trace`, `debug`, `info`, `warn`, `error`, `fatal`

پس اگه سطح رو `warn` بذاری، دیگه `info` و `debug` ظاهر نمی‌شن.

---

## قدم سوم: لاگ‌گرفتن با سطح‌های مختلف

پینو برای هر سطح یه متد داره:

```javascript
logger.trace("این فقط برای دیباگ عمیقه");
logger.debug("اینم برای دیباگ معمولی");
logger.info("اطلاعات عادی");
logger.warn("اخطار");
logger.error("خطا");
logger.fatal("خطای کشنده، معمولاً برنامه می‌میره");
```

همهٔ این متدها دوتا شکل ورودی قبول می‌کنن:

1. **فقط یه پیام رشته‌ای** (مثل `console.log`)
2. **اول یه آبجکت (merge object)|، بعد پیغام**

شکل دوم خیلی قدرتمنده، چون می‌تونی کلی اطلاعات اضافی (Context) بدی که توی JSON می‌اد:

```javascript
logger.info({ user: "ali", orderId: 1234 }, "سفارش ایجاد شد");
// خروجی: {"level":"info","user":"ali","orderId":1234,"msg":"سفارش ایجاد شد"}
```

حتی می‌تونی خطا رو مستقیم بدی:

```javascript
try {
  // کار خطرناک
} catch (err) {
  logger.error({ err }, "مشکل در پردازش");
  // کل آبجکت err رو با stack trace ذخیره می‌کنه
}
```

---

## قدم چهارم: خوشگل کردن خروجی برای توسعه (pino-pretty)

همونطور که گفتم، JSON خام برای آدمیزاد زشته. برای محیط توسعه بیایم یه کم زیباش کنیم. دوتا راه داریم:

### روش ۱: مستقیم توی کد (برای تمرین و تست)

```javascript
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true, // رنگی
      translateTime: "HH:MM:ss", // زمان ساده
      ignore: "pid,hostname", // مخفی کردن pid و hostname
    },
  },
});
```

حالا خروجی‌ت اینجوری میشه:

```
[14:32:05] INFO: سلام دنیا!
[14:32:05] WARN: هشدار: فضای دیسک کمه.
```

### روش ۲: از طریق خط فرمان (بهترین روش برای توسعه)

کدت رو ساده نگه دار (همون `pino()` ساده)، بعد موقع اجرا:

```bash
node app.js | npx pino-pretty
```

یا توی `package.json` توی script بذار:

```json
"scripts": {
  "dev": "node app.js | pino-pretty"
}
```

اینطوری نسخهٔ پروداکشن همون JSON خالص رو می‌ده بدون افزودن pino-pretty به production dependencies.

---

## قدم پنجم: لاگرهای فرزند (Child Loggers)

این یکی از بهترین قابلیت‌های پینوئه. فرض کن یه وب سرور داری و هر درخواست id مخصوص خودشو داره. می‌خوای همهٔ لاگ‌هایی که توی پردازش اون درخواست ثبت می‌شن، یه `requestId` یکسان داشته باشن. میای یه فرزند از لاگر اصلی می‌گیری:

```javascript
function handleRequest(request) {
  const childLogger = logger.child({ requestId: request.id });
  childLogger.info("شروع پردازش درخواست");
  // ... بقیه کارها
  childLogger.warn("موجودی کمه!");
}
```

تمام لاگ‌های `childLogger` به طور خودکار `requestId` رو همراهش دارن، بدون اینکه هر بار بنویسی. فوق‌العاده برای ردیابی (Tracing) یک درخواست توی لاگ‌های پراکنده.

---

## قدم ششم: سریالایزرها (Serializers)

بعضی وقت‌ها نمی‌خوای کل آبجکت request یا response توی لاگ بیاد، چون خیلی بزرگه. پینو می‌تونه قبل از نوشتن، اونها رو خلاصه کنه:

```javascript
const logger = pino({
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        headers: { "user-agent": req.headers["user-agent"] },
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

// حالا هرجا لاگ کنی req یا res مستقیم، خودش خلاصه می‌شه
logger.info({ req, res }, "پاسخ ارسال شد");
```

پینو چندتا سریالایزر آماده هم داره ( `pino.stdSerializers` ) مخصوص `req`, `res`, `err` که خیلی مفیدن.

---

## قدم هفتم: فرستادن لاگ‌ها به فایل یا سرور (Transports)

پینو به‌تنهایی نمی‌نویسه توی فایل یا نمی‌فرسته به دیتابیس. برای این کار از **Transports** استفاده می‌کنیم. راه ساده‌اش `pino/file` یا `pino-roll` و ... است. اما یه الگوی انعطاف‌پذیر:

```bash
npm install pino-roll   # مثلاً برای چرخش فایل
```

توی کد:

```javascript
const logger = pino(
  pino.transport({
    targets: [
      {
        target: "pino/file",
        options: { destination: "./logs/app.log", mkdir: true },
      },
      { target: "pino-pretty", level: "debug" }, // هم‌زمان رو کنسول خوشگل
    ],
  }),
);
```

اینطوری هم توی فایل `app.log` JSON ذخیره می‌کنی، هم روی کنسول prettified می‌بینی. ترنسپورت‌ها می‌تونن لاگ رو به `pino-elasticsearch`، `pino-socket`، syslog و ... بفرستن. معمولاً تو پروداکشن خروجی JSON رو مستقیم به stdout می‌دی و ابزارهای کانتینری مثل Docker یا Logstash می‌گیرنش.

---

## قدم هشتم: محافظت از اطلاعات حساس (Redaction)

اگه احیاناً یه آبجکت با پسورد لاگ کنی، نمی‌خوای پسورد لو بره. پینو redact داره:

```javascript
const logger = pino({
  redact: {
    paths: ["password", "user.email"], // فیلدهای نوک‌تیک
    censor: "**حذف شد**", // جایگزین
  },
});

logger.info(
  { user: { name: "Ali", email: "a@b.com", password: "123456" } },
  "ورود",
);
// خروجی: "password":"**حذف شد**", "email":"**حذف شد**"
```

می‌تونی از wildcard مثل `*.password` برای پاکسازی تو در تو استفاده کنی.

---

## قدم نهم: لاگ‌گرفتن نقاط بحرانی (Benchmark & Production tips)

- **همیشه سطح مناسب انتخاب کن:** توی پروداکشن `level: 'info'` خوبه. موقع دیباگ موقتاً `debug`.
- **از console.log پرهیز کن:** تو پروژه‌های جدی همه‌جا پینو بذار.
- **لاگرو رو یکبار توی فایل جداگانه بساز و export کن:** تا همه جا یکسان استفاده بشه.
- **رشته‌های قالب‌بندی (`%s`, `%d`) نداریم:** مثل `winston` نیست. از merge object استفاده کن.

---

## یک جمع‌بندی خودمونی

پینو یه لاگر JSON سریع و مینیمال برای Node.js است که:

1. با `pino()` شروع می‌کنی.
2. با `logger.info(obj, message)` لاگ می‌گیری.
3. سطح لاگ رو با `level` کنترل می‌کنی.
4. برای توسعه `pino-pretty` رو پایپ می‌کنی.
5. برای ردیابی، child logger می‌سازی.
6. اطلاعات حساس رو redact می‌کنی.
7. برای پروداکشن خروجی رو مستقیم به stdout می‌دی و ابزارهای جمع‌آوری لاگ مثل Loki, ELK می‌گیرنش.
