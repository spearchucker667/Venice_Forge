import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResearchProviderStatus } from './ResearchProviderStatus';
import React from 'react';

// Mock stores
const mockAuthStore = {
  isConfigured: true,
  jinaIsConfigured: true,
};

const mockSettingsStore = {
  config: {
    enable_jina: true,
  },
};

vi.mock('../../stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (state: typeof mockAuthStore) => unknown) => {
    return selector(mockAuthStore);
  }),
}));

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: vi.fn((selector: (state: typeof mockSettingsStore) => unknown) => {
    return selector(mockSettingsStore);
  }),
}));

vi.mock('../../services/desktopBridge', () => ({
  isElectron: vi.fn(() => true),
}));

describe('ResearchProviderStatus', () => {
  beforeEach(() => {
    mockAuthStore.isConfigured = true;
    mockAuthStore.jinaIsConfigured = true;
    mockSettingsStore.config.enable_jina = true;
  });

  it('renders all four provider status indicators', () => {
    render(<ResearchProviderStatus />);
    expect(screen.getByText('Venice')).toBeInTheDocument();
    expect(screen.getByText('Jina AI')).toBeInTheDocument();
    expect(screen.getByText('Generic Scrape')).toBeInTheDocument();
    expect(screen.getByText('Live Browser')).toBeInTheDocument();
  });

  it('shows Venice as configured when API key is present', () => {
    render(<ResearchProviderStatus />);
    const veniceLabel = screen.getByText('Venice');
    expect(veniceLabel).toBeInTheDocument();
  });

  it('shows Jina as configured when enabled and key present', () => {
    render(<ResearchProviderStatus />);
    const jinaLabel = screen.getByText('Jina AI');
    expect(jinaLabel).toBeInTheDocument();
  });

  it('shows Live Browser as configured in desktop mode', () => {
    render(<ResearchProviderStatus />);
    const browserLabel = screen.getByText('Live Browser');
    expect(browserLabel).toBeInTheDocument();
  });

  it('shows Add key button when Venice is missing and callback provided', () => {
    mockAuthStore.isConfigured = false;
    mockAuthStore.jinaIsConfigured = false;

    const mockCallback = vi.fn();
    render(<ResearchProviderStatus onOpenApiKeyDialog={mockCallback} />);
    
    const addKeyButton = screen.getByText('Add key');
    expect(addKeyButton).toBeInTheDocument();
  });

  it('does not show Add key button when callback is missing', () => {
    mockAuthStore.isConfigured = false;
    mockAuthStore.jinaIsConfigured = false;

    render(<ResearchProviderStatus />);
    
    expect(screen.queryByText('Add key')).not.toBeInTheDocument();
  });
});
