## پرومتیل اصلاً کیه و چرا به درد ما می‌خوره؟

تصور کن یه برنامهٔ نودجی‌اس داری که کلی `console.log` و `console.error` توش داری، یا بهتر از اون با یه کتابخونهٔ لاگینگ مثل **winston** یا **pino** لاگ‌های ساختاریافته (JSON) تولید می‌کنی. این لاگ‌ها یا توی ترمینال نشون داده می‌شن، یا توی فایل ذخیره می‌شن.

حالا یه روز به مشکل می‌خوری: برنامه خطا میده، درخواست‌ها کند شده، یا می‌خوای بدونی کدوم کاربر چه کاری کرده. می‌ری سراغ لاگ‌ها، ولی هزاران خط لاگ هست، جست‌وجو توشون سخته، تازه اگه برنامه ری‌استارت بشه شاید لاگ‌های قبلی از دست برن. اینجاست که **Loki** (لوکی) و **Promtail** (پرومتیل) وارد میدان می‌شن.

- **Loki** یه دیتابیس لاگه، مثل گوگل آنالیتیکس ولی برای لاگ‌ها. می‌تونی لاگ‌هات رو اونجا بفرستی و بعداً با یه زبان شبیه SQL (اسمش LogQL) توش جست‌وجو کنی، فیلتر کنی، نمودار بکشی.
- **Promtail** همون کامیونی‌ای که لاگ‌ها رو از سرور (یا کانتینر) بار می‌زنه و می‌رسونه به لوکی. بهش می‌گن "عامل" (agent). کارش ساده‌ست: فایل‌ها رو نگاه می‌کنه، خطوط جدید رو می‌خونه، یه کم شیکشون می‌کنه (پارس کردن، لیبل زدن) و پوش می‌ده به لوکی.

پس پرومتیل صرفاً یه **لاگ شیپر** (Log Shipper) هوشمنده. چرا هوشمند؟ چون قبل از فرستادن می‌تونه لاگ‌ها رو پردازش کنه: تایم‌استمپ درست کنه، فیلد اضافی ازشون استخراج کنه، خطوط چندخطی (مثل stack trace) رو به هم بچسبونه و کلی کار دیگه.

## آناتومی پرومتیل: چطور کار می‌کنه؟

پرومتیل همون فایل اجرایی `promtail` است که یه فایل کانفیگ ازش می‌گیره. توی کانفیگ بهش می‌گی:

1. **کجا لاگ‌ها رو بگردم؟** (`scrape_configs`) مثلاً فایل `/var/log/myapp/*.log`
2. **چطور این فایل‌ها رو بخونم؟** (خط به خط؟)
3. **چه لیبل‌هایی بهشون بچسبونم؟** مثلاً `app="nodejs"`، `env="production"`
4. **لاگ‌ها رو چطور پردازش کنم؟** (`pipeline_stages`) مثلاً اگه JSON هستن، تجزیه‌شون کن، تایم‌استمپ رو اینجوری دربیار.
5. **بفرستم به کدوم لوکی؟** آدرس سرور لوکی (`clients`).

پرومتیل هر فایل رو مثل `tail -f` دنبال می‌کنه (یه bookmark به اسم `positions` ذخیره می‌کنه که اگه ری‌استارت شد یادش باشه تا کجا خورده بود). بعد هر خط جدید رو با خط لولهٔ پردازش (pipeline) کار می‌کنه و می‌فرسته.

![Promtail architecture](https://grafana.com/static/img/loki/logging-architecture.png)
_یه نگاه ساده: اپلیکیشن → فایل لاگ → پرومتیل → لوکی → گرافانا_

## خب، نصبش کنیم

تو محیط‌های واقعی معمولاً پرومتیل رو کنار اپلیکیشن نصب می‌کنی. انتخاب‌ها:

### ۱. با داکر (برای توسعه محلی)

یه کانتینر کنار برنامه‌ات:

```yaml
# docker-compose.yml
version: "3"
services:
  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./promtail-config.yaml:/etc/promtail/config.yml
      - ./logs:/var/log/myapp # پوشه‌ای که لاگ‌های اپ توشه
    command: -config.file=/etc/promtail/config.yml
```

### ۲. مستقیم (binary) روی لینوکس/مک/ویندوز

از [صفحه انتشارات Grafana Loki](https://github.com/grafana/loki/releases) نسخهٔ پرومتیل رو دانلود می‌کنی. مثلاً فایل `promtail-linux-amd64.zip` رو باز کن، اجراش کن:

```bash
./promtail-linux-amd64 -config.file=promtail-config.yaml
```

### ۳. توی Kubernetes

پرومتیل معمولاً به صورت DaemonSet روی همه نودها نصب می‌شه و لاگ‌های کانتینرها رو از مسیر استاندارد `/var/log/pods` جمع می‌کنه. توی ساختار هلم چارت Loki-Stack هم خیلی راحت اضافه می‌شه. ولی برای سادگی، ما روی حالت فایل متمرکز می‌شیم.

## فایل کانفیگ: قلب ماجرا

فایل کانفیگ پرومتیل YAML هست. بخش‌های اصلی:

```yaml
# promtail-config.yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

clients:
  - url: http://loki:3100/loki/api/v1/push # لوکی کجاست

positions:
  filename: /tmp/positions.yaml # یادم بمونه هر فایل رو تا کجا خوندم

scrape_configs:
  - job_name: my_node_app
    static_configs:
      - targets:
          - localhost
        labels:
          job: nodejs
          app: my-cool-app
          __path__: /var/log/myapp/*.log # مسیر فایل‌های لاگ
    pipeline_stages:
      # اینجا جادوی پردازش اتفاق میفته
```

**توضیح مهم‌ها:**

- `clients`: آدرس لوکی. لوکی و پرومتیل لازم نیست روی یه ماشین باشن.
- `positions`: پرومتیل این فایل رو می‌سازه تا اگر داون شد، ادامهٔ فایل‌ها رو گم نکنه. مثل بوکمارک.
- `scrape_configs`: لیست کارهایی که باید انجام بده. هر کار یه `job_name` داره.
- `static_configs`: می‌گیم "به صورت استاتیک فایل‌های این مسیر رو بخون". معمولاً `targets: [localhost]` می‌ذارن، ولی فقط `__path__` مهمه.
- `labels`: لیبل‌هایی که به _تمام_ خطوط لاگ این جاب اضافه می‌شه. فرق لیبل استاتیک با لیبل داینامیک رو بعداً می‌گیم.

## مخصوص نودجی‌اس کارها: پردازش لاگ‌های Node.js

نودجی‌اس کارها معمولاً دوست دارن لاگ JSON باشه. فرض کن با **pino** لاگ می‌زنی:

```js
const pino = require("pino");
const logger = pino({
  level: "info",
  // pino by default outputs JSON to stdout, we can redirect to file
});
// Or using pino/file transport:
const transport = pino.transport({
  target: "pino/file",
  options: { destination: "./logs/app.log" },
});
const logger = pino(transport);
logger.info({ user: "ali", action: "login" }, "user logged in");
// Output in ./logs/app.log:
// {"level":30,"time":1715000000000,"pid":1234,"hostname":"server","user":"ali","action":"login","msg":"user logged in"}
```

حالا به پرومتیل می‌گیم این فایل JSON رو متوجه بشه و فیلدهاش رو استخراج کنه.

### Pipeline Stages: کارگاه تبدیل لاگ

توی `scrape_configs` می‌تونیم `pipeline_stages` بنویسیم. این یه آرایه از مراحل پردازشه که روی هر خط لاگ اجرا می‌شن. رایج‌ترین‌ها برای نودجی‌اس:

1. **json**: لاگ رو که JSON هست پارس کنه.
2. **timestamp**: فیلد زمان رو تشخیص بده تا لوکی زمان لاگ رو به درستی بفهمه.
3. **labels**: فیلدهای انتخابی رو به عنوان لیبل (برچسب قابل جست‌وجو) استخراج کنه. (مثل status code)
4. **output**: تعیین کنه در نهایت پیام لاگ چیه (مثلاً فقط `msg`).
5. **multiline**: برای خطوط چندخطی مثل stack trace ها.

ببینیم چطور:

```yaml
scrape_configs:
  - job_name: nodejs
    static_configs:
      - targets: [localhost]
        labels:
          job: node
          app: myapp
          __path__: /var/log/myapp/*.log
    pipeline_stages:
      - multiline:
          # اگر خط بعدی با space یا tab شروع شد، الحاق کن (مخصوص stack trace)
          firstline: '^\S' # خطی که با کاراکتر غیر فاصله شروع بشه، خط اوله
          max_lines: 128
          max_wait_time: 3s
      - json:
          expressions:
            level: level
            msg: msg
            time: time
            user: user
            action: action
            statusCode: statusCode # اگه داری
      - timestamp:
          source: time
          format: UnixMs # اگر time عدد میلی‌ثانیه‌ای یونیکسه، مثل pino
      - labels:
          level: # می‌تونیم level رو به لیبل تبدیل کنیم
      - output:
          source: msg # پیام نهایی همون msg باشه
```

**اتفاقاتی که میفته:**

- `multiline`: اگه برنامه‌ات خطای throw کنه، Stack trace چند خطه‌ست. این stage خط‌هایی که با فاصله شروع می‌شن رو به خط قبلی می‌چسبونه. `firstline` یک regexp که خط اول رو تشخیص میده. نکته: در لاگ‌های JSON معمولاً هر خط یک JSON کامل است، پس stack trace خودش توی یک فیلد رشته‌ای چندخطی میاد. اگه pino خروجی prettify نشده بده، JSON تک خطی هست و stack trace توی فیلد `stack` هست. پس multiline شاید لازم نشه. ولی برای لاگ‌های سادهٔ `console.log` که ممکنه چندخطی بشن، این stage کاربردی.
- `json`: فیلدهای داخل JSON رو به صورت named group درمیاره. مثلاً `level` رو می‌شه بعداً به لیبل تبدیل کرد.
- `timestamp`: به پرومتیل می‌فهمونه که timestamp لاگ رو از کدوم فیلد و با چه فرمتی برداره. `UnixMs` یعنی میلی‌ثانیه از epoch. فرمت‌های دیگه: `RFC3339`، `Unix` (ثانیه)، یا Go time format. تو pino معمولاً `time` میلی‌ثانیه‌ست.
- `labels`: فیلد `level` که از JSON استخراج شد رو به عنوان یک **لیبل** (stream label) لوکی در نظر می‌گیره. با این کار می‌تونی بعداً توی LogQL بگی `{level="50"}` (یا همون error) و سریع فیلتر کنی. **توجه**: لیبل‌ها کاردینالیتی (تعداد مقادیر یکتا)شون باید کم باشه! مثلاً `user` رو لیبل نکن چون هزاران کاربر داری، لوکی رو داغون می‌کنی. level فقط چند حالت داره (10,20,30,40,50) پس مناسبه.
- `output`: پیام نهایی که توی لوکی به عنوان log line ذخیره می‌شه، فیلد `msg` باشه. اگه نذاری، کل JSON اصلی ذخیره می‌شه.

## بیا یه پروژه واقعی رو با هم راه بندازیم

### پیش‌نیاز: لوکی در دسترس باشه

ساده‌ترین راه: با داکر لوکی رو اجرا کن.

```bash
docker run -d --name=loki -p 3100:3100 grafana/loki:latest
```

آدرس لوکی می‌شه `http://localhost:3100`.

### اپلیکیشن نودجی‌اس نمونه

یه پروژه کوچیک:

```js
// app.js
const pino = require("pino");
const fs = require("fs");

// مطمئن شو پوشه logs وجود داره
if (!fs.existsSync("./logs")) fs.mkdirSync("./logs");

const logger = pino(
  pino.transport({
    target: "pino/file",
    options: { destination: "./logs/app.log" },
  }),
);

// شبیه‌سازی لاگ‌های مختلف
setInterval(() => {
  const random = Math.random();
  if (random < 0.7) {
    logger.info({ user: "ali", action: "view" }, "page viewed");
  } else if (random < 0.9) {
    logger.warn(
      { user: "ali", action: "slow_query", duration: 1200 },
      "slow query detected",
    );
  } else {
    const err = new Error("Something broke!");
    logger.error({ err, user: "ali" }, "unhandled error");
  }
}, 2000);
```

خروجی فایل `./logs/app.log` مثل:

```
{"level":30,"time":1715000000000,"user":"ali","action":"view","msg":"page viewed"}
{"level":50,"time":1715000002000,"err":{"type":"Error","message":"...","stack":"..."},"user":"ali","msg":"unhandled error"}
```

### کانفیگ پرومتیل (فایل `promtail-config.yaml`)

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

clients:
  - url: http://localhost:3100/loki/api/v1/push

positions:
  filename: /tmp/positions.yaml

scrape_configs:
  - job_name: pino_app
    static_configs:
      - targets:
          - localhost
        labels:
          job: pino
          app: myapp
          __path__: ./logs/app.log # مسیر نسبی یا مطلق
    pipeline_stages:
      - json:
          expressions:
            level: level
            msg: msg
            time: time
            user: user
            action: action
      - timestamp:
          source: time
          format: UnixMs
      - labels:
          level:
      - output:
          source: msg
```

### اجرا کن ببینیم چی میشه

1. لوکی رو اجرا کن (اگه هنوز روشن نیست).
2. پرومتیل رو با کانفیگ اجرا کن:
   ```bash
   ./promtail -config.file=promtail-config.yaml
   ```
   (یا با داکر اگر خواستی. می‌تونی پرومتیل رو هم با داکر کنار لوکی بندازی و volume ماونت کنی).
3. اپ نودجی‌اس رو اجرا کن: `node app.js`
4. حالا برو توی Grafana (اگه نداری، می‌تونی با `docker run -d -p 3000:3000 grafana/grafana` بیاری بالا) و لوکی رو به عنوان Data Source اضافه کن با آدرس `http://loki:3100`. بعد در بخش Explore دیتابیس لوکی رو انتخاب کن و query بزن:
   ```
   {app="myapp"} | json
   ```
   یا
   ```
   {level="50"}
   ```
   باید لاگ‌های اپت رو ببینی که با لیبل‌ها و فیلدهای استخراج شده آنلاین میان. وای چقدر حال میده!

## نکات تکمیلی که هر نودجی‌اس‌کاری باید بدونه

### ۱. لاگ‌های مولتی‌لاین (Stack Trace)

همونطور که گفتم، pino خطا رو در یک فیلد `err` ذخیره می‌کنه که شامل stack هست. این یک رشته با `\n` تو خودشه. ولی خروجی JSON هنوز تک خطیه. بنابراین `multiline` نیاز نیست. اگه از `console.log` ساده برای چاپ stack استفاده می‌کنی (که خطوط می‌شکنه) اونوقت باید `multiline` بذاری و `firstline` رو با regex شروع خط (مثلاً `^\d{4}-\d{2}-\d{2}` اگر timestamp داری) ست کنی. ولی در نودجی‌اس بهتره همیشه خروجی JSON بگیری.

### ۲. استفاده از template برای تغییر شکل پیام

گاهی می‌خوای لاگ نهایی ترکیبی از چند فیلد باشه. از stage `template` استفاده کن:

```yaml
- template:
    source: final_message
    template: "{{ .level }} - {{ .msg }} (user: {{ .user }})"
- output:
    source: final_message
```

یه پیام قابل فهم می‌سازی.

### ۳. حذف فیلدهای اضافه (مثل pid، hostname)

با stage `json` فقط فیلدهای لازم رو استخراج می‌کنی، بقیه خودکار حذف می‌شن. اگه بعداً چیزی اضافه بمونه می‌تونی با `- drop` حذفش کنی. اما لزومی نداره، لوکی ذخیره‌اش می‌کنه.

### ۴. لیبل‌ها از نام فایل یا مسیر

اگه برنامه‌های مختلف لاگ‌هاشون توی مسیرهای مختلف باشه، می‌تونی با `__path__` و label از regex استفاده کنی:

```yaml
pipeline_stages:
  - regex:
      expression: '^/var/log/(?P<service>[^/]+)/.*\.log$'
      source: filename # از نام فایل
  - labels:
      service:
```

اما معمولاً راحت‌تره که برای هر سرویس یک job جداگانه با لیبل استاتیک بزنی.

### ۵. لاگ‌های Docker و Kubernetes

اگر نودجی‌اس توی کانتینر اجرا می‌شه، معمولاً لاگ‌های stdout/stderr توسط Docker JSON file driver ذخیره می‌شه. پرومتیل می‌تونه اینها رو از `/var/lib/docker/containers/*/*.log` بخونه. برای این کار نیاز به docker: stage داری که log رو parse کنه. اما اگر از Loki Docker Driver استفاده کنی، دیگه پرومتیل لازم نیست. ولی موضوع بحث ما نیست.

### ۶. مدیریت خطا و debugging پرومتیل

مهم‌ترین کار: لاگ‌های خود پرومتیل رو ببین. با پرچم `-log.level=debug` اجراش کن:

```bash
./promtail -config.file=config.yml -log.level=debug
```

اونوقت می‌بینی چطور فایل‌ها رو می‌خونه، چی پارس می‌کنه و خطاها رو نشون میده.

## جمع‌بندی رفیقانه

پرومتیل یک دونه فایل YAML می‌خواد که بهش بگی:

- لوکی کجاست.
- کدوم فایل‌های لاگ رو نگاه کنه.
- چطور پردازششون کنه (JSON، تایم‌استمپ، لیبل‌بندی).

برای یه اپ نودجی‌اس که با pino یا winston لاگ JSON می‌زنه، کانفیگش خیلی سرراسته. بعد از اتصال، توی Grafana داری یه موتور جست‌وجوی قدرتمند روی لاگ‌ها که خطاها رو توی چند ثانیه پیدا می‌کنی، می‌تونی تعداد خطاها رو توی بازهٔ زمانی ببینی و زندگی شادتری داشته باشی.
