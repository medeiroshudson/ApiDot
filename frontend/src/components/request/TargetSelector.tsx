import React from 'react';
import { Select } from '@/components/common/Select';

export type ExecutionTarget = 'Inherit' | 'Server' | 'Agent';

export interface TargetSelectorProps {
  value: ExecutionTarget;
  isAgentOnline?: boolean;
  onChange: (value: ExecutionTarget) => void;
  disabled?: boolean;
  className?: string;
}

export function TargetSelector({
  value,
  isAgentOnline = false,
  onChange,
  disabled = false,
  className = '',
}: TargetSelectorProps) {
  const agentTitle = isAgentOnline ? 'Agent Conectado' : 'Agent Desconectado';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Select
        sizeVariant="sm"
        aria-label="Target de Execução"
        value={value}
        onChange={(e) => onChange(e.target.value as ExecutionTarget)}
        disabled={disabled}
      >
        <option value="Inherit">Inherit (Herdar)</option>
        <option value="Server">Server (Nuvem)</option>
        <option value="Agent">Agent (Máquina)</option>
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
