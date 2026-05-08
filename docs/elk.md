## ELK چیه و به چه دردی می‌خوره؟

ELK مخفف سه تا ابزار معروف از شرکت Elastic هست:

- **Elasticsearch** (الاستیک‌سرچ): یه موتور جست‌وجوی خیلی سریع و مقیاس‌پذیر. لاگ‌ها رو مثل اسناد JSON ذخیره می‌کنه و بهت اجازه می‌ده با سرعت بالا توشون جست‌وجو کنی.
- **Logstash** (لاگستاش): یه لولهٔ انتقال و پردازش داده. ورودی می‌گیره (مثلاً از فایل لاگ، شبکه، HTTP)، فیلتر می‌کنه (مثلاً فرمت JSON رو درست می‌کنه) و می‌فرسته به Elasticsearch.
- **Kibana** (کیبانا): داشبورد گرافیکی. لاگ‌هات رو به صورت نمودار، جدول و نقشه نشون می‌ده، می‌تونی فیلتر بزنی و سیستم رو مانیتور کنی.

برای یه برنامه‌نویس Node.js، ELK یعنی دیگه نیازی نیست با `console.log` و `tail -f` تو سرور لاگ بگردی. همه لاگ‌ها رو می‌ریزی توی یه جای متمرکز، بعد کیبانا رو باز می‌کنی و هر چی بپرسی پیدا می‌کنی: «لاگ‌های سطح error دیشب بین ۸ تا ۱۰ شب» یا «درخواست‌هایی که به فلان API زده شده».

## چطوری کار می‌کنه؟ (ساده بگم)

برنامه Node.js تو لاگ تولید می‌کنه (مثلاً از winston یا pino). این لاگ می‌تونه مستقیم از طریق شبکه بفرسته به Logstash، یا توی فایل بریزه و Filebeat اون فایل رو بخونه و بفرسته به Logstash یا Elasticsearch. بعد Elasticsearch ذخیره شون می‌کنه و Kibana هم برای نمایش و جست‌وجو.

## راه‌اندازی ELK با داکر (ساده‌ترین روش)

بیا یه فایل `docker-compose.yml` درست کن که هر سه سرویس رو با هم بالا بیاره:

```yaml
version: "3.8"
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false # برای سادگی احرازهویت رو غیرفعال می‌کنیم
    ports:
      - "9200:9200"
    networks:
      - elk-net

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    ports:
      - "5000:5000/tcp" # برای دریافت لاگ از Node.js
      - "5000:5000/udp"
    depends_on:
      - elasticsearch
    networks:
      - elk-net

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    depends_on:
      - elasticsearch
    networks:
      - elk-net

networks:
  elk-net:
```

حالا یه فایل `logstash.conf` هم باید کنارش بسازی که بگیم لاگستاش چطور ورودی بگیره و به الاستیک بفرسته:

```
input {
  tcp {
    port => 5000
    codec => json_lines   # فرض می‌کنیم Node.js لاگ رو به صورت JSON خطی می‌فرسته
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "nodejs-logs-%{+YYYY.MM.dd}"
  }
  stdout { codec => rubydebug }  # برای دیباگ در کنسول لاگستاش
}
```

بعد با دو دستور همه رو بالا بیار:

```bash
docker-compose up -d
```

الاستیک‌سرچ روی پورت 9200، کیبانا روی 5601 و لاگستاش روی 5000 (TCP) کار می‌کنه.

## حالا نوبت برنامه Node.js هست

بیا با winston یه لاگر ساده بسازیم که لاگ‌های JSON رو از طریق TCP بفرسته به لاگستاش. اول winston رو نصب کن:

```bash
npm install winston winston-transport
```

یه فایل `logger.js` درست می‌کنیم:

```javascript
const winston = require("winston");
const net = require("net");

// یه ترنسپورت سفارشی برای ارسال به لاگستاش از طریق TCP
class LogstashTransport extends winston.Transport {
  constructor(opts) {
    super(opts);
    this.host = opts.host || "localhost";
    this.port = opts.port || 5000;
    this.client = new net.Socket();
  }

  log(info, callback) {
    setImmediate(() => this.emit("logged", info));
    const message = JSON.stringify(info) + "\n";
    const client = new net.Socket();
    client.connect(this.port, this.host, () => {
      client.write(message);
      client.destroy();
    });
    callback();
  }
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new LogstashTransport({ host: "localhost", port: 5000 }),
  ],
});

module.exports = logger;
```

حالا تو برنامه اصلی (مثلاً `app.js`):

```javascript
const logger = require("./logger");

logger.info("برنامه راه افتاد", { service: "api", version: "1.0" });
logger.error("خطا در اتصال به دیتابیس", {
  error: "timeout",
  query: "SELECT ...",
});

// شبیه‌سازی یه درخواست HTTP در اکسپرس
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  logger.info("درخواست دریافت شد", {
    method: req.method,
    url: req.url,
    ip: req.ip,
  });
  res.send("Hello World");
});

app.listen(3000, () => logger.info("سرور روی پورت 3000 روشن شد"));
```

هر بار که برنامه لاگ بزنه، یه JSON مثل این از طریق TCP به لاگستاش می‌ره:

```json
{
  "level": "info",
  "message": "برنامه راه افتاد",
  "service": "api",
  "version": "1.0",
  "timestamp": "2026-05-07T12:34:56.789Z"
}
```

لاگستاش میاد این رو می‌گیره، فیلتر خاصی روش انجام نمی‌ده (چون قبلاً JSON هست) و می‌فرسته به الاستیک‌سرچ توی ایندکسی به نام `nodejs-logs-2026.05.07`.

## نگاه کردن لاگ‌ها در کیبانا

حالا مرورگر رو باز کن و برو به `http://localhost:5601`. کیبانا ازت می‌خواد یه ایندکس پترن بسازی (Index Pattern). اسم ایندکسی که لاگستاش ایجاد می‌کنه رو وارد کن: `nodejs-logs-*` بعد روی Next بزن و timestamp رو به عنوان فیلد زمان انتخاب کن (اگه لاگ‌هات `@timestamp` دارن، وگرنه همون `timestamp` رو انتخاب کن). بعد Create index pattern.

حالا برو به بخش Discover. اونجا همه لاگ‌هات رو می‌بینی. می‌تونی فیلتر بزنی، جست‌وجو کنی، بر اساس سطح لاگ (info, error) گروه‌بندی کنی. مثلاً فیلد `level` رو بزن `error` تا فقط خطاها رو ببینی.

برای ساخت داشبورد هم می‌ری به Dashboard، یه ویجت (مثلاً Vertical Bar) اضافه می‌کنی، روی ایندکسی که تعریف کردی، فیلد `level` رو به عنوان buckets و count رو به عنوان metrics انتخاب می‌کنی تا تعداد لاگ‌های هر سطح رو به صورت نمودار ببینی.

## نکته مهم برای نود جی اس کارها

- **ساختار لاگ را JSON بزن**: اینجوری فیلتر کردن و جست‌وجو خیلی راحت‌تره. winston و pino هر دو از JSON پشتیبانی می‌کنن.
- **از فیلدهای استاندارد استفاده کن**: مثلاً `@timestamp`، `log.level`، `message`، `service.name`. بعداً با ECS (Elastic Common Schema) راحت‌تری.
- **لاگ‌های حساس را ننداز**: مثلاً توکن، رمز عبور، شماره کارت بانکی. اگه مجبوری، بزنشون تو فیلدهای جدا و قابلیت حذف خودکار در لاگستاش بذار.
- **حجم لاگ رو کنترل کن**: برای برنامه‌های پرمخاطب، مستقیم به لاگستاش نفرست، بزار لاگ رو توی فایل بنویسه و فایل‌بیت بخوندش. اینجوری فشار کمتری به برنامه میاد.
- **خطاهای برنامه رو حتماً بفرست**: در Express بهتره با یک middleware خطاها رو لاگ کنی و به ELK بفرسی.

```javascript
app.use((err, req, res, next) => {
  logger.error("خطای سرور", {
    error: err.message,
    stack: err.stack,
    url: req.url,
  });
  res.status(500).send("خطای داخلی");
});
```

## جایگزین ساده‌تر: استفاده از Elasticsearch transport مستقیم برای winston

می‌تونی از پکیج `winston-elasticsearch` استفاده کنی که مستقیم از Node.js به الاستیک سرچ متصل بشه و لاگستاش رو واسطه نکنه. برای پروژه‌های کوچک خوبه، ولی برای پروژه‌های حرفه‌ای لاگستاش یا فایل‌بیت توصیه می‌شه (چون بافر، فیلتر کردن و مدیریت خطا رو بهتر انجام می‌ده).

نصب:

```bash
npm install winston-elasticsearch
```

و استفاده:

```javascript
const ElasticsearchTransport = require("winston-elasticsearch");

const esTransport = new ElasticsearchTransport({
  level: "info",
  clientOpts: { node: "http://localhost:9200" },
  index: "nodejs-logs",
});
logger.add(esTransport);
```

## جمع‌بندی گام‌های عملی برای اجرا

1. داکر و داکر کامپوز رو نصب داشته باش.
2. فایل‌های `docker-compose.yml` و `logstash.conf` رو بساز.
3. `docker-compose up -d` بزن.
4. برنامه Node.js رو با logger که نوشتیم اجرا کن.
5. برو کیبانا، ایندکس پترن بساز، لاگ‌ها رو ببین.
6. برای تولید واقعی از فایل‌بیت هم استفاده کن (به جای TCP مستقیم) تا اگه لاگستاش از کار افتاد لاگ‌ها از دست نره.
