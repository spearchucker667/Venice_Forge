const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

if (!content.includes('OnboardingSplash')) {
  content = content.replace(
    /import \{ FirstRunModal \} from '.\/components\/FirstRunModal'/,
    "import { FirstRunModal } from './components/FirstRunModal'\nimport { OnboardingSplash } from './components/OnboardingSplash'"
  );
  content = content.replace(
    /<FirstRunModal \/>/g,
    "<FirstRunModal />\n      <OnboardingSplash />"
  );
  fs.writeFileSync('src/App.tsx', content);
}
