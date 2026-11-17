// 🔔 تنبيه المدير فقط (عبر تطبيق ntfy) إذا سعر الدولار وكف بقناة المصدر
// فحص منفصل للقراءة فقط: ما يغيّر طريقة جلب الأسعار ولا الأسعار نفسها
// - إذا آخر منشور سعر بالقناة أقدم من 3 ساعات (بوقت الدوام) → تنبيه، ويتكرر كل 3 ساعات لحد ما يرجع
// - لما يرجع المصدر ينشر → تنبيه "رجع"
// القناة السرية بمتغيّر البيئة NTFY_TOPIC (GitHub Secret) — بدونها ما يسوي شي
const CHANNEL = 'Kukh_alomlat';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const STALE_MIN = 180;          // 3 ساعات بدون منشور سعر = متوقف
const REPEAT_MS = 3 * 3600000;  // تكرار التنبيه كل 3 ساعات
const HOURS_FROM = 10, HOURS_TO = 22; // وقت الدوام بتوقيت بغداد (ما ينبّه بالليل)

// وقت آخر منشور بالقناة بيه سعر بيع (نفس نمط قراءة السيرفر)
async function lastPricePostTime() {
  const res = await fetch(`https://t.me/s/${CHANNEL}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('channel ' + res.status);
  const html = await res.text();
  let latest = 0;
  for (const part of html.split(`data-post="${CHANNEL}/`).slice(1)) {
    const tm = part.match(/<time datetime="([^"]+)"/);
    if (!tm || !/البيع[^\d]{0,40}[\d,]{5,9}/.test(part)) continue;
    latest = Math.max(latest, Date.parse(tm[1]));
  }
  return latest || null;
}

async function ntfy(topic, title, message, priority = 4, tags = ['warning']) {
  const res = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title, message, priority, tags }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('ntfy ' + res.status);
  console.log('NTFY sent:', title);
}

const fmtTime = (ms) => { const d = new Date(ms + 3 * 3600000); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const fmtNum = (v) => String(v || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function fmtAge(min) {
  if (min < 60) return `${Math.round(min)} دقيقة`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} ساعة و${m} دقيقة` : `${h} ساعة`;
}

async function checkDollarStale(db, cdn) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const ref = db.collection('config').doc('staleAlert');
  const st = (await ref.get()).data() || {};
  const now = Date.now();

  // أول مرة: رسالة تأكيد إن التنبيهات وصلت لتلفونك
  if (!st.welcomed) {
    await ntfy(topic, 'تنبيهات سعر الدولار مفعّلة ✅', 'راح يوصلك تنبيه هنا إذا القناة ما نشرت سعر الدولار أكثر من 3 ساعات (من 10 الصبح لـ 10 بالليل).', 3, ['white_check_mark']);
    await ref.set({ welcomed: true }, { merge: true });
  }

  let last = null;
  try { last = await lastPricePostTime(); } catch (e) { console.warn('stale check fetch', e.message); }
  if (last) await ref.set({ lastPost: last }, { merge: true });
  else last = st.lastPost || null;
  if (!last) return;

  const ageMin = (now - last) / 60000;
  const h = new Date(now + 3 * 3600000).getUTCHours();
  const inHours = h >= HOURS_FROM && h < HOURS_TO;
  const manual = cdn && cdn.config && cdn.config.priceSource && cdn.config.priceSource.dollar === 'manual';
  const d = (cdn && cdn.dollar) || {};

  if (ageMin >= STALE_MIN) {
    if (inHours && (!st.lastAlert || now - st.lastAlert >= REPEAT_MS - 5 * 60000)) {
      await ntfy(topic, '⚠️ سعر الدولار متوقف — أضفه يدوي',
        `آخر سعر نشرته القناة قبل ${fmtAge(ageMin)} (الساعة ${fmtTime(last)}).\n` +
        `السعر الظاهر هسه: بيع ${fmtNum(d.sell)} / شراء ${fmtNum(d.buy)}.\n` +
        (manual ? 'السعر اليدوي مفعّل — حدّثه من لوحة الأدمن إذا تغيّر.' : 'افتح لوحة الأدمن وأدخل السعر اليدوي من الواتساب أو الفيسبوك.'));
      await ref.set({ lastAlert: now, staleSince: st.staleSince || last }, { merge: true });
    }
  } else if (st.staleSince) {
    await ntfy(topic, '✅ رجع سعر الدولار يتحدث',
      `القناة نشرت سعر جديد الساعة ${fmtTime(last)}: بيع ${fmtNum(d.sell)} / شراء ${fmtNum(d.buy)}.` +
      (manual ? '\nلا تنسى ترجّع مصدر الدولار إلى "تلقائي" من لوحة الأدمن.' : ''), 3, ['white_check_mark']);
    await ref.set({ lastAlert: null, staleSince: null }, { merge: true });
  }
}

module.exports = { checkDollarStale };
