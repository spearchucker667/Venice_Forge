import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark'
  });

  const captureStyles = async (page, name) => {
    await page.waitForLoadState('networkidle');
    const styles = await page.evaluate(() => {
      const result = {
        background: getComputedStyle(document.body).backgroundColor,
        color: getComputedStyle(document.body).color,
        fontFamily: getComputedStyle(document.body).fontFamily,
        elements: {}
      };

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

    fs.writeFileSync(`.tmp/venice-ui-reference/${name}-dark-styles.json`, JSON.stringify(styles, null, 2));
  };

  try {
    await page.goto('https://venice.ai/chat');
    await captureStyles(page, 'venice-chat');
  } catch(e) {}
  
  try {
    await page.goto('https://venice.ai/api');
    await captureStyles(page, 'venice-api');
  } catch(e) {}

  await browser.close();
})();
