// سيرفر جلب الأسعار — يجمع أسعار السوق العراقي ويكتبها في Firestore (prices/latest)
// يشتغل عبر GitHub Actions كل ~15 دقيقة (أو محلياً للاختبار)
const admin = require('firebase-admin');

// مفتاح الخدمة: محلياً من الملف، وعلى GitHub من متغيّر البيئة FIREBASE_KEY
const serviceAccount = process.env.FIREBASE_KEY
  ? JSON.parse(process.env.FIREBASE_KEY)
  : require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}
async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// 💵 الدولار من قناة تيليغرام (تحت علم 🇺🇸: البيع/الشراء)
async function getDollar() {
  const html = await fetchText('https://t.me/s/Kukh_alomlat');
  const idx = html.lastIndexOf('🇺🇸');
  const seg = idx >= 0 ? html.slice(idx, idx + 400) : html;
  const s = seg.match(/البيع[^\d]{0,40}([\d,]{5,9})/);
  const b = seg.match(/الشراء[^\d]{0,40}([\d,]{5,9})/);
  return { sell: s ? s[1].replace(/,/g, '') : null, buy: b ? b[1].replace(/,/g, '') : null };
}

// 🥇🥈 الذهب/الفضة (أونصة بالدولار) من gold-api
async function getMetal(sym) {
  const j = await fetchJson(`https://api.gold-api.com/price/${sym}`);
  return j.price;
}

// 🛢️ النفط (برنت) من ياهو
async function getOil() {
  const j = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=1d');
  return j.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
}

// ₿ العملات الرقمية من CoinGecko
async function getCrypto() {
  const ids = 'bitcoin,ethereum,tether,binancecoin,solana,ripple,cardano,dogecoin,tron,polkadot,avalanche-2,chainlink';
  return fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
}

// 📊 أسهم بورصة العراق من صفحات شركات iraqsm (HTTPS)
const POPULAR = ['TASC', 'BBOB', 'IBSD', 'BNOI', 'BMNS', 'BIME', 'BCOI', 'BASH', 'BGUC', 'BKUI', 'INCP', 'HPAL', 'IRMC', 'TZNI', 'BMFI'];
async function getStocks() {
  const out = {};
  await Promise.all(POPULAR.map(async (sym) => {
    try {
      const html = await fetchText(`https://iraqsm.com/c/${sym}`);
      const m = html.match(/\\?"close\\?":([0-9.]+),\\?"pct\\?":(-?[0-9.]+)/);
      if (m) {
        const close = parseFloat(m[1]);
        const pct = parseFloat(m[2]);
        if (close > 0) out[sym] = { close, pct };
      }
    } catch (_) {}
  }));
  return out;
}

// 🔔 يرسل إشعاراً لكل المستخدمين (المشتركين بمجموعة "all")
async function sendToAll(title, body) {
  await admin.messaging().send({ topic: 'all', notification: { title, body } });
  console.log('SENT FCM:', title, '/', body);
}

// يتعامل مع الإشعارات: بث يدوي من لوحة المدير + تنبيهات تلقائية على تغيّر السعر
async function handleNotifications(oldData, newData) {
  // 1) بث يدوي: لوحة المدير تكتب config/broadcast = {id, title, body}
  try {
    const bref = db.collection('config').doc('broadcast');
    const b = (await bref.get()).data();
    if (b && b.id && b.id !== b.sentId && (b.title || b.body)) {
      await sendToAll(b.title || 'إشعار', b.body || '');
      await bref.set({ sentId: b.id }, { merge: true });
    }
  } catch (e) { console.warn('broadcast err', e.message); }

  // 2) تنبيهات تلقائية عند حركة سعر كبيرة بين تشغيلين
  try {
    if (oldData) {
      const og = oldData.goldOunceUSD, ng = newData.goldOunceUSD;
      if (og && ng && Math.abs(ng - og) / og >= 0.01) {
        await sendToAll(`الذهب ${ng > og ? 'ارتفع 📈' : 'نزل 📉'}`, `سعر أونصة الذهب الآن $${ng.toFixed(2)}`);
      }
      const os = oldData.dollar ? parseInt(String(oldData.dollar.sell).replace(/,/g, '')) : 0;
      const ns = newData.dollar ? parseInt(String(newData.dollar.sell).replace(/,/g, '')) : 0;
      if (os && ns && Math.abs(ns - os) >= 1000) {
        await sendToAll(`الدولار ${ns > os ? 'ارتفع 📈' : 'نزل 📉'}`, `سعر بيع الدولار الآن ${ns.toLocaleString('en-US')} لكل 100$`);
      }
    }
  } catch (e) { console.warn('auto-alert err', e.message); }
}

async function main() {
  // اقرأ الأسعار القديمة للمقارنة (للتنبيهات التلقائية)
  let oldData = null;
  try { const s = await db.collection('prices').doc('latest').get(); if (s.exists) oldData = s.data(); } catch (_) {}

  const data = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  const r = await Promise.allSettled([getDollar(), getMetal('XAU'), getMetal('XAG'), getOil(), getCrypto(), getStocks()]);
  const [dollar, gold, silver, oil, crypto, stocks] = r;

  if (dollar.status === 'fulfilled' && dollar.value.sell) data.dollar = dollar.value;
  if (gold.status === 'fulfilled' && gold.value) data.goldOunceUSD = gold.value;
  if (silver.status === 'fulfilled' && silver.value) data.silverOunceUSD = silver.value;
  if (oil.status === 'fulfilled' && oil.value) data.oil = String(oil.value);
  if (crypto.status === 'fulfilled' && crypto.value) data.crypto = crypto.value;
  if (stocks.status === 'fulfilled' && Object.keys(stocks.value).length) data.stocks = stocks.value;

  // سجل ما فشل للتشخيص
  r.forEach((x, i) => { if (x.status === 'rejected') console.warn('FAILED source', i, x.reason?.message || x.reason); });

  await db.collection('prices').doc('latest').set(data, { merge: true });
  await handleNotifications(oldData, data);
  console.log('OK wrote prices/latest:', JSON.stringify({
    dollar: data.dollar, gold: data.goldOunceUSD, silver: data.silverOunceUSD,
    oil: data.oil, cryptoCount: data.crypto ? Object.keys(data.crypto).length : 0,
    stocksCount: data.stocks ? Object.keys(data.stocks).length : 0,
  }));
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
