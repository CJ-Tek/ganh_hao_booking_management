/**
 * Capture guide screenshots from a running dev server.
 *
 * Prerequisites:
 *   npm run dev
 *   npx playwright install chromium
 *
 * Environment:
 *   GUIDE_SCREENSHOT_BASE_URL=http://localhost:3000
 *   GUIDE_SCREENSHOT_USERNAME=<admin account>
 *   GUIDE_SCREENSHOT_PASSWORD=<password>
 *
 * For clean images without the Next.js dev icon, capture against production:
 *   npm run build && npm run start
 *   (devIndicators only affects `next dev`; production has no dev overlay)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../public/guide/screenshots");

const BASE_URL = process.env.GUIDE_SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const USERNAME = process.env.GUIDE_SCREENSHOT_USERNAME;
const PASSWORD = process.env.GUIDE_SCREENSHOT_PASSWORD;

const AUTHENTICATED_TARGETS = [
  { key: "select-branch", path: "/select-branch" },
  { key: "dashboard", path: "/dashboard" },
  { key: "floor-map", path: "/floor-map" },
  { key: "bookings", path: "/bookings" },
  { key: "calendar", path: "/calendar" },
  { key: "tables", path: "/tables" },
  { key: "customers", path: "/customers" },
  { key: "notifications", path: "/notifications" },
  { key: "areas-tables", path: "/settings/areas-tables" },
  { key: "booking-rules", path: "/settings/booking-rules" },
  { key: "branches", path: "/settings/branches" },
  { key: "users", path: "/settings/users" },
  { key: "account", path: "/settings/account" },
  { key: "guide", path: "/guide" },
];

const HIDE_NEXT_OVERLAY_CSS = `
  nextjs-portal,
  [data-nextjs-dev-overlay],
  [data-nextjs-toast],
  [data-next-mark],
  #__next-build-watcher,
  [data-nextjs-dev-tools-button],
  button[aria-label*="Next.js"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
`;

async function installOverlayBlocker(context) {
  await context.addInitScript((css) => {
    const inject = () => {
      const styleId = "guide-screenshot-hide-next-overlay";
      if (document.getElementById(styleId)) {
        return;
      }
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    };

    inject();

    const observer = new MutationObserver(() => {
      inject();
      for (const portal of document.querySelectorAll("nextjs-portal, [data-nextjs-dev-overlay]")) {
        portal.remove();
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }, HIDE_NEXT_OVERLAY_CSS);
}

async function hideNextOverlay(page) {
  await page.evaluate(() => {
    const removeFromRoot = (root) => {
      for (const node of root.querySelectorAll(
        "nextjs-portal, [data-nextjs-dev-overlay], [data-nextjs-toast], [data-next-mark], #__next-build-watcher, [data-nextjs-dev-tools-button]"
      )) {
        node.remove();
      }
      for (const host of root.querySelectorAll("*")) {
        if (host.shadowRoot) {
          removeFromRoot(host.shadowRoot);
        }
      }
    };

    removeFromRoot(document);

    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        if (iframe.contentDocument) {
          removeFromRoot(iframe.contentDocument);
        }
      } catch {
        // ignore cross-origin frames
      }
    }
  });
}

async function captureScreenshot(page, outputPath) {
  await hideNextOverlay(page);
  await page.screenshot({ path: outputPath, fullPage: false });
}

async function waitForPortalReady(page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function confirmBranchIfNeeded(page) {
  if (!page.url().includes("/select-branch")) {
    return;
  }

  const workButton = page.getByRole("button", { name: "Làm việc tại đây" }).first();
  if (!(await workButton.isVisible().catch(() => false))) {
    return;
  }

  await workButton.click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Tiếp tục" }).click({ timeout: 10_000 }).catch(() => undefined);

  const leftSelectBranch = await page
    .waitForURL((url) => !url.pathname.includes("/select-branch"), { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!leftSelectBranch) {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  }

  await waitForPortalReady(page);
}

async function login(page) {
  if (!USERNAME || !PASSWORD) {
    throw new Error(
      "Set GUIDE_SCREENSHOT_USERNAME and GUIDE_SCREENSHOT_PASSWORD before running capture."
    );
  }

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Tên đăng nhập").fill(USERNAME);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await waitForPortalReady(page);
  await confirmBranchIfNeeded(page);
}

async function capture(page, key, targetPath) {
  await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: "domcontentloaded" });
  await waitForPortalReady(page);
  const outputPath = path.join(OUTPUT_DIR, `${key}.png`);
  await captureScreenshot(page, outputPath);
  console.log(`Saved ${outputPath}`);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: "vi-VN",
  });
  await installOverlayBlocker(context);
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await waitForPortalReady(page);
    await captureScreenshot(page, path.join(OUTPUT_DIR, "login.png"));
    console.log("Saved login.png");

    await login(page);

    if (page.url().includes("/select-branch")) {
      await captureScreenshot(page, path.join(OUTPUT_DIR, "select-branch.png"));
      console.log("Saved select-branch.png");
      await confirmBranchIfNeeded(page);
    } else {
      await page.goto(`${BASE_URL}/select-branch`, { waitUntil: "domcontentloaded" });
      await waitForPortalReady(page);
      await captureScreenshot(page, path.join(OUTPUT_DIR, "select-branch.png"));
      console.log("Saved select-branch.png");
    }

    for (const target of AUTHENTICATED_TARGETS) {
      if (target.key === "select-branch") {
        continue;
      }
      try {
        await capture(page, target.key, target.path);
      } catch (error) {
        console.warn(`Skipped ${target.key}:`, error instanceof Error ? error.message : error);
      }
    }

    const manifest = AUTHENTICATED_TARGETS.map((item) => item.key).concat(["login"]);
    await writeFile(
      path.join(OUTPUT_DIR, "manifest.json"),
      JSON.stringify({ capturedAt: new Date().toISOString(), files: manifest }, null, 2)
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
