/* eslint-disable */
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log("Navigating to https://venice.ai/ ...");
  try {
    await page.goto('https://venice.ai/', { waitUntil: 'domcontentloaded' });
    // Wait a bit for JS hydration
    await page.waitForTimeout(2000);
  } catch (err) {
    console.error("Error navigating:", err);
  }

  console.log("Extracting styles...");
  const styles = await page.evaluate(() => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const bodyStyles = window.getComputedStyle(document.body);
    
    const extractVars = (element) => {
      const computed = window.getComputedStyle(element);
      const vars = {};
      for (let i = 0; i < computed.length; i++) {
        const prop = computed[i];
        if (prop.startsWith('--')) {
          vars[prop] = computed.getPropertyValue(prop).trim();
        }
      }
      return vars;
    };

    return {
      rootVars: extractVars(document.documentElement),
      bodyVars: extractVars(document.body),
      body: {
        backgroundColor: bodyStyles.backgroundColor,
        color: bodyStyles.color,
        fontFamily: bodyStyles.fontFamily,
        fontSize: bodyStyles.fontSize
      }
    };
  });
  
  const path = require('path');
  fs.writeFileSync(path.join(__dirname, 'venice-styles.json'), JSON.stringify(styles, null, 2));
  console.log("Styles saved to " + path.join(__dirname, 'venice-styles.json'));
  
  await browser.close();
})();
