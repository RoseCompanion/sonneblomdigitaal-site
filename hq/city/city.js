// Sonneblom City: the HQ dashboard as a 3D neon city. Each business is a building, stats live on billboards,
// the Vault holds the money, and the Library is where the owner talks to Claude (portal API on the server).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

const $ = s => document.querySelector(s);
const KEY = "hq-pass";
const API = "https://chat.sonneblomdigitaal.co.za/claude/api";
const MOBILE = matchMedia("(max-width: 700px)").matches || "ontouchstart" in window;
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = n => "$" + (Math.round((n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const num = n => (n ?? 0).toLocaleString("en-US");
const ago = ts => { const m = Math.round((Date.now() - new Date(ts)) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const isToday = ts => new Date(ts).toDateString() === new Date().toDateString();
let PW = null, D = null, M = null, svc = null;
const DEMO = !!window.CITY_DEMO;  // public demo (/city-tour/city/): sample numbers from demo.json, no password, no private links
// Guest pass (owner 2026-10-07): /hq/city/#g=<key> opens the REAL city read-only for a friend: data from data.guest.enc.json
// (encrypted with the guest key, removed by build.py when the pass expires), no Library/actions/Assign/Go Bananas/links.
const GKEY = DEMO ? null : new URLSearchParams(location.hash.slice(1)).get("g"), GUEST = !!GKEY;
const GUEST_QA = "https://chat.sonneblomdigitaal.co.za/guest/?k=" + encodeURIComponent(GKEY || "");
const scrub = t => DEMO ? String(t).replace(/Rose's|Rose/g, "Brand B") : t;

// ---------- data ----------
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decrypt(pw) {
  if (DEMO) {  // sample data; sales marked {ago: minutes} are moved to 'today' so the money beams light up
    const d = await (await fetch("demo.json?t=" + Date.now(), { cache: "no-store" })).json();
    for (const ch of ["etsy", "gumroad"]) (d.snapshot[ch].sales || []).forEach(x => { if (x.ago != null) x.ts = new Date(Date.now() - x.ago * 60000).toISOString(); });
    return d;
  }
  const enc = await (await fetch((GUEST ? "../data.guest.enc.json" : "../data.enc.json") + "?t=" + Date.now(), { cache: "no-store" })).json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(enc.salt), iterations: enc.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, key, b64(enc.ct))));
}

function model(D) {
  const s = D.snapshot, m = D.manual || {};
  const et = s.etsy || {}, gu = s.gumroad || {}, pf = s.printify || {}, ap = s.apify || {}, x4 = s.x402 || {};
  const kr = s.krypto || {}, bo = s.bots || {};
  const pnl = n => (n < 0 ? "-$" : "+$") + Math.abs(n || 0).toFixed(2);
  const botRows = x => [["Best day", `${pnl(x.best_day)} (${(x.best_day_date || "").slice(5)})`], ["Best trade", pnl(x.best_trade)], ["Lifetime", pnl(x.lifetime)], ["Bot", x.running ? "running" : "stopped"]];
  const botSheet = x => [["Profit today", pnl(x.today)], ["Lifetime profit", pnl(x.lifetime)], ["Trades", num(x.trades)], ["Wins", `${num(x.wins)} (${x.trades ? Math.round(100 * x.wins / x.trades) : 0}%)`],
    ["Highest profit trade", `${pnl(x.best_trade)} · ${x.best_trade_day || ""}`], ["Worst trade", pnl(x.worst_trade)],
    ["Highest profit day", `${pnl(x.best_day)} · ${x.best_day_date || ""}`], ["Worst day", `${pnl(x.worst_day)} · ${x.worst_day_date || ""}`],
    ["Days traded", x.days_traded ?? "–"], ["Last trade", x.last_trade ? ago(x.last_trade) : "–"], ["Bot", x.running ? "🟢 running" : "⚪ stopped"]];
  const ks = bo.kalshi || {}, pm = bo.polymarket || {}, kb = bo.krypto || {};
  const ls = s.longshot || {}; const lb = s.lsbot || {}; const lr = s.lslive || {}; const polyReal = lr.value != null ? +(lr.value - (lr.start_real || lr.start || 19.53)).toFixed(2) : 0; const kx = s.k10x || {}; const sb = s.solbot || {}; const cb = s.copybot || {}; const br = s.botrace || {}; const brr = br.racers || []; const wp = s.whop || {}; const yt = s.youtube || {};
  const race = [{ name: "Polymarket LIVE", method: "same style, REAL money", value: lr.value, start: lr.start_real || lr.start || 19.53, trades: lr.trades || 0, wins: lr.wins || 0, live: true },
    { name: "Polymarket", method: "momentum on favourites", value: lb.value, trades: lb.trades || 0, wins: lb.wins || 0 },
    { name: "Copy Desk", method: "copies 5 top Polymarket traders", value: cb.value, start: cb.start || 125, trades: sum(cb.traders || [], t => t.trades), wins: sum(cb.traders || [], t => t.wins) },
    { name: "Kalshi", method: "fair value (price + volatility)", value: kx.value, trades: kx.trades || 0, wins: kx.wins || 0 },
    { name: "Phantom SOL", method: "dip buying (mean reversion)", value: sb.value, trades: sb.trades || 0, wins: sb.wins || 0 }]
    .filter(x => x.value != null).map(x => ({ start: 25, ...x })).sort((a, b) => (b.value - b.start) / b.start - (a.value - a.start) / a.start);
  const leader = race.length ? race[0].name : "–";
  const pnlU = (v, st) => ((v || 0) - st < 0 ? "-$" : "+$") + Math.abs((v || 0) - st).toFixed(2);
  const pct = (v, st) => ((v || 0) >= st ? "+" : "") + ((((v || 0) - st) / st) * 100).toFixed(1) + "%";
  const place = n => { const i = race.findIndex(r => r.name === n); return i < 0 ? "–" : ["🥇 1st", "🥈 2nd", "🥉 3rd"][i] || (i + 1) + "th"; };  // $25 -> $250 attempt (Polymarket long shots, owner places bets)
  const fb = s.facebook || {}, ro = s.rose || {}, ig = s.instagram || {}, rs = s.rose_social || {}, md = s.media || {};
  const rd = s.rose_diary || {}, ct = s.contra || {}, ox = s.outreach || {};
  const ia = (s.influencers || {}).accounts || [];
  const pi = s.pinterest || {}, gh = s.github || {}, sh = s.showroom || {}, rn = s.rnd || {}, av = s.avatars || {}, aw = s.aiworks;
  const shF = sh.funnel || {};
  const shSt = sh.stages || [], shDone = shSt.filter(x => x.done).length, shNext = shSt.find(x => !x.done);
  const shOpen = ["listing", "checkout"].every(id => (shSt.find(x => x.id === id) || {}).done);  // selling live = an open store, not a building site
  const plus = n => n == null ? "–" : (n >= 0 ? "+" : "") + num(n);
  const L = et.listings || [], G = gu.listings || [];
  const eS = et.sales || [], gS = gu.sales || [];
  function sum(a, f) { return a.reduce((t, x) => t + (+f(x) || 0), 0); }
  const today = a => a.filter(x => isToday(x.ts));
  const last7 = k => sum((fb.daily?.[k] || []).slice(-7), x => x.value);
  const st = ch => (s[ch]?.stale ? "stale" : "ok");
  const sv = name => svc ? (svc[name] === "active" ? "ok" : "down") : "unknown";
  const worst = (...a) => a.includes("down") ? "down" : a.includes("stale") ? "stale" : a.includes("unknown") ? "unknown" : "ok";
  const adsSpend = (fb.ads?.spend || 0) + (rs.ad_spend || 0);
  const adsActive = (rs.ads_active || 0) + (fb.ads?.status === "ACTIVE" ? 1 : 0);
  const runs = sum(ap.actors || [], a => a.runs), apUsers = sum(ap.actors || [], a => a.users);
  const views = sum(L, x => x.views), favs = sum(L, x => x.favs);
  const eTot = sum(eS, x => x.amount), gTot = sum(gS, x => x.amount);
  const eDay = sum(today(eS), x => x.amount), gDay = sum(today(gS), x => x.amount);
  const roseZar = ro.card_revenue_zar || 0;
  const topViewed = [...L].sort((a, b) => b.views - a.views).slice(0, 6);
  const postsToday = (fb.posts || []).filter(p => isToday(p.ts)).length + (ig.media || []).filter(p => isToday(p.ts)).length;

  // Media billboard: the new faces (every influencer but Rose) and the ventures being tested; Factory Output rows; bot homes
  const faces = ia.length ? ia.filter(a => a.id !== "rose" && !a.error) : (av.avatars || []).slice(0, 4).map(a => ({ name: a.short || a.name, emoji: a.emoji, username: a.status }));
  const prod = { hubSales: (shF.page || {}).paid ?? sh.sales ?? 0, hubVisits: (shF.page || {}).visits ?? 0, faces: ia.length || (av.avatars || []).length, followers: sum(ia, a => a.followers) };
  const ideasL = (s.ideas || {}).items || [], ventures = (ideasL.filter(x => ["testing", "live"].includes(x.status)).length ? ideasL.filter(x => ["testing", "live"].includes(x.status)) : ideasL.filter(x => x.status !== "dropped")).slice(0, 5);
  const output = [["🛍️ Etsy", `${num(L.length)} listings`, `${num(eS.length)} orders`, usd(eTot)], ["🎨 Gumroad", `${num(G.length)} products`, `${num(gS.length)} sales`, usd(gTot)],
    ["📦 KDP", `${m.kdp_books ?? 0} books`, `${m.kdp_sales ?? 0} sales`, usd(m.kdp_royalty || 0)], ["🧪 API Lab", `${(ap.actors || []).length} actors`, `${num(runs)} runs`, "$" + (x4.balance_usdc ?? 0)],
    ["🐙 GitHub", `${num(gh.repos)} repos`, `${num(gh.commits_7d)} commits/wk`, ""], ["🏬 Warehouses", `${num(L.filter(x => !x.physical).length + G.length)} digital`, `${num(L.filter(x => x.physical).length)} printed`, ""]];
  const team = (s.staff || {}).staff || [], mgrs = team.filter(x => x.role === "manager");
  const tops = mgrs.map(mg => { const t = team.filter(x => x.boss === mg.id); return t.find(x => x.status === "working") || t[0]; }).filter(Boolean);
  const homes = DEMO ? [] : [...mgrs, ...tops].map((x, i, a) => {
    const an = i / a.length * Math.PI * 2 + 0.26, [cx, cz] = DIST[4].c, R = 27;
    return { id: "home_" + x.id, name: `${x.name}'s home`, short: x.name, icon: x.emoji, color: parseInt((STC[x.status] || "#7d74a8").slice(1), 16), pos: [cx + Math.sin(an) * R, cz - Math.cos(an) * R],
      w: 7, d: 6, h: 4, kind: "home", face: [-Math.sin(an), Math.cos(an)], home: true, neonOnly: true, noPay: true, staff: x,
      status: x.status === "late" ? "stale" : "ok", today: 0, total: 0, tag: [x.title || (x.job || "").split(":")[0].slice(0, 28), x.status],
      board: { title: x.name, main: x.status, mainLabel: x.title || "", rows: [] }, sheet: () => homeHTML(x, team) };
  });

  // Trading Town = the AI Bot Race (owner 2026-10-10): only the 10 racers, one building each, height grows with the bankroll
  const RSLOT = [[-32.5, -168], [-19.5, -168], [-6.5, -168], [6.5, -168], [19.5, -168], [32.5, -168], [-26, -146], [-13, -146], [0, -146], [13, -146], [26, -146]];
  const RORD = ["longshot", "kalshi", "sol", "weather", "bond", "bull"];
  const RDESC = { longshot: "Polymarket momentum: favourites at 60-90c ending within a day whose price is rising; sells at 97c, stop at -25%.",
    kalshi: "Kalshi fair value: Coinbase price + 6 h volatility -> real probability for Bitcoin/Ethereum 'above $X' markets; buys when Kalshi is 8c too cheap.",
    sol: "SOL dip buyer: buys unusual drops vs the 4-hour average (z-score), skips falling knives, sells at +1.5%, stop -4%. Real Jupiter quotes.",
    weather: "Kalshi daily high-temperature brackets in 7 US cities: NWS forecast + live station readings, buys when 8c+ under fair value.",
    bull: "Always bets Bitcoin goes UP: buys 'Up' on every 15-minute Polymarket Bitcoin market with 10% of the bankroll, holds to the result.",
    bond: "Polymarket 'bonds': outcomes at 90-97c ending within 48 h, 10% per bet, max 8, max 2 crypto, stop at -15%." };
  const rRank = id => brr.findIndex(x => x.id === id) + 1;
  const rOrder = [...brr].sort((a, b) => { const ia = RORD.indexOf(a.id), ib = RORD.indexOf(b.id); if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); return (a.joined || 0) - (b.joined || 0) || a.name.localeCompare(b.name); });
  const RACERS = rOrder.slice(0, 11).map((r, i) => {
    const rk = rRank(r.id), up = (r.pct || 0) >= 0, trader = r.who === "TOP TRADER";
    return { id: "racer_" + r.id, name: r.name, short: r.name.toUpperCase().slice(0, 14), icon: trader ? "👤" : "🤖", color: parseInt((r.color || "#9945ff").slice(1), 16),
      pos: RSLOT[i], w: 8.5, d: 7, h: Math.round(10 + Math.max(0, Math.min(22, (r.value / (r.start || 1000) - 0.7) * 30))), kind: "coin", face: [0, 1],
      status: br.status === "running" ? "ok" : "unknown", today: 0, total: 0,
      tag: [`${usd(r.value)} · ${up ? "+" : ""}${(r.pct || 0).toFixed(1)}%`, `#${rk} · ${trader ? "top trader" : r.who === "NEW BOT" ? "new bot" : "our bot"} · ${r.venue}`],
      board: { title: r.name.toUpperCase(), main: usd(r.value), mainLabel: `#${rk} of ${brr.length} in the race · ${br.status || "waiting"}`,
        rows: [["Return", `${up ? "+" : ""}${(r.pct || 0).toFixed(1)}%`], ["Trades", num(r.trades || 0)], ["Won", num(r.wins || 0)], ["Open", num(r.open || 0)], ["Venue", r.venue]] },
      sheet: () => sheetHTML(r.name, trader ? `Top Polymarket trader, copied trade for trade with $1,000 practice money (same share of the bankroll they use, 1c worse prices). Every Monday the 2 worst traders are swapped out.` : (RDESC[r.id] || r.venue),
        usd(r.value), `#${rk} of ${brr.length} · started with ${usd(r.start || 1000)}`,
        [["Return", `${up ? "+" : ""}${(r.pct || 0).toFixed(2)}%`], ["Trades closed", num(r.trades || 0)], ["Won", num(r.wins || 0)], ["Open now", num(r.open || 0)], ["Type", r.who.toLowerCase()], ["Venue", r.venue]],
        (r.log || []).map(l => [l.msg, (l.ts || "").slice(5, 16).replace("T", " ")]), "Latest trades",
        trader && r.wallet ? `https://polymarket.com/profile/${r.wallet}` : "", (br.started ? "Race started " + br.started.slice(0, 16).replace("T", " ") + " UTC." : "Race starts when the YouTube stream goes live.") + " Paper money, real prices.") };
  });
  const B = [
    ...(DEMO ? [] : RACERS),
    { id: "etsy", name: "Etsy Megastore", short: "ETSY", icon: "🛍️", color: 0xff8a3d, pos: [120, -16], w: 13, d: 9, h: 12, kind: "factory", face: [0, 1],
      status: st("etsy"), today: eDay, total: eTot,
      tag: [`${num(L.length)} listings`, eDay ? usd(eDay) + " today" : `${num(views)} views`],
      board: { title: "ETSY MEGASTORE", main: num(views), mainLabel: "listing views (all time)",
        rows: [["Orders", num(eS.length)], ["Revenue", usd(eTot)], ["Favourites", num(favs)], ["Listings", num(L.length)], ["POD products", num(pf.products)], ["Shop visits", m.etsy_visits ?? "–"]] },
      sheet: () => sheetHTML("Etsy Megastore", "Physical gifts (Printify) + digital downloads", eTot, "revenue all time",
        [["Orders", eS.length], ["Today", usd(eDay)], ["Listing views", num(views)], ["Favourites", num(favs)], ["Listings", L.length],
         ["Printify products", pf.products ?? "–"], ["Printify orders", pf.orders ?? 0], ["Shop visits", m.etsy_visits ?? "–"], ["Ads clicks", m.etsy_ads_clicks ?? "–"]],
        topViewed.map(x => [x.title, `${x.views} views`]), "Most viewed listings", "https://www.etsy.com/your/shops/me/dashboard") },

    { id: "fb", name: "Meta Skyscraper", short: "META", icon: "📡", color: 0x3b82f6, pos: [-152, -24], w: 11, d: 11, h: 46, kind: "mega", face: [1, 0],
      status: worst(st("facebook"), st("instagram"), st("rose_social")), today: 0, total: 0,
      tag: [`${num(md.views ?? 0)} views`, `${num(md.followers ?? 0)} followers`],
      board: { title: "META SKYSCRAPER", main: num(md.followers ?? 0), mainLabel: "followers (Rose + SHC + Sonneblom)",
        rows: [["Total views", num(md.views ?? 0)], ...(md.accounts || []).map(a => [a.name, `${num(a.followers)} · ${a.views == null ? "–" : num(a.views)} views`]), ["IG views 24h", num(ig.views_24h ?? 0)]] },
      sheet: () => sheetHTML("Meta Skyscraper", "Rose, Side Hustle City + Sonneblom pages, Instagram, ads", md.followers ?? 0, "followers across all accounts",
        [["Total followers", num(md.followers ?? 0)], ["Total views", num(md.views ?? 0)],
         ...(md.accounts || []).flatMap(a => [[a.name + " followers", num(a.followers)], [a.name + " views", a.views == null ? "– (Go Bananas)" : num(a.views)]]),
         ["IG followers", ig.followers], ["IG posts", ig.posts], ["IG views", num(ig.views)], ["IG likes", ig.likes], ["IG comments", ig.comments],
         ["Rose FB followers", rs.fb_followers], ["Rose FB views", num(rs.fb_post_views)], ["Sonneblom followers", fb.followers],
         ["Sonneblom 7d views", num(last7("page_media_view"))], ["Posts today", postsToday], ["Ad spend", "R" + num(Math.round(adsSpend))], ["Ad clicks", num((rs.ad_clicks || 0) + (fb.ads?.clicks || 0))], ["Ads live", adsActive]],
        (ig.media || []).slice(0, 6).map(x => [x.text || x.type, `${x.views} views`]), "Latest Instagram posts", "https://business.facebook.com/latest/home") },

    { id: "ig", name: "Instagram Studio", short: "INSTAGRAM", icon: "📸", color: 0xe1306c, pos: [-130, 10], w: 8, d: 8, h: 20, kind: "glass", face: [1, 0],
      status: st("instagram"), today: 0, total: 0,
      tag: [`${num(sum(ia, a => a.followers))} followers`, `${num(sum(ia, a => a.views_24h))} views 24h`],
      board: { title: "INSTAGRAM", main: num(sum(ia, a => a.followers)), mainLabel: `followers · ${ia.filter(a => a.followers != null).length} accounts`,
        rows: ia.filter(a => a.followers != null).slice(0, 5).map(a => [`${a.emoji || ""} ${a.name}`, `${num(a.followers)} · ${num(a.views_24h)} views 24h`]) },
      sheet: () => sheetHTML("Instagram Studio", "Every Instagram account in one studio: reels, followers and views", sum(ia, a => a.followers), "followers across all accounts",
        [["Views 24h", num(sum(ia, a => a.views_24h))], ["Views 7d", num(sum(ia, a => a.views_7d))], ["Likes", num(sum(ia, a => a.likes))], ["Comments", num(sum(ia, a => a.comments))],
         ...ia.map(a => [`${a.emoji || ""} ${a.name}${a.username ? " @" + a.username : ""}`, a.error ? a.error : `${num(a.followers)} followers · ${num(a.posts)} posts`])],
        ia.filter(a => a.top).map(a => [`${a.name}: ${a.top.text || "top post"}`, `${num(a.top.views)} views`]), "Top post per account", "https://www.instagram.com/") },

    { id: "youtube", name: "YouTube Tower", short: "YOUTUBE", icon: "📺", color: 0xff0033, pos: [-162, 26], w: 8, d: 8, h: 36, kind: "spire", face: [1, 0],
      status: yt.ts ? "ok" : "unknown", today: 0, total: 0,  // views are not money (owner 2026-10-10: it showed $151)
      tag: yt.ts ? [`${num(yt.subs || 0)} subs · ${num(yt.views || 0)} views`, `${(yt.list || []).length} videos · ${yt.live_ready ? "LIVE ready" : "live unlocks soon"}`] : ["connecting", ""],
      board: { title: "AI BOT RACE · YOUTUBE", main: `${num(yt.subs || 0)} subs`, mainLabel: `${num(yt.views || 0)} channel views`, rows: (yt.list || []).slice(0, 6).map(v => [v.title.slice(0, 26), v.privacy === "public" ? `${num(v.views)} views` : "⏳ " + v.privacy]) },
      sheet: () => sheetHTML("YouTube Tower", "The AI Bot Race channel: how-we-built-it series (uploaded by API, scheduled; approve in the YouTube app) plus the 24/7 live race once streaming unlocks. Series 2 = the City, 3 = AI influencers, 4 = e-commerce.",
        `${num(yt.subs || 0)} subs`, `${num(yt.views || 0)} views · ${(yt.list || []).length} videos`,
        (yt.list || []).map(v => [v.title, v.privacy === "public" ? `${num(v.views)} views` : `${v.privacy}`]), [], "", "https://studio.youtube.com", "Updated " + (yt.ts || "–")) },

    { id: "contra", name: "Contra Studio", short: "CONTRA", icon: "💼", color: 0x00e5ff, pos: [-26, 18], w: 7, d: 7, h: 26, kind: "glass", face: [1, 0],
      status: "ok", today: 0, total: ct.earned_usd || 0,
      tag: [`${num(ct.busy)} jobs busy`, `${num(ct.done)} done`],
      board: { title: "CONTRA STUDIO", main: num(ct.sent), mainLabel: "proposals / jobs sent",
        rows: [["Jobs busy", num(ct.busy)], ["Jobs done", num(ct.done)], ["Projects linked", num(ct.projects)], ["Earned", usd(ct.earned_usd)], ["Profile views", ct.views ? num(ct.views) : "–"]] },
      sheet: () => sheetHTML("Contra Studio", "Freelance digital studio (websites, AI automation, brand & content)", ct.sent ?? 0, "jobs / proposals sent",
        [["Jobs busy", num(ct.busy)], ["Jobs done", num(ct.done)], ["Projects linked", num(ct.projects)], ["Earned", usd(ct.earned_usd)], ["Profile views", ct.views ? num(ct.views) : "–"]], [],
        "", "https://contra.com/opportunities", `Contra has no API, so these come from a Go Bananas sweep${ct.at ? ` (${esc(ct.at)})` : ""}. Tell Claude when a job starts or finishes.`) },

    { id: "zoho", name: "Zoho Mail Outreach", short: "OUTREACH", icon: "✉️", color: 0xffe14d, pos: [26, 18], w: 9, d: 7, h: 11, kind: "mail", face: [-1, 0],
      status: st("outreach"), today: 0, total: ox.paid_eur || 0,
      tag: [`${num(ox.sent_today)} sent today`, `${num(ox.replied)} replies`],
      board: { title: "EAA OUTREACH", main: num(ox.sent_total), mainLabel: "emails sent (eaafix.com)",
        rows: [["Sent today", num(ox.sent_today)], ["Replies", num(ox.replied)], ["Interested", num(ox.interested)], ["Quotes", num(ox.quoted)], ["Won", num(ox.won)], ["Queue", num(ox.queue)]] },
      sheet: () => sheetHTML("Zoho Mail Outreach", "EAA accessibility fixes · hello@eaafix.com · cold email, 20+/day", ox.sent_total ?? 0, "emails sent",
        [["Sent today", num(ox.sent_today)], ["Leads found", num(ox.leads)], ["Waiting to send", num(ox.queue)], ["Followed up", num(ox.followed_up)], ["Replies", num(ox.replied)],
         ["Interested", num(ox.interested)], ["Reports sent", num(ox.reports)], ["Quotes", num(ox.quoted)], ["Won", num(ox.won)], ["Paid", "€" + num(ox.paid_eur || 0)],
         ["Bounced", num(ox.bounced)], ["Opted out", num(ox.opted_out)]], [], "", "https://mail.zoho.com", "Sender runs weekdays 09:00; replies and bounces are checked every 20 minutes.") },

    { id: "gumroad", name: "Gumroad Arcade", short: "GUMROAD", icon: "🎨", color: 0x2ee6c5, pos: [135, -16], w: 11, d: 9, h: 10, kind: "factory", face: [0, 1],
      status: st("gumroad"), today: gDay, total: gTot,
      tag: [`${num(gS.length)} sale${gS.length === 1 ? "" : "s"}`, usd(gTot)],
      board: { title: "GUMROAD ARCADE", main: usd(gTot), mainLabel: "revenue (all time)",
        rows: [["Sales", num(gS.length)], ["Today", usd(gDay)], ["Products", num(G.length)], ["Page views", m.gumroad_views ?? "–"]] },
      sheet: () => sheetHTML("Gumroad Arcade", "Digital downloads + Blender add-ons", gTot, "revenue all time",
        [["Sales", gS.length], ["Today", usd(gDay)], ["Products", G.length], ["Live", G.filter(x => x.published).length], ["Page views", m.gumroad_views ?? "–"]],
        gS.slice(-6).reverse().map(x => [x.product, `${usd(x.amount)} · ${ago(x.ts)}`]), "Sales", "https://gumroad.com/dashboard") },

    { id: "kdp", name: "Amazon KDP Books", short: "KDP", icon: "📦", color: 0xffb020, pos: [150, -16], w: 11, d: 9, h: 10, kind: "factory", face: [0, 1],
      status: "ok", today: 0, total: m.kdp_royalty || 0,
      tag: [`${m.kdp_books ?? 0} books live`, `${m.kdp_drafts ?? 0} drafts`],
      board: { title: "AMAZON KDP", main: String(m.kdp_books ?? 0), mainLabel: "paperbacks published",
        rows: [["Drafts", m.kdp_drafts ?? 0], ["Sales", m.kdp_sales ?? 0], ["Royalties", usd(m.kdp_royalty || 0)]] },
      sheet: () => sheetHTML("Amazon KDP Books", "New small business · paperbacks under pen names", m.kdp_books ?? 0, "books published",
        [["Drafts", m.kdp_drafts ?? 0], ["Sales", m.kdp_sales ?? 0], ["Royalties", usd(m.kdp_royalty || 0)], ["Print-ready on disk", 25]], [],
        "", "https://kdp.amazon.com/en_US/bookshelf", `KDP has no API, so these numbers are entered by hand (${esc(m.kdp_at || "")}). Tell Claude in the Library when they change.`) },

    { id: "lab", name: "API Lab", short: "LAB", icon: "🧪", color: 0xa78bfa, pos: [165, -16], w: 11, d: 9, h: 10, kind: "factory", face: [0, 1],
      status: worst(st("apify"), st("x402"), sv("x402-agentedge")), today: 0, total: 0,
      tag: [`${num(runs)} runs`, `${(ap.actors || []).length} actors`],
      board: { title: "API LAB", main: num(runs), mainLabel: "Apify runs (all time)",
        rows: [["Actors", (ap.actors || []).length], ["Users", num(apUsers)], ["x402 USDC", "$" + (x4.balance_usdc ?? 0)], ["x402 paid calls", x4.external_tx_since_oct2 ?? 0]] },
      sheet: () => sheetHTML("API Lab", "Apify actors + x402 AgentEdge API", runs, "Apify runs",
        [["Actors", (ap.actors || []).length], ["Users", apUsers], ["x402 balance", "$" + (x4.balance_usdc ?? 0)], ["x402 paid calls", x4.external_tx_since_oct2 ?? 0], ["x402 server", svLabel("x402-agentedge")]],
        [...(ap.actors || [])].sort((a, b) => b.runs - a.runs).slice(0, 6).map(a => [a.title, `${a.runs} runs`]), "Busiest actors", "https://console.apify.com/actors") },

    { id: "whop", name: "Whop Store", short: "WHOP", icon: "🛍️", color: 0xff6243, pos: [112, 24], w: 11, d: 9, h: 14, kind: "coin", face: [0, 1],
      status: wp.ts ? "ok" : "unknown", today: 0, total: wp.revenue_usd || 0,
      tag: wp.ts ? [`${usd(wp.revenue_usd || 0)} · ${wp.sales || 0} sales`, `${(wp.products || []).length} products · ${wp.members || 0} members`] : ["setting up", ""],
      board: { title: "WHOP STORE", main: usd(wp.revenue_usd || 0), mainLabel: `${wp.sales || 0} sales · ${wp.members || 0} members`, rows: (wp.products || []).map(p => [p.title.slice(0, 22), `${p.members} members`]) },
      sheet: () => sheetHTML("Whop Store", "whop.com/sonneblomdigitaal: AI influencer templates, the Copy What We Did Club ($19/mo, linked from every AI Bot Race video), AI avatar setup service and Side Hustle City. Affiliates earn 30%.",
        usd(wp.revenue_usd || 0), `${wp.sales || 0} sales · ${wp.members || 0} members`,
        (wp.products || []).map(p => [p.title, `${p.members} members · ${p.visibility}`]), [], "", "https://whop.com/sonneblomdigitaal", "Updated " + (wp.ts || "–")) },

    { id: "pinterest", name: "Pinterest Studio", short: "PINTEREST", icon: "📌", color: 0xe60023, pos: [-130, -12], w: 7, d: 7, h: 14, kind: "pin", face: [1, 0],
      status: pi.error ? "stale" : pi.last_date && pi.last_date <= new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) ? "stale" : "ok", today: 0, total: 0,
      tag: [`${num(pi.upcoming)} pins queued`, `${num(pi.clicks)} clicks`],
      board: { title: "PINTEREST", main: num(pi.scheduled), mainLabel: "pins scheduled (CSV uploads)",
        rows: [["Going out today", num(pi.today)], ["Still queued", num(pi.upcoming)], ["Runs out", (pi.last_date || "–").slice(5)], ["Impressions", num(pi.impressions)], ["Clicks", num(pi.clicks)], ["Upload files", num(pi.files)]] },
      sheet: () => sheetHTML("Pinterest Studio", "Weekly pin files (CSV bulk upload) pointing to the shop hub", pi.scheduled ?? 0, "pins scheduled",
        [["Going out today", num(pi.today)], ["Still queued", num(pi.upcoming)], ["Last pin date", pi.last_date || "–"], ["Impressions", num(pi.impressions)], ["Clicks", num(pi.clicks)], ["Upload files", num(pi.files)]], [],
        "", "https://za.pinterest.com/SonneblomDigitaal/", `Pinterest has no API for us, so this counts the pins in our upload files. Impressions/clicks are typed in on Go Bananas${pi.at ? ` (${esc(pi.at)})` : ""}.`) },

    // Sonneblom AI Works HQ (owner 2026-10-09): the 5 AI employees for sale/rent; "Enter the building" walks into /office/
    ...(aw ? [{ id: "aiworks", name: "Sonneblom AI Works", short: "AI WORKS", icon: "🤖", color: 0xff3fbf, pos: [150, 42], w: 13, d: 11, h: 18, kind: "aiworks", face: [0, -1], noPay: true,
      status: "ok", today: 0, total: 0,  // jobs are not money: no payroll row, beam or coins
      tag: [`${aw.live}/5 bots at work`, aw.approvals ? `${aw.approvals} need your yes` : "office open"],
      board: { title: "AI WORKS HQ", main: `${aw.live}/5`, mainLabel: "AI employees at work",
        rows: aw.bots.map(b => [b.name, b.live.length ? `${b.live.length} skills` : "training"]) },
      sheet: () => aiworksHTML(aw) }] : []),

    // Warehouses (owner 2026-10-07): every product we sell, stored and viewable by shelf
    { id: "whdig", name: "Digital Warehouse", short: "DIGITAL", icon: "🗂️", color: 0x38bdf8, pos: [130, 22], w: 14, d: 10, h: 8, kind: "warehouse", face: [0, -1],
      status: "ok", today: 0, total: 0,
      tag: [`${num(L.filter(x => !x.physical).length + G.length)} products`, "printables · add-ons · books"],
      board: { title: "DIGITAL WAREHOUSE", main: num(L.filter(x => !x.physical).length + G.length), mainLabel: "digital products in stock",
        rows: [["Etsy downloads", num(L.filter(x => !x.physical).length)], ["Gumroad", num(G.length)], ["KDP books", m.kdp_books ?? "–"]] },
      sheet: () => sheetHTML("Digital Warehouse", "Every digital product we sell: printables, bundles, Blender add-ons, services. Tap a box to open it.", L.filter(x => !x.physical).length + G.length, "products",
        [["Etsy downloads", L.filter(x => !x.physical).length], ["Gumroad", G.length], ["KDP books", m.kdp_books ?? "–"]], [], "") +
        shelfHTML("Gumroad", G) + shelfHTML("Etsy downloads", L.filter(x => !x.physical)) },
    { id: "whpod", name: "Print Warehouse", short: "PRINT", icon: "📦", color: 0xf59e0b, pos: [170, 22], w: 14, d: 10, h: 8, kind: "warehouse", face: [0, -1],
      status: "ok", today: 0, total: 0,
      tag: [`${num(L.filter(x => x.physical).length)} products`, "printed on demand"],
      board: { title: "PRINT WAREHOUSE", main: num(L.filter(x => x.physical).length), mainLabel: "print-on-demand products",
        rows: [["Printify products", num(pf.products)], ["Orders", num(pf.orders || 0)]] },
      sheet: () => sheetHTML("Print Warehouse", "Tees, mugs, posters and gifts, printed to order by Printify and sold on Etsy.", L.filter(x => x.physical).length, "products",
        [["Printify products", pf.products ?? "–"], ["Orders", pf.orders ?? 0]], [], "") + shelfHTML("Etsy gifts", L.filter(x => x.physical)) },

    { id: "github", name: "GitHub Foundry", short: "GITHUB", icon: "🐙", color: 0x8b949e, pos: [180, -16], w: 11, d: 9, h: 10, kind: "factory", face: [0, 1],
      status: gh.error ? "stale" : "ok", today: 0, total: 0,
      tag: [`${num(gh.commits_24h)} commits today`, `${num(gh.repos)} repos`],
      board: { title: "GITHUB", main: num(gh.commits_24h), mainLabel: "commits pushed (24h)",
        rows: [["This week", num(gh.commits_7d)], ["Repos", num(gh.repos)], ["Public", num(gh.public)], ["Stars", num(gh.stars)]] },
      sheet: () => sheetHTML("GitHub Foundry", `${gh.login || "RoseCompanion"} · code and the free hosting for the hub, the City and Rose`, gh.commits_24h ?? 0, "commits pushed in the last 24h",
        [["Commits this week", num(gh.commits_7d)], ["Repos", num(gh.repos)], ["Public", num(gh.public)], ["Stars", num(gh.stars)]],
        (gh.recent || []).map(r => [r.name + (r.private ? " 🔒" : ""), ago(r.pushed)]), "Latest pushes", "https://github.com/" + (gh.login || "RoseCompanion")) },

    { id: "rnd", name: "R&D Centre", short: "R&D", icon: "🔬", color: 0x22ff88, pos: [-26, -20], w: 9, d: 7, h: 12, kind: "rnd", face: [1, 0],
      status: rn.error ? "stale" : "ok", today: 0, total: 0,
      tag: [`${(rn.flags || []).length} alerts`, "report " + (rn.written || "–").slice(5)],
      board: { title: "R&D CENTRE", main: String((rn.flags || []).length), mainLabel: "bottleneck alerts right now",
        rows: (rn.top3 || []).slice(0, 3).map((t, i) => ["Fix " + (i + 1), t.split(" ").slice(0, 3).join(" ")]) },
      sheet: () => `<h2>R&D Centre</h2><div class="sub">How every money method is doing, and what's holding it back · report ${esc(rn.written || "")}</div>
        <div class="note"><b>${esc(rn.headline || "")}</b></div>
        ${(rn.flags || []).length ? `<div class="list"><div style="color:var(--dim);font-size:12px"><span>Live alerts (every refresh)</span></div>${rn.flags.map(f => `<div><span>⚠️ ${esc(f)}</span></div>`).join("")}</div>` : ""}
        <div class="list"><div style="color:var(--dim);font-size:12px"><span>Top 3 this week</span></div>${(rn.top3 || []).map((t, i) => `<div><span>${i + 1}. ${esc(t)}</span></div>`).join("")}</div>
        ${(rn.items || []).map(x => `<div class="note"><b>${esc(x.name)}</b> · <i>${esc(x.score)}</i><br>${esc(x.numbers)}<br>🚧 ${esc(x.bottleneck)}<br>✅ ${esc(x.fix)}</div>`).join("")}` },

    { id: "showroom", name: shOpen ? "Side Hustle City" : "Showroom (under construction)", short: shOpen ? "SHC" : "SHOWROOM", icon: shOpen ? "🏙️" : "🏗️",
      color: 0xffb020, pos: [26, -20], w: 9, d: 8, h: 16, face: [-1, 0], kind: shOpen ? "store" : "construction",
      status: "ok", today: 0, total: (shF.page || {}).revenue_usd || sh.revenue_usd || 0, built: shSt.length ? shDone / shSt.length : 0,
      tag: shOpen ? ["OPEN · selling", `${num((shF.page || {}).paid || 0)} sales`] : [`${Math.round(100 * (shSt.length ? shDone / shSt.length : 0))}% built`, shNext ? "next: " + shNext.name.split(" ")[0] : "open"],
      board: shOpen ? { title: "SIDE HUSTLE CITY", main: usd((shF.page || {}).revenue_usd || 0), mainLabel: "sold · store is open",
          rows: [["Page visits", num((shF.page || {}).visits)], ["Plan taps", num((shF.page || {}).plan)], ["Sales", num((shF.page || {}).paid)], ["IG posts", num(sh.ig_posts)]] }
        : { title: "SHOWROOM", main: Math.round(100 * (shSt.length ? shDone / shSt.length : 0)) + "%", mainLabel: "selling pipeline built",
        rows: shF.steps ? [["Ad clicks", num(shF.ads.clicks)], ["Page visits", num(shF.page.visits)], ["Plan taps", num(shF.page.plan)], ["Sales", num(shF.page.paid)]]
          : [["Steps done", `${shDone}/${shSt.length}`], ["Next", shNext ? shNext.name.split(" ")[0] : "–"], ["IG followers", num(sh.ig_followers)], ["Sales", num(sh.sales)]] },
      sheet: () => (shOpen
        ? sheetHTML("Side Hustle City", `OPEN · selling "${sh.product || "Side Hustle City"}": ${sh.pitch || ""}`, usd((shF.page || {}).revenue_usd || 0), "sold so far",
            [["Page visits", num((shF.page || {}).visits)], ["Checkouts", num((shF.page || {}).checkouts)], ["Sales", num((shF.page || {}).paid)], ["IG page", sh.ig_handle || "–"], ["IG followers", num(sh.ig_followers)], ["IG posts", num(sh.ig_posts)]],
            shSt.map(x => [(x.done ? "✅ " : "🚧 ") + x.name, x.note || ""]), "Launch checklist", "",
            "We sell the dashboard, not a money dream: \"I use this to see my side hustles better.\"")
        : sheetHTML("Showroom", `Selling "${sh.product || "Side Hustle City"}": ${sh.pitch || ""}`, Math.round(100 * (shSt.length ? shDone / shSt.length : 0)) + "%", "of the pipeline built",
        [["IG page", sh.ig_handle || "not made yet"], ["IG followers", num(sh.ig_followers)], ["IG posts", num(sh.ig_posts)], ["Sales", num(sh.sales)], ["Revenue", usd(sh.revenue_usd || 0)]],
        shSt.map(x => [(x.done ? "✅ " : "🚧 ") + x.name, x.note || ""]), "Build steps", "",
        "We sell the dashboard, not a money dream: \"I use this to see my side hustles better.\"")) + funnelHTML(shF) },

    ...(DEMO ? [] : [{ id: "army", name: "AI Influencer Army", short: "AI ARMY", icon: "🤖", color: 0xff4fd8, pos: [-138, 26], w: 9, d: 8, h: 22, kind: "army", face: [1, 0],
      status: av.error ? "stale" : "ok", today: 0, total: 0, crew: (av.avatars || []).map(a => a.status),
      tag: [`${(av.avatars || []).filter(a => a.status === "live").length}/${(av.avatars || []).length} live`, `${num(av.credits?.left)} credits`],
      board: { title: "AI INFLUENCER ARMY", main: num(av.credits?.left), mainLabel: `Higgsfield credits left · ${av.credits?.plan || ""}`,
        rows: (av.avatars || []).slice(0, 5).map(a => [a.emoji + " " + a.short, a.status]) },
      sheet: () => armyHTML(av) + `<div class="lt" style="margin-top:14px">🌹 Rose lives here now</div><div class="list">${[
        ["Followers (FB + IG)", num(rd.followers)], ["New today", plus(rd.gained_24h)], ["New this week", plus(rd.gained_7d)], ["Messages today", num(rd.messages_today)],
        ["Likes this week", num(rd.likes_7d)], ["Comments this week", num(rd.comments_7d)], ["Money all time", usd(rd.money_usd)], ["Rose bot", svLabel("companion")]]
        .map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(String(v))}</span></div>`).join("")}</div>` }]),

    // the big billboards (owner 2026-10-08): one giant screen per quarter instead of a board on every building
    { id: "newfaces", name: "Media Billboard", short: "NEW FACES", icon: "✨", color: 0xff4fd8, pos: [-174, 0], w: 40, d: 3, h: 22, lift: 6, kind: "bigboard", face: [1, 0], neonOnly: true, noPay: true,
      slides: [g => drawProducts(g, prod), g => drawFaces(g, faces), g => drawVentures(g, ventures)], status: "ok", today: 0, total: 0,
      tag: ["Our 2 products", "Dashboard HUBs · AI Influencers"],
      board: { title: "NEW FACES", main: String(faces.length), mainLabel: "new faces", rows: [] },
      sheet: () => sheetHTML("Media Billboard", "Our newest faces and ventures, shown on the big screen over Media Hill", faces.length, "new faces",
        faces.map(a => [`${a.emoji || ""} ${a.name}`, a.followers != null ? `${num(a.followers)} followers${a.username ? " · @" + a.username : ""}` : a.username || ""]),
        ventures.map(v => [v.title, v.status]), "New ventures") },
    { id: "output", name: "Factory Output", short: "OUTPUT", icon: "🏭", color: 0xff8a3d, pos: [150, -40], w: 32, d: 3, h: 17, lift: 12, kind: "bigboard", face: [0, 1], neonOnly: true, noPay: true,
      draw: g => drawOutput(g, output), status: "ok", today: 0, total: eTot + gTot,
      tag: [`${num(L.length + G.length)} products made`, `${num(eS.length + gS.length)} sold`],
      board: { title: "FACTORY OUTPUT", main: usd(eTot + gTot), mainLabel: "sold", rows: [] },
      sheet: () => sheetHTML("Factory Output", "What every factory in the Industrial Park has made and sold", usd(eTot + gTot + (m.kdp_royalty || 0)), "sold all time",
        output.map(r => [r[0], r.slice(1).filter(Boolean).join(" · ")]), [], "") },
    ...homes,

    { id: "library", name: "The Library", short: "LIBRARY", icon: "📚", color: 0xe8a87c, pos: [0, -26], w: 20, d: 12, h: 12, kind: "library",
      status: sv("hq-portal"), today: 0, total: 0,
      tag: ["Claude", "tap to talk"],
      board: { title: "THE LIBRARY", main: "CLAUDE", mainLabel: "tap the Library to talk",
        rows: [...(s.rtk?.sim ? [["RTK saved", "$" + num(Math.round(s.rtk.sim.usd + (s.rtk.real?.usd || 0)))]] : []), ["Bot services", svc ? Object.values(svc).filter(v => v === "active").length + "/" + Object.keys(svc).length + " up" : "–"], ["Data", ago(s.ts)]] },
      sheet: () => sheetHTML("The Library", "Where the owner talks to Claude from inside the city", "Claude", "AI operator",  // only shown in the public demo (the real one opens the chat)
        [["Model", "Claude (Claude Code)"], ["Runs on", "the server, 24/7"], ["Can", "read data, write code, deploy"]], [], "",
        "In the real city this opens a live chat with Claude Code running on the server. The owner asks for changes from a phone and Claude edits the code, refreshes the data and redeploys the city.") },
  ];
  const tot = eTot + gTot, day = eDay + gDay;  // Vault = sales only, no trading-bot figures (owner 2026-10-09)
  const flow = { clicks: (rs.ad_clicks || 0) + (fb.ads?.clicks || 0), views: last7("page_media_view") + (rs.fb_post_views || 0), ads: adsActive };
  const working = (D.working || []).filter(id => B.some(b => b.id === id));
  return { flow, working, B: DEMO ? B.filter(b => !(D.hide || []).includes(b.id)) : B, s, tot, day, roseZar, sales: eS.length + gS.length + (ro.card_paid || 0) };
}
const svLabel = n => !svc ? "unknown" : svc[n] === "active" ? "🟢 running" : "🔴 " + (svc[n] || "down");

// quick links shown at the bottom of every building's panel
const LINKS = {
  vault: [["Etsy finances", "https://www.etsy.com/your/account/payments"], ["Gumroad payouts", "https://gumroad.com/payouts"], ["Yoco portal", "https://portal.yoco.com"], ["Shop hub", "https://sonneblomdigitaal.co.za"]],
  etsy: [["Shop Manager", "https://www.etsy.com/your/shops/me/dashboard"], ["Orders", "https://www.etsy.com/your/orders/sold"], ["Messages", "https://www.etsy.com/messages"], ["Stats", "https://www.etsy.com/your/shops/me/stats"], ["Etsy Ads", "https://www.etsy.com/your/shops/me/advertising"], ["Printify", "https://printify.com/app/stores"], ["Pinterest", "https://za.pinterest.com/SonneblomDigitaal/"], ["Shop hub", "https://sonneblomdigitaal.co.za"]],
  fb: [["Inbox: Rose", "https://business.facebook.com/latest/inbox/all?asset_id=1336610982875262"], ["Inbox: Sonneblom", "https://business.facebook.com/latest/inbox/all?asset_id=1296018053605465"], ["Ads Manager", "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=770255640007326"], ["Planner", "https://business.facebook.com/latest/planner"], ["Sonneblom Page", "https://www.facebook.com/profile.php?id=1296018053605465"], ["Rose Page", "https://www.facebook.com/rose.companion"], ["Instagram", "https://www.instagram.com/rose.companion/"]],
  rose: [["Website", "https://rosecompanion.github.io/"], ["Web chat", "https://rosecompanion.github.io/chat.html"], ["Telegram bot", "https://t.me/EveningCompany_bot"], ["Instagram", "https://www.instagram.com/rose.companion/"], ["Facebook", "https://www.facebook.com/rose.companion"], ["Yoco payments", "https://portal.yoco.com"]],
  gumroad: [["Dashboard", "https://gumroad.com/dashboard"], ["Products", "https://gumroad.com/products"], ["Sales", "https://gumroad.com/customers"], ["Superhive", "https://superhivemarket.com"], ["BlenderArtists", "https://blenderartists.org"], ["BlenderNation", "https://www.blendernation.com"]],
  kdp: [["Bookshelf", "https://kdp.amazon.com/en_US/bookshelf"], ["Reports", "https://kdpreports.amazon.com/dashboard"]],
  contra: [["Opportunities", "https://contra.com/opportunities"], ["My profile", "https://contra.com/"], ["Messages", "https://contra.com/inbox"]],
  zoho: [["Zoho Mail", "https://mail.zoho.com"], ["eaafix.com", "https://eaafix.com"]],
  lab: [["Apify console", "https://console.apify.com/actors"], ["Apify Store", "https://apify.com/store"], ["Contra", "https://contra.com/opportunities"]],
  krypto: [["Phantom", "https://phantom.com"], ["DexScreener", "https://dexscreener.com/solana"]],
  kalshi: [["Kalshi portfolio", "https://kalshi.com/portfolio"]],
  poly: [["Polymarket portfolio", "https://polymarket.com/portfolio"]],
  pinterest: [["Pinterest profile", "https://za.pinterest.com/SonneblomDigitaal/"], ["Analytics", "https://analytics.pinterest.com/"], ["Upload CSV", "https://za.pinterest.com/settings/import-content"]],
  github: [["My repos", "https://github.com/RoseCompanion?tab=repositories"], ["Actions", "https://github.com/RoseCompanion/sonneblomdigitaal-site/actions"]],
  army: [["Higgsfield", "https://higgsfield.ai"], ["Soul ID characters", "https://higgsfield.ai/character"], ["AI Influencer", "https://higgsfield.ai/ai-influencer"], ["Instagram", "https://www.instagram.com/"]],
  showroom: [["Gumroad", "https://gumroad.com/products"], ["Instagram", "https://www.instagram.com/"]],
  aiworks: [["The office (3D)", "/office/"]],
  longshot: [["Polymarket portfolio", "https://polymarket.com/portfolio"], ["Ending soon", "https://polymarket.com/markets?_s=end_date%3Aasc"]],
};
// quick-action buttons: each one sends a ready-made task to Claude in the Library (some only show when there's something to do)
const ACTIONS = {
  vault: s => [["🍌 Go Bananas", "Go Bananas"]],
  etsy: s => [["💬 Check Etsy messages", "Check Etsy messages and new orders for the shop. Draft replies for anything that needs one and tell me what you found."],
    ["📸 Improve top listings", "Pick the 5 most-viewed Etsy listings with no sales and improve their first photo, title and tags. Show me the changes before you publish them."]],
  gumroad: s => [["📣 Draft a BlenderNation post", "Draft a new BlenderNation/BlenderArtists post for one of our Blender add-ons (the channel that brought our first sale). Send me the text to approve."],
    ["🔍 Check Gumroad", "Check Gumroad for new sales, views and messages and update the City."]],
  kdp: s => [["📚 Prep the next 2 books", "Pick the next 2 print-ready KDP books from /root/kdp-books and prepare everything I need to upload them (files, title, description, keywords, price). Send me a short checklist."]],
  fb: s => [["💬 Check comments & DMs", "Check Facebook and Instagram comments and DMs for both Pages. Reply to comments; draft DM replies for me to send."],
    ["📅 Plan tomorrow's posts", "Plan and schedule tomorrow's Facebook/Instagram posts for both Pages and tell me what's going out."]],
  rose: s => [["💬 Check Rose's messages", "Check Rose's new messages (Telegram, web chat, Messenger, Instagram) and comments. Reply to comments; draft any DM replies for me."],
    ["🎬 New reel idea", "Come up with 3 new reel ideas for Rose that fit her persona and current trends. Don't make them yet, let me pick one."]],
  contra: s => [["✍️ Draft 3 proposals", "Look at the newest Contra opportunities that fit us and draft 3 proposals in plain text for me to paste."]],
  zoho: s => [(s.outreach?.replied || 0) > 0 ? ["📬 Reply to new emails", "Read the new replies in the Zoho inbox (hello@eaafix.com). Skip auto-replies; for real replies, write the answer (free report offer or quote) and tell me what you sent or what needs me."]
      : ["📥 Check inbox", "Check the Zoho inbox (hello@eaafix.com) for real replies, bounces and opt-outs. Reply where needed and tell me what you found."],
    ["🔎 Top up leads", "The outreach queue is getting low. Run the lead finder until there are at least 100 leads waiting and tell me how many were added."]],
  lab: s => [["🧪 Usage check", "Check who used our Apify actors and x402 API this week and suggest one change to get more paid use."]],
  krypto: s => [["📈 Wallet report", "Give me a short Krypto wallet and bot report: what's open, what it's worth, and if anything needs doing."]],
  kalshi: s => [["📈 Bot report", "Short report on the Kalshi bot results. It's switched off; tell me if it's worth switching back on."]],
  poly: s => [["📈 Bot report", "Short report on the Polymarket bots (real and paper). Anything to change?"]],
  longshot: s => [["🎯 How's the $25 run?", "How is the Long Shot paper bot doing? Show the open trades, what it learned, and if it's ready for real money."]],
  pinterest: s => [["📌 Build next week's pins", "Build next week's Pinterest pin file (new products and angles, 6 a day), push it, and send me the upload file link on Telegram."]],
  github: s => [["🧹 Repo check", "Check our GitHub repos: anything broken, failing Pages builds, or old repos to archive? Fix what's safe and tell me the rest."]],
  aiworks: s => [["🛠️ Build the next skill", "AI Works: read /root/ai-employees/PLAN.md and team.json, build and test the next unfinished bot skill (one at a time), update team.json + PLAN.md, run update.sh and tell me what it can do now."],
    ["☀️ Demo morning brief", "Run ChiefBot's morning brief for the demo company (Karoo Kitchens) and show it to me."]],
  rnd: s => [["📝 Write a new report", "Write a fresh R&D report: read the latest HQ data for every money method, rewrite /root/sonneblom-site/hq-data/rnd/report.json (headline, each method's numbers, bottleneck and fix, top 3), then run update.sh."],
    ["💡 Pick a new venture", "Look at our results and the ideas backlog and recommend ONE new venture to start next, with a first-week plan. Don't start it until I say go."],
    ["🩺 Fix the #1 bottleneck", "Take the first item of the R&D top 3 and do what you can on it right now. Tell me what needs me."]],
  army: s => [["▶️ Do the next step", "AI Influencer Army: do the next unfinished Claude step in /root/sonneblom-site/hq-data/avatars.json (Higgsfield via a Chrome sub-run, stay inside the credit budget), tick it off, run update.sh and tell me what needs me."],
    ["💳 Re-check credits", "Check my Higgsfield credits and plan in Chrome (read only) and update credits + the budget in /root/sonneblom-site/hq-data/avatars.json, then run update.sh."],
    ["🎬 Plan this week's content", "Write this week's content plan for the avatar that is live or being built (hooks, scenes, captions, which Higgsfield model, credits per post) into avatars.json and show me."]],
  showroom: s => [["🔍 Fix the bottleneck", "Look at the Side Hustle City sales funnel (showroom.funnel in the latest HQ snapshot): which step is the bottleneck, why, and give me the one change that fixes it. Do it if it's a page or copy change."],
    ["🏗️ Build the next step", "Continue the Showroom pipeline: do the next unfinished stage in /root/showroom/pipeline.json, mark it done, run update.sh and tell me what's next."],
    ["📸 Draft an IG post", "Draft the next Side Hustle City Instagram post from /root/showroom/ig_posts.md (caption + hashtags + what to screen-record)."]],
};
const actionsHTML = id => DEMO || GUEST || !ACTIONS[id] ? "" : `<div class="links acts2"><div class="lt">Quick actions · Claude does it in the Library</div>${ACTIONS[id](M.s).map(([t, p]) => `<button class="ask" data-p="${esc(p)}">${esc(t)}</button>`).join("")}</div>`;
async function ask(msg) {
  await openTerm();
  $("#tin").value = msg; $("#tin").dispatchEvent(new Event("input"));
  if ($("#tsend").disabled || !get(LKEY)) return;  // Library login first: the task waits in the box
  $("#tform").requestSubmit();
}
const linksHTML = id => !DEMO && !GUEST && (LINKS[id] || []).length ? `<div class="links"><div class="lt">Quick links</div>${LINKS[id].map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join("")}</div>` : "";

// Showroom sales funnel: each step's conversion vs a normal rate, worst one flagged as the bottleneck.
function funnelHTML(f) {
  if (DEMO || !f.steps) return "";
  const pct = r => r == null ? "–" : (r * 100 < 10 ? (r * 100).toFixed(1) : Math.round(r * 100)) + "%";
  const a = f.ads || {}, p = f.page || {}, t = f.today || {}, src = f.sources || {};
  const rows = f.steps.map(x => {
    const bad = x.name === f.bottleneck, ok = x.rate != null && x.rate >= x.norm;
    return `<div${bad ? ' style="color:#ff6b6b;font-weight:700"' : ""}><span>${bad ? "🚧" : x.rate == null ? "⚪" : ok ? "🟢" : "🟠"} ${esc(x.name)}</span><span>${num(x.to)}/${num(x.from)} · ${pct(x.rate)} <i style="opacity:.6">(normal ${pct(x.norm)})</i></span></div>`;
  }).join("");
  return `<div class="list"><div style="color:var(--dim);font-size:12px"><span>Sales funnel since tracking started</span></div>${rows}</div>
    <div class="note"><b>${esc(f.verdict || "")}</b><br>Ad: ${num(a.impressions)} views · ${num(a.clicks)} clicks · R${(a.spend || 0).toFixed(2)} spent${a.active ? " · 🟢 running" : ""}
    <br>Last 24 h: ${num(t.visits)} visits · ${num(t.plans)} saw prices · ${num(t.plan)} plan taps · ${num(t.pay)} pay taps
    <br>Visitors from: ad ${num(src.ad || 0)} · social ${num(src.social || 0)} · direct ${num(src.direct || 0)} · other ${num(src.other || 0)}
    <br>Checkouts opened: ${num(p.checkouts)} · Paid: ${num(p.paid)} (${usd(p.revenue_usd || 0)})</div>`;
}

function sheetHTML(title, sub, big, bigLabel, kvs, list, listTitle, link, note) {
  if (DEMO) link = "";
  return scrub(`<h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div>
    <div class="big">${typeof big === "number" && bigLabel.includes("revenue") ? usd(big) : esc(typeof big === "number" ? num(big) : big)}<small>${esc(bigLabel)}</small></div>
    <div class="grid">${kvs.map(([k, v]) => `<div class="kv"><b>${esc(v ?? "–")}</b><span>${esc(k)}</span></div>`).join("")}</div>
    ${list.length ? `<div class="list"><div style="color:var(--dim);font-size:12px"><span>${esc(listTitle)}</span></div>${list.map(([a, b]) => `<div><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join("")}</div>` : ""}
    ${note ? `<div class="note">${note}</div>` : ""}
    ${link ? `<a class="go" href="${link}" target="_blank" rel="noopener">Open ↗</a>` : ""}`);
}

// Warehouse shelf: product boxes (photo + price) linking to the live listing
function shelfHTML(title, items) {
  if (!items.length) return "";
  return `<div class="shelf"><div class="lt">${esc(title)} · ${items.length}</div><div class="boxes">${items.map(x =>
    `<a class="box" ${DEMO ? "" : `href="${esc(x.url || "#")}" target="_blank" rel="noopener"`}>${x.img ? `<img loading="lazy" src="${esc(x.img)}" alt="">` : `<i>📦</i>`}<span>${esc((x.title || "").slice(0, 46))}</span><b>${usd(x.price)}</b></a>`).join("")}</div></div>`;
}

// AI Works HQ panel: team cards with avatars + the door into the 3D office
function aiworksHTML(a) {
  const door = DEMO ? "" : `<a class="go door" href="/office/">🚪 Enter the building →</a>`;
  return `<h2>Sonneblom AI Works</h2><div class="sub">Our AI employees for rent or sale. ${a.live} of 5 at work · ${num(a.actions)} jobs done · ${num(a.companies)} company brain${a.companies === 1 ? "" : "s"}</div>
    ${door}
    <div class="grid"><div class="kv"><b>${a.live}/5</b><span>bots at work</span></div><div class="kv"><b>${num(a.today)}</b><span>jobs today</span></div>
    <div class="kv"><b>${num(a.approvals)}</b><span>waiting for your yes</span></div></div>
    <div class="team">${a.bots.map(b => `<div class="bot"><img loading="lazy" src="/office/avatars/${esc(b.id)}.jpg" alt="">
      <div><b>${esc(b.name)}</b> <i>${esc(b.role)}</i><br>${b.live.map(x => `<span class="sk on">✅ ${esc(x)}</span>`).join("")}${b.next.map(x => `<span class="sk">🛠️ ${esc(x)}</span>`).join("")}
      <small>${num(b.total)} jobs · ${num(b.today)} today</small></div></div>`).join("")}</div>
    ${door}`;
}

// AI Influencer Army (owner 2026-10-08): the avatar roster, the week-by-week game plan and the Higgsfield credit budget (hq-data/avatars.json)
function armyHTML(a) {
  const cr = a.credits || {}, A = a.avatars || [], P = a.phases || [];
  const col = { live: "#3dffa8", building: "#ffd166", next: "#00e5ff", planned: "#7d74a8", paused: "#ff4d6d" };
  const spent = A.reduce((t, x) => t + (x.spent || 0), 0), budget = A.reduce((t, x) => t + (x.credits || 0), 0);
  const bar = (v, max, c) => `<div style="height:6px;border-radius:3px;background:#2a1c5c;margin-top:4px"><div style="height:6px;border-radius:3px;width:${Math.min(100, max ? 100 * v / max : 0)}%;background:${c}"></div></div>`;
  const roster = A.map(x => `<div class="note" style="border-left:3px solid ${col[x.status] || "#7d74a8"};padding-left:8px">
      <b>${x.emoji} ${esc(x.name)}</b> <span style="color:${col[x.status] || "#ccc"};font-weight:700">· ${esc(x.status.toUpperCase())}</span><br>${esc(x.niche)}<br>
      💰 ${esc(x.money)} · 🎯 ${esc(x.goal)}${x.ig ? ` · 📸 ${esc(x.ig)}${x.followers != null ? " (" + num(x.followers) + ")" : ""}` : ""}<br>
      ⚡ ${num(x.spent || 0)} / ${num(x.credits)} credits · starts ${esc(x.start || "–")}${bar(x.spent || 0, x.credits, col[x.status] || "#7d74a8")}</div>`).join("");
  const plan = P.map(p => { const d = (p.steps || []).filter(t => t.done).length;
    return `<div class="list"><div style="color:var(--dim);font-size:12px"><span>🗓️ ${esc(p.name)}</span><span>${d}/${(p.steps || []).length} · ⚡${num(p.credits)}</span></div>${(p.steps || []).map(t =>
      `<div><span>${t.done ? "✅" : t.who === "you" ? "🙋" : "🤖"} ${esc(t.t)}</span><span>${t.cr ? "⚡" + t.cr : ""}</span></div>`).join("")}</div>`; }).join("");
  const costs = (a.costs || []).map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("");
  return `<h2>AI Influencer Army</h2><div class="sub">${esc(a.headline || "Five AI influencers, one at a time, built in Higgsfield")} · updated ${esc((a.updated || "").slice(0, 16).replace("T", " "))}</div>
    ${M.s.influencers?.accounts ? `<div class="links"><button class="infopen" onclick="openInf()">📊 Open the influencer overview (followers, views, best posts)</button></div>` : ""}
    <div class="big">${num(cr.left)}<small>Higgsfield credits left · ${esc(cr.plan || "plan ?")}${cr.renews ? " · renews " + esc(cr.renews) : ""}</small></div>
    <div class="grid"><div class="kv"><b>${num(budget)}</b><span>credits budgeted</span></div><div class="kv"><b>${num(spent)}</b><span>credits used</span></div>
      <div class="kv"><b>${A.filter(x => x.status === "live").length}/${A.length}</b><span>avatars live</span></div><div class="kv"><b>${num(cr.monthly)}</b><span>credits / month</span></div></div>
    ${(a.unlimited || []).length ? `<div class="note">♾️ Free on this plan: ${a.unlimited.map(esc).join(" · ")}</div>` : ""}
    <div class="lt" style="margin-top:14px">The army</div>${roster}
    <div class="lt" style="margin-top:14px">Game plan · 🤖 Claude · 🙋 you</div>${plan}
    ${costs ? `<div class="list"><div style="color:var(--dim);font-size:12px"><span>What things cost</span></div>${costs}</div>` : ""}
    ${(a.rules || []).length ? `<div class="note">📏 ${a.rules.map(esc).join("<br>📏 ")}</div>` : ""}`;
}


// ---------- outskirts (owner 2026-10-10): mountains west, beach + ocean east, wind farm north, sunflower fields south,
// and four different corners between the quarters: pine forest + lake, golf course, farm, funfair ----------
function outskirts() {
  const F = (c, e = 0x000000, ei = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: ei, roughness: 0.9, flatShading: true, ...o });
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o; };
  const flat = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo.rotateX(-Math.PI / 2), m); o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o; };
  const R = (a, b) => a + Math.random() * (b - a);
  // instanced pines + sunflowers (hundreds of them; one draw call per part keeps phones smooth)
  const PI_ = { trunk: [], c: [[], [], []] }, SF = { stem: [], petal: [], core: [] }, o3 = new THREE.Object3D();
  const mx = (x, y, z, sx, sy, sz, rx = 0) => { o3.position.set(x, y, z); o3.rotation.set(rx, 0, 0); o3.scale.set(sx, sy, sz); o3.updateMatrix(); return o3.matrix.clone(); };
  const pine = (x, z, h = R(6, 11)) => { PI_.trunk.push(mx(x, h * 0.15, z, h, h, h)); for (let k = 0; k < 3; k++) PI_.c[k].push(mx(x, h * (0.35 + k * 0.2), z, h, h, h)); };
  const inst = (geo, m, list) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((M4, i) => im.setMatrixAt(i, M4)); scene.add(im); };
  const palm = (x, z) => { const h = R(7, 10), lean = R(-0.25, 0.25), t = add(new THREE.CylinderGeometry(0.25, 0.4, h, 6), F(0x8a6a44), x, h / 2, z); t.rotation.z = lean;
    for (let k = 0; k < 6; k++) { const l = add(new THREE.ConeGeometry(0.6, 4.2, 4), F(0x2f8a3c, 0x0a3014, 0.4), x - Math.sin(lean) * h, h, z); l.rotation.set(Math.PI / 2 - 0.5, k * 1.05, 0); l.translateY(1.9); } };

  // WEST: a mountain range behind Media Hill with snow caps
  for (let k = 0; k < 9; k++) {
    const z = -260 + k * 65 + R(-15, 15), x = -262 - R(0, 30), h = R(60, 120), r = R(32, 50);
    add(new THREE.ConeGeometry(r, h, 7), F(0x6b6458, 0x1a1712, 0.35), x, h / 2 - 2, z, R(0, 3));
    add(new THREE.ConeGeometry(r * 0.32, h * 0.32, 7), F(0xf4f6fa, 0x5a6070, 0.35), x, h - h * 0.16 - 2.5, z, R(0, 3));
    for (let p = 0; p < 6; p++) pine(x + r * 0.9 + R(0, 18), z + R(-r, r), R(5, 9));
  }
  // EAST: sand beach along the whole side, the ocean beyond, palms, umbrellas, a pier and sailboats
  flat(new THREE.PlaneGeometry(46, 520), F(0xe9d3a1, 0x3a2f18, 0.35), 236, 0.32, 0);
  const sea = flat(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x1b6fa8, emissive: 0x0d3f6b, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.15 }), 259 + 450, 0.2, 0);
  anim.push((dt, t) => sea.material.emissiveIntensity = 0.45 + Math.sin(t * 0.7) * 0.06);
  for (let k = 0; k < 6; k++) flat(new THREE.PlaneGeometry(3, 520), F(0xf4fbff, 0x9ad0ee, 0.6), 258 + k * 0.7, 0.25 + k * 0.001, 0); // surf line
  for (let z = -230; z <= 230; z += R(14, 24)) palm(R(220, 232), z);
  const umb = [0xff3b6b, 0xffd166, 0x22c55e, 0x38bdf8, 0xff8a00];
  for (let z = -200; z <= 200; z += R(18, 30)) { const x = R(238, 252), c = umb[Math.floor(Math.random() * umb.length)];
    add(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), F(0xffffff), x, 1.5, z); add(new THREE.ConeGeometry(2.2, 0.9, 8), F(c, c, 0.25), x, 3, z);
    add(new THREE.BoxGeometry(1, 0.15, 2), F(0xffffff), x + 1.6, 0.4, z); }
  add(new THREE.BoxGeometry(70, 1, 5), F(0x8a6a44, 0x1f160c, 0.3), 285, 1.6, 40);                      // pier
  for (let k = 0; k < 8; k++) add(new THREE.CylinderGeometry(0.3, 0.3, 4, 6), F(0x5a4430), 255 + k * 9, 0.5, 42.6);
  for (let k = 0; k < 5; k++) { const b = new THREE.Group(); b.position.set(R(300, 420), 0.4, R(-200, 200)); scene.add(b);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 2.4), F(0xffffff, 0x666666, 0.3)); hull.position.y = 0.6; b.add(hull);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(2.4, 8, 3), F(0xf8fafc, 0xaaaaaa, 0.3)); sail.position.set(0, 5.2, 0); sail.scale.z = 0.15; b.add(sail);
    const z0 = b.position.z; anim.push((dt, t) => { b.position.z = z0 + Math.sin(t * 0.05 + k) * 30; b.rotation.z = Math.sin(t * 0.8 + k) * 0.04; }); }
  // NORTH: rolling hills with a wind farm behind Trading Town
  for (let k = 0; k < 7; k++) { const x = -240 + k * 80 + R(-20, 20), z = -290 - R(0, 40), r = R(50, 80);
    const hill = add(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), F(0x2f7a3e, 0x0b2a14, 0.35), x, -r * 0.55, z); hill.scale.y = 0.6; }
  for (let k = 0; k < 8; k++) { const x = -210 + k * 60 + R(-10, 10), z = -262 - R(0, 30), h = 46;
    add(new THREE.CylinderGeometry(0.8, 1.4, h, 8), F(0xf1f5f9, 0x8a95a3, 0.4), x, h / 2, z);
    const hub = new THREE.Group(); hub.position.set(x, h, z + 1.6); scene.add(hub);
    for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 0.3), F(0xffffff, 0x9aa5b1, 0.4)); bl.geometry.translate(0, 10, 0); bl.rotation.z = b * 2.094; hub.add(bl); }
    anim.push((dt, t) => hub.rotation.z = t * 0.6 + k); }
  // SOUTH: sunflower fields (Sonneblom = sunflower) beyond the Suburbs
  flat(new THREE.PlaneGeometry(420, 50), F(0x4f7a2a, 0x1a2a0c, 0.35), 0, 0.31, 232);
  const stem = F(0x3f6b22, 0x10200a, 0.3), petal = F(0xffc81a, 0x8a5a00, 0.5), core = F(0x5a3a1a);
  for (let x = -200; x <= 200; x += 5) for (let z = 214; z <= 252; z += 5) { const h = R(2.2, 3.4), xx = x + R(-1.5, 1.5), zz = z + R(-1.5, 1.5);
    SF.stem.push(mx(xx, h / 2, zz, 1, h, 1)); SF.petal.push(mx(xx, h, zz, 1, 1, 1, 1.2)); SF.core.push(mx(xx, h + 0.05, zz - 0.04, 1, 1, 1, 1.2)); }
  inst(new THREE.CylinderGeometry(0.08, 0.1, 1, 4), stem, SF.stem); inst(new THREE.CylinderGeometry(0.9, 0.9, 0.15, 8), petal, SF.petal); inst(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 8), core, SF.core);

  // CORNERS between the quarters
  const C = { nw: [-122, -118], ne: [122, -118], sw: [-122, 118], se: [122, 118] };
  { const [x, z] = C.nw;   // pine forest round a mountain lake with a log cabin and a jetty
    const lake = flat(new THREE.CircleGeometry(16, 40), new THREE.MeshStandardMaterial({ color: 0x174d6b, emissive: 0x0c3550, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.1 }), x, 0.34, z); lake.scale.set(1.4, 1, 1);
    for (let k = 0; k < 60; k++) { const a = R(0, 6.283), d = R(26, 42); pine(x + Math.cos(a) * d, z + Math.sin(a) * d * 0.9); }
    const cab = new THREE.Group(); cab.position.set(x + 18, 0, z + 20); cab.rotation.y = -0.6; scene.add(cab);
    const logs = F(0x7a4f2a, 0x2a1508, 0.35); const c1 = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7), logs); c1.position.y = 2; cab.add(c1);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 3.5, 4), F(0x3b2a20)); roof.position.y = 5.7; roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.9); cab.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xffd38a })); win.position.set(2, 2.2, 3.51); cab.add(win);
    add(new THREE.BoxGeometry(2.4, 0.4, 12), F(0x8a6a44, 0x1f160c, 0.3), x + 4, 0.6, z + 10); }
  { const [x, z] = C.ne;   // golf course: fairway, green with a flag, sand bunkers, clubhouse
    const fw = flat(new THREE.CircleGeometry(30, 32), F(0x4fb54f, 0x184d18, 0.35), x, 0.33, z); fw.scale.set(1.3, 1, 0.75);
    flat(new THREE.CircleGeometry(7, 32), F(0x6fd66f, 0x1f5a1f, 0.4), x + 22, 0.35, z - 6);
    add(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), F(0xffffff), x + 22, 2, z - 6);
    const flag = add(new THREE.PlaneGeometry(1.6, 1, 4, 1), F(0xff2b2b, 0xff2b2b, 0.5, { side: THREE.DoubleSide }), x + 22.8, 3.5, z - 6); anim.push((dt, t) => flag.rotation.y = Math.sin(t * 2) * 0.3);
    for (const [dx, dz, r] of [[8, -10, 4], [14, 6, 3.5], [-12, 8, 5]]) { const b = flat(new THREE.CircleGeometry(r, 24), F(0xf0dcaa, 0x3a2f18, 0.3), x + dx, 0.36, z + dz); b.scale.set(1.5, 1, 1); }
    const ch = new THREE.Group(); ch.position.set(x - 26, 0, z - 14); scene.add(ch);
    const w = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 8), F(0xf6f1e7, 0x3a352b, 0.3)); w.position.y = 2.5; ch.add(w);
    const rf = new THREE.Mesh(new THREE.BoxGeometry(15, 0.8, 9), F(0x2f5d3a)); rf.position.y = 5.3; ch.add(rf);
    for (let k = 0; k < 14; k++) { const a = R(0, 6.283), d = R(36, 44); pine(x + Math.cos(a) * d * 1.2, z + Math.sin(a) * d * 0.8, R(5, 8)); }
    for (let k = 0; k < 3; k++) { const cart = add(new THREE.BoxGeometry(2, 1.4, 1.2), F(0xffffff, 0x777777, 0.3), x - 10 + k * 2.6, 0.9, z - 18); } }
  { const [x, z] = C.sw;   // farm: crop rows, red barn, silo, a turning windmill
    const crops = [0x9cc24a, 0x6b8f2a, 0xd9b84a, 0x7aa83a];
    for (let k = 0; k < 12; k++) { const r = flat(new THREE.PlaneGeometry(56, 3.4), F(crops[k % 4], 0x18240a, 0.35), x, 0.33 + k * 0.0005, z - 22 + k * 4); }
    const barn = new THREE.Group(); barn.position.set(x + 30, 0, z + 18); barn.rotation.y = 0.4; scene.add(barn);
    const bw = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 9), F(0xb32a2a, 0x3a0a0a, 0.35)); bw.position.y = 3.5; barn.add(bw);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 12.2, 3, 1), F(0x3a3a40)); br.rotation.z = Math.PI / 2; br.rotation.y = Math.PI / 2; br.position.y = 8.2; br.scale.set(1, 1, 0.6); barn.add(br);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), F(0xffffff)); door.position.set(0, 2.5, 4.51); barn.add(door);
    add(new THREE.CylinderGeometry(2.6, 2.6, 14, 14), F(0xd9dde2, 0x4a4f55, 0.35), x + 40, 7, z + 14); add(new THREE.SphereGeometry(2.6, 14, 8, 0, 6.3, 0, 1.6), F(0xb0b6bd), x + 40, 14, z + 14);
    add(new THREE.CylinderGeometry(1.2, 2.2, 16, 8), F(0xf4efe6, 0x4a4538, 0.3), x - 32, 8, z + 20);
    const mill = new THREE.Group(); mill.position.set(x - 32, 15, z + 22); scene.add(mill);
    for (let b = 0; b < 4; b++) { const s2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 0.2), F(0xe9e2d0, 0x555044, 0.3)); s2.geometry.translate(0, 4.5, 0); s2.rotation.z = b * Math.PI / 2; mill.add(s2); }
    anim.push((dt, t) => mill.rotation.z = t * 0.5);
    for (let k = 0; k < 8; k++) add(new THREE.BoxGeometry(1.6, 1, 0.8), F(0xffffff, 0x666666, 0.3), x + R(-20, 10), 0.8, z + R(16, 30), R(0, 3)); } // sheep
  { const [x, z] = C.se;   // funfair: Ferris wheel, carousel, food stalls, string lights
    const fw = new THREE.Group(); fw.position.set(x, 22, z); fw.rotation.y = -0.6; scene.add(fw);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(18, 0.5, 8, 48), F(0xffffff, 0xff2bd6, 0.9)); fw.add(rim);
    for (let k = 0; k < 12; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 36, 0.3), F(0xdddddd, 0x00f0ff, 0.5)); sp.rotation.z = k * Math.PI / 12; fw.add(sp); }
    const cabs = []; for (let k = 0; k < 12; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), F(NEON[k % NEON.length], NEON[k % NEON.length], 0.6)); fw.add(c); cabs.push(c); }
    anim.push((dt, t) => { const a0 = t * 0.12; cabs.forEach((c, k) => { const a = a0 + k * Math.PI / 6; c.position.set(Math.cos(a) * 18, Math.sin(a) * 18 - 1.5, 0); }); rim.rotation.z = a0; });
    for (const s2 of [-1, 1]) { const leg = add(new THREE.BoxGeometry(1, 24, 1), F(0xcfd4da), x + s2 * 6 * Math.cos(-0.6), 11, z - s2 * 6 * Math.sin(-0.6)); leg.rotation.z = s2 * 0.25; leg.rotation.y = -0.6; }
    const car = new THREE.Group(); car.position.set(x - 22, 0, z + 14); scene.add(car);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1, 24), F(0xffd166, 0x8a6a00, 0.4)); base.position.y = 0.5; car.add(base);
    const top = new THREE.Mesh(new THREE.ConeGeometry(9, 4, 24), F(0xff3b6b, 0xff3b6b, 0.5)); top.position.y = 8; car.add(top);
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), F(0xffffff)); pole.position.set(Math.cos(a) * 6, 4, Math.sin(a) * 6); car.add(pole);
      const hs = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.5), F(NEON[k % NEON.length], NEON[k % NEON.length], 0.4)); hs.position.set(Math.cos(a) * 6, 2.5, Math.sin(a) * 6); car.add(hs); }
    anim.push((dt, t) => car.rotation.y = t * 0.4);
    for (let k = 0; k < 5; k++) { const st = new THREE.Group(); st.position.set(x + 10 + k * 7, 0, z + 26); scene.add(st);
      const b = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), F(0xffffff, 0x555555, 0.3)); b.position.y = 1.5; st.add(b);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.4, 4.6), F(NEON[k], NEON[k], 0.5)); aw.position.y = 3.4; st.add(aw); }
  }  inst(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 6), F(0x5a3d25), PI_.trunk);
  [0, 1, 2].forEach(k => inst(new THREE.ConeGeometry(0.32 - k * 0.07, 0.45, 7), F(0x1f5a32, 0x06200f, 0.4), PI_.c[k]));
}

// ---------- textures ----------
function windowTex(color, lit = 0.55, seed = 1) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 128;
  const g = c.getContext("2d"); g.fillStyle = "#0d0726"; g.fillRect(0, 0, 64, 128);
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
    if (rnd() < lit) { g.fillStyle = rnd() < 0.15 ? color : rnd() < 0.5 ? "#ffe9b0" : "#fff6dc"; g.fillRect(x, y, 4, 5); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}
const hex = c => "#" + c.toString(16).padStart(6, "0");

function boardTex(b) {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 1200;  // drawn at 2x for sharp billboards
  const g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0); paintBoard(g, b);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
// ---------- big billboards (owner 2026-10-08): drawn on a 1024 x 576 canvas (2x for sharpness) ----------
function bigFrame(g, col, title, sub) {
  const W = 1024, H = 576, grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, "#160a3c"); grd.addColorStop(1, "#05020f");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = col; g.lineWidth = 8; g.shadowColor = col; g.shadowBlur = 26; g.strokeRect(10, 10, W - 20, H - 20); g.shadowBlur = 0;
  g.fillStyle = col; g.font = "800 46px Sora"; g.textBaseline = "alphabetic"; g.fillText(title, 40, 74, W - 80);
  if (sub) { g.fillStyle = "#a99cd6"; g.font = "600 22px Inter"; g.fillText(sub, 42, 106, W - 84); }
}
function drawOlympics(g, race) {  // Olympic results board: one bot per row, medal, name, value, profit $ and %
  bigFrame(g, "#ffd166", "🏅 BOT OLYMPICS", "Race to $250 · ranked by profit % from each bot's own start");
  const cols = [40, 130, 560, 720, 870], y0 = 140, rh = Math.min(96, (576 - y0 - 30) / Math.max(1, race.length));
  g.fillStyle = "#7d74a8"; g.font = "700 18px Inter"; ["", "BOT", "VALUE", "PROFIT", "%"].forEach((h, i) => g.fillText(h, cols[i], y0 - 8));
  const medal = ["#ffd166", "#d9dde6", "#cd7f32"];
  race.forEach((r, i) => {
    const y = y0 + i * rh, up = r.value >= r.start, pc = (r.value - r.start) / r.start * 100;
    if (i % 2 === 0) { g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(24, y, 976, rh); }
    g.strokeStyle = "rgba(169,156,214,0.35)"; g.lineWidth = 2; g.beginPath(); g.moveTo(24, y + rh); g.lineTo(1000, y + rh); g.stroke();
    const cy = y + rh / 2;
    g.fillStyle = medal[i] || "#3a2f66"; g.beginPath(); g.arc(cols[0] + 34, cy, rh * 0.32, 0, 7); g.fill();
    g.fillStyle = i < 3 ? "#1a1033" : "#fff"; g.font = `800 ${Math.round(rh * 0.34)}px Sora`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), cols[0] + 34, cy + 1);
    g.textAlign = "left"; g.fillStyle = "#fff"; g.font = `800 ${Math.round(rh * 0.36)}px Sora`; g.fillText(r.name.replace(" LIVE", ""), cols[1], cy - (r.live ? 4 : 0), 330);
    if (r.live) { const w = g.measureText(r.name.replace(" LIVE", "")).width; g.fillStyle = "#ff3b6b"; g.font = "800 18px Inter"; g.fillText("● LIVE $", cols[1] + Math.min(330, w) + 12, cy - 4); }
    g.fillStyle = "#a99cd6"; g.font = "600 17px Inter"; g.fillText(r.live ? "real money" : "practice money", cols[1], cy + rh * 0.3);
    g.fillStyle = "#fff"; g.font = `700 ${Math.round(rh * 0.32)}px Sora`; g.fillText(usd(r.value), cols[2], cy);
    g.fillStyle = up ? "#3dffa8" : "#ff4d6d"; g.fillText((up ? "+" : "-") + "$" + Math.abs(r.value - r.start).toFixed(2), cols[3], cy);
    g.fillText((pc >= 0 ? "+" : "") + pc.toFixed(1) + "%", cols[4], cy);
  });
  g.textBaseline = "alphabetic";
}
function drawOutput(g, rows) {  // Factory Output: one row per factory
  bigFrame(g, "#ff8a3d", "🏭 FACTORY OUTPUT", "What the Industrial Park has made and sold");
  const y0 = 130, rh = (576 - y0 - 28) / rows.length, cols = [44, 330, 560, 800];
  rows.forEach((r, i) => {
    const y = y0 + i * rh, cy = y + rh / 2;
    if (i % 2 === 0) { g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(24, y, 976, rh); }
    g.strokeStyle = "rgba(255,138,61,0.3)"; g.lineWidth = 2; g.beginPath(); g.moveTo(24, y + rh); g.lineTo(1000, y + rh); g.stroke();
    g.textBaseline = "middle"; g.fillStyle = "#fff"; g.font = "800 30px Sora"; g.fillText(r[0], cols[0], cy, 270);
    g.font = "600 26px Inter"; g.fillStyle = "#d8ccff"; g.fillText(r[1], cols[1], cy, 220); g.fillText(r[2], cols[2], cy, 230);
    g.fillStyle = "#3dffa8"; g.font = "800 28px Sora"; g.fillText(r[3] || "", cols[3], cy, 190);
  });
  g.textBaseline = "alphabetic";
}
function drawProducts(g, p) {  // the 2 main products (owner 2026-10-08): Virtual Dashboard HUBs + The AI Influencers
  bigFrame(g, "#ffd166", "OUR 2 PRODUCTS", "Sonneblom Digitaal");
  [["🏙️", "VIRTUAL DASHBOARD HUBS", "Your side hustles as a living 3D city", `${num(p.hubVisits)} visits · ${num(p.hubSales)} sold`, "#00f0ff"],
   ["🤖", "THE AI INFLUENCERS", "AI faces that grow audiences and sell", `${num(p.faces)} faces · ${num(p.followers)} followers`, "#ff4fd8"]].forEach(([ic, t, sub, st, c], i) => {
    const x = 40 + i * 482, y = 132, w = 462, h = 410;
    g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(x, y, w, h); g.strokeStyle = c; g.lineWidth = 5; g.shadowColor = c; g.shadowBlur = 18; g.strokeRect(x, y, w, h); g.shadowBlur = 0;
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = "120px serif"; g.fillStyle = "#fff"; g.fillText(ic, x + w / 2, y + 110);
    g.fillStyle = c; g.font = "800 36px Sora"; g.fillText(t, x + w / 2, y + 230, w - 30);
    g.fillStyle = "#d8ccff"; g.font = "600 22px Inter"; g.fillText(sub, x + w / 2, y + 280, w - 30);
    g.fillStyle = "#3dffa8"; g.font = "800 26px Sora"; g.fillText(st, x + w / 2, y + 345, w - 30);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
  });
}
const FACEIMG = Object.fromEntries(["ollie", "granny", "nobody"].map(id => { const im = new Image(); im.src = "faces/" + id + ".jpg"; return [id, im]; }));  // creator photos on the billboard (owner 2026-10-10)
function drawFaces(g, faces) {  // "Introducing the new faces of SHC": one card per new influencer
  bigFrame(g, "#ff4fd8", "INTRODUCING THE NEW FACES OF SHC", "Side Hustle City's newest creators");
  const n = Math.max(1, faces.length), cw = Math.min(300, (944 - (n - 1) * 20) / n), x0 = (1024 - (n * cw + (n - 1) * 20)) / 2, cols = ["#ff4fd8", "#ffd166", "#38bdf8", "#3dffa8", "#ff8a3d"];
  if (!faces.length) { g.fillStyle = "#fff"; g.font = "800 60px Sora"; g.textAlign = "center"; g.fillText("Coming soon…", 512, 340); g.textAlign = "left"; return; }
  faces.forEach((f, i) => {
    const x = x0 + i * (cw + 20), y = 140, h = 400, c = cols[i % cols.length];
    g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(x, y, cw, h); g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(x, y, cw, h);
    g.textAlign = "center"; g.textBaseline = "middle";
    const im = FACEIMG[f.id];
    if (im && im.complete && im.naturalWidth) { const pw = cw - 24, ph = 230, r = Math.max(pw / im.naturalWidth, ph / im.naturalHeight), sw = pw / r, sh = ph / r;
      g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) * 0.2, sw, sh, x + 12, y + 12, pw, ph); }
    else { g.font = `${Math.round(cw * 0.42)}px serif`; g.fillText(f.emoji || "⭐", x + cw / 2, y + 120); }
    g.fillStyle = "#fff"; g.font = `800 ${Math.round(Math.min(40, cw * 0.15))}px Sora`; g.fillText(f.name, x + cw / 2, y + 276, cw - 20);
    g.fillStyle = c; g.font = "600 22px Inter"; g.fillText(f.username ? "@" + f.username : "", x + cw / 2, y + 316, cw - 20);
    if (f.followers != null) { g.fillStyle = "#a99cd6"; g.font = "700 24px Inter"; g.fillText(`${num(f.followers)} followers`, x + cw / 2, y + 356, cw - 20); }
    g.textAlign = "left"; g.textBaseline = "alphabetic";
  });
}
function drawVentures(g, list) {
  bigFrame(g, "#ff4fd8", "NEW VENTURES", "What we're building and testing next");
  list.forEach((v, i) => {
    const y = 150 + i * 80;
    g.fillStyle = v.status === "live" ? "#3dffa8" : v.status === "testing" ? "#ffd166" : "#7d74a8"; g.font = "800 20px Inter"; g.fillText(String(v.status || "").toUpperCase(), 44, y + 34);
    g.fillStyle = "#fff"; g.font = "800 34px Sora"; g.fillText(v.title || "", 190, y + 26, 790);
    g.fillStyle = "#a99cd6"; g.font = "500 20px Inter"; g.fillText(v.text || "", 190, y + 56, 790);
  });
}
function bigTex(draw) {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 1152;
  const g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0); draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.redraw = d => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 2048, 1152); g.setTransform(2, 0, 0, 2, 0, 0); d(g); t.needsUpdate = true; };
  return t;
}
// a bot's home in the Suburbs: who they are, how they're doing, their last report and their team
function homeHTML(x, team) {
  const r = x.report || {}, crew = team.filter(y => y.boss === x.id), boss = team.find(y => y.id === x.boss);
  return `<h2>${esc(x.emoji)} ${esc(x.name)}${x.title ? " · " + esc(x.title) : ""}</h2><div class="sub">${esc(x.job || "")}</div>
    <div class="staffbox"><div class="lt">🏠 Lives here</div>${staffRow(x)}</div>
    <div class="note">${x.profile?.cron ? `<b>Shift:</b> ${esc(x.profile.cron)}<br>` : ""}${boss ? `<b>Reports to:</b> ${esc(boss.emoji)} ${esc(boss.name)}<br>` : ""}${x.profile?.mission ? `<b>Mission:</b> ${esc(x.profile.mission)}` : ""}</div>
    ${r.title ? `<div class="note"><b>Last report:</b> ${esc(r.title)} <i>${esc(r.ts || "")}</i>${(r.lines || []).slice(0, 8).map(l => "<br>• " + esc(l)).join("")}</div>` : ""}
    ${crew.length ? `<div class="staffbox"><div class="lt">👥 Team</div>${crew.map(staffRow).join("")}</div>` : ""}`;
}
function paintBoard(g, b) {
  const W = 1024, H = 600, col = hex(b.color);
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, "#160a3c"); grd.addColorStop(1, "#07031a");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = col; g.lineWidth = 10; g.shadowColor = col; g.shadowBlur = 30; g.strokeRect(12, 12, W - 24, H - 24); g.shadowBlur = 0;
  g.fillStyle = col; g.font = "800 54px Sora"; g.fillText(b.board.title, 48, 92);
  const dot = { ok: "#3dffa8", down: "#ff4d6d", stale: "#ffd166", unknown: "#7d74a8" }[b.status];
  g.fillStyle = dot; g.beginPath(); g.arc(W - 70, 74, 18, 0, 7); g.fill();
  g.fillStyle = "#3dffa8"; g.font = "800 132px Sora"; g.shadowColor = "#3dffa8"; g.shadowBlur = 24;
  let main = String(b.board.main); g.fillText(main, 48, 250, W - 96); g.shadowBlur = 0;
  g.fillStyle = "#a99cd6"; g.font = "600 34px Inter"; g.fillText(scrub(b.board.mainLabel), 52, 300);
  const rows = b.board.rows.slice(0, 6);
  rows.forEach(([k, v], i) => {
    const x = 48 + (i % 2) * 480, y = 380 + Math.floor(i / 2) * 76;
    g.fillStyle = "#a99cd6"; g.font = "600 30px Inter"; g.fillText(scrub(k), x, y);
    g.fillStyle = "#ffffff"; g.font = "800 40px Sora"; g.fillText(String(v), x + 230, y, 220);
  });
}

// ---------- scene ----------
let renderer, scene, camera, controls, labels, composer, bloom, clock = new THREE.Clock();
const picks = [], anim = [], groups = {};
let flight = null;

function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  document.body.prepend(renderer.domElement);
  labels = new CSS2DRenderer(); labels.setSize(innerWidth, innerHeight);
  Object.assign(labels.domElement.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: 5 });
  document.body.append(labels.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0420);
  scene.fog = new THREE.FogExp2(0x1a0b3a, 0.0021);
  camera = new THREE.PerspectiveCamera(MOBILE ? 58 : 48, innerWidth / innerHeight, 0.5, 1600);
  controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 6, maxDistance: 620, maxPolarAngle: 1.47,
    screenSpacePanning: false, zoomSpeed: 1.1, rotateSpeed: 0.7 });
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  home(true);

  scene.add(new THREE.HemisphereLight(0x9c7bff, 0x10052a, 0.9));
  const moon = new THREE.DirectionalLight(0xc9b8ff, 0.8); moon.position.set(-40, 80, 30); scene.add(moon);

  // multisampled target: the bloom pipeline bypasses the canvas antialias, so smooth edges here instead
  const pr = renderer.getPixelRatio();
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: MOBILE ? 2 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.45, 0.82);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  addrEventListeners();
}

// ---------- Suburbs layout (owner 2026-10-08): every quarter on its own rounded block, curvy roads, big parks between, Media up on a hill ----------
// Downtown (Library, Vault, studios) in the middle; Media Hill west; Industrial Park east; Trading Town north; the bots' homes south.
// Quarters you are not looking at fade into a coloured fog light and brighten as you fly over to them (fadeDistricts).
const RW = 5;                          // half road width
const DIST = [                         // c = centre, h = radius inside the ring road (hill: plateau radius, foot = hill), wb/ph = how wobbly the edge is
  { id: "down", name: "DOWNTOWN", color: 0xffd166, c: [0, 0], h: 46, y: 0, wb: 0.06, ph: 0.3 },
  { id: "media", name: "MEDIA HILL", color: 0x3b82f6, c: [-150, 0], h: 36, y: 12, hill: 64, view: [1, 0], look: 12 },
  { id: "trade", name: "TRADING TOWN", color: 0x9945ff, c: [0, -152], h: 40, y: 0, wb: 0.08, ph: 1.2, look: 20 },
  { id: "ind", name: "INDUSTRIAL PARK", color: 0xff8a3d, c: [150, 0], h: 54, y: 0, wb: 0.07, ph: 2.1, look: 10 },
  { id: "subs", name: "THE SUBURBS", color: 0x22ff88, c: [0, 152], h: 44, y: 0, wb: 0.08, ph: 0.7 },
];
const EXT = 240;                       // city edge (grass ends, fog takes over)
const VAULT = [0, 6];                  // the Vault in the middle of Downtown
const POOL = [-4, 4, -17, -9];         // reflecting pool in front of the Library
const PLAZA = [-14, 14, -6, 18];       // paved square round the Vault
const NEON = [0xff2bd6, 0x00f0ff, 0xfff200, 0xff3b6b, 0x8b5cf6, 0x22ff88, 0xff8a00];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const towers = [];
const HILL = DIST[1];
function hillY(x, z) {  // ground height (only Media Hill rises: a flat plateau with a sloped skirt)
  const r = Math.hypot(x - HILL.c[0], z - HILL.c[1]);
  return r <= HILL.h ? HILL.y : r >= HILL.hill ? 0 : HILL.y * (HILL.hill - r) / (HILL.hill - HILL.h);
}
const blobR = (D, a, extra = 0) => D.hill ? D.h + extra : (D.h + extra) * (1 + D.wb * Math.sin(3 * a + D.ph) + 0.035 * Math.sin(5 * a + 1));
const blobPt = (D, a, extra = 0) => [D.c[0] + Math.cos(a) * blobR(D, a, extra), D.c[1] + Math.sin(a) * blobR(D, a, extra)];
const blob = (D, extra = 0, n = 96) => [...Array(n)].map((_, i) => blobPt(D, i / n * Math.PI * 2, extra));
let ROADS = [], RHASH = new Map();
function roadList() {  // ring roads round every block + curving avenues joining them to Downtown
  const [dn, md, tr, ind, sb] = DIST, out = [dn, tr, ind, sb].map(D => ({ pts: blob(D, RW + 1, 120), loop: true }));
  const link = (D, a, end) => {
    const A = blobPt(dn, a, RW + 1), B = end || blobPt(D, a + Math.PI, RW + 1), mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L, k = L * 0.22;
    const ctrl = [A, [mx * 0.5 + A[0] * 0.5 + nx * k, mz * 0.5 + A[1] * 0.5 + nz * k], [mx * 0.5 + B[0] * 0.5 - nx * k, mz * 0.5 + B[1] * 0.5 - nz * k], B];
    if (end) ctrl.splice(3, 0, [B[0] + 8, B[1]]);
    const cv = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    return { pts: cv.getSpacedPoints(Math.ceil(L / 2.5)).map(v => [v.x, v.z]) };
  };
  out.push(link(tr, -Math.PI / 2), link(sb, Math.PI / 2), link(ind, 0), link(md, Math.PI, [md.c[0] + md.hill, md.c[1]]));
  return out;
}
const segsOf = R => R.pts.map((p, i) => [p, R.pts[(i + 1) % R.pts.length]]).slice(0, R.loop ? R.pts.length : R.pts.length - 1);
function hashRoads() {  // sample points along every road into a 10 m grid so "how far to the nearest road" is cheap
  RHASH = new Map();
  ROADS.forEach(R => segsOf(R).forEach(([[x0, z0], [x1, z1]]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5));
    for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n, k = `${Math.floor(x / 10)},${Math.floor(z / 10)}`; (RHASH.get(k) || RHASH.set(k, []).get(k)).push(x, z); }
  }));
}
function roadDist(x, z) {
  let m = 1e9; const cx = Math.floor(x / 10), cz = Math.floor(z / 10);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = RHASH.get(`${cx + i},${cz + j}`); if (a) for (let k = 0; k < a.length; k += 2) m = Math.min(m, Math.hypot(x - a[k], z - a[k + 1])); }
  return m;
}
function normals(P, loop) {  // unit normal at every point of a polyline
  const n = P.length;
  return P.map((p, i) => {
    const a = P[loop ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[loop ? (i + 1) % n : Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  });
}
function ribbon2(P, loop, half, y, mat) {  // flat strip along a polyline
  const N = normals(P, loop), pos = [], idx = [], n = P.length;
  P.forEach(([x, z], i) => pos.push(x + N[i][0] * half, y, z + N[i][1] * half, x - N[i][0] * half, y, z - N[i][1] * half));
  for (let i = 0; i < (loop ? n : n - 1); i++) { const j = (i + 1) % n; idx.push(2 * i, 2 * j, 2 * i + 1, 2 * i + 1, 2 * j, 2 * j + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); scene.add(m); return m;
}
function along(R, step, fn, skip = 0) {  // walk a road every `step` metres: fn(x, z, nx, nz, heading)
  const N = normals(R.pts, R.loop); let acc = skip;
  segsOf(R).forEach(([[x0, z0], [x1, z1]], i) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    while (acc < len) { const t = acc / len; fn(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, N[i][0], N[i][1], Math.atan2(x1 - x0, z1 - z0)); acc += step; }
    acc -= len;
  });
}

function ground() {
  towers.length = 0; ROADS = roadList(); hashRoads();
  const d = new THREE.Object3D(), col = new THREE.Color();
  const flat = (w, h, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(x, y, z); scene.add(m); return m; };
  // night asphalt to the horizon, the city's lawns on top (rounded corners)
  flat(2600, 2600, new THREE.MeshStandardMaterial({ color: 0x0b0716, roughness: 0.28, metalness: 0.6 }), 0, 0, 0);
  const grassM = new THREE.MeshStandardMaterial({ color: 0x1d6b3c, emissive: 0x06301a, roughness: 0.95 });
  const lawnS = new THREE.Shape(); const E = EXT, rr = 60;
  lawnS.moveTo(-E + rr, -E); lawnS.lineTo(E - rr, -E); lawnS.quadraticCurveTo(E, -E, E, -E + rr); lawnS.lineTo(E, E - rr); lawnS.quadraticCurveTo(E, E, E - rr, E);
  lawnS.lineTo(-E + rr, E); lawnS.quadraticCurveTo(-E, E, -E, E - rr); lawnS.lineTo(-E, -E + rr); lawnS.quadraticCurveTo(-E, -E, -E + rr, -E);
  const lawn = new THREE.Mesh(new THREE.ShapeGeometry(lawnS, 16).rotateX(-Math.PI / 2), grassM); lawn.position.y = 0.3; scene.add(lawn);
  const kerb = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(lawnS.getSpacedPoints(200).map(p => new THREE.Vector3(p.x, 0.32, -p.y))), new THREE.LineBasicMaterial({ color: 0x22ff88 })); scene.add(kerb);
  // rounded block pads inside the ring roads (the hill gets its own mound)
  const padM = new THREE.MeshStandardMaterial({ color: 0x1b1530, roughness: 0.7 });
  DIST.forEach(D => {
    if (D.hill) return;
    const P = blob(D, 0.5), sh = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z)));
    const pad = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), D.id === "subs" ? new THREE.MeshStandardMaterial({ color: 0x23744a, emissive: 0x07361d, roughness: 0.95 }) : padM);
    pad.position.y = 0.31; scene.add(pad);
    scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P.map(([x, z]) => new THREE.Vector3(x, 0.34, z))), new THREE.LineBasicMaterial({ color: D.color })));
  });
  // Media Hill: grassy mound with a flat top, a lit rim and a ramp road up from the west avenue
  const [hx, hz] = HILL.c, rise = HILL.hill - HILL.h;
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(HILL.h, HILL.hill, HILL.y, 72, 4), new THREE.MeshStandardMaterial({ color: 0x1f7a44, emissive: 0x07361d, roughness: 0.95 }));
  mound.position.set(hx, HILL.y / 2 + 0.3, hz); scene.add(mound);
  const top = new THREE.Mesh(new THREE.CircleGeometry(HILL.h - 4, 64), padM); top.rotation.x = -Math.PI / 2; top.position.set(hx, HILL.y + 0.32, hz); scene.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(HILL.h, 0.18, 6, 96), new THREE.MeshBasicMaterial({ color: HILL.color, toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.set(hx, HILL.y + 0.35, hz); scene.add(rim);
  const roadM = new THREE.MeshStandardMaterial({ color: 0x14101f, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide });
  const rampLen = Math.hypot(rise, HILL.y), ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen + 1, 0.4, RW * 2), roadM);
  ramp.position.set(hx + HILL.h + rise / 2, HILL.y / 2 + 0.45, hz); ramp.rotation.z = -Math.atan2(HILL.y, rise); scene.add(ramp);
  flat(10, RW * 2, roadM, hx + HILL.h - 4, HILL.y + 0.34, hz);
  // roads: one smooth asphalt ribbon each, yellow dashed centre line, lamps on both kerbs
  const dashes = [], L = [];
  ROADS.forEach(R => {
    ribbon2(R.pts, R.loop, RW, 0.34, roadM);
    along(R, 6, (x, z, nx, nz, ry) => dashes.push([x, z, ry]), 3);
    along(R, MOBILE ? 26 : 18, (x, z, nx, nz, ry) => { for (const s of [-1, 1]) { const lx = x + nx * s * (RW + 0.4), lz = z + nz * s * (RW + 0.4); if (roadDist(lx, lz) > RW - 0.2) L.push([lx, lz, Math.atan2(-nx * s, -nz * s)]); } }, 8);
  });
  const mark = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.02, 3), new THREE.MeshBasicMaterial({ color: 0xffd34d }), dashes.length);
  dashes.forEach(([x, z, ry], i) => { d.position.set(x, 0.36, z); d.rotation.set(0, ry, 0); d.updateMatrix(); mark.setMatrixAt(i, d.matrix); });
  scene.add(mark);
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 5.2, 6), new THREE.MeshStandardMaterial({ color: 0x2b2550, metalness: 0.7, roughness: 0.4 }), L.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 1.8), new THREE.MeshStandardMaterial({ color: 0x2b2550 }), L.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.14, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), L.length);
  const lampCols = [0x00f0ff, 0xff2bd6, 0xffe2a8];
  L.forEach(([x, z, ry], i) => {
    d.rotation.set(0, 0, 0); d.position.set(x, 2.9, z); d.updateMatrix(); post.setMatrixAt(i, d.matrix);
    d.rotation.set(0, ry, 0); d.position.set(x, 5.4, z); d.translateZ(0.9); d.updateMatrix(); arm.setMatrixAt(i, d.matrix);
    d.translateZ(0.7); d.position.y = 5.3; d.updateMatrix(); head.setMatrixAt(i, d.matrix); head.setColorAt(i, col.set(lampCols[i % 3]));
  });
  scene.add(post, arm, head);
  suburbs(); cars(); skyCars(); rain();
  const sp = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) { const a = Math.random() * 6.28, e = Math.random() * 1.2 + 0.25, R = 900; sp.set([Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xd8ccff, size: 1.6, fog: false })));
}

// the Suburbs: a village green with a fountain in the middle; the bots' homes stand round it (kind "home" buildings).
// The public demo has no staff, so it gets ordinary houses instead.
function suburbs() {
  const S = DIST[4], [cx, cz] = S.c;
  const green = new THREE.Mesh(new THREE.CircleGeometry(15, 48), new THREE.MeshStandardMaterial({ color: 0x3d3550, roughness: 0.7 })); green.rotation.x = -Math.PI / 2; green.position.set(cx, 0.33, cz); scene.add(green);
  const ringE = new THREE.Mesh(new THREE.TorusGeometry(15, 0.15, 6, 64), new THREE.MeshBasicMaterial({ color: S.color, toneMapped: false })); ringE.rotation.x = Math.PI / 2; ringE.position.set(cx, 0.36, cz); scene.add(ringE);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.9, 32), new THREE.MeshStandardMaterial({ color: 0xd9d2c4, emissive: 0x332a1a, emissiveIntensity: 0.3 })); bowl.position.set(cx, 0.75, cz); scene.add(bowl);
  const wtr = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0x0a2a55, emissive: 0x38bdf8, emissiveIntensity: 0.5 })); wtr.position.set(cx, 1.2, cz); scene.add(wtr);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.5, 4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  jet.position.set(cx, 3.2, cz); scene.add(jet); anim.push((dt, t) => { jet.scale.y = 0.85 + Math.sin(t * 3) * 0.15; });
  solids.push({ x: cx, z: cz, r: 5.5, h: 5 });
  if (M.B.some(b => b.home)) return;
  const d = new THREE.Object3D(), col = new THREE.Color(), H = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.26; H.push([cx + Math.sin(a) * 27, cz - Math.cos(a) * 27, Math.atan2(-Math.sin(a), Math.cos(a))]); }
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 3.4, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x150a30, roughness: 0.8 }), H.length);
  const roof = new THREE.InstancedMesh(new THREE.ConeGeometry(4.9, 2.6, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0x2a1f4a, emissive: 0x3b1d6e, emissiveIntensity: 0.5, flatShading: true }), H.length);
  const walls = [0xf6c2c2, 0xbfe0ff, 0xfff1a8, 0xc9f2c7, 0xe3cdf7, 0xffd8a8];
  H.forEach(([x, z, ry], i) => {
    d.rotation.set(0, ry, 0); d.position.set(x, 2.0, z); d.updateMatrix(); body.setMatrixAt(i, d.matrix); body.setColorAt(i, col.set(walls[i % walls.length]).multiplyScalar(0.55));
    d.position.y = 5.0; d.updateMatrix(); roof.setMatrixAt(i, d.matrix); solids.push({ x, z, r: 3.5, h: 6 });
  });
  scene.add(body, roof);
}

// cars on every road: body, glass cabin, 4 wheels, headlights, red light bar and neon underglow; one lane each way
function cars() {
  const lanes = [];
  ROADS.forEach(R => [[-2.4, 1], [2.4, -1]].forEach(([off, dir]) => {
    const N = normals(R.pts, R.loop); let P = R.pts.map(([x, z], i) => [x + N[i][0] * off, z + N[i][1] * off]);
    if (dir < 0) P.reverse();
    const segs = (R.loop ? P.map((p, i) => [p, P[(i + 1) % P.length]]) : P.slice(0, -1).map((p, i) => [p, P[i + 1]])).map(([a, b]) => ({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.01 }));
    lanes.push({ segs, len: segs.reduce((t, s) => t + s.len, 0), v: rnd(9, 17) });
  }));
  const total = lanes.reduce((t, l) => t + l.len, 0), N = MOBILE ? 64 : 130, list = [];
  lanes.forEach(ln => { const n = Math.max(1, Math.round(N * ln.len / total)); for (let i = 0; i < n; i++) list.push({ ln, s: Math.random() * ln.len, v: ln.v * rnd(0.9, 1.1) }); });
  const n = list.length, part = (geo, mat, count) => { const m = new THREE.InstancedMesh(geo, mat, count); scene.add(m); return m; };
  const bodyCols = [0x1e1b4b, 0xfafafa, 0x111111, 0xb91c1c, 0x0ea5e9, 0xfacc15, 0x6d28d9, 0x9ca3af, 0x064e3b];
  const body = part(new THREE.BoxGeometry(1.9, 0.55, 4.3), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.75, roughness: 0.28 }), n);
  const nose = part(new THREE.BoxGeometry(1.86, 0.3, 1.1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.75, roughness: 0.28 }), n);
  const cabin = part(new THREE.BoxGeometry(1.6, 0.5, 2.1), new THREE.MeshStandardMaterial({ color: 0x0a0f1f, metalness: 0.9, roughness: 0.1, emissive: 0x1b2a55, emissiveIntensity: 0.6 }), n);
  const wheel = part(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }), n * 4);
  const hl = part(new THREE.BoxGeometry(0.45, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xf2f7ff, toneMapped: false }), n * 2);
  const tl = part(new THREE.BoxGeometry(1.7, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xff1a3c, toneMapped: false }), n);
  const glow = part(new THREE.PlaneGeometry(2.3, 4.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), n);
  const col = new THREE.Color();
  list.forEach((c, i) => { body.setColorAt(i, col.set(bodyCols[i % bodyCols.length])); nose.setColorAt(i, col); glow.setColorAt(i, col.set(NEON[i % NEON.length])); });
  const loc = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const P = { body: loc(0, 0.62, 0), nose: loc(0, 0.45, 1.9), cabin: loc(0, 1.13, -0.35), tl: loc(0, 0.78, -2.17), glow: loc(0, 0.06, 0),
    w: [loc(-0.95, 0.36, 1.35), loc(0.95, 0.36, 1.35), loc(-0.95, 0.36, -1.35), loc(0.95, 0.36, -1.35)], hl: [loc(-0.6, 0.6, 2.46), loc(0.6, 0.6, 2.46)] };
  const m = new THREE.Matrix4(), tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const set = (inst, i, local) => inst.setMatrixAt(i, tmp.multiplyMatrices(m, local));
  anim.push(dt => {
    list.forEach((c, i) => {
      const ln = c.ln; c.s = (c.s + c.v * dt) % ln.len;
      let s = c.s, k = 0; while (k < ln.segs.length - 1 && s > ln.segs[k].len) s -= ln.segs[k++].len;
      const g = ln.segs[k], t = Math.min(1, s / g.len), dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1];
      pos.set(g.a[0] + dx * t, 0.34, g.a[1] + dz * t); q.setFromAxisAngle(up, Math.atan2(dx, dz));
      m.compose(pos, q, one);
      set(body, i, P.body); set(nose, i, P.nose); set(cabin, i, P.cabin); set(tl, i, P.tl); set(glow, i, P.glow);
      P.w.forEach((w, k) => set(wheel, i * 4 + k, w)); P.hl.forEach((h, k) => set(hl, i * 2 + k, h));
    });
    for (const x of [body, nose, cabin, wheel, hl, tl, glow]) x.instanceMatrix.needsUpdate = true;
  });
}

// flying cars circling the city at different heights, with blinking lights
function skyCars() {
  const N = MOBILE ? 10 : 22, list = [];
  for (let i = 0; i < N; i++) list.push({ r: rnd(50, 200), a: Math.random() * 6.28, y: rnd(30, 85), v: rnd(22, 40) * pick([-1, 1]), ph: Math.random() * 6 });
  const hull = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.9, 3.2, 4, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa4c4, metalness: 0.85, roughness: 0.25 }), N);
  const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(1.25, 0.12, 6, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N);
  const blink = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2040, toneMapped: false }), N);
  const col = new THREE.Color(); list.forEach((c, i) => ring.setColorAt(i, col.set(NEON[(i + 2) % NEON.length])));
  scene.add(hull, ring, blink);
  const d = new THREE.Object3D();
  anim.push((dt, t) => {
    list.forEach((c, i) => {
      c.a += c.v / c.r * dt;
      d.position.set(Math.cos(c.a) * c.r, c.y + Math.sin(t * 0.8 + c.ph) * 1.2, Math.sin(c.a) * c.r);
      d.rotation.set(0, -c.a + (c.v > 0 ? 0 : Math.PI), Math.sin(t + c.ph) * 0.05);
      d.scale.setScalar(1); d.updateMatrix(); hull.setMatrixAt(i, d.matrix); ring.setMatrixAt(i, d.matrix);
      d.translateY(1); d.scale.setScalar((t * 2 + c.ph) % 1 < 0.15 ? 1.4 : 0.01); d.updateMatrix(); blink.setMatrixAt(i, d.matrix);
    });
    hull.instanceMatrix.needsUpdate = ring.instanceMatrix.needsUpdate = blink.instanceMatrix.needsUpdate = true;
  });
}

// Times Square: big screens on the towers facing the park, cycling through every building's numbers, plus a news ticker
function slides() {
  const r = M.s.rose_diary || {};
  return [{ color: 0xff2bd6, status: "ok", board: { title: "SONNEBLOM CITY", main: usd(M.day), mainLabel: "made today across the city", rows: [["All time", usd(M.tot)], ["Sales", num(M.sales)], ["Rose followers", num(r.followers)], ["Buildings", M.B.length]] } },
    ...M.B.filter(b => b.board).map(b => ({ ...b, title: b.board.title }))];
}
function timesSquare(screens) {
  const S = slides(), cvs = [];
  screens.forEach((sc, i) => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 600;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sc.w, sc.h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    mesh.position.set(sc.x, sc.y, sc.z); mesh.rotation.y = sc.ry; scene.add(mesh);
    const frame = neonEdges(new THREE.PlaneGeometry(sc.w + 0.5, sc.h + 0.5), pick(NEON)); frame.position.copy(mesh.position); frame.rotation.y = sc.ry; scene.add(frame);
    cvs.push({ c, t, k: i % S.length });
    paint(c, t, S[i % S.length]);
  });
  // ticker under every second screen
  const tc = document.createElement("canvas"); tc.width = 4096; tc.height = 128;
  const g = tc.getContext("2d"); g.scale(2, 2); g.fillStyle = "#05020f"; g.fillRect(0, 0, 2048, 64);
  const r = M.s.rose_diary || {};
  const items = [`CITY TODAY ${usd(M.day)}`, `ALL TIME ${usd(M.tot)}`, ...M.B.filter(b => b.tag).map(b => `${b.short} ${b.tag[0]}`), `ROSE ${num(r.followers)} FOLLOWERS`];
  g.font = "800 34px Sora"; g.fillStyle = "#ffd34d"; g.fillText(items.join("   ◆   ") + "   ◆   ", 10, 45, 2030);
  const tt = new THREE.CanvasTexture(tc); tt.wrapS = THREE.RepeatWrapping; tt.repeat.x = 0.35; tt.colorSpace = THREE.SRGBColorSpace; tt.anisotropy = renderer.capabilities.getMaxAnisotropy();
  screens.forEach((sc, i) => { if (i % 2) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sc.w, 1.3), new THREE.MeshBasicMaterial({ map: tt, toneMapped: false }));
    m.position.set(sc.x, sc.y - sc.h / 2 - 1.2, sc.z); m.rotation.y = sc.ry; scene.add(m); });
  let next = 0, j = 0;
  anim.push((dt, t) => {
    tt.offset.x = (tt.offset.x + dt * 0.04) % 1;
    if (t > next && cvs.length) { next = t + 0.6; const s = cvs[j++ % cvs.length]; s.k = (s.k + 1) % S.length; paint(s.c, s.t, S[s.k]); }
  });
}
function paint(c, t, b) { const g = c.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); paintBoard(g, b); t.needsUpdate = true; }

// rain falling around the camera
function rain() {
  const N = MOBILE ? 900 : 2400, p = new Float32Array(N * 6), sp = [];
  for (let i = 0; i < N; i++) { const x = rnd(-70, 70), y = rnd(0, 60), z = rnd(-70, 70); p.set([x, y, z, x, y - 1.2, z], i * 6); sp.push(rnd(45, 65)); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb6ff, transparent: true, opacity: 0.28, depthWrite: false }));
  lines.userData.weather = true; scene.add(lines);
  anim.push(dt => {
    lines.position.set(Math.round(camera.position.x / 10) * 10, Math.max(0, camera.position.y - 40), Math.round(camera.position.z / 10) * 10);
    const W = SKIN.weather || {}, len = W.len ?? 1.2, f = W.speed ?? 1;
    if (!lines.visible) return;
    for (let i = 0; i < N; i++) { let y = p[i * 6 + 1] - sp[i] * f * dt; if (y < 0) y += 60; p[i * 6 + 1] = y; p[i * 6 + 4] = y - len; }
    geo.attributes.position.needsUpdate = true;
  });
}

function neonEdges(geo, color) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
}

function tower(w, h, d, color, seed, lit) {
  const g = new THREE.Group(), geo = new THREE.BoxGeometry(w, h, d), t = windowTex(hex(color), lit, seed);
  t.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 6)));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1c1050, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.75, roughness: 0.5 }));
  m.position.y = h / 2; g.add(m);
  const e = neonEdges(geo, color); e.position.y = h / 2; g.add(e);
  return g;
}

// which way a building's front (and billboard) faces: side quarters face the boulevard, markets face the Vault, the Library faces the pool
function faceDir(b) {
  if (b.face) return new THREE.Vector3(b.face[0], 0, b.face[1]);
  if (b.kind === "library") return new THREE.Vector3(0, 0, 1);
  if (Math.abs(b.pos[0]) > 40) return new THREE.Vector3(-Math.sign(b.pos[0]), 0, 0);
  return new THREE.Vector3(VAULT[0] - b.pos[0], 0, VAULT[1] - b.pos[1]).normalize();
}

function building(b) {
  const g = new THREE.Group(); g.position.set(b.pos[0], WLD ? 0 : hillY(b.pos[0], b.pos[1]), b.pos[1]); g.userData.b = b;
  const c = b.color, lit = b.status === "down" ? 0.08 : 0.6;
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(b.w * 0.95, b.w, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x24125e, emissive: c, emissiveIntensity: 0.25 }));
  plinth.position.y = 0.3; g.add(plinth);
  let top = b.h;
  if (WLD) { g.remove(plinth); top = worldModel(g, b); }
  else if (b.kind === "mega") {  // stepped skyscraper with a crown
    const t1 = tower(b.w, b.h * 0.55, b.d, c, 11, lit); g.add(t1);
    const t2 = tower(b.w * 0.72, b.h * 0.3, b.d * 0.72, c, 12, lit); t2.position.y = b.h * 0.55; g.add(t2);
    const t3 = tower(b.w * 0.45, b.h * 0.15, b.d * 0.45, c, 13, lit); t3.position.y = b.h * 0.85; g.add(t3);
    [[-b.w * 0.9, 0.45], [b.w * 0.9, 0.35]].forEach(([x, k]) => { const s = tower(b.w * 0.5, b.h * k, b.d * 0.6, c, 14 + x, lit); s.position.x = x; g.add(s); });
  } else if (b.kind === "market") {  // market hall: lit hall, glowing barrel roof, a row of striped stalls out front
    const f = faceDir(b), m = new THREE.Group(); m.rotation.y = Math.atan2(f.x, f.z); g.add(m);
    const h1 = b.h * 0.55; m.add(tower(b.w, h1, b.d, c, 41, lit));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(b.d / 2, b.d / 2, b.w, 24, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1a0f3a, emissive: c, emissiveIntensity: 0.45, metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide }));
    roof.rotation.z = Math.PI / 2; roof.position.y = h1; m.add(roof);
    for (let x = -b.w / 2; x <= b.w / 2 + 0.01; x += b.w / 4) { const r = neonEdges(new THREE.TorusGeometry(b.d / 2, 0.02, 3, 24, Math.PI), c); r.rotation.y = Math.PI / 2; r.position.set(x, h1, 0); m.add(r); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.7, 1.1), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); sign.position.set(0, h1 - 1, b.d / 2 + 0.05); m.add(sign);
    const n = Math.max(3, Math.round(b.w / 2.6)), step = b.w / n, cols = [c, 0xffffff];
    for (let i = 0; i < n; i++) {
      const x = -b.w / 2 + step * (i + 0.5), z = b.d / 2 + 2.4;
      const counter = new THREE.Mesh(new THREE.BoxGeometry(step * 0.8, 0.9, 1.1), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 })); counter.position.set(x, 0.75, z); m.add(counter);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(step * 0.9, 0.12, 1.7), new THREE.MeshStandardMaterial({ color: cols[i % 2], emissive: cols[i % 2], emissiveIntensity: 0.35 }));
      canopy.position.set(x, 2.5, z + 0.1); canopy.rotation.x = 0.25; m.add(canopy);
      for (const px of [-1, 1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), new THREE.MeshStandardMaterial({ color: 0xdddddd })); pole.position.set(x + px * step * 0.4, 1.4, z + 0.7); m.add(pole); }
      for (let k = 0; k < 3; k++) { const fr = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: pick([0xff4f4f, 0xffd34d, 0x7dff8a, 0xff9a3d]) })); fr.position.set(x - 0.4 + k * 0.4, 1.32, z); m.add(fr); }
    }
    top = h1 + b.d / 2;
  } else if (b.kind === "media") {  // HQ block with a spinning dish
    g.add(tower(b.w, b.h, b.d, c, 21, lit));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 12, 0, 6.28, 0, 1.1), new THREE.MeshStandardMaterial({ color: 0xbcd4ff, emissive: c, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    dish.rotation.x = Math.PI * 0.65; const piv = new THREE.Group(); piv.position.y = b.h + 1.2; piv.add(dish); g.add(piv);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7), new THREE.MeshBasicMaterial({ color: c })); mast.position.set(2.5, b.h + 3.5, 2.5); g.add(mast);
    anim.push(dt => piv.rotation.y += dt * 0.6); top = b.h + 7;
  } else if (b.kind === "spire") {  // slim pink tower with a glowing rose
    g.add(tower(b.w, b.h, b.d, c, 31, lit));
    const sp = new THREE.Mesh(new THREE.ConeGeometry(b.w * 0.42, 9, 4), new THREE.MeshStandardMaterial({ color: 0x2a0f3d, emissive: c, emissiveIntensity: 0.8 }));
    sp.position.y = b.h + 4.5; sp.rotation.y = Math.PI / 4; g.add(sp);
    const rose = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), new THREE.MeshBasicMaterial({ color: 0xff7ab8 })); rose.position.y = b.h + 10; g.add(rose);
    anim.push((dt, t) => { rose.rotation.y += dt; rose.scale.setScalar(1 + Math.sin(t * 2) * 0.12); }); top = b.h + 11;
  } else if (b.kind === "shop") {  // arcade: wide low block with neon awning
    g.add(tower(b.w, b.h, b.d, c, 41, lit));
    const aw = new THREE.Mesh(new THREE.BoxGeometry(b.w + 2, 0.4, 3), new THREE.MeshBasicMaterial({ color: c })); aw.position.set(0, 4, b.d / 2 + 1); g.add(aw);
    const t2 = tower(b.w * 0.5, 7, b.d * 0.5, c, 42, lit); t2.position.y = b.h; g.add(t2); top = b.h + 7;
  } else if (b.kind === "small") {  // little KDP bookshop with a delivery box sign
    g.add(tower(b.w, b.h, b.d, c, 51, lit));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(b.w * 0.8, 3.5, 4), new THREE.MeshStandardMaterial({ color: 0x3a2205, emissive: c, emissiveIntensity: 0.5 }));
    roof.position.y = b.h + 1.75; roof.rotation.y = Math.PI / 4; g.add(roof);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: 0xc8924a, emissive: 0xffb020, emissiveIntensity: 0.3 }));
    box.position.set(b.w / 2 + 1.5, 0.6, b.d / 2 + 1.5); g.add(box); top = b.h + 3.5;
  } else if (b.kind === "dome") {  // lab dome
    g.add(tower(b.w, b.h, b.d, c, 61, lit));
    const dm = new THREE.Mesh(new THREE.SphereGeometry(b.w * 0.6, 24, 12, 0, 6.28, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a1a66, emissive: c, emissiveIntensity: 0.7, wireframe: true }));
    dm.position.y = b.h; g.add(dm); anim.push(dt => dm.rotation.y += dt * 0.3); top = b.h + b.w * 0.6;
  } else if (b.kind === "coin") {  // mint tower with a spinning Solana-purple coin
    g.add(tower(b.w, b.h, b.d, c, 71, lit));
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.45, 32), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0x9945ff, emissiveIntensity: 0.55, metalness: 0.6 }));
    coin.rotation.x = Math.PI / 2; const piv = new THREE.Group(); piv.position.y = b.h + 3.2; piv.add(coin); g.add(piv);
    anim.push((dt, t) => { piv.rotation.y += dt * 1.4; piv.position.y = b.h + 3.2 + Math.sin(t * 1.5) * 0.4; }); top = b.h + 5.6;
  } else if (b.kind === "glass") {  // Contra: glass office tower with a spinning halo
    const glass = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshStandardMaterial({ color: 0x0b3a4a, metalness: 0.9, roughness: 0.08, emissive: c, emissiveIntensity: 0.18, transparent: true, opacity: 0.92 }));
    glass.position.y = b.h / 2; g.add(glass);
    for (let y = 3; y < b.h; y += 3) { const f = neonEdges(new THREE.BoxGeometry(b.w + 0.05, 0.01, b.d + 0.05), c); f.position.y = y; g.add(f); }
    const e = neonEdges(new THREE.BoxGeometry(b.w, b.h, b.d), c); e.position.y = b.h / 2; g.add(e);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.2, 8, 40), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    halo.rotation.x = Math.PI / 2; halo.position.y = b.h + 2.4; g.add(halo);
    anim.push((dt, t) => { halo.rotation.z += dt; halo.position.y = b.h + 2.4 + Math.sin(t * 2) * 0.3; }); top = b.h + 3;
  } else if (b.kind === "mail") {  // Zoho: post office with a giant glowing envelope and paper planes circling
    g.add(tower(b.w, b.h, b.d, c, 81, lit));
    const env = new THREE.Group(); env.position.y = b.h + 3.2;
    env.add(new THREE.Mesh(new THREE.BoxGeometry(6, 3.8, 0.4), new THREE.MeshStandardMaterial({ color: 0xfff7d6, emissive: c, emissiveIntensity: 0.35 })));
    const flap = new THREE.Mesh(new THREE.ConeGeometry(3.05, 1.9, 3), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    flap.rotation.set(0, 0, Math.PI); flap.scale.set(1, 1, 0.12); flap.position.set(0, 0.95, 0.25); env.add(flap);
    g.add(env); anim.push((dt, t) => env.rotation.y = Math.sin(t * 0.7) * 0.6);
    const planes = [...Array(4)].map((_, i) => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.rotation.x = Math.PI / 2; const piv = new THREE.Group(); piv.add(m); m.position.x = 5 + i; piv.rotation.y = i * 1.6; piv.position.y = b.h + 4 + i; g.add(piv); return piv; });
    anim.push(dt => planes.forEach((p, i) => p.rotation.y += dt * (0.8 + i * 0.2))); top = b.h + 6;
  } else if (b.kind === "pin") {  // Pinterest: white studio tower with a giant red map pin bobbing on the roof
    g.add(tower(b.w, b.h, b.d, c, 91, lit));
    const red = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 });
    const pin = new THREE.Group(); pin.position.y = b.h + 4.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 16), red); head.position.y = 1.2; pin.add(head);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 24), red); tip.rotation.x = Math.PI; tip.position.y = -1.3; pin.add(tip);
    const dotP = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); dotP.position.set(0.8, 1.7, 1.2); pin.add(dotP);
    g.add(pin); anim.push((dt, t) => { pin.rotation.y += dt * 0.8; pin.position.y = b.h + 4.2 + Math.sin(t * 2) * 0.5; }); top = b.h + 7;
  } else if (b.kind === "git") {  // GitHub: dark foundry with a glowing commit graph (branches + nodes) growing from the roof
    g.add(tower(b.w, b.h, b.d, 0x6e40c9, 95, lit));
    const gm = new THREE.MeshBasicMaterial({ color: 0x3dffa8, toneMapped: false }), node = new THREE.SphereGeometry(0.45, 12, 8);
    const graph = new THREE.Group(); graph.position.y = b.h;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 8), gm); stem.position.y = 4; graph.add(stem);
    [[0, 1.5], [0, 3.5], [0, 5.5], [0, 7.5]].forEach(([x, y]) => { const n = new THREE.Mesh(node, gm); n.position.set(x, y, 0); graph.add(n); });
    [[-1, 2.5, 5], [1, 4, 7]].forEach(([sx, y0, y1]) => {  // two side branches that merge back
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, y1 - y0 - 1), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0xff7b72 : 0x58a6ff, toneMapped: false }));
      br.position.set(sx * 2, (y0 + y1) / 2, 0); graph.add(br);
      for (const y of [y0 + 0.5, y1 - 0.5]) { const n = new THREE.Mesh(node, br.material); n.position.set(sx * 2, y, 0); graph.add(n); }
    });
    g.add(graph); anim.push(dt => graph.rotation.y += dt * 0.5); top = b.h + 8.5;
  } else if (b.kind === "factory") {  // factory (owner 2026-10-08): hall with a saw-tooth roof, glowing roll-up door, chimneys puffing neon smoke
    const f = faceDir(b), m = new THREE.Group(); m.rotation.y = Math.atan2(f.x, f.z); g.add(m);
    const h1 = b.h * 0.6; m.add(tower(b.w, h1, b.d, c, 61, lit * 0.6));
    const tooth = new THREE.MeshStandardMaterial({ color: 0x2a2244, emissive: c, emissiveIntensity: 0.3, metalness: 0.4, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const z = -b.d / 2 + b.d / 6 + i * b.d / 3;
      const pl = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.02, 0.2, b.d / 3 * 1.08), tooth); pl.rotation.x = 0.42; pl.position.set(0, h1 + 0.75, z); m.add(pl);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.96, 1.4), new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
      gl.position.set(0, h1 + 0.75, z + b.d / 6 - 0.1); m.add(gl);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.42, h1 * 0.62), new THREE.MeshStandardMaterial({ color: 0x1a1a2a, emissive: c, emissiveIntensity: 0.9 }));
    door.position.set(-b.w * 0.18, h1 * 0.31, b.d / 2 + 0.05); m.add(door);
    for (let k = 0; k < 4; k++) { const slat = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.42, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0x05020f })); slat.position.set(-b.w * 0.18, h1 * (0.1 + k * 0.14), b.d / 2 + 0.08); m.add(slat); }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.35, b.d + 0.3), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); stripe.position.y = h1 - 0.4; m.add(stripe);
    const puffs = [];
    [[b.w * 0.3, -b.d * 0.25, b.h * 1.45], [b.w * 0.12, -b.d * 0.3, b.h * 1.15]].forEach(([x, z, ch], ci) => {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, ch, 16), new THREE.MeshStandardMaterial({ color: 0x2b2550, roughness: 0.6 })); st.position.set(x, ch / 2, z); m.add(st);
      [0.35, 0.7].forEach(k => { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 16), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); band.position.set(x, ch * k, z); m.add(band); });
      for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).lerp(new THREE.Color(0xd8ccff), 0.6), transparent: true, depthWrite: false }));
        p.userData.smoke = true; m.add(p); puffs.push({ p, x, z, y0: ch + 0.6, k: i / 5 + ci * 0.1 }); }
    });
    anim.push((dt, t) => { const fd = g.userData.fade ?? 1; puffs.forEach(o => { o.k = (o.k + dt * 0.12) % 1; o.p.position.set(o.x + o.k * 2.5, o.y0 + o.k * 9, o.z - o.k * 1.5); o.p.scale.setScalar(0.6 + o.k * 1.8); o.p.material.opacity = 0.55 * (1 - o.k) * fd; }); });
    top = h1 + 2;
  } else if (b.kind === "bigboard") {  // giant double-sided screen on steel legs (Media, Factory Output, Bot Olympics)
    g.remove(plinth);
    const f = faceDir(b), m = new THREE.Group(); m.rotation.y = Math.atan2(f.x, f.z); g.add(m);
    const W = b.w, bh = W * 0.5625, yc = b.lift + bh / 2, tex = bigTex(b.slides ? b.slides[0] : b.draw);
    [0, Math.PI].forEach(r => { const p = new THREE.Mesh(new THREE.PlaneGeometry(W, bh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); p.rotation.y = r; p.position.set(0, yc, r ? -0.46 : 0.46); m.add(p); });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, bh + 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x120a2a, metalness: 0.6, roughness: 0.4 })); frame.position.y = yc; m.add(frame);
    const fe = neonEdges(new THREE.BoxGeometry(W + 1.25, bh + 1.25, 0.85), c); fe.position.y = yc; m.add(fe);
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2550, metalness: 0.7, roughness: 0.4 });
    [-W / 3, W / 3].forEach(x => { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, b.lift + 1, 1.2), steel); leg.position.set(x, (b.lift + 1) / 2, 0); m.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 3), steel); foot.position.set(x, 0.3, 0); m.add(foot); });
    for (let i = 0; i < 6; i++) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff2c8, toneMapped: false })); lamp.position.set(-W / 2 + W / 6 * (i + 0.5), b.lift + bh + 1, 0.9); m.add(lamp); }
    if (b.slides && b.slides.length > 1) { let cur = 0; anim.push((dt, t) => { const k = Math.floor(t / 9) % b.slides.length; if (k !== cur) { cur = k; tex.redraw(b.slides[k]); } }); }
    top = b.lift + bh + 1;
  } else if (b.kind === "home") {  // a bot's house in the Suburbs: pastel walls, roof glowing in its status colour, lit windows, a path to the green
    g.remove(plinth);
    const f = faceDir(b), m = new THREE.Group(); m.rotation.y = Math.atan2(f.x, f.z); g.add(m);
    const pastel = [0xf6c2c2, 0xbfe0ff, 0xfff1a8, 0xc9f2c7, 0xe3cdf7, 0xffd8a8][(b.id.length + b.short.charCodeAt(0)) % 6];
    const wall = new THREE.Mesh(new THREE.BoxGeometry(b.w, 3.6, b.d), new THREE.MeshStandardMaterial({ color: new THREE.Color(pastel).multiplyScalar(0.6), emissive: 0x150a30, roughness: 0.8 })); wall.position.y = 2.1; m.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(b.w * 0.8, 3, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0x2a1f4a, emissive: c, emissiveIntensity: 0.55, flatShading: true })); roof.scale.z = b.d / b.w; roof.position.y = 5.4; m.add(roof);
    const we = neonEdges(new THREE.BoxGeometry(b.w + 0.05, 3.6, b.d + 0.05), c); we.position.y = 2.1; m.add(we);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); door.position.set(0, 1.4, b.d / 2 + 0.03); m.add(door);
    [-1, 1].forEach(sx => { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false })); w.position.set(sx * b.w * 0.3, 2.5, b.d / 2 + 0.03); m.add(w); });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 7), new THREE.MeshStandardMaterial({ color: 0x5b5470 })); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.34, b.d / 2 + 3.5); m.add(path);
    const mail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.7), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4 })); mail.position.set(1.4, 1.1, b.d / 2 + 5.5); m.add(mail);
    top = 7;
  } else if (b.kind === "warehouse") {  // warehouse: long shed, saw-tooth roof, 3 lit roll-up doors, crates + pallets out front
    const f = faceDir(b), m = new THREE.Group(); m.rotation.y = Math.atan2(f.x, f.z); g.add(m);
    m.add(tower(b.w, b.h, b.d, c, 91, lit * 0.5));
    const tooth = new THREE.MeshStandardMaterial({ color: 0x2a2244, emissive: c, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.5 });
    for (let i = 0; i < 4; i++) {  // saw-tooth roof: sloped plates with a lit glazing strip on each step
      const x = -b.w / 2 + b.w / 8 + i * b.w / 4;
      const pl = new THREE.Mesh(new THREE.BoxGeometry(b.w / 4 * 0.98, 0.2, b.d * 1.04), tooth); pl.rotation.x = 0.28; pl.position.set(x, b.h + 1.4, 0); m.add(pl);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(b.w / 4 * 0.9, 2.8), new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      gl.position.set(x, b.h + 1.4, -b.d / 2 - 0.05); m.add(gl);
    }
    for (let i = -1; i <= 1; i++) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(b.w / 4.2, b.h * 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1a2a, emissive: c, emissiveIntensity: 0.25 }));
      door.position.set(i * b.w / 3.2, b.h * 0.3, b.d / 2 + 0.05); m.add(door);
      for (let y = 0.6; y < b.h * 0.6; y += 0.7) { const l = new THREE.Mesh(new THREE.PlaneGeometry(b.w / 4.2, 0.06), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); l.position.set(i * b.w / 3.2, y, b.d / 2 + 0.07); m.add(l); }
    }
    const crate = new THREE.MeshStandardMaterial({ color: 0xc8924a, emissive: 0x553311, emissiveIntensity: 0.3, roughness: 0.8 });
    [[-b.w / 2 + 1, 0], [-b.w / 2 + 2.4, 0], [-b.w / 2 + 1.7, 1.2], [b.w / 2 - 1.2, 0], [b.w / 2 - 1.2, 1.2]].forEach(([x, y]) => {
      const cr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crate); cr.position.set(x, 0.6 + y, b.d / 2 + 1.6); m.add(cr); });
    top = b.h + 2.2;
  } else if (b.kind === "army") {  // AI Influencer Army: tall studio tower, 5 hologram influencers on a turning roof stage (lit = live/being built)
    g.add(tower(b.w, b.h, b.d, c, 55, lit));
    const stage = new THREE.Group(); stage.position.y = b.h + 0.2;
    stage.add(new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.35, 40), new THREE.MeshBasicMaterial({ color: 0x2a0a40 })));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.12, 8, 64), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.2; stage.add(rim);
    const cols = [0xff9ad5, 0x00e5ff, 0xffd166, 0x9945ff, 0x3dffa8], crew = b.crew || [];
    const figs = cols.map((fc, i) => { const on = ["live", "building", "next"].includes(crew[i]), f = new THREE.Group(), a = i / 5 * Math.PI * 2;
      const mat = new THREE.MeshBasicMaterial({ color: fc, toneMapped: false, transparent: true, opacity: on ? 0.95 : 0.25 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.8, 12), mat); body.position.y = 1.1; f.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), mat); head.position.y = 2.4; f.add(head);
      f.position.set(Math.cos(a) * 2.7, 0.2, Math.sin(a) * 2.7); f.userData.on = on; stage.add(f); return f; });
    g.add(stage); anim.push((dt, t) => { stage.rotation.y += dt * 0.35; figs.forEach((f, i) => { f.position.y = 0.2 + (f.userData.on ? 0.25 * Math.sin(t * 2 + i) : 0); }); });
    top = b.h + 4;
  } else if (b.kind === "aiworks") {  // AI Works HQ: candy-striped 2000s startup tower, giant robot head on the roof (eyes glow, antenna blinks)
    g.add(tower(b.w, b.h, b.d, c, 41, lit));
    [0xffd23f, 0x28e0ff, 0x3dffa8].forEach((col, i) => { const band = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.7, b.d + 0.3), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
      band.position.y = b.h * (0.3 + i * 0.25); g.add(band); });
    const head = new THREE.Group(); head.position.y = b.h + 3.2;
    head.add(new THREE.Mesh(new THREE.BoxGeometry(7, 5, 5.5), new THREE.MeshStandardMaterial({ color: 0x28e0ff, metalness: 0.5, roughness: 0.3 })));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.4), new THREE.MeshBasicMaterial({ color: 0x10102a })); face.position.z = 2.76; head.add(face);
    const eyes = [-1.3, 1.3].map(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0x3dffa8, toneMapped: false })); e.position.set(x, 0.3, 2.9); head.add(e); return e; });
    const smile = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 24, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3dffa8, toneMapped: false })); smile.rotation.z = Math.PI; smile.position.set(0, -0.6, 2.9); head.add(smile);
    const ant = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false })); ant.position.y = 4; head.add(ant);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0xcccccc })); stick.position.y = 3.1; head.add(stick);
    g.add(head);
    anim.push((dt, t) => { head.rotation.y = Math.sin(t * 0.5) * 0.5; const blink = Math.sin(t * 3) > 0.97 ? 0.1 : 1; eyes.forEach(e => e.scale.y = blink); ant.visible = Math.sin(t * 4) > -0.3; });
    top = b.h + 8;
  } else if (b.kind === "rnd") {  // R&D: low lab with a glass roof and a spinning atom above it
    g.add(tower(b.w, b.h, b.d, c, 97, lit));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.8, 1.2, b.d * 0.8), new THREE.MeshStandardMaterial({ color: 0x0b3a2a, metalness: 0.9, roughness: 0.1, emissive: c, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 }));
    roof.position.y = b.h + 0.6; g.add(roof);
    const atom = new THREE.Group(); atom.position.y = b.h + 5;
    atom.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    const rings = [0, 1.05, 2.1].map(a => { const r = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.09, 8, 48), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      r.rotation.set(Math.PI / 2, a, 0); const e = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x00f0ff })); e.position.x = 2.6; r.add(e); atom.add(r); return r; });
    g.add(atom); anim.push(dt => { atom.rotation.y += dt * 0.6; rings.forEach((r, i) => r.rotation.z += dt * (1.5 + i * 0.4)); }); top = b.h + 8;
  } else if (b.kind === "store") {  // Side Hustle City, open: lit tower, glowing OPEN ring, a tiny spinning city on the roof
    g.add(tower(b.w, b.h, b.d, c, 7, lit));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(b.w, b.d) * 0.72, 0.18, 8, 64), new THREE.MeshBasicMaterial({ color: 0x3dffa8, toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = b.h * 0.55; g.add(ring);
    const roof = new THREE.Group(); roof.position.y = b.h + 0.3;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false })); roof.add(pad);
    const cols = [0xff3d9a, 0x00e5ff, 0xffd166, 0x9945ff, 0x3dffa8, 0xff8a3d];
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, r = i % 3 ? 2.3 : 1.1, h = 0.8 + ((i * 7) % 5) * 0.45;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], toneMapped: false }));
      m.position.set(Math.cos(a) * r, 0.15 + h / 2, Math.sin(a) * r); roof.add(m); }
    g.add(roof); anim.push((dt, t) => { roof.rotation.y += dt * 0.5; ring.position.y = b.h * (0.5 + 0.08 * Math.sin(t * 1.2)); });
    top = b.h + 3.5;
  } else if (b.kind === "construction") {  // Showroom: half-built floors in scaffolding, a turning crane, warning lights; grows with the pipeline
    const built = Math.max(0.2, b.built || 0), hb = b.h * built;
    g.add(tower(b.w, hb, b.d, c, 99, lit));
    const steel = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff8a00, emissiveIntensity: 0.4 });
    const frame = neonEdges(new THREE.BoxGeometry(b.w + 0.6, b.h, b.d + 0.6), 0xffb020); frame.position.y = b.h / 2; g.add(frame);
    for (let y = 3; y < b.h; y += 3) { const f = neonEdges(new THREE.BoxGeometry(b.w + 0.6, 0.01, b.d + 0.6), 0xffb020); f.position.y = y; g.add(f); }
    const back = faceDir(b).multiplyScalar(-(Math.max(b.w, b.d) / 2 + 2));  // crane stands behind the site, away from the camera
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.7, b.h + 10, 0.7), steel); mast.position.set(back.x, (b.h + 10) / 2, back.z); g.add(mast);
    const jib = new THREE.Group(); jib.position.set(back.x, b.h + 10, back.z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 0.5), steel); arm.position.x = -5; jib.add(arm);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6), new THREE.MeshBasicMaterial({ color: 0xdddddd })); cable.position.set(-11, -3, 0); jib.add(cable);
    const load = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6), new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x00f0ff, emissiveIntensity: 0.4 })); load.position.set(-11, -6.5, 0); jib.add(load);
    const warn = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2d55 })); warn.position.set(3, 0.6, 0); jib.add(warn);
    g.add(jib); anim.push((dt, t) => { jib.rotation.y = Math.sin(t * 0.25) * 1.2; warn.visible = Math.sin(t * 5) > 0; });
    top = b.h + 2;
  } else if (b.kind === "library") {  // Lincoln Memorial: stepped base, Doric colonnade all round, plain frieze + attic, seated figure inside
    const marble = new THREE.MeshStandardMaterial({ color: 0xece6da, emissive: 0xfff1dc, emissiveIntensity: 0.22, roughness: 0.6 });
    const W = b.w, D = b.d, base = 1.5, ch = b.h - 4.1;
    [[W + 3, D + 3], [W + 2, D + 2], [W + 1, D + 1]].forEach(([w, d], i) => { const st = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), marble); st.position.y = 0.25 + i * 0.5; g.add(st); });
    for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(W * 0.45, 0.25 * (i + 1), 0.6), marble); st.position.set(0, 0.125 * (i + 1), D / 2 + 2.1 + (5 - i) * 0.6); g.add(st); }  // grand front stairs
    const colGeo = new THREE.CylinderGeometry(0.34, 0.4, ch, 14), capGeo = new THREE.BoxGeometry(0.95, 0.25, 0.95), cols = [];
    const nx = 12, nz = 6;
    for (let i = 0; i < nx; i++) for (const sz of [-1, 1]) cols.push([-W / 2 + 0.6 + i * (W - 1.2) / (nx - 1), sz * (D / 2 - 0.6)]);
    for (let i = 1; i < nz - 1; i++) for (const sx of [-1, 1]) cols.push([sx * (W / 2 - 0.6), -D / 2 + 0.6 + i * (D - 1.2) / (nz - 1)]);
    cols.forEach(([x, z]) => { const col = new THREE.Mesh(colGeo, marble); col.position.set(x, base + ch / 2, z); g.add(col);
      const cap = new THREE.Mesh(capGeo, marble); cap.position.set(x, base + ch - 0.12, z); g.add(cap); });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, emissive: 0xffb36b, emissiveIntensity: 0.6 });
    for (const [w, d, x, z] of [[W - 3.4, 0.4, 0, -D / 2 + 1.9], [0.4, D - 3.8, -W / 2 + 1.9, 0], [0.4, D - 3.8, W / 2 - 1.9, 0], [3.2, 0.4, -W / 2 + 3.5, D / 2 - 1.9], [3.2, 0.4, W / 2 - 3.5, D / 2 - 1.9]]) {
      const wl = new THREE.Mesh(new THREE.BoxGeometry(w, ch, d), wallMat); wl.position.set(x, base + ch / 2, z); g.add(wl); }
    const lamp = new THREE.PointLight(0xffc58f, 30, 18, 2); lamp.position.set(0, base + ch - 1, 0); g.add(lamp);
    const statue = new THREE.Group(); statue.position.set(0, base, -D / 2 + 3);
    const sm = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, emissive: 0xffffff, emissiveIntensity: 0.3 });
    [[2.4, 1.6, 1.6, 0, 0.8, 0], [1.4, 1.9, 0.9, 0, 2.55, -0.2], [1.5, 0.35, 1.3, 0, 1.75, 0.55]].forEach(([w, h, d, x, y, z]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sm); p.position.set(x, y, z); statue.add(p); });
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), sm); hd.position.set(0, 3.85, -0.15); statue.add(hd); g.add(statue);
    const ent = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 1.3, D + 0.4), marble); ent.position.y = base + ch + 0.65; g.add(ent);
    const frieze = neonEdges(new THREE.BoxGeometry(W + 0.45, 0.01, D + 0.45), c); frieze.position.y = base + ch + 0.9; g.add(frieze);
    const attic = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 1.5, D - 2), marble); attic.position.y = base + ch + 1.3 + 0.75; g.add(attic);
    top = base + ch + 2.8;
  }
  // status beacon on the roof
  const bc = { ok: 0x3dffa8, down: 0xff2d55, stale: 0xffd166, unknown: 0x8a80b8 }[b.status];
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: bc }));
  beacon.position.y = top + 0.8; g.add(beacon);
  anim.push((dt, t) => beacon.scale.setScalar(b.status === "down" ? (Math.sin(t * 8) > 0 ? 1.4 : 0.6) : 1 + Math.sin(t * 3) * 0.15));
  // money beam: only for buildings that earned money today
  if (b.today > 0) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 240, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc56b, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = top + 120; g.add(beam);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.12, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    halo.rotation.x = Math.PI / 2; halo.position.y = top + 2; g.add(halo);
    anim.push((dt, t) => { beam.material.opacity = 0.4 + Math.sin(t * 3) * 0.15; halo.position.y = top + 2 + ((t * 3) % 6); halo.material.opacity = 1; });
  }
  // billboards: theme worlds keep one on every roof; the neon city has a few giant screens instead (owner 2026-10-08), so here
  // the "board" is just an invisible anchor that focus() frames
  const toward = faceDir(b); let board;
  if (WLD) {
    const tex = boardTex(b), bw = b.kind === "mega" ? 16 : 11, bh = bw * 600 / 1024;
    board = new THREE.Group();
    [0, Math.PI].forEach(r => { const p = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      p.rotation.y = r; p.position.z = r ? -0.06 : 0.06; board.add(p); });
    board.add(new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, bh + 0.4, 0.1), new THREE.MeshBasicMaterial({ color: 0x05020f })));
    const postH = b.kind === "mega" ? 10 : b.h < 14 ? 3.5 : 6;
    [-bw / 3, bw / 3].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, postH), new THREE.MeshBasicMaterial({ color: 0x2a1670 })); p.position.set(x, -bh / 2 - postH / 2, 0); board.add(p); });
    const off = b.kind === "market" || b.kind === "factory" ? b.d / 2 + 5.5 : Math.max(b.w, b.d) * (b.kind === "mega" ? 0.75 : 0.95) + 2;
    if (b.kind === "library" || WLD) { board.children.slice(-2).forEach(p => p.visible = false); board.position.set(0, top + bh / 2 + 0.6, 0); top += bh + 1; if (WLD) beacon.position.y = top + 0.8; }
    else board.position.set(toward.x * off, postH + bh / 2, toward.z * off);
    if ((b.kind === "market" || b.kind === "factory") && !WLD) { board.position.y += b.h * 0.55; board.children.slice(-2).forEach(p => { p.scale.y = (postH + b.h * 0.55) / postH; p.position.y = -bh / 2 - (postH + b.h * 0.55) / 2; }); }
    board.rotation.set(0, Math.atan2(toward.x, toward.z), 0);
  } else { board = new THREE.Group(); board.position.y = top * 0.6; }
  g.add(board); g.userData.board = board; g.userData.top = top;
  // floating tag
  const el = document.createElement("div"); el.className = "tag"; el.style.setProperty("--c", hex(c));
  el.innerHTML = `<b>${b.icon} ${esc(b.short)}</b><span class="${b.today > 0 ? "v" : "z"}">${esc(b.tag[0])}</span> · <span class="z">${esc(b.tag[1])}</span>`;
  el.onclick = () => focus(b.id);
  const lab = new CSS2DObject(el); lab.position.y = top + 3.5; g.add(lab); g.userData.tag = el;
  g.traverse(o => { if (o.isMesh) { o.userData.bid = b.id; picks.push(o); } });
  groups[b.id] = g; scene.add(g);
  // coins flow down the spoke to the vault when the building earned today
  if (b.today > 0) {
    const coins = [...Array(5)].map((_, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 16), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      m.rotation.z = Math.PI / 2; scene.add(m); return { m, k: i / 5 }; });
    const V = new THREE.Vector3(VAULT[0], 0.8, VAULT[1]), from = new THREE.Vector3(b.pos[0], g.position.y + 0.8, b.pos[1]), to = from.clone().sub(V).setLength(10).add(V);
    anim.push(dt => coins.forEach(c => { c.k = (c.k + dt * 0.15) % 1; c.m.position.lerpVectors(from, to, c.k); c.m.rotation.y += dt * 4; }));
  }
}

// ad traffic: a soft glowing arc from Media HQ to the Etsy Megastore with a few customers running along it
function flowBeam() {
  const A = groups.fb, Z = groups.etsy; if (!A || !Z) return;
  const f = M.flow || {}, on = f.ads > 0;
  const from = A.position.clone().setY(A.position.y + A.userData.top + 1), to = Z.position.clone().setY(Z.position.y + Z.userData.top + 1);
  const mid = from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 16);
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const geo = new THREE.TubeGeometry(curve, 96, 0.32, 10, false), uv = geo.attributes.uv, cols = [];
  const ca = new THREE.Color(0x3b82f6), cb = new THREE.Color(0xff8a3d), tc = new THREE.Color();
  for (let i = 0; i < uv.count; i++) { tc.copy(ca).lerp(cb, uv.getX(i)); cols.push(tc.r, tc.g, tc.b); }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 4;
  const cx = cv.getContext("2d"), gr = cx.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, "rgba(255,255,255,0.15)"); gr.addColorStop(0.75, "rgba(255,255,255,0.15)"); gr.addColorStop(0.92, "#fff"); gr.addColorStop(1, "rgba(255,255,255,0.15)");
  cx.fillStyle = gr; cx.fillRect(0, 0, 256, 4);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(6, 1);
  const mk = (r, o, map) => new THREE.Mesh(r === 1 ? geo : new THREE.TubeGeometry(curve, 96, 0.32 * r, 10, false).setAttribute("color", geo.attributes.color),
    new THREE.MeshBasicMaterial({ vertexColors: true, map, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const core = mk(1, on ? 0.9 : 0.55, tex), glow = mk(3.2, on ? 0.12 : 0.07);
  scene.add(core, glow);
  const ends = [from, to].map((p, i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color: i ? 0xff8a3d : 0x3b82f6, transparent: true, toneMapped: false }));
    r.rotation.x = Math.PI / 2; r.position.copy(p); scene.add(r); return r; });
  // customers: more traffic = more runners, but never a crowd
  const n = Math.max(2, Math.min(6, 2 + Math.round(Math.log10(1 + (f.clicks || 0) * 10 + (f.views || 0)))));
  const shirts = [0xffd166, 0x7dd3fc, 0xff6b9a, 0x34d399, 0xc084fc, 0xffffff];
  const runners = [...Array(n)].map((_, i) => {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: shirts[i], toneMapped: false });
    const bd = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 3, 8), m); bd.position.y = 0.55; bd.rotation.x = 0.35; g.add(bd);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2c4 })); hd.position.set(0, 1.25, 0.25); g.add(hd);
    const legs = [-0.13, 0.13].map(x => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), m); l.position.set(x, 0.05, 0); g.add(l); return l; });
    g.scale.setScalar(1.3); scene.add(g); return { g, legs, k: i / n, v: 0.06 + (i % 3) * 0.012 };
  });
  const p = new THREE.Vector3(), tg = new THREE.Vector3();
  anim.push((dt, t) => {
    tex.offset.x -= dt * (on ? 0.6 : 0.3);
    core.material.opacity = (on ? 0.8 : 0.5) + Math.sin(t * 2) * 0.1;
    ends.forEach((r, i) => { const k = (t * 0.8 + i * 0.5) % 1; r.scale.setScalar(0.6 + k); r.material.opacity = 1 - k; });
    runners.forEach((r, i) => {
      r.k = (r.k + dt * r.v) % 1;
      curve.getPointAt(r.k, p); curve.getTangentAt(r.k, tg);
      r.g.position.copy(p).y += 0.35 + Math.abs(Math.sin(t * 12 + i)) * 0.15;
      r.g.lookAt(p.x + tg.x, r.g.position.y + tg.y, p.z + tg.z);
      r.legs.forEach((l, j) => l.rotation.x = Math.sin(t * 12 + i + j * Math.PI) * 0.7);
    });
  });
}

// money arcs: a thin flowing beam from every money maker to the Vault (bright + sparks when it earned today)
const MONEY = ["etsy", "gumroad", "kdp", "rose", "contra", "zoho", "lab"];  // sales only: no trading bots into the Vault (owner 2026-10-09)
function moneyBeams() {
  const V = groups.vault; if (!V) return;
  const to = V.position.clone().setY(9.5);
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 4;
  const cx = cv.getContext("2d"), gr = cx.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, "rgba(255,255,255,0.1)"); gr.addColorStop(0.8, "rgba(255,255,255,0.1)"); gr.addColorStop(0.95, "#fff"); gr.addColorStop(1, "rgba(255,255,255,0.1)");
  cx.fillStyle = gr; cx.fillRect(0, 0, 128, 4);
  M.B.filter(b => MONEY.includes(b.id) && groups[b.id] && (b.id !== "polylive" || b.total > 0)).forEach((b, bi) => {
    const A = groups[b.id], hot = b.today > 0, from = A.position.clone().setY(A.position.y + A.userData.top + 0.5);
    const mid = from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 6 + from.distanceTo(to) * 0.12);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(Math.max(2, Math.round(curve.getLength() / 14)), 1);
    const col = new THREE.Color(b.color).lerp(new THREE.Color(0xffd166), 0.55);
    const tube = (r, o, map) => new THREE.Mesh(new THREE.TubeGeometry(curve, 64, r, 6, false),
      new THREE.MeshBasicMaterial({ color: col, map, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const core = tube(hot ? 0.3 : 0.18, hot ? 0.95 : 0.55, tex), glow = tube(hot ? 0.9 : 0.5, hot ? 0.14 : 0.07);
    scene.add(core, glow);
    const sparks = hot ? [...Array(3)].map((_, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false }));
      scene.add(m); return { m, k: i / 3 }; }) : [];
    const sp = new THREE.Vector3();
    anim.push((dt, t) => {
      tex.offset.x -= dt * (hot ? 0.5 : 0.22);
      core.material.opacity = (hot ? 0.85 : 0.45) + Math.sin(t * 1.6 + bi) * 0.08;
      sparks.forEach(s => { s.k = (s.k + dt * 0.12) % 1; curve.getPointAt(s.k, sp); s.m.position.copy(sp); s.m.scale.setScalar(0.8 + Math.sin(t * 6 + s.k * 9) * 0.25); });
    });
  });
}

// "Claude is working here": a narrow beam straight up into the sky with rising rings
function workBeams() {
  (M.working || []).forEach((id, wi) => {
    const g = groups[id]; if (!g) return;
    const top = g.userData.top, mat = o => new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 300, 12, 1, true), mat(0.6)); core.position.y = top + 150;
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 300, 16, 1, true), mat(0.05)); glow.position.y = top + 150;
    g.add(core, glow);
    const rings = [...Array(4)].map((_, i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.07, 6, 36), mat(0.9)); r.rotation.x = Math.PI / 2; g.add(r); return { r, k: i / 4 }; });
    const el = document.createElement("div"); el.className = "tag work"; el.innerHTML = "<b>🛠️ Claude working</b>";
    const lab = new CSS2DObject(el); lab.position.y = top + 16; g.add(lab);
    anim.push((dt, t) => {
      core.material.opacity = 0.45 + Math.sin(t * 4 + wi) * 0.15;
      rings.forEach(o => { o.k = (o.k + dt * 0.25) % 1; o.r.position.y = top + 1 + o.k * 40; o.r.scale.setScalar(1 + o.k * 1.5); o.r.material.opacity = 0.9 * (1 - o.k); });
    });
  });
}

function vault() {
  const g = new THREE.Group(); g.userData.b = { id: "vault" };
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 5, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x5a2e1a, emissive: 0xff9a5a, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
  drum.position.y = 3; g.add(drum);
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28, col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), new THREE.MeshStandardMaterial({ color: 0xffe2c4, emissive: 0xffc58f, emissiveIntensity: 0.6 }));
    col.position.set(Math.cos(a) * 6.1, 3, Math.sin(a) * 6.1); g.add(col); }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.2, 32, 16, 0, 6.28, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3e0 }));
  dome.position.y = 5.5; g.add(dome);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 0.6, 48), new THREE.MeshStandardMaterial({ color: 0x1d0f4a, emissive: 0x6d28d9, emissiveIntensity: 0.4 }));
  base.position.y = 0.3; g.add(base);
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28, t = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0x5eead4 }));
    t.position.set(Math.cos(a) * 8, 1.4, Math.sin(a) * 8); g.add(t); }
  const el = document.createElement("div"); el.className = "tag vaultTag"; el.style.setProperty("--c", "#ffd166");
  el.onclick = () => focus("vault");
  const lab = new CSS2DObject(el); lab.position.y = 14; g.add(lab); g.userData.el = el;
  g.traverse(o => { if (o.isMesh) { o.userData.bid = "vault"; picks.push(o); } });
  g.position.set(VAULT[0], 0, VAULT[1]); groups.vault = g; scene.add(g);
}

// ---------- living city: avenues, parks, trees, people, dogs, lamps, birds ----------
const EYE = 1.8;
let mode = "orbit", yaw = 0, pitch = 0, vert = 0, wheelV = 0;
const keys = {}, joy = { x: 0, y: 0 }, solids = [];

function life() {
  solids.push({ x: VAULT[0], z: VAULT[1], r: 9.8, h: 13 });
  const d = new THREE.Object3D(), col = new THREE.Color();
  const walk = new THREE.MeshStandardMaterial({ color: 0x5b5470, roughness: 0.85 }), stone = new THREE.MeshStandardMaterial({ color: 0x3d3550, roughness: 0.7 });
  const paths = [], seg = (x0, z0, x1, z1, w = 5, color) => {
    const len = Math.hypot(x1 - x0, z1 - z0), u = new THREE.Vector2((x1 - x0) / len, (z1 - z0) / len);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), walk); m.rotation.set(-Math.PI / 2, 0, Math.atan2(-u.x, -u.y));
    m.position.set((x0 + x1) / 2, 0.33, (z0 + z1) / 2); scene.add(m);
    if (color) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.18, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 })); l.rotation.copy(m.rotation); l.position.copy(m.position); l.position.y = 0.34; scene.add(l); }
    paths.push({ a: new THREE.Vector2(x0, z0), u, len, w });
  };
  const [DN, , TR, IN] = DIST;
  // Downtown: walks from the Vault plaza out to the ring road, either side of the pool up to the Library
  seg(0, PLAZA[3], 0, DN.h * 0.88, 5, 0xffd166); seg(-9, -20, -9, PLAZA[2], 3.4); seg(9, -20, 9, PLAZA[2], 3.4);
  seg(PLAZA[0], 6, -DN.h * 0.86, 6, 4, 0xffd166); seg(PLAZA[1], 6, DN.h * 0.86, 6, 4, 0xffd166);
  // Trading Town promenade and the Industrial Park's yard street
  seg(TR.c[0] - TR.h * 0.8, TR.c[1] + 16, TR.c[0] + TR.h * 0.8, TR.c[1] + 16, 5, TR.color);
  seg(IN.c[0] - IN.h * 0.8, IN.c[1] + 3, IN.c[0] + IN.h * 0.8, IN.c[1] + 3, 4, IN.color);
  // the four corners + the map edges (owner 2026-10-10): no more identical parks; each side has its own landscape (visual only)
  outskirts();
  const PARKS = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * 122, z: sz * 118 }));  // corner features: keep street trees out
  // Vault plaza paving, reflecting pool, Library forecourt, paved squares in Trading Town + the factory yard
  const paveAt = (w, h, x, z) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), stone); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.325, z); scene.add(p); };
  paveAt(PLAZA[1] - PLAZA[0], PLAZA[3] - PLAZA[2], 0, (PLAZA[2] + PLAZA[3]) / 2);
  const pk = neonEdges(new THREE.BoxGeometry(PLAZA[1] - PLAZA[0], 0.01, PLAZA[3] - PLAZA[2]), 0xffd166); pk.position.set(0, 0.34, (PLAZA[2] + PLAZA[3]) / 2); scene.add(pk);
  paveAt(30, 6, 0, -17.5);
  const [px0, px1, pz0, pz1] = POOL;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(px1 - px0 + 1.2, 0.5, pz1 - pz0 + 1.2), new THREE.MeshStandardMaterial({ color: 0xd9d2c4, emissive: 0x332a1a, emissiveIntensity: 0.3 })); rim.position.set((px0 + px1) / 2, 0.4, (pz0 + pz1) / 2); scene.add(rim);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(px1 - px0, pz1 - pz0), new THREE.MeshStandardMaterial({ color: 0x0a2a55, emissive: 0x1e5aa8, emissiveIntensity: 0.35, metalness: 0.9, roughness: 0.05 }));
  water.rotation.x = -Math.PI / 2; water.position.set((px0 + px1) / 2, 0.66, (pz0 + pz1) / 2); scene.add(water);
  anim.push((dt, t) => water.material.emissiveIntensity = 0.3 + Math.sin(t * 0.8) * 0.06);
  M.B.forEach(b => { const size = Math.max(b.w, b.d) * 0.8; solids.push({ x: b.pos[0], z: b.pos[1], r: size + 0.6, h: b.h + 12 }); });
  const nearPath = (x, z, pad) => paths.some(p => { const dx = x - p.a.x, dz = z - p.a.y, t = dx * p.u.x + dz * p.u.y; return t > -pad && t < p.len + pad && Math.abs(-dx * p.u.y + dz * p.u.x) < p.w / 2 + pad; });
  const nearSolid = (x, z, pad) => solids.some(s => Math.hypot(x - s.x, z - s.z) < s.r + pad);
  const inRect = (x, z, [x0, x1, z0, z1], pad) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad;
  const paved = (x, z, pad) => [TR, IN].some(D => Math.hypot(x - D.c[0], z - D.c[1]) < blobR(D, Math.atan2(z - D.c[1], x - D.c[0])) + pad);
  const hillR = (x, z) => Math.hypot(x - HILL.c[0], z - HILL.c[1]);
  const open = (x, z, pad) => Math.abs(x) < EXT - 3 && Math.abs(z) < EXT - 3 && !nearSolid(x, z, pad) && !nearPath(x, z, pad) && roadDist(x, z) > RW + 1 + pad
    && !paved(x, z, pad) && !inRect(x, z, PLAZA, pad) && !inRect(x, z, POOL, pad + 3) && !inRect(x, z, [-16, 16, -34, -14], pad)
    && hillR(x, z) > HILL.h + 3 && PARKS.every(P => Math.hypot(x - P.x, z - P.z) > 46 + pad);

  // trees: rows along the avenues, loose groves in the parks and on the hillside
  const spots = [];
  ROADS.filter(R => !R.loop).forEach(R => along(R, 9, (x0, z0, nx, nz) => { for (const side of [-1, 1]) { const x = x0 + nx * side * 9, z = z0 + nz * side * 9; if (open(x, z, 0.5)) spots.push([x, z, 0.95]); } }, 12));
  for (let i = 0, n = MOBILE ? 170 : 320; spots.length < n && i < 12000; i++) {
    const x = (Math.random() * 2 - 1) * (EXT - 4), z = (Math.random() * 2 - 1) * (EXT - 4);
    if (open(x, z, 3)) spots.push([x, z, 0.8 + Math.random() * 0.7]);
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x4a2c5a }), spots.length);
  const leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.35, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x08240f, roughness: 0.7, flatShading: true }), spots.length);
  const palette = [0x22c55e, 0x16a34a, 0x4ade80, 0xf9a8d4, 0x15803d, 0x86efac, 0x22c55e];
  spots.forEach(([x, z, sc], i) => {
    const y = hillY(x, z) + 0.3;
    d.position.set(x, 0.6 * sc + y, z); d.scale.setScalar(sc * 1.25); d.rotation.set(0, 0, 0); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix);
    d.position.y = 2.9 * sc + y; d.updateMatrix(); leaf.setMatrixAt(i, d.matrix);
    leaf.setColorAt(i, col.set(palette[i % palette.length]).multiplyScalar(0.55 + Math.random() * 0.3));
  });
  scene.add(trunk, leaf);
  if (DEMO) window.__clearPath = (x0, z0, x1, z1, r) => {
    const a = new THREE.Vector3(x0, 0, z0), b = new THREE.Vector3(x1, 0, z1), line = new THREE.Line3(a, b), q = new THREE.Vector3(), c = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    spots.forEach(([x, z], i) => { line.closestPointToPoint(q.set(x, 0, z), true, c); if (c.distanceTo(q) < r) { trunk.setMatrixAt(i, zero); leaf.setMatrixAt(i, zero); } });
    trunk.instanceMatrix.needsUpdate = leaf.instanceMatrix.needsUpdate = true;
  };

  // lamps and benches along every path
  const lamps = [], benches = [];
  paths.forEach(p => { for (let t = 4; t < p.len - 2; t += 10) for (const side of [-1, 1]) {
    const off = side * (p.w / 2 + 0.6), x = p.a.x + p.u.x * t - p.u.y * off, z = p.a.y + p.u.y * t + p.u.x * off;
    if (!nearSolid(x, z, 0.5) && roadDist(x, z) > RW + 0.5) { lamps.push([x, z]); if (p.w >= 4 && (t / 10 | 0) % 2) benches.push([x + p.u.x * 3, z + p.u.y * 3, Math.atan2(p.u.x, p.u.y)]); }
  } });
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x3b2a7a }), lamps.length);
  const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), lamps.length);
  lamps.forEach(([x, z], i) => { d.scale.setScalar(1); d.position.set(x, 2.0, z); d.updateMatrix(); post.setMatrixAt(i, d.matrix); d.position.y = 3.8; d.updateMatrix(); bulb.setMatrixAt(i, d.matrix); });
  scene.add(post, bulb);
  const bench = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.45, 0.6), new THREE.MeshStandardMaterial({ color: 0x7c4a2a }), benches.length);
  benches.forEach(([x, z, r], i) => { d.position.set(x, 0.55, z); d.rotation.set(0, r, 0); d.updateMatrix(); bench.setMatrixAt(i, d.matrix); });
  d.rotation.set(0, 0, 0); scene.add(bench);

  // flower beds in the open lawns
  const fl = [];
  for (let i = 0; fl.length < (MOBILE ? 600 : 1300) && i < 30000; i++) {
    const cx = (Math.random() * 2 - 1) * (EXT - 4), cz = (Math.random() * 2 - 1) * (EXT - 4);
    if (!open(cx, cz, 2.5)) continue;
    const c = pick([0xff4fa3, 0xffd34d, 0xffffff, 0xb57bff, 0xff7a45, 0x7dd3fc]), y = hillY(cx, cz);
    for (let k = 0; k < 14; k++) fl.push([cx + rnd(-1.6, 1.6), cz + rnd(-1.6, 1.6), c, y]);
  }
  const flower = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x331133, emissiveIntensity: 0.6 }), fl.length);
  fl.forEach(([x, z, c, y], i) => { d.position.set(x, 0.42 + y, z); d.scale.setScalar(rnd(0.8, 1.4)); d.updateMatrix(); flower.setMatrixAt(i, d.matrix); flower.setColorAt(i, col.set(c)); });
  d.scale.setScalar(1); scene.add(flower);

  // people strolling along the paths; some walk dogs
  const NP = MOBILE ? 55 : 90, people = [];
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.26, 0.75, 3, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x150a30 }), NP);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.21, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }), NP);
  const shirts = [0xff6b9a, 0x60a5fa, 0xfacc15, 0x34d399, 0xf97316, 0xc084fc, 0xffffff, 0x22d3ee], skins = [0xf1c27d, 0x8d5524, 0xc68642, 0xffdbac, 0x6b4226];
  const busy = paths.filter(p => p.len > 15);
  for (let i = 0; i < NP; i++) {
    const a = busy[i % busy.length];
    people.push({ a, s: Math.random() * a.len, lo: 0.5, hi: a.len - 0.5, side: (Math.random() < 0.5 ? -1 : 1) * (a.w / 2 - 0.7) * (0.5 + Math.random() * 0.5), v: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 0.8), ph: Math.random() * 6 });
    body.setColorAt(i, col.set(shirts[i % shirts.length])); head.setColorAt(i, col.set(skins[i % skins.length]));
  }
  scene.add(body, head);
  const at = (p, s, side) => [p.a.a.x + p.a.u.x * s - p.a.u.y * side, p.a.a.y + p.a.u.y * s + p.a.u.x * side];
  const dogs = [], dogCols = [0x8b5a2b, 0xf5f5f5, 0x222222, 0xd2a36c, 0x5c3a1e];
  for (let i = 0; i < (MOBILE ? 10 : 16); i++) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: dogCols[i % dogCols.length] });
    const bd = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.7), m); bd.position.y = 0.42; g.add(bd);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.28), m); hd.position.set(0, 0.62, 0.42); g.add(hd);
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.08), m); ear.position.set(0, 0.76, 0.36); g.add(ear);
    for (const [x, z] of [[-0.1, 0.25], [0.1, 0.25], [-0.1, -0.25], [0.1, -0.25]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), m); l.position.set(x, 0.15, z); g.add(l); }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), m); tail.position.set(0, 0.55, -0.45); tail.rotation.x = -0.6; g.add(tail);
    scene.add(g); dogs.push({ g, tail, p: people[i * 3 % NP] });
  }
  anim.push((dt, t) => {
    people.forEach((p, i) => {
      p.s += p.v * dt; if (p.s > p.hi || p.s < p.lo) { p.v *= -1; p.s = Math.max(p.lo, Math.min(p.hi, p.s)); }
      const [x, z] = at(p, p.s, p.side), u = p.a.u, bob = Math.abs(Math.sin(t * 7 + p.ph)) * 0.06;
      p.x = x; p.z = z; p.h = Math.atan2(u.x * Math.sign(p.v), u.y * Math.sign(p.v));
      d.scale.setScalar(1); d.rotation.set(0, p.h, 0);
      d.position.set(x, 0.95 + bob, z); d.updateMatrix(); body.setMatrixAt(i, d.matrix);
      d.position.y = 1.73 + bob; d.updateMatrix(); head.setMatrixAt(i, d.matrix);
    });
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
    dogs.forEach((o, i) => {
      const p = o.p, [x, z] = at(p, p.s + Math.sign(p.v) * 0.9, p.side - Math.sign(p.side || 1) * 0.7);
      o.g.position.set(x, 0.3 + Math.abs(Math.sin(t * 11 + i)) * 0.05, z);
      o.g.rotation.y = p.h; o.tail.rotation.y = Math.sin(t * 14 + i) * 0.7;
    });
  });

  // birds circling above the towers
  const NB = 22, wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.25, -1, 0.4, 0, 0, 0, -0.2, 0, 0, 0.25, 1, 0.4, 0, 0, 0, -0.2], 3));
  const birds = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: 0xe9e2ff, side: THREE.DoubleSide }), NB);
  const flock = [...Array(NB)].map((_, i) => ({ r: 40 + Math.random() * 160, a: Math.random() * 6.28, y: 38 + Math.random() * 30, v: (0.08 + Math.random() * 0.08) * (i % 3 ? 1 : -1), ph: Math.random() * 6 }));
  scene.add(birds);
  anim.push((dt, t) => { flock.forEach((f, i) => { f.a += f.v * dt;
    d.position.set(Math.cos(f.a) * f.r, f.y + Math.sin(t + f.ph) * 2, Math.sin(f.a) * f.r); d.rotation.set(0, -f.a + (f.v > 0 ? 0 : Math.PI), 0);
    d.scale.set(0.9, 0.2 + Math.abs(Math.sin(t * 9 + f.ph)) * 1.3, 0.9); d.updateMatrix(); birds.setMatrixAt(i, d.matrix); });
    birds.instanceMatrix.needsUpdate = true; });
}

// ---------- free movement: bird (fly) and street (walk) ----------
const MODE_HINT = {
  orbit: "Drag to look around · pinch or scroll to zoom · two fingers / right-drag to move · tap a building",
  fly: "🦅 Bird: drag to look · joystick or WASD to fly · ▲▼ or Space/Shift for height · tap a building",
  walk: "🚶 Street: drag to look · joystick or WASD to walk · Shift to run · tap a building to walk to it",
};
function applyLook() { camera.rotation.set(pitch, yaw, 0, "YXZ"); }
function syncLook() { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ"); yaw = e.y; pitch = e.x; }

function setMode(m, silent) {
  if (m === mode) return;
  const prev = mode; mode = m; flight = null;
  if (m === "orbit") {
    controls.enabled = true;
    const dv = new THREE.Vector3(); camera.getWorldDirection(dv);
    const t = camera.position.clone().add(dv.multiplyScalar(prev === "walk" ? 20 : 35)); t.y = Math.max(0, t.y);
    controls.target.copy(t);
  } else {
    controls.enabled = false; syncLook();
    const p = camera.position;
    if (m === "walk") {
      const r = Math.hypot(p.x, p.z);
      if (r > EXT) { p.x *= EXT / r; p.z *= EXT / r; }
      p.y = EYE; pitch = 0.08;
    } else if (prev === "walk") p.y = 22;
    applyLook();
  }
  document.querySelectorAll("#modes button").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
  $("#joy").hidden = m === "orbit"; $("#updown").hidden = m !== "fly";
  if (!silent) { const h = $("#hint"); h.textContent = MODE_HINT[m]; h.style.opacity = 1; clearTimeout(h._t); h._t = setTimeout(() => h.style.opacity = 0, 6000); }
}

function freeMove(dt) {
  const k = c => keys[c] ? 1 : 0;
  const fwd = k("KeyW") + k("ArrowUp") - k("KeyS") - k("ArrowDown") - joy.y + wheelV;
  const str = k("KeyD") + k("ArrowRight") - k("KeyA") - k("ArrowLeft") + joy.x;
  wheelV *= 0.85; if (Math.abs(wheelV) < 0.01) wheelV = 0;
  const p = camera.position, cp = Math.cos(pitch);
  let speed = mode === "fly" ? 30 : 9;
  if (mode === "walk" && (keys.ShiftLeft || keys.ShiftRight)) speed *= 2.2;
  const f = mode === "fly" ? new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp) : new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  p.addScaledVector(f, fwd * speed * dt).addScaledVector(r, str * speed * dt);
  if (mode === "fly") p.y += (k("Space") + k("KeyE") - k("ShiftLeft") - k("KeyQ") + vert) * speed * 0.7 * dt;
  for (const s of solids) {  // buildings are solid
    if (p.y > s.h) continue;
    const dx = p.x - s.x, dz = p.z - s.z, dd = Math.hypot(dx, dz);
    if (dd < s.r && dd > 0.001) { p.x = s.x + dx / dd * s.r; p.z = s.z + dz / dd * s.r; }
  }
  const R = Math.hypot(p.x, p.z); if (R > 230) { p.x *= 230 / R; p.z *= 230 / R; }
  p.y = mode === "walk" ? EYE : Math.min(230, Math.max(1.2, p.y));
  applyLook();
}

function freeInput() {
  const cv = renderer.domElement; let look = null;
  addEventListener("keydown", e => { if (e.target.closest && e.target.closest("textarea,input")) return; keys[e.code] = true;
    if (mode !== "orbit" && ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault(); });
  addEventListener("keyup", e => keys[e.code] = false);
  addEventListener("blur", () => Object.keys(keys).forEach(k => keys[k] = false));
  cv.addEventListener("pointerdown", e => { if (mode !== "orbit" && e.isPrimary) { look = { x: e.clientX, y: e.clientY, id: e.pointerId }; flight = null; } });
  addEventListener("pointermove", e => {
    if (!look || e.pointerId !== look.id || mode === "orbit") return;
    const s = e.pointerType === "touch" ? 0.006 : 0.004;
    yaw -= (e.clientX - look.x) * s; pitch -= (e.clientY - look.y) * s;
    pitch = Math.max(mode === "walk" ? -1.1 : -1.5, Math.min(mode === "walk" ? 1.2 : 1.5, pitch));
    look.x = e.clientX; look.y = e.clientY; applyLook(); $("#hint").style.opacity = 0;
  });
  addEventListener("pointerup", e => { if (look && e.pointerId === look.id) look = null; });
  cv.addEventListener("wheel", e => { if (mode === "orbit") return; e.preventDefault(); wheelV = Math.max(-4, Math.min(4, wheelV - e.deltaY * 0.01)); }, { passive: false });
  // virtual joystick
  const pad = $("#joy"), knob = $("#knob"); let jid = null;
  const jmove = e => { const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 18;
    let x = e.clientX - cx, y = e.clientY - cy; const l = Math.hypot(x, y); if (l > max) { x *= max / l; y *= max / l; }
    knob.style.transform = `translate(${x}px,${y}px)`; joy.x = x / max; joy.y = y / max; };
  pad.addEventListener("pointerdown", e => { jid = e.pointerId; pad.setPointerCapture(jid); jmove(e); e.stopPropagation(); flight = null; });
  pad.addEventListener("pointermove", e => { if (e.pointerId === jid) jmove(e); });
  const jend = e => { if (e.pointerId !== jid) return; jid = null; joy.x = joy.y = 0; knob.style.transform = ""; };
  pad.addEventListener("pointerup", jend); pad.addEventListener("pointercancel", jend);
  for (const [id, v] of [["#up", 1], ["#dn", -1]]) { const b = $(id);
    b.addEventListener("pointerdown", e => { vert = v; b.setPointerCapture(e.pointerId); });
    const off = () => vert = 0; b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); }
  document.querySelectorAll("#modes button").forEach(b => b.onclick = () => setMode(b.dataset.mode));
}

// ---------- Staff: our bots as named employees (collect.py staff() <- hq-data/staff.json) ----------
// Each one stands at their building (tiny worker + name tag when you tap the building), shows up in the 👥 STAFF chart and
// in the building panel, and has an Assign button that drops a task for them into the Library for Claude to carry out.
const STC = { working: "#3dffa8", "on duty": "#3dffa8", "on call": "#7df9ff", late: "#ffd166", off: "#ff4d6d", unknown: "#7d74a8" };
const staffOf = id => ((M.s.staff || {}).staff || []).filter(x => x.bld === id);
const agoS = s => s == null ? "" : s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 129600 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago";
const staffRow = x => `<div class="emp"><span class="av" style="border-color:${STC[x.status] || "#7d74a8"}">${x.emoji}</span>
  <span class="ej"><b>${esc(x.name)}</b> <i style="color:${STC[x.status] || "#7d74a8"}">● ${esc(x.status)}${x.last_s != null ? " · " + agoS(x.last_s) : ""}</i><br>${esc(x.now ? x.now + " · " : "")}${esc(x.job)}</span>
  <button class="assign" data-emp="${esc(x.id)}">Assign</button></div>`;
const staffHTML = id => DEMO || GUEST || !staffOf(id).length ? "" : `<div class="staffbox"><div class="lt">👥 Staff here · tap Assign to give them a job</div>${staffOf(id).map(staffRow).join("")}</div>`;
function assign(eid) {
  if (GUEST) return;
  const x = ((M.s.staff || {}).staff || []).find(y => y.id === eid); if (!x) return;
  openTerm().then(() => { const t = $("#tin"); t.value = `Task for ${x.name} (${x.job}): `; t.dispatchEvent(new Event("input")); t.focus(); });
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-emp]"); if (b) { e.stopPropagation(); assign(b.dataset.emp); } }, true);
function staffPanel() {
  const all = (M.s.staff || {}).staff || [], el = $("#staff");
  if (DEMO || !all.length) { $("#staffbtn").hidden = true; return; }
  const on = all.filter(x => ["working", "on duty"].includes(x.status)).length;
  $("#staffbtn").textContent = `👥 STAFF · ${on}/${all.length} ON`;
  const bn = id => id === "vault" ? "The Vault" : (M.B.find(b => b.id === id) || {}).name || id;
  const prof = x => !x.profile ? "" : `<details class="prof"><summary>Job profile</summary><p>${esc(x.profile.mission || "")}</p>
    <b>MUST</b><ul>${(x.profile.must || []).map(m => `<li>${esc(m)}</li>`).join("")}</ul>
    <b>NEVER</b><ul>${(x.profile.never || []).map(m => `<li>${esc(m)}</li>`).join("")}</ul>${(x.profile.warnings || []).length ? `<b style="color:#ff5a5a">⚠️ WARNINGS (${x.profile.warnings.length})</b><ul>${x.profile.warnings.map(w => `<li>${esc(w.date)}: ${esc(w.text)}</li>`).join("")}</ul>` : ""}<i>Runs: ${esc(x.profile.cron || "")}</i></details>`;
  const rep = x => !x.report ? "" : `<div class="rep">📨 ${esc(x.report.ts.slice(11, 16))} · ${esc(x.report.title)}${(x.report.lines || []).length ? `<br>${x.report.lines.slice(0, 4).map(l => esc(l.slice(0, 140))).join("<br>")}` : ""}</div>`;
  const card = x => `<div class="mgr"><div class="emp"><span class="av big" style="border-color:${STC[x.status] || "#7d74a8"}">${x.emoji}</span>
    <span class="ej"><b>${esc(x.name)}</b> <i style="color:${STC[x.status] || "#7d74a8"}">● ${esc(x.status)}</i><br><span class="ttl">${esc(x.title || x.job)}</span> · <span class="dn" data-id="${esc(x.bld)}">${esc(bn(x.bld))}</span></span>
    <button class="assign" data-emp="${esc(x.id)}">Assign</button></div>${rep(x)}${prof(x)}
    <div class="team"></div></div>`;  // owner 7 Oct: managers only, no employee rows under them
  const ceo = all.find(x => x.role === "ceo"), mgrs = all.filter(x => x.role === "manager");
  el.innerHTML = `<h4>👥 THE COMPANY · ${all.length} STAFF</h4><p class="sub2">You own it. Every manager reports to you and to CLAUDE (CEO). Tap Assign to give anyone a job.</p>` +
    (ceo ? `<div class="ceo">${card(ceo).replace('<div class="team">', '<div class="team" hidden>')}</div>` : "") + mgrs.map(card).join("");
  el.querySelectorAll(".dn[data-id]").forEach(d => d.onclick = () => { el.hidden = true; focus(d.dataset.id); });
}
// little workers in front of their building; their name tags only show while that building is focused
const staffTags = [];
function staffFigures() {
  if (DEMO) return;
  const by = {};
  ((M.s.staff || {}).staff || []).forEach(x => (by[x.bld] = by[x.bld] || []).push(x));
  Object.entries(by).forEach(([bid, xs]) => {
    const b = bid === "vault" ? { pos: VAULT, w: 12, d: 12 } : M.B.find(y => y.id === bid), g = groups[bid]; if (!b || !g) return;
    const f = bid === "vault" ? new THREE.Vector3(0, 0, 1) : faceDir(b), side = new THREE.Vector3(-f.z, 0, f.x), d0 = Math.max(b.w, b.d) / 2 + 2.6;
    xs.forEach((x, i) => {
      const k = i - (xs.length - 1) / 2, col = new THREE.Color(STC[x.status] || "#7d74a8");
      const w = new THREE.Group(); if (x.role) w.scale.setScalar(1.35);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1b1036, emissive: col, emissiveIntensity: 0.9 }));
      body.position.y = 0.7; w.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffe0c2, emissive: 0x332211 })); head.position.y = 1.45; w.add(head);
      w.position.copy(f.clone().multiplyScalar(d0).add(side.clone().multiplyScalar(k * 1.3))); w.position.y = 0;
      g.add(w);
      const el = document.createElement("div"); el.className = "tag stag"; el.style.setProperty("--c", STC[x.status] || "#7d74a8");
      el.innerHTML = `<b>${x.emoji} ${esc(x.name)}${x.title ? " · " + esc(x.title.split(" ")[0]) : ""}</b>`; el.onclick = () => assign(x.id);
      const lab = new CSS2DObject(el); lab.position.set(w.position.x, 2.4 + (i % 2) * 0.9, w.position.z); lab.visible = false; g.add(lab);
      staffTags.push({ bid, lab });
      const ph = i * 1.7; anim.push((dt, t) => { w.position.y = Math.abs(Math.sin(t * 2.2 + ph)) * (x.status === "working" ? 0.25 : 0.06); });
    });
  });
}
const showStaffTags = id => staffTags.forEach(o => o.lab.visible = o.bid === id);

// ---------- UI ----------
// Neon sticky note: the to-do list Claude keeps in hq-data/todo.json. Ticks are remembered on this device until Claude marks them done.
function todoNote(t) {
  const el = $("#todo");
  if (DEMO || !t || !t.items) return (el.hidden = true);
  let ticks = {}; try { ticks = JSON.parse(get("todo-ticks") || "{}"); } catch (e) {}
  // ticked items leave the note at once (owner 2026-10-08); the server removes them for good every 5 min
  const open = t.items.filter(x => !x.done && !ticks[x.id]), done = t.items.length - open.length;
  const min = get("todo-min") === "1", who = { you: "YOU", claude: "CLAUDE", both: "US" };
  el.hidden = false; el.classList.toggle("min", min);
  el.innerHTML = `<h4><span>📝 ${esc(t.title || "TO DO")} · ${open.length} left${done ? ` · ✓ ${done} done` : ""}</span><button id="todomin">${min ? "show" : "hide"}</button></h4>` +
    (open.length ? open.map(x => `<label><input type="checkbox" data-t="${esc(x.id)}"><span>${esc(x.text)}<span class="who">${who[x.who] || ""}</span></span></label>`).join("") : `<label><span>All done 🎉</span></label>`);
  $("#todomin").onclick = () => { try { localStorage.setItem("todo-min", min ? "0" : "1"); } catch (e) {} todoNote(t); };
  el.querySelectorAll("input[data-t]").forEach(i => i.onchange = () => {
    ticks[i.dataset.t] = true; try { localStorage.setItem("todo-ticks", JSON.stringify(ticks)); } catch (e) {} todoSync({ [i.dataset.t]: true }, t); todoNote(t); });
  if (!todoNote.sent) { todoNote.sent = 1; todoSync(ticks, t); }
}
// ticks are MERGED on the server (every device's ticks count); the reply carries everyone's ticks, so the note matches on all devices
function todoSync(ticks, t) {
  if (DEMO || GUEST || !PW) return;
  fetch("https://chat.sonneblomdigitaal.co.za/api/hq-todo", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pw: PW, ticks }) }).then(r => r.json()).then(j => {
      if (!j.ticks) return;
      const ids = new Set((t?.items || []).map(x => x.id)), mine = Object.fromEntries(Object.keys(j.ticks).filter(k => ids.has(k)).map(k => [k, true]));
      try { localStorage.setItem("todo-ticks", JSON.stringify(mine)); } catch (e) {}
      if (t) todoNote(t);
    }).catch(() => {});
}
$("#askbar").onclick = () => DEMO ? focus("library") : openTerm();

// Credits bubble under the city name (owner 2026-10-08): Higgsfield credits, fal.ai, Claude plan left (collect.py credits()); tap = details
function creditsBubble(c) {
  const el = $("#credits");
  if (DEMO || GUEST || !c) return (el.hidden = true);
  const h = c.higgsfield || {}, f = c.fal || {}, cl = c.claude || {};
  const fal = f.error ? "?" : f.usd != null ? "$" + Number(f.usd).toFixed(2) : f.ok ? "✓" : "empty";
  const pc = v => v == null ? "?" : `<span class="${v < 20 ? "lo" : ""}">${v}%</span>`;
  const t = s => s ? new Date(s).toLocaleString("en-ZA", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "?";
  el.hidden = false;
  el.innerHTML = el.classList.contains("open")
    ? `⚡ <b>Higgsfield</b> ${num(h.left)} credits${h.plan ? " · " + esc(h.plan) : ""}${h.renews ? " · renews " + esc(h.renews) : ""} (checked ${esc(h.checked || "?")})<br>` +
      `🎨 <b>fal.ai</b> ${f.error ? "couldn't check" : f.usd != null ? "$" + Number(f.usd).toFixed(2) + " (" + esc(f.usd_at || "") + ")" : f.ok ? '<span class="ok">has credit</span>' : '<span class="lo">out of credit</span>'}<br>` +
      `🧠 <b>Claude</b> ${cl.error ? "couldn't check" : `${pc(cl.left_5h)} of 5-hour limit left (resets ${t(cl.reset_5h)}) · ${pc(cl.left_week)} of the week left`}`
    : `⚡ <b>${num(h.left)}</b> · 🎨 <b>${fal === "empty" ? '<span class="lo">0</span>' : fal}</b> · 🧠 <b>${cl.error ? "?" : pc(cl.left_5h)}</b>`;
  el.title = "Higgsfield credits · fal.ai · Claude plan left (5-hour)";
  el.onclick = () => { el.classList.toggle("open"); creditsBubble(c); };
}

// Influencer overview (owner 2026-10-08): Rose, Granny Mae, Ollie, Mr Nobody side by side (collect.py influencers(), refreshed with Rose's stats)
const INF_C = { rose: "#ff4f8b", granny: "#ffd166", ollie: "#38bdf8", nobody: "#3dffa8" };
function infHTML(d) {
  const A = (d.accounts || []), ok = A.filter(a => !a.error);
  const sg = v => v == null ? "" : v > 0 ? `<span class="up">+${num(v)}</span>` : v < 0 ? `<span class="dn">${num(v)}</span>` : "±0";
  const race = (label, key) => { const max = Math.max(1, ...ok.map(a => a[key] || 0));
    return `<div class="race"><div class="lt">${label}</div>${[...ok].sort((x, y) => (y[key] || 0) - (x[key] || 0)).map(a =>
      `<div class="r"><span>${a.emoji} ${esc(a.name)}</span><div class="bar"><i style="width:${100 * (a[key] || 0) / max}%;background:${INF_C[a.id] || "#a78bfa"}"></i></div><b>${num(a[key] || 0)}</b></div>`).join("")}</div>`; };
  const thumb = x => `<a href="${esc(x.url || "#")}" target="_blank" rel="noopener">${x.img ? `<img loading="lazy" src="${esc(x.img)}" alt="">` : `<img alt="">`}<span>▶ ${num(x.views)}</span></a>`;
  const card = a => `<div class="card" style="--c:${INF_C[a.id] || "#a78bfa"}">
    <h3><span>${a.emoji} ${esc(a.name)}</span>${a.username ? `<a href="https://www.instagram.com/${esc(a.username)}/" target="_blank" rel="noopener">@${esc(a.username)} ↗</a>` : ""}</h3>
    ${a.error ? `<div class="none">Not connected: ${esc(a.error)}</div>` : `
    ${a.stale ? `<span class="st" title="${esc(a.stale)}">⚠ last good numbers, token needs renewing</span>` : ""}
    <div class="fol">${num(a.followers)}<small>followers · ${sg(a.gained_24h)} 24h · ${sg(a.gained_7d)} 7d</small></div>
    <div class="kvs"><div><b>${num(a.views)}</b><span>views</span></div><div><b>${num(a.views_24h)}</b><span>views 24h</span></div><div><b>${num(a.reach)}</b><span>reach</span></div>
      <div><b>${num(a.likes)}</b><span>likes</span></div><div><b>${num(a.comments)}</b><span>comments</span></div><div><b>${num(a.shares)}</b><span>shares</span></div>
      <div><b>${num(a.saved)}</b><span>saves</span></div><div><b>${num(a.posts)}</b><span>posts · ${num(a.posts_7d)} this wk</span></div>
      <div><b>${a.eng == null || (a.reach || 0) < 50 ? "–" : a.eng + "%"}</b><span>engagement</span></div></div>
    ${a.top ? `<div class="lt">Best post</div><a class="top" href="${esc(a.top.url || "#")}" target="_blank" rel="noopener">${a.top.img ? `<img loading="lazy" src="${esc(a.top.img)}" alt="">` : ""}<span>${esc(a.top.text || "(no caption)")}<br><b>▶ ${num(a.top.views)}</b> · ❤ ${num(a.top.likes)} · 💬 ${num(a.top.comments)}</span></a>` : ""}
    ${(a.recent || []).length ? `<div class="lt">Latest posts</div><div class="thumbs">${a.recent.map(thumb).join("")}</div>` : ""}`}</div>`;
  return `<div class="wrap"><div class="itop"><h2>📊 AI Influencers</h2><button id="infclose">✕ Close</button></div>
    <div class="sub">Instagram · updates with Rose's stats every 30 min${M.s.ts ? " · " + ago(M.s.ts) : ""} · engagement = likes+comments+shares+saves ÷ reach</div>
    <div class="tot"><div><b>${num(d.followers)}</b><span>followers</span></div><div><b>${sg(d.gained_24h) || "±0"}</b><span>followers 24h</span></div>
      <div><b>${num(d.views)}</b><span>views</span></div><div><b>${num(d.views_24h)}</b><span>views 24h</span></div><div><b>${num(d.likes)}</b><span>likes</span></div><div><b>${num(d.comments)}</b><span>comments</span></div></div>
    ${race("VIEWS · ALL TIME", "views")}${race("FOLLOWERS", "followers")}
    <div class="cards">${A.map(card).join("")}</div></div>`;
}
function openInf() {
  const el = $("#inf"), d = M.s.influencers;
  if (!d || d.error) return;
  el.innerHTML = infHTML(d); el.hidden = false;
  $("#infclose").onclick = () => (el.hidden = true);
}
window.openInf = openInf;

// LIVE strip under the building buttons: Rose users, Side Hustle City visits, Etsy + Gumroad visits today (collect.py pulse().stats)
function liveStrip(p) {
  const el = $("#livestats"), st = (p || {}).stats;
  if (DEMO || !st) return (el.hidden = true);
  const v = x => x === null || x === undefined ? "—" : num(x);
  el.hidden = false;
  const inf = M.s.influencers;
  const sv = M.s.site;
  el.innerHTML = `<span class="lv">● LIVE</span>` + (sv && sv.today ? `<button id="sitebtn" title="Website visitors (not us), all pages">🌐 Website <b>${num(sv.today.visitors)}</b>${sv.d7.visitors ? ` <em>${num(sv.d7.visitors)}/7d</em>` : ""}</button>` : "") + (inf && inf.accounts ? `<button id="infbtn">📊 Influencers <b>${num(inf.followers)}</b>${inf.gained_24h ? ` <em>${inf.gained_24h > 0 ? "+" : ""}${inf.gained_24h}</em>` : ""}</button>` : "") +
    `<button data-id="army">🌹 Rose users <b>${v(st.rose_users)}</b>${st.rose_new ? ` <em>+${st.rose_new}</em>` : ""}</button>` +
    `<button data-id="showroom">🏙️ SHC visits <b>${v(st.shc_visits)}</b></button>` +
    `<button data-id="etsy" title="from ${esc(st.etsy_src || "")}">🛍️ Etsy visits <b>${v(st.etsy_visits)}</b></button>` +
    `<button data-id="gumroad" title="${st.gumroad_visits === null ? "read from Gumroad via Chrome on Go Bananas (last " + esc(st.gumroad_at || "never") + ")" : ""}">🎨 Gumroad visits <b>${v(st.gumroad_visits)}</b></button>`;
}

function hud() {
  const { B, tot, day, roseZar, sales, s } = M;
  groups.vault.userData.el.innerHTML = `<b>THE VAULT · TODAY</b><span style="font:800 18px Sora;color:${day ? "#3dffa8" : "#fff"}">${usd(day)}</span><br><span class="z">${usd(tot)} all time${roseZar ? ` + R${num(roseZar)}` : ""} · ${sales} sales</span>`;
  const dc = { ok: "#3dffa8", down: "#ff4d6d", stale: "#ffd166", unknown: "#7d74a8" };
  // top buttons = building names only; a green blip = something there needs the owner (collect.py pulse().attention, plus anything down)
  const att = (s.pulse || {}).attention || {};
  const why = b => [...(att[b.id] || []), ...(b.status === "down" ? ["Something here is down"] : [])];
  const chip = (id, label, color, w) => `<button class="chip${w.length ? " need" : ""}" data-id="${id}" title="${esc(w.join(" · "))}" style="border-color:${color}88;color:${color}">${w.length ? `<i class="blip"></i>` : ""}${esc(label)}</button>`;
  const names = { vault: "Vault", etsy: "Etsy", fb: "Meta", ig: "Instagram", copy: "Copy Desk", polylive: "Poly LIVE", poly: "Poly Practice", longshot: "Olympics", newfaces: "Media Board", output: "Output", whdig: "Digital WH", whpod: "Print WH", rose: "Rose", contra: "Contra", zoho: "Outreach", gumroad: "Gumroad", kdp: "KDP", lab: "API Lab",
    krypto: "Krypto", kalshi: "Kalshi", pinterest: "Pinterest", github: "GitHub", rnd: "R&D", showroom: "SHC", army: "AI Army", library: "Library", aiworks: "AI Works", botrace: "Live Arena", whop: "Whop", youtube: "YouTube" };
  const list = [chip("vault", "Vault", "#ffd166", att.vault || [])].concat(B.filter(b => !b.home).map(b => chip(b.id, names[b.id] || b.short, hex(b.color), why(b))));
  const dn = { down: "Downtown", media: "Media Hill", trade: "Trading Town", ind: "Industrial", subs: "Suburbs" };
  $("#chips").innerHTML = (WLD ? [] : DIST.map(D => `<button class="chip dchip" data-dist="${D.id}" style="border-color:${hex(D.color)}88;color:${hex(D.color)}">📍 ${dn[D.id]}</button>`)).join("");  // owner 2026-10-09: towns only, no building shortcuts
  document.querySelectorAll("[data-dist]").forEach(x => x.onclick = () => goDistrict(x.dataset.dist));
  M.need = id => id === "vault" ? att.vault || [] : why(B.find(x => x.id === id) || {});
  liveStrip(s.pulse);
  creditsBubble(s.credits); if ($("#infbtn")) $("#infbtn").onclick = openInf;
  if ($("#sitebtn")) $("#sitebtn").onclick = openSite;
  staffPanel();
  todoNote(s.todo);
  document.querySelectorAll("[data-id]").forEach(x => x.onclick = () => focus(x.dataset.id));
  $("#updated").textContent = `data ${ago(s.ts)} · refreshes every 30 min`;
  // payroll = only the places that actually take payments (owner 2026-10-10); tools/funnels (GitHub, warehouses, R&D, AI Army, YouTube, racers...) are left out so sales are not counted twice
  const PAY = ["etsy", "gumroad", "kdp", "whop", "showroom", "contra", "zoho", "lab"];
  const rows = B.filter(b => PAY.includes(b.id)).map(b => {
    const earned = b.id === "rose" ? (b.zar ? "R" + num(b.zar) : "R0") : usd(b.today);
    const total = b.id === "rose" ? "R" + num(b.zar || 0) : usd(b.total);
    return `<tr><td>${b.icon} ${esc(b.short)}</td><td><span class="dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dc[b.status]}"></span></td><td>${earned}</td><td>${total}</td></tr>`; });
  $("#payroll").innerHTML = `<h4>PAYROLL · TODAY</h4><table><tr><th>Worker</th><th>On</th><th>Today</th><th>All time</th></tr>${rows.join("")}</table>
    <p>Gold beams + coins rolling to the Vault = money made today. The blue-to-orange arc from the Meta Skyscraper to Etsy = ad traffic; the little runners are visitors (more traffic, more runners). Thin arcs into the Vault = money makers (bright with sparks when they earned today). A cyan beam into the sky = Claude is working on that hustle right now. Roof lights: green running, yellow stale data, red down, grey unknown (Library closed).</p>`;
}

function vaultSheet() {
  const { B, tot, day, roseZar, sales } = M, s = M.s;
  const all = [...(s.etsy?.sales || []).map(x => ({ ...x, channel: "Etsy" })), ...(s.gumroad?.sales || [])].sort((a, b) => b.ts.localeCompare(a.ts));
  return sheetHTML("The Vault", "All money in, across every shop", tot, "revenue all time (USD)",
    [["Today", usd(day)], ["Sales", sales], ...(DEMO ? [] : [["Rose (card)", "R" + num(roseZar)]]), ...B.filter(b => b.total && MONEY.includes(b.id) && b.id !== "rose").map(b => [b.short, usd(b.total)])],
    all.slice(0, 8).map(x => [`${x.channel} · ${x.product || x.title || ""}`, `${usd(x.amount)} · ${ago(x.ts)}`]), "Latest sales") + ideasHTML(s.ideas);
}
// Future business ideas parked in the Vault (hq-data/ideas.json)
function ideasHTML(d) {
  const it = (d && d.items || []).filter(x => x.status !== "dropped");
  if (DEMO || GUEST || !it.length) return "";
  const tag = { later: "💤 later", testing: "🧪 testing", live: "✅ live" };
  return `<div class="list"><div style="color:var(--dim);font-size:12px"><span>💡 Future business ideas (${it.length})</span></div>` +
    it.map(x => `<div><span><b>${esc(x.title)}</b><br><small style="color:var(--dim)">${esc(x.text || "")}</small></span><span>${tag[x.status] || esc(x.status || "")}</span></div>`).join("") + `</div>`;
}

function focus(id) {
  $("#hint").style.opacity = 0; $("#payroll").hidden = true; $("#staff").hidden = true; showStaffTags(id);
  const g = groups[id]; if (!g) return;
  const b = M.B.find(x => x.id === id);
  const portrait = innerWidth < innerHeight;
  if (id === "vault") {
    fly(new THREE.Vector3(VAULT[0], 6, VAULT[1]), mode === "walk" ? new THREE.Vector3(VAULT[0], EYE, VAULT[1] + 24) : new THREE.Vector3(VAULT[0], 16, VAULT[1] + (portrait ? 34 : 26)));
  } else if (mode !== "walk") {  // three-quarter front view framing the whole building + billboard in the part of the screen the panel leaves free
    const board = g.userData.board, bp = new THREE.Vector3(); board.getWorldPosition(bp);
    const side = innerWidth >= 900, Hpx = innerHeight, Wpx = innerWidth;
    // free screen band (px) between the header/chips and the panel; the building is centred and sized to fit inside it
    let top = side ? 136 : 128, bottom = side ? Hpx - 110 : Hpx * 0.48, right = side ? Wpx - 430 : Wpx;
    if (DEMO && window.__demoBand) [top, bottom, right] = window.__demoBand(Wpx, Hpx);  // video director leaves room for captions
    const visV = (bottom - top) / Hpx, visH = right / Wpx, cyF = (top + bottom) / 2 / Hpx, cxF = right / 2 / Wpx;
    const H = Math.max(g.userData.top || b.h, bp.y + 3.5) + 1.5, wide = Math.max(b.w, b.d) * 2 + 8;
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * camera.aspect;
    const dist = Math.min(340, Math.max(H / (2 * tv * visV), wide / (2 * th * visH)) * 1.08 + Math.max(b.w, b.d) / 2);
    const dir = faceDir(b).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);   // ~30° off the front so the billboard doesn't hide the doors
    const c = new THREE.Vector3(b.pos[0], g.position.y + H / 2, b.pos[1]);
    const pos = c.clone().add(dir.clone().multiplyScalar(dist)); pos.y = c.y + dist * 0.36;  // a little above, to see over the neighbours
    const look = c.clone(); look.y -= (0.5 - cyF) * 2 * dist * tv;
    look.add(new THREE.Vector3().crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar((0.5 - cxF) * 2 * dist * th));
    fly(look, pos);
  } else {
    const bp = new THREE.Vector3(), board = g.userData.board; board.getWorldPosition(bp);
    const dir = new THREE.Vector3(); board.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const want = (b.kind === "mega" ? 21 : 15) * (portrait ? 1.6 : 1);
    const room = Math.hypot(bp.x, bp.z) - 11, dist = mode === "walk" ? Math.min(want, room) : want;
    const pos = bp.clone().add(dir.multiplyScalar(dist));
    pos.y = mode === "walk" ? EYE : dist > room ? Math.max(bp.y + 4, 15) : bp.y + 2.5;  // hop over the Vault dome when backing up
    const look = bp.clone(); if (portrait && id !== "library") look.y -= 3.2;  // board sits above the stats sheet
    if (!portrait && innerWidth >= 900 && id !== "library") look.add(new THREE.Vector3(dir.z, 0, -dir.x).setLength(b.kind === "mega" ? 6 : 4.5));  // room for the side panel
    fly(look, pos);
  }
  if (id === "library" && !DEMO) return openTerm();
  closeTerm();
  const sheet = $("#sheet"); sheet.style.setProperty("--c", id === "vault" ? "#ffd166" : hex(b.color));
  const nd = !DEMO && M.need ? M.need(id) : [];
  $("#sheetbody").innerHTML = (nd.length ? `<div class="needs"><b><i class="blip"></i>NEEDS YOU</b>${nd.map(x => `<div>${esc(x)}</div>`).join("")}</div>` : "") +
    bchatHTML(id) + (id === "vault" ? vaultSheet() : b.sheet()) + staffHTML(id) + actionsHTML(id) + linksHTML(id);
  sheet.hidden = false; sheet.scrollTop = 0; bchatInit(id);
}

function fly(target, pos) {
  flight = { t0: performance.now(), t: 0, ft: controls.target.clone(), fp: camera.position.clone(), tt: target, tp: pos };
}
function home(instant) {
  showStaffTags(null);
  const t = new THREE.Vector3(0, 4, -8), p = MOBILE && innerWidth < innerHeight ? new THREE.Vector3(0, 330, 330) : new THREE.Vector3(0, 205, 235);  // high over the Suburbs, the whole city in view
  if (mode !== "orbit") setMode("orbit", true);
  if (instant) { controls.target.copy(t); camera.position.copy(p); } else fly(t, p);
}

function addrEventListeners() {
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight);
  });
  const ray = new THREE.Raycaster(), v = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener("pointerdown", e => down = [e.clientX, e.clientY, Date.now()]);
  renderer.domElement.addEventListener("pointerup", e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8 || Date.now() - down[2] > 450) return;
    v.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(v, camera);
    const hit = ray.intersectObjects(picks, false)[0]; if (hit) focus(hit.object.userData.bid);
  });
  controls.addEventListener("start", () => { flight = null; $("#hint").style.opacity = 0; });
  freeInput();
  $("#home").onclick = () => { $("#sheet").hidden = true; closeTerm(); home(); };
  $("#sheetx").onclick = () => $("#sheet").hidden = true;
  $("#payrollbtn").onclick = () => { $("#staff").hidden = true; $("#payroll").hidden = !$("#payroll").hidden; };
  $("#staffbtn").onclick = () => { $("#payroll").hidden = true; $("#staff").hidden = !$("#staff").hidden; };
  $("#lockbtn").onclick = () => { set(KEY, null); location.reload(); };
  $("#bananas").onclick = async () => {  // Go Bananas: the server re-collects every source (update.sh), then we reload the data
    const btn = $("#bananas"); if (btn.disabled) return; btn.disabled = true; btn.textContent = "🍌 Going…";
    try {
      const r = await (await fetch("https://chat.sonneblomdigitaal.co.za/api/hq-refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pw: PW }) })).json();
      if (r.error) btn.textContent = "🍌 " + r.error;
      else if (!r.started) btn.textContent = `🍌 Done recently, try in ${Math.ceil((r.wait || 60) / 60)} min`;
      else { btn.textContent = "🍌 Collecting… (about 2 min)"; await new Promise(z => setTimeout(z, 120000)); await reload(); btn.textContent = "🍌 Fresh!"; }
    } catch (e) { btn.textContent = "🍌 Couldn't reach the server"; }
    setTimeout(() => { btn.textContent = "🍌 Go Bananas"; btn.disabled = false; }, 8000);
  };
}

window.__city = () => ({ camera, controls, flight, groups });
if (DEMO) window.__demo = { applySkin: id => applySkin(id), focus, setMode, home, fly, keys, look: (y, p) => { yaw = y; pitch = p; applyLook(); }, get mode() { return mode; } };  // DEMO-only hook for scripted walkthrough videos
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (flight) {
    flight.t = Math.min(1, (performance.now() - flight.t0) / 1300); const k = flight.t < .5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
    controls.target.lerpVectors(flight.ft, flight.tt, k); camera.position.lerpVectors(flight.fp, flight.tp, k);
    if (mode !== "orbit") { camera.lookAt(controls.target); syncLook(); }
    if (flight.t >= 1) flight = null;
  } else if (mode !== "orbit") freeMove(dt);
  anim.forEach(f => f(dt, t));
  if (mode === "orbit") controls.update();
  composer.render(); labels.render(scene, camera);
}

function tick() { $("#clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

// ---------- portal (Library) ----------
const LKEY = "library-pass";  // the Library has its own strong password (it can run anything on the server)
async function api(path, opt = {}) {
  return fetch(API + path, { ...opt, headers: { Authorization: "Bearer " + (get(LKEY) || ""), "Content-Type": "application/json", ...(opt.headers || {}) } });
}
async function services() {
  if (DEMO) { svc = D?.services || null; return null; }
  try { const r = await api("/status"); if (r.ok) { const j = await r.json(); svc = j.services; return j; } } catch (e) {}
  svc = null; return null;
}

let tBusy = false, tRun = 0, tSeen = 0, aiEl = null;
const tlog = () => $("#tlog");
function tAdd(cls, text) { const d = document.createElement("div"); d.className = cls; d.textContent = text; tlog().append(d); tScroll(); return d; }
function tScroll() { const l = tlog(); if (l.scrollHeight - l.scrollTop - l.clientHeight < 160) l.scrollTop = l.scrollHeight; }
function setBusy(b) { tBusy = b; $("#tstop").hidden = !b; $("#tin").placeholder = b ? "Add a message: Claude pauses, reads it, then carries on…" : "Talk to Claude…"; if (!b) document.querySelectorAll("#tlog .cursor").forEach(c => c.remove()); }

async function openTerm() {
  if (GUEST) return void window.open(GUEST_QA, "_blank");  // guests get the ask-only Q&A page, never the real Library
  $("#sheet").hidden = true; $("#term").hidden = false;
  if (tlog().childElementCount) return;
  if (!get(LKEY)) return libraryLogin();
  const st = await services();
  if (!st) {
    tAdd("sys", "The Library is closed: the portal on the server isn't switched on yet (it needs the owner's approval in the terminal).");
    tAdd("sys", "Until then you can reach Claude in the Claude app (Code tab) or with /remote-control.");
    $("#tsend").disabled = true; return;
  }
  try {
    const h = await (await api("/history")).json();
    h.rows.forEach(r => r.role === "owner" ? tAdd("me", r.text) : r.role === "claude" ? tAdd("ai", r.text) : tAdd("sys", r.text));
    if (!h.rows.length) tAdd("sys", "Welcome to the Library. Same Claude as the terminal: ask anything, or say \"Go Bananas\".");
    if (h.busy) { tRun = h.run; attach(api("/stream?from=0")); }
  } catch (e) { tAdd("sys", "Couldn't load history."); }
  tlog().scrollTop = 1e9;
}
function closeTerm() { $("#term").hidden = true; }
// first visit on a device: ask for the Library password, check it against the portal, remember it on this device
function libraryLogin(msg) {
  tlog().innerHTML = ""; $("#tsend").disabled = true;
  tAdd("sys", msg || "The Library has its own password (separate from the City one). Enter it once; this device remembers it.");
  const f = document.createElement("form"); f.className = "llogin";
  f.innerHTML = `<input type="password" placeholder="Library password" autocomplete="current-password" required><button>Open the Library</button>`;
  f.onsubmit = async e => {
    e.preventDefault(); const v = f.querySelector("input").value.trim(); set(LKEY, v);
    let r = null; try { r = await api("/status"); } catch (err) {}
    if (r && r.ok) { tlog().innerHTML = ""; $("#tsend").disabled = false; return openTerm(); }
    set(LKEY, null);
    libraryLogin(r && r.status === 429 ? "Too many wrong tries. Wait 15 minutes." : r ? "Wrong password, try again." : "The Library is closed: the server didn't answer.");
  };
  tlog().append(f); f.querySelector("input").focus();
}

let tGen = 0;  // newest attach wins: an older stream that ends (e.g. a run paused for a new message) must not flip the UI to idle
async function attach(req) {
  const my = ++tGen; setBusy(true); aiEl = tAdd("ai", ""); const cur = document.createElement("span"); cur.className = "cursor"; aiEl.after(cur);
  let txt = "", buf = "";
  try {
    const r = await req;
    if (r.status === 409) { tAdd("sys", "Claude is still busy with the previous message."); return setBusy(false); }
    if (!r.ok) { tAdd("sys", "Portal error " + r.status); return setBusy(false); }
    const rd = r.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
        const e = JSON.parse(line); if (e.n) tSeen = e.n; if (e.run) tRun = e.run;
        if (e.t === "text") { txt += e.d; aiEl.textContent = txt; tScroll(); }
        else if (e.t === "tool") { const d = document.createElement("div"); d.className = "tool"; d.textContent = e.d; aiEl.before(d); tScroll(); }
        else if (e.t === "done") { if (e.paused) tAdd("sys", "⏸ Paused here to read your new message."); if (e.stopped) tAdd("sys", "Stopped."); else if (!e.paused) tAdd("sys", "✓ done"); }
      }
    }
    if (my === tGen) setBusy(false);
  } catch (e) {
    if (my !== tGen) return;  // phone slept or network blipped: re-attach to the same run
    const st = await services();
    if (st && st.busy && st.run === tRun) { aiEl.remove(); document.querySelectorAll("#tlog .cursor").forEach(c => c.remove()); return attach(api(`/stream?from=0`)); }
    setBusy(false); if (!txt) tAdd("sys", "Connection lost. Reopen the Library to see the reply.");
  }
}

// ---------- Building chat (owner 2026-10-08): talk to Claude from inside a building's panel ----------
// Same Library session as the big chat (one Claude, one memory). Messages go out as "[In <building>] ..." so Claude knows where
// you are, and each building only shows its own conversation (filtered from the Library history).
const bTag = id => `[In ${id === "vault" ? "The Vault" : (M.B.find(b => b.id === id) || {}).name || id}]`;
const bchatHTML = id => DEMO || GUEST ? "" : `<div class="bchat" data-b="${esc(id)}"><div class="lt">💬 Talk about this building</div><div class="blog"></div>
  <form class="bform"><textarea rows="1" placeholder="Message Claude about ${esc(bTag(id).slice(4, -1))}…"></textarea><button>Send</button></form></div>`;
function bAdd(log, cls, text) { const d = document.createElement("div"); d.className = "bm " + cls; d.textContent = text; log.append(d); log.scrollTop = 1e9; return d; }
async function bchatInit(id) {
  const box = document.querySelector(`.bchat[data-b="${CSS.escape(id)}"]`); if (!box) return;
  const log = box.querySelector(".blog"), form = box.querySelector("form"), ta = form.querySelector("textarea"), tag = bTag(id);
  if (!get(LKEY)) { log.innerHTML = `<button class="blogin">🔑 Unlock the Library to chat here</button>`; log.querySelector("button").onclick = () => libraryLogin(); form.hidden = true; return; }
  try {
    const h = await (await api("/history")).json(); let mine = false;
    h.rows.forEach(r => { if (r.role === "owner") { mine = r.text.startsWith(tag); if (mine) bAdd(log, "me", r.text.slice(tag.length).trim()); } else if (mine && r.role === "claude") bAdd(log, "ai", r.text); });
    if (!log.childElementCount) bAdd(log, "sys", "Ask or tell Claude anything about this building. The reply lands here.");
  } catch (e) { bAdd(log, "sys", "Couldn't load the chat."); }
  ta.oninput = () => { ta.style.height = ""; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; };
  ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !MOBILE) { e.preventDefault(); form.requestSubmit(); } };
  form.onsubmit = async e => {
    e.preventDefault(); const msg = ta.value.trim(); if (!msg) return;
    ta.value = ""; ta.style.height = ""; bAdd(log, "me", msg);
    const ai = bAdd(log, "ai", "…"); let txt = "", buf = "";
    try {
      const r = await api("/chat", { method: "POST", body: JSON.stringify({ msg: `${tag} ${msg}` }) });
      if (!r.ok) { ai.textContent = "Portal error " + r.status; return; }
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.t === "text") { txt += ev.d; ai.textContent = txt; log.scrollTop = 1e9; }
          else if (ev.t === "tool" && !txt) ai.textContent = "⚙️ " + ev.d.slice(0, 80);
          else if (ev.t === "done") { if (!txt) ai.textContent = ev.paused ? "⏸ Paused for a newer message" : "✓ done"; }
        }
      }
    } catch (err) { if (!txt) ai.textContent = "Connection lost: the reply will show here when you reopen the building."; }
  };
}

$("#tform").addEventListener("submit", e => {
  e.preventDefault(); const msg = $("#tin").value.trim(); if (!msg) return;
  if (tBusy) tAdd("sys", "⏸ Pausing Claude to read this first. It saves what it did and carries on after.");
  tAdd("me", msg); $("#tin").value = ""; $("#tin").style.height = "";
  attach(api("/chat", { method: "POST", body: JSON.stringify({ msg }) }));
});
$("#tin").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !MOBILE) { e.preventDefault(); $("#tform").requestSubmit(); } });
$("#tin").addEventListener("input", e => { e.target.style.height = ""; e.target.style.height = Math.min(180, e.target.scrollHeight) + "px"; });
$("#tx").onclick = closeTerm;
$("#sheetbody").addEventListener("click", e => { const b = e.target.closest("button.ask"); if (b) ask(b.dataset.p); });
$("#tstop").onclick = () => api("/stop", { method: "POST", body: "{}" });
$("#tnew").onclick = async () => { if (tBusy) return; await api("/new", { method: "POST", body: "{}" }); tlog().innerHTML = ""; tAdd("sys", "New conversation. Claude still has its memory notes."); };

// ---------- Virtual Office (owner 2026-10-08) ----------
// Whiteboard wall: the owner's own notes (saved live via rose-web /api/hq-office -> hq-data/board.json) + Claude's planning
// (AI Influencer Army from avatars.json, extra board.sections). Staff floor from snapshot.staff, job monitor from hq-data/tasks.jsonl.
const OFFICE_API = "https://chat.sonneblomdigitaal.co.za/api/hq-office";
let oTimer = null, oLive = null;
async function officeCall(body = {}) {
  try { const r = await fetch(OFFICE_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pw: PW, ...body }) }); return r.ok ? r.json() : null; }
  catch (e) { return null; }
}
function officeHTML(live) {
  const s = M.s, av = s.avatars || {}, A = av.avatars || [], P = av.phases || [], bd = (live && live.board) || s.board || {}, T = (live && live.tasks) || s.tasks || [];
  const sc = { live: "#16a34a", building: "#d97706", next: "#0284c7", planned: "#64748b", paused: "#dc2626" };
  const ink = ["#1d4ed8", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];
  const army = A.map((x, i) => `<div class="pc" style="--r:${[-2, 1.5, -1, 2, -1.5][i % 5]}deg;background:${["#fff8a8", "#ffd6e7", "#c8f7ff", "#e4d4ff", "#d6ffd0"][i % 5]}">
      <h5>${x.emoji} ${esc(x.name)}</h5><span class="st" style="background:${sc[x.status] || "#64748b"}">${esc((x.status || "").toUpperCase())}</span><br>
      ${esc(x.niche)}<br>💰 ${esc(x.money)}<br>🎯 ${esc(x.goal)}<br>⚡ ${num(x.credits)} credits · ${esc(x.start || "")}</div>`).join("");
  const phases = P.map((p, i) => { const d = (p.steps || []).filter(t => t.done).length;
    return `<div style="color:${ink[i % 5]}"><b>${esc(p.name)}</b> · ${d}/${(p.steps || []).length} · ⚡${num(p.credits)}<br>${(p.steps || []).slice(0, 6).map(t => `${t.done ? "☑" : "☐"} ${esc(t.t)}`).join("<br>")}</div>`; }).join("");
  const extra = (bd.sections || []).map((x, i) => `<div class="mk" style="color:${x.color || ink[(i + 2) % 5]}">${esc(x.title)}</div>
      <div class="cards">${(x.cards || []).map((c, j) => `<div class="pc" style="--r:${j % 2 ? 1 : -1}deg"><h5>${esc(c.h)}</h5>${(c.lines || []).map(esc).join("<br>")}</div>`).join("")}</div>`).join("");
  const all = (s.staff || {}).staff || [], dot = { working: "#16a34a", "on duty": "#22c55e", "on call": "#0ea5e9", late: "#f59e0b", off: "#94a3b8" };
  const bosses = all.filter(x => !x.boss || x.boss === "claude");
  const team = b => all.filter(x => x.boss === b.id);
  const pp = x => `<span class="pp" title="${esc(x.job)}"><i class="dot" style="background:${dot[x.status] || "#94a3b8"}"></i>${x.emoji || "🙂"} <b>${esc(x.name)}</b> ${esc((x.job || "").split(":")[0].slice(0, 28))}</span>`;
  const staff = bosses.map(b => `<div class="team"><b>${b.emoji || ""} ${esc(b.name)} · ${esc((b.job || "").split(":")[0])}</b><div class="ppl">${team(b).map(pp).join("") || '<span class="pp">no team yet</span>'}</div></div>`).join("");
  const on = all.filter(x => ["working", "on duty"].includes(x.status)).length;
  const ic = { running: "⏳", done: "✅", failed: "❌", stopped: "⚪" };
  const jobs = T.length ? T.map(t => `<div class="job">${ic[t.state] || "•"} <i>${esc(t.title)}</i><small>${esc(t.state)} · started ${esc((t.started || "").slice(5, 16).replace("T", " "))}${t.state !== "running" ? " · ended " + esc((t.updated || "").slice(11, 16)) : ""}${t.note ? " · " + esc(t.note.slice(0, 140)) : ""}</small></div>`).join("")
    : '<div class="job">No background jobs yet.</div>';
  return `<div class="otop"><h2>🏢 Head Office</h2><button id="oclose">✕ Back to the city</button></div>
  <div class="wb"><div class="wcols">
    <div><div class="wbt">✍️ My notes & planning</div><textarea id="onotes" placeholder="Type anything: ideas, plans, lists… it saves by itself.">${esc(bd.notes || "")}</textarea>
      <div class="saved" id="osaved">${bd.notes_at ? "saved " + esc(bd.notes_at.slice(5, 16).replace("T", " ")) : "not saved yet"}</div></div>
    <div><div class="wbt">🤖 AI Influencer Army ${av.credits?.left != null ? `<span style="font:20px Caveat;color:#475569">· ${num(av.credits.left)} Higgsfield credits left</span>` : ""}</div>
      <div class="cards">${army || "<i>Plan coming…</i>"}</div>
      ${phases ? `<div class="mk" style="color:#dc2626">Game plan</div><div class="ph">${phases}</div>` : ""}${extra}</div>
  </div></div>
  <div class="floor">
    <div class="desk"><h3>👥 Staff floor · ${on}/${all.length} at work</h3>${staff}</div>
    <div class="mon"><h3>🖥️ Background jobs</h3>${jobs}${rtkHTML(s.rtk)}</div>
  </div>`;
}
// RTK token saver (hq/rtk_savings.py): simulated savings over all our Claude history + real savings since the hook went live
function rtkHTML(r) {
  if (!r || !r.sim) return "";
  const k = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n || 0);
  const mx = Math.max(1, ...(r.days || []).map(d => d[1]));
  return `<h3 style="margin-top:14px">🪙 RTK token saver</h3>
    <div class="job">If RTK had been on from day one: <i>${k(r.sim.tokens_saved)} tokens</i> less output read, plus <i>${k(r.sim.cache_rereads_saved)}</i> cached re-reads<br>
    = <b style="color:#fde047;font-size:16px">$${r.sim.usd.toFixed(2)}</b> <small>(${r.sim.rtk_would_shrink} of ${num(r.sim.commands)} commands shrunk · $${r.sim.usd_fresh} fresh + $${r.sim.usd_cache} cache · ${esc(r.model)} API prices)</small></div>
    <div class="job">Real since ${esc(r.real.since)}: <i>${k(r.real.tokens_saved)} tokens</i> saved on ${num(r.real.commands)} commands (${r.real.pct}%) = <b style="color:#fde047">$${r.real.usd.toFixed(2)}</b></div>
    <div style="display:flex;align-items:flex-end;gap:3px;height:46px;margin-top:6px">${(r.days || []).map(([d, v]) => `<div title="${esc(d)}: ${k(v)} tokens" style="flex:1;background:#4ade80;height:${Math.max(2, 46 * v / mx)}px;border-radius:2px"></div>`).join("")}</div>
    <small style="color:#94a3b8">Tokens RTK would have saved per day (last 14). On the subscription this means more work per usage limit, not cash back.</small>`;
}
async function openOffice() {
  const el = $("#office"); el.hidden = false; el.innerHTML = officeHTML(oLive);
  const wire = () => {
    $("#oclose").onclick = () => { el.hidden = true; clearInterval(oTimer); };
    $("#onotes").oninput = e => { $("#osaved").textContent = "typing…"; clearTimeout(wire.t);
      wire.t = setTimeout(async () => { const r = await officeCall({ notes: e.target.value }); $("#osaved").textContent = r ? "saved ✓ " + new Date().toTimeString().slice(0, 5) : "⚠️ not saved (offline?)"; if (r) oLive = r; }, 1200); };
  };
  wire();
  const refresh = async () => { const r = await officeCall(); if (!r || el.hidden) return; oLive = r;
    if (document.activeElement === $("#onotes")) return;  // never redraw under the owner's fingers
    el.innerHTML = officeHTML(r);
    wire(); };
  refresh(); clearInterval(oTimer); oTimer = setInterval(refresh, 30000);
}
$("#officebtn").onclick = openOffice;

// ---------- boot ----------
// District signs (owner 2026-10-07): Media block west, Warehouses east, Shop Street south, Bot Row north, City Park in the middle
function districts() {  // each quarter: a coloured fog light over it, a glow on the ground and a name tag you can tap to fly there
  const glowTex = (w, h, draw) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d")); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const col = glowTex(4, 128, g => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.6, "rgba(255,255,255,0.3)"); gr.addColorStop(1, "#fff"); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); });
  const disc = glowTex(128, 128, g => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.6, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const add = (map, o) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  DIST.forEach(D => {
    const R = (D.hill ? D.h + 4 : D.h * 1.05), y = D.y;
    D.haze = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.08, 46, 48, 1, true), add(col, 0.2)); D.haze.material.color.set(D.color);
    D.haze.position.set(D.c[0], y + 23.3, D.c[1]); scene.add(D.haze);
    D.glow = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.8, R * 2.8), add(disc, 0.4)); D.glow.material.color.set(D.color);
    D.glow.rotation.x = -Math.PI / 2; D.glow.position.set(D.c[0], y + 0.5, D.c[1]); scene.add(D.glow);
    const el = document.createElement("div"); el.className = "dtag"; el.style.setProperty("--c", hex(D.color)); el.innerHTML = `<b>${D.name}</b>`;
    el.onclick = () => goDistrict(D.id);
    const lab = new CSS2DObject(el); lab.position.set(D.c[0], 2, D.c[1] + (D.hill ? D.hill - 4 : D.h * 1.12 + 10)); scene.add(lab);
    D.el = el; D.k = -1;
  });
}
const FADE = [];
const distOf = (x, z) => DIST.reduce((a, D) => Math.hypot(x - D.c[0], z - D.c[1]) < Math.hypot(x - a.c[0], z - a.c[1]) ? D : a);
function fadeSetup() {  // after everything is built: remember each building's materials so its quarter can fade it
  FADE.length = 0; DIST.forEach(D => D.k = -1);
  const owner = new Map();
  M.B.forEach(b => {
    const g = groups[b.id]; if (!g) return;
    const D = distOf(b.pos[0], b.pos[1]), mats = [];
    g.traverse(o => { if (!o.material || o.userData.smoke || Array.isArray(o.material)) return;
      if (owner.has(o.material) && owner.get(o.material) !== D) o.material = o.material.clone();  // shared with another quarter: give this one its own
      owner.set(o.material, D); mats.push([o.material, o.material.opacity, o.material.transparent, o.material.depthWrite]); });
    FADE.push({ D, g, mats: [...new Map(mats.map(x => [x[0], x])).values()], el: g.userData.tag, k: -1 });
  });
  anim.push(fadeDistricts);
}
function fadeDistricts() {  // quarters far from where you're looking sink into their fog light; they brighten as you fly over
  const t = controls.target;
  DIST.forEach(D => {
    const far = Math.max(0, Math.hypot(t.x - D.c[0], t.z - D.c[1]) - (D.hill ? D.hill * 0.75 : D.h * 1.08) - 6), k = Math.round((1 - smooth(0, 70, far)) * 20) / 20;
    if (k === D.k) return; D.k = k;
    D.haze.material.opacity = 0.04 + 0.26 * (1 - k); D.glow.material.opacity = 0.18 + 0.4 * (1 - k);
    D.el.classList.toggle("here", k > 0.5);
  });
  FADE.forEach(F => {
    const k = F.D.k; if (k === F.k) return; F.k = k;
    const f = 0.09 + 0.91 * k; F.g.userData.fade = f;
    F.mats.forEach(([m, o, tr, dw]) => { const want = tr || f < 0.99; if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; } m.opacity = o * f; m.depthWrite = f < 0.99 ? false : dw; });
    if (F.el) F.el.style.opacity = 0.22 + 0.78 * k;
  });
}
function goDistrict(id) {
  const D = DIST.find(x => x.id === id); if (!D) return;
  $("#sheet").hidden = true; closeTerm(); $("#hint").style.opacity = 0; showStaffTags(null);
  const s = innerWidth < innerHeight ? 1.75 : 1;
  const [vx, vz] = D.view || [0, 1];   // look at the quarter from the side its fronts face
  const ly = D.y + (D.look || 4);
  fly(new THREE.Vector3(D.c[0] - vx * 4, ly, D.c[1] - vz * 4), new THREE.Vector3(D.c[0] + vx * 88 * s, ly + 54 * s, D.c[1] + vz * 88 * s));
}

// ---------- THEMES / WORLDS (owner 2026-10-08) ----------
// ---------- WORLDS (owner 2026-10-08): whole new towns, not colour skins ----------
// A world swaps the neon office park for its own map: curved roads (CatmullRom ribbons with sidewalks, kerbs and centre
// dashes), our buildings moved onto lots along those roads (b.pos/b.face overridden right after model()), the Vault moved
// too, so beams, staff, focus and tap-to-fly keep working. Smooth rounded MeshStandard geometry, soft sun shadows, a
// gradient sky, fog and rolling hills at the edges. Picked in the 🎨 menu, saved per device (localStorage city-theme).
let THEME = get("city-theme") || "neon";
const THEMES = [{ id: "neon", name: "Neon Night (classic)", swatch: ["#0a0420", "#ff2bd6", "#00f0ff"] },
  { id: "springfield", name: "Springfield", swatch: ["#70c5ff", "#ffd90f", "#f48fb1"] },
  { id: "cartoon", name: "Cartoon Network", swatch: ["#111111", "#ffffff", "#ff3fa4"] },
  { id: "seventies", name: "1970s Small Town", swatch: ["#f5c98a", "#c8622a", "#7c8a3a"] }];
let WLD = null, WS = null, WGEN = 0, ENV = null;   // active world definition, its runtime state (roads, lots, decor)
const SEG = MOBILE ? 2 : 3, MATS = new Map(), TEX = new Map();
const hx = c => typeof c === "number" ? c : new THREE.Color(c).getHex();
const css = c => "#" + new THREE.Color(c).getHexString();
const tone = (c, l) => "#" + new THREE.Color(c).offsetHSL(0, 0, l).getHexString();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let TOONG = null;
function wm(c, o) {  // shared material per colour + options (flat toon shading in worlds that ask for it, e.g. Cartoon Network)
  const toonW = !!(WLD && WLD.toon), k = (toonW ? "t" : "") + hx(c) + (o ? JSON.stringify(o, (key, v) => v && v.isTexture ? v.uuid : v) : "");
  let m = MATS.get(k); if (m) return m;
  if (toonW) {
    if (!TOONG) { TOONG = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
      TOONG.minFilter = TOONG.magFilter = THREE.NearestFilter; TOONG.needsUpdate = true; }
    const p = { color: hx(c), gradientMap: TOONG }; for (const x of ["map", "side", "transparent", "opacity", "depthWrite", "emissive", "emissiveIntensity", "emissiveMap"]) if (o && o[x] !== undefined) p[x] = o[x];
    m = new THREE.MeshToonMaterial(p);
  } else m = new THREE.MeshStandardMaterial({ color: hx(c), roughness: 0.7, metalness: 0, envMapIntensity: 0.55, ...o });
  MATS.set(k, m); return m;
}
const GLASS = () => wm(0x86a9c2, { roughness: 0.1, metalness: 0.4, envMapIntensity: 1.3 });
function ctex(key, w, h, draw, rep = [1, 1]) {
  let t = TEX.get(key); if (t) return t;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h);
  t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  TEX.set(key, t); return t;
}
const noiseTex = (c, n, rep) => ctex(`nz${c}${n}${rep}`, 128, 128, (g, w, h) => { g.fillStyle = css(c); g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 5; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${n})` : `rgba(0,0,0,${n})`; g.fillRect(Math.random() * w | 0, Math.random() * h | 0, 2, 2); } }, [rep, rep]);
const brickTex = c => ctex("br" + c, 256, 256, (g, w, h) => { g.fillStyle = "#d4c9b6"; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 16; r++) for (let k = -1; k < 8; k++) { g.fillStyle = tone(c, (Math.random() - 0.5) * 0.09); g.fillRect(k * 32 + (r % 2) * 16 + 1.5, r * 16 + 1.5, 29, 13); } }, [2, 2]);
const chk = (n, m = n) => ctex(`ck${n}_${m}`, 64, 64, g => { g.fillStyle = "#f6f6f6"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#141414"; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }, [n, m]);
const stripeTex = (c, n, c2 = "#fbf7ef") => ctex(`st${c}${n}${c2}`, 8, 64, g => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : css(c); g.fillRect(0, i * 8, 8, 8); } }, [1, n]);
const brick = c => wm(0xffffff, { map: brickTex(c), roughness: 0.85 });

// geometry helpers: every mesh casts + receives shadows; static parts get merged per material by bake()
function put(p, geo, c, x = 0, y = 0, z = 0, o) {
  const m = new THREE.Mesh(geo, c && c.isMaterial ? c : wm(c, o)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; p.add(m); return m;
}
const rbox = (p, w, h, d, c, x = 0, y = 0, z = 0, r = 0.3, o) => { const rr = Math.max(0.02, Math.min(r, w / 2.05, h / 2.05, d / 2.05));
  return put(p, new RoundedBoxGeometry(w, h, d, rr >= 0.25 ? SEG : 1, rr), c, x, y + h / 2, z, o); };
const cyl = (p, r1, r2, h, c, x = 0, y = 0, z = 0, n = 24, o) => put(p, new THREE.CylinderGeometry(r1, r2, h, n), c, x, y + h / 2, z, o);
const ball = (p, r, c, x = 0, y = 0, z = 0, o) => put(p, new THREE.SphereGeometry(r, 24, 16), c, x, y, z, o);
const dome = (p, r, c, x = 0, y = 0, z = 0, o) => put(p, new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), c, x, y, z, o);
const lathe = (p, pts, c, x = 0, y = 0, z = 0, o, n = 32) => put(p, new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), n), c, x, y, z, o);
const dyn = m => (m.userData.dyn = true, m);
function groof(p, w, d, h, c, y, x = 0, z = 0, ov = 0.6) {  // gable roof with soft bevelled edges, ridge along x
  const s = new THREE.Shape(); s.moveTo(-d / 2 - ov, 0); s.lineTo(0, h); s.lineTo(d / 2 + ov, 0); s.lineTo(-d / 2 - ov, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: w + ov * 2, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 2 });
  geo.translate(0, 0, -(w + ov * 2) / 2); geo.rotateY(Math.PI / 2); return put(p, geo, c, x, y, z);
}
function hroof(p, w, d, h, c, y, x = 0, z = 0) {  // hip roof
  const m = put(p, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), c, x, y, z); m.scale.set(w + 1, h, d + 1); return m;
}
function win(p, x, y, z, w = 1.2, h = 1.5, fr = 0xffffff, sh) {  // y = bottom of the glass
  rbox(p, w + 0.3, h + 0.3, 0.14, fr, x, y - 0.15, z, 0.07); rbox(p, w, h, 0.2, GLASS(), x, y, z + 0.01, 0.05);
  rbox(p, w + 0.5, 0.14, 0.34, fr, x, y - 0.24, z + 0.1, 0.05);
  if (sh != null) for (const s of [-1, 1]) rbox(p, w * 0.42, h + 0.2, 0.12, sh, x + s * (w / 2 + w * 0.3), y - 0.1, z, 0.05);
}
const wrow = (p, W, z, n, y, w, h, fr, sh) => { for (let i = 0; i < n; i++) win(p, -W / 2 + W / n * (i + 0.5), y, z, w, h, fr, sh); };
function sign(p, text, w, h, bg, fg, x, y, z, o = {}) {  // painted sign on a rounded backing board; y = centre
  const cw = 512, ch = Math.max(48, Math.round(512 * h / w));
  const t = ctex(["sg", text, w, h, bg, fg, o.font, o.fam, o.glow, o.bd].join("|"), cw, ch, g => {
    if (bg !== "none") { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, cw, ch, ch * 0.18); g.fill(); }
    if (o.bd) { g.strokeStyle = o.bd; g.lineWidth = ch * 0.06; g.beginPath(); g.roundRect(ch * 0.08, ch * 0.08, cw - ch * 0.16, ch - ch * 0.16, ch * 0.12); g.stroke(); }
    let fs = ch * 0.6; const F = () => `${o.font || 800} ${fs}px ${o.fam || "Sora, Arial, sans-serif"}`; g.font = F();
    while (g.measureText(text).width > cw * 0.86 && fs > 8) { fs -= 2; g.font = F(); }
    g.textAlign = "center"; g.textBaseline = "middle";
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = fs * 0.4; }
    g.fillStyle = fg; g.fillText(text, cw / 2, ch / 2 + fs * 0.06);
  });
  t.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, transparent: bg === "none", envMapIntensity: 0.4, ...(o.glow ? { emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.85 } : {}) });
  if (bg !== "none") rbox(p, w + 0.25, h + 0.25, 0.3, o.back ?? hx(bg), x, y - h / 2 - 0.125, z - 0.17, 0.1);
  const m = put(p, new THREE.PlaneGeometry(w, h), mat, x, y, z); m.castShadow = false; return m;
}
function awning(p, w, x, y, z, c, r = 1.3) {  // striped quarter-round canvas awning hanging from y
  const geo = new THREE.CylinderGeometry(r, r, w, 14, 1, true, 0, Math.PI / 2).rotateZ(Math.PI / 2);
  return put(p, geo, wm(0xffffff, { map: stripeTex(c, Math.max(2, Math.round(w / 0.9))), side: THREE.DoubleSide, roughness: 0.85 }), x, y - r, z);
}
function store(p, o) {  // storefront: rounded walls, cornice, glass shopfront with mullions, door, awning, false-front sign
  const { w, d, h } = o, tr = o.trim ?? 0xf3eee4, sf = Math.min(3.2, h * 0.5), fw = o.fw ?? w * 0.78;
  rbox(p, w, h, d, o.brick ? brick(o.brick) : o.wall, 0, 0, 0, o.r ?? 0.35);
  rbox(p, w + 0.5, 0.55, d + 0.5, tr, 0, h - 0.25, 0, 0.22);
  rbox(p, w + 0.2, 0.4, d + 0.2, o.base ?? 0x8d877d, 0, 0, 0, 0.14);
  rbox(p, fw + 0.4, sf + 0.4, 0.22, tr, 0, 0.3, d / 2, 0.1); rbox(p, fw, sf, 0.26, GLASS(), 0, 0.5, d / 2 + 0.02, 0.06);
  const nm = Math.max(2, Math.round(fw / 2.4)); for (let i = 1; i < nm; i++) rbox(p, 0.14, sf, 0.32, tr, -fw / 2 + i * fw / nm, 0.5, d / 2 + 0.02, 0.05);
  rbox(p, 1.4, 2.5, 0.36, o.door ?? 0x5b3a26, o.dx ?? 0, 0.4, d / 2 + 0.04, 0.08);
  if (h > 7.4) wrow(p, w * 0.8, d / 2, Math.max(2, Math.round(w / 3.4)), sf + 2.3, 1.15, Math.min(1.7, h - sf - 3.6), tr, o.sh);
  if (o.awn) awning(p, fw + 0.5, 0, sf + 1.0, d / 2 + 0.14, o.awn);
  if (!o.sign) return h;
  const sh = Math.max(1.2, Math.min(2.2, w * 0.16)), sw = Math.min(w * 0.94, 13.5);
  sign(p, o.sign, sw, sh, o.sbg ?? "#ffffff", o.sfg ?? "#222222", 0, h + 0.3 + sh / 2, d / 2 - 0.1, o.so || {});
  return h + sh + 0.5;
}
function house(p, o) {  // family house: walls, gable roof, windows with shutters, door + stoop, chimney, optional garage + porch
  const w = o.w ?? 9, d = o.d ?? 7.5, st = o.st ?? 2, H = st * 3, x0 = o.x ?? 0, rh = o.rh ?? 3, tr = o.trim ?? 0xffffff, fz = d / 2;
  rbox(p, w, H, d, o.wall, x0, 0, 0, o.r ?? 0.25); rbox(p, w + 0.3, 0.45, d + 0.3, o.base ?? 0x8e8a82, x0, 0, 0, 0.12);
  groof(p, w, d, rh, o.roof, H - 0.05, x0);
  const dx = x0 + (o.dx ?? w * 0.2);
  rbox(p, 1.25, 2.3, 0.3, o.door ?? 0x7a4a2a, dx, 0.35, fz + 0.03, 0.08); rbox(p, 2.6, 0.32, 1.6, 0xd6d0c4, dx, 0, fz + 0.8, 0.1);
  if (o.porch) { rbox(p, 3.6, 0.2, 2.2, tr, dx, 2.9, fz + 1.1, 0.06); for (const s of [-1, 1]) cyl(p, 0.11, 0.11, 2.9, tr, dx + s * 1.6, 0, fz + 2, 10); }
  const n = Math.max(2, Math.round(w / 3)), xs = [...Array(n)].map((_, i) => x0 - w / 2 + w / n * (i + 0.5));
  for (let f = 0; f < st; f++) xs.forEach(x => { if (f === 0 && Math.abs(x - dx) < 1.7) return; win(p, x, f * 3 + 1.0, fz, 1.1, 1.35, tr, o.sh); });
  if (o.chim !== false) rbox(p, 1, rh + 1.3, 1, o.chimC ?? 0xa45a44, x0 + w * 0.3, H - 0.2, -d * 0.15, 0.12);
  if (o.garage) { const gx = x0 - w / 2 - 2.7; rbox(p, 5.2, 3.1, d - 0.6, o.wall, gx, 0, 0.3, 0.25); groof(p, 5.2, d - 0.6, 1.5, o.roof, 3.05, gx, 0.3, 0.35);
    rbox(p, 4.2, 2.5, 0.22, 0xf3f0ea, gx, 0.1, fz + 0.02, 0.08); }
  return H + rh;
}
function car(p, x, z, ry, color, S) {  // a parked car (static, baked with its parent)
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; p.add(g);
  rbox(g, S.w, S.h, S.l, wm(color, { roughness: 0.3, metalness: 0.35, envMapIntensity: 1.1 }), 0, 0.36, 0, S.r);
  rbox(g, S.w * 0.86, S.ch, S.cl, GLASS(), 0, 0.3 + S.h, -S.l * 0.06, S.cr);
  rbox(g, S.w * 0.84, 0.14, S.cl * 0.92, wm(color, { roughness: 0.3, metalness: 0.35, envMapIntensity: 1.1 }), 0, 0.3 + S.h + S.ch - 0.08, -S.l * 0.06, 0.06);
  if (S.wood) for (const s of [-1, 1]) rbox(g, 0.08, S.h * 0.45, S.l * 0.78, 0x8a5a2b, s * (S.w / 2 + 0.02), 0.5 + S.h * 0.2, -0.1, 0.03);
  if (S.chrome) for (const s of [-1, 1]) rbox(g, S.w + 0.1, 0.22, 0.25, wm(0xdfe3e6, { metalness: 0.9, roughness: 0.2 }), 0, 0.42, s * (S.l / 2 + 0.05), 0.08);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) put(g, new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16).rotateZ(Math.PI / 2), 0x1d1d1f, sx * (S.w / 2 - 0.08), 0.38, sz * S.l * 0.32);
  return g;
}
function bus(p, x, z, ry, c = 0xf5b915) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; p.add(g);
  rbox(g, 2.5, 2.4, 9, c, 0, 0.45, 0, 0.45); rbox(g, 2.56, 0.9, 7.4, GLASS(), 0, 1.75, -0.5, 0.12); rbox(g, 2.58, 0.18, 8.6, 0x222222, 0, 1.2, 0, 0.06);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) put(g, new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16).rotateZ(Math.PI / 2), 0x1d1d1f, sx * 1.15, 0.5, sz * 2.9);
}
function flag(p, x, z, h = 10, c = 0xd8342b) {
  cyl(p, 0.09, 0.12, h, 0xe6e6e6, x, 0, z, 10); ball(p, 0.2, 0xd4af37, x, h + 0.1, z);
  const t = ctex("flag", 64, 40, g => { for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#c8323c"; g.fillRect(0, i * 40 / 7, 64, 40 / 7 + 1); } g.fillStyle = "#2b3f86"; g.fillRect(0, 0, 28, 22); });
  put(p, new THREE.PlaneGeometry(2.4, 1.5), wm(0xffffff, { map: t, side: THREE.DoubleSide }), x + 1.25, h - 0.9, z);
}
function bake(root) {  // merge every static mesh under root into one mesh per material (draw calls: hundreds -> a handful)
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), by = new Map(), dead = [], rel = new THREE.Matrix4();
  const walk = o => {
    if (o.userData.dyn) return;
    if (o.isMesh && !o.isInstancedMesh) {
      const g = o.geometry; rel.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(rel);
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      g.clearGroups(); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(g); dead.push(o);
    }
    o.children.forEach(walk);
  };
  root.children.forEach(walk);
  dead.forEach(o => o.parent.remove(o));
  by.forEach((gs, mat) => { const geo = mergeGeometries(gs); if (!geo) return; const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true; root.add(m); gs.forEach(g => g.dispose()); });
}

// ---------- roads, terrain, water ----------
function prepRoad(r) {
  const c = new THREE.CatmullRomCurve3(r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), !!r.closed, "centripetal");
  const L = c.getLength(), n = Math.ceil(L / 1.5), A = () => new Float32Array(n + 1);
  const R = { w: 9, sw: 2.6, ...r, L, n, X: A(), Z: A(), TX: A(), TZ: A(), lift: A() }, p = new THREE.Vector3(), t = new THREE.Vector3();
  for (let k = 0; k <= n; k++) { c.getPointAt(k / n, p); c.getTangentAt(k / n, t); t.y = 0; t.normalize(); R.X[k] = p.x; R.Z[k] = p.z; R.TX[k] = t.x; R.TZ[k] = t.z; }
  return R;
}
const edge = R => R.w / 2 + (R.sw || 0);
function nearest(R, x, z) { let bi = 0, bd = 1e9; for (let k = 0; k <= R.n; k++) { const d = (R.X[k] - x) ** 2 + (R.Z[k] - z) ** 2; if (d < bd) { bd = d; bi = k; } } return [bi, Math.sqrt(bd)]; }
const roadGap = (x, z, skip) => WS.R.reduce((m, R) => R === skip ? m : Math.min(m, nearest(R, x, z)[1] - edge(R)), 1e9);
const waterGap = (x, z) => WS.water.reduce((m, R) => Math.min(m, nearest(R, x, z)[1] - R.w / 2 - 3), 1e9);
const occFree = (x, z, r) => WS.occ.every(o => Math.hypot(x - o.x, z - o.z) > o.r + r);
const free = (x, z, r) => Math.abs(x) < 116 && Math.abs(z) < 116 && hgt(x, z) < 0.3 && roadGap(x, z) > r * 0.8 && waterGap(x, z) > r * 0.8 && occFree(x, z, r);
function lotAt(R, k, side, d, sb) {  // a lot beside the road at sample k: centre + the direction its front faces (the road)
  k = Math.max(0, Math.min(R.n, k)); const nx = -R.TZ[k] * side, nz = R.TX[k] * side, o = edge(R) + 1.2 + sb + d / 2;
  return { x: R.X[k] + nx * o, z: R.Z[k] + nz * o, face: [-nx, -nz], k, side };
}
function snapLot(ri, x, z, d, sb) {
  const R = WS.R[ri], [k] = nearest(R, x, z), side = Math.sign((x - R.X[k]) * -R.TZ[k] + (z - R.Z[k]) * R.TX[k]) || 1;
  return lotAt(R, k, side, d, sb);
}
function hgt(x, z) {  // terrain: a flat town, rolling hills past ~116 (squarish so the corners stay flat), plus named hills
  const e = Math.pow(Math.abs(x) ** 6 + Math.abs(z) ** 6, 1 / 6), k = smooth(114, 205, e);
  let h = k * (30 + 12 * Math.sin(x * 0.031 + 1.3) * Math.cos(z * 0.027) + 7 * Math.sin((x + z) * 0.05));
  const kb = smooth(100, 122, e);
  if (kb > 0) for (const [bx, bz, bh, rx, rz] of WLD.bumps || []) h += kb * bh * Math.exp(-((x - bx) ** 2) / (rx * rx) - ((z - bz) ** 2) / (rz * rz));
  return h;
}
function ribbon(R, o0, o1, y, mat, keep, uvL = 4) {  // flat strip between lateral offsets o0 < o1 (right of travel = +)
  const pos = [], uv = [], nor = [], idx = [];
  for (let k = 0; k <= R.n; k++) {
    const nx = -R.TZ[k], nz = R.TX[k], yy = y + R.lift[k], s = k * R.L / R.n / uvL;
    pos.push(R.X[k] + nx * o0, yy, R.Z[k] + nz * o0, R.X[k] + nx * o1, yy, R.Z[k] + nz * o1); uv.push(s, 0, s, 1); nor.push(0, 1, 0, 0, 1, 0);
    if (k < R.n && (!keep || (keep[k] && keep[k + 1]))) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
}
function wallR(R, off, y0, y1, mat, keep) {  // vertical strip (kerb face, bridge parapet)
  const pos = [], idx = [];
  for (let k = 0; k <= R.n; k++) { const x = R.X[k] - R.TZ[k] * off, z = R.Z[k] + R.TX[k] * off, l = R.lift[k];
    pos.push(x, y0 + l, z, x, y1 + l, z); if (k < R.n && (!keep || (keep[k] && keep[k + 1]))) { const a = 2 * k; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; scene.add(m); return m;
}
function drawRoad(R, i) {
  const st = WLD.style, others = WS.R.filter(o => o !== R), y0 = 0.08 + i * 0.006, d = new THREE.Object3D();
  const inOther = (k, off, pad) => { const x = R.X[k] - R.TZ[k] * off, z = R.Z[k] + R.TX[k] * off; return others.some(o => nearest(o, x, z)[1] < o.w / 2 + pad); };
  const keepArr = (off, pad) => Array.from({ length: R.n + 1 }, (_, k) => !inOther(k, off, pad));
  if (R.rail) {  // railway: ballast bed, sleepers, two steel rails
    ribbon(R, -2.3, 2.3, 0.1, wm(0xffffff, { map: noiseTex(0x8a8178, 0.18, 1), roughness: 1 }), null, 3);
    const sl = new THREE.InstancedMesh(new RoundedBoxGeometry(3, 0.18, 0.5, 1, 0.05), wm(0x5a4232, { roughness: 0.9 }), R.n + 1);
    for (let k = 0; k <= R.n; k++) { d.position.set(R.X[k], 0.2, R.Z[k]); d.rotation.set(0, Math.atan2(R.TX[k], R.TZ[k]), 0); d.updateMatrix(); sl.setMatrixAt(k, d.matrix); }
    sl.receiveShadow = true; scene.add(sl);
    for (const s of [-0.75, 0.75]) { ribbon(R, s - 0.08, s + 0.08, 0.4, wm(0xb8bcc0, { metalness: 0.85, roughness: 0.3 })); wallR(R, s, 0.28, 0.4, wm(0x6d6a66, { metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide })); }
    return;
  }
  ribbon(R, -R.w / 2, R.w / 2, y0, wm(0xffffff, { map: noiseTex(st.asphalt, 0.07, 1), roughness: 0.93 }), null, 6);
  const walk = st.walk === "chk" ? wm(0xffffff, { map: chk(1, 2), roughness: 0.8 }) : wm(0xffffff, { map: noiseTex(st.walk ?? 0xc9c4ba, 0.06, 1), roughness: 0.9 });
  for (const s of [-1, 1]) {
    const keep = keepArr(s * (R.w / 2 + R.sw / 2), 0.4);
    ribbon(R, s < 0 ? -edge(R) : R.w / 2, s < 0 ? -R.w / 2 : edge(R), 0.24 + i * 0.006, walk, keep, st.walk === "chk" ? R.sw * 2 : 3);
    wallR(R, s * R.w / 2, y0, 0.24 + i * 0.006, wm(st.kerb ?? 0xd9d5cc, { side: THREE.DoubleSide, roughness: 0.8 }), keep);
    wallR(R, s * edge(R), 0, 0.24 + i * 0.006, wm(st.kerb ?? 0xd9d5cc, { side: THREE.DoubleSide, roughness: 0.8 }), keep);
  }
  const keepD = keepArr(0, 1.2), dash = [];
  for (let k = 0; k <= R.n; k += 3) if (keepD[k]) dash.push(k);
  const dm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.28, 2.2).rotateX(-Math.PI / 2), wm(st.dash ?? 0xffd23a, { roughness: 0.6 }), dash.length);
  dash.forEach((k, j) => { d.position.set(R.X[k], y0 + 0.012 + R.lift[k], R.Z[k]); d.rotation.set(0, Math.atan2(R.TX[k], R.TZ[k]), 0); d.updateMatrix(); dm.setMatrixAt(j, d.matrix); });
  dm.receiveShadow = true; scene.add(dm);
  if (R.bulb) {  // cul-de-sac turning circle at the end
    const k = R.n, cx = R.X[k] + R.TX[k] * 6, cz = R.Z[k] + R.TZ[k] * 6, rr = R.w / 2 + 6;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(rr, 40).rotateX(-Math.PI / 2), wm(0xffffff, { map: noiseTex(st.asphalt, 0.07, 1), roughness: 0.93 }));
    disc.position.set(cx, y0, cz); disc.receiveShadow = true; scene.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(rr, rr + R.sw, 40).rotateX(-Math.PI / 2), walk); ring.position.set(cx, 0.24 + i * 0.006, cz); ring.receiveShadow = true; scene.add(ring);
    WS.occ.push({ x: cx, z: cz, r: rr + R.sw }); R.bulbAt = [cx, cz, rr];
  }
}
function drawWater(R) {
  ribbon(R, -R.w / 2 - 3.2, R.w / 2 + 3.2, 0.04, wm(WLD.style.bank ?? 0xb9a77f, { roughness: 1 }), null, 6);
  const w = ribbon(R, -R.w / 2, R.w / 2, 0.07, wm(WLD.style.water ?? 0x3f8fd0, { roughness: 0.08, metalness: 0.15, envMapIntensity: 1.6 }), null, 8);
  w.castShadow = false;
}
function bridges() {  // roads hump over rivers; parapets + piers where they cross
  WS.R.forEach(R => {
    if (R.rail) return; let on = [];
    for (let k = 0; k <= R.n; k++) { const g = WS.water.reduce((m, W) => Math.min(m, nearest(W, R.X[k], R.Z[k])[1] - W.w / 2), 1e9);
      R.lift[k] = 1.5 * (1 - smooth(-1, 10, g)); if (g < 3.5) on.push(k); }
    if (!on.length) return;
    const keep = Array.from({ length: R.n + 1 }, (_, k) => on.includes(k));
    for (const s of [-1, 1]) { wallR(R, s * (edge(R) + 0.05), -0.9, 1.1, wm(0xd8d2c6, { roughness: 0.8, side: THREE.DoubleSide }), keep);
      ribbon(R, s < 0 ? -edge(R) - 0.4 : edge(R) - 0.05, s < 0 ? -edge(R) + 0.05 : edge(R) + 0.4, 1.12, wm(0xeeeae2), keep); }
    ribbon(R, -edge(R), edge(R), -0.9, wm(0xb8b2a6, { side: THREE.DoubleSide }), keep);
    const mid = on[on.length >> 1];
    for (const s of [-1, 1]) { const k = on[Math.max(0, Math.min(on.length - 1, (on.length >> 1) + s * Math.round(on.length / 4)))];
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 2, 16), wm(0xcfc9bd)); m.position.set(R.X[k], -0.2, R.Z[k]); m.castShadow = true; scene.add(m); }
    WS.occ.push({ x: R.X[mid], z: R.Z[mid], r: 4 });
  });
}
function skyTex(top, hor, low) {
  const t = ctex(`sky${top}${hor}${low}`, 4, 256, g => { const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, css(top)); gr.addColorStop(0.42, css(hor)); gr.addColorStop(0.5, css(hor)); gr.addColorStop(0.56, css(low)); gr.addColorStop(1, css(low)); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); });
  t.mapping = THREE.EquirectangularReflectionMapping; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---------- building a world ----------
function worldLayout() {  // right after M = model(D): move every building onto its lot, the Vault onto its own
  WS = { R: WLD.roads.map(prepRoad), water: (WLD.rivers || []).map(prepRoad), occ: [], solids: [], gen: ++WGEN, houses: [] };
  const spare = [...(WLD.spare || [])];
  M.B.forEach(b => {
    const L = WLD.lots[b.id] || spare.shift() || [0, 0, 60, 0], [w, d] = WLD.size[b.id] || [10, 8], sb = L[3] || 0;
    const p = snapLot(L[0], L[1], L[2], d, sb);
    b.pos = [p.x, p.z]; b.face = p.face; b.w = w; b.d = d; b.sb = 1.2 + sb; b.lot = p;
    WS.occ.push({ x: p.x, z: p.z, r: Math.hypot(w, d) / 2 * 0.92 });
  });
  const v = WLD.vault, p = v.at || snapLot(v.lot[0], v.lot[1], v.lot[2], v.d, v.lot[3] || 0);
  VAULT[0] = p.x; VAULT[1] = p.z; WS.vface = p.face || [0, 1]; WS.occ.push({ x: p.x, z: p.z, r: v.r });
}
function worldEnv() {
  const S = WLD.sky; filmGrain(false);
  scene.background = skyTex(S.top, S.hor, S.low); scene.fog = new THREE.FogExp2(S.hor, S.fog ?? 0.0012);
  if (!ENV) ENV = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = ENV;
  scene.children.filter(o => o.isLight).forEach(o => scene.remove(o));
  scene.add(new THREE.HemisphereLight(S.hemi[0], S.hemi[1], S.hemi[2]));
  const sun = new THREE.DirectionalLight(S.sun[0], S.sun[1]); sun.position.set(...S.sunPos); sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = sc.bottom = -140; sc.right = sc.top = 140; sc.near = 1; sc.far = 700;
  const ms = MOBILE ? 1024 : 2048; sun.shadow.mapSize.set(ms, ms); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = S.exp ?? 1; renderer.domElement.style.filter = S.filter || ""; if (bloom) bloom.enabled = false;
  // terrain: flat town with rolling hills round the edge (vertex-coloured, speckled)
  const nseg = MOBILE ? 110 : 160, T = new THREE.PlaneGeometry(800, 800, nseg, nseg).rotateX(-Math.PI / 2), pa = T.attributes.position, cols = [];
  const c = new THREE.Color(), g0 = new THREE.Color(S.grass), g1 = new THREE.Color(S.hill ?? S.grass);
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), y = hgt(x, z); pa.setY(i, y);
    c.copy(g0).lerp(g1, Math.min(1, y / 28)); if (WLD.tint) WLD.tint(x, z, c); c.multiplyScalar(0.94 + Math.random() * 0.1); cols.push(c.r, c.g, c.b); }
  T.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); T.computeVertexNormals();
  const ground = new THREE.Mesh(T, new THREE.MeshStandardMaterial({ vertexColors: true, map: noiseTex(0xe8e8e8, 0.12, 90), roughness: 0.96, envMapIntensity: 0.3 }));
  ground.receiveShadow = true; scene.add(ground);
  bridges(); WS.water.forEach(drawWater); WS.R.forEach(drawRoad);
}
function worldModel(g, b) {  // building(): this world's version of building b (front faces +z locally, i.e. the road)
  const f = faceDir(b), m = new THREE.Group(); m.rotation.y = Math.atan2(f.x, f.z); g.add(m);
  const top = (WLD.models[b.id] || WLD.models._)(m, b);
  if (!b.noFore) rbox(m, Math.min(b.w, 14), 0.14, b.sb + 0.3, wm(0xffffff, { map: noiseTex(WLD.style.walk === "chk" ? 0xd9d4ca : WLD.style.walk ?? 0xc9c4ba, 0.06, 2), roughness: 0.9 }), 0, 0.02, b.d / 2 + b.sb / 2, 0.05);
  bake(m); if (WLD.ink) ink(m, WLD.ink); return top;
}
let INKM = null;
function ink(root, wdt) {  // cartoon outline: an inverted hull pushed out along the normals, drawn black on its back faces
  if (!INKM) INKM = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.BackSide });
  root.children.slice().forEach(o => {
    if (!o.isMesh || o.isInstancedMesh || o.material.transparent || o.material.map) return;
    const g = o.geometry.clone(), p = g.attributes.position, n = g.attributes.normal; if (!n) return;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * wdt, p.getY(i) + n.getY(i) * wdt, p.getZ(i) + n.getZ(i) * wdt);
    const h = new THREE.Mesh(g, INKM); h.position.copy(o.position); h.rotation.copy(o.rotation); h.scale.copy(o.scale); h.raycast = () => {}; root.add(h);
  });
}
function worldVault() {
  const g = new THREE.Group(); g.userData.b = { id: "vault" };
  const m = new THREE.Group(); g.add(m); WLD.vault.model(m); bake(m); if (WLD.ink) ink(m, WLD.ink);
  const el = document.createElement("div"); el.className = "tag vaultTag"; el.style.setProperty("--c", "#ffd166"); el.onclick = () => focus("vault");
  const lab = new CSS2DObject(el); lab.position.y = WLD.vault.tag ?? 22; g.add(lab); g.userData.el = el;
  g.traverse(o => { if (o.isMesh) { o.userData.bid = "vault"; picks.push(o); } });
  g.position.set(VAULT[0], 0, VAULT[1]); g.rotation.y = Math.atan2(WS.vface[0], WS.vface[1]); groups.vault = g; scene.add(g);
}
// houses / shops lining a road wherever there is room; each gets a front path, picket fence and mailbox
function lineRoad(ri, o) {
  const R = WS.R[ri], step = o.step ?? 17, made = [];
  for (let s = o.s0 ?? 8; s < R.L - (o.s1 ?? 6); s += step) for (const side of o.sides ?? [-1, 1]) {
    const lot = lotAt(R, Math.round(s / R.L * R.n), side, o.d ?? 8, o.sb ?? 5);
    if (!free(lot.x, lot.z, o.r ?? 6.2)) continue;
    const g = new THREE.Group(); g.position.set(lot.x, 0, lot.z); g.rotation.y = Math.atan2(lot.face[0], lot.face[1]); WS.dec.add(g);
    const info = o.make(g, made.length, lot); made.push(lot);
    WS.occ.push({ x: lot.x, z: lot.z, r: o.r ?? 6.2 }); WS.solids.push({ x: lot.x, z: lot.z, r: (o.r ?? 6.2) * 0.8, h: 10 });
    if (o.yard) yard(g, (o.d ?? 8) / 2, (o.sb ?? 5) + 1.2, info?.dx ?? 1.8, o.yard);
  }
  return made;
}
function yard(g, fz, depth, dx, y) {  // front path, picket fence with a gate, mailbox
  rbox(g, 1.4, 0.1, depth, wm(0xffffff, { map: noiseTex(0xcfc8bb, 0.06, 2) }), dx, 0.02, fz + depth / 2, 0.04);
  if (y.fence) { const zf = fz + depth - 0.6, fc = y.fence;
    for (let x = -6; x <= 6; x += 0.55) { if (Math.abs(x - dx) < 1) continue; rbox(g, 0.13, 0.95, 0.07, fc, x, 0, zf, 0.03); }
    for (const yy of [0.3, 0.7]) for (const [a, b] of [[-6.1, dx - 0.9], [dx + 0.9, 6.1]]) rbox(g, b - a, 0.09, 0.05, fc, (a + b) / 2, yy, zf - 0.06, 0.02); }
  const mx = dx + 1.4, mz = fz + depth - 0.3; cyl(g, 0.06, 0.06, 1.05, 0x6b4f35, mx, 0, mz, 8);
  rbox(g, 0.4, 0.42, 0.7, y.box ?? 0x5a6b7a, mx, 1.0, mz, 0.18); rbox(g, 0.04, 0.35, 0.1, 0xd8342b, mx + 0.24, 1.25, mz - 0.15, 0.02);
}

// ---------- life in a world: cars on the curves, people + dogs on the sidewalks, trees, lamps, poles, clouds ----------
function worldLife() {
  const st = WLD.style, d = new THREE.Object3D(), col = new THREE.Color();
  M.B.forEach(b => solids.push({ x: b.pos[0], z: b.pos[1], r: Math.max(b.w, b.d) * 0.58 + 0.4, h: (groups[b.id]?.userData.top || 12) + 4 }));
  solids.push({ x: VAULT[0], z: VAULT[1], r: WLD.vault.r * 0.8, h: 30 }); WS.solids.forEach(s => solids.push(s));
  const drive = WS.R.filter(R => !R.rail);
  const at = (R, s, off) => { const f = Math.max(0, Math.min(R.n - 0.001, s / R.L * R.n)), k = f | 0, u = f - k;
    const x = R.X[k] + (R.X[k + 1] - R.X[k]) * u, z = R.Z[k] + (R.Z[k + 1] - R.Z[k]) * u, tx = R.TX[k], tz = R.TZ[k];
    return [x - tz * off, R.lift[k] + (R.lift[k + 1] - R.lift[k]) * u, z + tx * off, tx, tz]; };
  const mk = (geo, mat, n, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };

  // trees: street trees along the sidewalks, groves in the open, forest on the hills
  const spots = [];
  drive.forEach(R => { for (let s = 6; s < R.L; s += R.treeStep ?? 13) for (const side of [-1, 1]) {
    const [x, , z] = at(R, s + side * 3, side * (edge(R) + 1.6)); if (free(x, z, 1.6)) { spots.push([x, z, rnd(0.85, 1.2), 0]); WS.occ.push({ x, z, r: 1.6 }); } } });
  for (let i = 0, n = MOBILE ? 70 : 120, got = 0; got < n && i < 3000; i++) { const x = rnd(-112, 112), z = rnd(-112, 112);
    if (free(x, z, 2.4)) { spots.push([x, z, rnd(0.8, 1.35), 0]); WS.occ.push({ x, z, r: 2.4 }); got++; } }
  for (let i = 0, n = MOBILE ? 160 : 300, got = 0; got < n && i < 4000; i++) { const a = rnd(0, 6.283), r = rnd(124, 230), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (WLD.forestOk && !WLD.forestOk(x, z)) continue; if (roadGap(x, z) < 3 || waterGap(x, z) < 2) continue; spots.push([x, z, rnd(1, 1.6), 1]); got++; }
  const tr = mk(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 7).translate(0, 1.3, 0), wm(0x6b4a33, { roughness: 0.9 }), spots.length);
  const leaves = mk(new THREE.IcosahedronGeometry(1, 2), wm(0xffffff, { roughness: 0.85 }), spots.length * 3);
  const blobs = [[0, 3.6, 0, 1.9], [0.95, 2.9, 0.45, 1.4], [-0.85, 3.0, -0.5, 1.5]];
  spots.forEach(([x, z, s, hill], i) => { const y = hgt(x, z) - 0.1;
    d.rotation.set(0, rnd(0, 6.28), 0); d.scale.setScalar(s); d.position.set(x, y, z); d.updateMatrix(); tr.setMatrixAt(i, d.matrix);
    const c0 = pick(hill ? (st.hillLeaves ?? st.leaves) : st.leaves);
    blobs.forEach(([bx, by, bz, bs], j) => { d.position.set(x + bx * s, y + by * s, z + bz * s); d.scale.setScalar(bs * s * (hill ? 1.25 : 1)); d.updateMatrix();
      leaves.setMatrixAt(i * 3 + j, d.matrix); leaves.setColorAt(i * 3 + j, col.set(c0).multiplyScalar(0.85 + j * 0.1)); }); });

  // street lamps on roads that ask for them
  const lamps = [];
  drive.filter(R => R.lamps).forEach(R => { for (let s = 8, j = 0; s < R.L; s += 19, j++) { const side = j % 2 ? 1 : -1, [x, y, z, tx, tz] = at(R, s, side * (edge(R) - 0.5));
    if (roadGap(x, z, R) > 1 && Math.abs(x) < 125 && Math.abs(z) < 125) lamps.push([x, y + 0.24, z, Math.atan2(-tz * side, tx * side)]); } });
  if (lamps.length) {
    const L = st.lamp ?? "cobra", pole = mk(new THREE.CylinderGeometry(0.08, 0.13, 5.6, 8).translate(0, 2.8, 0), wm(L === "globe" ? 0x2b2b2b : 0x8b9096, { metalness: 0.5, roughness: 0.4 }), lamps.length);
    const headGeo = L === "globe" ? new THREE.SphereGeometry(0.42, 16, 12).translate(0, 5.9, 0) : L === "lolly" ? new THREE.SphereGeometry(0.7, 16, 12).translate(0, 6.1, 0)
      : new RoundedBoxGeometry(0.5, 0.22, 1.4, 1, 0.1).translate(0, 5.6, -1.0);
    const head = mk(headGeo, wm(0xffffff, { emissive: 0xfff2c8, emissiveIntensity: L === "cobra" ? 0.15 : 0.5, roughness: 0.4 }), lamps.length);
    lamps.forEach(([x, y, z, r], i) => { d.position.set(x, y, z); d.rotation.set(0, r, 0); d.scale.setScalar(1); d.updateMatrix(); pole.setMatrixAt(i, d.matrix); head.setMatrixAt(i, d.matrix);
      if (L === "lolly") head.setColorAt(i, col.set(pick(st.shirts))); });
  }
  // wooden power-line poles with sagging wires
  const poles = [], wires = [];
  drive.filter(R => R.poles).forEach(R => { let prev = null; const side = R.poles;
    for (let s = 4; s < R.L; s += 16) { const [x, , z, tx, tz] = at(R, s, side * (edge(R) + 1.0));
      if (roadGap(x, z, R) < 1 || Math.abs(x) > 128 || Math.abs(z) > 128) { prev = null; continue; }
      const nx = -tz, nz = tx, tops = [-1.1, 0, 1.1].map(o => [x + nx * o, 8.25, z + nz * o]); poles.push([x, z, Math.atan2(nx, nz)]);
      if (prev) prev.forEach((a, j) => { const b = tops[j]; for (let q = 0; q < 8; q++) { const f0 = q / 8, f1 = (q + 1) / 8, sg = f => 0.9 * 4 * f * (1 - f);
        wires.push(a[0] + (b[0] - a[0]) * f0, a[1] - sg(f0), a[2] + (b[2] - a[2]) * f0, a[0] + (b[0] - a[0]) * f1, a[1] - sg(f1), a[2] + (b[2] - a[2]) * f1); } });
      prev = tops; } });
  if (poles.length) {
    const pm = mk(new THREE.CylinderGeometry(0.15, 0.2, 9, 8).translate(0, 4.5, 0), wm(0x6b4f35, { roughness: 0.95 }), poles.length);
    const arm = mk(new RoundedBoxGeometry(0.2, 0.2, 2.8, 1, 0.05).translate(0, 8.15, 0), wm(0x5d4430, { roughness: 0.95 }), poles.length);
    poles.forEach(([x, z, r], i) => { d.position.set(x, 0, z); d.rotation.set(0, r, 0); d.scale.setScalar(1); d.updateMatrix(); pm.setMatrixAt(i, d.matrix); arm.setMatrixAt(i, d.matrix); });
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2c2a28 })));
  }

  // cars follow the curves (right-hand traffic); cul-de-sac roads turn round at the end, through roads loop out of town
  const S = st.car, cars = [];
  drive.forEach(R => { const n = Math.round((R.cars || 0) * (MOBILE ? 0.75 : 1)); for (let i = 0; i < n; i++) cars.push({ R, s: rnd(0, R.L), dir: i % 2 ? 1 : -1, v: rnd(6.5, 10.5) }); });
  if (cars.length) {
    const N = cars.length, paint = wm(0xffffff, { roughness: 0.28, metalness: 0.35, envMapIntensity: 1.2 });
    const body = mk(new RoundedBoxGeometry(S.w, S.h, S.l, 2, S.r), paint, N), cab = mk(new RoundedBoxGeometry(S.w * 0.86, S.ch, S.cl, 2, S.cr), GLASS(), N);
    const roof = mk(new RoundedBoxGeometry(S.w * 0.84, 0.14, S.cl * 0.92, 1, 0.06), paint, N);
    const wheel = mk(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14).rotateZ(Math.PI / 2), wm(0x1d1d1f, { roughness: 0.9 }), N * 4);
    const wood = S.wood ? mk(new RoundedBoxGeometry(S.w + 0.06, S.h * 0.45, S.l * 0.78, 1, 0.03), wm(0x8a5a2b, { roughness: 0.8 }), N) : null;
    const bump = S.chrome ? mk(new RoundedBoxGeometry(S.w + 0.1, 0.22, 0.25, 1, 0.08), wm(0xdfe3e6, { metalness: 0.9, roughness: 0.2 }), N * 2) : null;
    cars.forEach((c, i) => { body.setColorAt(i, col.set(st.carCols[i % st.carCols.length])); roof.setColorAt(i, col); });
    const loc = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const P = { body: loc(0, 0.36 + S.h / 2, 0), cab: loc(0, 0.3 + S.h + S.ch / 2, -S.l * 0.06), roof: loc(0, 0.3 + S.h + S.ch - 0.01, -S.l * 0.06),
      w: [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => loc(sx * (S.w / 2 - 0.08), 0.38, sz * S.l * 0.32)), b: [-1, 1].map(s => loc(0, 0.53, s * (S.l / 2 + 0.05))), wood: loc(0, 0.5 + S.h * 0.42, -0.1), none: new THREE.Matrix4().makeScale(0, 0, 0) };
    const m4 = new THREE.Matrix4(), tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const setI = (inst, i, l) => inst.setMatrixAt(i, tmp.multiplyMatrices(m4, l));
    anim.push(dt => {
      cars.forEach((c, i) => {
        const R = c.R; c.s += c.v * c.dir * dt;
        if (R.bulb) { if (c.s > R.L) { c.s = R.L; c.dir = -1; } else if (c.s < 0) { c.s = 0; c.dir = 1; } }
        else c.s = (c.s + R.L) % R.L;
        const [x, y, z, tx, tz] = at(R, c.s, c.dir * R.w / 4);
        pos.set(x, y + 0.08, z); q.setFromAxisAngle(up, Math.atan2(tx * c.dir, tz * c.dir)); m4.compose(pos, q, one);
        setI(body, i, P.body); setI(cab, i, P.cab); setI(roof, i, P.roof); P.w.forEach((w, k) => setI(wheel, i * 4 + k, w)); if (bump) P.b.forEach((b, k) => setI(bump, i * 2 + k, b)); if (wood) setI(wood, i, i % 3 ? P.none : P.wood);
      });
      for (const x of [body, cab, roof, wheel, bump, wood]) if (x) x.instanceMatrix.needsUpdate = true;
    });
  }

  // people stroll the sidewalks (some walk dogs)
  const walkers = drive.filter(R => R.sw > 0), NP = MOBILE ? 46 : 80, people = [];
  if (walkers.length) {
    const torso = mk(new THREE.CapsuleGeometry(0.27, 0.62, 4, 10), wm(0xffffff, { roughness: 0.8 }), NP);
    const head = mk(new THREE.SphereGeometry(0.23, 14, 10), wm(0xffffff, { roughness: 0.6 }), NP);
    const legs = mk(new THREE.CapsuleGeometry(0.11, 0.6, 3, 8).translate(0, -0.4, 0), wm(0xffffff, { roughness: 0.9 }), NP * 2);
    for (let i = 0; i < NP; i++) {
      const R = walkers[i % walkers.length], side = Math.random() < 0.5 ? -1 : 1;
      people.push({ R, s: rnd(0, R.L), off: side * (R.w / 2 + R.sw * rnd(0.3, 0.7)), v: (Math.random() < 0.5 ? -1 : 1) * rnd(0.9, 1.5), ph: rnd(0, 6) });
      torso.setColorAt(i, col.set(st.shirts[i % st.shirts.length])); head.setColorAt(i, col.set(st.skin[i % st.skin.length]));
      for (const j of [0, 1]) legs.setColorAt(i * 2 + j, col.set(st.pants[i % st.pants.length]));
    }
    const dogs = [...Array(MOBILE ? 7 : 12)].map((_, i) => ({ p: people[(i * 5) % NP] }));
    const dbody = mk(new RoundedBoxGeometry(0.32, 0.3, 0.75, 1, 0.12), wm(0xffffff, { roughness: 0.9 }), dogs.length), dhead = mk(new RoundedBoxGeometry(0.26, 0.26, 0.32, 1, 0.1), wm(0xffffff, { roughness: 0.9 }), dogs.length);
    dogs.forEach((o, i) => { col.set([0x8b5a2b, 0xf2efe6, 0x2a2a2a, 0xd2a36c][i % 4]); dbody.setColorAt(i, col); dhead.setColorAt(i, col); });
    anim.push((dt, t) => {
      people.forEach((p, i) => {
        const R = p.R; p.s += p.v * dt; if (p.s > R.L - 1 || p.s < 1) { p.v *= -1; p.s = Math.max(1, Math.min(R.L - 1, p.s)); }
        const [x, y, z, tx, tz] = at(R, p.s, p.off), sv = Math.sign(p.v), h = Math.atan2(tx * sv, tz * sv), bob = Math.abs(Math.sin(t * 7 + p.ph)) * 0.05, yy = y + 0.24;
        p.x = x; p.z = z; p.y = yy; p.h = h;
        d.scale.setScalar(1); d.rotation.set(0, h, 0); d.position.set(x, yy + 1.15 + bob, z); d.updateMatrix(); torso.setMatrixAt(i, d.matrix);
        d.position.y = yy + 1.86 + bob; d.updateMatrix(); head.setMatrixAt(i, d.matrix);
        for (const j of [0, 1]) { d.position.set(x + Math.cos(h) * (j ? 0.12 : -0.12), yy + 0.78, z - Math.sin(h) * (j ? 0.12 : -0.12)); d.rotation.set(Math.sin(t * 7 + p.ph + j * Math.PI) * 0.45, h, 0, "YXZ"); d.updateMatrix(); legs.setMatrixAt(i * 2 + j, d.matrix); }
      });
      dogs.forEach((o, i) => { const p = o.p, sv = Math.sign(p.v); d.rotation.set(0, p.h, 0, "XYZ");
        d.position.set(p.x + Math.sin(p.h) * 1.0 + Math.cos(p.h) * 0.6, p.y + 0.42 + Math.abs(Math.sin(t * 11 + i)) * 0.05, p.z + Math.cos(p.h) * 1.0 - Math.sin(p.h) * 0.6); d.updateMatrix(); dbody.setMatrixAt(i, d.matrix);
        d.position.set(d.position.x + Math.sin(p.h) * 0.45, d.position.y + 0.2, d.position.z + Math.cos(p.h) * 0.45); d.updateMatrix(); dhead.setMatrixAt(i, d.matrix); });
      for (const x of [torso, head, legs, dbody, dhead]) x.instanceMatrix.needsUpdate = true;
    });
  }

  // puffy clouds far out round the horizon, slowly drifting
  const cg = new THREE.Group(), cm = wm(0xffffff, { roughness: 1, emissive: st.cloudGlow ?? 0x8a96a8, emissiveIntensity: 0.35 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + rnd(-0.2, 0.2), r = rnd(250, 340), c = new THREE.Group(); c.position.set(Math.cos(a) * r, rnd(70, 115), Math.sin(a) * r); c.lookAt(0, c.position.y, 0);
    for (let k = 0; k < 6; k++) { const s = rnd(7, 13); const p = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), cm); p.position.set(rnd(-22, 22), rnd(-2, 5) + (k < 3 ? 0 : 5), rnd(-4, 4)); p.scale.y = 0.75; c.add(p); }
    cg.add(c); }
  bake(cg); cg.children.forEach(m => m.castShadow = false); scene.add(cg); anim.push(dt => cg.rotation.y += dt * 0.004);
}
function world3DText(text, opts, place) {  // 3D letters (font loads async; skipped if the city was rebuilt meanwhile)
  const gen = WS.gen;
  new FontLoader().load("https://cdn.jsdelivr.net/npm/three@0.161.0/examples/fonts/helvetiker_bold.typeface.json", font => {
    if (!WS || gen !== WS.gen) return;
    [...text].forEach((ch, i) => { if (ch === " ") return;
      const geo = new TextGeometry(ch, { font, size: opts.size, height: opts.depth, depth: opts.depth, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.25, bevelSegments: 3 });
      geo.computeBoundingBox(); const bb = geo.boundingBox; geo.translate(-(bb.max.x + bb.min.x) / 2, 0, -opts.depth / 2);
      const m = new THREE.Mesh(geo, wm(opts.color ?? 0xffffff, { roughness: 0.45 })); m.castShadow = m.receiveShadow = true; place(m, i, bb); scene.add(m); });
  });
}
function build() {
  M = model(D); VAULT[0] = 0; VAULT[1] = 6; solids.length = 0; WLD = !DEMO && WORLDS[THEME] || null;
  if (WLD) M.B = M.B.filter(b => !b.neonOnly);   // giant screens + bot homes belong to the neon city's layout
  if (WLD) { worldLayout(); worldEnv(); WS.dec = new THREE.Group(); scene.add(WS.dec); worldVault(); }
  else { scene.environment = null; renderer.shadowMap.enabled = false; if (bloom) bloom.enabled = true; filmGrain(false); ground(); vault(); }
  M.B.forEach(building);
  if (WLD) { WLD.decor(); bake(WS.dec); if (WLD.ink) ink(WS.dec, WLD.ink * 0.8); }
  else districts();
  flowBeam(); moneyBeams(); workBeams(); WLD ? worldLife() : life(); staffFigures(); if (!WLD) fadeSetup(); hud();
  if (!WLD) applySkin(SKIN.id);
  window.__lots = () => M.B.map(b => ({ id: b.id, x: +b.pos[0].toFixed(1), z: +b.pos[1].toFixed(1), w: b.w, d: b.d }));
}

const WORLDS = {};
// ---- Springfield: Evergreen Terrace, Main Street + Town Hall square, the river, the Nuclear Power Plant across it ----

const SFP = [0xf6c2c2, 0xbfe0ff, 0xfff1a8, 0xc9f2c7, 0xe3cdf7, 0xffd8a8, 0xf4a97f, 0xa8e0d8];
const SF_ROOF = [0x7a5a48, 0x8a5a44, 0x6d6f73, 0x9c4f3a, 0x5d6b7a];
const SF_CAR = { w: 2.0, h: 0.78, l: 4.4, r: 0.32, ch: 0.62, cl: 2.3, cr: 0.26 };
function lardLad(m, x, z) {  // the giant Lard Lad statue holding his donut
  rbox(m, 2.2, 0.8, 2.2, 0xd8d0c0, x, 0, z, 0.25);
  for (const s of [-1, 1]) cyl(m, 0.38, 0.32, 2.8, 0x3a6fd8, x + s * 0.45, 0.8, z, 16);
  lathe(m, [[0, 0], [1.05, 0], [1.15, 1.1], [1.0, 2.3], [0.55, 2.7], [0, 2.75]], 0xffffff, x, 3.5, z);
  ball(m, 0.85, 0xffd9a8, x, 7.0, z); const hair = ball(m, 0.88, 0x6b3a1a, x, 7.35, z - 0.1); hair.scale.set(1, 0.55, 1);
  const arm = cyl(m, 0.22, 0.22, 2.4, 0xffffff, x + 1.2, 5.6, z, 12); arm.rotation.z = -0.35;
  put(m, new THREE.TorusGeometry(0.8, 0.35, 14, 28), 0xff7eb6, x + 1.75, 8.6, z);
}
function jebediah(m, x, z) {  // Jebediah Springfield statue on its plinth
  rbox(m, 4.2, 0.5, 4.2, 0xc9c1b1, x, 0, z, 0.2); rbox(m, 3.0, 2.6, 3.0, 0xddd5c5, x, 0.5, z, 0.25);
  const br = wm(0x8c6b3e, { metalness: 0.6, roughness: 0.35 });
  for (const s of [-1, 1]) cyl(m, 0.3, 0.26, 2.0, br, x + s * 0.4, 3.1, z, 14);
  lathe(m, [[0, 0], [1.0, 0], [0.95, 1.1], [0.75, 2.3], [0.35, 2.6], [0, 2.6]], br, x, 4.6, z);
  ball(m, 0.52, br, x, 7.7, z); cyl(m, 0.56, 0.6, 0.55, br, x, 7.95, z, 18); cyl(m, 0.13, 0.08, 1.4, br, x, 7.0, z - 0.75, 8).rotation.x = 0.4;
  const arm = cyl(m, 0.17, 0.17, 2.3, br, x + 0.9, 5.9, z, 10); arm.rotation.z = -0.6;
}
function sfHouse(g, i, lot) {
  const r = (i * 7919 + 13) % 97, garage = r % 3 !== 0, w = 8.5 + (r % 3), x = garage ? 2.4 : 0;
  house(g, { w, d: 7.5, st: r % 4 === 0 ? 1 : 2, x, wall: SFP[r % SFP.length], roof: SF_ROOF[r % SF_ROOF.length], door: [0x7a4a2a, 0xd8342b, 0x3f6fb5][r % 3], garage, porch: r % 2 === 0, sh: r % 2 ? 0x5d7f9a : null, dx: x + w * 0.22 });
  if (garage && r % 2) car(g, x - w / 2 - 2.7, 3.75 + 2.6, 0, pick(WLD.style.carCols), SF_CAR);
  return { dx: x + w * 0.22 };
}
function sfShop(g, i) {
  const names = ["KING TOOT'S", "THE LEFTORIUM", "COPY JALOPY", "NOISELAND ARCADE", "SPRINGFIELD TIRE", "PHARMACY", "BARBER", "COFFEE", "SKATEBOARDS", "HOBBY SHOP"];
  const c = [0xf3d9b1, 0x9fd3c7, 0xf6c2c2, 0xc9b3ff, 0xffe08a, 0xb8e08a][i % 6];
  store(g, { w: 9, d: 8, h: 5 + (i % 3), wall: c, trim: 0xfaf6ee, awn: [0x2f6b3a, 0xd8342b, 0x3a7bd5, 0xe0457b][i % 4], sign: names[i % names.length], sbg: "#fff6e0", sfg: "#3a2a1c" });
  return { dx: 0 };
}
WORLDS.springfield = {
  sky: { top: 0x3d97e6, hor: 0xc4e6ff, low: 0xa9d2ee, fog: 0.0011, hemi: [0xe4f3ff, 0x6f9a52, 1.0], sun: [0xfff3da, 2.9], sunPos: [90, 165, 120], grass: 0x6dbb45, hill: 0x4c9a38, exp: 1.0 },
  style: { asphalt: 0x56595f, walk: 0xcfcac0, dash: 0xffd23a, leaves: [0x4caf50, 0x5cbf3a, 0x3f9f45, 0x6cc644], hillLeaves: [0x3d8f3e, 0x4a9c3c, 0x2f7f36],
    skin: [0xffd90f], shirts: [0xffffff, 0xff6b35, 0x3a7bd5, 0x7cc243, 0xd8342b, 0x8e5bd8, 0x2aa8a0, 0xffd23a], pants: [0x3a5fa8, 0x6b4a33, 0x3d3d3d, 0x8a7a5a],
    carCols: [0xf48fb1, 0xff7a45, 0x4f7fd0, 0xd8342b, 0x8bc34a, 0xffe08a, 0xf2f2f2, 0x9575cd], car: SF_CAR, lamp: "cobra" },
  roads: [
    { pts: [[-150, 26], [-110, 22], [-70, 12], [-30, 4], [0, 2], [30, 6], [55, 4], [75, -2], [98, -10], [150, -22]], w: 10, sw: 3, cars: 12, lamps: true },   // Main Street
    { pts: [[-40, 5], [-44, 26], [-58, 46], [-80, 58], [-96, 76], [-98, 92]], w: 8, sw: 2.4, cars: 4, poles: 1, bulb: true },                                    // Evergreen Terrace
    { pts: [[12, 4], [16, 32], [34, 60], [44, 90], [50, 150]], w: 9, cars: 4, poles: -1 },                                                                        // industrial strip
    { pts: [[-72, 12], [-76, -20], [-66, -52], [-80, -84], [-100, -150]], w: 9, cars: 4, poles: 1 },                                                              // school road
    { pts: [[38, 6], [34, -24], [44, -56], [36, -86], [28, -150]], w: 9, cars: 3 }],                                                                              // Burns road
  rivers: [{ pts: [[78, -150], [74, -100], [64, -50], [72, 0], [66, 50], [76, 100], [82, 150]], w: 13 }],
  bumps: [[-10, -152, 30, 75, 22]],
  lots: { lab: [0, -100, 10], zoho: [0, -54, -2], kdp: [0, -40, -4], pinterest: [0, -27, -4], library: [0, 0, -10, 14], contra: [0, 18, -4], github: [0, 54, -4],
    gumroad: [0, -100, 32], etsy: [0, -84, 26], krypto: [0, -60, 20], poly: [0, -22, 14], fb: [0, 33, 18], showroom: [2, 0, 36],
    army: [3, -95, -30, 4], longshot: [3, -55, -35], kalshi: [4, 56, -40], rnd: [4, 20, -60], rose: [1, -70, 64, 4], whdig: [2, 52, 60], whpod: [2, 58, 90] },
  spare: [[2, 20, 100, 0], [3, -60, -100, 0]],
  size: { library: [24, 16], etsy: [12, 9], gumroad: [11, 9], contra: [7, 8], lab: [10, 9], fb: [11, 9], army: [18, 10], longshot: [13, 10], github: [8, 8],
    krypto: [11, 9], kalshi: [13, 10], showroom: [20, 13], zoho: [10, 8], kdp: [8, 8], pinterest: [8, 7], rnd: [10, 9], poly: [9, 9], whdig: [15, 10], whpod: [15, 10], rose: [16, 8.5] },
  vault: { lot: [0, 98, -30, 2], d: 22, r: 14, tag: 24, model(g) {  // Springfield Nuclear Power Plant (money = power)
    rbox(g, 27, 0.14, 22, wm(0xffffff, { map: noiseTex(0xbdb8ad, 0.06, 3) }), 0, 0, 0, 0.05);
    rbox(g, 15, 7, 8, 0xc9ccd1, -2, 0, 6, 0.4); rbox(g, 15.5, 0.5, 8.5, 0x9aa0a6, -2, 6.8, 6, 0.2); wrow(g, 13, 10.05, 5, 3.6, 1.3, 1.4, 0x9aa0a6);
    g.children.slice(-15).forEach(o => o.position.x -= 2);
    sign(g, "SPRINGFIELD NUCLEAR POWER PLANT", 12, 1.15, "#ffffff", "#1f4a8a", -2, 2.4, 10.25);
    cyl(g, 4, 4, 5, 0xd7d9dc, 8, 0, 4); dome(g, 4, 0xd7d9dc, 8, 5, 4);
    const prof = []; for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push([4.6 - 2.1 * Math.sin(t * Math.PI * 0.86), t * 15]); }
    for (const x of [-7, 3]) { lathe(g, prof, wm(0xe1e2e4, { side: THREE.DoubleSide, roughness: 0.8 }), x, 0, -5.5); put(g, new THREE.TorusGeometry(prof[14][0], 0.14, 8, 32).rotateX(Math.PI / 2), 0x9aa0a6, x, 15, -5.5); }
    for (let i = 0; i < 5; i++) cyl(g, 0.75, 0.8, 3.4, i % 2 ? 0xffffff : 0xd8342b, -12, i * 3.4, 3, 16);
    for (let i = 0; i < 3; i++) cyl(g, 0.5, 0.5, 1.1, 0xe8c21a, 4 + i * 1.2, 0, 10.4, 16);
    const puffs = []; for (const x of [-7, 3]) for (let i = 0; i < 6; i++) { const p = dyn(ball(g, 2, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, roughness: 1, depthWrite: false }), x, 16, -5.5)); p.castShadow = false; puffs.push([p, i / 6, x]); }
    anim.push((dt, t) => puffs.forEach(([p, k0, x]) => { const k = (t * 0.12 + k0) % 1; p.position.set(x + k * 4, 15.5 + k * 16, -5.5 - k * 2); p.scale.setScalar(0.8 + k * 2.2); p.material.opacity = 0.85 * (1 - k); }));
  } },
  models: {
    library(m, b) {  // Springfield Town Hall + Jebediah square in front
      const c = 0xf1e6cc; b.noFore = true;
      rbox(m, 22, 9, 12, c, 0, 0, -2, 0.35); rbox(m, 22.6, 0.7, 12.6, 0xe0d2b0, 0, 8.7, -2, 0.25);
      rbox(m, 16, 0.8, 4.6, 0xe7dcc2, 0, 0, 6, 0.2); rbox(m, 14, 0.4, 6, 0xe7dcc2, 0, 0, 6.5, 0.15);
      for (let i = 0; i < 6; i++) cyl(m, 0.45, 0.52, 7.2, 0xffffff, -6.25 + i * 2.5, 0.8, 7.2, 20);
      rbox(m, 16.4, 0.9, 4.8, 0xe0d2b0, 0, 8, 6.1, 0.2); groof(m, 4.6, 16, 2.4, 0xe7dcc2, 8.9, 0, 6.1, 0.3).rotation.y = Math.PI / 2;
      for (const s of [-1, 1]) for (const y of [1.4, 5]) win(m, s * 9.3, y, 4.05, 1.2, 2.2, 0xffffff);
      cyl(m, 4, 4.2, 3, c, 0, 9.4, -2, 32); dome(m, 4.1, wm(0x7cc4b4, { metalness: 0.35, roughness: 0.4 }), 0, 12.4, -2);
      cyl(m, 0.8, 0.8, 1.6, c, 0, 16.2, -2, 16); ball(m, 0.5, wm(0xd4af37, { metalness: 0.8, roughness: 0.3 }), 0, 18.3, -2);
      sign(m, "SPRINGFIELD TOWN HALL", 9.5, 0.75, "#e0d2b0", "#4a3b28", 0, 8.45, 8.55);
      const sq = b.sb, z0 = 8.3;  // the square: paving, Jebediah, flower beds, benches
      rbox(m, 22, 0.16, sq, wm(0xffffff, { map: noiseTex(0xd9d0bf, 0.07, 3) }), 0, 0.02, z0 + sq / 2, 0.06);
      jebediah(m, 0, z0 + sq / 2);
      for (const s of [-1, 1]) { rbox(m, 5, 0.5, 3, 0x7a5a3a, s * 7.5, 0, z0 + sq / 2, 0.2); for (let k = 0; k < 9; k++) ball(m, 0.35, [0xff4f8a, 0xffd23a, 0xffffff][k % 3], s * 7.5 - 1.8 + (k % 3) * 1.8, 0.75, z0 + sq / 2 - 0.9 + (k / 3 | 0) * 0.9);
        rbox(m, 2.2, 0.45, 0.7, 0x7c4a2a, s * 4.2, 0.35, z0 + sq - 2, 0.12); }
      flag(m, -10, z0 + 2, 10); return 18.8;
    },
    etsy(m, b) {  // Kwik-E-Mart
      store(m, { w: 12, d: 9, h: 5.4, wall: 0xe9e3cf, trim: 0x2aa8a0, door: 0x9fd6e6 });
      [0xffc61a, 0xff7a1a, 0xd8342b].forEach((c, i) => rbox(m, 12.5, 0.42, 9.5, c, 0, 3.55 + i * 0.45, 0, 0.18));
      cyl(m, 0.22, 0.26, 8.4, 0x9a9a9a, 4.6, 0, 5.4, 12); sign(m, "KWIK-E-MART", 6.6, 2, "#d8342b", "#ffd21a", 4.6, 9.4, 5.6, { font: 900 });
      rbox(m, 1.8, 1.2, 0.9, 0xffffff, -4.3, 0, 5.1, 0.2); return 10.6;
    },
    gumroad(m, b) {  // Krusty Burger with the burger on a pole
      store(m, { w: 11, d: 9, h: 5, wall: 0xd8342b, trim: 0xffc61a, door: 0xffffff, sign: "KRUSTY BURGER", sbg: "#ffc61a", sfg: "#d8342b", so: { font: 900 } });
      const x = -4.3, z = 5.6; cyl(m, 0.25, 0.3, 7, 0xb0b0b0, x, 0, z, 12);
      lathe(m, [[0, 0], [1.6, 0], [1.75, 0.3], [1.6, 0.6], [0, 0.6]], 0xd99a3c, x, 7, z); cyl(m, 1.85, 1.85, 0.2, 0x5cbf3a, x, 7.6, z, 24);
      cyl(m, 1.72, 1.72, 0.5, 0x5a2e1a, x, 7.8, z, 24); rbox(m, 3.2, 0.12, 3.2, 0xffc61a, x, 8.3, z, 0.05).rotation.y = 0.5;
      lathe(m, [[0, 0], [1.75, 0], [1.75, 0.4], [1.35, 1.1], [0.7, 1.45], [0, 1.5]], 0xd99a3c, x, 8.42, z); return 10.5;
    },
    contra(m) {  // Moe's Tavern
      store(m, { w: 7, d: 8, h: 6, brick: "#6b4a35", trim: 0x3a2a20, door: 0x2a1a12, fw: 3.2, base: 0x3a2a20 });
      sign(m, "MOE'S", 4.2, 1.3, "#2a1a12", "#ff4d6d", 0, 4.4, 4.25, { glow: "#ff2d55" }); sign(m, "DUFF", 1.8, 0.7, "#2a1a12", "#ffd21a", 2.6, 2.8, 4.25, { glow: "#ffcc00" }); return 6.2;
    },
    lab(m, b) {  // Lard Lad Donuts: the giant donut + Lard Lad himself
      const top = store(m, { w: 10, d: 9, h: 5, wall: 0xf7b6c8, trim: 0x8b5a3c, sign: "LARD LAD DONUTS", sbg: "#ffffff", sfg: "#d8342b" });
      const y = top + 2.6; put(m, new THREE.TorusGeometry(2.3, 0.95, 20, 40), 0xd99a3c, 0, y, -1.5); const fr = put(m, new THREE.TorusGeometry(2.3, 0.97, 20, 40, Math.PI * 2), 0xff7eb6, 0, y, -1.3); fr.scale.set(1, 1, 0.75);
      for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; rbox(m, 0.5, 0.15, 0.15, [0xffd90f, 0x2bb3a3, 0xffffff, 0x7d5cff][i % 4], Math.cos(a) * 2.4, y - 0.1 + Math.sin(a) * 2.4, -0.5, 0.05).rotation.z = a * 2; }
      for (const s of [-1, 1]) cyl(m, 0.15, 0.15, 2.4, 0x8b5a3c, s * 1.2, top - 0.6, -1.5, 8);
      lardLad(m, -3.6, 5.4); return y + 3.3;
    },
    fb(m, b) {  // Channel 6 with its red-and-white mast and dish
      const h = store(m, { w: 11, d: 9, h: 9, wall: 0x3f78c8, trim: 0xffffff, sign: "CHANNEL 6", sbg: "#ffffff", sfg: "#d8342b", so: { font: 900 } });
      for (let i = 0; i < 6; i++) cyl(m, 0.5 - i * 0.06, 0.56 - i * 0.06, 3, i % 2 ? 0xffffff : 0xd8342b, 3, 9 + i * 3, -2, 12);
      const dish = put(m, new THREE.SphereGeometry(1.6, 24, 12, 0, Math.PI * 2, 0, 1.0), wm(0xeeeeee, { side: THREE.DoubleSide }), -3, 10.6, -1); dish.rotation.x = -0.9;
      const bl = dyn(ball(m, 0.4, new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff0000, emissiveIntensity: 1 }), 3, 27.3, -2)); anim.push((dt, t) => bl.visible = Math.sin(t * 4) > 0);
      b._by = h; return 27.8;
    },
    army(m, b) {  // Springfield Elementary: brick, bell tower, flag, yellow bus
      const top = store(m, { w: 18, d: 10, h: 8, brick: "#b5523b", trim: 0xf3eee4, door: 0x2a6fb5, sign: "SPRINGFIELD ELEMENTARY", sbg: "#f3eee4", sfg: "#7a2a1a" });
      rbox(m, 3.4, 4.5, 3.4, brick("#b5523b"), 0, 8, -2, 0.2); rbox(m, 1.8, 1.8, 3.5, 0xf3eee4, 0, 9.6, -2, 0.1); hroof(m, 3.4, 3.4, 2.4, 0x5a3a2a, 12.5, 0, -2);
      flag(m, -8, 6.5, 10); bus(m, 5, b.d / 2 + b.sb - 1.8, Math.PI / 2); return Math.max(top, 15);
    },
    longshot(m) {  // Bowlarama: giant pin + ball on the roof
      const h = store(m, { w: 13, d: 10, h: 6, wall: 0x2aa8a0, trim: 0xffffff, sign: "BOWLARAMA", sbg: "#d8342b", sfg: "#ffffff", so: { font: 900 } });
      lathe(m, [[0, 0], [0.9, 0], [1.25, 1.2], [1.1, 2.4], [0.55, 3.4], [0.5, 3.9], [0.75, 4.6], [0.6, 5.3], [0, 5.5]], 0xffffff, 4.3, 6, -1.5);
      put(m, new THREE.TorusGeometry(0.53, 0.1, 8, 24).rotateX(Math.PI / 2), 0xd8342b, 4.3, 9.7, -1.5);
      ball(m, 1.15, wm(0x22305a, { metalness: 0.3, roughness: 0.2 }), -4.3, 7.15, -1.5); return Math.max(h, 11.5);
    },
    github: m => store(m, { w: 8, d: 8, h: 5.5, wall: 0x3d7a56, trim: 0xffd21a, awn: 0xffd21a, sign: "ANDROID'S DUNGEON", sbg: "#ffd21a", sfg: "#1a1a1a" }),
    krypto(m) {  // First Bank of Springfield
      const h = store(m, { w: 11, d: 9, h: 7, wall: 0xe9dfc5, trim: 0xd6c8a4, door: 0x3a2a1a, sign: "BANK OF SPRINGFIELD", sbg: "#1f5a3a", sfg: "#ffd21a" });
      for (let i = 0; i < 4; i++) cyl(m, 0.32, 0.36, 5.8, 0xffffff, -4 + i * 8 / 3, 0.4, 5.3, 16);
      rbox(m, 10, 0.6, 1.4, 0xe9dfc5, 0, 6.2, 5.3, 0.15); return h;
    },
    kalshi(m) {  // Mr Burns' Casino with blinking marquee bulbs
      const h = store(m, { w: 13, d: 10, h: 8, wall: 0x6a3fc8, trim: 0xffc61a, door: 0xffc61a, sign: "MR. BURNS' CASINO", sbg: "#ffc61a", sfg: "#4a1a8a", so: { font: 900 } });
      const A = new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffc94a, emissiveIntensity: 1 }), B = A.clone();
      for (let i = 0; i < 16; i++) ball(m, 0.2, i % 2 ? A : B, -6 + i * 0.8, 3.9, 5.25);
      anim.push((dt, t) => { A.emissiveIntensity = Math.sin(t * 6) > 0 ? 1.2 : 0.1; B.emissiveIntensity = Math.sin(t * 6) > 0 ? 0.1 : 1.2; }); return h;
    },
    showroom(m, b) {  // Springfield Mall
      const h = store(m, { w: 20, d: 13, h: 7, wall: 0xf2d9a6, trim: 0x3a7bd5, awn: 0x3a7bd5, sign: b.short === "SHC" ? "SIDE HUSTLE MALL" : "SPRINGFIELD MALL", sbg: "#3a7bd5", sfg: "#ffffff" });
      rbox(m, 7, 2.4, 6, GLASS(), 0, 7, -1, 1.1); for (const s of [-1, 1]) flag(m, s * 9, 7.2, 4, 0xd8342b); return h;
    },
    zoho(m) { const h = store(m, { w: 10, d: 8, h: 6, wall: 0xf1efe9, trim: 0x2b4c9b, door: 0x2b4c9b, sign: "U.S. POST OFFICE", sbg: "#2b4c9b", sfg: "#ffffff" });
      flag(m, 4.2, 5, 8); rbox(m, 0.9, 1.1, 0.7, 0x2b4c9b, -3.6, 0, 5.1, 0.3); return h; },
    kdp: m => store(m, { w: 8, d: 8, h: 6, brick: "#b5523b", trim: 0xf3eee4, awn: 0x2f6b3a, sign: "BOOKS", sbg: "#2f6b3a", sfg: "#fff6d0" }),
    pinterest(m) { const h = store(m, { w: 8, d: 7, h: 5, wall: 0xffc2d6, trim: 0xffffff, awn: 0xe0457b, sign: "FLOWERS", sbg: "#ffffff", sfg: "#e0457b" });
      for (const s of [-1, 1]) { rbox(m, 2.2, 0.7, 0.9, 0x8b5a3c, s * 2.6, 0, 4.4, 0.15); for (let k = 0; k < 6; k++) ball(m, 0.3, [0xff4f8a, 0xffd23a, 0xffffff, 0xb57bff][k % 4], s * 2.6 - 0.8 + (k % 3) * 0.8, 0.95, 4.2 + (k / 3 | 0) * 0.4); } return h; },
    rnd(m) {  // Professor Frink's lab: observatory dome + antenna
      const h = store(m, { w: 10, d: 9, h: 6, wall: 0xeef1f4, trim: 0x6b7a8a, sign: "FRINK LABS", sbg: "#1a1a1a", sfg: "#3dffa8" });
      cyl(m, 2.6, 2.6, 1.2, 0xbfc5cc, -2, 6, -1.5, 28); dome(m, 2.6, wm(0xd5dae0, { metalness: 0.6, roughness: 0.3 }), -2, 7.2, -1.5);
      cyl(m, 0.08, 0.08, 4, 0x777777, 3, 6, -2, 8); ball(m, 0.45, wm(0x3dffa8, { emissive: 0x3dffa8, emissiveIntensity: 0.6 }), 3, 10.3, -2); return Math.max(h, 10.8);
    },
    poly(m) { const h = store(m, { w: 9, d: 9, h: 10, wall: 0x9fc6d6, trim: 0x2c3e50, sign: "STOCK EXCHANGE", sbg: "#111111", sfg: "#3dffa8" });
      sign(m, "▲ POLY +2.4%  ▲ SPFLD +0.8%", 8.4, 0.6, "#111111", "#3dffa8", 0, 4.3, 4.75, { glow: "#3dffa8" }); return h; },
    whdig: (m, b) => sfWarehouse(m, b, "SPRINGFIELD DIGITAL"),
    whpod: (m, b) => sfWarehouse(m, b, "PRINT & SHIP", true),
    rose(m, b) {  // 742 Evergreen Terrace (Rose lives here)
      b.noFore = true; const x = 2.6;
      const top = house(m, { w: 10, d: 7.5, x, wall: 0xf4a97f, roof: 0x6e5a4e, door: 0xd0603a, garage: true, porch: false, dx: x + 1.4, chimC: 0xb04a3a });
      rbox(m, 4.6, 0.12, b.sb + 0.3, wm(0xffffff, { map: noiseTex(0xc9c2b4, 0.06, 2) }), x - 7.7, 0.02, 3.75 + b.sb / 2, 0.04);
      car(m, x - 7.7, 3.75 + 2.8, 0, 0xf48fb1, SF_CAR); yard(m, 3.75, b.sb, x + 1.4, { fence: 0xffffff });
      sign(m, "742", 1.2, 0.5, "#ffffff", "#3a2a1c", x + 3.2, 2.6, 3.95); return top;
    },
    _: (m, b) => store(m, { w: b.w, d: b.d, h: 6, wall: 0xf3d9b1, trim: 0xffffff, sign: b.short, sbg: "#ffffff", sfg: "#333333" }),
  },
  decor() {
    // Flanders next door to 742
    const rose = M.B.find(b => b.id === "rose");
    if (rose) for (const dk of [12, -12]) { const R = WS.R[1], L = lotAt(R, rose.lot.k + dk, rose.lot.side, 8, 5); if (!free(L.x, L.z, 6)) continue;
      const g = new THREE.Group(); g.position.set(L.x, 0, L.z); g.rotation.y = Math.atan2(L.face[0], L.face[1]); WS.dec.add(g);
      house(g, { w: 10, d: 7.5, wall: 0xcfd9a8, roof: 0x5a6b4a, door: 0x6b4a2a, porch: true, sh: 0x4a6b3a, dx: 1.8 }); yard(g, 3.75, 6.2, 1.8, { fence: 0xffffff });
      WS.occ.push({ x: L.x, z: L.z, r: 6.2 }); WS.solids.push({ x: L.x, z: L.z, r: 5, h: 10 }); break; }
    lineRoad(1, { make: sfHouse, yard: { fence: 0xffffff }, step: 15 });
    lineRoad(3, { make: sfHouse, yard: { fence: 0xffffff }, s0: 30 });
    lineRoad(4, { make: sfHouse, yard: { fence: 0xf3eee4 }, s0: 30 });
    lineRoad(2, { make: sfHouse, yard: { fence: 0xffffff }, s0: 40, sides: [-1] });
    lineRoad(0, { make: sfShop, step: 13, sb: 0, d: 8, r: 5.6, s0: 10 });
    lineRoad(0, { make: sfHouse, yard: { fence: 0xffffff }, step: 17 });
    // SPRINGFIELD in big separate 3D letters on the hill behind Town Hall
    world3DText("SPRINGFIELD", { size: 8.5, depth: 1.4 }, (m, i, bb) => { const x = -58 + i * 10.6, z = -128 + Math.sin(i * 1.3) * 1.5, y = hgt(x, z) - 0.6;
      m.position.set(x, y, z); m.rotation.set(-0.12, Math.sin(i * 2.1) * 0.06, Math.sin(i * 1.7) * 0.05); });
    // the Duff blimp
    const bl = new THREE.Group(); const env = ball(bl, 1, 0xd9dde2); env.scale.set(4, 4, 11);
    for (const s of [-1, 1]) sign(bl, "DUFF", 6, 2.4, "#d8342b", "#ffffff", s * 4.05, 0, 0, { font: 900 }).rotation.y = s * Math.PI / 2;
    bl.children.filter(o => o.geometry?.type === "RoundedBoxGeometry").forEach((o, i) => { o.rotation.y = Math.PI / 2; o.position.x = (i ? 1 : -1) * 3.85; });
    for (const r of [0, Math.PI / 2]) { const f = rbox(bl, 0.3, 4, 3, 0xd8342b, 0, -2, -10, 0.12); f.rotation.z = r; f.position.y = 0; }
    rbox(bl, 1.4, 1, 3, 0x555b62, 0, -4.6, 0, 0.35); bake(bl); bl.children.forEach(o => o.castShadow = false); scene.add(bl);
    anim.push((dt, t) => { const a = t * 0.03; bl.position.set(Math.cos(a) * 95, 62, Math.sin(a) * 70 - 10); bl.rotation.y = -a; });
  },
};
function sfWarehouse(m, b, label, fire) {  // brick warehouse with a barrel roof; the print one has the eternal tire fire out back
  const w = b.w, d = b.d, h = 6.5;
  rbox(m, w, h, d, brick("#9b5a3c"), 0, 0, 0, 0.3);
  put(m, new THREE.CylinderGeometry(d / 2 + 0.3, d / 2 + 0.3, w + 0.4, 28, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wm(0x8d9399, { metalness: 0.55, roughness: 0.45 }), 0, h, 0);
  for (const s of [-1, 1]) rbox(m, 3.4, 4.2, 0.3, 0x7a8288, s * 3.6, 0, d / 2 + 0.05, 0.1);
  rbox(m, w * 0.85, 1.0, 1.8, 0x9a948a, 0, 0, d / 2 + 0.9, 0.12);
  sign(m, label, w * 0.62, 1.2, "#f3eee4", "#4a3b28", 0, h - 0.9, d / 2 + 0.25);
  if (fire) {
    const z = -d / 2 - 2.6;
    for (let i = 0; i < 12; i++) put(m, new THREE.TorusGeometry(0.7, 0.32, 10, 20).rotateX(Math.PI / 2), 0x1e1e1e, -3 + (i % 4) * 1.6, 0.32 + (i / 4 | 0) * 0.55, z + ((i % 2) - 0.5) * 0.6);
    const fl = [0, 1, 2, 3].map(i => dyn(put(m, new THREE.ConeGeometry(0.9 - i * 0.12, 2.8, 10), new THREE.MeshStandardMaterial({ color: [0xff8a1f, 0xffd23a, 0xe33b2e, 0xff6a00][i], emissive: [0xff6a00, 0xffb000, 0xd02000, 0xff4a00][i], emissiveIntensity: 1.2 }), -2.4 + i * 1.6, 2.6, z)));
    const smoke = [...Array(6)].map((_, i) => { const p = dyn(ball(m, 1.3, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, transparent: true, depthWrite: false, roughness: 1 }), 0, 4, z)); p.castShadow = false; return [p, i / 6]; });
    anim.push((dt, t) => { fl.forEach((x, i) => x.scale.y = 0.75 + 0.4 * Math.sin(t * 9 + i * 2));
      smoke.forEach(([p, k0]) => { const k = (t * 0.1 + k0) % 1; p.position.set(Math.sin(k * 5) * 1.5 + k * 3, 4 + k * 20, z - k * 4); p.scale.setScalar(0.8 + k * 3); p.material.opacity = 0.7 * (1 - k); }); });
  }
  return h + d / 2 + 0.3;
}

// ---- Cartoon Network: CN City bumpers style, bendy squash-and-stretch towers, checkerboard everywhere ----
const CNP = [0xff3fa4, 0xffd21a, 0x2fd3ff, 0x8a4dff, 0x7ee03a, 0xff7a1a, 0x22e0b0, 0xff4d4d];
const CN_CAR = { w: 2.1, h: 0.95, l: 3.9, r: 0.45, ch: 0.8, cl: 2.1, cr: 0.38 };
const CN_FONT = { font: 900, fam: "'Arial Black', Sora, Arial, sans-serif" };
function bendy(p, o) {  // squash-and-stretch toon tower: a lathe with a bulging waist and a leaning, domed top
  const { r = 3.5, h = 14, c, lean = 1, bulge = 0.16, sq = 0.92, ph = 0 } = o;
  const R = t => r * (1 + bulge * Math.sin(t * Math.PI * 1.25 + ph) - 0.14 * t), L = t => lean * t * t * r, pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(R(t), t * h)); }
  for (let i = 1; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.01, R(1) * Math.cos(a)), h + R(1) * 0.55 * Math.sin(a))); }
  const geo = new THREE.LatheGeometry(pts, 40), pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const t = Math.min(1, pa.getY(i) / h); pa.setX(i, pa.getX(i) + L(t)); pa.setZ(i, pa.getZ(i) * sq); }
  geo.computeVertexNormals(); put(p, geo, wm(c, { roughness: 0.45 }), o.x || 0, 0, o.z || 0);
  return { R, L, sq, h, top: h + R(1) * 0.55, x: o.x || 0, z: o.z || 0 };
}
function porthole(p, T, t, a) {  // round window on a bendy tower's surface
  const y = t * T.h, rr = T.R(t), x = T.x + T.L(t) + rr * Math.sin(a), z = T.z + rr * Math.cos(a) * T.sq;
  const ring = put(p, new THREE.TorusGeometry(0.62, 0.14, 10, 24), 0xffffff, x, y, z); ring.rotation.y = a;
  const gl = put(p, new THREE.CylinderGeometry(0.58, 0.58, 0.2, 24).rotateX(Math.PI / 2), GLASS(), x, y, z); gl.rotation.y = a;
}
function cnTower(m, b, i, o = {}) {
  const c = o.c ?? CNP[i % CNP.length], c2 = o.c2 ?? CNP[(i + 3) % CNP.length], r = Math.min(b.w, b.d) / 2 - 0.5, h = o.h ?? 10 + (i * 5) % 9;
  const T = bendy(m, { r, h, c, lean: ((i % 3) - 1) * 0.3, bulge: 0.1 + (i % 4) * 0.05, ph: i * 0.7, sq: 0.92 });
  const band = put(m, new THREE.CylinderGeometry(1, 1, 1.1, 40, 1, true), wm(0xffffff, { map: chk(10, 1), roughness: 0.5 }), T.L(0.3), 0.3 * h, 0);
  band.scale.set(T.R(0.3) + 0.05, 1, (T.R(0.3) + 0.05) * T.sq);
  for (let y = 4.6; y < h - 1.2; y += 2.7) for (const a of [-0.55, 0.55]) if (Math.abs(y - 0.3 * h) > 1.2) porthole(m, T, y / h, a);
  const fz = T.R(0.05) * T.sq;
  rbox(m, 1.8, 2.7, 1.2, c2, 0, 0, fz - 0.2, 0.5); rbox(m, 1.2, 2.2, 0.3, GLASS(), 0, 0.1, fz + 0.4, 0.1);
  rbox(m, 3, 0.35, 1.8, c2, 0, 2.9, fz + 0.3, 0.15);
  sign(m, o.sign ?? b.short, Math.min(6.5, b.w * 0.75), 1.4, "#ffffff", css(c), 0, 4.2, fz + 0.8, { ...CN_FONT, bd: css(c2) });
  const tx = T.L(1), ty = T.top;
  switch (i % 4) {
    case 0: ball(m, 1.3, c2, tx, ty + 0.9, 0); break;
    case 1: put(m, new THREE.ConeGeometry(1.6, 3.4, 24), c2, tx, ty + 1.4, 0).rotation.z = -0.25; break;
    case 2: put(m, new THREE.TorusGeometry(1.4, 0.35, 12, 28), c2, tx, ty + 1.8, 0); ball(m, 0.6, 0xffffff, tx, ty + 1.8, 0); break;
    default: cyl(m, 0.12, 0.12, 3.5, 0xffffff, tx, ty - 0.3, 0, 8); ball(m, 0.5, 0xff3fa4, tx, ty + 3.4, 0);
  }
  return ty + 3.6;
}
function cnHouse(g, i) {
  const r = (i * 7919 + 5) % 97, garage = r % 2 === 0, x = garage ? 2.4 : 0;
  house(g, { w: 8.5, d: 7.5, st: r % 3 ? 2 : 1, x, wall: [0xffb3d9, 0xb3ecff, 0xfff27a, 0xc9ffb3, 0xffcc99, 0xd9c2ff][r % 6], roof: [0x7d4bd8, 0xff4d4d, 0x2a8bd8, 0x23b26d][r % 4], r: 0.7, rh: 3.4,
    door: CNP[r % CNP.length], garage, porch: r % 3 === 0, dx: x + 1.8, trim: 0xffffff });
  return { dx: x + 1.8 };
}
WORLDS.cartoon = {
  toon: true, ink: 0.09,
  sky: { top: 0x1fa8ff, hor: 0xb8f0ff, low: 0x9fe0ff, fog: 0.001, hemi: [0xf0fbff, 0x6fd06a, 1.15], sun: [0xffffff, 3.0], sunPos: [70, 170, 100], grass: 0x58d65a, hill: 0x2fb84a, exp: 1.05, filter: "saturate(1.18)" },
  style: { asphalt: 0x3f3b56, walk: "chk", dash: 0xffffff, kerb: 0xffffff, leaves: [0x3fe05a, 0x7ee03a, 0x22c06a, 0xb6f03a], hillLeaves: [0x22b04a, 0x3fd06a],
    skin: [0xffd9b8, 0xf1c27d, 0x8d5524, 0xffe0bd, 0xc68642], shirts: [0xff3fa4, 0x2fd3ff, 0xffd21a, 0x7ee03a, 0x8a4dff, 0xff7a1a, 0xffffff, 0x111111], pants: [0x111111, 0x2a3fa8, 0xffffff, 0x8a4dff],
    carCols: CNP, car: CN_CAR, lamp: "lolly", cloudGlow: 0x9aa8c0 },
  roads: [
    { pts: [[-150, -10], [-105, -28], [-65, -12], [-25, 14], [15, 20], [55, 2], [90, -22], [150, -34]], w: 10, sw: 3, cars: 12, lamps: true },  // Toon Boulevard
    { pts: [[-45, 3], [-52, 30], [-40, 56], [-54, 78]], w: 8, sw: 2.4, cars: 3, bulb: true, lamps: true },                                         // Peach Creek cul-de-sac (Ed's)
    { pts: [[30, 18], [26, -15], [42, -45], [30, -78], [22, -150]], w: 9, cars: 4, lamps: true },                                                   // City Hall Avenue
    { pts: [[60, -2], [68, 35], [88, 62], [98, 95], [105, 150]], w: 7, sw: 1.6, cars: 2, poles: -1 },                                              // road to Nowhere (Courage's farm)
    { pts: [[-72, -12], [-84, -45], [-62, -75], [-78, -105], [-90, -150]], w: 8, cars: 3, lamps: true }],                                          // Lab Lane
  bumps: [[0, -150, 26, 60, 22]],
  lots: { library: [0, -2, -10, 13], fb: [0, -100, -40], kdp: [0, -84, -38], gumroad: [0, -52, -24], contra: [0, -36, -10], lab: [0, 48, -14], krypto: [0, 66, -24], kalshi: [0, 84, -38],
    poly: [0, -100, -10], longshot: [0, -84, -4], github: [0, -66, 4], etsy: [0, -28, 30], pinterest: [0, -10, 34], showroom: [0, 10, 40], zoho: [0, 30, 34], whdig: [0, 44, 22], whpod: [0, 80, 4],
    rose: [1, -40, 86, 2], rnd: [4, -100, -45, 2], army: [4, -60, -50] },
  spare: [[2, 10, -60, 0], [2, 10, -100, 0]],
  size: { library: [24, 16], rnd: [17, 10], rose: [14, 8.5], showroom: [16, 12], whdig: [13, 10], whpod: [14, 10], army: [12, 10] },
  vault: { lot: [2, 70, -45, 3], d: 26, r: 15, tag: 30, model(g) {  // Mojo Jojo's observatory on its dormant volcano
    lathe(g, [[14, 0], [13, 1.5], [10.5, 5], [7.5, 10], [5.2, 13.5], [4.6, 14], [0, 14]], wm(0x7a5a4a, { roughness: 0.95 }), 0, 0, 0, undefined, 48);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + 0.4, s = put(g, new THREE.CylinderGeometry(0.35, 1.1, 11, 10), wm(0xff6a1a, { emissive: 0xff4a00, emissiveIntensity: 0.6 }), Math.sin(a) * 9.5, 7, Math.cos(a) * 9.5); s.lookAt(0, 22, 0); s.rotateX(Math.PI / 2); s.scale.set(1, 1, 0.4); }
    cyl(g, 3.4, 4, 6, 0x6a3fc8, 0, 13.5, 0, 32); put(g, new THREE.TorusGeometry(4.1, 0.4, 12, 40).rotateX(Math.PI / 2), 0xffffff, 0, 14, 0);
    dome(g, 4.6, wm(0xf4f1ff, { roughness: 0.35 }), 0, 19.4, 0); cyl(g, 4.8, 4.8, 0.5, 0x6a3fc8, 0, 19.2, 0, 40);
    const tel = cyl(g, 0.7, 0.9, 5, 0xbfc5cc, 1.6, 21, 1.6, 16); tel.rotation.x = 0.7; tel.rotation.z = -0.5;
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; porthole(g, { h: 6, R: () => 3.75, L: () => 0, sq: 1, x: 0, z: 0 }, 0.5 + 15.5 / 6, a); }
    g.children.slice(-16).forEach(o => o.position.y += 0); sign(g, "MOJO JOJO", 6, 1.3, "#6a3fc8", "#7ee03a", 0, 3.6, 13.2, CN_FONT);
  } },
  models: {
    library(m, b) {  // Townsville City Hall with a checkerboard plaza
      b.noFore = true;
      rbox(m, 22, 8.5, 11, 0xf4f1ff, 0, 0, -2, 0.9); rbox(m, 22.6, 0.8, 11.6, 0x2fd3ff, 0, 8.2, -2, 0.35);
      for (let i = 0; i < 6; i++) cyl(m, 0.5, 0.6, 7, 0xffffff, -6.25 + i * 2.5, 0.6, 5, 20);
      rbox(m, 16, 0.6, 4, 0xe6e3f5, 0, 0, 4.6, 0.25); rbox(m, 16.6, 0.9, 3, 0x2fd3ff, 0, 7.6, 4.8, 0.3);
      for (const s of [-1, 1]) for (const y of [1.4, 4.8]) win(m, s * 9, y, 3.55, 1.3, 2, 0xffffff);
      cyl(m, 3.6, 3.8, 7, 0xf4f1ff, 0, 8.6, -2, 40); put(m, new THREE.TorusGeometry(3.75, 0.3, 10, 40).rotateX(Math.PI / 2), 0xff3fa4, 0, 12, -2);
      lathe(m, [[3.9, 0], [4.3, 1.4], [3.7, 3.4], [2.2, 5.2], [0.8, 6.3], [0.2, 7]], wm(0x2fd3ff, { roughness: 0.35, metalness: 0.2 }), 0, 15.5, -2);
      cyl(m, 0.12, 0.12, 3, 0xffffff, 0, 22.4, -2, 8); ball(m, 0.45, 0xffd21a, 0, 25.6, -2);
      sign(m, "TOWNSVILLE CITY HALL", 10, 0.9, "#ffffff", "#ff3fa4", 0, 8.05, 6.4, CN_FONT);
      rbox(m, 24, 0.16, b.sb, wm(0xffffff, { map: chk(12, Math.max(2, Math.round(b.sb / 2))) }), 0, 0.02, 6.5 + b.sb / 2, 0.06);
      cyl(m, 2.2, 2.6, 0.8, 0xffffff, 0, 0, 6.5 + b.sb / 2, 32); ball(m, 1, 0xff3fa4, 0, 1.6, 6.5 + b.sb / 2); return 26;
    },
    rnd(m) {  // Dexter's house with the secret lab dome behind
      house(m, { w: 9, d: 7.5, x: -3.6, wall: 0xf2efe6, roof: 0x4a6fa5, r: 0.6, door: 0xff7a1a, dx: -2.4 });
      dome(m, 4.4, wm(0xb9c4d6, { metalness: 0.7, roughness: 0.25 }), 4.4, 0, -0.5);
      put(m, new THREE.TorusGeometry(4.45, 0.22, 10, 48).rotateX(Math.PI / 2), wm(0x2fd3ff, { emissive: 0x2fd3ff, emissiveIntensity: 0.8 }), 4.4, 0.9, -0.5);
      cyl(m, 0.1, 0.1, 3.5, 0xdddddd, 4.4, 4.2, -0.5, 8); const dish = put(m, new THREE.SphereGeometry(1.1, 20, 10, 0, 6.28, 0, 1.1), wm(0xffffff, { side: THREE.DoubleSide }), 4.4, 8, -0.5); dish.rotation.x = -0.7;
      sign(m, "DEXTER'S LAB", 4.2, 0.9, "#2fd3ff", "#ffffff", 4.4, 2.4, 3.95, CN_FONT); return 9.5;
    },
    rose(m, b) { b.noFore = true; const t = cnHouse(m, 3); yard(m, 3.75, b.sb, t.dx, { fence: 0xffffff, box: 0xff3fa4 }); sign(m, "ROSE", 1.6, 0.6, "#ff3fa4", "#ffffff", 2.4 + 3, 2.6, 3.95, CN_FONT); return 10; },
    etsy(m) {  // the candy store with a giant striped jawbreaker
      const h = store(m, { w: 11, d: 9, h: 5.5, wall: 0xff7ac8, trim: 0xffffff, awn: 0x2fd3ff, sign: "CANDY STORE", sbg: "#ffffff", sfg: "#ff3fa4", r: 1.2, so: CN_FONT });
      const jt = ctex("jaw", 256, 128, g => { ["#ff3fa4", "#ffd21a", "#2fd3ff", "#7ee03a", "#8a4dff", "#ff7a1a", "#ffffff", "#ff4d4d"].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 32, 0, 32, 128); }); });
      put(m, new THREE.SphereGeometry(2.4, 40, 24), wm(0xffffff, { map: jt, roughness: 0.25 }), 0, h + 2.6, -1); return h + 5;
    },
    army(m, b) { return cnTower(m, b, 5, { h: 11, sign: "AI ARMY" }); },
    showroom(m, b) { const h = cnTower(m, { ...b, w: 11, d: 11 }, 2, { h: 14, sign: b.short });
      bendy(m, { r: 2.4, h: 8, c: 0xffd21a, lean: -0.4, x: -6, z: -1 }); bendy(m, { r: 2.2, h: 10, c: 0xff3fa4, lean: 0.4, x: 6, z: -1.5 }); return h; },
    whdig: m => cnWarehouse(m, 0x2fd3ff, "DIGITAL"),
    whpod: m => cnWarehouse(m, 0xff7a1a, "PRINT"),
    _: (m, b) => cnTower(m, b, M.B.indexOf(b)),
  },
  decor() {
    lineRoad(1, { make: cnHouse, yard: { fence: 0xffffff, box: 0xff3fa4 }, step: 14 });
    const R1 = WS.R[1];  // houses round Ed's cul-de-sac
    if (R1.bulbAt) { const [cx, cz, rr] = R1.bulbAt; for (let a = -1.2; a <= 1.25; a += 0.8) { const dir = Math.atan2(R1.TX[R1.n], R1.TZ[R1.n]) + a, o = rr + R1.sw + 10;
      const x = cx + Math.sin(dir) * o, z = cz + Math.cos(dir) * o; if (!free(x, z, 6)) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = dir + Math.PI; WS.dec.add(g); const t = cnHouse(g, Math.round(a * 10 + 40)); yard(g, 3.75, 5.5, t.dx, { fence: 0xffffff, box: 0x2fd3ff });
      WS.occ.push({ x, z, r: 6.2 }); WS.solids.push({ x, z, r: 5, h: 10 }); } }
    lineRoad(4, { make: cnHouse, yard: { fence: 0xffffff }, s0: 20 });
    lineRoad(2, { make: (g, i) => (cnTower(g, { w: 9, d: 9, short: ["TOONS", "PIZZA", "ARCADE", "COMICS"][i % 4] }, i + 2, { h: 9 + (i % 3) * 3 }), { dx: 0 }), step: 14, sb: 0, d: 9, r: 5.5, s0: 30 });
    lineRoad(0, { make: (g, i) => (cnTower(g, { w: 8, d: 8, short: ["TOONS", "SODA", "ARCADE", "PIZZA", "TOYS", "BURGERS"][i % 6] }, i, { h: 8 + (i % 4) * 2.5 }), { dx: 0 }), step: 13, sb: 0, d: 8, r: 5.2, s0: 6 });
    // Courage's farmhouse + windmill, alone in Nowhere at the end of the farm road
    const R3 = WS.R[3], L = lotAt(R3, Math.round(R3.n * 0.62), -1, 10, 6);
    if (free(L.x, L.z, 7)) { const g = new THREE.Group(); g.position.set(L.x, 0, L.z); g.rotation.y = Math.atan2(L.face[0], L.face[1]); WS.dec.add(g);
      rbox(g, 22, 0.08, 20, 0xd9c08a, 0, 0, -2, 0.04);
      house(g, { w: 8, d: 7, wall: 0xf3d1d8, roof: 0x5a5a6a, door: 0x7a4a2a, porch: true, dx: 1.5, chimC: 0x8a5a4a });
      const mill = new THREE.Group(); mill.position.set(-8, 0, -4); g.add(mill); cyl(mill, 0.5, 1.3, 11, 0x8a8a8a, 0, 0, 0, 6);
      const rot = dyn(new THREE.Group()); rot.position.set(0, 11, 0.9); mill.add(rot);
      for (let i = 0; i < 8; i++) { const bl = rbox(rot, 0.5, 3.4, 0.08, 0xdddddd, 0, 0, 0, 0.04); bl.geometry.translate(0, 1.7, 0); bl.position.set(0, 0, 0); bl.rotation.z = i / 8 * 6.28; }
      anim.push(dt => rot.rotation.z += dt * 1.6);
      WS.occ.push({ x: L.x, z: L.z, r: 11 }); WS.solids.push({ x: L.x, z: L.z, r: 6, h: 10 }); }
    // the CN logo standing on the hill: big black-and-white letter blocks
    world3DText("CN", { size: 16, depth: 3 }, (m, i) => { const x = -10 + i * 22, z = -130, y = hgt(x, z) + 2; m.position.set(x, y, z + 1.8); m.material = wm(i ? 0x111111 : 0xffffff, { roughness: 0.4 });
      const blk = new THREE.Mesh(new RoundedBoxGeometry(21, 21, 3, 3, 1.2), wm(i ? 0xffffff : 0x111111, { roughness: 0.4 })); blk.position.set(x, y + 8, z); blk.castShadow = true; scene.add(blk); });
  },
};
function cnWarehouse(m, c, label) {  // bubbly squashed warehouse with a checker roof stripe
  rbox(m, 13, 6, 10, c, 0, 0, 0, 2.2); rbox(m, 13.2, 0.9, 10.2, wm(0xffffff, { map: chk(14, 1) }), 0, 4.2, 0, 0.45);
  for (const s of [-1, 1]) rbox(m, 3, 3.8, 0.6, 0xffffff, s * 3.4, 0, 4.9, 0.4);
  sign(m, label, 6, 1.4, "#ffffff", css(c), 0, 7.2, 4.4, CN_FONT); return 8.5;
}

// ---- 1970s small town (Sunflower, pop. 1975): Main Street, courthouse clock, diner, gas station, drive-in, railroad ----
const S7 = { mustard: 0xd9a531, orange: 0xc8622a, avocado: 0x7c8a3a, brown: 0x6b4423, cream: 0xf1e3c4, gold: 0xe1a82f, teal: 0x3a8a86, rust: 0xa0432a, tan: 0xd8b98a };
const S7_CAR = { w: 2.15, h: 0.8, l: 5.3, r: 0.14, ch: 0.62, cl: 2.9, cr: 0.12, chrome: true, wood: true };
const S7_FONT = { font: 900, fam: "Georgia, 'Times New Roman', serif" };
const S7_RETRO = { font: 900, fam: "'Arial Black', Sora, Arial, sans-serif" };
function wagon(p, x, z, ry, color) { return car(p, x, z, ry, color, S7_CAR); }
function s7House(g, i) {  // single-storey ranch house, low roof, carport with a wood-panel station wagon
  const r = (i * 7919 + 29) % 97, w = 11 + (r % 3), x = 1.8;
  house(g, { w, d: 7.5, st: 1, x, rh: 1.9, wall: [S7.tan, S7.cream, 0xe8c99a, 0xc9b48a, 0xd9c7a0, 0xb8a27a][r % 6], roof: [S7.brown, 0x5a4a3a, 0x7a5a3a, 0x4a3a2a][r % 4],
    door: [S7.orange, S7.avocado, S7.mustard, S7.brown][r % 4], sh: [S7.brown, S7.avocado, 0x4a3a2a][r % 3], chimC: 0x8a5a44, dx: x + w * 0.2, base: 0x8a7a66 });
  const cx = x - w / 2 - 2.6; rbox(g, 4.6, 0.18, 6.4, S7.brown, cx, 2.8, 0.4, 0.08); for (const s of [-1, 1]) cyl(g, 0.1, 0.1, 2.8, 0xeeeeee, cx + s * 2.0, 0, 3.3, 8);
  if (r % 3) wagon(g, cx, 1.2, 0, [S7.mustard, S7.orange, S7.avocado, 0xeadfc8, 0x8ab4c8, S7.rust][r % 6]);
  return { dx: x + w * 0.2 };
}
function s7Shop(g, i) {
  const names = ["SODA FOUNTAIN", "BARBER", "RECORDS", "LAUNDROMAT", "SHOES", "TAVERN", "PIZZA", "DRUGSTORE", "PAWN", "TAILOR"];
  store(g, { w: 9, d: 8, h: 5.5 + (i % 3), brick: ["#a0522d", "#b5653b", "#8a4a2a"][i % 3], trim: S7.cream, awn: [S7.orange, S7.avocado, S7.mustard, S7.brown][i % 4],
    sign: names[i % names.length], sbg: ["#f1e3c4", "#3a2a1c", "#e1a82f"][i % 3], sfg: ["#7a2a1a", "#f1c45a", "#3a2a1c"][i % 3], so: S7_FONT });
  return { dx: 0 };
}
function poleSign(m, x, z, h, text, w, sh, bg, fg, o) {  // tall roadside pole sign
  cyl(m, 0.2, 0.25, h, 0x9a9a9a, x, 0, z, 10); return sign(m, text, w, sh, bg, fg, x, h + sh / 2, z + 0.2, o);
}
function bulbs(m, n, x0, x1, y, z, A) { for (let i = 0; i < n; i++) dyn(ball(m, 0.16, i % 2 ? A[0] : A[1], x0 + (x1 - x0) * i / (n - 1), y, z)); }
function blinkPair() {
  const A = new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffc94a, emissiveIntensity: 1 }), B = A.clone();
  anim.push((dt, t) => { const on = Math.sin(t * 5) > 0; A.emissiveIntensity = on ? 1.3 : 0.1; B.emissiveIntensity = on ? 0.1 : 1.3; }); return [A, B];
}
WORLDS.seventies = {
  sky: { top: 0x6fa3c9, hor: 0xf3d3a0, low: 0xe8c08a, fog: 0.0019, hemi: [0xffe6c0, 0x7a6a3a, 1.05], sun: [0xffd9a0, 2.6], sunPos: [-110, 120, 90], grass: 0x9aa64a, hill: 0x7c8a3a, exp: 1.02,
    filter: "sepia(0.28) saturate(1.2) contrast(1.06) brightness(1.02)" },
  grain: true,
  style: { asphalt: 0x4a4744, walk: 0xcbbfa8, dash: 0xe1a82f, kerb: 0xd2c6ae, leaves: [0x7c8a3a, 0x8a9a3a, 0x6b7a2a, 0xa0a03a, 0xc8862a], hillLeaves: [0x6b7a2a, 0x5a6a2a, 0x8a7a2a],
    skin: [0xffd9b8, 0xf1c27d, 0x8d5524, 0xe0ac69, 0xc68642], shirts: [S7.orange, S7.mustard, S7.avocado, S7.brown, 0xeadfc8, S7.teal, S7.rust, 0x8ab4c8], pants: [0x3a4a6a, S7.brown, 0x6b5a3a, 0x2a2a2a, 0xa08a5a],
    carCols: [S7.mustard, S7.orange, S7.avocado, 0xeadfc8, S7.brown, 0x8ab4c8, S7.rust, 0x2e5a3a], car: S7_CAR, lamp: "globe", cloudGlow: 0xc8a080 },
  roads: [
    { pts: [[-150, 4], [-90, 2], [0, 0], [90, -2], [150, -4]], w: 11, sw: 3.2, cars: 12, lamps: true },                         // 0 Main Street
    { pts: [[-30, 1], [-32, -40], [-26, -80], [-34, -150]], w: 8, sw: 2.2, cars: 3, poles: 1 },                                   // 1 Elm Street (north)
    { pts: [[90, -2], [96, 30], [108, 60], [150, 82]], w: 10, sw: 0, cars: 5, poles: -1 },                                         // 2 Route 66 out to the drive-in
    { pts: [[-46, 2], [-48, 40], [-62, 72], [-70, 150]], w: 8, sw: 2.2, cars: 3, poles: 1 },                                       // 3 Oak Street (south)
    { pts: [[48, -1], [52, -40], [62, -80], [70, -150]], w: 9, sw: 2.2, cars: 3, lamps: true },                                   // 4 Station Road
    { pts: [[-150, -96], [0, -102], [150, -110]], rail: true, w: 4, sw: 0 }],                                                     // 5 the railroad
  bumps: [[-40, -150, 26, 60, 22]],
  lots: { fb: [0, -104, -10], pinterest: [0, -90, -4], kdp: [0, -78, -4], github: [0, -65, -4], lab: [0, -51, -4], library: [0, 0, -10, 14], krypto: [0, 21, -4], kalshi: [0, 35, -4],
    army: [0, 68, -4], longshot: [0, 86, -4], gumroad: [0, -104, 10, 3], contra: [0, -90, 10], zoho: [0, -78, 10], etsy: [0, -63, 10], poly: [0, -28, 10, 1], showroom: [0, -4, 10, 8], rnd: [0, 22, 10, 7],
    rose: [3, -54, 50, 4], whdig: [4, 62, -66, 1], whpod: [4, 44, -78, 1] },
  spare: [[3, -40, 90, 2], [1, -20, -60, 2]],
  size: { library: [22, 14], fb: [10, 8], pinterest: [8, 7], kdp: [9, 8], github: [10, 8], lab: [10, 8], krypto: [11, 9], kalshi: [11, 9], army: [14, 11], longshot: [16, 11],
    gumroad: [13, 8], contra: [8, 8], zoho: [10, 8], etsy: [12, 9], poly: [13, 10], showroom: [20, 11], rnd: [13, 9], rose: [16, 8.5], whdig: [15, 10], whpod: [14, 10] },
  vault: { lot: [0, 52, 10, 2], d: 11, r: 10, tag: 18, model(g) {  // Sunflower Savings & Loan with the giant round vault door on the facade
    rbox(g, 17, 0.14, 13, wm(0xffffff, { map: noiseTex(0xcbbfa8, 0.06, 3) }), 0, 0, 1, 0.05);
    rbox(g, 15, 7, 10, 0xe9dcc0, 0, 0, -0.5, 0.3); rbox(g, 15.6, 0.8, 10.6, 0xc9b48a, 0, 6.8, -0.5, 0.25); rbox(g, 15.4, 0.5, 10.4, 0x8a7a66, 0, 0, -0.5, 0.12);
    const gold = wm(0xc9a24a, { metalness: 0.85, roughness: 0.3 });
    put(g, new THREE.CylinderGeometry(2.6, 2.6, 0.5, 40).rotateX(Math.PI / 2), 0x7a7470, 0, 3.4, 4.6);
    put(g, new THREE.CylinderGeometry(2.3, 2.3, 0.5, 40).rotateX(Math.PI / 2), gold, 0, 3.4, 4.85);
    for (let i = 0; i < 3; i++) rbox(g, 3.2, 0.25, 0.25, gold, 0, 3.27, 5.25, 0.08).rotation.z = i * Math.PI / 3;
    cyl(g, 0.45, 0.45, 0.4, 0x7a7470, 0, 3.0, 5.2, 16).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) win(g, s * 5.2, 1.4, 4.55, 2.2, 3, 0xc9b48a);
    sign(g, "SUNFLOWER SAVINGS & LOAN", 12, 1.1, "#3a2a1c", "#e1a82f", 0, 6.1, 4.8, S7_FONT);
    poleSign(g, -7.6, 5.5, 8, "$ TIME 7:45 · 72°F $", 5, 1.6, "#e1a82f", "#3a2a1c", S7_RETRO);
  } },
  models: {
    library(m, b) {  // county courthouse with the clock tower = Public Library
      b.noFore = true; const br = brick("#9b4a2a");
      rbox(m, 22, 9, 11, br, 0, 0, -2, 0.3); rbox(m, 22.6, 0.7, 11.6, S7.cream, 0, 8.8, -2, 0.25); rbox(m, 22.4, 0.5, 11.4, 0x8a7a66, 0, 0, -2, 0.12);
      rbox(m, 12, 0.6, 3.2, S7.cream, 0, 0, 5.2, 0.15); for (let i = 0; i < 4; i++) cyl(m, 0.42, 0.48, 7.2, 0xffffff, -4.5 + i * 3, 0.6, 5.6, 18);
      rbox(m, 12.6, 0.9, 3.4, S7.cream, 0, 7.8, 5.3, 0.2); groof(m, 3.4, 12.4, 2.0, S7.cream, 8.7, 0, 5.3, 0.3).rotation.y = Math.PI / 2;
      for (const s of [-1, 1]) for (const x of [6.5, 9.3]) for (const y of [1.4, 5]) win(m, s * x, y, 3.55, 1.1, 2.1, S7.cream);
      rbox(m, 5.4, 8, 5.4, br, 0, 9.3, -2, 0.2); rbox(m, 5.8, 0.6, 5.8, S7.cream, 0, 17.2, -2, 0.2);
      for (const [a, x, z] of [[0, 0, 0.75], [Math.PI / 2, 2.75, -2], [-Math.PI / 2, -2.75, -2]]) {
        const f = put(m, new THREE.CylinderGeometry(1.8, 1.8, 0.22, 36).rotateX(Math.PI / 2), 0xf6f0de, x, 14, z); f.rotation.y = a;
        const r1 = rbox(m, 0.16, 1.3, 0.1, 0x1a1a1a, x, 13.95, z, 0.04); r1.rotation.y = a; r1.position.x += Math.sin(a) * 0.15; r1.position.z += Math.cos(a) * 0.15;
        const r2 = rbox(m, 0.16, 0.9, 0.1, 0x1a1a1a, x, 13.95, z, 0.04); r2.rotation.set(0, a, 1.6, "YXZ"); r2.position.x += Math.sin(a) * 0.15; r2.position.z += Math.cos(a) * 0.15; }
      hroof(m, 5.4, 5.4, 3.2, 0x3a5a4a, 17.8, 0, -2); cyl(m, 0.08, 0.08, 2, 0x555555, 0, 21, -2, 8); ball(m, 0.3, gold7(), 0, 23.1, -2);
      sign(m, "PUBLIC LIBRARY", 8.5, 0.75, "#f1e3c4", "#5a2a1a", 0, 8.35, 7.05, S7_FONT);
      const sq = b.sb, z0 = 7.4;  // courthouse lawn: flag, cannon-free bandstand, benches
      rbox(m, 22, 0.12, sq, wm(0xffffff, { map: noiseTex(0x8a9a3a, 0.08, 3) }), 0, 0.02, z0 + sq / 2, 0.06);
      rbox(m, 3, 0.14, sq, wm(0xffffff, { map: noiseTex(0xcbbfa8, 0.06, 2) }), 0, 0.05, z0 + sq / 2, 0.05);
      cyl(m, 3, 3, 0.6, S7.cream, 7, 0, z0 + sq / 2, 8); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; cyl(m, 0.1, 0.1, 2.6, 0xffffff, 7 + Math.cos(a) * 2.7, 0.6, z0 + sq / 2 + Math.sin(a) * 2.7, 6); }
      put(m, new THREE.ConeGeometry(3.3, 1.6, 8), S7.rust, 7, 4.0, z0 + sq / 2);
      flag(m, -7, z0 + sq / 2, 10); for (const s of [-1, 1]) rbox(m, 2.2, 0.45, 0.7, S7.brown, s * 3.5, 0.35, z0 + sq - 1.5, 0.12);
      return 23.5;
    },
    etsy: m => store(m, { w: 12, d: 9, h: 6.5, brick: "#b5653b", trim: S7.cream, awn: S7.orange, sign: "FIVE & DIME", sbg: "#b8322a", sfg: "#ffe9b0", so: S7_FONT }),
    gumroad(m, b) {  // stainless-steel streamline diner + EAT pole sign
      b.noFore = true; const steel = wm(0xd8dde2, { metalness: 0.75, roughness: 0.25 });
      rbox(m, 13, 0.6, 8, 0x8a7a66, 0, 0, 0, 0.15); rbox(m, 12, 4, 7, steel, 0, 0.5, 0, 1.4);
      rbox(m, 12.1, 0.5, 7.1, 0xc8322a, 0, 1.4, 0, 0.25); rbox(m, 12.1, 0.25, 7.1, 0xc8322a, 0, 3.6, 0, 0.12);
      for (let i = 0; i < 7; i++) win(m, -5 + i * 1.65, 1.95, 3.52, 1.25, 1.4, 0xd8dde2);
      rbox(m, 1.4, 2.6, 1.6, steel, 0, 0.5, 3.9, 0.3); sign(m, "DINER", 6, 1.5, "#c8322a", "#fff6d0", 0, 5.3, 2.5, { font: 900, fam: "'Brush Script MT', 'Comic Sans MS', cursive", glow: "#ff6040" });
      rbox(m, 14, 0.1, b.sb + 1, wm(0xffffff, { map: noiseTex(0x5a5652, 0.07, 2) }), 0, 0.02, 4 + b.sb / 2, 0.04);
      const s = poleSign(m, 7.2, 4.5, 7, "EAT", 2.6, 1.4, "#e1a82f", "#c8322a", { ...S7_RETRO, glow: "#ffb040" });
      put(m, new THREE.ConeGeometry(0.7, 1.4, 3).rotateZ(-Math.PI / 2), 0xc8322a, 8.9, 7.1, 4.7);
      return 9;
    },
    kdp: m => store(m, { w: 9, d: 8, h: 6, wall: S7.gold, trim: S7.brown, awn: S7.avocado, sign: "PAPERBACK BOOKS", sbg: "#6b4423", sfg: "#f1e3c4", so: S7_FONT }),
    contra(m) {  // photo studio with a giant camera on the roof
      const h = store(m, { w: 8, d: 8, h: 5.5, wall: S7.teal, trim: S7.cream, awn: S7.mustard, sign: "PHOTO STUDIO", sbg: "#f1e3c4", sfg: "#3a8a86", so: S7_FONT });
      rbox(m, 4, 2.4, 2.2, 0x2a2a2a, 0, h + 0.1, -1.5, 0.3); rbox(m, 4.05, 0.7, 2.25, 0xb8b8b8, 0, h + 1.8, -1.5, 0.15);
      cyl(m, 0.8, 0.8, 1.2, 0x1a1a1a, 0, h + 1.3, -0.1, 24).rotation.x = Math.PI / 2; put(m, new THREE.CylinderGeometry(0.55, 0.55, 0.1, 24).rotateX(Math.PI / 2), GLASS(), 0, h + 1.3, 0.55);
      return h + 3;
    },
    zoho(m) { const h = store(m, { w: 10, d: 8, h: 6, brick: "#a0522d", trim: S7.cream, door: 0x2b4c9b, sign: "U.S. POST OFFICE", sbg: "#f1e3c4", sfg: "#2b4c9b", so: S7_FONT });
      flag(m, 4.4, 5, 8); rbox(m, 0.9, 1.1, 0.7, 0x2b4c9b, -3.6, 0, 5.1, 0.3); return h; },
    lab(m) {  // TV & radio repair with a giant wood-cabinet TV on the roof
      const h = store(m, { w: 10, d: 8, h: 5.5, wall: S7.avocado, trim: S7.cream, awn: S7.orange, sign: "TV & RADIO REPAIR", sbg: "#f1e3c4", sfg: "#6b4423", so: S7_FONT });
      rbox(m, 5, 3.8, 2.6, 0x7a4a2a, 0, h + 0.1, -1, 0.35); rbox(m, 3.4, 2.6, 0.2, wm(0x8ac8b8, { emissive: 0x4aa898, emissiveIntensity: 0.5, roughness: 0.2 }), -0.5, h + 0.7, 0.32, 0.4);
      for (const s of [0, 1]) ball(m, 0.22, 0xd9a531, 1.85, h + 2.6 - s * 0.9, 0.35);
      for (const s of [-1, 1]) { const a = cyl(m, 0.05, 0.05, 2.6, 0xcccccc, s * 0.6, h + 3.9, -1, 6); a.rotation.z = -s * 0.5; }
      return h + 6;
    },
    krypto(m) {  // First National Bank: stone, columns, pediment
      const h = store(m, { w: 11, d: 9, h: 7, wall: 0xe9dcc0, trim: 0xc9b48a, door: 0x3a2a1a, sign: "FIRST NATIONAL BANK", sbg: "#2e5a3a", sfg: "#e1a82f", so: S7_FONT });
      for (let i = 0; i < 4; i++) cyl(m, 0.32, 0.36, 5.8, 0xffffff, -4 + i * 8 / 3, 0.4, 5.3, 16);
      rbox(m, 10, 0.6, 1.4, 0xe9dcc0, 0, 6.2, 5.3, 0.15); return h;
    },
    kalshi(m) {  // pool hall with a giant 8-ball
      const h = store(m, { w: 11, d: 9, h: 6, brick: "#6b4423", trim: S7.mustard, door: 0x2e5a3a, fw: 5, sign: "POOL HALL", sbg: "#2e5a3a", sfg: "#f1e3c4", so: { ...S7_RETRO, glow: "#a0ffa0" } });
      ball(m, 2, wm(0x111111, { roughness: 0.15, metalness: 0.2 }), 0, h + 3.6, -1.5); put(m, new THREE.CircleGeometry(0.9, 24), 0xffffff, 0, h + 3.8, 0.42).rotation.x = -0.1;
      sign(m, "8", 0.9, 0.9, "none", "#111111", 0, h + 3.8, 0.47, S7_RETRO); return h + 6;
    },
    poly(m, b) {  // grain exchange + concrete grain elevator
      const h = store(m, { w: 7, d: 8, h: 5, wall: S7.cream, trim: S7.brown, sign: "GRAIN EXCHANGE", sbg: "#6b4423", sfg: "#e1a82f", so: S7_FONT, dx: 0 });
      for (const [x, z] of [[4.6, -1.8], [4.6, 1.8], [8, -1.8], [8, 1.8]]) { cyl(m, 1.7, 1.7, 16, 0xd9d2c4, x - 4.2, 0, z - 1.2, 24); dome(m, 1.7, 0xc9c2b4, x - 4.2, 16, z - 1.2); }
      rbox(m, 5, 4, 3, S7.rust, 2.3, 16, -1.2, 0.2); sign(m, "SUNFLOWER CO-OP", 4.6, 1, "#f1e3c4", "#a0432a", 2.3, 18.4, 0.35, S7_FONT); return 21;
    },
    longshot(m) {  // bowling alley with a Googie star sign
      const h = store(m, { w: 16, d: 11, h: 6, wall: S7.teal, trim: S7.cream, sign: "LUCKY STRIKE LANES", sbg: "#c8622a", sfg: "#fff6d0", so: S7_RETRO });
      lathe(m, [[0, 0], [0.9, 0], [1.25, 1.2], [1.1, 2.4], [0.55, 3.4], [0.5, 3.9], [0.75, 4.6], [0.6, 5.3], [0, 5.5]], 0xffffff, 5, 6, -2);
      put(m, new THREE.TorusGeometry(0.53, 0.1, 8, 24).rotateX(Math.PI / 2), 0xc8322a, 5, 9.7, -2);
      cyl(m, 0.25, 0.3, 11, 0x9a9a9a, -9, 0, 4.5, 10); const st = put(m, new THREE.OctahedronGeometry(1.4, 0), wm(S7.mustard, { emissive: 0xffa020, emissiveIntensity: 0.5 }), -9, 12, 4.5); st.scale.set(1, 1, 0.3);
      for (let i = 0; i < 4; i++) { const sp = rbox(m, 0.15, 3.2, 0.15, S7.mustard, -9, 10.4, 4.5, 0.05); sp.rotation.z = i * Math.PI / 4; sp.position.y = 12 - 1.6 + 1.6; }
      return Math.max(h, 13);
    },
    pinterest(m) { const h = store(m, { w: 8, d: 7, h: 5, wall: 0xe8b8a0, trim: S7.cream, awn: S7.orange, sign: "FLOWERS", sbg: "#f1e3c4", sfg: "#c8622a", so: S7_FONT });
      for (const s of [-1, 1]) { rbox(m, 2.2, 0.7, 0.9, S7.brown, s * 2.6, 0, 4.4, 0.15); for (let k = 0; k < 6; k++) ball(m, 0.3, [S7.orange, S7.mustard, 0xffffff, 0xc8322a][k % 4], s * 2.6 - 0.8 + (k % 3) * 0.8, 0.95, 4.2 + (k / 3 | 0) * 0.4); } return h; },
    github: m => store(m, { w: 10, d: 8, h: 6, brick: "#8a4a2a", trim: S7.cream, awn: S7.avocado, sign: "HARDWARE", sbg: "#c8322a", sfg: "#ffffff", so: S7_RETRO }),
    rnd(m, b) {  // full-service gas station: office + 2 bays, canopy over the pumps, round pole sign
      b.noFore = true;
      rbox(m, 15, 0.12, b.sb + 9, wm(0xffffff, { map: noiseTex(0x8a8580, 0.07, 3) }), 0, 0.02, b.sb / 2, 0.04);
      rbox(m, 5, 4.5, 8, 0xf6f2ea, -4.5, 0, -0.5, 0.25); win(m, -4.5, 1.2, 3.55, 3, 2, S7.orange);
      rbox(m, 7, 4.5, 8, 0xf6f2ea, 1.5, 0, -0.5, 0.25); for (const x of [0, 3]) rbox(m, 2.6, 3.4, 0.2, 0xd8d4cc, x, 0, 3.55, 0.08);
      rbox(m, 12.4, 0.8, 8.4, S7.orange, -1.5, 4.4, -0.5, 0.25); sign(m, "SERVICE", 6, 0.7, "#c8622a", "#ffffff", 1.5, 4.8, 3.75, S7_RETRO);
      const cz = 3.5 + b.sb / 2 + 0.6; rbox(m, 10, 0.6, 4.5, 0xf6f2ea, 0, 4.6, cz, 0.2); rbox(m, 10.1, 0.35, 4.6, S7.orange, 0, 4.7, cz, 0.12);
      for (const s of [-1, 1]) { cyl(m, 0.2, 0.2, 4.6, 0xeeeeee, s * 4, 0, cz, 10); rbox(m, 4, 0.3, 1.2, 0xd8d4cc, s * 1.8, 0, cz, 0.1);
        for (const k of [-1, 1]) { rbox(m, 0.8, 1.7, 0.6, k > 0 ? 0xc8322a : S7.mustard, s * 1.8 + k * 1.1, 0.3, cz, 0.15); ball(m, 0.3, wm(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }), s * 1.8 + k * 1.1, 2.3, cz); } }
      cyl(m, 0.25, 0.3, 9, 0x9a9a9a, 6.5, 0, cz + 1, 10);
      put(m, new THREE.CylinderGeometry(1.9, 1.9, 0.4, 36).rotateX(Math.PI / 2), S7.orange, 6.5, 10.2, cz + 1); sign(m, "GAS", 2.4, 1.1, "none", "#ffffff", 6.5, 10.2, cz + 1.25, S7_RETRO);
      return 11;
    },
    army(m) {  // the Strand picture house: marquee with chasing bulbs + vertical blade sign
      const h = store(m, { w: 14, d: 11, h: 10, brick: "#9b4a2a", trim: S7.cream, fw: 6, door: 0x8a1a1a });
      rbox(m, 11, 1.8, 2.8, S7.cream, 0, 4.2, 6.6, 0.2); sign(m, "NOW SHOWING · AI ARMY", 10, 1.2, "#fff6d0", "#8a1a1a", 0, 5.1, 8.05, S7_RETRO);
      const A = blinkPair(); bulbs(m, 18, -5.3, 5.3, 6.15, 8.05, A); bulbs(m, 18, -5.3, 5.3, 4.05, 8.05, A);
      rbox(m, 0.6, 7, 2.4, 0xc8322a, 0, 6.5, 6.4, 0.2);
      for (const s of [-1, 1]) { const t = sign(m, "STRAND", 6.4, 1.8, "none", "#ffe9a0", s * 0.32, 10, 6.4, { ...S7_RETRO, glow: "#ffcc60" }); t.rotation.set(0, s * Math.PI / 2, Math.PI / 2 * s); }
      return 13.6;
    },
    fb(m) {  // AM radio station with a lattice-look red/white mast
      const h = store(m, { w: 10, d: 8, h: 5.5, brick: "#b5653b", trim: S7.cream, sign: "K-SUN 1050 AM", sbg: "#e1a82f", sfg: "#6b4423", so: S7_RETRO });
      for (let i = 0; i < 8; i++) cyl(m, 0.42 - i * 0.04, 0.46 - i * 0.04, 3, i % 2 ? 0xffffff : 0xc8322a, 3, h + i * 3, -2, 6);
      const bl = dyn(ball(m, 0.4, new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff0000, emissiveIntensity: 1 }), 3, h + 24.4, -2)); anim.push((dt, t) => bl.visible = Math.sin(t * 4) > 0);
      return h + 25;
    },
    showroom(m, b) {  // used-car lot: glass showroom, pennant strings, rows of cars out front
      b.noFore = true;
      rbox(m, 20, 0.12, b.sb + 11, wm(0xffffff, { map: noiseTex(0x6a6662, 0.07, 3) }), 0, 0.02, b.sb / 2, 0.04);
      rbox(m, 12, 5, 7, GLASS(), -3, 0, -1.5, 0.2); rbox(m, 12.6, 0.9, 7.6, S7.mustard, -3, 4.9, -1.5, 0.2);
      sign(m, b.short === "SHC" ? "SIDE HUSTLE MOTORS" : "BIG DEAL USED CARS", 11, 1.4, "#e1a82f", "#8a1a1a", -3, 6.8, 2.1, S7_RETRO);
      const C = [S7.mustard, S7.orange, S7.avocado, 0xeadfc8, S7.brown, 0x8ab4c8, S7.rust, 0x2e5a3a];
      for (let i = 0; i < 6; i++) wagon(m, -7.5 + i * 3, 5.2 + (i % 2) * 0.3, Math.PI, C[i]); for (let i = 0; i < 3; i++) wagon(m, 5 + i * 3, -0.5, 0, C[i + 5]);
      const pen = []; for (const [x0, x1] of [[-9.5, 9.5]]) for (let i = 0; i <= 24; i++) { const f = i / 24; pen.push([x0 + (x1 - x0) * f, 4.6 - 1.1 * 4 * f * (1 - f), 9]); }
      for (const s of [-9.5, 9.5]) cyl(m, 0.1, 0.1, 4.8, 0xdddddd, s, 0, 9, 8);
      pen.forEach(([x, y, z], i) => { if (i % 2) put(m, new THREE.ConeGeometry(0.28, 0.7, 3), [0xc8322a, 0xffffff, 0x2b4c9b, S7.mustard][i % 4], x, y - 0.4, z).rotation.x = Math.PI; });
      return 8.5;
    },
    whdig: (m, b) => s7Shed(m, b, "FREIGHT DEPOT", "#6b4423", "#f1e3c4"),
    whpod: (m, b) => s7Shed(m, b, "THE DAILY GAZETTE", "#f1e3c4", "#1a1a1a", true),
    rose(m, b) {  // Rose's ranch house with the wood-panel wagon in the carport
      b.noFore = true; const t = s7House(m, 1); yard(m, 3.75, b.sb, t.dx, { fence: 0x8a6a4a, box: S7.orange });
      sign(m, "ROSE", 1.4, 0.5, "#f1e3c4", "#c8622a", 4.2, 2.3, 3.95, S7_FONT); return 7;
    },
    _: (m, b) => store(m, { w: b.w, d: b.d, h: 6, brick: "#a0522d", trim: S7.cream, sign: b.short, sbg: "#f1e3c4", sfg: "#6b4423", so: S7_FONT }),
  },
  decor() {
    lineRoad(1, { make: s7House, yard: { fence: 0x8a6a4a }, step: 17, s0: 14 });
    lineRoad(3, { make: s7House, yard: { fence: 0x8a6a4a }, step: 17, s0: 14 });
    lineRoad(4, { make: s7House, yard: { fence: 0x8a6a4a }, s0: 50, step: 18 });
    lineRoad(0, { make: s7Shop, step: 12, sb: 0, d: 8, r: 5.3, s0: 20, s1: 20 });
    lineRoad(0, { make: s7House, yard: { fence: 0x8a6a4a }, step: 18 });
    lineRoad(2, { make: s7House, yard: { fence: 0x8a6a4a }, step: 22, s0: 20, sides: [-1] });
    const spot = (x, z, r, f) => { for (let i = 0; i < 40; i++) { const a = i * 2.4, d = i * 2.2, X = x + Math.cos(a) * d, Z = z + Math.sin(a) * d;
      if (free(X, Z, r)) { const g = new THREE.Group(); g.position.set(X, 0, Z); WS.dec.add(g); f(g); WS.occ.push({ x: X, z: Z, r }); WS.solids.push({ x: X, z: Z, r: r * 0.7, h: 20 }); return g; } } };
    // water tower: SUNFLOWER on the tank
    spot(-88, -40, 6, g => { for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283 + 0.785, l = cyl(g, 0.25, 0.3, 16, 0x9a9a9a, Math.cos(a) * 3, 0, Math.sin(a) * 3, 8); l.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08); }
      cyl(g, 4.5, 4.5, 5, 0xd8d4cc, 0, 16, 0, 32); put(g, new THREE.ConeGeometry(4.8, 2.4, 32), 0xb8b4ac, 0, 22.2, 0); ball(g, 0.3, 0x9a9a9a, 0, 23.5, 0);
      const t = sign(g, "SUNFLOWER", 7, 1.6, "none", "#a0432a", 0, 18.5, 4.55, S7_RETRO); g.rotation.y = 0.5; });
    // church with a white steeple
    spot(-80, 35, 8, g => { g.rotation.y = Math.PI / 2; rbox(g, 8, 6, 13, 0xf6f2ea, 0, 0, 0, 0.2); groof(g, 13, 8, 3.6, 0x4a3a2a, 6, 0, 0, 0.5).rotation.y = Math.PI / 2;
      rbox(g, 3, 9, 3, 0xf6f2ea, 0, 0, 6.5, 0.15); put(g, new THREE.ConeGeometry(2, 7, 4).rotateY(Math.PI / 4), 0x4a3a2a, 0, 12.5, 6.5); rbox(g, 1.4, 2.6, 0.2, 0x7a2a1a, 0, 0, 8.05, 0.08);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) win(g, s * 4.05, 1.6, -3 + k * 3, 1, 2.6, 0xffffff); });
    // railroad depot beside the tracks
    spot(30, -90, 7, g => { rbox(g, 14, 4, 6, S7.mustard, 0, 0, 0, 0.2); hroof(g, 14, 6, 2.2, S7.brown, 4); rbox(g, 18, 0.5, 9, 0xb8b0a0, 0, 0, 0.5, 0.1);
      sign(g, "SUNFLOWER", 6, 0.9, "#f1e3c4", "#6b4423", 0, 3.4, 3.1, S7_FONT); wrow(g, 12, 3, 4, 1.2, 1.1, 1.6, S7.brown); });
    // the drive-in theater out on Route 66
    const R2 = WS.R[2], L = lotAt(R2, Math.round(R2.n * 0.42), 1, 30, 4);
    { const g = new THREE.Group(); g.position.set(L.x, 0, L.z); g.rotation.y = Math.atan2(L.face[0], L.face[1]); WS.dec.add(g);
      rbox(g, 34, 0.1, 30, wm(0xffffff, { map: noiseTex(0x7a7068, 0.08, 3) }), 0, 0.03, 0, 0.04);
      for (const s of [-1, 1]) cyl(g, 0.4, 0.4, 12, 0x6b5a4a, s * 9, 0, -13, 8);
      rbox(g, 20, 10, 0.6, 0x6b5a4a, 0, 3, -13.4, 0.1); const scr = put(g, new THREE.PlaneGeometry(18.6, 8.6), wm(0xfff6e0, { emissive: 0xfff0d0, emissiveIntensity: 0.25 }), 0, 8, -13.0); scr.castShadow = false;
      sign(g, "STARLITE DRIVE-IN", 9, 1.3, "#c8622a", "#fff6d0", 0, 14, -13.0, { ...S7_RETRO, glow: "#ffb040" });
      const C = WLD.style.carCols; for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) if ((r * 6 + k) % 4) wagon(g, -10 + k * 4, -4 + r * 6, Math.PI, C[(r * 6 + k) % C.length]);
      rbox(g, 4, 3, 3, S7.cream, 0, 0, 12, 0.2); sign(g, "SNACKS", 3, 0.7, "#c8322a", "#ffffff", 0, 3.6, 13.6, S7_RETRO);
      WS.occ.push({ x: L.x, z: L.z, r: 20 }); WS.solids.push({ x: L.x, z: L.z, r: 14, h: 14 }); }
    // welcome billboard at the west entrance
    spot(-112, 14, 4, g => { g.rotation.y = Math.PI / 2; for (const s of [-1, 1]) cyl(g, 0.2, 0.2, 5, S7.brown, s * 3, 0, 0, 8);
      sign(g, "WELCOME TO SUNFLOWER · POP. 1975", 9, 2.6, "#e1a82f", "#6b4423", 0, 5.6, 0.2, S7_FONT); });
    filmGrain(true);
  },
};
function gold7() { return wm(0xd4af37, { metalness: 0.8, roughness: 0.3 }); }
function s7Shed(m, b, label, bg, fg, press) {  // brick freight shed with loading dock (or the newspaper press hall)
  const w = b.w, d = b.d, h = press ? 7.5 : 6;
  rbox(m, w, h, d, brick(press ? "#9b4a2a" : "#8a5a3a"), 0, 0, 0, 0.3);
  if (press) { rbox(m, w + 0.4, 0.6, d + 0.4, S7.cream, 0, h - 0.3, 0, 0.2); wrow(m, w * 0.8, d / 2, 5, 3.6, 1.1, 2.4, S7.cream); for (let i = 0; i < 2; i++) cyl(m, 0.5, 0.6, 5, 0x6b5a4a, -4 + i * 2, h, -2, 12); }
  else { groof(m, w, d, 2.4, 0x6a6a6a, h); for (const s of [-1, 1]) rbox(m, 3.4, 4.2, 0.3, 0x7a5a3a, s * 3.6, 0, d / 2 + 0.05, 0.1); rbox(m, w * 0.85, 1.1, 2, 0x9a948a, 0, 0, d / 2 + 1, 0.12); }
  sign(m, label, Math.min(w * 0.75, 11), 1.3, bg, fg, 0, h + (press ? 1.2 : -1.1), d / 2 + (press ? -0.4 : 0.25), S7_FONT);
  return h + (press ? 5 : 2.6);
}
function filmGrain(on) {  // warm film grain over the canvas (1970s only)
  let el = document.getElementById("grain");
  if (!on) { el?.remove(); return; }
  if (el) return;
  const cv = document.createElement("canvas"); cv.width = cv.height = 160; const g = cv.getContext("2d"), im = g.createImageData(160, 160);
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = v; im.data[i + 1] = v * 0.92; im.data[i + 2] = v * 0.8; im.data[i + 3] = 34; }
  g.putImageData(im, 0, 0);
  el = document.createElement("div"); el.id = "grain";
  Object.assign(el.style, { position: "fixed", inset: "-20px", pointerEvents: "none", zIndex: 4, backgroundImage: `url(${cv.toDataURL()})`, mixBlendMode: "overlay",
    boxShadow: "inset 0 0 160px 40px rgba(60,30,0,0.35)", animation: "grain7 0.5s steps(4) infinite" });
  if (!document.getElementById("grain7css")) { const st = document.createElement("style"); st.id = "grain7css";
    st.textContent = "@keyframes grain7{0%{transform:translate(0,0)}25%{transform:translate(-9px,6px)}50%{transform:translate(7px,-8px)}75%{transform:translate(-5px,-4px)}100%{transform:translate(0,0)}}"; document.head.append(st); }
  document.body.append(el);
}

function themePicker() {
  const el = $("#skins");
  el.innerHTML = `<h4>🎨 City look</h4><p>Rebuilds the whole city as a different town: new streets, new buildings, same live numbers. Saved on this device.</p>
    <div class="g">${THEMES.map(k => `<button class="sk${k.id === THEME ? " on" : ""}" data-th="${k.id}"><div class="sw" style="background:linear-gradient(120deg,${k.swatch.join(",")})"></div>
      <span class="nm">${esc(k.name)}</span></button>`).join("")}</div>`;
  el.querySelectorAll("[data-th]").forEach(b => b.onclick = () => { THEME = b.dataset.th; set("city-theme", THEME); el.hidden = true; reload(); });
  if (THEME !== "neon") return;  // colour skins (owner wants them back, 2026-10-08) re-tint the classic neon city
  el.insertAdjacentHTML("beforeend", `<h4>🌈 Colour skins</h4><div class="g">${SKINS.map(k => `<button class="sk${k.id === SKIN.id ? " on" : ""}" data-sk="${k.id}"><div class="sw" style="background:linear-gradient(120deg,${k.swatch.join(",")})"></div>
      <span class="nm">${esc(k.name)}</span></button>`).join("")}</div>`);
  el.querySelectorAll("[data-sk]").forEach(b => b.onclick = () => { set("city-skin", b.dataset.sk); applySkin(b.dataset.sk); });
}

// ---------- City skins ----------
// A skin is plain data (sky, fog, lights, bloom, weather and a colour recipe for every neon/material colour), so new
// ones can be sold as small JSON files. Applying one re-tints the built scene; the originals are kept so you can switch back.
// Colour recipe: hue (0-1) pulls every colour toward that hue by hueMix, hue2 sends half the colours (by original hue) there
// instead, sat/light scale saturation/lightness, gray mixes toward grey.
const SKINS = [
  { id: "neon", name: "Neon Night", price: 0, swatch: ["#0a0420", "#ff2bd6", "#00f0ff"],
    bg: 0x0a0420, fog: 0x1a0b3a, fogD: 0.0021, hemi: [0x9c7bff, 0x10052a, 0.9], sun: [0xc9b8ff, 0.8], bloom: 0.6, exposure: 1.05, weather: { kind: "rain" } },
  { id: "golden", name: "Golden Hour", price: 1, swatch: ["#ff8a3d", "#ffd166", "#7a2e5a"],
    bg: 0xf08a4b, fog: 0xf2a65a, fogD: 0.0009, hemi: [0xffd6a0, 0x5a2a3a, 1.25], sun: [0xffb36b, 1.6], bloom: 0.35, exposure: 1.1,
    tint: { hue: 0.07, hueMix: 0.45, sat: 1.05, light: 1.05 }, weather: { kind: "none" } },
  { id: "arctic", name: "Arctic Snow", price: 1, swatch: ["#cfe6ff", "#ffffff", "#5fb8ff"],
    bg: 0xbcd6f2, fog: 0xd8e8fa, fogD: 0.001, hemi: [0xffffff, 0x8aa6c8, 1.5], sun: [0xffffff, 1.2], bloom: 0.25, exposure: 1.0,
    tint: { hue: 0.57, hueMix: 0.6, sat: 0.55, light: 1.25 }, ground: { asphalt: 0xe9f1fa, grass: 0xf4f8ff }, weather: { kind: "snow", color: 0xffffff, speed: 0.12, len: 0.25, opacity: 0.9 } },
  { id: "matrix", name: "Matrix", price: 1, swatch: ["#000000", "#22ff66", "#0a3d1a"],
    bg: 0x000300, fog: 0x001a06, fogD: 0.0024, hemi: [0x3dff7a, 0x000000, 0.7], sun: [0x7dffa0, 0.5], bloom: 0.85, exposure: 1.0,
    tint: { hue: 0.36, hueMix: 1, sat: 1.1 }, ground: { asphalt: 0x000000, grass: 0x031a08 }, weather: { kind: "rain", color: 0x22ff66, speed: 0.6, len: 2.2, opacity: 0.55 } },
  { id: "vapor", name: "Vaporwave", price: 1, swatch: ["#2b1055", "#ff71ce", "#01cdfe"],
    bg: 0x2b1055, fog: 0x7a2c8f, fogD: 0.0013, hemi: [0xff71ce, 0x01cdfe, 1.0], sun: [0xfffb96, 0.9], bloom: 0.7, exposure: 1.1,
    tint: { hue: 0.88, hue2: 0.52, hueMix: 0.85, sat: 1.15, light: 1.08 }, ground: { asphalt: 0x1a0638, grass: 0x3a1a6a }, weather: { kind: "none" } },
  { id: "day", name: "Sunny Day", price: 1, swatch: ["#7cc8ff", "#ffffff", "#4caf50"],
    bg: 0x8fd0ff, fog: 0xbfe4ff, fogD: 0.00055, hemi: [0xffffff, 0x6b8f5a, 1.6], sun: [0xfff3d6, 2.0], bloom: 0.12, exposure: 1.0,
    tint: { sat: 0.85, light: 1.1 }, ground: { asphalt: 0x3a3f4a, grass: 0x4caf50 }, weather: { kind: "none" } },
];
const OWNED = window.CITY_SKINS_OWNED || null;  // kit buyers: list of unlocked skin ids (null = all, as in our own city and the demo preview)
let SKIN = SKINS.find(k => k.id === get("city-skin")) || SKINS[0];
const tmpC = new THREE.Color(), hsl = {};
function tintColor(c, t) {
  if (!t) return c;
  c.getHSL(hsl); let h = hsl.h;
  const target = t.hue2 != null && Math.abs(((h - t.hue2 + 1.5) % 1) - 0.5) < Math.abs(((h - t.hue + 1.5) % 1) - 0.5) ? t.hue2 : t.hue;
  if (target != null) { let d = ((target - h + 1.5) % 1) - 0.5; h = (h + d * (t.hueMix ?? 1) + 1) % 1; }
  c.setHSL(h, Math.min(1, hsl.s * (t.sat ?? 1)), Math.min(1, hsl.l * (t.light ?? 1)));
  if (t.gray) c.lerp(tmpC.setScalar(c.getHSL(hsl).l), t.gray);
  return c;
}
function applySkin(id) {
  SKIN = SKINS.find(k => k.id === id) || SKINS[0];
  const k = SKIN, base = SKINS[0];
  scene.background = new THREE.Color(k.bg); scene.fog.color.set(k.fog); scene.fog.density = k.fogD;
  renderer.toneMappingExposure = k.exposure; if (bloom) bloom.strength = k.bloom;
  const seen = new Set();
  scene.traverse(o => {
    if (o.isHemisphereLight) { o.color.set(k.hemi[0]); o.groundColor.set(k.hemi[1]); o.intensity = k.hemi[2]; }
    if (o.isDirectionalLight) { o.color.set(k.sun[0]); o.intensity = k.sun[1]; }
    if (o.userData.weather) {
      const w = k.weather || {}; o.visible = w.kind !== "none";
      o.material.color.set(w.color ?? 0x9fb6ff); o.material.opacity = w.opacity ?? 0.28; return;
    }
    if (o.isInstancedMesh && o.instanceColor) {
      const ic = o.instanceColor; if (!o.userData.ic0) o.userData.ic0 = ic.array.slice();
      for (let i = 0; i < o.count; i++) { tmpC.fromArray(o.userData.ic0, i * 3); tintColor(tmpC, k.tint).toArray(ic.array, i * 3); }
      ic.needsUpdate = true;
    }
    for (const m of [].concat(o.material || [])) {
      if (seen.has(m)) continue; seen.add(m);
      const u = m.userData;
      if (m.color) { u.c0 ??= m.color.getHex(); m.color.setHex(u.c0); }
      if (m.emissive) { u.e0 ??= m.emissive.getHex(); m.emissive.setHex(u.e0); }
      const g = k.ground || {};
      if (m.isLineBasicMaterial && k.edges != null) { m.color.set(k.edges); continue; }  // cartoon ink outlines
      if (u.c0 === 0x0b0716 && g.asphalt != null) { m.color.set(g.asphalt); continue; }
      if (u.c0 === 0x1d6b3c && g.grass != null) { m.color.set(g.grass); if (m.emissive) m.emissive.set(g.grass).multiplyScalar(0.15); continue; }
      if (m.map && m.color && m.color.getHex() === 0xffffff) continue;  // textured screens/billboards keep their own colours
      if (m.color) tintColor(m.color, k.tint);
      if (m.emissive && m.emissive.getHex() !== 0xffffff) tintColor(m.emissive, k.tint);
    }
  });
  renderer.domElement.style.filter = k.filter || ""; document.body.dataset.skin = k.id;
  set("city-skin", SKIN.id);
  if (!$("#skins").hidden) (DEMO ? skinPicker() : themePicker());
}
function skinPicker() {
  const el = $("#skins"), own = id => !OWNED || OWNED.includes(id) || id === "neon";
  el.innerHTML = `<h4>🎨 City skins</h4><p>${DEMO ? "Preview every skin free. Extra skins are $1 each." : OWNED ? "Locked skins are $1 each on the Side Hustle City page." : "Tap a skin to switch the whole city."}</p>
    <div class="g">${SKINS.map(k => `<button class="sk${k.id === SKIN.id ? " on" : ""}" data-sk="${k.id}"><div class="sw" style="background:linear-gradient(120deg,${k.swatch.join(",")})"></div>
      <span class="nm">${esc(k.name)}<i>${k.price ? (own(k.id) ? (DEMO ? "$1" : "") : "🔒 $1") : "free"}</i></span></button>`).join("")}</div>`;
  el.querySelectorAll("[data-sk]").forEach(b => b.onclick = () => own(b.dataset.sk) ? applySkin(b.dataset.sk)
    : window.CITY_SKIN_SHOP ? window.open(window.CITY_SKIN_SHOP, "_blank") : alert("This skin is $1 on the Side Hustle City page (link in your order email). Then add its id to skins.js."));
}


// 🌐 website visitors (owner 2026-10-10): anonymous visits to every public page, the owner's own devices excluded
function openSite() {
  const v = M.s.site || {}, k = (t, x) => `<div class="kv"><b>${num((x || {}).visitors || 0)}</b><span>${t} · ${num((x || {}).views || 0)} views</span></div>`;
  const mx = Math.max(1, ...(v.daily || []).map(d => d[1]));
  const bars = (v.daily || []).map(([d, n]) => `<div title="${d}: ${n}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px"><div style="width:70%;height:${Math.round(70 * n / mx)}px;min-height:2px;border-radius:4px;background:var(--c)"></div><small style="font-size:9px;color:var(--dim)">${d.slice(3)}</small></div>`).join("");
  const sheet = $("#sheet"); sheet.style.setProperty("--c", "#22d3ee");
  $("#sheetbody").innerHTML = `<h2>🌐 Website visitors</h2><div class="sub">People (not us) on any page of sonneblomdigitaal.co.za, from any link · counting since ${esc(v.since || "today")} · updated ${esc(v.ts || "–")}</div>
    <div class="grid">${k("today", v.today)}${k("last 7 days", v.d7)}${k("last 30 days", v.d30)}${k("all time", v.all)}</div>
    <div class="lt" style="margin-top:14px">Visitors per day (14 days)</div><div style="display:flex;gap:2px;height:96px;align-items:flex-end;margin:6px 0 4px">${bars}</div>
    <div class="lt" style="margin-top:14px">Where they came from (7 days)</div><div class="list">${(v.sources || []).map(([n, c]) => `<div><span>${esc(n)}</span><span>${num(c)}</span></div>`).join("") || "<div><span>No visits yet</span><span></span></div>"}</div>
    <div class="lt" style="margin-top:14px">Most viewed pages (7 days)</div><div class="list">${(v.pages || []).map(([p, c]) => `<div><span><a href="https://sonneblomdigitaal.co.za${esc(p)}" target="_blank" rel="noopener" style="color:inherit">${esc(p)}</a></span><span>${num(c)}</span></div>`).join("") || "<div><span>No visits yet</span><span></span></div>"}</div>
    <div class="note">Phones: ${num((v.d7 || {}).mobile || 0)} of ${num((v.d7 || {}).views || 0)} views this week. Your own devices (any that opened the City) are never counted.</div>`;
  sheet.hidden = false;
}
// 🔗 quick links (owner 2026-10-10): every landing page on sonneblomdigitaal.co.za + our shops/channels elsewhere
const SITE = "https://sonneblomdigitaal.co.za";
const QLINKS = [
  ["Main site", [["🏠 Home + shop hub", "/"], ["🛍️ All products", "/shop/"], ["ℹ️ How buying works", "/info/"], ["🔒 Privacy", "/privacy/"]]],
  ["Selling now", [["🤖 AI employees (sale page)", "/ai-team/"], ["🎬 AI UGC agency (Creator Studio)", "/ugc/"], ["📈 AI Bot Race", "/bot-race/"], ["🏢 AI Works virtual office", "/office/"], ["🏙️ Side Hustle City", "/side-hustle-city/"],
    ["✨ AI influencers + templates", "/ai/"], ["🤝 Partners (affiliates)", "/ai/partners/"], ["🌹 Rose: how she's made", "/rose/"], ["🧾 Sonneblom Tax (calculators + TaxBot)", "/tax/"], ["🏘️ Landlord toolkit", "/tax/landlords/"], ["📍 Potch websites + AI visibility", "/potch/"], ["🌐 Webwerwe (local sites)", "/webwerwe/"]]],
  ["Demos + tours", [["🎥 City tour (public demo)", "/city-tour/"], ["🧭 Demo city", "/city-tour/city/"], ["📊 Accounting City demo", "/firm-demo/"], ["💼 Consulting demo", "/consult-demo/"], ["🪙 Community coins", "/community/"], ["🧩 Hubs", "/hubs/"], ["📸 Influencers page", "/influencers/"]]],
  ["Elsewhere", [["🛒 Whop store", "https://whop.com/sonneblomdigitaal/"], ["🧠 Copy What We Did Club", "https://whop.com/sonneblomdigitaal/copy-what-we-did-club-sd/"],
    ["📺 YouTube · AI Bot Race", "https://www.youtube.com/channel/UCMV6u5f2BcmPNGqJPjTxKhQ"], ["🎨 Gumroad", "https://sonneblomdigitaal.gumroad.com/"], ["♿ EAA Fix", "https://eaafix.com/"],
    ["💬 Rose chat", "https://rosecompanion.github.io/chat.html"]]],
];
$("#linksbtn").onclick = () => {
  const sheet = $("#sheet"); sheet.style.setProperty("--c", "#00e5ff");
  $("#sheetbody").innerHTML = `<h2>🔗 All our links</h2><div class="sub">Every landing page on sonneblomdigitaal.co.za, plus our shops and channels. Tap to open, ⧉ to copy.</div>` +
    QLINKS.map(([t, items]) => `<div class="lt" style="margin-top:14px">${esc(t)}</div><div class="list">${items.map(([n, u]) => { const full = u.startsWith("http") ? u : SITE + u;
      return `<div><span><a href="${full}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(n)}</a></span><span><button class="cp" data-u="${full}" style="background:none;border:0;color:var(--c);cursor:pointer;font-size:15px" title="Copy link">⧉</button></span></div>`; }).join("")}</div>`).join("");
  $("#sheetbody").querySelectorAll("button.cp").forEach(b => b.onclick = e => { e.stopPropagation(); navigator.clipboard?.writeText(b.dataset.u); b.textContent = "✓"; setTimeout(() => (b.textContent = "⧉"), 1200); });
  sheet.hidden = false;
};
$("#skinbtn").onclick = () => { const el = $("#skins"); el.hidden = !el.hidden; if (!el.hidden) (DEMO ? skinPicker() : themePicker()); };
async function reload() {
  try { D = await decrypt(PW); } catch (e) { return; }
  await services();
  // rebuild the city with fresh numbers
  picks.length = 0; anim.length = 0; Object.keys(groups).forEach(k => delete groups[k]);
  labels.domElement.innerHTML = "";
  while (scene.children.length) scene.remove(scene.children[0]);
  scene.add(new THREE.HemisphereLight(0x9c7bff, 0x10052a, 0.9));
  const moon = new THREE.DirectionalLight(0xc9b8ff, 0.8); moon.position.set(-40, 80, 30); scene.add(moon);
  build();
}
async function enter(pw, remember) {
  $("#loading").hidden = false;
  try { D = await decrypt(pw); } catch (e) { $("#loading").hidden = true; $("#err").hidden = false; if (GUEST) $("#err").textContent = "This guest link has expired or is not valid."; else set(KEY, null); return; }
  PW = pw; if (remember) set(KEY, pw);
  $("#lock").hidden = true;
  if (DEMO || GUEST) $("#officebtn").hidden = true;
  if (GUEST) { $("#bananas").hidden = true; $("#lockbtn").hidden = true; document.querySelectorAll("#askbar .ph").forEach(e => e.textContent = "Ask Claude how this was built…"); }
  await Promise.all([document.fonts.load("800 54px Sora"), document.fonts.load("600 30px Inter"), services()]).catch(() => {});
  initScene(); build();
  $("#loading").hidden = true; $("#hud").hidden = false;
  tick(); setInterval(tick, 15000);
  setTimeout(() => $("#hint").style.opacity = 0, 9000);
  setInterval(reload, 10 * 60 * 1000);
  loop();
}
$("#unlock").addEventListener("submit", e => { e.preventDefault(); enter($("#pw").value, $("#remember").checked); });
const saved = get(KEY); if (DEMO) enter("demo", false); else if (GUEST) enter(GKEY, false); else if (saved) enter(saved, true);
if (!DEMO && "serviceWorker" in navigator) navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(() => {});

// 7 Oct (owner): drag the to-do note, the Ask bar and the Library window anywhere; positions kept per device.
// A short tap still clicks; moving more than 6 px drags. Double-tap a drag handle to reset its position.
function draggable(el, key, handleSel) {
  if (!el) return;
  const K = "pos-" + key, place = p => {
    const w = el.offsetWidth || 200, h = el.offsetHeight || 60;
    const x = Math.max(4, Math.min(innerWidth - w - 4, p.x)), y = Math.max(4, Math.min(innerHeight - Math.min(h, 80) - 4, p.y));
    Object.assign(el.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto", transform: "none", position: "fixed" });
  };
  const restore = () => { try { const p = JSON.parse(localStorage.getItem(K) || "null"); if (p) place(p); } catch (e) {} };
  restore(); addEventListener("resize", restore);
  let st = null, moved = false;
  el.addEventListener("pointerdown", e => {
    const h = handleSel ? e.target.closest(handleSel) : el;
    if (!h || e.target.closest("input,textarea,label,#todo h4 button,.tacts")) return;
    const r = el.getBoundingClientRect(); st = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY }; moved = false;
  });
  addEventListener("pointermove", e => {
    if (!st) return;
    if (!moved && Math.hypot(e.clientX - st.sx, e.clientY - st.sy) < 6) return;
    moved = true; e.preventDefault(); place({ x: e.clientX - st.dx, y: e.clientY - st.dy });
  }, { passive: false });
  addEventListener("pointerup", () => {
    if (st && moved) { const r = el.getBoundingClientRect(); try { localStorage.setItem(K, JSON.stringify({ x: r.left, y: r.top })); } catch (e) {} }
    st = null;
  });
  el.addEventListener("click", e => { if (moved) { e.stopImmediatePropagation(); e.preventDefault(); moved = false; } }, true);
  el.addEventListener("dblclick", e => {
    if (handleSel && !e.target.closest(handleSel)) return;
    try { localStorage.removeItem(K); } catch (x) {} el.removeAttribute("style");
  });
}
draggable($("#todo"), "todo", "h4");
draggable($("#askbar"), "askbar");
if (innerWidth > 640) draggable($("#term"), "term", ".termbar");
