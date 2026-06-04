import { cn } from '../../lib/utils'

export function VeniceLogo({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <img 
      src="assets/branding/venice-keys-white.svg" 
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
      alt="Venice Forge Logo"
    />
  )
}

export function VeniceWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-semibold tracking-[-0.02em] text-white/90', className)}>
      Venice Forge
    </span>
  )
}
