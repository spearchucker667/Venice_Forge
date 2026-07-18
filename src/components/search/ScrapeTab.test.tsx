import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScrapeTab } from './ScrapeTab';

describe('ScrapeTab', () => {
  // VERIFY-143: permission-limited Venice scraping has an explicit Jina
  // reader choice instead of leaving the user at a terminal 403 message.
  it('allows the reader provider to be changed to Jina', () => {
    const setProvider = vi.fn();
    render(
      <ScrapeTab
        url="https://example.com"
        setUrl={vi.fn()}
        loading=""
        runScrape={vi.fn()}
        provider="venice"
        setProvider={setProvider}
        scrapeOutput=""
        setScrapeOutput={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'jina' } });
    expect(setProvider).toHaveBeenCalledWith('jina');
  });
});
