import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TimingWaterfall, TimingBreakdown } from './TimingWaterfall';

describe('TimingWaterfall', () => {
  it('renders timing bars for DNS, TLS, TTFB, Content transfer, and total duration with formatted ms values', () => {
    const timing: TimingBreakdown = {
      dnsLookupMs: 15.5,
      tlsHandshakeMs: 25.0,
      timeToFirstByteMs: 120.2,
      contentTransferMs: 40.8,
      totalDurationMs: 201.5,
    };

    render(<TimingWaterfall timing={timing} />);

    // Labels
    expect(screen.getByText('DNS Lookup')).toBeInTheDocument();
    expect(screen.getByText('TLS Handshake')).toBeInTheDocument();
    expect(screen.getByText('TTFB')).toBeInTheDocument();
    expect(screen.getByText('Content Transfer')).toBeInTheDocument();
    expect(screen.getByText(/Total Duration/i)).toBeInTheDocument();

    // Values formatted
    expect(screen.getByText('15.5 ms')).toBeInTheDocument();
    expect(screen.getByText('25.0 ms')).toBeInTheDocument();
    expect(screen.getByText('120.2 ms')).toBeInTheDocument();
    expect(screen.getByText('40.8 ms')).toBeInTheDocument();
    expect(screen.getByText('201.5 ms')).toBeInTheDocument();

    // Timing bars with progressbar role, aria-valuenow, and aria-valuetext
    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThanOrEqual(4);
    expect(bars[0]).toHaveAttribute('aria-valuetext', '15.5 ms (8%)');
    expect(bars[1]).toHaveAttribute('aria-valuetext', '25.0 ms (12%)');
    expect(bars[2]).toHaveAttribute('aria-valuetext', '120.2 ms (60%)');
    expect(bars[3]).toHaveAttribute('aria-valuetext', '40.8 ms (20%)');
  });

  it('handles PascalCase properties from C# backend', () => {
    const timing: TimingBreakdown = {
      DnsLookupMs: 10,
      TlsHandshakeMs: 20,
      TimeToFirstByteMs: 50,
      ContentTransferMs: 15,
      TotalDurationMs: 95,
    };

    render(<TimingWaterfall timing={timing} />);

    expect(screen.getByText('10.0 ms')).toBeInTheDocument();
    expect(screen.getByText('20.0 ms')).toBeInTheDocument();
    expect(screen.getByText('50.0 ms')).toBeInTheDocument();
    expect(screen.getByText('15.0 ms')).toBeInTheDocument();
    expect(screen.getByText('95.0 ms')).toBeInTheDocument();

    const bars = screen.getAllByRole('progressbar');
    expect(bars[0]).toHaveAttribute('aria-valuetext', '10.0 ms (11%)');
    expect(bars[1]).toHaveAttribute('aria-valuetext', '20.0 ms (21%)');
    expect(bars[2]).toHaveAttribute('aria-valuetext', '50.0 ms (53%)');
    expect(bars[3]).toHaveAttribute('aria-valuetext', '15.0 ms (16%)');
  });

  it('handles zero or missing values gracefully without crashing', () => {
    const timing: TimingBreakdown = {
      dnsLookupMs: 0,
      tlsHandshakeMs: 0,
      timeToFirstByteMs: 10,
      contentTransferMs: 5,
      totalDurationMs: 15,
    };

    render(<TimingWaterfall timing={timing} />);

    expect(screen.getAllByText('0.0 ms').length).toBe(2);
    expect(screen.getByText('10.0 ms')).toBeInTheDocument();
    expect(screen.getByText('15.0 ms')).toBeInTheDocument();

    const bars = screen.getAllByRole('progressbar');
    expect(bars[0]).toHaveAttribute('aria-valuetext', '0.0 ms (0%)');
    expect(bars[1]).toHaveAttribute('aria-valuetext', '0.0 ms (0%)');
    expect(bars[2]).toHaveAttribute('aria-valuetext', '10.0 ms (67%)');
    expect(bars[3]).toHaveAttribute('aria-valuetext', '5.0 ms (33%)');
  });

  it('sanitizes negative, NaN, and non-finite numbers safely', () => {
    const timing: TimingBreakdown = {
      dnsLookupMs: NaN,
      tlsHandshakeMs: -25.5,
      timeToFirstByteMs: Infinity,
      contentTransferMs: -0,
      totalDurationMs: NaN,
    };

    render(<TimingWaterfall timing={timing} />);

    expect(screen.getAllByText('0.0 ms').length).toBeGreaterThanOrEqual(4);
    const bars = screen.getAllByRole('progressbar');
    expect(bars[0]).toHaveAttribute('aria-valuetext', '0.0 ms (0%)');
    expect(bars[1]).toHaveAttribute('aria-valuetext', '0.0 ms (0%)');
    expect(bars[2]).toHaveAttribute('aria-valuetext', '0.0 ms (0%)');
    expect(bars[3]).toHaveAttribute('aria-valuetext', '0.0 ms (0%)');
  });

  it('renders fallback message when timing is null or undefined', () => {
    render(<TimingWaterfall timing={null} />);

    expect(screen.getByText('No timing metrics available')).toBeInTheDocument();
  });
});
