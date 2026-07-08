const fs = require('fs');
let content = fs.readFileSync('src/components/settings/SafetyPanel.tsx', 'utf-8');

const setupBtn = `
        <p className="text-[12px] text-text-muted leading-relaxed">
          {localFamilySafeModeEnabled
            ? "When enabled, matching requests are blocked locally before the provider is called."
            : "Bypasses Venice Forge's local family-safe filter. Venice/API-level safety and provider-side safemode are controlled separately."}
        </p>
        <div className="mt-2">
          {!masterPasswordSet ? (
            <button
              className="text-[12.5px] text-accent underline"
              onClick={() => {
                setPendingAction(null);
                setShowPasswordDialog(true);
              }}
            >
              Set Master Password to lock Family Safe Mode
            </button>
          ) : (
            <span className="text-[12.5px] text-green-500">Master Password is enabled</span>
          )}
        </div>
`;

content = content.replace(
  /<p className="text-\[12px\] text-text-muted leading-relaxed">[\s\S]*?<\/p>/,
  setupBtn
);
fs.writeFileSync('src/components/settings/SafetyPanel.tsx', content);
