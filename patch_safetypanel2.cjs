const fs = require('fs');
let content = fs.readFileSync('src/components/settings/SafetyPanel.tsx', 'utf-8');

content = content.replace(
  /onChange=\{\(event\) => void onUpdateSafetySetting\("venice_api_safe_mode", event\.target\.checked\)\}/,
  "onChange={(event) => {\n            if (localFamilySafeModeEnabled && !event.target.checked) {\n              alert('Cannot disable Provider Safe Mode while Family Safe Mode is active.');\n              return;\n            }\n            onUpdateSafetySetting('venice_api_safe_mode', event.target.checked);\n          }}"
);

fs.writeFileSync('src/components/settings/SafetyPanel.tsx', content);
