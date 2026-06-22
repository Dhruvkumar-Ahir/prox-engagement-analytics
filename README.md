# Prox — App Engagement & Analytics

**Track B take-home: "Track where users engage, drop off, and fail."**

A mobile-first grocery-savings app where **every user action fires a typed analytics event**, and the analytics live **inside the app itself** — a third bottom-nav tab, **Insights**, that derives a conversion funnel, live drop-off detection, error breakdown, engagement metrics, auto-generated recommendations, and a live event stream entirely from that event log. No separate dashboard, no external tool — one self-contained app.

The app ships seeded with **260 simulated user sessions** so Insights is genuinely analytical the moment you open it. The session you drive is appended in real time, so you watch your own behavior move through the funnel as you tap.

The app has three surfaces, all in one phone:
- **Shop** — search → deals → save → cart → checkout
- **Recipes** — recipe → add ingredients to cart (recipe-to-cart flow)
- **Insights** — the live, in-app analytics screen

---

## Run it

```bash
npm install
npm run dev      # open the printed localhost URL
```

Build: `npm run build` → `npm run preview`.

> The whole app is one self-contained component at `src/App.jsx` (tracker, mock data, all screens, and the analytics) so it can also be dropped straight into any React playground.

### How to use the demo
1. **Onboarding** — pick stores, enter a ZIP. The bottom nav (Shop · Recipes · Insights) appears once setup is done.
2. **Shop** — search a product, open a deal, save it, add to cart, place an order.
3. **Recipes** — open a recipe and add ingredients to your cart.
4. **Insights** — every action above shows up here live; your own events are tagged `you`.
5. Things to try on purpose:
   - Search **"caviar"** → triggers `search_no_results` + `error_shown` (no-results failure path).
   - **Place an order** → checkout fails ~28% of the time on purpose (`checkout_failed`), with a retry path.
   - **Reset session**, then abandon early → the Insights "live session" strip shows exactly where you dropped off.

Every event is also `console.log`'d as `[track] <name> <props>` — in a real app that payload is what you'd forward to the analytics SDK.

---

## 1. User flow

The core flow has 8 tracked stages (more than the required 3):

`Opened app → Finished setup → Searched → Opened a deal → Saved a deal → Added to cart → Started checkout → Placed order`

Onboarding is a sub-flow (welcome → pick retailers → enter ZIP), there's a parallel **recipe-to-cart** path, and deliberate failure branches at search (no results) and checkout (payment declined).

## 2. Event tracking plan — what I track and why

Events use a consistent schema so they aggregate cleanly:

```js
{ id, name, ts, sessionId, screen, props }
```

Naming convention: `object_action`, snake_case, past tense for completed actions. Properties carry the *why it matters*, not just the *that it happened*.

| Event | Key properties | Why it's tracked |
|---|---|---|
| `app_opened` | — | Top of funnel / session count denominator |
| `screen_view` | `screen` | Powers "most engaged screen" + screen-level drop-off |
| `onboarding_started` | — | Measures setup intent vs. completion |
| `onboarding_retailers_selected` | `count`, `retailers` | Is store-picking a friction step? Which stores matter? |
| `onboarding_zip_entered` | `zip` | Last onboarding gate before value is delivered |
| `onboarding_completed` | — | Activation milestone |
| `search_submitted` | `query`, `results_count` | Demand signal; `results_count: 0` flags catalog gaps |
| `filter_applied` | `filter`, `value`, `query` | Do filters help users find deals or add friction? |
| `deal_viewed` | `deal_id`, `retailer`, `savings`, `source` | Core engagement; `source` separates search vs. browse |
| `deal_saved` / `deal_unsaved` | `deal_id`, `retailer` | Intent signal; unsave = re-evaluation/regret |
| `cart_item_added` | `deal_id`, `price`, `retailer` | Purchase intent |
| `cart_viewed` | — | Pre-checkout consideration |
| `recipe_viewed` | `recipe_id`, `name` | Engagement on the recipe-to-cart path |
| `recipe_ingredient_added` | `recipe_id`, `deal_id`, `bulk` | Recipe → cart conversion; `bulk` = "add all" |
| `checkout_started` | `items`, `total` | Conversion intent |
| `checkout_completed` | `items`, `total`, `savings` | The money event; `savings` = the value we deliver |
| `checkout_failed` | `reason` | Payment/technical failure — revenue leak |
| `search_no_results` | `query` | Demand we can't fulfill — roadmap input |
| `error_shown` | `type`, `message` | Catch-all error surface for any user-visible failure |

**Design principles behind the plan**

- **Every event answers a product question.** `search_submitted` carries `results_count` specifically so a zero-result search is detectable without a second event.
- **Funnel-shaped.** The eight headline events line up as a funnel so conversion and drop-off fall out of the data directly.
- **Source attribution.** `deal_viewed.source` distinguishes deals found via search vs. browsing — different optimization levers.
- **Failures are first-class events**, not just logs, so they sit in the same stream and can be funnel-correlated (e.g. "checkout-starters who hit `checkout_failed`").
- **Value captured at the moment it lands** — `checkout_completed.savings` records the dollars saved, which is Prox's north-star outcome.

## 3. Drop-off & failure tracking

The Insights screen identifies, from the event log alone:

- **Where each session stopped** — per-session "furthest funnel step reached." The live-session strip shows your current step and the step you'd be counted as dropping at if you abandoned now.
- **Failed actions** — `checkout_failed` with a reason, surfaced in the "Where people get stuck" card.
- **Error states** — `search_no_results` / `error_shown`, counted and broken down by type.
- **Completion** — `checkout_completed` presence marks a finished flow.

The funnel automatically flags the **largest drop-off** step in red, and the headline banner restates it in plain language.

## 4. In-app analytics screen (Insights tab)

Analytics is built **into the app** as the third bottom-nav tab — not a separate dashboard or tool. It recomputes live from the combined event array (260 seeded sessions + your live session) every time you act, so it stays internally consistent. It shows:

- **Headline insight** — auto-generated takeaway naming the biggest drop-off and key rates.
- **Live session strip** — your progress through the funnel + current drop-off point.
- **Metric grid** — searches, filters, deals opened, deals saved, recipes viewed, ingredients added, orders placed, errors.
- **Funnel** — step-to-step conversion %, biggest-leak highlighted in red.
- **What people search for** — top searches with frequency, no-result flags, and the search→deal rate.
- **Where people get stuck** — error breakdown, most engaged screen, checkout-completion rate, save rate.
- **What we'd do about it** — recommendations generated from the live numbers.
- **Every tap, as it happens** — live event stream, newest first, your events tagged `you`.

## 5. Product recommendations (from the seeded data)

I tuned the 260-session simulation to behave like a real grocery app, then read Insights the same way I would on the job. Here's what I see and what I'd do about it.

**Where people engage most.** Search and the home screen carry the most traffic — search is clearly the front door for finding deals. Saving is sticky too: most people who open a deal end up saving it, so the "is this worth it" judgment isn't the problem. The intent is there.

**Where people drop off.** Three leaks stand out:

1. **Search → opening a deal.** This is the biggest one — lots of people search but never tap a result. My read is that the results don't sell the savings hard enough at a glance, or the matches feel weak. This is the cheapest, highest-leverage fix.
2. **Checkout → order placed.** A big chunk of people who start checkout never finish. Some of that is the simulated payment failures, but in the real world this is the classic place revenue quietly leaks out.
3. **Onboarding.** A slice of users never finish setup. We ask for store preferences and a ZIP code *before* showing any value, which is friction at the worst possible moment.

**What I'd change.**
- **Sell the savings in the results list.** Each row already shows % off and the old price crossed out — I'd default the sort to biggest savings first and A/B test it, to pull more searchers into a deal.
- **Show value before asking for setup.** Let people see local deals first and make retailer/ZIP optional or auto-detected. Earn the setup instead of gating on it.
- **Make checkout failures recoverable.** The prototype already offers an inline retry on a failed payment; I'd add a saved cart ("we'll hold your deals") and an alert whenever `checkout_failed` spikes, since that's pure lost money.
- **Treat every no-result search as a request.** A zero-result query is someone telling us what to stock. I'd route the top ones straight to the merchandising team.
- **Turn saves into trips.** Saved deals are intent we're not cashing in — price-drop alerts on saved items are the obvious nudge.

## How I'd ship this for real

The tracker here is deliberately a thin wrapper, so swapping it for a real analytics SDK is basically a one-line change inside `track()`:

- **PostHog / Mixpanel / Amplitude** — replace the `console.log` in `track()` with `posthog.capture(name, props)` (or `mixpanel.track` / `amplitude.track`). My event names and properties map 1:1 to their model, and their built-in funnel tools would recreate this dashboard's funnel natively.
- **Firebase / Google Analytics 4** — use `logEvent(analytics, name, props)`; names are already snake_case and short enough to be GA4-compliant. GA4's funnel exploration gives the same drop-off view.
- **Supabase / a warehouse** — if we want to own the raw events, `POST` each one to a Supabase table (or Postgres via an Edge Function) and write the funnel/retention logic in SQL, with something like Metabase on top for the dashboard.

If I were taking this to production I'd also add: a stable per-user ID (not just per-session), client-side event batching with a retry queue so tracking survives flaky networks, a consent gate before anything fires, and a single typed event registry so event names can't drift over time — the `FUNNEL` and event constants in `App.jsx` are already the seed of exactly that.

---

## Repo layout

```
prox-analytics/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    └── App.jsx     ← tracker + mock data + Shop/Recipes/Insights (single file)
```

## Notes: assumptions, tradeoffs & limitations

**Assumptions**
- Modeled one cohesive savings journey (browse/search → save → cart → checkout) plus a recipe-to-cart path, rather than every possible flow.
- The 260 "historical" sessions are simulated with realistic drop-off probabilities so the analytics is meaningful on first load; in production these would be real events.
- Checkout failure is forced ~28% of the time on purpose, to demonstrate the failure-tracking path.

**Tradeoffs**
- Built the analytics *into the app* (Insights tab) instead of wiring a real tool like PostHog/Mixpanel, to keep it self-contained and reviewable — but the `track()` function is a one-line swap to a real SDK.
- Kept everything in one `App.jsx` file for easy review over "proper" file-by-file structure.
- Events live in React state, so they reset on refresh (no backend/persistence) — a deliberate scope cut for a prototype.

**Limitations**
- No persistence (refresh clears the live session), no real auth or user identity (session-scoped IDs only), and no real payment/catalog backend.
- Funnel is single-path; real analysis would handle branching journeys and returning users.
- Recommendations are derived from simulated data, so they illustrate the *method*, not real Prox findings.