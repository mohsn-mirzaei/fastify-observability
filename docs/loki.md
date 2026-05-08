لاکی در واقع یه سیستم خفنه که لاگ‌ها (همون گزارش‌های خطا و عملکرد برنامه‌ها) رو جمع‌آوری و مرتب می‌کنه، اونم تو محیط‌های ابریِ شلوغ مثل Kubernetes. برخلاف رقیبای قدیمی‌اش که خیلی حافظه می‌خورن، لاکی خودش رو به صرفه و سبک طراحی کرده.

---

### 🤔 ۱. لاکی قضیش چیه؟ (Loki چیه دیگه؟)

فرض کن لاکی یه کشوی جمع‌وجور و مرتب برای همه لاگ‌های برنامه‌هات باشه. یه مخزن مارک دار و شیک که هی بزرگتر هم نمیشه.

#### 🧩 جادویش در چیه؟ (معماری ساده)

قشنگ‌ترین نکته لاکی اینه که کل لاگ رو **ایندکس** (فهرست‌بندی) نمی‌کنه، بلکه فقط یک سری **برچسب (Label)** روش می‌زنه. اینطوری مثل یه فیلتر هوشمند عمل می‌کنه و حجم کار و هزینه رو حسابی میاره پایین. این معماری چند تا بخش اصلی داره که مثل یه خط تولید با هم کار می‌کنن:

- **پرومتیل (Promtail):** مسئول جمع‌آوری لاگ‌ها از فایل‌ها یا کانتینرهای داکر. این برچسب‌ها رو بهش می‌چسبونه بعد می‌فرسته به «توزیع‌کننده».
- **توزیع‌کننده (Distributor):** اولین ایستگاه توی لاکیه که درخواست‌ها رو می‌گیره، چک می‌کنه صحیحن، و اونا رو بین «ذخیره‌کننده‌ها» پخش می‌کنه.
- **ذخیره‌کننده (Ingester):** لاگ‌ها رو توی حافظه بافر می‌کنه، فشرده می‌کنه و بعداً توی حافظه طولانی‌مدت (مثل S3 یا دیسک محلی) ذخیره می‌کنه. توی همین حافظه هم به سوالات سریع جواب می‌ده.
- **پرس و جوکننده (Querier):** وقتی یه سوال توی گرافانا می‌نویسی، این بخش میاد از روی برچسب‌ها جای درست رو پیدا می‌کنه و لاگ مربوطه رو برات میاره.

این یعنی لاکی برای «مقیاس‌پذیری افقی» ساخته شده؛ یعنی هر وقت داری لاگ بیشتری میاد، فقط کافیه یه ماشین جدید بهش اضافه کنی تا کار رو باهات راه بندازه.

#### 💡 ۲. چرا لاکی و نه ELK؟ (مقایسه با رقبا)

دیگه تو بچگی‌هامون از ELK استفاده می‌کردیم (الاستیک‌سرچ، لاگ‌استش، کیبانا). سیستم بالغ و قدرتمندیه، ولی مثل یه کامیون بنزین‌خوره است که سنگین و گرونه. با مقیاس بزرگ، سرویس‌دهی سخت و گرون درمیاد و کلی حافظه و سی‌پی‌یو می‌خوره. لاکی رو می‌شه باهاش لاگ‌ها رو چید و دید بدون نگرانی از هزینه.

#### 🧠 چطور لاگ پیدا کنیم؟ (آشنایی با LogQL)

لاکی زبان جستجوی مخصوص خودش داره به اسم «**لاگ‌کیو‌ال (LogQL)**» که شبیه همون PromQL تو پرومتئوسه. مثلاً با یه دستور ساده مثل:

`{job="nginx"} |= "error" | json | line_format "{{.message}}"`
➡️ می‌گه: برام لاگ‌های nginx رو بیار که توشون کلمه error باشه، بعدش اگه فرمت JSON بود لاگ رو برام خوشگل نشون بده.

---

### 🛠️ ۳. راه‌اندازی از صفر (نصب و کانفیگ ساده)

بیا یه محیط کوچولو برای آزمایش آماده کنیم؛ مثلاً با Docker Compose که توش لاکی رو بالا میاریم و گرافانا (Grafana) رو هم بهش وصل می‌کنیم تا لاگ‌ها رو ببینیم. یکم تخصصی میشه ولی سعی می‌کنم خط به خط برات توضیح بدم.

#### 📁 ۱. آماده‌سازی پوشه‌ها و فایل‌ها

اول یه پوشه بساز و برو توش:

```bash
mkdir ~/loki-logging && cd ~/loki-logging
```

حالا سه تا پوشه می‌سازیم: یکی واسه دیتای خود لاکی (loki-data)، یکی واسه کانفیگ‌هاش (loki-config) و یکی هم پشت بوم جا می‌ذاریم برای خود پرومتیل:

```bash
mkdir -p {loki-data,loki-config,promtail-config}
```

لاکی توی کانتینر با یوزر خاصی اجرا می‌شه. برای اینکه مشکلی با دسترسی نداشته باشه، مالکیت پوشه داده‌ها رو بهش می‌دیم (UID اون 10001 هستش):

```bash
sudo chown -R 10001:10001 loki-data
```

#### ✍️ ۲. نوشتن کانفیگ لاکی (loki-local-config.yaml)

حالا یک فایل `loki-config/loki-local-config.yaml` ایجاد کن و این محتوا رو توش بریز (خودم با دستخط نوشتم!):

```yaml
auth_enabled: false # احراز هویت رو تو این آزمایش غیرفعال می‌کنیم ساده بشه

server:
  http_listen_port: 3100 # پورتی که لاکی بهش گوش می‌ده

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks # دیتا کجا ذخیره بشه
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  allow_structured_metadata: true
  volume_enabled: true
```

> **توضیح سریع:** این کانفیگ می‌گه "خودمون رو با `filesystem` ذخیره می‌کنم، از ایندکس نوع `tsdb` استفاده کن، و هر ۲۴ ساعت یه بار ایندکس رو رفرش کن". `auth_enabled: false` یعنی نیازی به توکن و اینا نیست.

#### ✍️ ۳. نوشتن کانفیگ پرومتیل (promtail-local-config.yaml)

حالا یه فایل `promtail-config/promtail-local-config.yaml` درست کن با این محتوا:

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml # جای پرومتیل رو یادداشت می‌کنه

clients:
  - url: http://loki:3100/loki/api/v1/push # آدرس لاکی داخل شبکه داکر

scrape_configs:
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          host: myserver
          __path__: /var/log/*.log # مسیر فایل‌های لاگ روی هاست (بعداً مپ می‌شه)

  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 10s
    relabel_configs:
      - source_labels: ["__meta_docker_container_name"]
        regex: "/(.*)"
        target_label: "container"
```

> **توضیح:** این کانفیگ می‌گه"پرومتیل، لاگ‌های داکر رو بگیر، همونایی که توی `/var/log/*.log` هستن رو هم بگیر، بعد بفرستشون به آدرس `http://loki:3100` (این آدرس توی شبکه داخلی داکر مفهوم داره)".

#### ✍️ ۴. نوشتن فایل داکر-کامپوز (docker-compose.yaml)

حالا توی پوشه اصلی یه فایل `docker-compose.yaml` بساز با این محتوا:

```yaml
services:
  loki:
    image: grafana/loki:latest
    container_name: loki
    ports:
      - "3100:3100"
    volumes:
      - ./loki-data:/loki
      - ./loki-config/loki-local-config.yaml:/etc/loki/loki-local-config.yaml
    command: -config.file=/etc/loki/loki-local-config.yaml
    networks:
      - loki-net

  promtail:
    image: grafana/promtail:latest
    container_name: promtail
    volumes:
      - /var/log:/var/log:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./promtail-config/promtail-local-config.yaml:/etc/promtail/promtail-local-config.yaml
    command: -config.file=/etc/promtail/promtail-local-config.yaml
    depends_on:
      - loki
    networks:
      - loki-net

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_INSTALL_PLUGINS=grafana-lokiexplore-app
    volumes:
      - ./grafana-data:/var/lib/grafana
    depends_on:
      - loki
    networks:
      - loki-net

networks:
  loki-net:
    driver: bridge
```

#### 🐳 ۵. بالا آوردن سرویس‌ها با داکر کامپوز

حالا همه سرویس‌ها رو با یک کامند اجرا کن (اولین بار ممکنه چند دقیقه طول بکشه چون ایمج رو دانلود می‌کنه):

```bash
docker compose up -d
```

بعد از اتمام، با `docker compose ps` وضعیتش رو ببین. هر سه تا باید `Up` باشن.

---

### 🔗 ۴. وصل کردن به گرافانا و اولین کوئری

حالا بیا بریم تو گرافانا:

1.  مرورگر رو باز کن و برو به `http://localhost:3000`. (یوزر و پس: `admin` / `admin`، بعد از وارد شدن ازت می‌خواد پس رو عوض کنی. می‌تونی همین `admin` رو دوباره بزنی ساده بشه!)
2.  برو به **Connections > Data sources** و بعد **Add data source** و **Loki** رو انتخاب کن.
3.  توی فیلد URL بزن `http://loki:3100` و بقیه رو به همین صورت رها کن (auth رو false بذار). بعد **Save & test** رو بزن. پیغام موفقیت می‌بینی.
4.  حالا از منوی کناری برو به **Explore**. توی کادر **Label filters** می‌تونی با برچسب `job` و `host` و `container` بازی کنی و لاگ‌ها رو ببینی.

برای یه مثال ساده، عبارت زیر رو در کادر جستجو بنویس (این یه LogQL ساده هست):

`{job="varlogs"}`

انشالله که لاگ‌های سیستمت رو ببینی!

---

### 🪄 ۵. یه جمع‌بندی دوستانه

لاکی مثل یه دوست خوب، وقتی آشفتگی لاگ‌ها داری به دادت می‌رسه. باهاش می‌تونی:
• **دیگه نگرانی بابت هارد و رم نداشته باشی.**
• **توی یه محیط (گرافانا) هم متریک‌های پرومتئوس و هم لاگ‌های لاکی رو ببینی.**
• **خیلی سریع لاگ خطا رو از بین میلیون‌ها خط لاگ پیدا کنی.**
• **معماری میکروسرویسی داشته باشی که هر وقت بزرگتر شد، راحت بزرگترش کنی.**
