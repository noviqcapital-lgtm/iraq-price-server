// أدوات مشتركة لتاريخ الأسعار (الرسم البياني بالتطبيق)
// history.json  = سعر إغلاق يومي من 2020-01-01 لحد أمس (بتوقيت بغداد)
// intraday.json = لقطات كل ~10 دقائق لآخر 36 ساعة (لعرض "يوم")
const fs = require('fs');

const HIST_FILE = 'history.json';
const INTRA_FILE = 'intraday.json';
const INTRA_KEEP_MS = 36 * 3600 * 1000;

// التاريخ بتوقيت بغداد (UTC+3) بصيغة YYYY-MM-DD
function bagDate(ms) { return new Date(ms + 3 * 3600 * 1000).toISOString().slice(0, 10); }
function addDays(d, n) { const t = Date.parse(d + 'T00:00:00Z') + n * 86400000; return new Date(t).toISOString().slice(0, 10); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } }
function toInt(v) { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return n > 0 ? n : null; }
function toNum(v, dp) { const n = Number(v); return n > 0 ? Number(n.toFixed(dp)) : null; }

// يضيف لقطة الآن لملف intraday، ويرحّل الأيام المنتهية إلى history.json (آخر قيمة لكل يوم = الإغلاق)
// إضافة فقط: يقرأ الأسعار اللي انجلبت أصلاً ولا يغيّر أي شي بطريقة جلبها
function updateHistory(cdn) {
  const now = Date.now();
  const point = [
    now,
    toInt(cdn.dollar && cdn.dollar.sell),
    toInt(cdn.dollar && cdn.dollar.buy),
    toNum(cdn.goldOunceUSD, 2),
    toNum(cdn.silverOunceUSD, 3),
  ];
  const old = readJson(INTRA_FILE);
  let pts = old && Array.isArray(old.p) ? old.p : [];
  if (point[1] || point[3] || point[4]) pts.push(point);
  pts = pts.filter((p) => now - p[0] <= INTRA_KEEP_MS);
  fs.writeFileSync(INTRA_FILE, JSON.stringify({ updatedAt: now, p: pts }));

  const h = readJson(HIST_FILE);
  if (!h || !h.end) return; // قبل التعبئة الأولى (backfill) ما نسوي شي
  const yesterday = addDays(bagDate(now), -1);
  let changed = false;
  while (h.end < yesterday) {
    const d = addDays(h.end, 1);
    const day = pts.filter((p) => bagDate(p[0]) === d);
    const last = (k) => { for (let i = day.length - 1; i >= 0; i--) if (day[i][k] != null) return day[i][k]; return null; };
    const prev = (a) => a[a.length - 1];
    h.ds.push(last(1) ?? prev(h.ds));
    h.db.push(last(2) ?? prev(h.db));
    h.g.push(last(3) ?? prev(h.g));
    h.s.push(last(4) ?? prev(h.s));
    h.end = d;
    changed = true;
  }
  if (changed) {
    h.updatedAt = now;
    fs.writeFileSync(HIST_FILE, JSON.stringify(h));
    console.log('OK history rolled to', h.end);
  }
}

module.exports = { HIST_FILE, bagDate, addDays, toInt, updateHistory };
