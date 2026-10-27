import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenApiImportModal,
  parseTitleSuggestionFromUrl,
  parseTitleSuggestionFromContent,
} from './OpenApiImportModal';

describe('OpenApiImportModal', () => {
  const defaultWorkspaceId = 'ws-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Core Specification Acceptance (Step 1)', () => {
    it('validates URL, parses title suggestion, and submits to onImport', async () => {
      const onImport = vi.fn().mockResolvedValue({ id: 'c1', name: 'Petstore' });
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={onImport}
          workspaceId={defaultWorkspaceId}
        />
      );

      const urlInput = screen.getByLabelText(/URL da Especificação/i);
      fireEvent.change(urlInput, {
        target: { value: 'https://petstore.swagger.io/v2/swagger.json' },
      });

      // Verifies title suggestion parsed from URL is available in placeholder or suggestion hint
      const nameInput = screen.getByLabelText(/Nome da Coleção/i);
      expect(nameInput).toHaveAttribute('placeholder', expect.stringMatching(/Petstore/i));

      const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onImport).toHaveBeenCalledWith(
          expect.objectContaining({
            specUrl: 'https://petstore.swagger.io/v2/swagger.json',
            workspaceId: defaultWorkspaceId,
          })
        );
      });
    });
  });

  describe('Modal Visibility & Accessibility', () => {
    it('does not render when isOpen is false', () => {
      render(
        <OpenApiImportModal
          isOpen={false}
          onClose={vi.fn()}
          workspaceId={defaultWorkspaceId}
        />
      );

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders accessible dialog with aria-modal="true" and title', () => {
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          workspaceId={defaultWorkspaceId}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');

      const titleId = dialog.getAttribute('aria-labelledby');
      const title = document.getElementById(titleId!);
      expect(title).toBeInTheDocument();
      expect(title?.textContent).toMatch(/Importar Especificação OpenAPI/i);
    });

    it('closes on Escape key press when not loading', () => {
      const onClose = vi.fn();
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={onClose}
          workspaceId={defaultWorkspaceId}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes when clicking close or cancel buttons', () => {
      const onClose = vi.fn();
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={onClose}
          workspaceId={defaultWorkspaceId}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalledTimes(1);

      const closeHeaderBtn = screen.getByRole('button', {
        name: /Fechar modal/i,
      });
      fireEvent.click(closeHeaderBtn);
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });

  describe('Validation & Error Handling', () => {
    it('shows error if URL is empty on submit', async () => {
      const onImport = vi.fn();
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={onImport}
          workspaceId={defaultWorkspaceId}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
      fireEvent.click(submitBtn);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/URL da especificação é obrigatória/i);
      expect(onImport).not.toHaveBeenCalled();
    });

    it('shows error if URL does not start with http:// or https://', async () => {
      const onImport = vi.fn();
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={onImport}
          workspaceId={defaultWorkspaceId}
        />
      );

      const urlInput = screen.getByLabelText(/URL da Especificação/i);
      fireEvent.change(urlInput, { target: { value: 'ftp://invalid-spec-url.com' } });

      const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
      fireEvent.click(submitBtn);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/HTTP ou HTTPS válido/i);
      expect(onImport).not.toHaveBeenCalled();
    });

    it('displays error message when onImport rejects', async () => {
      const onImport = vi.fn().mockRejectedValue(new Error('Falha ao conectar no host OpenAPI'));
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={onImport}
          workspaceId={defaultWorkspaceId}
        />
      );

      const urlInput = screen.getByLabelText(/URL da Especificação/i);
      fireEvent.change(urlInput, { target: { value: 'https://petstore.swagger.io/v2/swagger.json' } });

      const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
      fireEvent.click(submitBtn);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Falha ao conectar no host OpenAPI');
    });
  });

  describe('Tab Switching & Raw Spec Content', () => {
    it('switches between URL and Colar Conteúdo tabs', () => {
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          workspaceId={defaultWorkspaceId}
        />
      );

      const urlTab = screen.getByRole('tab', { name: /^URL$/i });
      const rawTab = screen.getByRole('tab', { name: /Colar Conteúdo/i });

      expect(urlTab).toHaveAttribute('aria-selected', 'true');
      expect(rawTab).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByLabelText(/URL da Especificação/i)).toBeInTheDocument();

      fireEvent.click(rawTab);

      expect(rawTab).toHaveAttribute('aria-selected', 'true');
      expect(urlTab).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByLabelText(/Conteúdo da Especificação/i)).toBeInTheDocument();
    });

    it('validates empty raw content when submitting on raw tab', async () => {
      const onImport = vi.fn();
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={onImport}
          workspaceId={defaultWorkspaceId}
        />
      );

      fireEvent.click(screen.getByRole('tab', { name: /Colar Conteúdo/i }));

      const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
      fireEvent.click(submitBtn);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/conteúdo da especificação openapi é obrigatório/i);
      expect(onImport).not.toHaveBeenCalled();
    });

    it('submits raw YAML/JSON spec content and parses title suggestion from content', async () => {
      const onImport = vi.fn().mockResolvedValue({ id: 'c2', name: 'Order Management API' });
      const onImportSuccess = vi.fn();
      const onClose = vi.fn();

      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={onClose}
          onImport={onImport}
          onImportSuccess={onImportSuccess}
          workspaceId={defaultWorkspaceId}
        />
      );

      fireEvent.click(screen.getByRole('tab', { name: /Colar Conteúdo/i }));

      const rawJson = JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Order Management API', version: '1.0.0' },
        paths: {},
      });

      const contentInput = screen.getByLabelText(/Conteúdo da Especificação/i);
      fireEvent.change(contentInput, { target: { value: rawJson } });

      // Verifies title suggestion parsed from JSON
      const nameInput = screen.getByLabelText(/Nome da Coleção/i);
      expect(nameInput).toHaveAttribute('placeholder', expect.stringMatching(/Order Management API/i));

      // Click the detected suggestion chip if available
      const suggestionBtn = screen.getByRole('button', { name: /Order Management API/i });
      fireEvent.click(suggestionBtn);
      expect(nameInput).toHaveValue('Order Management API');

      const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onImport).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceId: defaultWorkspaceId,
            name: 'Order Management API',
            specContent: rawJson,
          })
        );
        expect(onImportSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'c2', name: 'Order Management API' })
        );
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('Custom Collection Name & Title Suggestion Helpers', () => {
    it('submits with explicit custom name', async () => {
      const onImport = vi.fn().mockResolvedValue({ id: 'c3', name: 'Minha API Customizada' });
      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={onImport}
          workspaceId={defaultWorkspaceId}
        />
      );

      const urlInput = screen.getByLabelText(/URL da Especificação/i);
      fireEvent.change(urlInput, { target: { value: 'https://petstore.swagger.io/v2/swagger.json' } });

      const nameInput = screen.getByLabelText(/Nome da Coleção/i);
      fireEvent.change(nameInput, { target: { value: 'Minha API Customizada' } });

      const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onImport).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Minha API Customizada',
            specUrl: 'https://petstore.swagger.io/v2/swagger.json',
            workspaceId: defaultWorkspaceId,
          })
        );
      });
    });

    it('helper parseTitleSuggestionFromUrl parses various URL formats correctly', () => {
      expect(parseTitleSuggestionFromUrl('https://petstore.swagger.io/v2/swagger.json')).toBe('Petstore');
      expect(parseTitleSuggestionFromUrl('https://api.github.com/v3/openapi.json')).toBe('Github');
      expect(parseTitleSuggestionFromUrl('https://example.com/api/users-service/v1/swagger.json')).toBe('Users Service');
      expect(parseTitleSuggestionFromUrl('https://api.test.org/v1/openapi.yaml')).toBe('Test');
      expect(parseTitleSuggestionFromUrl('')).toBe('');
      expect(parseTitleSuggestionFromUrl('not-a-url')).toBe('');
    });

    it('helper parseTitleSuggestionFromContent parses JSON and YAML titles correctly', () => {
      const json = '{"info": {"title": "Users Service API", "version": "1.0"}}';
      expect(parseTitleSuggestionFromContent(json)).toBe('Users Service API');

      const yaml = `
openapi: 3.0.0
info:
  title: Products Inventory API
  version: 2.0.0
`;
      expect(parseTitleSuggestionFromContent(yaml)).toBe('Products Inventory API');
      expect(parseTitleSuggestionFromContent('')).toBe('');
    });
  });

  describe('Loading State', () => {
    it('disables submit button and shows loading spinner while importing', async () => {
      let resolveImport: (value: any) => void;
      const importPromise = new Promise((resolve) => {
        resolveImport = resolve;
      });
      const onImport = vi.fn().mockReturnValue(importPromise);

      render(
        <OpenApiImportModal
          isOpen={true}
          onClose={vi.fn()}
          onImport={onImport}
          workspaceId={defaultWorkspaceId}
        />
      );

      const urlInput = screen.getByLabelText(/URL da Especificação/i);
      fireEvent.change(urlInput, { target: { value: 'https://petstore.swagger.io/v2/swagger.json' } });

      const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
      fireEvent.click(submitBtn);

      // Loading state
      expect(screen.getByRole('button', { name: /Importando/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Cancelar/i })).toBeDisabled();

      // Resolve import
      resolveImport!({ id: 'c1', name: 'Petstore' });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Importando/i })).toBeNull();
      });
    });
  });
});
