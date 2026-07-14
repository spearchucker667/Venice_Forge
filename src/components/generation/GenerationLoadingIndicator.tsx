import { useEffect, useState, useRef } from 'react';
import { cn } from '../../lib/utils';
import { type GenerationVisualState, getSemanticGroup, AnimationSemanticGroup } from './generation-animation-state';
import { getAnimationsForGroup, AnimationAsset } from './generation-animation-registry';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

export interface GenerationLoadingIndicatorProps {
  state: GenerationVisualState;
  label?: string;
  detail?: string;
  progress?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onCancel?: () => void;
  showCancel?: boolean;
  taskId?: string;
}

export function GenerationLoadingIndicator({
  state,
  label,
  detail,
  progress,
  size = 'md',
  className,
  onCancel,
  showCancel,
}: GenerationLoadingIndicatorProps) {
  const semanticGroup = getSemanticGroup(state);
  const animations = getAnimationsForGroup(semanticGroup);
  const prefersReducedMotion = usePrefersReducedMotion();

  const [currentAsset, setCurrentAsset] = useState<AnimationAsset>(animations[0]);
  const [nextAsset, setNextAsset] = useState<AnimationAsset | null>(null);
  
  const timerRef = useRef<number | null>(null);
  const transitionRef = useRef<number | null>(null);
  const assetIndexRef = useRef(0);
  const groupRef = useRef<AnimationSemanticGroup>(semanticGroup);

  useEffect(() => {
    if (groupRef.current !== semanticGroup) {
      groupRef.current = semanticGroup;
      assetIndexRef.current = 0;
      
      const newAssets = getAnimationsForGroup(semanticGroup);
      const targetAsset = newAssets[0];
      
      if (prefersReducedMotion || semanticGroup === 'completed' || semanticGroup === 'failed') {
        setCurrentAsset(targetAsset);
        setNextAsset(null);
      } else {
        setNextAsset(targetAsset);
      }
    }
  }, [semanticGroup, prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (semanticGroup === 'completed' || semanticGroup === 'failed') return;

    const startTimer = () => {
      const duration = Math.max(currentAsset.nominalLoopMs * 3 || 4320, 3000);
      
      timerRef.current = window.setTimeout(() => {
        const assets = getAnimationsForGroup(groupRef.current);
        if (assets.length > 1) {
          assetIndexRef.current = (assetIndexRef.current + 1) % assets.length;
          setNextAsset(assets[assetIndexRef.current]);
        } else {
          startTimer();
        }
      }, duration);
    };

    if (!nextAsset) {
      startTimer();
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentAsset, nextAsset, semanticGroup, prefersReducedMotion]);

  useEffect(() => {
    if (nextAsset) {
      transitionRef.current = window.setTimeout(() => {
        setCurrentAsset(nextAsset);
        setNextAsset(null);
      }, 180);
      
      return () => {
        if (transitionRef.current !== null) {
          window.clearTimeout(transitionRef.current);
          transitionRef.current = null;
        }
      };
    }
  }, [nextAsset]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (transitionRef.current !== null) window.clearTimeout(transitionRef.current);
    };
  }, []);

  let sizeClass = 'w-24 h-24 md:w-36 md:h-36';
  if (size === 'sm') sizeClass = 'w-5 h-5 md:w-6 md:h-6';
  if (size === 'md') sizeClass = 'w-12 h-12 md:w-16 md:h-16';

  const displaySrc = prefersReducedMotion ? currentAsset.staticSrc : currentAsset.src;
  const nextDisplaySrc = nextAsset ? (prefersReducedMotion ? nextAsset.staticSrc : nextAsset.src) : null;
  
  return (
    <div 
      className={cn(size === 'sm' ? "flex flex-row items-center gap-2" : "flex flex-col items-center justify-center gap-3", className)}
      role="status" 
      aria-live="polite" 
      aria-atomic="true"
    >
      <div className={cn("relative overflow-hidden flex items-center justify-center shrink-0", sizeClass)} style={{ aspectRatio: '192/208' }}>
        <img 
          src={displaySrc} 
          alt="" 
          aria-hidden="true" 
          className={cn(
            "absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-150", 
            nextAsset ? "opacity-0" : "opacity-100"
          )}
          style={{ imageRendering: 'auto' }}
        />
        {nextDisplaySrc && (
          <img 
            src={nextDisplaySrc} 
            alt="" 
            aria-hidden="true" 
            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-100"
            style={{ imageRendering: 'auto' }}
          />
        )}
      </div>
      
      {(label || detail || progress !== undefined || showCancel) && (
        <div className={cn(size === 'sm' ? "flex flex-row items-center gap-2" : "flex flex-col items-center text-center", "max-w-[250px]")}>
          {label && <div className={cn(size === 'sm' ? "text-xs" : "text-sm", "font-medium text-text-main")}>{label}</div>}
          
          {progress !== undefined && (
            <div className={cn(size === 'sm' ? "w-12" : "w-full", "h-1.5 bg-bg-alt rounded-full overflow-hidden")}>
              <div 
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          )}
          
          {detail && size !== 'sm' && (
            <div className="text-xs text-text-muted mt-1 break-words">{detail}</div>
          )}
          
          {showCancel && onCancel && state !== 'completed' && state !== 'failed' && state !== 'cancelled' && (
            <button 
              onClick={onCancel}
              className="mt-2 text-xs text-accent hover:text-accent-hover transition-colors px-2 py-1 rounded-sm focus-visible:outline-accent"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
