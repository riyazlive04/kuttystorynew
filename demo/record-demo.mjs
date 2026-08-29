#!/usr/bin/env node
/**
 * Records a public-facing walkthrough of kuttystory.co.in, fully headless.
 *
 *   1. a browser opens
 *   2. "kuttystory.co.in" is typed into the address bar, key by key
 *   3. the homepage loads
 *   4. a story is picked, a child's photo uploaded through every wizard step,
 *      the AI preview is generated for real, and checkout runs through to the
 *      Razorpay payment sheet
 *
 * Three things are deliberate:
 *
 * - The "under construction" password screen is NEVER rendered. The gate cookie
 *   is fetched from POST /site-access/unlock over the API before the first page
 *   is opened, so the browser arrives already unlocked. Nothing to edit out.
 *
 * - It stops AT the Razorpay sheet without paying. Production runs a LIVE
 *   Razorpay key: completing a payment would be a real charge against a real
 *   card and would push a real order into the print queue.
 *
 * - Headless Chromium has no window furniture, so the address bar of steps 1-2
 *   cannot be captured - it does not exist. It is drawn instead: lib/chrome-frame.html
 *   is screenshotted once per typed character to build the opening animation,
 *   then composited above the recording for the rest of the video. Everything
 *   below that strip is a genuine recording of the real site.
 *
 * Output: a real-time cut and a second cut with only the AI render wait sped up.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, devices } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

// demo/.env (gitignored) keeps the site-gate password out of shell history and
// out of the repo. Anything already in the real environment wins.
for (const line of readIfExists(path.join(HERE, ".env")).split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
function readIfExists(f) {
  try { return fs.readFileSync(f, "utf8"); } catch { return ""; }
}

// ---------------------------------------------------------------- settings --

const VIEW_W = 1440;      // recorded site area
const VIEW_H = 810;
const STRIP_H = 90;       // drawn browser chrome above it
const FPS = 12;           // frame rate of the opening title/typing sequence

const CFG = {
  site: process.env.DEMO_SITE || "https://kuttystory.co.in",
  host: process.env.DEMO_HOST || "kuttystory.co.in",
  // Only needed while the "under construction" gate is up. Once the site is
  // genuinely public this is unset and the unlock call is skipped.
  password: process.env.SITE_GATE_PASSWORD || "",
  story: process.env.DEMO_STORY || "Beach Story",
  child: process.env.DEMO_CHILD || "Yahya",
  age: process.env.DEMO_AGE || "5",
  gender: process.env.DEMO_GENDER || "Boy",
  photo: process.env.DEMO_PHOTO || path.join(ROOT, "Yahya.jpg"),
  out: process.env.DEMO_OUT || path.join(HERE, "output"),
  // Clearly-marked demo details: clicking Pay DOES create a real pending order
  // row in production, so it must be obvious in the admin list.
  buyer: {
    name: process.env.DEMO_NAME || "KuttyStory Demo",
    email: process.env.DEMO_EMAIL || "demo@kuttystory.co.in",
    phone: process.env.DEMO_PHONE || "9000000000",
    address1: process.env.DEMO_ADDR1 || "12 Marina Loop Road",
    address2: process.env.DEMO_ADDR2 || "Besant Nagar",
    city: process.env.DEMO_CITY || "Chennai",
    state: process.env.DEMO_STATE || "Tamil Nadu",
    pincode: process.env.DEMO_PIN || "600090",
  },
  renderTimeoutMs: Number(process.env.DEMO_RENDER_TIMEOUT_MS || 20 * 60 * 1000),
  speedup: Number(process.env.DEMO_SPEEDUP || 10),
  ffmpeg: process.env.FFMPEG || "ffmpeg",
  // Stop cleanly after step N. `DEMO_STOP_AFTER=4` is a ~1 minute rehearsal of
  // the fiddly parts without generating a preview or touching checkout.
  stopAfter: Number(process.env.DEMO_STOP_AFTER || 99),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const log = (...a) => console.log("  ·", ...a);
const step = (n, t) => console.log(`\n[${n}] ${t}`);

// ------------------------------------------------------- on-screen pointer --

/**
 * Headless Chromium draws no cursor, so a script-driven page looks like it is
 * clicking itself. This injects a pointer that tracks the real mouse events
 * Playwright dispatches, and a click ripple, so the video reads as someone
 * using the site. Re-injected on every navigation via addInitScript.
 */
const POINTER_SCRIPT = `
(() => {
  if (window.__ksPointer) return;
  window.__ksPointer = true;
  const add = () => {
    if (!document.body || document.getElementById("__ks_cursor")) return;
    const s = document.createElement("style");
    s.textContent = \`
      #__ks_cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;
        pointer-events:none;transform:translate(-2px,-2px);transition:opacity .2s}
      #__ks_ripple{position:fixed;width:34px;height:34px;border-radius:50%;z-index:2147483646;
        pointer-events:none;border:2px solid rgba(255,111,97,.9);opacity:0;transform:translate(-50%,-50%) scale(.3)}
      #__ks_ripple.go{animation:__ksr .5s ease-out}
      @keyframes __ksr{0%{opacity:1;transform:translate(-50%,-50%) scale(.3)}
                       100%{opacity:0;transform:translate(-50%,-50%) scale(1.5)}}\`;
    document.head.appendChild(s);
    const c = document.createElement("div");
    c.id = "__ks_cursor";
    c.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22">' +
      '<path d="M5 2l6.5 17 2.2-7 7-2.2z" fill="#1f2937" stroke="#fff" stroke-width="1.4"/></svg>';
    document.body.appendChild(c);
    const r = document.createElement("div");
    r.id = "__ks_ripple";
    document.body.appendChild(r);
    addEventListener("mousemove", (e) => {
      c.style.left = e.clientX + "px";
      c.style.top = e.clientY + "px";
    }, true);
    addEventListener("mousedown", (e) => {
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      r.classList.remove("go");
      void r.offsetWidth;
      r.classList.add("go");
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add);
  else add();
  new MutationObserver(add).observe(document.documentElement, { childList: true });
})();`;

// ------------------------------------------------------------ page actions --

/** Where the on-screen pointer currently is, so moves can be eased. */
let cursorAt = { x: VIEW_W / 2, y: 120 };

/** Glide Playwright's mouse (and so the drawn pointer) to a point. */
async function glide(page, x, y, ms = 380) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = cursorAt;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(11);
  }
  cursorAt = { x, y };
}

/** Scroll a control into view, move the pointer onto it, then click it. */
async function humanClick(page, locator, { settle = 400 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(240);
  const box = await locator.boundingBox();
  if (box) {
    await glide(page, box.x + box.width / 2, box.y + box.height / 2);
    await sleep(settle);
  }
  await locator.click();
  await sleep(160);
}

/** Click into a field, then type it out at reading speed. */
async function humanType(page, locator, text, { delay = 85 } = {}) {
  await humanClick(page, locator, { settle: 260 });
  await sleep(180);
  await locator.pressSequentially(text, { delay });
  await sleep(320);
}

/** Wheel-scroll in small steps so the page glides instead of jumping. */
async function humanScroll(page, distance, { steps = 14, pause = 55 } = {}) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await sleep(pause);
  }
  await sleep(400);
}

// ------------------------------------------------------------- chrome strip --

/**
 * Screenshot lib/chrome-frame.html into the PNGs the opening sequence is built
 * from, plus the static "loaded" strip composited over the rest of the video.
 * Returns { dir, count, loaded } - `count` frames at FPS fps.
 */
async function renderChromeFrames(browser, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: VIEW_W, height: STRIP_H } });
  const frameUrl = pathToFileURL(path.join(HERE, "lib", "chrome-frame.html")).href;

  let n = 0;
  const shot = async (params, repeat = 1) => {
    const qs = new URLSearchParams(params).toString();
    await page.goto(`${frameUrl}?${qs}`);
    const first = path.join(dir, `f${String(n).padStart(4, "0")}.png`);
    await page.screenshot({ path: first });
    n += 1;
    // Duplicating the file is how a frame is held for longer at a fixed rate.
    for (let i = 1; i < repeat; i++) {
      fs.copyFileSync(first, path.join(dir, `f${String(n).padStart(4, "0")}.png`));
      n += 1;
    }
  };

  // Empty bar, caret blinking - "a browser just opened".
  for (let i = 0; i < 3; i++) {
    await shot({ text: "", state: "typing", caret: "1" }, 4);
    await shot({ text: "", state: "typing", caret: "0" }, 4);
  }
  // Type the host one character at a time.
  for (let i = 1; i <= CFG.host.length; i++) {
    await shot({ text: CFG.host.slice(0, i), state: "typing", caret: "1" }, 2);
  }
  // Beat before Enter, then the load.
  await shot({ text: CFG.host, state: "typing", caret: "1" }, 6);
  await shot({ text: CFG.host, state: "typing", caret: "0" }, 3);
  await shot({ text: CFG.host, state: "loading", tab: CFG.host }, 8);

  await page.close();
  return { dir, count: n, seconds: n / FPS };
}

/**
 * One "loaded" strip per address the visitor actually reached, so the URL in the
 * bar tracks the journey instead of sitting on the bare domain all the way to
 * checkout. Returns the same nav entries with a `png` on each.
 */
async function renderUrlStrips(browser, dir, navs) {
  const page = await browser.newPage({ viewport: { width: VIEW_W, height: STRIP_H } });
  const frameUrl = pathToFileURL(path.join(HERE, "lib", "chrome-frame.html")).href;

  for (const [i, nav] of navs.entries()) {
    const png = path.join(dir, `url${String(i).padStart(2, "0")}.png`);
    const qs = new URLSearchParams({
      text: CFG.host,
      path: nav.path,
      state: "loaded",
      tab: nav.title || "KuttyStory",
    });
    await page.goto(`${frameUrl}?${qs}`);
    await page.screenshot({ path: png });
    nav.png = png;
  }

  await page.close();
  return navs;
}

// ------------------------------------------------------------------- main ---

async function main() {
  fs.mkdirSync(CFG.out, { recursive: true });
  if (!fs.existsSync(CFG.photo)) {
    throw new Error(`Photo not found: ${CFG.photo}\nSet DEMO_PHOTO to the image you want uploaded.`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const work = path.join(CFG.out, `.work-${stamp}`);
  const videoDir = path.join(work, "video");
  fs.mkdirSync(videoDir, { recursive: true });

  step(1, "Opening the browser (headless)");
  const browser = await chromium.launch({ headless: true });

  log("drawing the address bar frames");
  const frames = await renderChromeFrames(browser, path.join(work, "chrome"));
  log(`opening sequence: ${frames.count} frames (${frames.seconds.toFixed(1)}s)`);

  const context = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    recordVideo: { dir: videoDir, size: { width: VIEW_W, height: VIEW_H } },
    // A stock desktop UA - nothing should treat this run as a headless bot.
    userAgent: devices["Desktop Chrome"].userAgent,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    acceptDownloads: true,
  });
  await context.addInitScript(POINTER_SCRIPT);

  // Unlock the construction gate over the API, before anything is on screen.
  // This is why the password step never appears: the browser arrives with a
  // valid cookie and goes straight to the real homepage.
  if (CFG.password) {
    const unlock = await context.request.post(`${CFG.site}/site-access/unlock`, {
      data: { password: CFG.password },
    });
    if (!unlock.ok()) {
      throw new Error(
        `Could not unlock the site gate (HTTP ${unlock.status()}). Check SITE_GATE_PASSWORD.`,
      );
    }
    log("site gate unlocked via API - the password screen is never shown");
  } else {
    log("no SITE_GATE_PASSWORD set - assuming the site is already public");
  }

  const page = await context.newPage();
  const marks = {};
  const t0 = Date.now();
  const mark = (name) => (marks[name] = (Date.now() - t0) / 1000);

  // Next's app router navigates client-side, so `framenavigated` misses most of
  // the journey. Polling page.url() catches every address change, real or
  // pushState, and each one becomes a strip in the composited address bar.
  const navs = [];
  let lastUrl = "";
  const navWatch = setInterval(() => {
    const u = page.url();
    if (u === lastUrl || !u.startsWith("http")) return;
    lastUrl = u;
    const entry = { t: (Date.now() - t0) / 1000, path: new URL(u).pathname.replace(/\/$/, ""), title: "" };
    navs.push(entry);
    // The title lags the URL on a client-side route change, so read it late.
    setTimeout(() => page.title().then((x) => (entry.title = x)).catch(() => {}), 1500);
  }, 300);

  /** Close everything down and hand back the recorded file. */
  const finish = async () => {
    clearInterval(navWatch);
    const video = page.video();
    await context.close();          // must close before the video is finalised
    const raw = await video.path();
    await renderUrlStrips(browser, frames.dir, navs);
    await browser.close();
    return { raw, marks, frames, navs, work };
  };
  const stopHere = async (n) => {
    if (CFG.stopAfter > n) return null;
    step("stop", `DEMO_STOP_AFTER=${CFG.stopAfter} - ending after step ${n}`);
    await sleep(1200);
    return finish();
  };

  // --- 2 & 3. Address typed, homepage loads ------------------------------
  // The typing itself is the drawn opening sequence; here the page simply
  // arrives, timed so the composite reads as one continuous action.
  step(2, `Typing ${CFG.host} into the address bar`);
  step(3, "Homepage loads (no password screen)");
  await page.goto(CFG.site, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await sleep(2600);

  if (await page.locator("text=Site under construction").count()) {
    throw new Error("The gate is still up - the cookie did not apply. Aborting rather than filming it.");
  }
  log(`loaded: ${await page.title()}`);

  // Park the drawn pointer before the first glide, or it starts stuck at 0,0
  // (nothing has moved the mouse yet, so it has no position to track).
  await page.mouse.move(cursorAt.x, cursorAt.y);
  await sleep(300);
  await glide(page, 720, 400, 600);
  await humanScroll(page, 700);
  await humanScroll(page, 900);
  await humanScroll(page, 900);
  await sleep(900);
  await page.mouse.wheel(0, -3200);
  await sleep(1400);

  // --- 4. Pick a story ----------------------------------------------------
  step(4, "Browsing the story library");
  await humanClick(page, page.getByRole("link", { name: /Story Library/i }).first());
  await page.waitForURL(/\/stories/, { timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(2200);
  await humanScroll(page, 600);
  await sleep(1000);

  await humanClick(page, await personalizeButtonFor(page, CFG.story));
  await page.waitForURL(/\/stories\/[^/]+$/, { timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(2200);
  log(`story page: ${page.url()}`);

  const after4 = await stopHere(4);
  if (after4) return after4;

  // --- 5. Wizard step 1: the child ---------------------------------------
  step(5, "Wizard - who the story is for");
  await humanScroll(page, 500);
  await humanType(page, page.locator('input[placeholder*="Aarav"]').first(), CFG.child, { delay: 130 });

  const ageSelect = page.locator("select").first();
  if (await ageSelect.count()) {
    await humanClick(page, ageSelect, { settle: 250 });
    await ageSelect
      .selectOption({ label: `${CFG.age} years` })
      .catch(() => ageSelect.selectOption(CFG.age).catch(() => {}));
    await sleep(800);
  }

  const genderBtn = page.getByRole("button", { name: new RegExp(`^${CFG.gender}$`, "i") });
  if (await genderBtn.count()) await humanClick(page, genderBtn.first());
  await sleep(900);

  await humanClick(page, page.getByRole("button", { name: /Continue/i }).first());
  await sleep(1600);

  // --- 6. Wizard step 2: the photo ---------------------------------------
  step(6, "Wizard - uploading the photo");
  await sleep(800);

  const dropzone = page
    .getByRole("button", { name: /Tap to upload or take a photo/i })
    .or(page.getByRole("button", { name: /^Upload a photo$/i }))
    .or(page.getByRole("button", { name: /Upload from gallery/i }))
    .first();
  await humanClick(page, dropzone);

  // The guidelines dialog is part of the real flow - show it, hold on it, accept.
  const agree = page.getByRole("button", { name: /I understand/i });
  await agree.waitFor({ state: "visible", timeout: 15000 });
  log("photo guidelines shown");
  await sleep(3400);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 20000 }),
    humanClick(page, agree),
  ]);
  await chooser.setFiles(CFG.photo);
  log(`uploaded ${path.basename(CFG.photo)}`);

  // Wait for the upload and the face-quality check to settle.
  await page
    .waitForFunction(() => !/uploading/i.test(document.body.innerText), null, { timeout: 120000 })
    .catch(() => {});
  await sleep(2800);

  await humanClick(page, page.getByRole("button", { name: /Continue/i }).first());
  await sleep(1800);

  const after6 = await stopHere(6);
  if (after6) return after6;

  // --- 7. Wizard step 3: review & generate --------------------------------
  step(7, "Wizard - review and generate the free preview");
  await sleep(1400);
  await humanClick(page, page.locator('input[type="checkbox"]').first(), { settle: 500 });
  await sleep(1100);
  await humanClick(page, page.getByRole("button", { name: /Generate Free Preview/i }).first());

  // --- 8. The real render -------------------------------------------------
  step(8, "Generating the preview (real AI render)");
  await page.waitForURL(/\/preview\//, { timeout: 120000 });
  await sleep(2500);

  mark("renderStart");
  log("waiting for the render - this is the stretch the fast cut speeds up");
  const started = Date.now();
  await page.waitForFunction(
    () =>
      !/Warming up the studio|Bringing your hero to life|Creating page \d+ of/.test(
        document.body.innerText,
      ),
    null,
    { timeout: CFG.renderTimeoutMs, polling: 2000 },
  );
  mark("renderEnd");
  log(`render finished in ${Math.round((Date.now() - started) / 1000)}s`);
  await sleep(3200);

  const after8 = await stopHere(8);
  if (after8) return after8;

  // --- 9. Read the free pages, hit the paywall ----------------------------
  step(9, "Flipping through the free preview");
  const next = page.getByRole("button", { name: "Next page" });
  for (let i = 0; i < 14; i++) {
    if (await page.locator("text=Purchase to Unlock").count()) break;
    if (!(await next.count()) || (await next.isDisabled().catch(() => true))) break;
    await humanClick(page, next, { settle: 250 });
    await sleep(1500);
  }
  await sleep(2600);

  // --- 10. Choose the hardcover ------------------------------------------
  step(10, "Choosing the hardcover print");
  await humanClick(
    page,
    page
      .getByRole("button", { name: /^Print\s/ })
      .or(page.getByRole("button", { name: /Choose Print/i }))
      .first(),
  );
  await page.waitForURL(/\/checkout/, { timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(2400);

  // --- 11. Checkout -------------------------------------------------------
  step(11, "Filling in the order details");
  const b = CFG.buyer;
  await humanType(page, fieldByLabel(page, "Full name"), b.name);
  await humanType(page, fieldByLabel(page, "Phone"), b.phone);
  await humanType(page, fieldByLabel(page, "Email"), b.email);
  await humanScroll(page, 350);
  await humanType(page, fieldByLabel(page, "Address line 1"), b.address1);
  await humanType(page, fieldByLabel(page, "Address line 2"), b.address2);
  await humanType(page, fieldByLabel(page, "City"), b.city);

  const state = fieldByLabel(page, "State");
  await humanClick(page, state, { settle: 300 });
  await state.selectOption({ label: b.state });
  await sleep(900);

  await humanType(page, fieldByLabel(page, "PIN code"), b.pincode);
  await sleep(1300);
  await humanScroll(page, 400);

  // Everything past here creates a real pending order, so it is the last
  // sensible place to stop during a rehearsal.
  const after11 = await stopHere(11);
  if (after11) return after11;

  // --- 12. Payment sheet (opened, NOT paid) -------------------------------
  step(12, "Opening the Razorpay payment sheet");
  await humanClick(page, page.getByRole("button", { name: /^Pay\s/ }).first());

  await page.locator(".razorpay-container").waitFor({ state: "visible", timeout: 90000 });

  // The container appears about ten seconds before Razorpay paints anything
  // into it. Holding on the empty white box is the whole payment step wasted,
  // so wait for the options themselves to render before the pause.
  await page
    .frameLocator(".razorpay-container iframe")
    .first()
    .getByText(/Payment Options|Netbanking|Wallet/i)
    .first()
    .waitFor({ timeout: 60000 })
    .then(() => log("Razorpay sheet painted - UPI / cards / netbanking visible"))
    .catch(() => log("Razorpay sheet did not paint in time - holding anyway"));
  await sleep(1200);
  log("NOT paying - the sheet is shown, then dismissed");
  await sleep(8000);

  // Dismiss without touching anything inside the payment iframe.
  await page.keyboard.press("Escape");
  await sleep(2500);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(3000);

  step(13, "Wrapping up");
  return finish();
}

// --------------------------------------------------------------- helpers ----

/** Checkout inputs are wrapped in a <label> whose text is the field name. */
function fieldByLabel(page, label) {
  return page
    .locator("label")
    .filter({ hasText: new RegExp(`^\\s*${label}`, "i") })
    .locator("input, select")
    .first();
}

/**
 * Story cards navigate with router.push, not an <a href>, so the wanted book is
 * found by matching the card that contains its title.
 */
async function personalizeButtonFor(page, title) {
  const card = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .filter({ has: page.getByRole("button", { name: /Personalize Story/i }) })
    .last();
  if (await card.count()) {
    return card.getByRole("button", { name: /Personalize Story/i }).first();
  }
  log(`"${title}" not found on the library page - using the first story instead`);
  return page.getByRole("button", { name: /Personalize Story/i }).first();
}

// ----------------------------------------------------------------- render ---

/**
 * Compose the final videos: the drawn opening sequence, then the real recording
 * with the address-bar strip fixed above it.
 */
async function compose({ raw, marks, frames, navs, work }, outBase) {
  const H = VIEW_H + STRIP_H;
  const bodyLen = await duration(raw);

  // 1. Opening sequence: chrome strip animating over a blank page.
  const intro = path.join(work, "intro.mp4");
  await run(CFG.ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-framerate", String(FPS), "-i", path.join(frames.dir, "f%04d.png"),
    "-vf", `pad=${VIEW_W}:${H}:0:0:white,fps=25,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", intro,
  ]);

  // 2. The journey, with the address bar pinned above it - swapping to the
  //    right URL as the visitor navigates. Each strip is enabled only for the
  //    span it was current, so the bar tracks the journey.
  const shown = navs.filter((n) => n.png);
  const body = path.join(work, "body.mp4");
  const inputs = ["-i", raw];
  let chain = `[0:v]scale=${VIEW_W}:${VIEW_H},pad=${VIEW_W}:${H}:0:${STRIP_H}:white[b0];`;
  shown.forEach((nav, i) => {
    inputs.push("-i", nav.png);
    // The first strip covers from zero, so no gap before the first navigation.
    const from = i === 0 ? 0 : nav.t;
    const to = i === shown.length - 1 ? bodyLen + 5 : shown[i + 1].t;
    chain +=
      `[b${i}][${i + 1}:v]overlay=0:0:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[b${i + 1}];`;
  });
  chain += `[b${shown.length}]fps=25,format=yuv420p[out]`;

  await run(CFG.ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    ...inputs,
    "-filter_complex", chain, "-map", "[out]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", body,
  ]);

  // 3. Join them.
  const full = `${outBase}.mp4`;
  await run(CFG.ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", intro, "-i", body,
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[out]",
    "-map", "[out]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", full,
  ]);

  // 4. The watchable cut - same video, only the render wait sped up. Marks are
  //    relative to the recording, so shift them past the opening sequence, and
  //    keep a second of real time at each end so no real action is sped through.
  const intoBody = await duration(intro);
  const a = marks.renderStart != null ? marks.renderStart + intoBody + 1 : null;
  const b = marks.renderEnd != null ? marks.renderEnd + intoBody - 1 : null;
  if (!(a > 0) || !(b > a + 5)) return { full, fast: null };

  const fast = `${outBase}-fastcut.mp4`;
  await run(CFG.ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", full,
    "-filter_complex",
    `[0:v]trim=0:${a.toFixed(3)},setpts=PTS-STARTPTS[v0];` +
    `[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=(PTS-STARTPTS)/${CFG.speedup}[v1];` +
    `[0:v]trim=start=${b.toFixed(3)},setpts=PTS-STARTPTS[v2];` +
    `[v0][v1][v2]concat=n=3:v=1:a=0[out]`,
    "-map", "[out]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", fast,
  ]);
  return { full, fast };
}

function duration(file) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(parseFloat(out.trim()) || 0));
    p.on("error", () => resolve(0));
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on("error", reject);
  });
}

// ------------------------------------------------------------------- run ----

main()
  .then(async (result) => {
    const stamp = path.basename(result.work).replace(".work-", "");
    const outBase = path.join(CFG.out, `kuttystory-demo-${stamp}`);
    step("render", "Composing the video");
    const { full, fast } = await compose(result, outBase);
    console.log("\nDone.");
    console.log("  real time :", full);
    if (fast) console.log(`  fast cut  : ${fast}   (${CFG.speedup}x through the AI render wait)`);
    else console.log("  fast cut  : skipped (no long render wait to compress)");
  })
  .catch((err) => {
    console.error("\nFAILED:", err.message);
    process.exitCode = 1;
  });
