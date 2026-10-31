import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkspaceModal } from './WorkspaceModal';

describe('WorkspaceModal', () => {
  describe('Visibility & Accessibility', () => {
    it('does not render dialog when isOpen is false', () => {
      render(
        <WorkspaceModal
          isOpen={false}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders accessible dialog with aria attributes when isOpen is true', () => {
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'workspace-modal-title');
      expect(screen.getByRole('heading', { name: /new workspace/i })).toBeInTheDocument();
    });

    it('renders input and buttons when isOpen is true', () => {
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      expect(screen.getByRole('textbox', { name: /workspace name/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: /^create workspace$/i });
      expect(submitBtn).toBeInTheDocument();
      // Ensure text is clean without "+" symbol in string
      expect(submitBtn.textContent).toBe('Create Workspace');
    });

    it('focuses input on open', () => {
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const input = screen.getByRole('textbox', { name: /workspace name/i });
      expect(input).toHaveFocus();
    });
  });

  describe('Form Validation & Button States', () => {
    it('disables submit button when name is empty', () => {
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /^create workspace$/i });
      expect(submitBtn).toBeDisabled();
    });

    it('disables submit button when name consists only of whitespace', () => {
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const input = screen.getByRole('textbox', { name: /workspace name/i });
      fireEvent.change(input, { target: { value: '    ' } });

      const submitBtn = screen.getByRole('button', { name: /^create workspace$/i });
      expect(submitBtn).toBeDisabled();
    });

    it('enables submit button when a non-empty name is entered', () => {
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const input = screen.getByRole('textbox', { name: /workspace name/i });
      fireEvent.change(input, { target: { value: 'Meu Workspace' } });

      const submitBtn = screen.getByRole('button', { name: /^create workspace$/i });
      expect(submitBtn).not.toBeDisabled();
    });

    it('disables submit button if name exceeds 200 characters', () => {
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const input = screen.getByRole('textbox', { name: /workspace name/i });
      fireEvent.change(input, { target: { value: 'a'.repeat(201) } });

      const submitBtn = screen.getByRole('button', { name: /^create workspace$/i });
      expect(submitBtn).toBeDisabled();
    });
  });

  describe('Submission & onSave Handling', () => {
    it('calls onSave with trimmed name and calls onClose on successful creation', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={onSave}
        />
      );

      const input = screen.getByRole('textbox', { name: /workspace name/i });
      fireEvent.change(input, { target: { value: '   Projeto Alpha   ' } });

      const submitBtn = screen.getByRole('button', { name: /^create workspace$/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith('Projeto Alpha');
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('submits form when Enter key is pressed inside input', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={onSave}
        />
      );

      const input = screen.getByRole('textbox', { name: /workspace name/i });
      fireEvent.change(input, { target: { value: 'Finanças' } });
      fireEvent.submit(input.closest('form')!);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('Finanças');
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('shows loading state and disables inputs while onSave is in progress', async () => {
      let resolvePromise: () => void = () => {};
      const onSave = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
      );
      const onClose = vi.fn();

      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={onSave}
        />
      );

      const input = screen.getByRole('textbox', { name: /workspace name/i });
      fireEvent.change(input, { target: { value: 'Workspace Lento' } });

      const submitBtn = screen.getByRole('button', { name: /^create workspace$/i });
      fireEvent.click(submitBtn);

      expect(screen.getByText(/creating\.\.\./i)).toBeInTheDocument();
      expect(submitBtn).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      expect(input).toBeDisabled();

      resolvePromise();
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('displays error message and keeps modal open when onSave rejects', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Nome de workspace duplicado'));
      const onClose = vi.fn();

      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={onSave}
        />
      );

      const input = screen.getByRole('textbox', { name: /workspace name/i });
      fireEvent.change(input, { target: { value: 'Workspace Duplicado' } });

      const submitBtn = screen.getByRole('button', { name: /^create workspace$/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Nome de workspace duplicado');
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(submitBtn).not.toBeDisabled();
    });
  });

  describe('Dismissal (Cancel, X, Escape, Backdrop)', () => {
    it('dismisses when clicking Cancel button', () => {
      const onClose = vi.fn();
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('dismisses when clicking close X button', () => {
      const onClose = vi.fn();
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('dismisses when pressing Escape key', () => {
      const onClose = vi.fn();
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('dismisses when clicking the backdrop overlay', () => {
      const onClose = vi.fn();
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />
      );

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not dismiss when clicking inside the modal content box', () => {
      const onClose = vi.fn();
      render(
        <WorkspaceModal
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />
      );

      const modalContent = screen.getByTestId('workspace-modal-content');
      fireEvent.click(modalContent);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
