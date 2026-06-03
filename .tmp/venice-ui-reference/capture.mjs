import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });

  const captureStyles = async (page, name) => {
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Capture screenshot
    await page.screenshot({ path: `.tmp/venice-ui-reference/${name}.png`, fullPage: true });

    // Extract computed styles and basic layout info
    const styles = await page.evaluate(() => {
      const result = {
        background: getComputedStyle(document.body).backgroundColor,
        color: getComputedStyle(document.body).color,
        fontFamily: getComputedStyle(document.body).fontFamily,
        elements: {}
      };

      // Try to find common layout elements and get their styles
      const elementsToExtract = [
        { name: 'sidebar', selector: 'aside, nav, [class*="sidebar"]' },
        { name: 'header', selector: 'header, [class*="topbar"], [class*="header"]' },
        { name: 'composer', selector: 'textarea, [class*="composer"], [class*="input-container"]' },
        { name: 'button', selector: 'button, [class*="btn"], [role="button"]' },
        { name: 'card', selector: '[class*="card"], [class*="panel"]' }
      ];

      for (const { name, selector } of elementsToExtract) {
        const el = document.querySelector(selector);
        if (el) {
          const compStyle = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          result.elements[name] = {
            width: rect.width,
            height: rect.height,
            backgroundColor: compStyle.backgroundColor,
            color: compStyle.color,
            borderRadius: compStyle.borderRadius,
            borderColor: compStyle.borderColor,
            boxShadow: compStyle.boxShadow,
            padding: compStyle.padding,
          };
        }
      }
      return result;
    });

    fs.writeFileSync(`.tmp/venice-ui-reference/${name}-styles.json`, JSON.stringify(styles, null, 2));
    
    // Save a clean DOM snapshot (removing scripts for readability)
    const dom = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true);
      const scripts = clone.querySelectorAll('script, style, link');
      scripts.forEach(s => s.remove());
      return clone.outerHTML;
    });
    fs.writeFileSync(`.tmp/venice-ui-reference/${name}-dom.html`, dom);
  };

  try {
    console.log('Navigating to https://venice.ai');
    await page.goto('https://venice.ai');
    await captureStyles(page, 'venice-home');
  } catch(e) { console.error('Failed on home', e); }

  try {
    console.log('Navigating to https://venice.ai/chat');
    await page.goto('https://venice.ai/chat');
    await captureStyles(page, 'venice-chat');
  } catch(e) { console.error('Failed on chat', e); }

  try {
    console.log('Navigating to https://venice.ai/studio');
    await page.goto('https://venice.ai/studio');
    await captureStyles(page, 'venice-studio');
  } catch(e) { console.error('Failed on studio', e); }

  try {
    console.log('Navigating to https://venice.ai/api');
    await page.goto('https://venice.ai/api');
    await captureStyles(page, 'venice-api');
  } catch(e) { console.error('Failed on api', e); }

  await browser.close();
})();
