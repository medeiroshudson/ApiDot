import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CurlImportModal } from './CurlImportModal';
import { METHOD_COLORS } from './RequestAutocomplete';

describe('CurlImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Visibility & WAI-ARIA Accessibility', () => {
    it('does not render dialog when isOpen is false', () => {
      render(
        <CurlImportModal
          isOpen={false}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders dialog title "Import Request via cURL" when isOpen is true', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'curl-import-modal-title');
      expect(
        screen.getByRole('heading', { name: /import request via curl|importar requisição via curl/i })
      ).toBeInTheDocument();
    });

    it('autofocuses textarea on mount', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveFocus();
    });

    it('closes on Cancel button click', () => {
      const onClose = vi.fn();
      render(
        <CurlImportModal
          isOpen={true}
          onClose={onClose}
          onImport={vi.fn()}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /cancel|cancelar/i });
      fireEvent.click(cancelBtn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Close (X) button click', () => {
      const onClose = vi.fn();
      render(
        <CurlImportModal
          isOpen={true}
          onClose={onClose}
          onImport={vi.fn()}
        />
      );

      const closeBtn = screen.getByRole('button', { name: /close|fechar/i });
      fireEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape key press', () => {
      const onClose = vi.fn();
      render(
        <CurlImportModal
          isOpen={true}
          onClose={onClose}
          onImport={vi.fn()}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on clicking backdrop overlay', () => {
      const onClose = vi.fn();
      render(
        <CurlImportModal
          isOpen={true}
          onClose={onClose}
          onImport={vi.fn()}
        />
      );

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close when clicking inside modal content', () => {
      const onClose = vi.fn();
      render(
        <CurlImportModal
          isOpen={true}
          onClose={onClose}
          onImport={vi.fn()}
        />
      );

      const modalContent = screen.getByTestId('curl-import-modal-content');
      fireEvent.click(modalContent);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Validation & Live Preview Card', () => {
    it('disables submit button initially when textarea is empty', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /import request|importar requisição/i });
      expect(submitBtn).toBeDisabled();
      expect(screen.queryByTestId('curl-preview-card')).toBeNull();
    });

    it('displays validation error when input is invalid or not cURL', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, { target: { value: 'git checkout main' } });

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/deve começar com "curl"|must start with "curl"/i);

      const submitBtn = screen.getByRole('button', { name: /import request|importar requisição/i });
      expect(submitBtn).toBeDisabled();
      expect(screen.queryByTestId('curl-preview-card')).toBeNull();
    });

    it('displays validation error when cURL lacks a URL', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, { target: { value: 'curl -H "Content-Type: application/json"' } });

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/nenhuma url encontrada|no url found/i);

      const submitBtn = screen.getByRole('button', { name: /import request|importar requisição/i });
      expect(submitBtn).toBeDisabled();
    });

    it('shows preview card with method badge, URL, and header count when valid cURL is entered', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: {
          value:
            'curl -X POST https://api.example.com/v1/orders -H "Content-Type: application/json" -H "X-Client: WebApp" -d \'{"total": 99.9}\'',
        },
      });

      // No validation error
      expect(screen.queryByRole('alert')).toBeNull();

      // Preview card is displayed
      const previewCard = screen.getByTestId('curl-preview-card');
      expect(previewCard).toBeInTheDocument();

      // Method badge
      const methodBadge = screen.getByTestId('curl-preview-method');
      expect(methodBadge).toHaveTextContent('POST');
      expect(methodBadge.className).toContain(METHOD_COLORS['POST']);

      // URL display
      expect(screen.getByText('https://api.example.com/v1/orders')).toBeInTheDocument();

      // Header count (2 headers)
      expect(screen.getByText(/2 headers/i)).toBeInTheDocument();

      // Body badge
      expect(screen.getByTestId('curl-preview-body-badge')).toHaveTextContent('JSON');

      // Submit button is now enabled
      const submitBtn = screen.getByRole('button', { name: /import request|importar requisição/i });
      expect(submitBtn).not.toBeDisabled();
    });

    it('hides preview card and re-disables submit when cURL input is cleared', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: { value: 'curl https://api.example.com/v1/users' },
      });

      expect(screen.getByTestId('curl-preview-card')).toBeInTheDocument();

      fireEvent.change(textarea, { target: { value: '' } });

      expect(screen.queryByTestId('curl-preview-card')).toBeNull();
      expect(screen.getByRole('button', { name: /import request|importar requisição/i })).toBeDisabled();
    });
  });

  describe('Request Name Input & Target Destination', () => {
    it('prefills request name input from parsed cURL and allows editing', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: { value: 'curl https://api.example.com/v1/products' },
      });

      const nameInput = screen.getByRole('textbox', { name: /request name|nome da requisição/i });
      expect(nameInput).toHaveValue('Products');

      // Edit name
      fireEvent.change(nameInput, { target: { value: 'Listar Produtos Ativos' } });
      expect(nameInput).toHaveValue('Listar Produtos Ativos');
    });

    it('preserves user edited name when cURL input changes', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: { value: 'curl https://api.example.com/v1/products' },
      });

      const nameInput = screen.getByRole('textbox', { name: /request name|nome da requisição/i });
      fireEvent.change(nameInput, { target: { value: 'Meu Nome Customizado' } });

      // Change cURL to another endpoint
      fireEvent.change(textarea, {
        target: { value: 'curl -X DELETE https://api.example.com/v1/orders/123' },
      });

      // Name remains the custom value
      expect(nameInput).toHaveValue('Meu Nome Customizado');
    });

    it('displays target destination name when targetName is provided', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
          targetName="Coleção: Pagamentos"
        />
      );

      expect(screen.getByText(/Coleção: Pagamentos/i)).toBeInTheDocument();
    });

    it('does not display target destination block when targetName is omitted', () => {
      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      expect(screen.queryByText(/destino:/i)).toBeNull();
    });
  });

  describe('Import Action & Lifecycle', () => {
    it('calls onImport with parsed data and confirmed name when clicking "Importar Requisição"', async () => {
      const onImport = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <CurlImportModal
          isOpen={true}
          onClose={onClose}
          onImport={onImport}
          targetName="Coleção: Clientes"
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: {
          value:
            'curl -X PUT https://api.example.com/v1/customers/42 -H "Authorization: Bearer token123" -H "Content-Type: application/json" -d \'{"name": "Hudson"}\'',
        },
      });

      const nameInput = screen.getByRole('textbox', { name: /request name|nome da requisição/i });
      fireEvent.change(nameInput, { target: { value: 'Atualizar Cliente #42' } });

      const submitBtn = screen.getByRole('button', { name: /import request|importar requisição/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onImport).toHaveBeenCalledTimes(1);
      });

      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: 'https://api.example.com/v1/customers/42',
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
            'Content-Type': 'application/json',
          }),
          bodyContent: '{"name": "Hudson"}',
          bodyType: 'Json',
          auth: expect.objectContaining({
            type: 'bearer',
            token: 'token123',
          }),
        }),
        'Atualizar Cliente #42'
      );

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('falls back to parsed request name if name input is cleared by user', async () => {
      const onImport = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <CurlImportModal
          isOpen={true}
          onClose={onClose}
          onImport={onImport}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: { value: 'curl https://api.example.com/v1/categories' },
      });

      const nameInput = screen.getByRole('textbox', { name: /request name|nome da requisição/i });
      fireEvent.change(nameInput, { target: { value: '   ' } });

      const submitBtn = screen.getByRole('button', { name: /import request|importar requisição/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onImport).toHaveBeenCalledWith(
          expect.objectContaining({ url: 'https://api.example.com/v1/categories' }),
          'Categories'
        );
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('displays error and does not close modal if onImport throws', async () => {
      const onImport = vi.fn().mockRejectedValue(new Error('Falha de rede ao persistir requisição.'));
      const onClose = vi.fn();

      render(
        <CurlImportModal
          isOpen={true}
          onClose={onClose}
          onImport={onImport}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: { value: 'curl https://api.example.com/items' },
      });

      const submitBtn = screen.getByRole('button', { name: /import request|importar requisição/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Falha de rede ao persistir requisição.'
        );
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('shows loading indicator and disables actions during submission', async () => {
      let resolveImport!: () => void;
      const onImport = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveImport = resolve;
          })
      );

      render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={onImport}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: { value: 'curl https://api.example.com/users' },
      });

      const submitBtn = screen.getByRole('button', { name: /import request|importar requisição/i });
      const cancelBtn = screen.getByRole('button', { name: /cancel|cancelar/i });

      fireEvent.click(submitBtn);

      // In submitting state
      expect(submitBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();
      expect(screen.getByTestId('curl-import-loading-spinner')).toBeInTheDocument();

      // Resolve import
      resolveImport();

      await waitFor(() => {
        expect(screen.queryByTestId('curl-import-loading-spinner')).toBeNull();
      });
    });

    it('resets state when modal is closed and reopened', () => {
      const { rerender } = render(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      fireEvent.change(textarea, {
        target: { value: 'curl https://api.example.com/v1/orders' },
      });

      expect(screen.getByTestId('curl-preview-card')).toBeInTheDocument();

      // Close modal
      rerender(
        <CurlImportModal
          isOpen={false}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );
      expect(screen.queryByRole('dialog')).toBeNull();

      // Reopen modal
      rerender(
        <CurlImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const newTextarea = screen.getByRole('textbox', { name: /curl command|comando curl/i });
      expect(newTextarea).toHaveValue('');
      expect(screen.queryByTestId('curl-preview-card')).toBeNull();
      expect(screen.getByRole('button', { name: /import request|importar requisição/i })).toBeDisabled();
    });
  });
});
