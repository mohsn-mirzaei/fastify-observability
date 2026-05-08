### Kibana اصلاً چیه و به چه درد ما می‌خوره؟

Kibana یه رابط کاربری تحت وبه که روی **Elasticsearch** سوار میشه. Elasticsearch هم یه دیتابیس مخصوص جست‌وجو و ذخیره‌ی سریع داده‌های حجیم (مثل لاگ و متریک) هست.  
برای ما Node.js کارها، Kibana حکم یه **داشبورد زنده** رو داره که توش می‌تونیم:

- لاگ‌های اپمون رو سرچ کنیم (مثلاً خطای `EADDRINUSE` رو پیدا کنیم).
- ببینیم چندتا ریکوئست `500` دادیم تو ۱۰ دقیقه‌ی اخیر.
- مصرف CPU و مموری سرویس‌هامون رو مانیتور کنیم (با APM).
- حتی روی خطاها آلرت تنظیم کنیم که اگر تعداد ارورها زیاد شد، نوتیف بگیریم.

در واقع Node.js داده تولید می‌کنه، Elasticsearch اونو ذخیره می‌کنه، و Kibana بهمون اجازه میده این داده‌ها رو زیر و رو کنیم و نمودار بکشیم.

---

### ۱. راه‌اندازی Elasticsearch و Kibana (خیلی سریع با Docker)

برای شروع یاد گرفتن، راحت‌ترین راه استفاده از Docker Compose هست. یه فایل `docker-compose.yml` بساز:

```yaml
version: "3.8"
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    container_name: elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false # برای تست، امنیت رو غیرفعال می‌کنیم
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    networks:
      - elk

  kibana:
    image: docker.elastic.co/kibana/kibana:8.12.0
    container_name: kibana
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch
    networks:
      - elk

networks:
  elk:
    driver: bridge
```

بعد با دستور `docker-compose up -d` هر دو سرویس بالا میان. Kibana روی `http://localhost:5601` در دسترسه. بازش کنی یه صفحه خوشگل می‌بینی. (اگر پسورد نخواست، چون امنیت رو disabled کردیم).

---

### ۲. مفاهیم خیلی ضروری که باید بدونی

قبل از اینکه بریم داخل Kibana، باید چندتا اصطلاح رو بفهمی تا گیج نشی:

- **Index (اندیس)**: مثل یک دیتابیس یا جدول توی MySQL. ما لاگ‌هامون رو معمولاً توی Indexهایی مثل `logs-2025.01.15` یا `app-logs` می‌ریزیم. هر روز می‌تونه یه Index جدا داشته باشه (بهش می‌گن time-based indices).
- **Document (سند)**: هر ردیف داده‌ست، مثلاً یه لاگ که JSON هست: `{"level": "error", "message": "failed to connect", "timestamp": ...}`. Elasticsearch همه چیز رو به صورت JSON ذخیره می‌کنه.
- **Shard & Replica**: برای توزیع داده روی چند سرور و backup. الان مهم نیست، بدون که Elasticsearch داده‌ها رو تیکه‌تیکه می‌کنه تا سریع سرچ کنه.
- **Kibana Data View (Pattern Index سابق)**: یعنی به Kibana بگی کدوم Indexها رو می‌خوای ببینی. مثلاً الگوی `logs-*` یعنی همه‌ی Indexهایی که با `logs-` شروع می‌شن.

---

### ۳. وارد Kibana که شدیم — اولین کار: تعریف Data View

تا وقتی به Kibana نگیم داده‌ها کجان، چیز خاصی نمی‌بینیم. پس باید یه Data View بسازیم. بریم از منوی سمت چپ:

**Stack Management → Data Views → Create data view**

- **Index pattern**: مثلاً بنویس `logs-*` اگر قراره لاگ‌های اپت رو با Indexهایی مثل `logs-2025.01.15` بفرستی.
- **Timestamp field**: انتخاب کن `@timestamp` یا `timestamp` (بستگی داره وقتی داده می‌فرستی چه فیلدی برای زمان در نظر گرفتی). این مهمه که Kibana بتونه نمودارهای زمانی بکشه.
- Create رو بزن.

حالا Kibana میدونه کجا رو نگاه کنه.

---

### ۴. فرستادن داده از Node.js به Elasticsearch

قبل از اینکه داشبورد بزنیم، نیاز به داده داریم. بیا یه روت ساده رو تصور کن که لاگ‌های JSON تولید کنه. ما با package رسمی `@elastic/elasticsearch` مستقیم به Elasticsearch داکیومنت می‌فرستیم. (راه‌های دیگه مثل Filebeat یا Winston رو آخرتر می‌گم.)

**نصب پکیج:**

```bash
npm install @elastic/elasticsearch
```

**کد نمونه (فایل logger.js یا توی اپ Express):**

```javascript
const { Client } = require("@elastic/elasticsearch");

const esClient = new Client({
  node: "http://localhost:9200", // آدرس Elasticsearch
});

async function logToElastic(level, message, meta = {}) {
  try {
    await esClient.index({
      index: "app-logs", // اسم Index
      document: {
        level, // مثلاً "error", "warn", "info"
        message,
        meta,
        timestamp: new Date().toISOString(),
        service: "my-node-api", // اسم سرویس برای فیلتر بعدی
      },
    });
  } catch (err) {
    console.error("Elasticsearch logging failed", err);
  }
}

// استفاده نمونه توی مسیر Express:
app.get("/", (req, res) => {
  logToElastic("info", "home page visited", { ip: req.ip });
  res.send("Hello");
});

app.get("/error", (req, res) => {
  logToElastic("error", "intentional crash", { stack: "fake error" });
  res.status(500).send("Error");
});
```

با این کار، هر درخواستی که به اپلیکیشن بیاد، یه داکیومنت توی Index ای به اسم `app-logs` ذخیره میشه. حالا وقت Kibana بازیه.

> نکته: در پروژه واقعی نمی‌خواهیم هر ریکوئست مستقیم منتظر بمونه تا لاگ توی ES ذخیره بشه. پس بهتره از صف یا بافر استفاده کنی، یا از کتابخونه‌های بالغ‌تری مثل **Winston** با transport مخصوص Elasticsearch استفاده کنی (winston-elasticsearch). ولی برای یادگیری و شروع، کد بالا کافیه.

---

### ۵. گشت و گذار توی Kibana: بخش Discover (قلب کار)

وقتی Data View رو ساختی و داده فرستادی، برو به منوی **Discover**. اینجا مثل یه ترمینال زنده برای لاگ‌ها می‌مونه.

- بالای صفحه یه Time Picker هست، بذار روی "Today" تا لاگ‌های امروز دیده بشن.
- می‌بینی که لاگ‌ها به ترتیب زمان اومدن، هر خط یه JSON هست.
- می‌تونی ستون‌هایی که می‌خوای رو انتخاب کنی (level, message, timestamp).
- یه نوار جستجو داری که از **KQL (Kibana Query Language)** پشتیبانی می‌کنه. خیلی ساده‌ست. مثلاً بنویس:
  - `level : "error"` → فقط ارورها
  - `level : "error" and service : "my-node-api"`
  - `message : "fail*"` (همه پیام‌هایی که با fail شروع بشن)
  - `meta.ip : "192.168.1.1"`
- می‌تونی با کلیک روی علامت + کنار هر فیلد، سریع فیلتر اضافه کنی.
- اگه روی عدد یه فیلد کلیک کنی، نمودار توزیع رو می‌بینی.

**اینجا قدرتش رو حس می‌کنی:** یه ارور خاص رو پیدا می‌کنی، IP کاربر رو می‌بینی، باهمه‌ی متادیتاش. دیگه ssh زدن به سرور و grep کشیدن بی‌معنی میشه.

---

### ۶. ساختن Visualization و Dashboard

بعد از Discover نوبت به نمودار می‌رسه. بریم **Dashboard** و یه داشبورد جدید بسازیم. اما اول نیاز به Visualisation (نمودار) داریم. بهترین دوست ما Lens هست که خیلی راحت باهاش کار می‌کنی.

#### ساختن یک Visualization ساده:

از منو برو **Visualize Library → Create visualization → Lens**.

- سمت چپ **Data view** رو انتخاب کن (همون `app-logs`).
- سمت راست، نوع نمودار رو انتخاب (مثلاً Bar vertical).
- **Horizontal axis**: timestamp رو بکش اینجا. خودش interval زمانی رو درست می‌کنه.
- **Vertical axis**: یه تابع مثل Count of records. حالا یه نمودار میله‌ای داری که تعداد لاگ‌ها رو در زمان نشون میده.
- برای تفکیک بر اساس level، از **Breakdown** استفاده کن: فیلد `level` رو بکش داخل Breakdown. حالا میله‌ها با رنگ‌های مختلف (info, error) نمایش داده می‌شن.
- اگر خواستی فقط خطاها رو ببینی، می‌تونی بالای صفحه KQL فیلتر بزنی `level : "error"`. نمودار فقط خطاها رو نشون میده.

#### ذخیره و اضافه کردن به داشبورد:

- بالا سمت چپ **Save and return** بزن، اسم بذار (مثلاً "Logs per Level"). بعدش توی صفحه داشبورد، **Add** و این ویجت رو انتخاب کن.
- می‌تونی چندتا نمودار مختلف بسازی:
  - Pie chart برای درصد levelهای مختلف.
  - Metric برای تعداد کل خطاها.
  - Table برای نمایش آخرین خطاها (با فیلدهای message, timestamp).
- همه رو بکش و اندازه‌شون رو تنظیم کن، Save کن.

حالا یه داشبورد زنده داری که با Refresh اتوماتیک، وضعیت اپت رو نشون میده. این برای تیم هم می‌فرستی یا روی یه مانیتور بزرگ می‌ذاری (مانیتورینگ عملیات).

---

### ۷. بخش Dev Tools (برای Node.js کارا فوق‌العاده‌ست)

توی Kibana یه Console هست که می‌تونی کوئری مستقیم به Elasticsearch بزنی. از منو برو **Management → Dev Tools**.

```json
GET /app-logs/_search
{
  "query": {
    "match": {
      "message": "connection"
    }
  }
}
```

این دقیقاً همون کاریه که `esClient.search()` در Node.js انجام میده. اینجا می‌تونی کوئری‌های پیچیده رو تست کنی، نتیجه رو ببینی، بعد توی کد Node.js ازش استفاده کنی. یادگیری DSL جستجوی Elasticsearch رو هم همین‌جا راحتتر انجام میدی. مثلاً برای ارورهای ۵ دقیقه اخیر:

```json
GET /app-logs/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "level": "error" } },
        { "range": { "timestamp": { "gte": "now-5m" } } }
      ]
    }
  }
}
```

---

### ۸. راه‌های حرفه‌ای‌تر برای ارسال لاگ از Node.js

روش مستقیم با Client برای تست خوب بود، اما تو پروداکشن:

1. **Winston + Elasticsearch Transport**  
   پکیج `winston-elasticsearch` لاگ‌ها رو می‌فرسته Elasticsearch. می‌تونی بافر و flush interval تنظیم کنی تا پرفورمنس خراب نشه. کانفیگش ساده‌ست:

   ```javascript
   const winston = require("winston");
   const { ElasticsearchTransport } = require("winston-elasticsearch");

   const esTransport = new ElasticsearchTransport({
     level: "info",
     client: esClient, // همون client قبلی
     index: "winston-logs",
   });

   const logger = winston.createLogger({
     transports: [esTransport],
   });
   ```

2. **Filebeat (پیشنهاد حرفه‌ای‌ها)**
   به جای اینکه Node.js مستقیم به Elasticsearch وصل بشه، لاگ‌ها رو توی فایل JSON می‌نویسیم (با Winston یا Bunyan) و Filebeat این فایل‌ها رو می‌خونه و می‌فرسته Elasticsearch. مزیت: اگر Elasticsearch down بشه، لاگ‌ها توی فایل باقی می‌مونن و از دست نمی‌رن؛ همچنین بار شبکه از روی Node.js برداشته میشه. پیکربندی filebeat.yml ساده‌ست:

   ```yaml
   filebeat.inputs:
     - type: log
       paths:
         - /var/log/myapp/*.log
       json.keys_under_root: true
   output.elasticsearch:
     hosts: ["http://localhost:9200"]
   ```

3. **Elastic APM Node.js Agent**
   برای مانیتورینگ پرفورمنس و خطاهای درخواست‌ها. با `elastic-apm-node` می‌تونی تراکنش‌ها، کوئری‌های دیتابیس و ارورها رو به طور خودکار جمع‌آوری کنی و توی بخش APM Kibana ببینی. نصب:
   ```bash
   npm install elastic-apm-node
   ```
   و در ابتدای اپ:
   ```javascript
   const apm = require("elastic-apm-node").start({
     serviceName: "my-node-api",
     serverUrl: "http://localhost:8200", // APM Server
   });
   ```
   (APM Server جدا نیازه، ولی توی Cloud یا Docker قابل راه‌اندازیه). بعداً توی Kibana نقشه‌ی سرویس، مدت زمان پاسخ‌دهی و ... رو می‌بینی.

---

### ۹. آلرت (هشدار) برای Node.js کارا

کلی کار کردی که ببینی کی خطا میاد. اما نمی‌خوای ۲۴ ساعته پای صفحه باشی. Kibana Alerting کمک می‌کنه.  
از **Rules and Connectors** می‌تونی یه Rule بسازی. مثلاً:

- **نوع**: Elasticsearch query (بر اساس KQL یا DSL)
- **شرط**: هر یک دقیقه چک کن، اگر تعداد داکیومنت‌های با `level: "error"` بیشتر از ۱۰ تا بود.
- **Connector**: بفرست به Slack, Email, Webhook. (برای Slack باید یه webhook از Slack بگیری و Connector درست کنی).

این قابلیت تو نسخه‌های جدید خیلی راحت شده. مسیر: **Stack Management → Rules and Connectors → Create rule**.

---

### ۱۰. نکات طلایی برای یه Node.js کار که می‌خواد با Kibana رفیق بشه

- **همیشه JSON لاگ کن**: لاگ‌های متنی قدیمی رو بذار کنار. ساختارمند بودن لاگ‌ها توی Elasticsearch معجزه می‌کنه.
- **فیلدهای استاندارد ECS**: Elastic Common Schema یه استاندارد برای اسم‌گذاری فیلدهاست. مثلاً به جای `ip` بنویس `client.ip`، به جای `url` بنویس `url.path`. Kibana خیلی از فیلدها رو خودش بهتر می‌فهمد (مثل geo point, user agent). کتابخونه‌هایی مثل `ecs-winston-format` تو Node.js کمکت می‌کنن.
- **Index Template و ILM (Index Lifecycle Management)**: توی Elasticsearch می‌تونی Policy تعریف کنی که Indexهای قدیمی (مثلاً ۳۰ روز پیش) رو پاک کنه یا به حافظه‌ی ارزون‌تر منتقل کنه. اینجوری دیتابیست باد نمی‌کنه. از Kibana بخش **Stack Management → Index Lifecycle Policies** می‌تونی بسازی.
- **استفاده از Fleet و Elastic Agent**: اگر تعداد سرورها زیاد شد، به جای اینکه دستی روی هر سرور Filebeat نصب کنی، از Elastic Agent استفاده می‌کنی و همه رو از توی Kibana مدیریت می‌کنی. ولی این یه قدم پیشرفته‌تره.

---

### جمع‌بندی مسیر

امروز یاد گرفتی:

1. Kibana چیه و چرا Node.js و Kibana زوج جدانشدنی‌اند.
2. بالا آوردن ELK با Docker و برقراری ارتباط.
3. ساختن Data View و دیدن لاگ‌ها در Discover.
4. فرستادن لاگ از Node.js با Client, Winston, یا Filebeat.
5. کشیدن نمودار با Lens و ساختن داشبورد زشت ولی مفید 😄.
6. Dev Tools برای تست کوئری.
7. Alerting که بیدار خوابت نکنه.
