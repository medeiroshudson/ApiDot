import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TargetSelector } from './TargetSelector';

describe('TargetSelector', () => {
  it('allows switching between Inherit, Server, and Agent', () => {
    const onChange = vi.fn();
    render(<TargetSelector value="Inherit" isAgentOnline={true} onChange={onChange} />);

    const select = screen.getByRole('combobox', { name: /execution target/i });
    expect(select).toBeDefined();

    fireEvent.change(select, { target: { value: 'Agent' } });
    expect(onChange).toHaveBeenCalledWith('Agent');

    fireEvent.change(select, { target: { value: 'Server' } });
    expect(onChange).toHaveBeenCalledWith('Server');

    fireEvent.change(select, { target: { value: 'Inherit' } });
    expect(onChange).toHaveBeenCalledWith('Inherit');
  });

  it('renders green pulse indicator with role="status" when target is Agent and agent is online', () => {
    const onChange = vi.fn();
    render(<TargetSelector value="Agent" isAgentOnline={true} onChange={onChange} />);

    const pulse = screen.getByTestId('target-agent-pulse');
    expect(pulse).toBeDefined();
    expect(pulse.getAttribute('role')).toBe('status');
    expect(pulse.getAttribute('title')).toBe('Agent Connected');
    expect(pulse.getAttribute('aria-label')).toBe('Agent Connected');
    expect(pulse.className).toContain('bg-emerald-500');
    expect(pulse.className).toContain('animate-pulse');

    expect(screen.getByRole('status')).toBe(pulse);
  });

  it('renders red indicator with role="status" without pulse when target is Agent and agent is offline', () => {
    const onChange = vi.fn();
    render(<TargetSelector value="Agent" isAgentOnline={false} onChange={onChange} />);

    const pulse = screen.getByTestId('target-agent-pulse');
    expect(pulse).toBeDefined();
    expect(pulse.getAttribute('role')).toBe('status');
    expect(pulse.getAttribute('title')).toBe('Agent Disconnected');
    expect(pulse.getAttribute('aria-label')).toBe('Agent Disconnected');
    expect(pulse.className).toContain('bg-rose-500');
    expect(pulse.className).not.toContain('animate-pulse');

    expect(screen.getByRole('status')).toBe(pulse);
  });

  it('does not render agent pulse indicator when target is Inherit or Server', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TargetSelector value="Inherit" isAgentOnline={true} onChange={onChange} />);

    expect(screen.queryByTestId('target-agent-pulse')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<TargetSelector value="Server" isAgentOnline={true} onChange={onChange} />);
    expect(screen.queryByTestId('target-agent-pulse')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('disables the select element when disabled is true', () => {
    const onChange = vi.fn();
    render(<TargetSelector value="Inherit" isAgentOnline={true} onChange={onChange} disabled={true} />);

    const select = screen.getByRole('combobox', { name: /execution target/i });
    expect(select).toBeDisabled();
  });
});
