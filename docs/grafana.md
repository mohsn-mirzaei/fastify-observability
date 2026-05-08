## Grafana اصلاً چیه و چرا به درد ما می‌خوره؟

**Grafana یه ابزار متن‌باز برای ساخت داشبورد و مصورسازی داده‌هاست.** خودش دیتا ذخیره نمی‌کنه، بلکه به منابع داده مختلف وصل میشه، داده رو می‌خونه و به شکل نمودار، عدد، جدول و ... نشون میده.

برای یک برنامه‌نویس Node.js، Grafana حکم یه داشبورد آماده برای دیدن وضعیت اپلیکیشن رو داره:

- چندتا ریکوئست در ثانیه میاد؟
- چند درصدش خطا می‌خوره؟
- سرعت پاسخ‌گویی‌ چقدره (p95, p99)؟
- مصرف مموری و CPU سرور چطوره؟
- چه خطاهایی توی لاگ‌ها ثبت شده؟

در نهایت، به جای `console.log` کردن همه چیز یا چک کردن لاگ با `tail`، یه صفحه زیبا داری که هر لحظه وضعیت رو نشون میده، می‌تونی تاریخچه رو ببینی و اگر مشکلی پیش اومد، خودش بهت خبر بده (آلرت).

---

## مفاهیم اصلی که باید بدونی

قبل از این که دست به کار بشیم، چندتا کلمه رو باید بشناسی:

1. **Data Source (منبع داده):** جایی که داده‌هامون توش ذخیره شده. مثل Prometheus، InfluxDB، PostgreSQL، Loki (برای لاگ) و کلی مورد دیگه.
2. **Dashboard (داشبورد):** یه صفحه شامل چند پنل.
3. **Panel (پنل):** هر کدوم از اون نمودارها یا عددهای داخل داشبورد. هر پنل یک کوئری به منبع داده می‌زنه و نتیجه رو نمایش میده.
4. **Query (کوئری):** فرمانی که برای گرفتن داده از منبع داده می‌نویسی. مثلاً برای Prometheus باید PromQL بلد باشی.
5. **Alert (آلرت):** قانونی که می‌چسبه به یک پنل، اگر شرطش نقض شد (مثلاً نرخ خطا بالای ۵٪ شد)، نوتیفیکیشن می‌فرسته.

---

## گام اول: نصب Grafana (ساده‌ترین راه)

به‌ترین روش برای تست و کار محلی، استفاده از **Docker** هست. اگر هنوز داکر نداری، نصبش کن (سایت داکر برای همه سیستم‌عامل‌ها آموزش داره).

فقط یک خط دستور:

```bash
docker run -d --name=grafana -p 3000:3000 grafana/grafana
```

حالا توی مرورگر برو به `http://localhost:3000`. یوزرنیم و پسورد پیش‌فرض `admin/admin` است. بعد از ورود، ازت می‌خواد رمز رو عوض کنی.

نکته: اگر ویندوز یا مک داری و داکر دوست نداری، می‌تونی از فایل اجرایی مستقیم از سایت Grafana استفاده کنی. ولی داکر راحت‌تره.

---

## گام دوم: یه منبع داده (Data Source) تعریف کن

همونطور که گفتم، Grafana خودش دیتا نداره. ما باید یک منبع داده بهش معرفی کنیم. برای اپلیکیشن Node.js، بهترین انتخاب **Prometheus** هست.

### ۱. برنامه Node.js خودت رو آماده کن که متریک بده

برای این که Prometheus بتونه اطلاعات رو جمع‌آوری کنه، باید اپلیکیشن Node.js ما یک endpoint مثل `/metrics` در اختیارش بذاره که خروجی آن فرمت مخصوص Prometheus باشه. کتابخونه `prom-client` این کار رو می‌کنه.

نصبش کن:

```bash
npm install prom-client
```

حالا یک فایل مثلاً `metrics.js` بساز و تنظیمات پایه رو انجام بده:

```javascript
const client = require("prom-client");
const express = require("express");
const app = express();

// یه رجیستری برای ذخیره متریک‌ها
const register = new client.Registry();
client.collectDefaultMetrics({ register }); // متریک‌های پیش‌فرض مثل مموری، CPU، event loop lag

// یه متریک سفارشی مثلاً شمارنده ریکوئست‌های HTTP
const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

register.registerMetric(httpRequestCounter);

// این میدلور رو بذار تا هر ریکوئست شمارش بشه
app.use((req, res, next) => {
  res.on("finish", () => {
    httpRequestCounter.inc({
      method: req.method,
      route: req.path,
      status: res.statusCode,
    });
  });
  next();
});

// endpoint برای Prometheus
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(4000, () => console.log("App running on 4000"));
```

با اجرای این برنامه، اگر به `http://localhost:4000/metrics` بری، یک متن طولانی از متریک‌ها می‌بینی.

### ۲. Prometheus رو راه بنداز تا داده‌ها رو جمع کنه

حالا خود Prometheus باید نصب بشه تا این متریک‌ها رو هرچند ثانیه یکبار بخونه و ذخیره کنه. باز هم داکر ساده‌ترین راهه.

یک فایل پیکربندی به اسم `prometheus.yml` بساز:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "nodejs-app"
    static_configs:
      - targets: ["host.docker.internal:4000"] # اگر اپ روی لوکال هاست هست و Prometheus داخل داکره
```

اگر اپ Node.js هم توی داکر هست، باید اسم سرویس رو جایگزین کنی. برای سادگی، از `host.docker.internal` استفاده می‌کنیم که به هاست ماشین اشاره کنه (روی ویندوز/مک کار می‌کنه. روی لینوکس ممکنه نیاز به تنظیمات اضافه داشته باشه یا می‌تونی از IP هاست استفاده کنی).

حالا Prometheus رو بالا بیار:

```bash
docker run -d --name=prometheus -p 9090:9090 -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus
```

چک کن که Prometheus بالا اومده: `http://localhost:9090` و در منوی Status > Targets ببین که job تعریف‌شده سبز باشه.

### ۳. Prometheus رو به عنوان Data Source به Grafana معرفی کن

برو داخل Grafana (همون `localhost:3000`) و از منوی سمت چپ روی **Configuration (چرخ‌دنده) > Data Sources** کلیک کن. بعد **Add data source** و Prometheus رو انتخاب کن.

توی فیلد URL بنویس:

```
http://host.docker.internal:9090
```

(چون Prometheus توی داکره، از همین آدرس استفاده می‌کنیم)  
بقیه تنظیمات رو به‌طور پیش‌فرض بذار و **Save & test** کن. اگر موفقیت‌آمیز بود، می‌گه "Data source is working".

تبریک! الان Grafana ما به Prometheus متصل شده.

---

## گام سوم: ساخت اولین داشبورد

از منوی سمت چپ، روی **Dashboards > New Dashboard** کلیک کن. بعد **Add new panel**.

حالا در بخش Query، منبع داده رو Prometheus انتخاب کن. چندتا مثال عملی بزنیم:

### ۱. نمودار تعداد ریکوئست‌ها در ثانیه

کد PromQL:

```promql
rate(http_requests_total[1m])
```

توضیح: `rate` یعنی نرخ تغییر در یک بازه. اینجا میانگین ریکوئست در ثانیه در یک دقیقه آخر رو حساب می‌کنه. اگر app ریاستارت بشه، صفر نمی‌شه چون Counter هست و `rate` با تغییرات کار می‌کنه.

بزن Run query. باید یک نمودار خطی ببینی. می‌تونی Legend رو تغییر بدی، مثلاً `{{method}} {{route}}` تا بر اساس مسیر تفکیک بشه.

### ۲. نمودار خطای HTTP (درصد)

```promql
sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m])) * 100
```

این نسبت ریکوئست‌های با استاتوس 5xx به کل ریکوئست‌هاست، ضربدر 100 برای درصد. می‌تونی نمودار رو به صورت "Stat" در پنل انتخاب کنی تا فقط عدد درصد رو نشون بده و رنگ قرمز وقتی بالا میره.

### ۳. مموری استفاده‌شده توسط Node.js

متریک‌های پیش‌فرض `nodejs_heap_size_used_bytes` و ... هستن. برای نمایش مموری هیپ:

```promql
nodejs_heap_size_used_bytes / 1024 / 1024
```

واحد MB. می‌تونی از Gauge visualization استفاده کنی.

### ۴. تاخیر (Latency) ریکوئست‌ها

اینجا باید خودت هیستوگرام تعریف کنی. توی `metrics.js` اضافه کن:

```javascript
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5], // مرزهای bucket
});
register.registerMetric(httpRequestDuration);

// در میدلور، قبل از finish:
res.on("finish", () => {
  httpRequestDuration.observe(duration);
});
```

حالا کوئری برای محاسبه p95:

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))
```

این نمودار برای دید performance عالیه.

با این چند پنل، یه داشبورد جمع و جور داری. اسمش رو بذار "Node.js App Overview" و Save کن.

---

## گام چهارم: زیباسازی و حرفه‌ای‌تر کردن داشبورد

- **Variable (متغیر):** مثلاً یه متغیر به اسم `route` بساز که لیست همه مسیرها رو نشون بده و توی کوئری‌ها استفاده کنی: `{route="$route"}`. اینطوری کاربر می‌تونه فیلتر کنه.
- **Transformation (تبدیل):** می‌تونی داده‌ها رو قبل از نمایش مرتب کنی، واحدش رو عوض کنی، merge کنی.
- **Thresholds (حد آستانه):** توی تنظیمات پنل، می‌تونی رنگ‌ها رو بر اساس مقدار تغییر بدی. مثلاً اگر درصد خطا از ۵ رد شد، قرمز بشه.
- **Annotations (نقاط عطف):** مثلاً دفعات deploy رو با یک annotation نشون بده که ببینی بعد از deploy چه اتفاقی برای متریک‌ها افتاده.

---

## گام پنجم: آلرت (Alert) تنظیم کن

بیا یه آلرت ساده بسازیم که اگر نرخ خطا بیشتر از ۵٪ شد، خبر بده.

- روی پنل درصد خطا که قبلاً ساختی، برو به تب Alert.
- **Create alert rule from this panel.**
- در قسمت Conditions بنویس:  
  `WHEN avg() OF query(A, 5m, now) IS ABOVE 5`  
  (یعنی میانگین مقدار کوئری A در ۵ دقیقه آخر اگر از ۵ بالاتر رفت)
- Evaluate every `1m` for `5m` (هر ۱ دقیقه چک کن، اما ۵ دقیقه طول بکشه تا مطمئن بشی و false positive نده)
- حالا یک **Contact point** تعریف کن (از بخش Alerting > Contact points). مثلاً ایمیل خودت یا یه webhook دیسکورد/اسلک. برای تست، از ایمیل استفاده کن (باید SMTP رو در فایل پیکربندی Grafana تنظیم کنی که روش ساده‌ای داره، اما راه راحت‌تر فعلاً اینه که با webhook.io یا یه ربات تلگرام تست کنی). بیا یک webhook ساده به یک URL که پیام می‌گیره بفرستیم. (فعلاً می‌تونی contact point رو "test" بذاری و نوتیفیکیشن تست کنی)
- قانون آلرت رو Save کن.

الان اگر خطاها زیاد بشن، نوتیفیکیشن دریافت می‌کنی.

---

## گام ششم: فراتر از Prometheus – لاگ‌ها و دیتابیس

برای یک Node.js کار، دیدن لاگ‌ها هم مهمه. اینجا Loki به کار میاد.

- با داکر Loki و Promtail (که لاگ‌ها رو جمع میکنه) رو راه بنداز.
- برنامه Node.js لاگ‌ها رو در stdout بده (مثلاً با winston یا pino).
- Promtail لاگ‌ها رو برچسب‌زنی کرده و به Loki می‌فرسته.
- Loki رو به Grafana اضافه کن (دقیقاً مثل اضافه کردن Prometheus).
- کوئری با LogQL بزن: مثلاً `{job="nodejs"} |= "error"` و کنار نمودارها ببینی چه خطاهایی همزمان با spike رخ دادن.

همینطور می‌تونی دیتابیس PostgreSQL یا MySQL رو مستقیم وصل کنی و مثلاً تعداد کاربران ثبت‌نامی روزانه رو نشون بدی. فقط Query رو با SQL می‌نویسی.

---

## نکات طلایی برای یک برنامه‌نویس Node.js

1. **همیشه متریک‌های RED رو پوشش بده:**
   - Rate (تعداد ریکوئست)
   - Errors (تعداد خطاها)
   - Duration (مدت زمان پاسخ)  
     این سه تا ۸۰٪ نیازت رو حل می‌کنه.
2. **از Labelها به درستی استفاده کن:** `method`, `route`, `status`. اما حواست باشه Labelهای با cardinality بالا (مثلاً user id) رو به متریک‌ها نچسبونی، چون Prometheus از پا در میاد.
3. **Event Loop Lag رو مانیتور کن:** کتابخونه `prom-client` به‌طور پیش‌فرض متریک `nodejs_eventloop_lag_seconds` رو ارائه میده. اگه ناگهان این عدد بالا بره، یعنی event loop صف داره و کارها عقب میفته. زنگ خطره!
4. **از bucketهای مناسب برای هیستوگرام استفاده کن:** مرزهای bucket باید نیازهای SLI/SLO تو رو پوشش بده. مثلاً اگر SLA توی ۲۰۰ میلی‌ثانیه باشه، حتماً bucketهای 0.1 و 0.2 و 0.5 داشته باشی.
5. **از Grafana Provisioning استفاده کن:** فایل‌های YAML برای Data sourceها و داشبوردها بذار تا با ریاستارت Grafana همه چیز برگرده. مخصوصاً برای محیط‌های dev/prod مهمه.
6. **داشبوردهای آماده جامعه:** تو Grafana.com کلی داشبورد آماده برای Node.js و Prometheus هست. می‌تونی import کنی و شخصی‌سازی کنی. (Dashboard ID 11159 معروفه برای Node.js)

---

## جمع‌بندی مسیر یادگیری

1. Grafana رو نصب کن و به Prometheus وصلش کن.
2. از کتابخونه `prom-client` توی Node.js استفاده کن و متریک‌ها رو expose کن.
3. با PromQL دو سه تا کوئری اصلی رو یاد بگیر (`rate`, `sum`, `histogram_quantile`).
4. پنل‌ها رو بچین و یه داشبورد شکیل بساز.
5. آلرت رو راه بنداز تا چشمت به مانیتور نباشه، اما هر وقت کار خراب شد، بفهمی.
6. کم‌کم Loki و دیتابیس رو هم اضافه کن و سوییچ بین لاگ و متریک رو تمرین کن.

**یادت باشه:** Grafana فقط ابزار نمایشه. مغز ماجرا متریک‌ها و لاگ‌های درستی است که از اپلیکیشن جمع‌آوری می‌کنی. پس همون اول وقت بذار و متریک‌های خوب بذار.
