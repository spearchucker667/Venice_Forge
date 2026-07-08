const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(
  /<FirstRunModal\n        open=\{!firstRunAcked\}\n        onAcknowledge=\{acknowledgeFirstRun\}\n      \/>/,
  "<FirstRunModal\n        open={!firstRunAcked}\n        onAcknowledge={acknowledgeFirstRun}\n      />\n      <OnboardingSplash />"
);

fs.writeFileSync('src/App.tsx', content);
