// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterSceneCard } from './CharacterSceneCard';

describe('CharacterSceneCard', () => {
  it('renders queued status', () => {
    render(<CharacterSceneCard status="queued" prompt="sunset picnic" />);
    expect(screen.getByText(/queued/i)).toBeInTheDocument();
    expect(screen.getByText(/sunset picnic/i)).toBeInTheDocument();
  });

  it('renders generating status without action buttons', () => {
    render(<CharacterSceneCard status="generating" />);
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('renders complete status with image and open action', () => {
    const onOpen = vi.fn();
    render(
      <CharacterSceneCard
        status="complete"
        prompt="sunset picnic"
        imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
        onOpenInMediaStudio={onOpen}
      />,
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open in media studio/i }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('calls copy prompt handler', () => {
    const onCopy = vi.fn();
    render(<CharacterSceneCard status="complete" prompt="sunset picnic" onCopyPrompt={onCopy} />);
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));
    expect(onCopy).toHaveBeenCalled();
  });

  it('calls retry handler', () => {
    const onRetry = vi.fn();
    render(<CharacterSceneCard status="failed" error="Network error" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('calls regenerate handler', () => {
    const onRegenerate = vi.fn();
    render(<CharacterSceneCard status="complete" prompt="sunset picnic" onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(onRegenerate).toHaveBeenCalled();
  });

  it('calls cancel handler when generating', () => {
    const onCancel = vi.fn();
    render(<CharacterSceneCard status="generating" onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows rate-limited message', () => {
    render(<CharacterSceneCard status="rate_limited" rateLimitReason="too many scenes" />);
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
    expect(screen.getByText(/too many scenes/i)).toBeInTheDocument();
  });
});
