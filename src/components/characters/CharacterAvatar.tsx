import { useState } from 'react'
import { useCharacterImage } from '../../hooks/useCharacterImage'
import type { ConversationCharacterMeta } from '../../types/conversationVault'
import type { VeniceCharacter } from '../../types/characters'
import { cn } from '../../lib/utils'

type CharacterInput = VeniceCharacter | ConversationCharacterMeta
const sizes = { sm: 'h-4 w-4 text-[8px]', md: 'h-6 w-6 text-[10px]', lg: 'h-10 w-10 text-[13px]' }

export function CharacterAvatar({ character, cacheKey, size = 'md', fallbackName, className }: {
  character?: CharacterInput | null
  cacheKey: string
  size?: keyof typeof sizes
  fallbackName?: string
  className?: string
}) {
  const resolved = useCharacterImage(character, { cacheKey })
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const imageUrl = resolved.imageUrl && resolved.imageUrl !== brokenUrl ? resolved.imageUrl : undefined
  const displayName = fallbackName || character?.name || 'Character'
  const initials = resolved.fallbackInitials || displayName.slice(0, 2).toUpperCase()
  return imageUrl
    ? <img src={imageUrl} alt={`${displayName} avatar`} onError={() => setBrokenUrl(imageUrl)} className={cn('shrink-0 rounded-full object-cover aspect-square', sizes[size], className)} />
    : <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent aspect-square', sizes[size], className)}>{initials}</span>
}
