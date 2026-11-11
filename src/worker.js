// Bolajon menu bot for Cloudflare Workers.
// Files: worker.js (this logic), data.js (menu and texts, rebuilt each month), app.js (mini app page).
// Needs: a secret named BOT_TOKEN and a KV namespace bound as KV. See SETUP.md.
import { MENU, UZ, EN, RULEKEYS } from './data.js';
import { APP_UZ, APP_EN } from './app.js';

const EFFECT_PARTY = '5046509860389126442'; // Telegram 🎉 effect
const kst = () => new Date(Date.now() + 9 * 3600e3); // Asia/Seoul, no summer time
const pad = (n) => (n < 10 ? '0' : '') + n;
const today = () => kst().toISOString().slice(0, 10);
const hourNow = () => kst().getUTCHours();
const hhmm = () => kst().toISOString().slice(11, 16);
const h = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const parts = (date) => { const a = date.split('-'); return { y: +a[0], m: +a[1], d: +a[2], wd: new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])).getUTCDay() }; };
const DAYS = Object.keys(MENU).sort();
const nextMenuDay = (date) => { const i = DAYS.indexOf(date); return i >= 0 && i < DAYS.length - 1 ? DAYS[i + 1] : null; };

// ---- language helpers ----
const D = (lang) => (lang === 'en' ? EN : UZ);
const T = (lang, uz, en) => (lang === 'en' ? en : uz);
const dn = (lang, name) => (lang === 'en' && EN.dish[name]) || name;
const alg = (lang, s) => (lang === 'en' ? s.split(', ').map((x) => EN.alg[x] || x).join(', ') : s);
const fd = (lang, date, withDay) => {
  const p = parts(date), L = D(lang);
  return lang === 'en' ? (withDay ? L.KUN[p.wd] + ', ' : '') + p.d + ' ' + L.OY[p.m - 1] : p.d + '-' + L.OY[p.m - 1] + (withDay ? ', ' + L.KUN[p.wd] : '');
};

async function tg(env, method, payload) {
  try {
    const r = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return await r.json();
  } catch (e) { return { ok: false }; }
}

// ---- storage (Cloudflare KV) ----
async function getCfg(env) { const c = (await env.KV.get('cfg', 'json')) || {}; c.chats = c.chats || {}; c.pending = c.pending || {}; c.langs = c.langs || {}; return c; }
const saveCfg = (env, c) => env.KV.put('cfg', JSON.stringify(c));
const langOf = (cfg, id) => (cfg.langs[id] === 'en' ? 'en' : 'uz');
// Each tick is its own key, so two people ticking at the same moment never overwrite each other.
async function getState(env, date) {
  const st = {}, prefix = 't:' + date + ':';
  const res = await env.KV.list({ prefix });
  for (const k of res.keys) { const key = k.name.slice(prefix.length); st[key] = 1; if (k.metadata && k.metadata.at) st['@' + key] = k.metadata.at + '|' + (k.metadata.by || ''); }
  return st;
}

function prepTips(m, lang) {
  const all = [m.ertalab].concat(m.tushlik, [m.kechki || '']).join(' ').toLowerCase(), out = [], L = D(lang);
  for (let i = 0; i < RULEKEYS.length && out.length < 3; i++) if (all.indexOf(RULEKEYS[i]) >= 0 && out.indexOf(L.RULES[i]) < 0) out.push(L.RULES[i]);
  return out.length ? out : [L.RULE0];
}
// The day's list: food (am, lu, pm) and prep for the next menu day (pr)
function items(date, lang) {
  const m = MENU[date], out = [];
  out.push({ k: 'am0', g: 'am', t: dn(lang, m.ertalab), food: true });
  m.tushlik.forEach((x, i) => out.push({ k: 'lu' + i, g: 'lu', t: dn(lang, x), food: true }));
  out.push({ k: 'pm0', g: 'pm', t: m.kechki ? dn(lang, m.kechki) : T(lang, 'Meva yoki sut', 'Fruit or milk'), food: true });
  const nk = nextMenuDay(date);
  if (nk) prepTips(MENU[nk], lang).forEach((x, i) => out.push({ k: 'pr' + i, g: 'pr', t: x, food: false }));
  return out;
}
const bar = (p) => { const f = Math.round(p / 10); let s = ''; for (let i = 0; i < 10; i++) s += i < f ? '🟩' : '⬜'; return s + '  ' + p + '%'; };

function savingLine(date, lang) {
  const p = parts(date), n = p.d + p.m * 31, L = D(lang);
  const pool = L.AYAH.map((x) => '📖 ' + x[0] + T(lang, " (Qur'on, ", " (Qur'an, ") + x[1] + ')')
    .concat(L.HSAVE.map((x) => '📿 ' + (x[0].charAt(0) === '«' ? T(lang, 'Rasululloh ﷺ: ', 'The Prophet ﷺ: ') : '') + x[0] + ' (' + x[1] + ')'));
  return '🌿 ' + L.SOFT[n % L.SOFT.length] + '\n' + pool[(n * 7) % pool.length];
}

const appUrl = (cfg, lang, date) => cfg.url + '/app?d=' + date + '&l=' + lang;
const openButton = (cfg, lang, date) => ({ inline_keyboard: [[{ text: T(lang, "📋 Ro'yxatni ochish va belgilash", '📋 Open the list and tick'), web_app: { url: appUrl(cfg, lang, date) } }]] });
// textFn(lang) builds the message in each person's own language
async function sendAll(env, cfg, textFn, date, extra) {
  await Promise.all(Object.keys(cfg.chats).map(async (id) => {
    const lang = langOf(cfg, id);
    const p = { chat_id: id, text: textFn(lang), parse_mode: 'HTML', disable_web_page_preview: true };
    if (date) p.reply_markup = openButton(cfg, lang, date);
    if (extra) Object.assign(p, extra);
    const r = await tg(env, 'sendMessage', p);
    if (!r.ok && extra && extra.message_effect_id) { delete p.message_effect_id; await tg(env, 'sendMessage', p); }
  }));
}
function statusLines(date, st, withPrep, lang) {
  const heads = { am: T(lang, '🌅 Ertalabki tamaddi', '🌅 Morning snack'), lu: T(lang, '🍚 Tushlik', '🍚 Lunch'), pm: T(lang, '🍎 Kechki tamaddi', '🍎 Afternoon snack'), pr: T(lang, '🌙 Ertangi kunga tayyorgarlik', '🌙 Prep for the next day') };
  let last = ''; const L = [];
  items(date, lang).forEach((x) => {
    if (x.g === 'pr' && !withPrep) return;
    if (x.g !== last) { L.push('', '<b>' + heads[x.g] + '</b>'); last = x.g; }
    L.push((st[x.k] ? '✅ ' : '☐ ') + h(x.t));
  });
  return L;
}
function progress(date, st, lang) {
  const food = items(date, lang).filter((x) => x.food), done = food.filter((x) => st[x.k]);
  return { all: food.length, done: done.length, left: food.filter((x) => !st[x.k]), pct: Math.round(done.length / food.length * 100) };
}

// Daily message text (12:00, 16:00, 20:00)
function build(date, slot, st, lang) {
  const m = MENU[date], p = parts(date), n = p.d, pr = progress(date, st, lang), X = D(lang);
  let L = [X.GREET[n % X.GREET.length]];
  if (slot === '12') L.push(T(lang, 'Tushlik vaqti yaqinlashdi, shoshilmasdan, xotirjam 🍃', 'Lunch time is near. No rush, take it easy 🍃'));
  if (slot === '16') L.push(T(lang, "Kunning yarmidan ko'pi o'tdi, barakalla 🌿", 'More than half of the day is done, well done 🌿'));
  if (slot === '20') L.push(T(lang, 'Kun yakuniga yetdi, ozgina qoldi 🌙', 'The day is almost over, just a little left 🌙'));
  const label = m.label ? ' ✨ ' + h(lang === 'en' ? EN.label[m.label] || m.label : m.label) : '';
  L.push('', '<b>📅 ' + fd(lang, date, true) + '</b>' + label, bar(pr.pct));
  L = L.concat(statusLines(date, st, slot === '20', lang));
  L.push('', T(lang, '⚠️ Allergenlar: ', '⚠️ Allergens: ') + h(alg(lang, m.allergen)));
  if (slot === '12') L.push('💡 ' + X.TIPS_12[n % X.TIPS_12.length]);
  if (slot === '16') L.push('💡 ' + X.TIPS_16[n % X.TIPS_16.length], T(lang, "O'zingiz ham bir piyola choy iching, dam oling ☕", 'Have a cup of tea yourself and rest a little ☕'));
  if (slot === ['12', '16', '20'][(p.d * 7 + p.m) % 3]) L.push('', h(savingLine(date, lang)));
  return L.join('\n');
}
async function sendSlot(env, slot) {
  const date = today(); if (!MENU[date]) return;
  const cfg = await getCfg(env), st = await getState(env, date);
  await sendAll(env, cfg, (lang) => build(date, slot, st, lang), date);
}
// 21:00: a gentle note, only if some food is still unticked
async function send21(env) {
  const date = today(); if (!MENU[date]) return;
  const cfg = await getCfg(env), st = await getState(env, date);
  if (!progress(date, st, 'uz').left.length) return;
  await sendAll(env, cfg, (lang) => {
    const pr = progress(date, st, lang);
    return ['<b>' + T(lang, '🕘 Kun yakuni: ' + pr.done + '/' + pr.all + ' bajarildi', '🕘 End of day: ' + pr.done + '/' + pr.all + ' done') + '</b>', '', T(lang, 'Hali belgilanmaganlar:', 'Not ticked yet:')]
      .concat(pr.left.map((x) => '☐ ' + h(x.t)), ['', T(lang, "Agar berilgan bo'lsa, belgilab qo'ying. Berilmagan bo'lsa ham hechqisi yo'q, ertaga yangi kun 🤍", 'If it was given, please tick it. If not, that is fine too, tomorrow is a new day 🤍')]).join('\n');
  }, date);
}

function celebrateText(date, lang) {
  const n = parts(date).d, X = D(lang), hd = X.HADITH[n % X.HADITH.length];
  const pre = /^(Rasululloh|Oisha|«|Robbanaa)/.test(hd[0]) ? '' : T(lang, 'Rasululloh ﷺ dedilar: ', 'The Prophet ﷺ said: ');
  return ['<b>' + T(lang, 'Tabriklaymiz, onajon! 🎉', 'Congratulations, dear mom! 🎉') + '</b>', T(lang, 'Bugungi barcha ovqatlar berildi (100%).', 'All of today\'s meals were given (100%).'), '', h(X.THANKS[n % X.THANKS.length]), '',
    '👶 <b>' + T(lang, 'Bugungi foyda:', "Today's benefit:") + '</b> ' + h(X.BENEFITS[n % X.BENEFITS.length]), '',
    '📿 ' + pre + '«' + h(hd[0].replace(/^«|»$/g, '')) + '» (' + h(hd[1]) + ')', '',
    '<b>' + T(lang, "Dunyoda sog'lom farzand, oxiratda ajr va jannat bo'lsin! 🤲", 'May it bring a healthy child in this world, and reward and Paradise in the Hereafter! 🤲') + '</b>'].join('\n');
}

// History (admin only): result per day, what was left, and who ticked what and when
async function history(env, cfg, lang) {
  const t = today(), start = cfg.start || t;
  const days = DAYS.filter((d) => d <= t && d >= start).reverse();
  return Promise.all(days.map(async (d) => {
    const st = await getState(env, d), pr = progress(d, st, lang);
    const log = items(d, lang).filter((x) => x.food && st[x.k] && st['@' + x.k]).map((x) => { const a = st['@' + x.k].split('|'); return { t: x.t, at: a[0], by: a[1] || '' }; }).sort((a, b) => (a.at < b.at ? -1 : 1));
    return { d, pct: pr.pct, done: pr.done, all: pr.all, left: pr.left.map((x) => x.t), log };
  }));
}
// "/tarix 5", "/tarix 5-12", "/tarix 28.11-3.12", "/tarix 2026-11-05 2026-11-12"
function parseRange(text) {
  const t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7), out = [], re = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\.(\d{1,2})|(\d{1,2})/g;
  let x;
  while ((x = re.exec(text.replace(/^\/\w+/, ''))) && out.length < 2) {
    if (x[1]) out.push(x[1] + '-' + pad(+x[2]) + '-' + pad(+x[3]));
    else if (x[4]) out.push(y + '-' + pad(+x[5]) + '-' + pad(+x[4]));
    else out.push(y + '-' + pad(m) + '-' + pad(+x[6]));
  }
  if (!out.length) return null;
  if (out.length === 1) out.push(out[0]);
  return out[0] <= out[1] ? out : [out[1], out[0]];
}

async function tick(env, cfg, u, date, key, val) {
  if (!MENU[date]) return;
  const it0 = items(date, 'uz').find((x) => x.k === key); if (!it0) return;
  const name = 't:' + date + ':' + key;
  if (val) await env.KV.put(name, '1', { metadata: { at: hhmm(), by: cfg.chats[u] || '' } }); else await env.KV.delete(name);
  if (!it0.food || !val) return;
  const st = await getState(env, date); st[key] = 1; // include this tick even if the list is a moment behind
  const all = progress(date, st, 'uz').left.length === 0;
  if (all) {
    if (await env.KV.get('done:' + date)) return;
    await env.KV.put('done:' + date, '1');
    return sendAll(env, cfg, (lang) => celebrateText(date, lang), null, { message_effect_id: EFFECT_PARTY });
  }
  const who = cfg.chats[u] ? h(cfg.chats[u]) + ': ' : '';
  await sendAll(env, cfg, (lang) => {
    const pr = progress(date, st, lang), it = items(date, lang).find((x) => x.k === key);
    return who + '✅ <b>' + h(it.t) + '</b> ' + T(lang, 'tayyor!', 'is done!') + ' (' + pr.done + '/' + pr.all + ')\n' + bar(pr.pct) + '\n\n' + T(lang, 'Qoldi: ', 'Left: ') + pr.left.map((x) => h(x.t)).join(', ');
  });
}

const LANG_KB = { inline_keyboard: [[{ text: "🇺🇿 O'zbekcha", callback_data: 'lg|uz' }, { text: '🇬🇧 English', callback_data: 'lg|en' }]] };
const helpText = (lang) => T(lang,
  "Assalomu alaykum! 🌷 Har kuni soat 12:00, 16:00 va 20:00 da bugungi menyu keladi. Tugmani bosib ro'yxatni oching va tayyor bo'lgan ovqatni belgilang.\n\n/bugun — bugungi ro'yxat\n/ertaga — ertangi menyu\n/til — tilni tanlash",
  'Assalamu alaykum! 🌷 Every day at 12:00, 16:00 and 20:00 you get today\'s menu. Press the button to open the list and tick each food when it is ready.\n\n/today — today\'s list\n/tomorrow — tomorrow\'s menu\n/language — choose the language');

async function sendToday(env, cfg, chatId) {
  const lang = langOf(cfg, chatId), date = today(), slot = hourNow() < 16 ? '12' : hourNow() < 20 ? '16' : '20';
  if (!MENU[date]) return tg(env, 'sendMessage', { chat_id: chatId, text: T(lang, "Bugun uchun menyu yo'q. Yaxshi dam oling 🌸", 'There is no menu for today. Have a good rest 🌸') });
  return tg(env, 'sendMessage', { chat_id: chatId, text: build(date, slot, await getState(env, date), lang), parse_mode: 'HTML', reply_markup: openButton(cfg, lang, date), disable_web_page_preview: true });
}

async function onCallback(env, q) {
  const d = (q.data || '').split('|'), from = String(q.from.id), cfg = await getCfg(env);
  await tg(env, 'answerCallbackQuery', { callback_query_id: q.id });
  if (d[0] === 'lg' && cfg.chats[from]) {
    cfg.langs[from] = d[1] === 'en' ? 'en' : 'uz'; await saveCfg(env, cfg);
    await tg(env, 'sendMessage', { chat_id: from, text: T(cfg.langs[from], "Til: O'zbekcha ✅", 'Language: English ✅') });
    return sendToday(env, cfg, from);
  }
  if (d[0] !== 'ok' || from !== cfg.owner || !cfg.pending[d[1]]) return;
  cfg.chats[d[1]] = cfg.pending[d[1]]; delete cfg.pending[d[1]]; await saveCfg(env, cfg);
  await tg(env, 'sendMessage', { chat_id: from, text: h(cfg.chats[d[1]]) + T(langOf(cfg, from), " qo'shildi ✅", ' was added ✅') });
  await tg(env, 'sendMessage', { chat_id: d[1], text: "Ruxsat berildi 🌷 Endi xabarlar sizga ham keladi.\nYou are in 🌷 Messages will now come to you too.\n\nTilni tanlang / Choose your language:", reply_markup: LANG_KB });
}

async function onMessage(env, msg) {
  if (!msg.chat || msg.chat.type !== 'private') return;
  const chatId = String(msg.chat.id), text = (msg.text || '').trim(), name = (msg.from && msg.from.first_name) || 'Mehmon';
  const cfg = await getCfg(env), is = (...c) => c.some((x) => text.indexOf(x) === 0);
  if (!cfg.owner && is('/start')) { cfg.owner = chatId; cfg.start = today(); cfg.chats[chatId] = name; await saveCfg(env, cfg); }
  if (!cfg.chats[chatId]) {
    if (!is('/start')) return;
    cfg.pending[chatId] = name; await saveCfg(env, cfg);
    await tg(env, 'sendMessage', { chat_id: cfg.owner, text: h(name) + T(langOf(cfg, cfg.owner), " botga qo'shilmoqchi. Ruxsat berasizmi?", ' wants to join the bot. Allow?'), reply_markup: { inline_keyboard: [[{ text: T(langOf(cfg, cfg.owner), '✅ Ruxsat berish', '✅ Allow'), callback_data: 'ok|' + chatId }]] } });
    return tg(env, 'sendMessage', { chat_id: chatId, text: "So'rov yuborildi. Ruxsat berilishini kuting 🌸\nRequest sent. Please wait for approval 🌸" });
  }
  const lang = langOf(cfg, chatId), date = today();
  if (is('/start')) return tg(env, 'sendMessage', { chat_id: chatId, text: helpText(lang) + '\n\nTilni tanlang / Choose your language:', reply_markup: LANG_KB });
  if (is('/til', '/language', '/lang')) return tg(env, 'sendMessage', { chat_id: chatId, text: 'Tilni tanlang / Choose your language:', reply_markup: LANG_KB });
  if (is('/tarix', '/history')) {
    if (chatId !== cfg.owner) return tg(env, 'sendMessage', { chat_id: chatId, text: T(lang, 'Tarix faqat admin uchun.', 'History is for the admin only.') });
    const rg = parseRange(text), all = await history(env, cfg, lang), hs = rg ? all.filter((x) => x.d >= rg[0] && x.d <= rg[1]) : all.slice(0, 7);
    const L = ['<b>📊 ' + (rg ? (rg[0] === rg[1] ? fd(lang, rg[0]) : fd(lang, rg[0]) + ' — ' + fd(lang, rg[1])) : T(lang, 'Oxirgi kunlar', 'Recent days')) + '</b>', ''];
    if (!hs.length) L.push(T(lang, "Bu kunlar uchun ma'lumot yo'q.", 'No data for these days.'), '', T(lang, 'Misol: /tarix 5   yoki   /tarix 5-12   yoki   /tarix 28.11-3.12', 'Example: /history 5   or   /history 5-12   or   /history 28.11-3.12'));
    hs.forEach((x) => L.push('<b>' + fd(lang, x.d, true) + '</b>: ' + x.pct + '% (' + x.done + '/' + x.all + ')' + (x.left.length ? '\n   ' + T(lang, 'Qolgan: ', 'Left: ') + x.left.map(h).join(', ') : ' ✅')));
    if (hs.length) L.push('', T(lang, "O'rtacha: ", 'Average: ') + '<b>' + Math.round(hs.reduce((a, x) => a + x.pct, 0) / hs.length) + '%</b>');
    return tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: L.join('\n'), reply_markup: { inline_keyboard: [[{ text: T(lang, "📊 To'liq tarixni ochish", '📊 Open full history'), web_app: { url: appUrl(cfg, lang, date) + '&v=tarix' + (rg ? '&f=' + rg[0] + '&t=' + rg[1] : '') } }]] } });
  }
  if (is('/ertaga', '/tomorrow')) {
    const nk = nextMenuDay(date) || DAYS.find((d) => d > date);
    if (!nk) return tg(env, 'sendMessage', { chat_id: chatId, text: T(lang, 'Ertangi menyu hali kiritilmagan.', 'The next menu has not been added yet.') });
    const m = MENU[nk];
    return tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', reply_markup: openButton(cfg, lang, nk), text: '<b>📅 ' + fd(lang, nk, true) + '</b>\n\n🌅 ' + h(dn(lang, m.ertalab)) + '\n' + m.tushlik.map((x) => '🍚 ' + h(dn(lang, x))).join('\n') + (m.kechki ? '\n🍎 ' + h(dn(lang, m.kechki)) : '') });
  }
  return sendToday(env, cfg, chatId);
}

// ---- mini app: checks that the request really comes from Telegram and from an approved person ----
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}
async function webhookSecret(env) { return hex(await crypto.subtle.digest('SHA-256', enc.encode('hook:' + env.BOT_TOKEN))).slice(0, 40); }
async function authUser(env, initData) {
  if (!initData) return null;
  const q = new URLSearchParams(initData), hash = q.get('hash'); if (!hash) return null;
  q.delete('hash');
  const check = [...q.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
  const sig = hex(await hmac(await hmac('WebAppData', env.BOT_TOKEN), check));
  if (sig !== hash) return null;
  if (Date.now() / 1000 - Number(q.get('auth_date') || 0) > 7 * 86400) return null;
  try { return String(JSON.parse(q.get('user')).id); } catch (e) { return null; }
}
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json' } });

async function api(env, req, path) {
  const u = await authUser(env, req.headers.get('x-init')), cfg = await getCfg(env);
  if (!u || !cfg.chats[u]) return json({ error: 'no' }, 403);
  const b = await req.json().catch(() => ({}));
  if (path === 'state') return json(MENU[b.date] ? await getState(env, b.date) : {});
  if (path === 'tick') { await tick(env, cfg, u, String(b.date), String(b.key), !!b.val); return json({ ok: 1 }); }
  if (path === 'history') return u === cfg.owner ? json(await history(env, cfg, langOf(cfg, u))) : json({ error: 'no' }, 403);
  if (path === 'lang') { cfg.langs[u] = b.lang === 'en' ? 'en' : 'uz'; await saveCfg(env, cfg); return json({ ok: 1 }); }
  return json({ error: 'not found' }, 404);
}

async function setup(env, origin) {
  const cfg = await getCfg(env); cfg.url = origin; await saveCfg(env, cfg);
  const hook = await tg(env, 'setWebhook', { url: origin + '/tg', secret_token: await webhookSecret(env), allowed_updates: ['message', 'callback_query'] });
  const cmds = [{ command: 'bugun', description: "Bugungi ro'yxat / Today's list" }, { command: 'ertaga', description: 'Ertangi menyu / Tomorrow' }, { command: 'til', description: 'Til / Language' }];
  const c = await tg(env, 'setMyCommands', { commands: cmds });
  return new Response(hook.ok && c.ok ? 'Tayyor! Endi Telegramda botga /start yuboring.\nReady! Now send /start to the bot in Telegram.' : 'Xato / Error: ' + JSON.stringify(hook) + '\nBOT_TOKEN to\'g\'ri kiritilganini tekshiring. Check that BOT_TOKEN is set correctly.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    try {
      if (p === '/app') return new Response(url.searchParams.get('l') === 'en' ? APP_EN : APP_UZ, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      if (p.indexOf('/api/') === 0 && req.method === 'POST') return await api(env, req, p.slice(5));
      if (p === '/tg' && req.method === 'POST') {
        if (req.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret(env))) return new Response('no', { status: 403 });
        const u = await req.json();
        try { if (u.callback_query) await onCallback(env, u.callback_query); else if (u.message) await onMessage(env, u.message); } catch (e) { console.error(e); }
        return new Response('ok');
      }
      if (p === '/setup') return await setup(env, url.origin);
    } catch (e) { console.error(e); return new Response('error', { status: 500 }); }
    return new Response('Bolajon menu bot');
  },
  // Timers are in UTC: 03:00, 07:00, 11:00, 12:00 UTC = 12:00, 16:00, 20:00, 21:00 in Korea
  async scheduled(event, env, ctx) {
    const hr = new Date(event.scheduledTime).getUTCHours();
    const slot = { 3: '12', 7: '16', 11: '20' }[hr];
    ctx.waitUntil(slot ? sendSlot(env, slot) : hr === 12 ? send21(env) : Promise.resolve());
  },
};
