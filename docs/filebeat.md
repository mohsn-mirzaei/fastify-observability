## 🧐 Filebeat چی هست و چرا به کارت میاد؟

فایل‌بیت (Filebeat) یکی از اعضای خانواده «بیت‌ها» (Beats) در پشته الاستیک (Elastic Stack) هست. یه **فورواردکننده سبک لاگ** هست که روی سرورهای مختلف نصب می‌شه و وظیفهش اینه که فایل‌های لاگ رو زیر نظر بگیره (مثل دستور `tail -f` لینوکس)، هر خط جدیدی که به فایل اضافه بشه رو بخونه و اون رو برای پردازش و ذخیره‌سازی بفرسته به سرورهای مقصد مثل Elasticsearch یا Logstash.

برای یه Node.js کار، این یعنی دیگه نگران جمع‌آوری و جابجایی حجم بالای لاگ‌ها نباشی. فایل‌بیت این کار رو خیلی بهینه و کم‌مصرف انجام میده. **مزیت بزرگش اینه که مصرف خیلی کمی از منابع سرور داره** (چون به زبان Go نوشته شده)، در مقایسه با Logstash که سنگین‌تر و مصرف منابعش بیشتره. معماری خوندن لاگ‌هاش طوری هست که تضمین می‌کنه هیچ لاگی از قلم نیافته باشه و در صورت بروز مشکل در ارتباط با سرور مقصد، لاگ‌ها رو روی دیسک ذخیره می‌کنه تا بعداً دوباره تلاش کنه و ارسالشون کنه.

تازه، فایل‌بیت خیلی منعطف هست. می‌تونه لاگ‌های ساده متنی، لاگ‌های JSON، و حتی از ماژول‌های آماده برای ابزارهایی مثل Nginx، MySQL و خیلی چیزای دیگه لاگ جمع‌کنه. خلاصه که اگر به دنبال یه راه‌حل سبک، قابل اعتماد و استاندارد برای مدیریت لاگ هستی، Filebeat انتخابی عالیه.

## 📋 قدم صفر: چیزایی که قبل از شروع لازم داری

قبل از اینکه دست به کار بشی، مطمئن شو این موارد رو داری:

1.  **Node.js**: (نسخه LTS یا بالاتر) برای اجرای سرور نمونه‌هامون.
2.  **Filebeat**: (آخرین نسخه، ترجیحاً 8.x) که از سایت رسمی Elastic دانلود می‌کنی.
3.  **یک دپلوی Elastic Cloud** (یا یه Elasticsearch و Kibana محلی): برای دریافت لاگ‌ها و دیدن آن‌ها.
4.  **آشنایی اولیه با خط فرمان**: برای نصب و اجرای دستورات.

## 📦 قدم اول: نصب Filebeat مثل آب خوردن

اول از همه باید بریم سراغ نصب ابزاری که قراره لاگ‌ها رو برامون جمع کنه. فرایند نصب بسته به سیستم عاملت (مثلاً اوبونتو یا مک) کمی فرق می‌کنه ولی اصلاً سختی نداره. فقط کافیه دستورای مناسب رو توی ترمینالت وارد کنی.

برای نصب روی **اوبونتو و دبیان**، باید ریپازیتوری Elastic رو به سیستم اضافه کنیم و بعد با `apt` نصبش کنیم. روی **مک** با `brew` و روی **ویندوز** با دابل کلیک روی فایل نصب، کار راحته. اگه همه‌چیز درست پیش بره، با دستور `filebeat version` می‌تونی ببینی که Filebeat نسخه 8.x روی سیستمت نصب شده.

## ⚙️ قدم دوم: پیکربندی Filebeat (فوت کوزه‌گری!)

قسمت اصلی ماجرا اینجاست. فایل تنظیمات فایل‌بیت معمولاً توی مسیر `filebeat.yml` قرار داره. این فایل رو با یه ویرایشگر معمولی باز کن.

### 1. تعریف ورودی با `filestream` (بهترین روش)

دیگه `input-type: log` قدیمی شده و الان بهترین روش استفاده از `filestream` هست. کافیه این بخش رو توی فایل `filebeat.yml` تعریف کنی:

```yaml
filebeat.inputs:
  - type: filestream # <1>
    id: my-nodejs-app # یه شناسه یکتا برای این ورودی
    enabled: true
    paths:
      - /path/to/your/node-app/logs/*.log # <2> آدرس فایل‌های لاگ برنامه
    parsers:
      - ndjson: # <3> چون قراره لاگ‌هامون JSON هست
          overwrite_keys: true # کلیدهای فایل‌بیت رو با کلیدهای JSON لاگ بازنویسی کن
          add_error_key: true # اگه خطایی تو خوندن JSON بود، یه کلید خطا اضافه کن
          expand_keys: true # کلیدهای نقطه‌دار رو به ساختار تو در تو تبدیل کن
    fields:
      service.name: my-nodejs-api # <4> نام سرویست
      service.version: 1.0.0 # ورژن سرویس
      service.environment: production # محیط: production, staging, ...
    fields_under_root: true
    processors: # <5>
      - add_host_metadata: ~
      - add_cloud_metadata: ~
```

1.  `filestream`\*\*: آخرین و بهترین روش برای خوندن خط به خط فایل‌های لاگ پویاست.
2.  `paths`\*_: به Filebeat می‌گه دنبال کدوم فایل‌ها بگرده. می‌تونی از `_` استفاده کنی.
3.  `parsers - ndjson`\*\*: به Filebeat می‌گه خطوط لاگ، فرمت JSON دارن و باید parse بشن. اگه برنامه‌ت لاگ خطی ساده مینویسه، این بخش رو پاک کن.
4.  `fields`\*\*: متادیتا یا فراداده‌هایی رو به هر لاگ اضافه می‌کنه که توی Kibana بتونی بر اساس اون‌ها فیلتر کنی.
5.  `processors`\*\*: اطلاعاتی مثل مشخصات هاست و کلاود رو اضافه می‌کنه که خیلی به کارت میاد.

### 2. تنظیم خروجی برای Elasticsearch

بعد از اینکه لاگ‌ها خوندن، باید مشخص کنی کجا فرستاده بشن. خروجی رو معمولاً روی Elasticsearch تنظیم می‌کنیم:

```yaml
output.elasticsearch:
  hosts: ["https://your-elasticsearch-host:9200"] # آدرس خوشه الاستیک‌سرچ
  username: "elastic" # نام کاربری
  password: "your-password" # رمز عبور
  ssl.enabled: true
  ssl.verification_mode: certificate
```

### 3. یا شاید خروجی رو روی Logstash بذاری؟

بعضی وقتا قبل از ذخیره لاگ توی Elasticsearch، باید پردازش‌های پیچیده‌تری روش انجام بدی. مثلاً فیلدهای جدید بسازی یا لاگ رو غنی کنی. اون موقع Logstash به کار میاد. اگه خواستی اینطوری باشه، خروجی فایل بیت شبیه این میشه:

```yaml
output.logstash:
  hosts: ["your-logstash-host:5044"]
  ssl.enabled: true
  ssl.verification_mode: certificate
```

خب! دیگه با مفاهیم اصلی و پیکربندی فایل‌بیت آشنا شدی. از این به بعد می‌تونیم یه کم عملی‌تر بشیم و ببینیم چطور می‌شه ازش برای یه برنامه واقعی Node.js استفاده کرد.

## 🚀 کار عملی: یه سرور نمونه Node.js بساز و لاگ بفرست

حالا بیا یه مثال عملی بزنیم تا همه چی دستمون بیاد. این سناریو رو بهت پیشنهاد می‌دم: فرض کن یه فروشگاه اینترنتی می‌سازی و می‌خوای ببینید توی Black Friday سرور چطور کار می‌کنه.

### 1. آماده کردن برنامه Node.js

اول بیا یه پوشه جدید بساز و برو توش:

```bash
mkdir my-logging-app
cd my-logging-app
npm init -y
```

حالا پکیج‌های مورد نیاز رو نصب کن:

```bash
npm install winston @elastic/ecs-winston-format got
```

- **winston**: یه کتابخونه قدرتمند برای لاگ‌گیری تو Node.js.
- **@elastic/ecs-winston-format**: فرمت کننده‌ای که لاگ‌های ما رو به فرمت استاندارد ECS تبدیل می‌کنه.
- **got**: برای فراخوانی HTTP.

حالا فایل `server.js` رو بساز و کد زیر رو توش کپی کن:

```javascript
const winston = require("winston");
const ecsFormat = require("@elastic/ecs-winston-format");

// تنظیم logger با فرمت ECS
const logger = winston.createLogger({
  level: "info",
  format: ecsFormat(), // استفاده از فرمت استاندارد الاستیک
  transports: [
    new winston.transports.File({ filename: "logs/app.log" }), // نوشتن لاگ در فایل
  ],
});

const http = require("http");
const port = 3000;

const requestListener = function (req, res) {
  // لاگ زدن هر درخواست دریافتی
  logger.info(`درخواست جدید به ${req.url}`, {
    http: {
      request: { method: req.method, url: req.url },
    },
  });

  if (req.url === "/") {
    res.writeHead(200);
    res.end("سلام! لاگت توی فایل ذخیره شد!");
    logger.info("پاسخ ۲۰۰ به کاربر فرستاده شد");
  } else {
    res.writeHead(404);
    res.end("پیداش نکردم!");
    logger.warn("درخواست به مسیر نامعتبر", {
      http: {
        request: { url: req.url },
      },
    });
  }
};

const server = http.createServer(requestListener);
server.listen(port, () => {
  logger.info(`سرور با موفقیت روی پورت ${port} روشن شد`);
  console.log(`Server is running on http://localhost:${port}`);
});
```

قبل از اجرا، یه پوشه لاگ بساز:

```bash
mkdir logs
```

حالا سرور رو راهنداز:

```bash
node server.js
```

حالا اگه بری تو یه ترمینال دیگه و requests بزنی (`curl http://localhost:3000`)، لاگ‌ها توی فایل `logs/app.log` با فرمت JSON نوشته میشن.

### 2. پیکربندی Filebeat برای خوندن لاگ‌ها

فرض کن فایل `app.log` که توی پوشه پروژه‌ت هست، پر از لاگ‌های JSON هست. حالا بریم سراغ فایل‌بیت و بهش بگیم بیاد این لاگ‌ها رو بخونه و بفرسته به Elasticsearch. فایل `filebeat.yml` رو باز کن و این تنظیمات رو جایگزین کن (حتماً مسیر فایل لاگ رو با مسیر واقعی عوض کن):

```yaml
filebeat.inputs:
  - type: filestream
    id: my-nodejs-app
    enabled: true
    paths:
      - /home/user/my-logging-app/logs/*.log # مسیر درست رو اینجا بذار!

    parsers:
      - ndjson:
          overwrite_keys: true
          add_error_key: true
          expand_keys: true

    fields:
      service.name: "nodejs-store"
      service.version: "1.0.0"
      service.environment: "development"

    fields_under_root: true

output.elasticsearch:
  hosts: ["https://your-cluster.es.europe-west1.gcp.cloud.es.io:9243"]
  username: "elastic"
  password: "your-elastic-password"

setup.kibana:
  host: "https://your-kibana-host:9243"
  username: "elastic"
  password: "your-elastic-password"

# برای جمع آوری متادیتا
processors:
  - add_host_metadata:
      netinfo.enabled: true
  - add_cloud_metadata: ~
```

### 3. اجرا و تست همه سیستم

حالا که همه چیز رو تنظیم کردیم، وقتشه که فایل‌بیت رو روشن کنیم و ببینیم چطور کار می‌کنه.

فایل‌بیت رو با استفاده از دستور زیر تست کن تا مطمئن بشی تنظیماتت درسته:

```bash
filebeat test config
```

حالا زمان اجرای فایل‌بیت رسیده. می‌تونی با دستور زیر به عنوان یه سرویس اجراش کنی:

```bash
sudo service filebeat start
# یا برای اجرای مستقیم و دیدن لاگ های لحظه ای
filebeat -e
```

بعد از اجرا، حالا هر بار به سرور Node.js درخواست بدی، لاگش توی فایل نوشته میشه، فایل‌بیت میبینه و فوراً میفرسته به الاستیک‌سرچ. برو توی Kibana و یه ایندکس پترن برای `filebeat-*` بساز تا لاگ‌هات رو ببینی!

## 🛠️ رفع اشکال: چطور بفهمم فایل‌بیت داره درست کار می‌کنه؟

اگه لاگ‌هات توی الاستیک‌سرچ دیده نمیشن، نگران نباش! این راهنما بهت کمک می‌کنه مشکل رو پیدا کنی:

1.  **بررسی کانفیگ**: با دستور `filebeat test config` ببین فایل `filebeat.yml` خطای نحوی داره یا نه.
2.  **بررسی اتصال به خروجی**: دستور زیر تست می‌کنه که فایل‌بیت می‌تونه به Elasticsearch یا Logstash متصل بشه یا نه:
    ```bash
    filebeat test output
    ```
3.  **بررسی دسترسی فایل لاگ**: مطمئن شو فایل‌بیت دسترسی خوندن روی فایل‌های لاگ رو داره. اگه فایل مال کاربر دیگه‌ایه، ممکنه مشکل دسترسی داشته باشی.
4.  **فعال کردن دیباگینگ**: برای عیب‌یابی دقیق، فایل‌بیت رو با سطح دیباگ اجرا کن: `filebeat -e -d "*"`.
5.  **بررسی فرمت لاگ**: مطمئن شو لاگ‌هات valid JSON هست و مشکلی تو pars کردنش پیش نمیاد. از ابزارهایی مثل `jq` می‌تونی برای تست استفاده کنی.
