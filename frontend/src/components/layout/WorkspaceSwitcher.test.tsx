import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { WorkspaceDto } from '../../lib/treeApi';

describe('WorkspaceSwitcher', () => {
  const mockWorkspaces: WorkspaceDto[] = [
    {
      id: 'ws-1',
      name: 'Workspace Pessoal',
      createdAtUtc: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ws-2',
      name: 'Workspace Corporativo',
      createdAtUtc: '2026-01-02T00:00:00Z',
    },
  ];

  describe('Rendering', () => {
    it('renders active workspace name when an activeWorkspaceId is provided', () => {
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      expect(screen.getByText('Workspace Pessoal')).toBeInTheDocument();
      expect(screen.queryByTestId('workspace-switcher-dropdown')).toBeNull();
    });

    it('renders fallback label "Selecionar Workspace" when activeWorkspaceId is null', () => {
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId={null}
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      expect(screen.getByText('Selecionar Workspace')).toBeInTheDocument();
    });

    it('renders fallback label when activeWorkspaceId does not match any workspace', () => {
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-unknown"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      expect(screen.getByText('Selecionar Workspace')).toBeInTheDocument();
    });
  });

  describe('Dropdown Toggling', () => {
    it('toggles dropdown visibility on trigger button click', () => {
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      const trigger = screen.getByRole('button', { name: /workspace: workspace pessoal/i });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).toBeNull();

      // Open dropdown
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('listbox', { name: /workspaces/i })).toBeInTheDocument();

      // Close dropdown
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  describe('Workspace Selection', () => {
    it('displays all workspaces and highlights the active one with a checkmark', () => {
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button', { name: /workspace: workspace pessoal/i }));

      const option1 = screen.getByTestId('workspace-option-ws-1');
      const option2 = screen.getByTestId('workspace-option-ws-2');

      expect(option1).toHaveAttribute('aria-selected', 'true');
      expect(option2).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByTestId('active-workspace-check')).toBeInTheDocument();
    });

    it('calls onSelectWorkspace and closes dropdown when a workspace is clicked', () => {
      const onSelectWorkspace = vi.fn();
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={onSelectWorkspace}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /workspace: workspace pessoal/i }));
      fireEvent.click(screen.getByTestId('workspace-option-ws-2'));

      expect(onSelectWorkspace).toHaveBeenCalledTimes(1);
      expect(onSelectWorkspace).toHaveBeenCalledWith('ws-2');
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  describe('Create Workspace Action', () => {
    it('renders "Novo Workspace" button without "+" in text and calls onCreateWorkspaceClick on click', () => {
      const onCreateWorkspaceClick = vi.fn();
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={onCreateWorkspaceClick}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /workspace: workspace pessoal/i }));

      const createBtn = screen.getByRole('button', { name: /^novo workspace$/i });
      expect(createBtn).toBeInTheDocument();
      // Ensure text is clean without "+" symbol in string
      expect(createBtn.textContent).toBe('Novo Workspace');

      fireEvent.click(createBtn);

      expect(onCreateWorkspaceClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  describe('Closing Behavior (Escape & Click Outside)', () => {
    it('closes dropdown when Escape key is pressed', () => {
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      const trigger = screen.getByRole('button', { name: /workspace: workspace pessoal/i });
      fireEvent.click(trigger);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('closes dropdown when clicking outside the component', () => {
      render(
        <div>
          <div data-testid="outside-element">Outside</div>
          <WorkspaceSwitcher
            workspaces={mockWorkspaces}
            activeWorkspaceId="ws-1"
            onSelectWorkspace={vi.fn()}
            onCreateWorkspaceClick={vi.fn()}
          />
        </div>
      );

      const trigger = screen.getByRole('button', { name: /workspace: workspace pessoal/i });
      fireEvent.click(trigger);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId('outside-element'));
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('does not close dropdown when clicking inside the dropdown list', () => {
      render(
        <WorkspaceSwitcher
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /workspace: workspace pessoal/i }));
      const dropdown = screen.getByRole('listbox');

      fireEvent.mouseDown(dropdown);
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('Empty Workspaces List', () => {
    it('handles empty workspaces array gracefully and shows empty indicator and create button', () => {
      render(
        <WorkspaceSwitcher
          workspaces={[]}
          activeWorkspaceId={null}
          onSelectWorkspace={vi.fn()}
          onCreateWorkspaceClick={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /selecionar workspace/i }));
      expect(screen.getByText('Nenhum workspace')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^novo workspace$/i })).toBeInTheDocument();
    });
  });
});
