# Get Calo — Pre-Launch Audit Report

**Product:** Get Calo (Expo / React Native / Web)  
**Repo:** `farq-tech/Get-calo` · **Live web:** https://get-calo-web.vercel.app  
**Audit date:** 2026-07-25  
**Scope:** Code-verified review of `mobile/` screens, hooks, inference, Vercel API, persistence, i18n, store config. Device lab / App Store Connect forms = **Unverified-Needs-Device** where noted.  
**Primary surface today:** **Web (Vercel)**. Native iOS/Android paths exist but are not production-ready for store submission.

**Audit stance:** Principal-engineer review for a product that may be used at scale. Brutal honesty. Praise only where earned.

---

## Executive Summary

Get Calo is a polished **camera → analyze → calories → history** demo with strong visual craft (dark teal system, Syne + IBM Plex Arabic, cinematic analyze overlay). The **core happy path on web works**: grant camera / upload → scan → result → save → history.

It is **not ready for a mass-market or App Store launch**.

Three structural problems dominate:

1. **Trust / privacy lie:** UI says photos are analyzed securely and discarded / “on-device”; production web **uploads full images to Google Gemini** via an open `/api/analyze-food` proxy.
2. **Open AI proxy:** Unauthenticated `Access-Control-Allow-Origin: *`, no rate limit → quota theft and cost risk.
3. **Native data loss:** Meal/settings persist via `localStorage` only → **no-op on iOS/Android**.

Secondary but launch-relevant: cancel mid-scan races, plate correction corrupting multi-item state, missing privacy policy URL, incomplete RTL/a11y, fake scan progress theater, ~12MB ONNX still bundled while cloud is primary.

### Launch Score: **48 / 100**

| Scorecard | Score | Notes |
|-----------|------:|-------|
| Design | **72** | Cohesive dark brand; some dead chrome & token drift |
| UX | **55** | Happy path clear; cancel/error/privacy/empty states weak |
| Performance | **58** | Web path OK; heavy assets + no abort/timeout |
| Accessibility | **42** | Labels sparse; contrast/muted; reduced motion partial |
| Security | **28** | Open Gemini proxy + CORS *; secrets posture mixed |
| Reliability | **45** | Race on cancel/rescan; native persist broken |
| App Store Readiness | **25** | No policy URL; permission/docs mismatch; no deletion UX |

### Go / No-Go

| Target | Decision |
|--------|----------|
| **Closed web beta / friends & family** | **Conditional Go** — after privacy copy fix + API rate limit |
| **Public web launch** | **No-Go** until API auth/rate-limit + honest privacy + timeouts |
| **App Store / Play** | **Hard No-Go** — privacy policy, AsyncStorage, permissions cleanup, crash races |

---

## Routes & Primary CTAs

| Route | Purpose | Primary CTA |
|-------|---------|-------------|
| `/` | Brand splash (~1.8s) | Auto → `/camera` |
| `/camera` | Capture / upload / demo | Shutter / Enable camera / Upload |
| *(overlay)* | Analyzing “Get Calo” | Back (cancels) |
| `/result` | Calories, plate breakdown, serving | Save meal |
| `/correct` | Catalog search / override | Use this item |
| `/history` | Saved meals + daily goal % | Scan a meal |
| `/settings` | Language, goal, privacy rows | Language / cycle goal |

---

## Critical Bugs (Must Fix Before Any Public Launch)

### C1 — Misleading privacy / on-device claims vs Gemini cloud
- **Severity:** Critical  
- **Where:** `en.json` / `ar.json` (`permissionPrivacy`, `settings.onDevice*`, `privacy`); `settings.tsx`; `ScanProgressOverlay` footer `camera.onDevice`; `aiVision.ts` + `useInference.ts` (web AI always on)  
- **Repro:** Scan on web → network shows POST `/api/analyze-food` with base64 image while UI says discarded / secure recognition.  
- **Root cause:** Cloud path shipped; copy never updated.  
- **Impact:** User trust breach; App Store 5.1.1 / GDPR-style risk; reviewers reject.  
- **Fix:** Honest copy (“Photo is sent for analysis, then discarded by us”); optional opt-in; or force on-device-only for store builds.  
- **Effort:** S–M  

### C2 — `/api/analyze-food` is a public unpaid Gemini proxy
- **Severity:** Critical  
- **Where:** `mobile/api/analyze-food.js` — `Access-Control-Allow-Origin: *`, no auth, no rate limit  
- **Repro:** `curl -X POST https://get-calo-web.vercel.app/api/analyze-food -d '{"imageBase64":"..."}'` from any origin.  
- **Root cause:** Serverless handler designed for demo convenience.  
- **Impact:** API key burn, cost runaway, abuse.  
- **Fix:** Origin allowlist, signed/short-lived tokens or auth, per-IP rate limits, Vercel WAF, body size already partially capped — tighten further.  
- **Effort:** M  

### C3 — Native persistence is a no-op (`localStorage` only)
- **Severity:** Critical (for native); High (for “one codebase” claims)  
- **Where:** `useMealStore.ts`, `useSettingsStore.ts` — both branches use `webStorage` / `localStorage`  
- **Repro:** Save meals + change goal/language on iOS/Android → kill app → data gone.  
- **Root cause:** Never wired AsyncStorage/SecureStore.  
- **Impact:** History/goals/language lost; feels broken.  
- **Fix:** Platform storage adapter; migrate keys.  
- **Effort:** M  

### C4 — Cancel + rescan race (stale result can win)
- **Severity:** Critical  
- **Where:** `useInference.ts` single `cancelledRef`; `camera.tsx` `runScan` → `router.push('/result')` on any truthy result; no `AbortController`  
- **Repro:** Start scan → Back → immediately shutter again → prior request may complete and navigate with wrong meal.  
- **Root cause:** Cancel clears a shared flag; new scan resets it before old promise finishes.  
- **Impact:** Wrong calories shown; user loses trust.  
- **Fix:** Monotonic `scanId`; abort fetch; ignore stale completions; `replace` once.  
- **Effort:** M  

---

## High Priority Issues

### H1 — Cancel shows false “Scan failed”
- **Severity:** High  
- **Repro:** Start scan → overlay Back → error banner.  
- **Root cause:** `cancel` returns `null`; camera treats all null as failure.  
- **Fix:** Cancelled sentinel; suppress error.  
- **Effort:** S  

### H2 — Correcting a plate overwrites totals but leaves stale `items[]`
- **Severity:** High  
- **Where:** `useScanStore.applyNutritionOverride`  
- **Repro:** Multi-item result → Change → pick one catalog item → UI may still show old plate breakdown vs new totals.  
- **Fix:** Clear or rebuild `items` on override.  
- **Effort:** S  

### H3 — “Saved” then change serving still shows Saved (data mismatch)
- **Severity:** High  
- **Where:** `result.tsx` `saved` flag not reset on `servingIdx` change  
- **Repro:** Save → change serving chip → button still “Saved”; history has old macros.  
- **Fix:** Reset `saved` when factor/nutrition changes; or update last meal.  
- **Effort:** S  

### H4 — No request timeouts / abort on analyze
- **Severity:** High  
- **Where:** `aiVision.ts` `fetch`; `analyze-food.js` Gemini `fetch`  
- **Impact:** Hung UI; spend after user leaves.  
- **Fix:** AbortController + 20–30s timeouts server/client.  
- **Effort:** S–M  

### H5 — ORT loaded from jsDelivr without SRI / CSP
- **Severity:** High  
- **Where:** `ortSession.ts`  
- **Impact:** CDN compromise = XSS in app origin.  
- **Fix:** Self-host WASM + SRI + CSP.  
- **Effort:** M  

### H6 — No privacy policy URL / App Store deletion story
- **Severity:** High (store)  
- **Verified:** No policy link in Settings or `app.json`.  
- **Fix:** Host policy; link in Settings + store metadata; “Clear my data” for local history (+ explain cloud).  
- **Effort:** M  

### H7 — Permission / capability mismatch
- **Severity:** High  
- **Verified:** Photo Library usage string claims correction photo saves; `correct.tsx` passes `imageUri: null`. Extra Android permissions likely via Expo camera defaults.  
- **Fix:** Remove unused strings/permissions or implement.  
- **Effort:** M  

### H8 — Native permission denial dead-end
- **Severity:** High (native)  
- **Where:** `camera.tsx` only `requestPermission()`  
- **Fix:** Detect `canAskAgain === false` → Open Settings CTA.  
- **Effort:** S  

### H9 — Supabase anon key in bundle + anonymous feedback writes
- **Severity:** High (depends on RLS — **verify in dashboard before launch**)  
- **Fix:** Confirm insert-only RLS, no public read; rate limit; signed uploads if photos enabled.  
- **Effort:** M  

### H10 — No security headers on Vercel SPA
- **Severity:** High  
- **Where:** `vercel.json` cache only  
- **Fix:** CSP, `frame-ancestors 'none'`, HSTS, Referrer-Policy, Permissions-Policy.  
- **Effort:** S  

---

## Medium Issues

| ID | Issue | Severity | Effort |
|----|-------|----------|--------|
| M1 | Web denied camera still shows “Enable camera” as primary | Medium | S |
| M2 | Arabic language alert hardcoded English | Medium | S |
| M3 | RTL incomplete (absolute `left`, row value align, search input) | Medium | M |
| M4 | Serving chips opaque (1 / 1.33 / 1.9× grams only) | Medium | S |
| M5 | MacroBar fixed maxG=80 misleading | Medium | S |
| M6 | Catalog suggestion chips duplicate list | Medium | S |
| M7 | No delete meal in history (`clearMeals` unused) | Medium | M |
| M8 | Confidence thresholds 0.45 vs 0.6 disagree | Medium | S |
| M9 | Double splash (boot + 1.8s) slows first scan | Medium | S |
| M10 | Client image size not capped before upload | Medium | S |
| M11 | Weak API validation (mime/locale) | Medium | S |
| M12 | Gemini key in query string | Medium | S |
| M13 | Scan progress steps are timed theater, not real progress | Medium | M |
| M14 | Silent fallback to ONNX/mock hides cloud failure | Medium | S |
| M15 | ~12MB ONNX + CDN ORT cost for fallback path | Medium | M |
| M16 | Web vs native camera chrome diverge | Medium | M |
| M17 | Icon-only controls missing a11y labels | Medium | S |
| M18 | `textMuted` contrast borderline/failing on elevated surfaces | Medium | S |
| M19 | Reduced motion incomplete (splash, shutter, MacroBar) | Medium | S |
| M20 | No Dynamic Type / font scale | Medium | M |
| M21 | Docs/README still claim on-device-only inference | Medium | S |
| M22 | Package name `snapcal-mobile` / scheme `calora` brand drift | Medium | S |

---

## Low Issues / Quick Wins

- Dead components: `BrandMark`, `ConfidenceBadge`, unused `SettingsRow`, unused i18n keys (`modeFood*`, `webTitle`, `multiItem*`, haptics UI missing).  
- History “Week” = rolling 7 days; numbers forced `en-US`.  
- Shutter a11y label English-only.  
- Chips/tabs &lt; 44pt height.  
- `lint` script without eslint dependency.  
- Empty history has no in-body CTA (footer only).  
- `noFood` result state thin; unused richer copy exists.  

---

## Category Deep Dives

### 1. User Experience
**First impression:** Strong brand splash → camera. Good for demo; slow for utility (double wait).  
**Hierarchy:** Analyze overlay centers **Get Calo** clearly (good). Result calories dominate (good).  
**Discoverability:** Catalog + Demo labeled on web (improved); flash unlabeled on native.  
**Errors:** Cancel = false failure; denied camera not branched; cloud fail can silently degrade.  
**Success:** Save toast + Saved state (good) but serving mismatch (H3).  
**Cognitive load:** Serving math opaque; privacy claims create false mental model.  
**One-handed / thumb:** Shutter dock OK on web after Safari pad fix; mode clutter already removed (good).  
**RTL:** Partial — not shippable as “full Arabic” without device pass.  

### 2. UI Consistency
Dark teal tokens largely consistent. Issues: unused glass/credit animation leftovers; native vs web chrome; opaque serving chips vs semantic design language elsewhere; settings footer clean (Made with love only — good).  

### 3. Product Logic
Users can: misunderstand local vs cloud; get stuck on permission deny (native); pollute history with no delete; duplicate conceptual “save” after portion change; trust fake step progress. No purchases (N/A). No accidental delete (also no intentional delete).  

### 4. Functional QA (code-verified)
Buttons/routes largely wired. Gaps: cancel path, plate override, permission forever-deny, offline not first-class, no pull-to-refresh, no deep links beyond expo-router, notifications N/A, auth N/A.  

### 5. Performance
Cold web: large JS (~3.5MB) + optional 12MB ONNX. Gemini latency dominates scans. No abort → wasted work. No measured FPS here (**Unverified-Needs-Device**).  

### 6. Accessibility
Incomplete labels, muted contrast, partial reduced motion, no Dynamic Type, scan steps not announced.  

### 7. Security
See C2, H5, H9, H10. No user auth. Clipboard unused (good). Meal names via RN Text (low XSS).  

### 8. Network
No retries/backoff; no timeouts; CORS *; offline falls through poorly; 401/429 not specially handled.  

### 9. Animations
Overlay timing is intentional and cinematic. Splash/shutter ignore reduced motion. Progress is not tied to real inference (trust issue more than jank).  

### 10. App Store Readiness
Missing: privacy policy URL, accurate nutrition labels, account/data deletion, permission hygiene, Privacy Manifest verification, filled EAS submit metadata, honest AI disclosure.  

### 11. Crash Hunting (theoretical + code)
Highest real crash/wrong-state risks: C4 race, huge data URLs in memory, ORT load failures, native storage empty. Orientation locked portrait. **Device spam tests Unverified.**  

### 12. Code Review
Large screens (`camera` ~710, overlay ~600); duplicate storage helpers; dead code; magic numbers; eslint script broken; architecture split cloud/YOLO not reflected in UX.  

### 13. Business Review
First-time user **can** understand “scan food → get calories” in &lt;30s on web. Trust erodes if they open Network tab or read Settings carefully. Drop-offs: permission gate, long analyze, wrong meal with no easy delete, Arabic restart friction. Recommend to friends: yes as novelty demo; no as nutrition source of truth yet.  

---

## Top 20 Recommendations (ordered)

1. Rewrite all privacy/on-device copy to match Gemini reality (or disable cloud).  
2. Lock `/api/analyze-food`: auth or signed tokens + CORS allowlist + rate limit.  
3. Add client/server timeouts + AbortController; fix cancel vs fail.  
4. Scan generation IDs to kill stale races.  
5. AsyncStorage (native) for meals + settings.  
6. Host Privacy Policy + Settings link + Clear local data.  
7. Fix plate override to clear/rebuild `items`.  
8. Reset Saved when serving changes.  
9. Self-host ORT + CSP/security headers.  
10. Verify Supabase RLS for feedback.  
11. Client image downscale before upload.  
12. Branch denied/unavailable camera UI.  
13. Native open-settings for permanent camera denial.  
14. Semantic serving labels.  
15. Meal delete in history.  
16. Unify confidence threshold.  
17. Full a11y label pass + muted contrast fix.  
18. Complete reduced-motion gating.  
19. RTL audit with `start/end` + Arabic alert i18n.  
20. Align README, package name, bundle ID, and store metadata with **Get Calo**.  

---

## Must Fix Before Launch (checklist)

**Public web**
- [ ] Honest privacy copy  
- [ ] API auth/CORS/rate limit  
- [ ] Timeouts + cancel correctness  
- [ ] Scan id race fix  
- [ ] Security headers  

**App Store / Play**
- [ ] Everything above  
- [ ] Privacy policy URL  
- [ ] AsyncStorage  
- [ ] Permission string/capability cleanup  
- [ ] Clear data UX  
- [ ] Device QA: VoiceOver, RTL cold start, deny camera, cancel/rescan spam  

---

## Nice To Have

- Real progress from request phases  
- Healthy alternatives / barcode (future features)  
- Editable typed daily goal (beyond cycle)  
- Recents in catalog  
- Lazy ONNX only on fallback  
- Haptics settings row (store field exists)  
- Horizontal demo video + voiceover  

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Gemini key drained | High if public | High $ | Rate limit + auth now |
| Privacy complaint / store reject | High | High | Copy + policy |
| Wrong meal after cancel | Medium | High trust | Scan ids |
| Native users lose history | Certain if shipped | High | AsyncStorage |
| XSS via CDN ORT | Low | Critical | Self-host |

---

## What Is Genuinely Good

- Clear single-job product loop.  
- Visual system (teal, type, analyze choreography) is above typical AI demos.  
- Web Safari shutter/dock work shows real mobile-web care.  
- Multi-item plate breakdown is a real differentiator when Gemini returns items.  
- EN/AR i18n foundation exists (needs RTL finish).  
- Meal persist on **web** localStorage works for demos.  

Do not confuse craft with launch readiness.

---

## Final Recommendation

**No-Go for public launch and stores.**  
**Conditional Go for private web beta** after fixing Critical C1–C2 and High H1/H4 at minimum.

Treat this as a strong prototype with production-shaped UI sitting on demo-grade security, privacy honesty, and native reliability.

---

*Report generated from static/code verification of `/agent/mobile` on 2026-07-25. Performance FPS, VoiceOver, and store form completeness require device / ASC verification.*
