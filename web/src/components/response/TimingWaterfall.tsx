import React from 'react';
import { Clock } from 'lucide-react';

export interface TimingBreakdown {
  dnsLookupMs?: number;
  tlsHandshakeMs?: number;
  timeToFirstByteMs?: number;
  contentTransferMs?: number;
  totalDurationMs?: number;

  // PascalCase aliases for C# compatibility
  DnsLookupMs?: number;
  TlsHandshakeMs?: number;
  TimeToFirstByteMs?: number;
  ContentTransferMs?: number;
  TotalDurationMs?: number;
}

export interface TimingWaterfallProps {
  timing?: TimingBreakdown | null;
  totalDurationMs?: number;
  className?: string;
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`;
}

interface TimingMetricItem {
  key: string;
  label: string;
  description: string;
  value: number;
  colorClass: string;
}

export function TimingWaterfall({
  timing,
  totalDurationMs: propTotalMs,
  className = '',
}: TimingWaterfallProps) {
  if (!timing) {
    return (
      <div className={`p-4 text-center text-xs text-neutral-500 ${className}`}>
        <p>Sem métricas de tempo disponíveis</p>
      </div>
    );
  }

  const dns = timing.dnsLookupMs ?? timing.DnsLookupMs ?? 0;
  const tls = timing.tlsHandshakeMs ?? timing.TlsHandshakeMs ?? 0;
  const ttfb = timing.timeToFirstByteMs ?? timing.TimeToFirstByteMs ?? 0;
  const transfer = timing.contentTransferMs ?? timing.ContentTransferMs ?? 0;
  const total =
    propTotalMs ??
    timing.totalDurationMs ??
    timing.TotalDurationMs ??
    dns + tls + ttfb + transfer;

  const metrics: TimingMetricItem[] = [
    {
      key: 'dns',
      label: 'DNS Lookup',
      description: 'Resolução de nome de domínio',
      value: dns,
      colorClass: 'bg-sky-500',
    },
    {
      key: 'tls',
      label: 'TLS Handshake',
      description: 'Negociação e aperto de mão SSL/TLS',
      value: tls,
      colorClass: 'bg-indigo-500',
    },
    {
      key: 'ttfb',
      label: 'TTFB',
      description: 'Tempo até o primeiro byte (espera do servidor)',
      value: ttfb,
      colorClass: 'bg-amber-500',
    },
    {
      key: 'transfer',
      label: 'Content Transfer',
      description: 'Download do corpo da resposta',
      value: transfer,
      colorClass: 'bg-emerald-500',
    },
  ];

  return (
    <div className={`flex flex-col gap-4 p-4 text-neutral-200 ${className}`}>
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-neutral-400" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Detalhamento de Latência
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-neutral-400">Duração Total:</span>
          <span className="text-sm font-mono font-bold text-neutral-100">
            {formatMs(total)}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => {
          const percent = total > 0 ? Math.min(100, Math.max(0, (metric.value / total) * 100)) : 0;
          return (
            <div key={metric.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-300">{metric.label}</span>
                  <span className="hidden sm:inline text-[11px] text-neutral-500">
                    ({metric.description})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-500">{percent.toFixed(0)}%</span>
                  <span className="font-mono text-neutral-300 min-w-[65px] text-right">
                    {formatMs(metric.value)}
                  </span>
                </div>
              </div>

              <div
                role="progressbar"
                aria-label={`${metric.label}: ${formatMs(metric.value)}`}
                aria-valuenow={Math.round(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden"
              >
                <div
                  className={`h-full ${metric.colorClass} rounded-full transition-all duration-300`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
