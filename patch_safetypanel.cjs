const fs = require('fs');
let content = fs.readFileSync('src/components/settings/SafetyPanel.tsx', 'utf-8');

if (!content.includes('MasterPasswordDialog')) {
  content = content.replace(
    /import React from "react";/,
    "import React, { useState } from \"react\";\nimport { MasterPasswordDialog } from \"./MasterPasswordDialog\";\nimport { useProfileStore } from \"../../stores/profile-store\";"
  );

  content = content.replace(
    /export function SafetyPanel\(\{\n  localFamilySafeModeEnabled,\n  veniceApiSafeMode,\n  onUpdateSafetySetting,\n\}: SafetyPanelProps\): React\.ReactElement \{/,
    "export function SafetyPanel({\n  localFamilySafeModeEnabled,\n  veniceApiSafeMode,\n  onUpdateSafetySetting,\n}: SafetyPanelProps): React.ReactElement {\n  const { masterPasswordSet } = useProfileStore();\n  const [showPasswordDialog, setShowPasswordDialog] = useState(false);\n  const [pendingAction, setPendingAction] = useState<{key: any, enabled: boolean} | null>(null);"
  );

  content = content.replace(
    /onChange=\{\(event\) => void onUpdateSafetySetting\("local_family_safe_mode_enabled", event\.target\.checked\)\}/,
    "onChange={(event) => {\n              if (masterPasswordSet) {\n                setPendingAction({ key: 'local_family_safe_mode_enabled', enabled: event.target.checked });\n                setShowPasswordDialog(true);\n              } else {\n                onUpdateSafetySetting('local_family_safe_mode_enabled', event.target.checked);\n              }\n            }}"
  );

  const dialogHtml = `
      {showPasswordDialog && (
        <MasterPasswordDialog
          isOpen={showPasswordDialog}
          mode={masterPasswordSet ? 'verify' : 'setup'}
          onClose={() => setShowPasswordDialog(false)}
          onSuccess={() => {
            setShowPasswordDialog(false);
            if (pendingAction) {
              onUpdateSafetySetting(pendingAction.key, pendingAction.enabled);
              setPendingAction(null);
            }
          }}
        />
      )}
    </div>
  );
}`;

  content = content.replace(/<\/div>\n  \);\n\}/, dialogHtml);
  fs.writeFileSync('src/components/settings/SafetyPanel.tsx', content);
}
