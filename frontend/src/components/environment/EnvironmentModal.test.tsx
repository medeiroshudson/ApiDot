import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EnvironmentModal } from './EnvironmentModal';
import { parseJsonToVariableItems } from './VariableGrid';

describe('EnvironmentModal', () => {
  const defaultGlobals = [
    { key: 'API_URL', value: 'https://api.global.com', isActive: true, isSecret: false },
    { key: 'GLOBAL_TOKEN', value: 'secret-global-token', isActive: true, isSecret: true },
  ];

  const defaultCollection = [
    { key: 'COLLECTION_NAME', value: 'Orders API', isActive: true, isSecret: false },
  ];

  const defaultEnvironments = [
    {
      name: 'Development',
      variables: [
        { key: 'API_URL', value: 'http://localhost:3000', isActive: true, isSecret: false },
        { key: 'DEBUG', value: 'true', isActive: false, isSecret: false },
      ],
    },
    {
      name: 'Production',
      variables: [
        { key: 'API_URL', value: 'https://api.prod.com', isActive: true, isSecret: false },
      ],
    },
  ];

  describe('Modal Visibility & Accessibility', () => {
    it('does not render anything when isOpen is false', () => {
      render(<EnvironmentModal isOpen={false} onClose={() => {}} />);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders modal dialog with accessibility attributes when isOpen is true', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');

      // Title should match labelledby
      const titleId = dialog.getAttribute('aria-labelledby');
      const title = document.getElementById(titleId!);
      expect(title).toBeInTheDocument();
      expect(title?.textContent).toMatch(/^environments & variables$/i);
    });

    it('triggers onClose when close button is clicked', () => {
      const handleClose = vi.fn();
      render(<EnvironmentModal isOpen={true} onClose={handleClose} />);

      const closeBtn = screen.getByRole('button', { name: /close modal|fechar modal|fechar/i });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('triggers onClose when backdrop is clicked', () => {
      const handleClose = vi.fn();
      render(<EnvironmentModal isOpen={true} onClose={handleClose} />);

      const backdrop = screen.getByTestId('environment-modal-backdrop');
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not trigger onClose when clicking inside the modal content', () => {
      const handleClose = vi.fn();
      render(<EnvironmentModal isOpen={true} onClose={handleClose} />);

      const content = screen.getByTestId('environment-modal-content');
      fireEvent.click(content);
      expect(handleClose).not.toHaveBeenCalled();
    });

    it('triggers onClose when Escape key is pressed', () => {
      const handleClose = vi.fn();
      render(<EnvironmentModal isOpen={true} onClose={handleClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'Enter' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('traps focus inside the modal when pressing Tab on last focusable element', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      const dialog = screen.getByRole('dialog');
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'
        )
      ).filter((el) => el.getAttribute('tabindex') !== '-1');

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      lastElement.focus();
      expect(document.activeElement).toBe(lastElement);

      fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(firstElement);
    });

    it('traps focus inside the modal when pressing Shift+Tab on first focusable element', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      const dialog = screen.getByRole('dialog');
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'
        )
      ).filter((el) => el.getAttribute('tabindex') !== '-1');

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      firstElement.focus();
      expect(document.activeElement).toBe(firstElement);

      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(lastElement);
    });

    it('restores focus to previously active element upon closing', () => {
      const triggerBtn = document.createElement('button');
      triggerBtn.textContent = 'Open Modal';
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      const { rerender } = render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      rerender(
        <EnvironmentModal
          isOpen={false}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      expect(document.activeElement).toBe(triggerBtn);
      document.body.removeChild(triggerBtn);
    });
  });

  describe('Tabs Navigation', () => {
    it('renders all 4 tabs: Globals, Collection, Environments, Computed', () => {
      render(<EnvironmentModal isOpen={true} onClose={() => {}} />);

      expect(screen.getByRole('tab', { name: /^globals$/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^collection$/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^environments$/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^computed$/i })).toBeInTheDocument();
    });

    it('switches tabs and updates active aria-selected state', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
          collectionVariables={defaultCollection}
        />
      );

      const globalsTab = screen.getByRole('tab', { name: /^globals$/i });
      const collectionTab = screen.getByRole('tab', { name: /^collection$/i });

      expect(globalsTab).toHaveAttribute('aria-selected', 'true');
      expect(collectionTab).toHaveAttribute('aria-selected', 'false');

      fireEvent.click(collectionTab);

      expect(globalsTab).toHaveAttribute('aria-selected', 'false');
      expect(collectionTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByDisplayValue('COLLECTION_NAME')).toBeInTheDocument();
    });

    it('supports arrow key navigation across tabs', () => {
      render(<EnvironmentModal isOpen={true} onClose={() => {}} />);

      const globalsTab = screen.getByRole('tab', { name: /^globals$/i });
      const collectionTab = screen.getByRole('tab', { name: /^collection$/i });

      globalsTab.focus();
      fireEvent.keyDown(globalsTab, { key: 'ArrowRight' });
      expect(collectionTab).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(collectionTab, { key: 'ArrowLeft' });
      expect(globalsTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('VariableGrid Operations', () => {
    it('renders variable items with checkbox, key input, value input, and action buttons', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      expect(screen.getByDisplayValue('API_URL')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://api.global.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('GLOBAL_TOKEN')).toBeInTheDocument();

      const checkboxes = screen.getAllByRole('checkbox', { name: /active|enable variable|ativo|ativar variável/i });
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
      expect(checkboxes[0]).toBeChecked();
    });

    it('toggles variable active/inactive state', () => {
      const handleGlobalsChange = vi.fn();
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
          onGlobalsChange={handleGlobalsChange}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox', { name: /active|enable variable|ativo|ativar variável/i });
      fireEvent.click(checkboxes[0]);

      expect(checkboxes[0]).not.toBeChecked();
      expect(handleGlobalsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'API_URL', isActive: false }),
        ])
      );
    });

    it('allows in-line editing of key and value', () => {
      const handleGlobalsChange = vi.fn();
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
          onGlobalsChange={handleGlobalsChange}
        />
      );

      const keyInput = screen.getByDisplayValue('API_URL');
      fireEvent.change(keyInput, { target: { value: 'API_ENDPOINT' } });

      expect(keyInput).toHaveValue('API_ENDPOINT');
      expect(handleGlobalsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'API_ENDPOINT' }),
        ])
      );

      const valueInput = screen.getByDisplayValue('https://api.global.com');
      fireEvent.change(valueInput, { target: { value: 'https://custom.api.com' } });

      expect(valueInput).toHaveValue('https://custom.api.com');
      expect(handleGlobalsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ value: 'https://custom.api.com' }),
        ])
      );
    });

    it('masks secret value with password type and reveals it when clicking eye icon', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      // GLOBAL_TOKEN is secret, so its input must have type="password"
      const secretInput = screen.getByDisplayValue('secret-global-token');
      expect(secretInput).toHaveAttribute('type', 'password');

      // Click reveal eye icon
      const revealBtn = screen.getByRole('button', { name: /reveal secret|show secret|reveal value|revelar segredo/i });
      fireEvent.click(revealBtn);

      expect(secretInput).toHaveAttribute('type', 'text');

      // Click again to hide/mask
      const hideBtn = screen.getByRole('button', { name: /hide secret|mask secret|hide value|ocultar segredo/i });
      fireEvent.click(hideBtn);

      expect(secretInput).toHaveAttribute('type', 'password');
    });

    it('deletes a variable row when delete button is clicked', () => {
      const handleGlobalsChange = vi.fn();
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
          onGlobalsChange={handleGlobalsChange}
        />
      );

      expect(screen.getByDisplayValue('API_URL')).toBeInTheDocument();
      const deleteButtons = screen.getAllByRole('button', { name: /delete variable|excluir variável|remover variável/i });
      fireEvent.click(deleteButtons[0]);

      expect(screen.queryByDisplayValue('API_URL')).toBeNull();
      expect(handleGlobalsChange).toHaveBeenCalledWith([
        expect.objectContaining({ key: 'GLOBAL_TOKEN' }),
      ]);
    });

    it('adds a new empty variable row when "Add Variable" button is clicked', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={[{ key: 'FIRST_KEY', value: 'first_value', isActive: true, isSecret: false }]}
        />
      );

      const addBtn = screen.getByRole('button', { name: /add variable/i });
      fireEvent.click(addBtn);

      const keyInputs = screen.getAllByPlaceholderText(/key|chave|nome/i);
      expect(keyInputs.length).toBe(2);
      expect(keyInputs[1]).toHaveValue('');
    });

    it('has scope="col" on table headers', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBeGreaterThan(0);
      headers.forEach((th) => {
        expect(th).toHaveAttribute('scope', 'col');
      });
    });

    it('keys revealedSecrets by stable item id or key', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={[
            { id: 'custom-id-1', key: 'TOKEN_A', value: 'token-val-a', isActive: true, isSecret: true },
            { key: 'TOKEN_B', value: 'token-val-b', isActive: true, isSecret: true },
          ]}
        />
      );

      const inputA = screen.getByDisplayValue('token-val-a');
      const inputB = screen.getByDisplayValue('token-val-b');

      expect(inputA).toHaveAttribute('type', 'password');
      expect(inputB).toHaveAttribute('type', 'password');

      const revealBtns = screen.getAllByRole('button', { name: /reveal secret|revelar segredo/i });
      fireEvent.click(revealBtns[0]);

      expect(inputA).toHaveAttribute('type', 'text');
      expect(inputB).toHaveAttribute('type', 'password');
    });
  });

  describe('Ambientes Tab', () => {
    it('lists environments and displays overrides grid for selected environment', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          initialTab="Ambientes"
          environments={defaultEnvironments}
        />
      );

      // Environment sub-tabs or list items
      expect(screen.getByRole('tab', { name: /development/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /production/i })).toBeInTheDocument();

      // Development is selected by default; its variable is visible
      expect(screen.getByDisplayValue('http://localhost:3000')).toBeInTheDocument();

      // Switch to Production
      const prodTab = screen.getByRole('tab', { name: /production/i });
      fireEvent.click(prodTab);

      expect(screen.getByDisplayValue('https://api.prod.com')).toBeInTheDocument();
    });

    it('allows adding a new environment via text input and add button', () => {
      const handleEnvironmentsChange = vi.fn();
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          initialTab="Environments"
          environments={defaultEnvironments}
          onEnvironmentsChange={handleEnvironmentsChange}
        />
      );

      const input = screen.getByPlaceholderText(/new environment|novo ambiente/i);
      const addBtn = screen.getByRole('button', { name: /add environment|adicionar ambiente/i });

      fireEvent.change(input, { target: { value: 'Staging' } });
      fireEvent.click(addBtn);

      expect(screen.getByRole('tab', { name: /staging/i })).toBeInTheDocument();
      expect(handleEnvironmentsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Staging' }),
        ])
      );
    });

    it('handles case-insensitive duplicate environment name by selecting existing without duplicating', () => {
      const handleEnvironmentsChange = vi.fn();
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          initialTab="Environments"
          environments={defaultEnvironments}
          onEnvironmentsChange={handleEnvironmentsChange}
        />
      );

      const input = screen.getByPlaceholderText(/new environment|novo ambiente/i);
      const addBtn = screen.getByRole('button', { name: /add environment|adicionar ambiente/i });

      // "Development" already exists; try adding lowercase "development"
      fireEvent.change(input, { target: { value: 'development' } });
      fireEvent.click(addBtn);

      // Should NOT call onEnvironmentsChange (no new item added)
      expect(handleEnvironmentsChange).not.toHaveBeenCalled();
      // Input should be cleared
      expect(input).toHaveValue('');
      // Existing Development tab should be selected
      const devTab = screen.getByRole('tab', { name: /development/i });
      expect(devTab).toHaveAttribute('aria-selected', 'true');
    });

    it('supports roving tabIndex and arrow key navigation in environment sub-tabs', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          initialTab="Ambientes"
          environments={defaultEnvironments}
        />
      );

      const devTab = screen.getByRole('tab', { name: /development/i });
      const prodTab = screen.getByRole('tab', { name: /production/i });

      expect(devTab).toHaveAttribute('tabindex', '0');
      expect(prodTab).toHaveAttribute('tabindex', '-1');

      devTab.focus();
      fireEvent.keyDown(devTab, { key: 'ArrowDown' });

      expect(prodTab).toHaveAttribute('aria-selected', 'true');
      expect(prodTab).toHaveAttribute('tabindex', '0');
      expect(devTab).toHaveAttribute('tabindex', '-1');

      fireEvent.keyDown(prodTab, { key: 'ArrowUp' });
      expect(devTab).toHaveAttribute('aria-selected', 'true');
      expect(devTab).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Calculadas Tab', () => {
    it('displays read-only resolved variables with Key, Value, Scope/Source badge, and Override indicator', () => {
      const computedVars = [
        {
          key: 'API_URL',
          value: 'http://localhost:3000',
          scope: 'Environment',
          sourceEnvironmentName: 'Development',
          overrodeExisting: true,
          isSecret: false,
        },
        {
          key: 'GLOBAL_TOKEN',
          value: 'secret-global-token',
          scope: 'Global',
          overrodeExisting: false,
          isSecret: true,
        },
      ];

      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          initialTab="Calculadas"
          computedVariables={computedVars}
        />
      );

      expect(screen.getByText('API_URL')).toBeInTheDocument();
      expect(screen.getByText('http://localhost:3000')).toBeInTheDocument();

      // Scope badges
      const devBadge = screen.getByTestId('scope-badge-API_URL');
      expect(devBadge).toHaveTextContent('Development');

      const globalBadge = screen.getByTestId('scope-badge-GLOBAL_TOKEN');
      expect(globalBadge).toHaveTextContent('Global');

      // Override indicator
      const overrideBadges = screen.getAllByTestId('override-indicator');
      expect(overrideBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('dynamically computes cascade resolution when computedVariables prop is omitted', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          initialTab="Calculadas"
          globals={defaultGlobals}
          collectionVariables={defaultCollection}
          environments={defaultEnvironments}
          activeEnvironment="Development"
        />
      );

      // In Development, API_URL is http://localhost:3000 which overrides global
      expect(screen.getByText('API_URL')).toBeInTheDocument();
      expect(screen.getByText('http://localhost:3000')).toBeInTheDocument();

      // Collection variable should appear
      expect(screen.getByText('COLLECTION_NAME')).toBeInTheDocument();
      expect(screen.getByText('Orders API')).toBeInTheDocument();

      // Inactive DEBUG variable should not be resolved
      expect(screen.queryByText('DEBUG')).toBeNull();
    });

    it('provides accessible label and id for active environment select in Calculadas tab', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          initialTab="Computed"
          globals={defaultGlobals}
          environments={defaultEnvironments}
        />
      );

      const select = screen.getByLabelText(/active environment|ambiente ativo/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveAttribute('id', 'active-env-select');
      expect(select).toHaveAttribute('aria-label', expect.stringMatching(/active environment|ambiente ativo/i));
    });
  });

  describe('Bulk JSON Mode', () => {
    it('toggles to raw JSON editor and shows serialized variables', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      const bulkToggle = screen.getByRole('button', { name: /bulk json|modo json|json em massa/i });
      fireEvent.click(bulkToggle);

      const textarea = screen.getByRole('textbox', { name: /bulk json editor|editor json|json em massa/i });
      expect(textarea).toBeInTheDocument();
      expect(textarea.textContent || (textarea as HTMLTextAreaElement).value).toContain('API_URL');
    });

    it('formats JSON with indentation when clicking "Formatar" button (with Sparkles icon)', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      const bulkToggle = screen.getByRole('button', { name: /bulk json|modo json|json em massa/i });
      fireEvent.click(bulkToggle);

      const textarea = screen.getByRole('textbox', { name: /bulk json editor|editor json|json em massa/i });
      // Unformatted JSON
      fireEvent.change(textarea, { target: { value: '{"API_URL":"https://test.com","TIMEOUT":"5000"}' } });

      const formatBtn = screen.getByRole('button', { name: /format|formatar/i });
      fireEvent.click(formatBtn);

      const formattedValue = (textarea as HTMLTextAreaElement).value;
      expect(formattedValue).toContain('{\n  "API_URL": "https://test.com",\n  "TIMEOUT": "5000"\n}');
    });

    it('shows validation error when JSON is invalid in bulk editor', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      const bulkToggle = screen.getByRole('button', { name: /bulk json|modo json|json em massa/i });
      fireEvent.click(bulkToggle);

      const textarea = screen.getByRole('textbox', { name: /bulk json editor|editor json|json em massa/i });
      fireEvent.change(textarea, { target: { value: '{ invalid: json' } });

      const formatBtn = screen.getByRole('button', { name: /format|formatar/i });
      fireEvent.click(formatBtn);

      expect(screen.getByText(/invalid json|json inválido|sintaxe json inválida/i)).toBeInTheDocument();
    });

    it('applies JSON changes back to variables table when toggled back', () => {
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
        />
      );

      const bulkToggle = screen.getByRole('button', { name: /bulk json|modo json|json em massa/i });
      fireEvent.click(bulkToggle);

      const textarea = screen.getByRole('textbox', { name: /bulk json editor|editor json|json em massa/i });
      fireEvent.change(textarea, {
        target: {
          value: JSON.stringify([
            { key: 'NEW_VAR', value: 'hello_world', isActive: true, isSecret: false },
          ]),
        },
      });

      // Toggle back to table mode
      fireEvent.click(bulkToggle);

      expect(screen.getByDisplayValue('NEW_VAR')).toBeInTheDocument();
      expect(screen.getByDisplayValue('hello_world')).toBeInTheDocument();
    });

    it('does not wipe data or emit onChange when bulk JSON contains a primitive', () => {
      const handleGlobalsChange = vi.fn();
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
          onGlobalsChange={handleGlobalsChange}
        />
      );

      const bulkToggle = screen.getByRole('button', { name: /bulk json|modo json|json em massa/i });
      fireEvent.click(bulkToggle);

      const textarea = screen.getByRole('textbox', { name: /bulk json editor|editor json|json em massa/i });
      fireEvent.change(textarea, { target: { value: '123' } });

      fireEvent.click(bulkToggle);

      expect(screen.getByText(/json must be an array of objects or a key-value object|o json deve ser um array de objetos/i)).toBeInTheDocument();
      expect(handleGlobalsChange).not.toHaveBeenCalled();
    });

    it('formats JSON in textarea without eagerly emitting onChange to parent', () => {
      const handleGlobalsChange = vi.fn();
      render(
        <EnvironmentModal
          isOpen={true}
          onClose={() => {}}
          globals={defaultGlobals}
          onGlobalsChange={handleGlobalsChange}
        />
      );

      const bulkToggle = screen.getByRole('button', { name: /bulk json|modo json|json em massa/i });
      fireEvent.click(bulkToggle);

      const textarea = screen.getByRole('textbox', { name: /bulk json editor|editor json|json em massa/i });
      fireEvent.change(textarea, { target: { value: '{"A":"1","B":"2"}' } });

      const formatBtn = screen.getByRole('button', { name: /format|formatar/i });
      fireEvent.click(formatBtn);

      expect((textarea as HTMLTextAreaElement).value).toContain('{\n  "A": "1",\n  "B": "2"\n}');
      expect(handleGlobalsChange).not.toHaveBeenCalled();
    });
  });

  describe('parseJsonToVariableItems', () => {
    it('returns null for primitives and null', () => {
      expect(parseJsonToVariableItems(123)).toBeNull();
      expect(parseJsonToVariableItems('hello')).toBeNull();
      expect(parseJsonToVariableItems(true)).toBeNull();
      expect(parseJsonToVariableItems(null)).toBeNull();
      expect(parseJsonToVariableItems(undefined)).toBeNull();
    });

    it('parses array of objects correctly', () => {
      const input = [
        { key: 'VAR_1', value: 'VAL_1', isActive: true, isSecret: false },
        { key: 'VAR_2', value: 'VAL_2', isActive: false, isSecret: true },
      ];
      const result = parseJsonToVariableItems(input);
      expect(result).toEqual([
        { id: undefined, key: 'VAR_1', value: 'VAL_1', isActive: true, isSecret: false },
        { id: undefined, key: 'VAR_2', value: 'VAL_2', isActive: false, isSecret: true },
      ]);
    });

    it('parses key-value object correctly', () => {
      const input = { HOST: 'localhost', PORT: 8080 };
      const result = parseJsonToVariableItems(input);
      expect(result).toEqual([
        { key: 'HOST', value: 'localhost', isActive: true, isSecret: false },
        { key: 'PORT', value: '8080', isActive: true, isSecret: false },
      ]);
    });
  });
});
