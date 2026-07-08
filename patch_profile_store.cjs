const fs = require('fs');
let content = fs.readFileSync('src/stores/profile-store.ts', 'utf-8');

content = content.replace(/masterPasswordSet: boolean/, 'masterPasswordSet: boolean\n  globalOnboardingCompleted: boolean\n  setGlobalOnboardingCompleted: (val: boolean) => void');
content = content.replace(/masterPasswordSet: false,/, 'masterPasswordSet: false,\n      globalOnboardingCompleted: false,\n      setGlobalOnboardingCompleted: (val) => set({ globalOnboardingCompleted: val }),');
fs.writeFileSync('src/stores/profile-store.ts', content);
