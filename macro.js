// 📊 تحليل الأخبار الاقتصادية العالمية (أمريكا) — يبني macro.json للتطبيق
// المصادر: BLS (التضخم/الوظائف/أسعار المنتجين — أرقام رسمية)، الفيدرالي (مواعيد وقرارات الفائدة)،
// Forex Factory (توقعات الأسبوع الحالي)، ياهو (مؤشر الدولار والأسهم الأمريكية)، Google News (مقالات المحللين)
// رد فعل الذهب والفضة والدولار بالدينار من history.json نفسه.
// إضافة فقط: ما يمس جلب الأسعار. يتحدث كل 6 ساعات، وفوراً بعد موعد أي خبر.
const fs = require('fs');
const { bagDate, addDays } = require('./history');

const MACRO_FILE = 'macro.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

// مواعيد 2026 الرسمية من جداول BLS (الموقع يمنع القراءة الآلية — تتحدث مرة بالسنة)
// [الشهر المرجعي، تاريخ الصدور]
const SCHEDULE = {
  cpi: [['2025-12', '2026-01-13'], ['2026-01', '2026-02-13'], ['2026-02', '2026-03-11'], ['2026-03', '2026-04-10'], ['2026-04', '2026-05-12'], ['2026-05', '2026-06-10'], ['2026-06', '2026-07-14'], ['2026-07', '2026-08-12'], ['2026-08', '2026-09-11'], ['2026-09', '2026-10-14'], ['2026-10', '2026-11-10'], ['2026-11', '2026-12-10']],
  nfp: [['2025-12', '2026-01-09'], ['2026-01', '2026-02-11'], ['2026-02', '2026-03-06'], ['2026-03', '2026-04-03'], ['2026-04', '2026-05-08'], ['2026-05', '2026-06-05'], ['2026-06', '2026-07-02'], ['2026-07', '2026-08-07'], ['2026-08', '2026-09-04'], ['2026-09', '2026-10-02'], ['2026-10', '2026-11-06'], ['2026-11', '2026-12-04']],
  ppi: [['2025-11', '2026-01-14'], ['2025-12', '2026-01-30'], ['2026-01', '2026-02-27'], ['2026-02', '2026-03-18'], ['2026-03', '2026-04-14'], ['2026-04', '2026-05-13'], ['2026-05', '2026-06-11'], ['2026-06', '2026-07-15'], ['2026-07', '2026-08-13'], ['2026-08', '2026-09-10'], ['2026-09', '2026-10-15'], ['2026-10', '2026-11-13'], ['2026-11', '2026-12-15']],
};
// يوم قرار الفيدرالي (اليوم الثاني من الاجتماع) — احتياطي إذا ما انقرأ موقع الفيدرالي
const FOMC_FALLBACK = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];

// شرح ثابت لكل نوع خبر (يظهر بصفحة التفاصيل)
const TYPES = {
  fomc: {
    name: 'قرار الفائدة الأمريكية (الفيدرالي)', icon: '🏦',
    what: 'البنك المركزي الأمريكي (الاحتياطي الفيدرالي) يقرر سعر الفائدة على الدولار. هو أقوى خبر اقتصادي بالعالم، لأن الفائدة تحدد قيمة الدولار وتكلفة الاقتراض وجاذبية الذهب.',
    when: '8 مرات بالسنة، تقريباً كل 6 أسابيع. القرار يطلع بآخر يوم من الاجتماع الساعة 9 بالليل بتوقيت بغداد (10 بالليل بالشتاء)، وبعده بنص ساعة مؤتمر صحفي لرئيس الفيدرالي.',
    why: 'رفع الفائدة يقوّي الدولار ويضغط على الذهب والفضة والأسهم. خفض الفائدة يضعّف الدولار ويرفع الذهب والأسهم. وحتى كلام رئيس الفيدرالي عن القرارات الجاية يحرّك الأسواق بقوة.',
  },
  cpi: {
    name: 'التضخم الأمريكي (مؤشر أسعار المستهلك CPI)', icon: '🛒',
    what: 'يقيس شكد ارتفعت أسعار السلع والخدمات اللي يشتريها المواطن الأمريكي (أكل، سكن، بنزين، نقل...). هو المقياس الرئيسي للتضخم، والفيدرالي يبني قرار الفائدة عليه.',
    when: 'مرة بالشهر، تقريباً بالأسبوع الثاني، الساعة 3:30 العصر بتوقيت بغداد (4:30 بالشتاء)، ويصدره مكتب إحصاءات العمل الأمريكي (BLS).',
    why: 'التضخم الأعلى من المتوقع يعني الفيدرالي يبقي الفائدة عالية أو يرفعها، فيقوى الدولار ويضغط على الذهب والأسهم. والتضخم الأقل من المتوقع يقرّب خفض الفائدة ويدعم الذهب والأسهم.',
  },
  nfp: {
    name: 'الوظائف الأمريكية (تقرير التوظيف NFP)', icon: '👷',
    what: 'عدد الوظائف الجديدة اللي انخلقت بأمريكا خلال الشهر (خارج القطاع الزراعي)، ويه نسبة البطالة. يبيّن قوة الاقتصاد الأمريكي.',
    when: 'مرة بالشهر، عادة أول جمعة، الساعة 3:30 العصر بتوقيت بغداد (4:30 بالشتاء)، ويصدره مكتب إحصاءات العمل الأمريكي (BLS).',
    why: 'وظائف قوية وبطالة واطية تعني اقتصاد قوي، فالفيدرالي ما يستعجل خفض الفائدة، فيقوى الدولار ويضغط على الذهب. ووظائف ضعيفة تقرّب خفض الفائدة وتدعم الذهب.',
  },
  ppi: {
    name: 'أسعار المنتجين الأمريكية (PPI)', icon: '🏭',
    what: 'يقيس تغيّر الأسعار اللي يبيع بيها المنتجين والشركات بالجملة. يعتبر مؤشر مبكر للتضخم، لأن ارتفاع كلفة الإنتاج ينتقل بعدين لأسعار المستهلك.',
    when: 'مرة بالشهر، الساعة 3:30 العصر بتوقيت بغداد (4:30 بالشتاء)، ويصدره مكتب إحصاءات العمل الأمريكي (BLS).',
    why: 'ارتفاعه يرفع توقعات التضخم ويقوّي الدولار ويضغط على الذهب، وانخفاضه العكس. تأثيره عادة أخف من التضخم (CPI).',
  },
};

const IRAQ_NOTE = 'بالعراق: سعر الذهب والفضة بالدينار يمشي ويه الأونصة العالمية مباشرة، فأي حركة بالأونصة تنعكس على سعر المثقال بنفس النسبة تقريباً. أما سعر صرف الدولار بالدينار بالسوق الموازي فيتحرك أكثر بعوامل محلية (البنك المركزي العراقي، المنصة الإلكترونية، الطلب على الدولار)، وتأثير الأخبار الأمريكية عليه عادة محدود وغير مباشر. وأسهم سوق العراق للأوراق المالية قليلاً ما تتأثر بهذه الأخبار.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getText(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } }
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
function shiftYm(s, n) { let y = +s.slice(0, 4), m = +s.slice(5, 7) + n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return ym(y, m); }
const monthName = (s) => `${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');

// التوقيت الصيفي الأمريكي (من الأحد الثاني بآذار للأحد الأول بتشرين الثاني)
function usDst(dateStr) {
  const y = +dateStr.slice(0, 4);
  const nthSunday = (m, n) => { const d = new Date(Date.UTC(y, m, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return Date.UTC(y, m, first + (n - 1) * 7); };
  const t = Date.parse(dateStr + 'T12:00:00Z');
  return t >= nthSunday(2, 2) && t < nthSunday(10, 1);
}
// وقت الصدور بتوقيت بغداد: أخبار BLS الساعة 8:30 صباحاً بنيويورك، والفيدرالي 2:00 ظهراً
function releaseAt(type, date) {
  const etOffset = usDst(date) ? 4 : 5; // ساعات وراء UTC
  const [h, m] = type === 'fomc' ? [14, 0] : [8, 30];
  return Date.parse(`${date}T00:00:00Z`) + ((h + etOffset) * 60 + m) * 60000;
}
function baghdadTime(ms) { const d = new Date(ms + 3 * 3600000); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; }

// ── جلب المصادر ──
async function fetchBls() {
  const ids = ['CUUR0000SA0', 'CUSR0000SA0', 'CUUR0000SA0L1E', 'CES0000000001', 'LNS14000000', 'WPUFD4', 'WPSFD4'];
  const y = new Date().getUTCFullYear();
  const txt = await getText('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesid: ids, startyear: String(y - 2), endyear: String(y) }),
  });
  const j = JSON.parse(txt);
  if (j.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS ' + j.status + ' ' + JSON.stringify(j.message));
  const out = {};
  for (const s of j.Results.series) {
    out[s.seriesID] = {};
    for (const d of s.data) if (/^M(0[1-9]|1[0-2])$/.test(d.period) && d.value !== '-') out[s.seriesID][ym(d.year, +d.period.slice(1))] = parseFloat(d.value);
  }
  return out;
}

async function fetchFomcDates() {
  const html = await getText('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm');
  const y = new Date().getUTCFullYear();
  const seg = html.slice(html.indexOf(`${y} FOMC Meetings`), html.indexOf(`${y - 1} FOMC Meetings`));
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const out = [];
  const re = /fomc-meeting__month[^>]*>(?:<[^>]*>)*\s*([A-Za-z/]+)[\s\S]*?fomc-meeting__date[^>]*>(?:<[^>]*>)*\s*([0-9]+)(?:-([0-9]+))?/g;
  let m;
  while ((m = re.exec(seg))) {
    let mon = m[1].split('/').pop(); // "Apr/May" → May (يوم القرار بالشهر الثاني)
    const day = +(m[3] || m[2]);
    const mi = names.findIndex((n) => n.startsWith(mon.slice(0, 3)));
    if (mi >= 0) out.push(`${y}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return out.length >= 6 ? out : FOMC_FALLBACK;
}

// تغييرات الفائدة الرسمية: [{date, change(نقاط أساس +/-), level}]
async function fetchRateChanges() {
  const html = await getText('https://www.federalreserve.gov/monetarypolicy/openmarket.htm');
  const txt = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  const y = new Date().getUTCFullYear();
  for (const yr of [y, y - 1]) {
    const i = txt.indexOf(`${yr} Date Increase Decrease Level (%)`);
    if (i < 0) continue;
    const seg = txt.slice(i, txt.indexOf('Back to year navigation', i));
    const re = /([A-Z][a-z]+) (\d{1,2}) (\d+) (\d+) ([\d.]+-[\d.]+)/g;
    let m;
    while ((m = re.exec(seg))) {
      const mi = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1].slice(0, 3));
      out.push({ date: `${yr}-${String(mi + 1).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`, change: +m[3] - +m[4], level: m[5] });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// توقعات الأسبوع الحالي (تنحفظ وتتراكم، حتى بعد الصدور نقارن بالتوقع)
async function fetchForecasts() {
  const j = JSON.parse(await getText('https://nfs.faireconomy.media/ff_calendar_thisweek.json'));
  const map = { 'CPI y/y': ['cpi', 'yoy'], 'CPI m/m': ['cpi', 'mom'], 'Core CPI y/y': ['cpi', 'core'], 'Non-Farm Employment Change': ['nfp', 'change'], 'Unemployment Rate': ['nfp', 'unemp'], 'Federal Funds Rate': ['fomc', 'rate'], 'PPI m/m': ['ppi', 'mom'] };
  const out = {};
  for (const e of j) {
    if (e.country !== 'USD' || !map[e.title] || !e.forecast) continue;
    const [type, field] = map[e.title];
    const v = parseFloat(String(e.forecast).replace(/[^0-9.\-]/g, ''));
    if (!isNaN(v)) out[`${type}|${e.date.slice(0, 10)}|${field}`] = v;
  }
  return out;
}

async function fetchYahoo(sym, from) {
  const p1 = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000);
  const j = JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`));
  const r = j.chart.result[0];
  const out = {};
  r.timestamp.forEach((ts, i) => { const c = r.indicators.quote[0].close[i]; if (c > 0) out[bagDate(ts * 1000)] = c; });
  return out;
}

async function fetchNews(query) {
  const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:10d')}&hl=ar&gl=IQ&ceid=IQ:ar`);
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const pick = (t) => { const x = it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return x ? x[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : ''; };
    const source = pick('source');
    let title = pick('title');
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    const t = Date.parse(pick('pubDate'));
    if (title.length > 10) items.push({ title, source, link: pick('link'), t: isNaN(t) ? 0 : t });
  }
  return items.sort((a, b) => b.t - a.t).slice(0, 4);
}

// ── رد فعل الأسواق: من إغلاق اليوم السابق للخبر لإغلاق اليوم اللي بعده ──
function reaction(date, series) {
  const before = addDays(date, -1), after = addDays(date, 1);
  const val = (map, d, dir) => { for (let k = 0; k < 5; k++) { const x = map[addDays(d, dir * k)]; if (x != null) return x; } return null; };
  const out = {};
  for (const [k, map] of Object.entries(series)) {
    const a = val(map, before, -1), b = val(map, after, 1);
    if (a && b && after < bagDate(Date.now())) out[k] = k === 'iqd' ? Math.round(b - a) : Math.round((b / a - 1) * 1000) / 10;
  }
  return Object.keys(out).length ? out : null;
}
function reactionText(r) {
  if (!r) return 'رد فعل الأسواق يظهر هنا بعد إغلاق السوق باليوم التالي للخبر.';
  const p = (x) => `${x > 0 ? '▲' : x < 0 ? '▼' : ''}${Math.abs(x).toFixed(1)}%`;
  const parts = [];
  if (r.gold != null) parts.push(`الذهب ${p(r.gold)}`);
  if (r.silver != null) parts.push(`الفضة ${p(r.silver)}`);
  if (r.dxy != null) parts.push(`مؤشر الدولار العالمي ${p(r.dxy)}`);
  if (r.spx != null) parts.push(`الأسهم الأمريكية (S&P 500) ${p(r.spx)}`);
  if (r.iqd != null) parts.push(`الدولار بالدينار ببغداد ${r.iqd === 0 ? 'بدون تغيير' : `${r.iqd > 0 ? '▲' : '▼'}${Math.abs(r.iqd).toLocaleString('en-US')} دينار لكل 100$`}`);
  return `خلال يومين من الخبر: ${parts.join('، ')}.`;
}

// ── التحليل لكل نوع ──
function verdict(diff, small) { return diff > small ? 1 : diff < -small ? -1 : 0; }
function analyze(type, ref, bls, rates, fc, date) {
  const res = { actual: {}, previous: {}, forecast: {}, headline: '', analysis: [], tone: 0 };
  const g = (id, k) => (bls[id] || {})[k];
  if (type === 'cpi') {
    const yoy = (k) => (g('CUUR0000SA0', k) && g('CUUR0000SA0', shiftYm(k, -12)) ? (g('CUUR0000SA0', k) / g('CUUR0000SA0', shiftYm(k, -12)) - 1) * 100 : null);
    const core = (k) => (g('CUUR0000SA0L1E', k) && g('CUUR0000SA0L1E', shiftYm(k, -12)) ? (g('CUUR0000SA0L1E', k) / g('CUUR0000SA0L1E', shiftYm(k, -12)) - 1) * 100 : null);
    const mom = (k) => (g('CUSR0000SA0', k) && g('CUSR0000SA0', shiftYm(k, -1)) ? (g('CUSR0000SA0', k) / g('CUSR0000SA0', shiftYm(k, -1)) - 1) * 100 : null);
    const a = yoy(ref), p = yoy(shiftYm(ref, -1));
    if (a == null) return null;
    res.actual = { 'التضخم السنوي': `${f1(a)}%`, 'الشهري': mom(ref) != null ? `${f1(mom(ref))}%` : '—', 'التضخم الأساسي': core(ref) != null ? `${f1(core(ref))}%` : '—' };
    if (p != null) res.previous = { 'التضخم السنوي': `${f1(p)}%`, 'التضخم الأساسي': core(shiftYm(ref, -1)) != null ? `${f1(core(shiftYm(ref, -1)))}%` : '—' };
    const fy = fc(`cpi|${date}|yoy`);
    if (fy != null) res.forecast = { 'التضخم السنوي': `${f1(fy)}%` };
    res.tone = fy != null ? verdict(+f1(a) - fy, 0.05) : (p != null ? verdict(+f1(a) - +f1(p), 0.05) : 0);
    const vs = fy != null ? `مقابل توقعات ${f1(fy)}%` : (p != null ? `مقابل ${f1(p)}% بالشهر اللي قبله` : '');
    res.headline = `التضخم ${f1(a)}% سنوياً ${res.tone > 0 ? '— أعلى' : res.tone < 0 ? '— أقل' : '— بدون تغيير يُذكر'}`;
    res.analysis.push(`التضخم بأمريكا لشهر ${monthName(ref)} وصل ${f1(a)}% سنوياً ${vs}${mom(ref) != null ? `، وارتفعت الأسعار ${f1(mom(ref))}% خلال الشهر نفسه` : ''}. التضخم الأساسي (بدون الأكل والطاقة) ${core(ref) != null ? f1(core(ref)) + '%' : 'غير متوفر'}.`);
    res.analysis.push(res.tone > 0
      ? `جاء التضخم ${fy != null ? 'أعلى من المتوقع' : 'أعلى من الشهر السابق'}، وهذا يقلل احتمال خفض الفائدة ويزيد احتمال إبقائها عالية. عادة هذا يقوّي الدولار عالمياً ويرفع عوائد السندات، فيضغط على الذهب والفضة والأسهم.`
      : res.tone < 0
        ? `جاء التضخم ${fy != null ? 'أقل من المتوقع' : 'أقل من الشهر السابق'}، وهذا يقرّب خفض الفائدة الأمريكية. عادة هذا يضعّف الدولار عالمياً ويدعم الذهب والفضة والأسهم.`
        : 'التضخم بقى قريب من مستواه السابق، فتأثيره المباشر على الأسواق عادة محدود، ويبقى التركيز على قرار الفيدرالي الجاي.');
  } else if (type === 'nfp') {
    const lv = (k) => g('CES0000000001', k), un = (k) => g('LNS14000000', k);
    if (lv(ref) == null || lv(shiftYm(ref, -1)) == null) return null;
    const ch = lv(ref) - lv(shiftYm(ref, -1));
    const pch = lv(shiftYm(ref, -2)) != null ? lv(shiftYm(ref, -1)) - lv(shiftYm(ref, -2)) : null;
    const u = un(ref), pu = un(shiftYm(ref, -1));
    res.actual = { 'الوظائف الجديدة': `${sign(ch)}${Math.abs(Math.round(ch))} ألف`, 'البطالة': u != null ? `${f1(u)}%` : '—' };
    if (pch != null) res.previous = { 'الوظائف الجديدة': `${sign(pch)}${Math.abs(Math.round(pch))} ألف`, 'البطالة': pu != null ? `${f1(pu)}%` : '—' };
    const fch = fc(`nfp|${date}|change`), fu = fc(`nfp|${date}|unemp`);
    if (fch != null) res.forecast = { 'الوظائف الجديدة': `${Math.round(fch)} ألف`, ...(fu != null ? { 'البطالة': `${f1(fu)}%` } : {}) };
    const base = fch != null ? fch : (pch != null ? pch : 120);
    const jobs = verdict(ch - base, Math.max(25, Math.abs(base) * 0.2));
    const unem = u != null && pu != null ? verdict(pu - u, 0.05) : 0; // بطالة نازلة = قوة
    res.tone = jobs + unem > 0 ? 1 : jobs + unem < 0 ? -1 : 0;
    res.headline = `${sign(ch)}${Math.abs(Math.round(ch))} ألف وظيفة، البطالة ${u != null ? f1(u) + '%' : '—'}`;
    res.analysis.push(`الاقتصاد الأمريكي ${ch >= 0 ? 'أضاف' : 'خسر'} ${Math.abs(Math.round(ch))} ألف وظيفة بشهر ${monthName(ref)}${fch != null ? ` مقابل توقعات ${Math.round(fch)} ألف` : pch != null ? ` مقابل ${Math.round(pch)} ألف بالشهر اللي قبله` : ''}، ونسبة البطالة ${u != null ? f1(u) + '%' : 'غير متوفرة'}${pu != null ? ` (كانت ${f1(pu)}%)` : ''}.`);
    res.analysis.push(res.tone > 0
      ? 'سوق العمل طلع أقوى من المتوقع، فالفيدرالي ما عنده سبب يستعجل بخفض الفائدة. عادة هذا يقوّي الدولار ويضغط على الذهب والفضة، والأسهم تتأرجح بين قوة الاقتصاد والفائدة العالية.'
      : res.tone < 0
        ? 'سوق العمل طلع أضعف، وهذا يزيد احتمال خفض الفائدة الأمريكية. عادة هذا يضعّف الدولار ويدعم الذهب والفضة.'
        : 'أرقام الوظائف جاءت قريبة من المتوقع، فتأثيرها على الأسواق عادة متوسط ومؤقت.');
    res.analysis.push('ملاحظة: أرقام الوظائف تنراجع بالأشهر اللاحقة، والأرقام هنا هي آخر نسخة معدّلة.');
  } else if (type === 'ppi') {
    const yoy = (k) => (g('WPUFD4', k) && g('WPUFD4', shiftYm(k, -12)) ? (g('WPUFD4', k) / g('WPUFD4', shiftYm(k, -12)) - 1) * 100 : null);
    const mom = (k) => (g('WPSFD4', k) && g('WPSFD4', shiftYm(k, -1)) ? (g('WPSFD4', k) / g('WPSFD4', shiftYm(k, -1)) - 1) * 100 : null);
    const a = mom(ref), p = mom(shiftYm(ref, -1));
    if (a == null) return null;
    res.actual = { 'الشهري': `${f1(a)}%`, 'السنوي': yoy(ref) != null ? `${f1(yoy(ref))}%` : '—' };
    if (p != null) res.previous = { 'الشهري': `${f1(p)}%`, 'السنوي': yoy(shiftYm(ref, -1)) != null ? `${f1(yoy(shiftYm(ref, -1)))}%` : '—' };
    const fm = fc(`ppi|${date}|mom`);
    if (fm != null) res.forecast = { 'الشهري': `${f1(fm)}%` };
    res.tone = fm != null ? verdict(+f1(a) - fm, 0.05) : (p != null ? verdict(+f1(a) - +f1(p), 0.05) : 0);
    res.headline = `أسعار المنتجين ${f1(a)}% شهرياً`;
    res.analysis.push(`أسعار المنتجين بأمريكا تغيّرت ${f1(a)}% خلال ${monthName(ref)}${fm != null ? ` مقابل توقعات ${f1(fm)}%` : p != null ? ` مقابل ${f1(p)}% بالشهر اللي قبله` : ''}، وعلى أساس سنوي ${yoy(ref) != null ? f1(yoy(ref)) + '%' : 'غير متوفر'}.`);
    res.analysis.push(res.tone > 0
      ? 'ارتفاع كلفة الإنتاج ممكن ينتقل لأسعار المستهلك بالأشهر الجاية، فيرفع توقعات التضخم ويدعم الدولار ويضغط على الذهب، بس تأثيره أخف من خبر التضخم الرئيسي.'
      : res.tone < 0
        ? 'تباطؤ أسعار المنتجين إشارة إن ضغوط التضخم دتخف، وهذا يدعم توقعات خفض الفائدة والذهب، بس تأثيره أخف من خبر التضخم الرئيسي.'
        : 'أسعار المنتجين مستقرة تقريباً، فتأثيرها على الأسواق محدود.');
  } else if (type === 'fomc') {
    const ch = rates.find((r) => r.date > date && r.date <= addDays(date, 3));
    const prev = rates.filter((r) => r.date <= date).pop();
    const level = ch ? ch.level : prev ? prev.level : null;
    const move = ch ? ch.change : 0;
    res.actual = { 'القرار': move > 0 ? `رفع ${move / 100}%` : move < 0 ? `خفض ${Math.abs(move) / 100}%` : 'تثبيت', 'الفائدة': level ? `${level.replace('-', ' – ')}%` : '—' };
    if (prev) res.previous = { 'الفائدة': `${prev.level.replace('-', ' – ')}%` };
    const fr = fc(`fomc|${date}|rate`);
    if (fr != null) res.forecast = { 'الفائدة (الحد الأعلى)': `${fr.toFixed(2)}%` };
    res.tone = move > 0 ? 1 : move < 0 ? -1 : 0;
    res.headline = move > 0 ? `رفع الفائدة إلى ${level}%` : move < 0 ? `خفض الفائدة إلى ${level}%` : `تثبيت الفائدة عند ${level}%`;
    res.analysis.push(`الفيدرالي الأمريكي قرر ${move > 0 ? `رفع الفائدة ${move / 100}%` : move < 0 ? `خفض الفائدة ${Math.abs(move) / 100}%` : 'تثبيت الفائدة بدون تغيير'}، فصارت ${level ? level.replace('-', ' – ') + '%' : '—'}.`);
    res.analysis.push(move > 0
      ? 'رفع الفائدة يخلي الدولار وسندات الخزينة الأمريكية أكثر جاذبية، فعادة يقوى الدولار وينزل الذهب والفضة (لأنهن ما يعطن فائدة) وتضغط على الأسهم.'
      : move < 0
        ? 'خفض الفائدة يقلل جاذبية الدولار، فعادة يضعف الدولار ويرتفع الذهب والفضة، وترتفع الأسهم لأن الاقتراض يصير أرخص.'
        : 'التثبيت كان متوقع غالباً، فالأسواق تركز أكثر على كلام رئيس الفيدرالي بالمؤتمر الصحفي: إذا لمّح لخفض قريب يدعم الذهب، وإذا لمّح لإبقاء الفائدة عالية لفترة أطول يدعم الدولار.');
  }
  return res;
}

// يقرر إذا نحتاج نعيد البناء: كل 6 ساعات، أو إذا صار موعد خبر وبعده ما عنده نتيجة
function needsRebuild(old, events) {
  if (!old || !old.updatedAt) return true;
  const now = Date.now();
  if (now - old.updatedAt > 6 * 3600000) return true;
  return events.some((e) => e.at <= now && now - e.at < 3 * 86400000 && !(old.events || []).some((o) => o.id === e.id && o.status === 'released' && o.headline));
}

async function updateMacro(force = false) {
  const old = readJson(MACRO_FILE);
  const year = new Date().getUTCFullYear();
  let fomc = FOMC_FALLBACK;
  // قائمة المواعيد (بدون جلب) حتى نعرف إذا نحتاج تحديث
  const plan = [];
  for (const [type, list] of Object.entries(SCHEDULE)) for (const [ref, date] of list) plan.push({ id: `${type}-${date}`, type, ref, date, at: releaseAt(type, date) });
  for (const date of fomc) plan.push({ id: `fomc-${date}`, type: 'fomc', ref: null, date, at: releaseAt('fomc', date) });
  if (!force && !needsRebuild(old, plan)) return false;

  const [bls, fomcDates, rates, fcNew, dxy, spx, ...news] = await Promise.allSettled([
    fetchBls(), fetchFomcDates(), fetchRateChanges(), fetchForecasts(),
    fetchYahoo('DX-Y.NYB', `${year - 1}-12-01`), fetchYahoo('^GSPC', `${year - 1}-12-01`),
    fetchNews('الفيدرالي الأمريكي الفائدة'), fetchNews('التضخم الأمريكي أسعار المستهلك'),
    fetchNews('الوظائف الأمريكية البطالة'), fetchNews('أسعار المنتجين الأمريكية'),
  ]).then((r) => r.map((x, i) => { if (x.status === 'rejected') console.warn('macro source', i, x.reason && x.reason.message); return x.status === 'fulfilled' ? x.value : null; }));
  if (!bls) { console.warn('macro: BLS failed, keep old file'); return false; }
  if (fomcDates) fomc = fomcDates;

  const forecasts = { ...((old && old.forecasts) || {}), ...(fcNew || {}) };
  const fc = (k) => (forecasts[k] != null ? forecasts[k] : null);
  const hist = readJson('history.json');
  const hmap = (key) => { const m = {}; if (hist) hist[key].forEach((v, i) => { m[addDays(hist.start, i)] = v; }); return m; };
  const series = { gold: hmap('g'), silver: hmap('s'), iqd: hmap('ds'), dxy: dxy || {}, spx: spx || {} };

  const all = [];
  for (const [type, list] of Object.entries(SCHEDULE)) for (const [ref, date] of list) all.push({ type, ref, date });
  for (const date of fomc) all.push({ type: 'fomc', ref: null, date });
  all.sort((a, b) => (a.date < b.date ? -1 : 1));
  const now = Date.now();
  const events = all.filter((e) => e.date.startsWith(String(year)) || e.date >= `${year}-01-01`).map((e) => {
    const at = releaseAt(e.type, e.date);
    const next = all.find((x) => x.type === e.type && x.date > e.date);
    const base = {
      id: `${e.type}-${e.date}`, type: e.type, date: e.date, at, time: baghdadTime(at),
      ref: e.ref ? monthName(e.ref) : null,
      title: TYPES[e.type].name,
      next: next ? { date: next.date, time: baghdadTime(releaseAt(next.type, next.date)) } : null,
    };
    if (at > now) {
      // خبر قادم: التوقع (إذا متوفر) + سيناريوهات
      const keys = Object.keys(forecasts).filter((k) => k.startsWith(`${e.type}|${e.date}|`));
      const fcv = {};
      keys.forEach((k) => { const f = k.split('|')[2]; fcv[f] = forecasts[k]; });
      const scen = {
        cpi: 'إذا جاء التضخم أعلى من المتوقع: يقوى الدولار وينزل الذهب والفضة غالباً. وإذا جاء أقل: يضعف الدولار ويرتفع الذهب والأسهم.',
        nfp: 'إذا جاءت الوظائف أقوى من المتوقع: يقوى الدولار وينزل الذهب غالباً. وإذا جاءت أضعف أو ارتفعت البطالة: يرتفع الذهب والفضة.',
        ppi: 'إذا ارتفعت أسعار المنتجين أكثر من المتوقع: يدعم الدولار ويضغط على الذهب بشكل خفيف، والعكس صحيح.',
        fomc: 'الأسواق تراقب القرار وكلام رئيس الفيدرالي: أي إشارة لخفض الفائدة تدعم الذهب والأسهم، وأي إشارة لإبقائها عالية أو رفعها تدعم الدولار.',
      }[e.type];
      const fcText = e.type === 'cpi' && fcv.yoy != null ? `توقعات السوق: التضخم ${f1(fcv.yoy)}% سنوياً.`
        : e.type === 'nfp' && fcv.change != null ? `توقعات السوق: ${Math.round(fcv.change)} ألف وظيفة${fcv.unemp != null ? `، والبطالة ${f1(fcv.unemp)}%` : ''}.`
        : e.type === 'ppi' && fcv.mom != null ? `توقعات السوق: ${f1(fcv.mom)}% شهرياً.`
        : e.type === 'fomc' && fcv.rate != null ? `توقعات السوق: الفائدة (الحد الأعلى) ${fcv.rate.toFixed(2)}%.` : 'التوقعات الرسمية تتوفر بأسبوع الخبر.';
      return { ...base, status: 'pending', headline: 'قيد الانتظار', forecast: fcv, analysis: [fcText, scen] };
    }
    const a = analyze(e.type, e.ref, bls, rates || [], fc, e.date);
    if (!a) return { ...base, status: 'released', headline: 'صدر الخبر — بانتظار تحديث الأرقام', analysis: ['الأرقام الرسمية تنضاف خلال ساعات من الصدور.'] };
    const r = reaction(e.date, series);
    return { ...base, status: 'released', headline: a.headline, tone: a.tone, actual: a.actual, previous: a.previous, forecast: a.forecast, analysis: [...a.analysis, reactionText(r)], reaction: r };
  });

  const [nFomc, nCpi, nNfp, nPpi] = news;
  const out = {
    updatedAt: now, year, types: TYPES, iraqNote: IRAQ_NOTE,
    note: 'الأرقام رسمية من مكتب إحصاءات العمل الأمريكي والاحتياطي الفيدرالي. التحليل تعليمي وليس نصيحة استثمارية.',
    news: { fomc: nFomc || (old && old.news && old.news.fomc) || [], cpi: nCpi || (old && old.news && old.news.cpi) || [], nfp: nNfp || (old && old.news && old.news.nfp) || [], ppi: nPpi || (old && old.news && old.news.ppi) || [] },
    forecasts,
    events,
  };
  fs.writeFileSync(MACRO_FILE, JSON.stringify(out));
  console.log(`OK macro.json: ${events.length} events (${events.filter((e) => e.status === 'released').length} released)`);
  return true;
}

module.exports = { updateMacro, MACRO_FILE };

// تشغيل مباشر للتجربة: node macro.js
if (require.main === module) updateMacro(true).then(() => console.log('done')).catch((e) => { console.error(e); process.exit(1); });
