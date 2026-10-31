'use client';

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Select } from '@/components/common/Select';

export type ExecutionTarget = 'Inherit' | 'Server' | 'Agent';

export interface TargetSelectorProps {
  value: ExecutionTarget;
  isAgentOnline?: boolean;
  onChange: (value: ExecutionTarget) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function TargetSelector({
  value,
  isAgentOnline = false,
  onChange,
  disabled = false,
  className = '',
  ariaLabel,
}: TargetSelectorProps) {
  const { t } = useTranslation();
  const agentTitle = isAgentOnline ? t('request.agentConnected') : t('request.agentDisconnected');

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Select
        sizeVariant="sm"
        aria-label={ariaLabel || t('request.targetExecution')}
        value={value}
        onChange={(e) => onChange(e.target.value as ExecutionTarget)}
        disabled={disabled}
      >
        <option value="Inherit">{t('request.targetInherit')}</option>
        <option value="Server">{t('request.targetServer')}</option>
        <option value="Agent">{t('request.targetAgent')}</option>
      </Select>

      {value === 'Agent' && (
        <span
          role="status"
          data-testid="target-agent-pulse"
          className={`h-2.5 w-2.5 rounded-full transition-colors ${
            isAgentOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
          }`}
          title={agentTitle}
          aria-label={agentTitle}
        />
      )}
    </div>
  );
}
