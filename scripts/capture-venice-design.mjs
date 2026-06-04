/* eslint-disable */
/* eslint-env node, browser */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const ROUTES = [
  { url: "https://venice.ai/", slug: "home" },
  { url: "https://venice.ai/chat/agent", slug: "chat-agent" },
  { url: "https://venice.ai/chat/classic", slug: "chat-classic" },
  { url: "https://venice.ai/studio/image", slug: "studio-image" },
  { url: "https://venice.ai/studio/video", slug: "studio-video" },
  { url: "https://venice.ai/studio/audio", slug: "studio-audio" },
  { url: "https://venice.ai/models", slug: "models" },
  { url: "https://venice.ai/pricing", slug: "pricing" },
  { url: "https://venice.ai/brand", slug: "brand" },
  { url: "https://venice.ai/lp/download", slug: "lp-download" },
];

const VIEWPORTS = [
  { width: 1440, height: 1000, name: "1440x1000" },
  { width: 1280, height: 900, name: "1280x900" },
  { width: 1024, height: 768, name: "1024x768" },
  { width: 390, height: 844, name: "390x844" },
];

const CAPTURE_ROOT = path.join(process.cwd(), ".design-captures", "venice");

async function captureRoute(browser, route, viewport) {
  const dir = path.join(CAPTURE_ROOT, route.slug, viewport.name);
  fs.mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();

  console.log(`Navigating to ${route.url} (${viewport.name})...`);
  try {
    await page.goto(route.url, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    console.log(`Navigation to ${route.url} timed out, proceeding anyway...`);
  }
  
  // Wait a bit extra for hydration/SPA rendering
  await page.waitForTimeout(3000);

  // 1. Screenshot
  await page.screenshot({ path: path.join(dir, "screenshot.png"), fullPage: true });

  // 2. DOM HTML
  const html = await page.content();
  fs.writeFileSync(path.join(dir, "dom.html"), html);

  // 3. Links
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a")).map((a) => a.href);
  });
  fs.writeFileSync(path.join(dir, "links.json"), JSON.stringify(links, null, 2));

  // 4. Meta
  const meta = await page.evaluate(() => {
    return {
      title: document.title,
      metaTags: Array.from(document.querySelectorAll("meta")).map(m => ({ name: m.name, content: m.content, property: m.getAttribute("property") })),
      location: window.location.href,
    };
  });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  // 5. Computed Styles
  const computed = await page.evaluate(() => {
    function getStyles(selector, label) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const comp = window.getComputedStyle(el);
      return {
        selector,
        label,
        fontFamily: comp.fontFamily,
        fontSize: comp.fontSize,
        fontWeight: comp.fontWeight,
        lineHeight: comp.lineHeight,
        letterSpacing: comp.letterSpacing,
        color: comp.color,
        backgroundColor: comp.backgroundColor,
        backgroundImage: comp.backgroundImage,
        border: comp.border,
        borderRadius: comp.borderRadius,
        boxShadow: comp.boxShadow,
        backdropFilter: comp.backdropFilter,
        padding: comp.padding,
        margin: comp.margin,
        gap: comp.gap,
        width: comp.width,
        height: comp.height,
        display: comp.display,
        transition: comp.transition,
        transform: comp.transform,
        opacity: comp.opacity,
      };
    }

    const cssVars = {};
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule.style) {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith("--")) {
                cssVars[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch (e) { /* CORS */ }
    }
    
    // Also grab root vars directly
    const rootStyles = window.getComputedStyle(document.documentElement);
    for (let i = 0; i < rootStyles.length; i++) {
        const prop = rootStyles[i];
        if (prop.startsWith("--")) {
            cssVars[prop] = rootStyles.getPropertyValue(prop).trim();
        }
    }

    return {
      variables: cssVars,
      elements: [
        getStyles("html", "html"),
        getStyles("body", "body"),
        getStyles("main", "main content"),
        getStyles("nav", "primary nav"),
        getStyles("header", "header"),
        getStyles("button", "primary button"),
        getStyles("input", "text input"),
        getStyles("textarea", "textarea"),
        getStyles("h1", "h1"),
        getStyles("h2", "h2"),
        getStyles("p", "paragraph"),
        getStyles(".card", "card"),
      ].filter(Boolean),
    };
  });
  fs.writeFileSync(path.join(dir, "computed.json"), JSON.stringify(computed, null, 2));

  await context.close();
}

async function main() {
  console.log("Starting Venice design capture...");
  const browser = await chromium.launch({ headless: true });

  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      await captureRoute(browser, route, viewport);
    }
  }

  await browser.close();
  console.log("Capture complete.");
}

main().catch(console.error);
