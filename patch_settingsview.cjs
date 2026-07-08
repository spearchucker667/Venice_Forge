const fs = require('fs');
let content = fs.readFileSync('src/components/settings/SettingsView.tsx', 'utf-8');

if (!content.includes('ProfilePanel')) {
  content = content.replace(
    /import \{ AboutPanel \} from ".\/AboutPanel";/,
    'import { AboutPanel } from "./AboutPanel";\nimport { ProfilePanel } from "./ProfilePanel";'
  );

  content = content.replace(
    /<button onClick=\{\(\) => setActiveSection\("api-keys"\)\} className=\{sectionButtonClass\("api-keys"\)\}>/,
    '<button onClick={() => setActiveSection("profiles")} className={sectionButtonClass("profiles")}>\n            Profiles\n          </button>\n          <button onClick={() => setActiveSection("api-keys")} className={sectionButtonClass("api-keys")}>'
  );

  content = content.replace(
    /\{activeSection === "api-keys" && \(/,
    '{activeSection === "profiles" && (\n            <ProfilePanel />\n          )}\n\n          {activeSection === "api-keys" && ('
  );
  
  fs.writeFileSync('src/components/settings/SettingsView.tsx', content);
}
