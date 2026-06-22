import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";

/* ============================================================================
   PROX — mobile-first grocery savings app with built-in analytics
   One self-contained app. Bottom nav: Shop · Recipes · Insights.
   Every action fires a typed event through track(). The Insights screen is an
   in-app analytics dashboard that derives everything (funnel, drop-off, errors,
   engagement) live from that same event stream — it updates as you use the app.
============================================================================ */

/* ---- design tokens -------------------------------------------------------- */
const T = {
  ink: "#16191F", ink2: "#2A2F38", slate: "#5B6470", faint: "#9099A4",
  line: "#E6E8E3", canvas: "#EEF0EB", card: "#FFFFFF",
  brand: "#0E7A52", brandBright: "#1FA968", brandSoft: "#E3F2EA",
  gold: "#C8881A", goldSoft: "#FBF0DA", alert: "#D7472A", alertSoft: "#FBE4DD",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

/* ---- the funnel + event catalog (single source of truth) ------------------ */
const FUNNEL = [
  { key: "app_opened", label: "Opened app" },
  { key: "onboarding_completed", label: "Finished setup" },
  { key: "search_submitted", label: "Searched" },
  { key: "deal_viewed", label: "Opened a deal" },
  { key: "deal_saved", label: "Saved a deal" },
  { key: "cart_item_added", label: "Added to cart" },
  { key: "checkout_started", label: "Started checkout" },
  { key: "checkout_completed", label: "Placed order" },
];
const ERROR_EVENTS = new Set(["error_shown", "search_no_results", "checkout_failed"]);
const KIND = {
  app_opened: T.slate, screen_view: T.faint,
  onboarding_started: T.brand, onboarding_retailers_selected: T.brand,
  onboarding_zip_entered: T.brand, onboarding_completed: T.brand,
  search_submitted: T.ink, filter_applied: T.ink2,
  deal_viewed: T.gold, deal_saved: T.brandBright, deal_unsaved: T.faint,
  cart_item_added: T.brandBright, cart_viewed: T.slate,
  checkout_started: T.gold, checkout_completed: T.brandBright,
  recipe_viewed: T.gold, recipe_ingredient_added: T.brandBright,
  search_no_results: T.alert, checkout_failed: T.alert, error_shown: T.alert,
};

/* ---- catalog -------------------------------------------------------------- */
const RETAILERS = ["Kroger", "Aldi", "Costco", "Target", "Trader Joe's", "Safeway"];
const DEALS = [
  { id: "d1", name: "Whole Milk, 1 gal", cat: "milk dairy", retailer: "Kroger", price: 2.79, was: 3.99 },
  { id: "d2", name: "Organic Eggs, dozen", cat: "eggs", retailer: "Aldi", price: 3.49, was: 4.99 },
  { id: "d3", name: "Bananas, per lb", cat: "banana fruit produce", retailer: "Trader Joe's", price: 0.49, was: 0.69 },
  { id: "d4", name: "Chicken Breast, 2 lb", cat: "chicken meat", retailer: "Costco", price: 7.99, was: 11.49 },
  { id: "d5", name: "Cheddar Block, 8 oz", cat: "cheese dairy", retailer: "Target", price: 2.99, was: 4.29 },
  { id: "d6", name: "2% Milk, half gal", cat: "milk dairy", retailer: "Safeway", price: 1.89, was: 2.79 },
  { id: "d7", name: "Sourdough Loaf", cat: "bread bakery", retailer: "Kroger", price: 3.29, was: 4.49 },
  { id: "d8", name: "Greek Yogurt, 32 oz", cat: "yogurt dairy", retailer: "Aldi", price: 3.79, was: 5.29 },
  { id: "d9", name: "Spaghetti, 1 lb", cat: "pasta", retailer: "Aldi", price: 0.99, was: 1.49 },
  { id: "d10", name: "Marinara Sauce", cat: "sauce pasta", retailer: "Target", price: 1.79, was: 2.99 },
  { id: "d11", name: "Tomato Soup", cat: "soup", retailer: "Kroger", price: 1.19, was: 1.89 },
  { id: "d12", name: "Butter, 1 lb", cat: "butter dairy", retailer: "Costco", price: 3.49, was: 4.99 },
];
const RECIPES = [
  { id: "r1", name: "Weeknight Pasta", emoji: "🍝", mins: 25, items: ["d9", "d10", "d5"] },
  { id: "r2", name: "Big Breakfast Scramble", emoji: "🍳", mins: 15, items: ["d2", "d5", "d12"] },
  { id: "r3", name: "Grilled Cheese & Soup", emoji: "🧀", mins: 20, items: ["d7", "d5", "d11", "d12"] },
];
const dealById = (id) => DEALS.find((d) => d.id === id);
const SEARCH_POOL = ["milk", "eggs", "chicken", "bananas", "cheese", "bread", "yogurt", "pasta", "caviar", "truffle oil"];
const NO_RESULT_Q = new Set(["caviar", "truffle oil", "saffron", "wagyu"]);

/* ============================================================================
   Seeded history — 260 simulated sessions so analytics is meaningful at once.
============================================================================ */
function uid() { return Math.random().toString(36).slice(2, 9); }
function generateHistorical(n = 260) {
  const events = [];
  const advance = [1.0, 0.83, 0.88, 0.63, 0.72, 0.80, 0.76, 0.61]; // P(reach next | reached prev)
  let base = Date.now() - 1000 * 60 * 60 * 40;
  for (let s = 0; s < n; s++) {
    const sid = "h_" + uid();
    let ts = base + s * 1000 * 60 * (3 + Math.random() * 6);
    const push = (name, props = {}) => { ts += 700 + Math.random() * 3500; events.push({ id: uid(), name, ts, sessionId: sid, props }); };

    let stage = 0;
    for (let i = 1; i < FUNNEL.length; i++) { if (Math.random() < advance[i]) stage = i; else break; }

    push("app_opened");
    push("screen_view", { screen: "onboarding" });
    push("onboarding_started");
    if (stage >= 1) {
      const picks = RETAILERS.filter(() => Math.random() < 0.5).slice(0, 3);
      push("onboarding_retailers_selected", { count: picks.length || 1 });
      push("onboarding_zip_entered", { zip: String(94000 + Math.floor(Math.random() * 999)) });
      push("onboarding_completed");
      push("screen_view", { screen: "home" });

      // recipe path — alternate engagement, ~35% of activated users
      if (Math.random() < 0.35) {
        const r = RECIPES[Math.floor(Math.random() * RECIPES.length)];
        push("screen_view", { screen: "recipes" });
        push("recipe_viewed", { recipe_id: r.id, name: r.name });
        if (Math.random() < 0.55) {
          const k = 1 + Math.floor(Math.random() * r.items.length);
          for (let j = 0; j < k; j++) push("recipe_ingredient_added", { recipe_id: r.id, deal_id: r.items[j] });
        }
      }
    }
    if (stage >= 2) {
      const q = SEARCH_POOL[Math.floor(Math.random() * SEARCH_POOL.length)];
      if (NO_RESULT_Q.has(q)) {
        push("search_submitted", { query: q, results_count: 0 });
        push("search_no_results", { query: q });
        push("error_shown", { type: "no_results", query: q });
      } else {
        push("search_submitted", { query: q, results_count: 2 + Math.floor(Math.random() * 5) });
        if (Math.random() < 0.42) push("filter_applied", { filter: "retailer", value: RETAILERS[Math.floor(Math.random() * RETAILERS.length)] });
      }
    }
    if (stage >= 3) { const d = DEALS[Math.floor(Math.random() * DEALS.length)]; push("deal_viewed", { deal_id: d.id, retailer: d.retailer, savings: +(d.was - d.price).toFixed(2) }); }
    if (stage >= 4) { const d = DEALS[Math.floor(Math.random() * DEALS.length)]; push("deal_saved", { deal_id: d.id }); }
    if (stage >= 5) { const d = DEALS[Math.floor(Math.random() * DEALS.length)]; push("cart_item_added", { deal_id: d.id, price: d.price }); }
    if (stage >= 6) { push("screen_view", { screen: "cart" }); push("cart_viewed"); push("checkout_started", { items: 1 + Math.floor(Math.random() * 3) }); }
    if (stage >= 7) { push("checkout_completed", { total: +(8 + Math.random() * 30).toFixed(2), savings: +(2 + Math.random() * 8).toFixed(2) }); }
    else if (stage === 6 && Math.random() < 0.42) { push("checkout_failed", { reason: "payment_declined" }); push("error_shown", { type: "checkout_failed" }); }
  }
  return events;
}

/* ============================================================================
   Aggregations — every number on the Insights screen comes from here.
============================================================================ */
function aggregate(events) {
  const bySession = new Map();
  for (const e of events) { if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, new Set()); bySession.get(e.sessionId).add(e.name); }
  const sessions = [...bySession.values()];
  const total = sessions.length || 1;

  const funnel = FUNNEL.map((f) => ({ ...f, count: sessions.filter((s) => s.has(f.key)).length }));
  let biggest = { idx: 1, dropPct: 0 };
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1].count || 1;
    funnel[i].convFromPrev = funnel[i].count / prev;
    funnel[i].dropPct = 1 - funnel[i].count / prev;
    if (funnel[i].dropPct > biggest.dropPct) biggest = { idx: i, dropPct: funnel[i].dropPct };
  }

  const c = (n) => events.filter((e) => e.name === n).length;
  const m = {
    sessions: total, searches: c("search_submitted"), filters: c("filter_applied"),
    dealsViewed: c("deal_viewed"), dealsSaved: c("deal_saved"), cartAdds: c("cart_item_added"),
    checkoutsStarted: c("checkout_started"), checkoutsCompleted: c("checkout_completed"),
    recipesViewed: c("recipe_viewed"), ingredientsAdded: c("recipe_ingredient_added"),
    errors: events.filter((e) => ERROR_EVENTS.has(e.name)).length,
  };
  const searchSessions = sessions.filter((s) => s.has("search_submitted")).length || 1;
  m.searchActionRate = sessions.filter((s) => s.has("search_submitted") && s.has("deal_viewed")).length / searchSessions;
  m.checkoutCompletionRate = m.checkoutsStarted ? m.checkoutsCompleted / m.checkoutsStarted : 0;
  m.saveRate = m.dealsViewed ? m.dealsSaved / m.dealsViewed : 0;

  const sc = {};
  for (const e of events) if (e.name === "search_submitted") { const q = e.props.query || "—"; sc[q] = sc[q] || { q, n: 0, zero: 0 }; sc[q].n++; if (e.props.results_count === 0) sc[q].zero++; }
  const topSearches = Object.values(sc).sort((a, b) => b.n - a.n).slice(0, 6);

  const errorBreakdown = [
    { k: "Search returned nothing", v: c("search_no_results") },
    { k: "Checkout payment failed", v: c("checkout_failed") },
  ].filter((e) => e.v > 0).sort((a, b) => b.v - a.v);

  const screens = {};
  for (const e of events) { const s = e.props.screen; if (s) screens[s] = (screens[s] || 0) + 1; }
  const topScreen = Object.entries(screens).sort((a, b) => b[1] - a[1])[0] || ["—", 0];

  return { funnel, m, topSearches, errorBreakdown, topScreen, biggest };
}
function sessionProgress(events, sid) {
  const names = new Set(events.filter((e) => e.sessionId === sid).map((e) => e.name));
  let reached = 0;
  for (let i = 0; i < FUNNEL.length; i++) if (names.has(FUNNEL[i].key)) reached = i;
  const completed = names.has("checkout_completed");
  return { reached, completed, nextStep: completed ? null : FUNNEL[Math.min(reached + 1, FUNNEL.length - 1)] };
}

/* ============================================================================
   Shared UI bits
============================================================================ */
function Money({ price, was }) {
  return (<span><span style={{ fontWeight: 800, color: T.brand }}>${price.toFixed(2)}</span>
    {was && <span style={{ textDecoration: "line-through", color: T.faint, marginLeft: 6, fontSize: 12 }}>${was.toFixed(2)}</span>}</span>);
}
function Chip({ active, children, onClick, tone }) {
  return <button onClick={onClick} style={{ border: `1.5px solid ${active ? (tone || T.brand) : T.line}`, background: active ? (tone || T.brand) : "#fff", color: active ? "#fff" : T.ink, borderRadius: 999, padding: "7px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: T.sans }}>{children}</button>;
}
function DealRow({ d, onClick }) {
  return (<button onClick={onClick} style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 13px", border: `1px solid ${T.line}`, borderRadius: 12, background: "#fff", marginTop: 9, cursor: "pointer" }}>
    <div><div style={{ fontWeight: 700, color: T.ink, fontSize: 14 }}>{d.name}</div><div style={{ color: T.faint, fontSize: 12, marginTop: 2 }}>{d.retailer}</div></div>
    <div style={{ textAlign: "right" }}><Money price={d.price} was={d.was} /><div style={{ color: T.brand, fontSize: 11, fontWeight: 700, marginTop: 2 }}>{Math.round((1 - d.price / d.was) * 100)}% off</div></div>
  </button>);
}
const primaryBtn = { width: "100%", background: T.brand, color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: T.sans };
const secondaryBtn = { width: "100%", background: "#fff", color: T.ink, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: T.sans };
const ghostBtn = { background: "none", border: "none", fontSize: 22, color: T.ink, cursor: "pointer", lineHeight: 1, padding: 4 };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${T.line}`, fontSize: 15, fontFamily: T.sans, marginBottom: 14, outline: "none" };
const emptyState = { textAlign: "center", padding: "44px 20px", color: T.slate };

/* ============================================================================
   The app
============================================================================ */
export default function App() {
  const [historical] = useState(() => generateHistorical(260));
  const [live, setLive] = useState([]);
  const [sid, setSid] = useState(() => "live_" + uid());
  const track = useCallback((name, props = {}) => {
    setLive((p) => [...p, { id: uid(), name, ts: Date.now(), sessionId: sid, props }]);
    console.log("[track]", name, props); // real app: forward this to the analytics SDK
  }, [sid]);
  const events = useMemo(() => [...historical, ...live], [historical, live]);
  const reset = () => { setSid("live_" + uid()); setLive([]); };

  return (
    <div style={{ minHeight: "100vh", background: T.canvas, fontFamily: T.sans, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 12px 40px" }}>
      <style>{`*{box-sizing:border-box} button:focus-visible,input:focus-visible{outline:2px solid ${T.brand};outline-offset:2px}
        .scroll::-webkit-scrollbar{width:0;height:0} @media(prefers-reduced-motion:reduce){*{transition:none!important}}`}</style>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: T.ink, letterSpacing: -0.4 }}>Prox · grocery savings + in-app analytics</div>
        <div style={{ color: T.slate, fontSize: 13 }}>Shop and Recipes drive events. The <b>Insights</b> tab is the live analytics — all in one app.</div>
      </div>
      <Phone events={events} live={live} sid={sid} track={track} reset={reset} />
      <p style={{ color: T.slate, fontSize: 12.5, textAlign: "center", marginTop: 12, maxWidth: 360, lineHeight: 1.5 }}>
        Try: search <b>“caviar”</b> (no-results error), place an order (fails ~28% on purpose), open a recipe and add ingredients — then check <b>Insights</b>.
      </p>
    </div>
  );
}

function Phone({ events, live, sid, track, reset }) {
  const [screen, setScreen] = useState("onboarding_welcome");
  const go = (s) => { setScreen(s); track("screen_view", { screen: s }); };
  const opened = useRef(false);
  useEffect(() => { if (opened.current) return; opened.current = true; track("app_opened"); track("screen_view", { screen: "onboarding" }); track("onboarding_started"); }, [track]);

  // shared app state
  const [retailers, setRetailers] = useState([]);
  const [zip, setZip] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [filter, setFilter] = useState(null);
  const [deal, setDeal] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [saved, setSaved] = useState([]);
  const [cart, setCart] = useState([]);
  const [checkout, setCheckout] = useState("idle");
  const cartTotal = cart.reduce((a, d) => a + d.price, 0);

  const runSearch = (q) => {
    const norm = q.trim().toLowerCase(); if (!norm) return; setFilter(null);
    if (NO_RESULT_Q.has(norm)) { setResults([]); track("search_submitted", { query: norm, results_count: 0 }); track("search_no_results", { query: norm }); track("error_shown", { type: "no_results", query: norm }); }
    else { const r = DEALS.filter((d) => (d.name + " " + d.cat).toLowerCase().includes(norm)); setResults(r); track("search_submitted", { query: norm, results_count: r.length }); if (!r.length) { track("search_no_results", { query: norm }); track("error_shown", { type: "no_results", query: norm }); } }
    go("results");
  };
  const placeOrder = () => {
    setCheckout("processing"); track("checkout_started", { items: cart.length, total: +cartTotal.toFixed(2) });
    setTimeout(() => {
      if (Math.random() < 0.28) { setCheckout("failed"); track("checkout_failed", { reason: "payment_declined" }); track("error_shown", { type: "checkout_failed" }); }
      else { setCheckout("done"); track("checkout_completed", { items: cart.length, total: +cartTotal.toFixed(2), savings: +cart.reduce((a, d) => a + (d.was - d.price), 0).toFixed(2) }); go("confirmation"); }
    }, 950);
  };
  const retry = () => { setCheckout("processing"); track("checkout_started", { items: cart.length, retry: true }); setTimeout(() => { setCheckout("done"); track("checkout_completed", { items: cart.length, total: +cartTotal.toFixed(2), retry: true }); go("confirmation"); }, 800); };

  const onboarding = screen.startsWith("onboarding");
  const tab = screen === "insights" ? "insights" : (screen === "recipes" || screen === "recipe") ? "recipes" : "shop";
  const visible = results ? (filter ? results.filter((d) => d.retailer === filter) : results) : [];

  const Header = ({ title, back, right }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 14px 8px" }}>
      {back && <button onClick={back} style={ghostBtn}>‹</button>}
      <div style={{ fontWeight: 800, fontSize: 17, color: T.ink, letterSpacing: -0.3, flex: 1 }}>{title}</div>
      {right}
    </div>
  );
  const CartBtn = () => (<div style={{ position: "relative" }}><button style={ghostBtn} onClick={() => go("cart")}>🛒</button>{cart.length > 0 && <span style={{ position: "absolute", top: -2, right: -2, background: T.alert, color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 16, height: 16, display: "grid", placeItems: "center", padding: "0 3px" }}>{cart.length}</span>}</div>);

  let body;
  /* ---------- onboarding ---------- */
  if (screen === "onboarding_welcome") {
    body = (<div style={{ padding: 22, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginTop: 26 }}>
        <div style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: 2, color: T.brand, fontWeight: 700 }}>PROX</div>
        <h1 style={{ fontSize: 29, lineHeight: 1.12, margin: "14px 0 8px", color: T.ink, letterSpacing: -1 }}>Stop overpaying for groceries.</h1>
        <p style={{ color: T.slate, fontSize: 15, lineHeight: 1.5 }}>Live prices across stores near you, so you always know where each item is cheapest.</p>
      </div>
      <div style={{ marginTop: "auto" }}><button style={primaryBtn} onClick={() => go("onboarding_retailers")}>Get started</button></div>
    </div>);
  } else if (screen === "onboarding_retailers") {
    const toggle = (r) => setRetailers((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r]);
    body = (<div style={{ padding: "8px 18px", display: "flex", flexDirection: "column", height: "100%" }}>
      <Header title="Pick your stores" back={() => go("onboarding_welcome")} />
      <p style={{ color: T.slate, fontSize: 14, margin: "0 0 16px" }}>We compare prices across these. <b>Step 1 of 2</b></p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>{RETAILERS.map((r) => <Chip key={r} active={retailers.includes(r)} onClick={() => toggle(r)}>{r}</Chip>)}</div>
      <div style={{ marginTop: "auto" }}><button style={{ ...primaryBtn, opacity: retailers.length ? 1 : 0.4 }} disabled={!retailers.length} onClick={() => { track("onboarding_retailers_selected", { count: retailers.length }); go("onboarding_zip"); }}>Continue {retailers.length ? `(${retailers.length})` : ""}</button></div>
    </div>);
  } else if (screen === "onboarding_zip") {
    body = (<div style={{ padding: "8px 18px", display: "flex", flexDirection: "column", height: "100%" }}>
      <Header title="Your ZIP code" back={() => go("onboarding_retailers")} />
      <p style={{ color: T.slate, fontSize: 14, margin: "0 0 16px" }}>Finds the closest stores. <b>Step 2 of 2</b></p>
      <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="94110" style={inputStyle} />
      <div style={{ marginTop: "auto" }}><button style={{ ...primaryBtn, opacity: zip.length === 5 ? 1 : 0.4 }} disabled={zip.length !== 5} onClick={() => { track("onboarding_zip_entered", { zip }); track("onboarding_completed"); go("home"); }}>Finish setup</button></div>
    </div>);
  }
  /* ---------- shop ---------- */
  else if (screen === "home") {
    body = (<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 14px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.ink, letterSpacing: -0.5 }}>Find a deal</div><CartBtn />
      </div>
      <div style={{ padding: "4px 14px" }}><SearchBar query={query} setQuery={setQuery} onSubmit={() => runSearch(query)} /></div>
      <div style={{ padding: "10px 14px 4px", color: T.faint, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Popular near you</div>
      <div className="scroll" style={{ overflowY: "auto", padding: "0 14px 12px", flex: 1 }}>{DEALS.slice(0, 6).map((d) => <DealRow key={d.id} d={d} onClick={() => { setDeal(d); track("deal_viewed", { deal_id: d.id, retailer: d.retailer, savings: +(d.was - d.price).toFixed(2), source: "home" }); go("deal"); }} />)}</div>
    </div>);
  } else if (screen === "results") {
    const chips = results ? [...new Set(results.map((d) => d.retailer))] : [];
    body = (<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title={`“${query.trim()}”`} back={() => go("home")} right={<CartBtn />} />
      <div style={{ padding: "0 14px 6px" }}><SearchBar query={query} setQuery={setQuery} onSubmit={() => runSearch(query)} /></div>
      {results && results.length > 0 && <div className="scroll" style={{ display: "flex", gap: 8, padding: "6px 14px", overflowX: "auto" }}>
        <Chip active={!filter} onClick={() => setFilter(null)} tone={T.ink2}>All</Chip>
        {chips.map((r) => <Chip key={r} active={filter === r} tone={T.ink2} onClick={() => { setFilter(r); track("filter_applied", { filter: "retailer", value: r, query: query.trim().toLowerCase() }); }}>{r}</Chip>)}
      </div>}
      <div className="scroll" style={{ overflowY: "auto", padding: "4px 14px 12px", flex: 1 }}>
        {results && results.length === 0 && <div style={emptyState}><div style={{ fontSize: 28 }}>🔍</div><div style={{ fontWeight: 700, color: T.ink, marginTop: 8 }}>No deals for “{query.trim()}”</div><div style={{ color: T.slate, fontSize: 13, marginTop: 4 }}>Every empty search is logged so we can stock the gaps. Try milk, eggs, or pasta.</div></div>}
        {visible.map((d) => <DealRow key={d.id} d={d} onClick={() => { setDeal(d); track("deal_viewed", { deal_id: d.id, retailer: d.retailer, savings: +(d.was - d.price).toFixed(2), source: "search", query: query.trim().toLowerCase() }); go("deal"); }} />)}
      </div>
    </div>);
  } else if (screen === "deal" && deal) {
    const isSaved = saved.includes(deal.id), inCart = cart.some((c) => c.id === deal.id);
    body = (<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title="Deal" back={() => go(results ? "results" : "home")} right={<CartBtn />} />
      <div className="scroll" style={{ padding: "0 16px", flex: 1, overflowY: "auto" }}>
        <div style={{ background: T.canvas, borderRadius: 16, padding: "24px 18px", textAlign: "center" }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.slate, letterSpacing: 1 }}>{deal.retailer.toUpperCase()}</div>
          <div style={{ fontWeight: 800, fontSize: 20, margin: "8px 0", color: T.ink }}>{deal.name}</div>
          <div style={{ fontSize: 30 }}><Money price={deal.price} was={deal.was} /></div>
          <div style={{ display: "inline-block", marginTop: 10, background: T.brand, color: "#fff", borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>Save ${(deal.was - deal.price).toFixed(2)} ({Math.round((1 - deal.price / deal.was) * 100)}% off)</div>
        </div>
        <p style={{ color: T.slate, fontSize: 14, lineHeight: 1.5, marginTop: 16 }}>Price valid through Sunday. Lowest in your area across {retailers.length || 3} tracked stores.</p>
      </div>
      <div style={{ padding: 14, display: "flex", gap: 10 }}>
        <button style={{ ...secondaryBtn, color: isSaved ? T.brand : T.ink, borderColor: isSaved ? T.brand : T.line }} onClick={() => { if (isSaved) { setSaved((p) => p.filter((x) => x !== deal.id)); track("deal_unsaved", { deal_id: deal.id }); } else { setSaved((p) => [...p, deal.id]); track("deal_saved", { deal_id: deal.id, retailer: deal.retailer }); } }}>{isSaved ? "♥ Saved" : "♡ Save"}</button>
        <button style={{ ...primaryBtn, flex: 2, opacity: inCart ? 0.5 : 1 }} disabled={inCart} onClick={() => { setCart((p) => [...p, deal]); track("cart_item_added", { deal_id: deal.id, price: deal.price, retailer: deal.retailer }); }}>{inCart ? "In cart" : "Add to cart"}</button>
      </div>
    </div>);
  } else if (screen === "cart") {
    body = (<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title="Cart" back={() => go("home")} />
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "0 14px" }}>
        {cart.length === 0 && <div style={emptyState}><div style={{ fontSize: 28 }}>🛒</div><div style={{ fontWeight: 700, marginTop: 8, color: T.ink }}>Cart's empty</div><div style={{ color: T.slate, fontSize: 13 }}>Add a deal or recipe to start saving.</div></div>}
        {cart.map((d, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${T.line}` }}><div><div style={{ fontWeight: 600, color: T.ink, fontSize: 14 }}>{d.name}</div><div style={{ color: T.faint, fontSize: 12 }}>{d.retailer}</div></div><Money price={d.price} /></div>)}
      </div>
      {cart.length > 0 && <div style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><span style={{ color: T.slate }}>Total</span><span style={{ fontWeight: 800, fontSize: 18, color: T.ink }}>${cartTotal.toFixed(2)}</span></div>
        <button style={{ ...primaryBtn, opacity: checkout === "processing" ? 0.6 : 1 }} disabled={checkout === "processing"} onClick={() => { track("cart_viewed"); placeOrder(); }}>{checkout === "processing" ? "Processing…" : "Place order"}</button>
        {checkout === "failed" && <div style={{ background: T.alertSoft, border: `1px solid ${T.alert}`, borderRadius: 10, padding: 12, marginTop: 12 }}><div style={{ color: T.alert, fontWeight: 700, fontSize: 13 }}>Payment didn't go through</div><div style={{ color: T.ink, fontSize: 13, margin: "3px 0 8px" }}>Your card was declined. No charge was made.</div><button style={{ ...secondaryBtn, borderColor: T.alert, color: T.alert, padding: "8px 0" }} onClick={retry}>Try again</button></div>}
      </div>}
    </div>);
  } else if (screen === "confirmation") {
    const savings = cart.reduce((a, d) => a + (d.was - d.price), 0);
    body = (<div style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginTop: 40 }}><div style={{ width: 64, height: 64, borderRadius: 999, background: T.brand, color: "#fff", fontSize: 30, display: "grid", placeItems: "center", margin: "0 auto" }}>✓</div>
        <h2 style={{ marginTop: 18, color: T.ink }}>Order placed</h2><p style={{ color: T.slate, fontSize: 14 }}>You saved <b style={{ color: T.brand }}>${savings.toFixed(2)}</b> on this trip.</p></div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <button style={primaryBtn} onClick={() => go("insights")}>See the analytics →</button>
        <button style={secondaryBtn} onClick={() => { reset(); setRetailers([]); setZip(""); setQuery(""); setResults(null); setDeal(null); setSaved([]); setCart([]); setCheckout("idle"); setScreen("onboarding_welcome"); }}>Start a new session</button>
      </div>
    </div>);
  }
  /* ---------- recipes ---------- */
  else if (screen === "recipes") {
    body = (<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title="Recipes" right={<CartBtn />} />
      <p style={{ color: T.slate, fontSize: 13, margin: "0 14px 6px" }}>Build a meal, add the cheapest version of every ingredient in one tap.</p>
      <div className="scroll" style={{ overflowY: "auto", padding: "4px 14px 12px", flex: 1 }}>
        {RECIPES.map((r) => { const tot = r.items.reduce((a, id) => a + dealById(id).price, 0); return (
          <button key={r.id} onClick={() => { setRecipe(r); track("recipe_viewed", { recipe_id: r.id, name: r.name }); go("recipe"); }} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: 13, border: `1px solid ${T.line}`, borderRadius: 12, background: "#fff", marginTop: 9, cursor: "pointer" }}>
            <div style={{ fontSize: 30 }}>{r.emoji}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: T.ink, fontSize: 15 }}>{r.name}</div><div style={{ color: T.faint, fontSize: 12, marginTop: 2 }}>{r.items.length} ingredients · {r.mins} min</div></div>
            <div style={{ fontWeight: 800, color: T.brand }}>${tot.toFixed(2)}</div>
          </button>); })}
      </div>
    </div>);
  } else if (screen === "recipe" && recipe) {
    body = (<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title={recipe.name} back={() => go("recipes")} right={<CartBtn />} />
      <div className="scroll" style={{ overflowY: "auto", padding: "0 14px 12px", flex: 1 }}>
        <div style={{ fontSize: 46, textAlign: "center", margin: "6px 0" }}>{recipe.emoji}</div>
        <div style={{ color: T.faint, fontSize: 12, textAlign: "center", marginBottom: 10 }}>{recipe.mins} min · cheapest ingredients near you</div>
        {recipe.items.map((id) => { const d = dealById(id), inCart = cart.some((c) => c.id === id); return (
          <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${T.line}` }}>
            <div><div style={{ fontWeight: 600, color: T.ink, fontSize: 14 }}>{d.name}</div><div style={{ color: T.faint, fontSize: 12 }}>{d.retailer} · <Money price={d.price} /></div></div>
            <button disabled={inCart} onClick={() => { setCart((p) => [...p, d]); track("recipe_ingredient_added", { recipe_id: recipe.id, deal_id: id }); track("cart_item_added", { deal_id: id, price: d.price, source: "recipe" }); }} style={{ border: `1.5px solid ${inCart ? T.line : T.brand}`, background: inCart ? T.line : "#fff", color: inCart ? T.faint : T.brand, borderRadius: 999, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: inCart ? "default" : "pointer" }}>{inCart ? "Added" : "+ Add"}</button>
          </div>); })}
      </div>
      <div style={{ padding: 14 }}><button style={primaryBtn} onClick={() => { recipe.items.forEach((id) => { if (!cart.some((c) => c.id === id)) { const d = dealById(id); setCart((p) => [...p, d]); track("recipe_ingredient_added", { recipe_id: recipe.id, deal_id: id, bulk: true }); track("cart_item_added", { deal_id: id, price: d.price, source: "recipe" }); } }); go("cart"); }}>Add all ingredients to cart</button></div>
    </div>);
  }
  /* ---------- insights (in-app analytics) ---------- */
  else if (screen === "insights") {
    body = <Insights events={events} sid={sid} />;
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ border: "10px solid #14181F", borderRadius: 38, overflow: "hidden", width: 372, height: 760, background: "#fff", boxShadow: "0 26px 60px -22px rgba(0,0,0,.45)" }}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: screen === "insights" ? T.canvas : "#fff" }}>
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>{body}</div>
          {!onboarding && <BottomNav tab={tab} go={go} />}
        </div>
      </div>
      <button onClick={() => { reset(); setRetailers([]); setZip(""); setQuery(""); setResults(null); setDeal(null); setSaved([]); setCart([]); setCheckout("idle"); setScreen("onboarding_welcome"); }} style={{ ...secondaryBtn, marginTop: 12, background: "#fff" }}>↻ Reset session (test drop-off)</button>
    </div>
  );
}

function SearchBar({ query, setQuery, onSubmit }) {
  return (<div style={{ display: "flex", gap: 8 }}>
    <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSubmit()} placeholder="Search milk, eggs, pasta…" style={{ ...inputStyle, marginBottom: 0, flex: 1, padding: "11px 13px" }} />
    <button style={{ ...primaryBtn, width: "auto", padding: "0 16px" }} onClick={onSubmit}>Go</button>
  </div>);
}

function BottomNav({ tab, go }) {
  const items = [["shop", "🛍️", "Shop", "home"], ["recipes", "📖", "Recipes", "recipes"], ["insights", "📊", "Insights", "insights"]];
  return (<div style={{ display: "flex", borderTop: `1px solid ${T.line}`, background: "#fff" }}>
    {items.map(([key, icon, label, dest]) => { const active = tab === key; return (
      <button key={key} onClick={() => go(dest)} style={{ flex: 1, border: "none", background: "none", padding: "9px 0 11px", cursor: "pointer", color: active ? T.brand : T.faint, fontFamily: T.sans }}>
        <div style={{ fontSize: 19, opacity: active ? 1 : 0.6 }}>{icon}</div>
        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{label}</div>
      </button>); })}
  </div>);
}

/* ============================================================================
   In-app analytics screen
============================================================================ */
function Insights({ events, sid }) {
  const agg = useMemo(() => aggregate(events), [events]);
  const prog = useMemo(() => sessionProgress(events, sid), [events, sid]);
  const stream = useMemo(() => events.slice(-12).reverse(), [events]);
  const m = agg.m;
  const leak = agg.funnel[agg.biggest.idx];

  return (
    <div className="scroll" style={{ overflowY: "auto", height: "100%", padding: "14px 13px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: T.mono, color: T.brand, fontWeight: 700, letterSpacing: 1, fontSize: 13 }}>PROX</span>
        <span style={{ color: T.ink, fontWeight: 800, fontSize: 17 }}>Insights</span>
      </div>
      <div style={{ color: T.faint, fontSize: 11.5, marginTop: 2, fontFamily: T.mono }}>{m.sessions} sessions · {events.length} events · updates live</div>

      {/* headline insight */}
      <div style={{ marginTop: 12, background: T.brandSoft, border: `1px solid ${T.brand}40`, borderLeft: `4px solid ${T.brand}`, borderRadius: 12, padding: "12px 13px" }}>
        <div style={{ fontSize: 10.5, color: T.brand, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", fontFamily: T.mono }}>Biggest opportunity</div>
        <div style={{ color: T.ink, fontWeight: 800, fontSize: 15.5, margin: "4px 0 3px" }}>{Math.round(agg.biggest.dropPct * 100)}% drop off at “{leak.label}”</div>
        <div style={{ color: T.slate, fontSize: 12.5, lineHeight: 1.45 }}>The single biggest leak. Only {Math.round(m.searchActionRate * 100)}% of searches reach a deal, and {m.errors} sessions hit a failure. Fixing this step is the next win.</div>
      </div>

      {/* live session */}
      <div style={{ marginTop: 12, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 13px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: T.faint, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}>Your live session</span>
          <span style={tag(prog.completed ? T.brand : T.gold)}>{prog.completed ? "completed" : "in progress"}</span>
        </div>
        <div style={{ display: "flex", gap: 3, marginTop: 9 }}>{FUNNEL.map((f, i) => <div key={f.key} title={f.label} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= prog.reached ? T.brandBright : T.line }} />)}</div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: T.ink }}>{prog.completed ? <span style={{ color: T.brand }}>Reached the end — order placed.</span> : <>At <b>{FUNNEL[prog.reached].label}</b>. Drop-off point if you stop now: <b style={{ color: T.gold }}>{prog.nextStep?.label}</b>.</>}</div>
      </div>

      {/* metric grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <Metric n={m.searches} label="Searches run" />
        <Metric n={m.filters} label="Filters applied" />
        <Metric n={m.dealsViewed} label="Deals opened" />
        <Metric n={m.dealsSaved} label="Deals saved" tone={T.brand} />
        <Metric n={m.recipesViewed} label="Recipes viewed" />
        <Metric n={m.ingredientsAdded} label="Ingredients added" />
        <Metric n={m.checkoutsCompleted} label="Orders placed" tone={T.brand} />
        <Metric n={m.errors} label="Times it broke" tone={T.alert} />
      </div>

      <Card title="The journey, step by step" sub={`Most lost at: ${leak.label}`}>
        {agg.funnel.map((f, i) => { const max = agg.funnel[0].count || 1; const isLeak = i === agg.biggest.idx; return (
          <div key={f.key} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: T.ink }}>{f.label}</span>
              <span style={{ fontFamily: T.mono, color: T.faint }}>{f.count}{i > 0 && <span style={{ color: isLeak ? T.alert : T.faint, marginLeft: 6 }}>{Math.round((f.convFromPrev || 0) * 100)}%</span>}</span>
            </div>
            <div style={{ height: 18, background: "#EDEFEA", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${Math.max((f.count / max) * 100, 2)}%`, height: "100%", borderRadius: 6, background: isLeak ? `linear-gradient(90deg,${T.alert},#B83A1E)` : `linear-gradient(90deg,${T.brandBright},${T.brand})`, transition: "width .4s" }} />
            </div>
            {isLeak && <div style={{ fontSize: 11, color: T.alert, marginTop: 3, fontWeight: 600 }}>↑ {Math.round(agg.biggest.dropPct * 100)}% leave here — biggest drop-off</div>}
          </div>); })}
      </Card>

      <Card title="What people search for" sub={`${Math.round(m.searchActionRate * 100)}% go on to open a deal`}>
        {agg.topSearches.map((s) => (
          <div key={s.q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: `1px solid ${T.line}`, fontSize: 13 }}>
            <span style={{ fontFamily: T.mono, color: T.ink }}>{s.q}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontFamily: T.mono, color: T.faint }}>{s.n}×</span>{s.zero > 0 ? <span style={tag(T.alert)}>no result</span> : <span style={tag(T.brand)}>has deals</span>}</span>
          </div>))}
      </Card>

      <Card title="Where people get stuck" sub={`${m.errors} failures logged`}>
        {agg.errorBreakdown.length === 0 ? <div style={{ color: T.faint, fontSize: 13 }}>No errors logged yet.</div> :
          agg.errorBreakdown.map((e) => <div key={e.k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${T.line}`, fontSize: 13 }}><span style={{ color: T.ink }}>{e.k}</span><span style={{ fontFamily: T.mono, color: T.alert, fontWeight: 700 }}>{e.v}</span></div>)}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: T.faint }}>Most engaged screen</span><span style={{ fontFamily: T.mono, color: T.gold, fontWeight: 700 }}>{agg.topScreen[0]} ({agg.topScreen[1]})</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
          <span style={{ color: T.faint }}>Checkout completion</span><span style={{ fontFamily: T.mono, color: T.ink, fontWeight: 700 }}>{Math.round(m.checkoutCompletionRate * 100)}%</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
          <span style={{ color: T.faint }}>Save rate (of deals opened)</span><span style={{ fontFamily: T.mono, color: T.ink, fontWeight: 700 }}>{Math.round(m.saveRate * 100)}%</span>
        </div>
      </Card>

      <Card title="What we'd do about it" sub="auto-generated from the data">
        {[
          `“${leak.label}” loses ${Math.round(agg.biggest.dropPct * 100)}% — make the prior screen sell value harder (sort by savings, bigger discount badges).`,
          m.searchActionRate < 0.7 ? "Searchers aren't reaching deals — surface results faster and lead with the discount." : "Search → deal is healthy; protect it.",
          m.errors > 0 ? "Recover failed checkouts with a saved cart + retry, and alert on payment-error spikes." : "No failures yet — keep watching checkout.",
          "Turn the empty searches above into a stocking list for merchandising.",
        ].map((t, i) => <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: i ? `1px solid ${T.line}` : "none", fontSize: 12.5, color: T.ink, lineHeight: 1.4 }}><span style={{ color: T.brand, fontWeight: 800 }}>→</span><span>{t}</span></div>)}
      </Card>

      <Card title="Every tap, as it happens" sub="newest first · powers all the above">
        <div style={{ fontFamily: T.mono, fontSize: 11.5 }}>
          {stream.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 7, padding: "4px 0", borderTop: `1px solid ${T.line}`, alignItems: "center" }}>
              <span style={{ width: 7, height: 7, borderRadius: 9, background: KIND[e.name] || T.faint, flexShrink: 0 }} />
              <span style={{ color: T.ink, fontWeight: 600, whiteSpace: "nowrap" }}>{e.name}</span>
              <span style={{ color: T.faint, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{propStr(e.props)}</span>
              {e.sessionId === sid && <span style={tag(T.brand)}>you</span>}
            </div>))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ n, label, tone }) {
  return (<div style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 11, padding: "10px 12px" }}>
    <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 700, color: tone || T.ink }}>{n}</div>
    <div style={{ color: T.faint, fontSize: 11, marginTop: 1 }}>{label}</div>
  </div>);
}
function Card({ title, sub, children }) {
  return (<div style={{ marginTop: 12 }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
      <span style={{ color: T.ink, fontWeight: 800, fontSize: 14 }}>{title}</span>
      {sub && <span style={{ color: T.faint, fontSize: 10.5, fontFamily: T.mono, textAlign: "right", maxWidth: 150 }}>{sub}</span>}
    </div>
    <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 13, padding: 13 }}>{children}</div>
  </div>);
}
const tag = (c) => ({ fontFamily: T.sans, fontSize: 10, fontWeight: 800, color: c, border: `1px solid ${c}55`, background: `${c}14`, borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap" });
function propStr(p) { const k = Object.keys(p || {}).filter((x) => x !== "screen"); if (!k.length) return p.screen ? `screen=${p.screen}` : ""; return k.slice(0, 2).map((x) => `${x}=${p[x]}`).join(" "); }
