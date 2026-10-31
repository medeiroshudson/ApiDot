import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  SaveRequestModal,
  CollectionOption,
} from './SaveRequestModal';

describe('SaveRequestModal', () => {
  const mockCollections: CollectionOption[] = [
    {
      id: 'col-1',
      name: 'E-commerce API',
      folders: [
        { id: 'f-auth', name: 'Autenticação' },
        { id: 'f-users', name: 'Usuários' },
      ],
    },
    {
      id: 'col-2',
      name: 'Analytics API',
      folders: [
        { id: 'f-reports', name: 'Relatórios' },
      ],
    },
    {
      id: 'col-3',
      name: 'Empty Collection',
      folders: [],
    },
  ];

  describe('Visibility & Accessibility', () => {
    it('does not render dialog when isOpen is false', () => {
      render(
        <SaveRequestModal
          isOpen={false}
          onClose={vi.fn()}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders accessible dialog with aria attributes when isOpen is true', () => {
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'save-request-modal-title');
      expect(screen.getByRole('heading', { name: /^save request$/i })).toBeInTheDocument();
    });

    it('renders form inputs for request name, collection select, and folder select', () => {
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      expect(screen.getByRole('textbox', { name: /^request name/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /^target collection/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /^folder/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    });
  });

  describe('Form Initialization & Field Interaction', () => {
    it('pre-populates name with defaultName if provided', () => {
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          defaultName="Obter Perfil"
          onSave={vi.fn()}
        />
      );

      const nameInput = screen.getByRole('textbox', { name: /^request name/i });
      expect(nameInput).toHaveValue('Obter Perfil');
    });

    it('defaults name to "New Request" when defaultName is omitted', () => {
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      const nameInput = screen.getByRole('textbox', { name: /^request name/i });
      expect(nameInput).toHaveValue('New Request');
    });

    it('defaults selected collection to the first collection in the list', () => {
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      const collectionSelect = screen.getByRole('combobox', { name: /^target collection/i });
      expect(collectionSelect).toHaveValue('col-1');
    });

    it('filters folder dropdown based on selected collection and resets folder on change', () => {
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      const folderSelect = screen.getByRole('combobox', { name: /^folder/i });
      expect(screen.getByRole('option', { name: /autenticação/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /usuários/i })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /relatórios/i })).toBeNull();

      // Switch to Analytics API
      const collectionSelect = screen.getByRole('combobox', { name: /^target collection/i });
      fireEvent.change(collectionSelect, { target: { value: 'col-2' } });

      expect(screen.getByRole('option', { name: /relatórios/i })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /autenticação/i })).toBeNull();
      expect(folderSelect).toHaveValue('');
    });
  });

  describe('Form Validation & Submission', () => {
    it('submits selected values on save button click', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          defaultName="Listar Pedidos"
          onSave={onSave}
        />
      );

      // Select folder
      const folderSelect = screen.getByRole('combobox', { name: /^folder/i });
      fireEvent.change(folderSelect, { target: { value: 'f-auth' } });

      // Click save
      const saveButton = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('Listar Pedidos', 'col-1', 'f-auth');
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('submits undefined folderId when root folder is selected', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          defaultName="Requisição Raiz"
          onSave={onSave}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('Requisição Raiz', 'col-1', undefined);
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('prevents submission when request name is empty or only whitespace', async () => {
      const onSave = vi.fn();
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          defaultName=""
          onSave={onSave}
        />
      );

      const nameInput = screen.getByRole('textbox', { name: /^request name/i });
      fireEvent.change(nameInput, { target: { value: '   ' } });

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveButton);

      expect(onSave).not.toHaveBeenCalled();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Request name is required.');
    });

    it('clears name validation error when user begins typing', async () => {
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          defaultName=""
          onSave={vi.fn()}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveButton);
      expect(screen.getByRole('alert')).toBeInTheDocument();

      const nameInput = screen.getByRole('textbox', { name: /^request name/i });
      fireEvent.change(nameInput, { target: { value: 'Meu Endpoint' } });

      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('prevents submission when request name exceeds 200 characters', async () => {
      const onSave = vi.fn();
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          onSave={onSave}
        />
      );

      const nameInput = screen.getByRole('textbox', { name: /^request name/i });
      fireEvent.change(nameInput, { target: { value: 'a'.repeat(201) } });

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveButton);

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Request name cannot exceed 200 characters.');
    });
  });

  describe('Loading States & Error Handling', () => {
    it('shows loading spinner and disables buttons while saving is in progress', async () => {
      let resolveSave: () => void = () => {};
      const onSave = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
      );

      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={mockCollections}
          defaultName="Requisição Lenta"
          onSave={onSave}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveButton);

      expect(screen.getByText('Saving...')).toBeInTheDocument();
      expect(saveButton).toBeDisabled();
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: /^request name/i })).toBeDisabled();

      // Resolve save
      resolveSave();
      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    it('displays error message and keeps modal open when onSave fails', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Nome de requisição duplicado na pasta'));
      const onClose = vi.fn();

      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          defaultName="Requisição Existente"
          onSave={onSave}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Nome de requisição duplicado na pasta');
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(saveButton).not.toBeDisabled();
    });

    it('handles empty collections list gracefully by disabling save button', () => {
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          collections={[]}
          onSave={vi.fn()}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      expect(saveButton).toBeDisabled();
      expect(screen.getByText('No collections available')).toBeInTheDocument();
    });
  });

  describe('Dismissal & Keyboard Handling', () => {
    it('calls onClose when clicking Cancel button', () => {
      const onClose = vi.fn();
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking close X button', () => {
      const onClose = vi.fn();
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close modal$/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking modal backdrop', () => {
      const onClose = vi.fn();
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      const backdrop = screen.getByTestId('save-request-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking modal content', () => {
      const onClose = vi.fn();
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      const content = screen.getByTestId('save-request-modal-content');
      fireEvent.click(content);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when pressing Escape key', () => {
      const onClose = vi.fn();
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          onSave={vi.fn()}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose via Escape when saving is in progress', () => {
      const onClose = vi.fn();
      render(
        <SaveRequestModal
          isOpen={true}
          onClose={onClose}
          collections={mockCollections}
          defaultName="Requisição"
          onSave={() => new Promise(() => {})}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveButton);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
