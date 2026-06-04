const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ROUTES = [
  { url: 'https://venice.ai/', slug: 'home' },
  { url: 'https://venice.ai/chat/agent', slug: 'chat-agent' },
  { url: 'https://venice.ai/chat/classic', slug: 'chat-classic' },
  { url: 'https://venice.ai/studio/image', slug: 'studio-image' },
  { url: 'https://venice.ai/studio/video', slug: 'studio-video' },
  { url: 'https://venice.ai/studio/audio', slug: 'studio-audio' },
  { url: 'https://venice.ai/models', slug: 'models' },
  { url: 'https://venice.ai/pricing', slug: 'pricing' },
  { url: 'https://venice.ai/brand', slug: 'brand' },
  { url: 'https://venice.ai/lp/download', slug: 'lp-download' },
];

const VIEWPORTS = [
  { width: 1440, height: 1000, label: '1440x1000' },
  { width: 1280, height: 900, label: '1280x900' },
  { width: 1024, height: 768, label: '1024x768' },
  { width: 390, height: 844, label: '390x844' },
];

const CAPTURE_ROOT = path.join(ROOT, '.design-captures', 'venice');

async function capturePage(browser, route, viewport) {
  const { url, slug } = route;
  const { label } = viewport;
  
  const captureDir = path.join(CAPTURE_ROOT, slug, label);
  fs.mkdirSync(captureDir, { recursive: true });
  
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    permissions: [],
    storageState: undefined,
  });
  
  const page = await context.newPage();
  
  try {
    console.log(`  Capturing ${slug}/${label}...`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    fs.writeFileSync(path.join(captureDir, 'screenshot.png'), screenshotBuffer);
    
    const dom = await page.content();
    fs.writeFileSync(path.join(captureDir, 'dom.html'), dom);
    
    const links = [];
    const linkElements = await page.$$('a[href]');
    for (const el of linkElements) {
      const href = await el.getAttribute('href');
      if (href) links.push(href);
    }
    fs.writeFileSync(path.join(captureDir, 'links.json'), JSON.stringify(links, null, 2));
    
    const computedStyles = {};
    const selectors = [
      'html', 'body', '#__next', 'main', 'nav', 'aside', 'header',
      'button', 'input', 'textarea', '.card', '.panel'
    ];
    
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const styles = await el.evaluate((elem) => {
            // eslint-disable-next-line no-undef
            const cs = getComputedStyle(elem);
            return {
              'font-family': cs.fontFamily,
              'font-size': cs.fontSize,
              'font-weight': cs.fontWeight,
              'color': cs.color,
              'background-color': cs.backgroundColor,
              'border-radius': cs.borderRadius,
              'padding': cs.padding,
            };
          });
          computedStyles[sel] = styles;
        }
      } catch {
        /* skip selectors that throw during evaluation */
      }
    }
    
    fs.writeFileSync(path.join(captureDir, 'computed.json'), JSON.stringify(computedStyles, null, 2));
    
    const meta = {
      url,
      slug,
      viewport: label,
      title: await page.title(),
      capturedAt: new Date().toISOString(),
      viewportSize: { width: viewport.width, height: viewport.height },
    };
    fs.writeFileSync(path.join(captureDir, 'meta.json'), JSON.stringify(meta, null, 2));
    
    console.log(`    Done: screenshot, dom.html, links.json, computed.json, meta.json`);
    
  } catch (err) {
    console.error(`    Error capturing ${slug}/${label}:`, err.message);
    fs.writeFileSync(path.join(captureDir, 'error.txt'), String(err));
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('Starting Venice.ai design capture...\n');
  
  fs.mkdirSync(CAPTURE_ROOT, { recursive: true });
  
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('Failed to launch Chromium:', e.message);
    console.log('\nInstalling Chromium...');
    const { execSync } = require('child_process');
    execSync('npx playwright install chromium', { stdio: 'inherit' });
    browser = await chromium.launch({ headless: true });
  }
  
  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      await capturePage(browser, route, viewport);
    }
  }
  
  await browser.close();
  
  console.log('\nCapture complete!');
  console.log(`Output: ${CAPTURE_ROOT}`);
}

main().catch(console.error);