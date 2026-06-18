const fs = require('fs');
const path = require('path');

const fileToCheck = path.join(__dirname, '../electron/services/researchBrowserServer.ts');

if (!fs.existsSync(fileToCheck)) {
  console.error(`❌ FAIL: Missing file ${fileToCheck}`);
  process.exit(1);
}

const content = fs.readFileSync(fileToCheck, 'utf-8');

const assertions = [
  { regex: /new\s+WebContentsView/, msg: "Must use WebContentsView (not BrowserView or webview)" },
  { regex: /session\.fromPartition\(["']persist:research["']\)/, msg: "Must use isolated persist:research partition" },
  { regex: /nodeIntegration:\s*false/, msg: "Must disable nodeIntegration" },
  { regex: /contextIsolation:\s*true/, msg: "Must enable contextIsolation" },
  { regex: /sandbox:\s*true/, msg: "Must enable sandbox" },
  { regex: /webSecurity:\s*true/, msg: "Must enable webSecurity" },
  { regex: /allowRunningInsecureContent:\s*false/, msg: "Must disable allowRunningInsecureContent" },
  { regex: /experimentalFeatures:\s*false/, msg: "Must disable experimentalFeatures" },
  { regex: /\.on\(["']will-navigate["']/, msg: "Must intercept will-navigate" },
  { regex: /\.setWindowOpenHandler/, msg: "Must intercept setWindowOpenHandler" },
];

let failed = false;

for (const assertion of assertions) {
  if (!assertion.regex.test(content)) {
    console.error(`❌ FAIL: ${assertion.msg}`);
    failed = true;
  } else {
    console.log(`✅ PASS: ${assertion.msg}`);
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("✅ WebContentsView boundaries verified successfully.");
}
