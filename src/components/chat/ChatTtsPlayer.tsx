import { useState, useEffect } from 'react';
import { chatTtsController, type TtsPlaybackState } from '../../services/chatTtsController';
import { isElectron } from '../../services/desktopBridge';

interface ChatTtsPlayerProps {
  messageId: string;
  text: string;
  className?: string;
}

export function ChatTtsPlayer({ messageId, text, className = '' }: ChatTtsPlayerProps) {
  const [state, setState] = useState<TtsPlaybackState>('idle');
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = chatTtsController.subscribe((newState, currentMessageId) => {
      setState(newState);
      setActiveMessageId(currentMessageId);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (!isElectron()) return null;

  const isActive = activeMessageId === messageId;
  const isPlaying = isActive && state === 'playing';
  const isLoading = isActive && state === 'loading';
  const isPaused = isActive && state === 'paused';

  const handlePlayPause = () => {
    if (isPlaying) {
      chatTtsController.pause();
    } else {
      chatTtsController.play(messageId, text).catch(console.error);
    }
  };

  const handleStop = () => {
    chatTtsController.stop();
  };

  const handleRestart = () => {
    chatTtsController.restart(messageId, text);
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        onClick={handlePlayPause}
        className="p-1.5 text-text-muted/60 hover:text-text-secondary transition-colors rounded-md hover:bg-surface-elevated cursor-pointer disabled:opacity-50"
        title={isPlaying ? "Pause speech" : "Play speech"}
        disabled={isLoading}
      >
        {isLoading ? (
          <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : isPlaying ? (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
        ) : (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      
      {(isPlaying || isPaused || isLoading) && (
        <>
          <button
            onClick={handleStop}
            className="p-1.5 text-text-muted/60 hover:text-danger transition-colors rounded-md hover:bg-surface-elevated cursor-pointer"
            title="Stop speech"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
          </button>
          
          <button
            onClick={handleRestart}
            className="p-1.5 text-text-muted/60 hover:text-text-secondary transition-colors rounded-md hover:bg-surface-elevated cursor-pointer"
            title="Restart speech"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </>
      )}
    </div>
  );
}
