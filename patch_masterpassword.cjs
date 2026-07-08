const fs = require('fs');
let content = fs.readFileSync('src/components/settings/MasterPasswordDialog.tsx', 'utf-8');

content = content.replace(
  /const \[error, setError\] = useState\(''\)/,
  "const [error, setError] = useState('')\n  const [attempts, setAttempts] = useState(0)\n  const [lockedOutUntil, setLockedOutUntil] = useState<number | null>(null)"
);

const submitLogic = `
    if (lockedOutUntil && Date.now() < lockedOutUntil) {
      setError(\`Locked out. Try again in \${Math.ceil((lockedOutUntil - Date.now()) / 1000)}s\`)
      return
    }

    if (mode === 'setup') {
      if (password !== confirm) {
        setError('Passwords do not match')
        return
      }
      if (password.length < 4) {
        setError('Password too short')
        return
      }
      
      const res = await desktopCredentials.set('master_password', password)
      if (res.ok) {
        setMasterPasswordSet(true)
        onSuccess()
      } else {
        setError('Failed to securely save password')
      }
    } else {
      // Verify
      const res = await desktopCredentials.get('master_password')
      if (res.ok && res.value === password) {
        setAttempts(0)
        onSuccess()
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        if (newAttempts >= 5) {
          setLockedOutUntil(Date.now() + 60000)
          setError('Too many failed attempts. Locked out for 1 minute.')
        } else {
          setError('Incorrect password')
        }
      }
    }
`;

content = content.replace(/if \(mode === 'setup'\) \{[\s\S]*\}\n  \}/, submitLogic.trim() + '\n  }');

fs.writeFileSync('src/components/settings/MasterPasswordDialog.tsx', content);
