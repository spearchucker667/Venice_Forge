import React, { useState } from 'react'
import { useProfileStore } from '../../stores/profile-store'
import { askDecision } from '../ui/modal-requests'

export function ProfilePanel() {
  const { profiles, activeProfileId, addProfile, switchProfile, deleteProfile } = useProfileStore()
  const [newProfileName, setNewProfileName] = useState('')

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (newProfileName.trim()) {
      addProfile(newProfileName.trim())
      setNewProfileName('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">Manage Profiles</h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          Each profile maintains isolated settings, API keys, and configurations. Switching profiles will clear active application state and reload.
        </p>
        
        <ul className="space-y-2 mt-4">
          {profiles.map(p => (
            <li key={p.id} className="flex items-center justify-between p-3 border border-border rounded bg-surface">
              <span className="text-[13px] font-medium text-text-primary">
                {p.name} {p.id === activeProfileId && <span className="ml-2 text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">ACTIVE</span>}
              </span>
              <div className="flex gap-2">
                {p.id !== activeProfileId && (
                  <button onClick={() => switchProfile(p.id)} className="text-[12px] text-accent hover:underline px-2 py-1">
                    Switch To
                  </button>
                )}
                {p.id !== 'default' && (
                  <button onClick={async () => {
                    const confirmed = await askDecision({
                      title: 'Delete profile?',
                      detail: `"${p.name}" — all isolated settings will be removed. Files on disk remain.`,
                      actionLabel: 'Delete',
                      danger: true,
                    })
                    if (confirmed) deleteProfile(p.id)
                  }} className="text-[12px] text-danger hover:underline px-2 py-1">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={handleAdd} className="flex gap-2 mt-4 pt-4 soft-separator-y">
          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="New Profile Name"
            className="flex-1 px-3 py-1.5 bg-surface border border-border rounded text-[13px]"
          />
          <button type="submit" className="px-4 py-1.5 bg-button-primary-bg text-button-primary-fg rounded text-[13px] font-medium">
            Create Profile
          </button>
        </form>
      </div>
    </div>
  )
}
