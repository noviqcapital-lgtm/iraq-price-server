// تعبئة أولية (تشتغل مرة وحدة): يبني history.json من 2020-01-01 لحد أمس
// 💵 الدولار: أرشيف قناة تيليغرام نفسها اللي يقرأ منها السيرفر (آخر سعر بكل يوم = الإغلاق)
// 🥇🥈 الذهب والفضة: إغلاق يومي من ياهو (عقود الأونصة بالدولار)
const fs = require('fs');
const { HIST_FILE, bagDate, addDays } = require('./history');

const START = '2020-01-01';
const CHANNEL = 'Kukh_alomlat';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
      if (res.ok) return await res.text();
      console.warn('HTTP', res.status, url);
    } catch (e) { console.warn('ERR', e.message, url); }
    await sleep(2000 * (i + 1));
  }
  return null;
}

function decode(html) {
  return html
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&[lr]rm;|&nbsp;/g, ' ')
    .replace(/[‌-‏‪-‮]/g, '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

// يرجع رسائل الصفحة: [{id, t, text}]
function parsePage(html) {
  const out = [];
  const parts = html.split(`data-post="${CHANNEL}/`);
  for (let i = 1; i < parts.length; i++) {
    const c = parts[i];
    const id = parseInt(c, 10);
    const tm = c.match(/<time datetime="([^"]+)"/);
    const tx = c.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
    if (!id || !tm) continue;
    out.push({ id, t: Date.parse(tm[1]), text: tx ? decode(tx[1]) : '' });
  }
  return out;
}

// سعر البيع والشراء (لكل 100$) من نص الرسالة — نفس منطق السيرفر مع دعم الصيغ القديمة
function parseDollar(text) {
  let t = text;
  const us = t.indexOf('🇺🇸');
  if (us >= 0) t = t.slice(us, us + 500);
  const num = '([0-9][0-9.,]{2,9})';
  const sm = t.match(new RegExp('#?(?:ال)?بيع(?:[_ ]الدولار)?[^0-9\\n]{0,60}' + num));
  const bm = t.match(new RegExp('#?(?:ال|ل)?شراء(?:[_ ]الدولار)?[^0-9\\n]{0,60}' + num));
  if (!sm || !bm) return null;
  const norm = (x) => { let n = parseInt(x.replace(/[^0-9]/g, ''), 10); if (n >= 1000 && n <= 2600) n *= 100; return n; };
  const sell = norm(sm[1]), buy = norm(bm[1]);
  const ok = (n) => n >= 100000 && n <= 260000;
  if (!ok(sell) || !ok(buy) || sell < buy || sell - buy > 5000) return null;
  return { sell, buy };
}

// سعر بورصة بغداد (رقم واحد) من قناة dollariraqi — لسد فترة 2023 اللي القناة الأساسية ما نشرت بيها أسعار
function parseBourse(text) {
  const t = text.replace(/ـ/g, '');
  if (/ذهب|فضة/.test(t)) return null;
  const m = t.match(/(?:بغداد|الكفاح)[^0-9]{0,40}([0-9][0-9.,]{4,8})/);
  if (!m) return null;
  let n = parseInt(m[1].replace(/[^0-9]/g, ''), 10);
  if (n >= 1000 && n <= 2600) n *= 100;
  return n >= 100000 && n <= 260000 ? { v: n } : null;
}

// يقرأ أرشيف قناة من الأحدث للأقدم، ويحفظ آخر سعر بكل يوم بين from و to
async function crawl(channel, parse, from, to) {
  const page = (h) => parsePage(h.split(`data-post="${channel}/`).join(`data-post="${CHANNEL}/`));
  const first = await get(`https://t.me/s/${channel}`);
  const ids = first ? page(first).map((m) => m.id) : [];
  let before = (ids.length ? Math.max(...ids) : 20000) + 1;
  const daily = {}; // date -> {t, ...price}
  let pages = 0, empty = 0;
  while (before > 1) {
    const html = await get(`https://t.me/s/${channel}?before=${before}`);
    const msgs = html ? page(html) : [];
    pages++;
    if (!msgs.length) { if (++empty > 30) break; before -= 20; continue; }
    empty = 0;
    for (const m of msgs) {
      const d = bagDate(m.t);
      if (d < from || d > to) continue;
      const p = parse(m.text);
      if (p && (!daily[d] || m.t > daily[d].t)) daily[d] = { t: m.t, ...p };
    }
    const minId = Math.min(...msgs.map((m) => m.id));
    const minDate = bagDate(Math.min(...msgs.map((m) => m.t)));
    if (pages % 50 === 0) console.log(`${channel} page ${pages} reached ${minDate}, days=${Object.keys(daily).length}`);
    if (minDate < from) break;
    before = minId;
    await sleep(350);
  }
  console.log(`${channel}: ${pages} pages, ${Object.keys(daily).length} days with prices`);
  return daily;
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// الدولار: القناة الأساسية أولاً، والأيام الناقصة بفترة 2023 من سعر البورصة + فرق الصيرفة المحسوب من الأيام المشتركة
async function crawlDollar(end) {
  const main = await crawl(CHANNEL, parseDollar, START, end);
  const bourse = await crawl('dollariraqi', parseBourse, '2022-11-01', '2024-03-31');
  const both = Object.keys(bourse).filter((d) => main[d]);
  if (both.length >= 10) {
    const offS = median(both.map((d) => main[d].sell - bourse[d].v));
    const offB = median(both.map((d) => main[d].buy - bourse[d].v));
    let filled = 0;
    for (const d of Object.keys(bourse)) {
      if (!main[d]) { main[d] = { t: bourse[d].t, sell: bourse[d].v + offS, buy: bourse[d].v + offB, est: true }; filled++; }
    }
    console.log(`bourse fill: ${filled} days (overlap ${both.length}, offsets sell ${offS} buy ${offB})`);
  } else {
    console.warn('bourse fill skipped: overlap too small', both.length);
  }
  return main;
}

// يحذف القيم الشاذة (مثلاً سعر عملة ثانية انقرأ بالغلط): أبعد من 8% عن وسيط الأيام المجاورة
function dropOutliers(daily, key) {
  const dates = Object.keys(daily).sort();
  const vals = dates.map((d) => daily[d][key]);
  const bad = new Set();
  dates.forEach((d, i) => {
    const w = vals.slice(Math.max(0, i - 5), i + 6).slice().sort((a, b) => a - b);
    const med = w[Math.floor(w.length / 2)];
    if (Math.abs(vals[i] - med) / med > 0.08) bad.add(d);
  });
  if (bad.size) console.log(`dropped ${bad.size} outlier days (${key}):`, [...bad].slice(0, 20).join(' '));
  return bad;
}

async function yahoo(sym) {
  const p1 = Math.floor(Date.parse(START + 'T00:00:00Z') / 1000) - 7 * 86400;
  const txt = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`);
  const r = JSON.parse(txt).chart.result[0];
  const close = r.indicators.quote[0].close;
  const out = {};
  r.timestamp.forEach((ts, i) => { if (close[i] > 0) out[bagDate(ts * 1000)] = close[i]; });
  console.log(`${sym}: ${Object.keys(out).length} days`);
  return out;
}

// يحوّل قيم الأيام لمصفوفة متصلة يوم بيوم. الأيام الناقصة: خط مستقيم بين أقرب سعرين (interp)
// أو آخر قيمة معروفة (عطل نهاية الأسبوع للذهب والفضة)
function series(dates, get, dp, interp = false) {
  const raw = dates.map((d) => get(d));
  const out = raw.slice();
  let last = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] == null) continue;
    if (last >= 0 && i - last > 1) {
      for (let k = last + 1; k < i; k++) out[k] = interp ? raw[last] + (raw[i] - raw[last]) * (k - last) / (i - last) : raw[last];
    }
    last = i;
  }
  if (last >= 0) for (let k = last + 1; k < raw.length; k++) out[k] = raw[last];
  const firstVal = out.find((v) => v != null);
  return out.map((v) => { const x = v ?? firstVal; return x == null ? null : Number(x.toFixed(dp)); });
}

async function main() {
  const end = addDays(bagDate(Date.now()), -1);
  const dates = [];
  for (let d = START; d <= end; d = addDays(d, 1)) dates.push(d);

  const [gold, silver] = [await yahoo('GC=F'), await yahoo('SI=F')];
  const daily = await crawlDollar(end);
  const badS = dropOutliers(daily, 'sell'), badB = dropOutliers(daily, 'buy');

  const h = {
    start: START,
    end,
    ds: series(dates, (d) => (daily[d] && !badS.has(d) ? daily[d].sell : null), 0, true),
    db: series(dates, (d) => (daily[d] && !badB.has(d) ? daily[d].buy : null), 0, true),
    g: series(dates, (d) => gold[d] ?? null, 2),
    s: series(dates, (d) => silver[d] ?? null, 3),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(HIST_FILE, JSON.stringify(h));
  console.log(`OK wrote ${HIST_FILE}: ${dates.length} days ${START}..${end}, ${fs.statSync(HIST_FILE).size} bytes`);
  // عيّنة شهرية للتأكد من صحة الأرقام
  dates.forEach((d, i) => { if (d.endsWith('-01')) console.log(d, 'sell', h.ds[i], 'buy', h.db[i], 'gold', h.g[i], 'silver', h.s[i]); });
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
