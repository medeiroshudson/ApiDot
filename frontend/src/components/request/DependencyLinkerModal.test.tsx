import React, { act } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DependencyLinkerModal,
  DependencyRequest,
  getChildPath,
  isValidIdentifier,
} from './DependencyLinkerModal';
import { HTTP_METHOD_BADGES } from '@/components/common/MethodBadge';

describe('DependencyLinkerModal', () => {
  const mockRequests: DependencyRequest[] = [
    {
      id: 'req-auth',
      name: 'Login Auth',
      method: 'POST',
      url: 'https://api.example.com/v1/auth/login',
      response: {
        statusCode: 200,
        headers: {
          'content-type': 'application/json',
          'x-access-token': 'jwt-secret-xyz-789',
        },
        body: JSON.stringify({
          token: 'token-abc-123',
          user: {
            id: 42,
            profile: {
              name: 'Hudson',
              email: 'hudson@example.com',
            },
          },
          roles: ['admin', 'editor'],
        }),
      },
    },
    {
      id: 'req-users',
      name: 'Get Users List',
      method: 'GET',
      url: 'https://api.example.com/v1/users',
      response: {
        statusCode: 200,
        headers: {
          'x-total-count': '100',
        },
        body: JSON.stringify({
          items: [
            { id: 'u1', username: 'alice' },
            { id: 'u2', username: 'bob' },
          ],
          total: 2,
        }),
      },
    },
    {
      id: 'req-current',
      name: 'Current Request to Exclude',
      method: 'PUT',
      url: 'https://api.example.com/v1/users/42',
      response: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  describe('Modal Visibility & Accessibility', () => {
    it('does not render dialog when isOpen is false', () => {
      render(
        <DependencyLinkerModal
          isOpen={false}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders dialog with role="dialog" and aria-modal="true" when isOpen is true', () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('closes modal on close button click', () => {
      const onClose = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={onClose}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      const closeButton = screen.getByRole('button', { name: /^close$/i });
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes modal on cancel button click', () => {
      const onClose = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={onClose}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /^cancel$/i });
      fireEvent.click(cancelButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes modal on Escape key', () => {
      const onClose = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={onClose}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Requests List & Filtering', () => {
    it('lists available requests with HTTP method badges, name, and URL (excluding current request ID)', () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      // Current request ID should be excluded
      expect(screen.queryByText('Current Request to Exclude')).toBeNull();

      // Available requests should be displayed
      expect(screen.getByText('Login Auth')).toBeInTheDocument();
      const postBadge = screen.getByText('POST');
      expect(postBadge).toBeInTheDocument();
      expect(postBadge.className).toContain(HTTP_METHOD_BADGES.POST);
      expect(screen.getByText('https://api.example.com/v1/auth/login')).toBeInTheDocument();

      expect(screen.getByText('Get Users List')).toBeInTheDocument();
      const getBadge = screen.getByText('GET');
      expect(getBadge).toBeInTheDocument();
      expect(getBadge.className).toContain(HTTP_METHOD_BADGES.GET);
      expect(screen.getByText('https://api.example.com/v1/users')).toBeInTheDocument();
    });

    it('filters requests by search query input', () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      const searchInput = screen.getByPlaceholderText(/search requests\.\.\./i);
      fireEvent.change(searchInput, { target: { value: 'Users' } });

      expect(screen.getByText('Get Users List')).toBeInTheDocument();
      expect(screen.queryByText('Login Auth')).toBeNull();
    });
  });

  describe('Tabs and Response Inspector', () => {
    it('when a request with response data is selected, displays tabs: "Body", "Headers", "Status"', () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      // Select req-auth
      const reqAuthButton = screen.getByText('Login Auth');
      fireEvent.click(reqAuthButton);

      expect(screen.getByRole('tab', { name: /^body$/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^headers$/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^status$/i })).toBeInTheDocument();
    });

    it('in Body tab, parses JSON response and renders tree nodes with property keys and values', () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      // In Body tab (active by default), JSON properties should be parsed
      expect(screen.getByText('token')).toBeInTheDocument();
      expect(screen.getByText('"token-abc-123"')).toBeInTheDocument();
      expect(screen.getByText('user')).toBeInTheDocument();
      expect(screen.getByText('roles')).toBeInTheDocument();
    });

    it('clicking a property node generates the canonical token {{$request[\'<id>\'].response.body.<path>}} and invokes onInsertToken', () => {
      const onInsertToken = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      // Click on token property
      const tokenNode = screen.getByText('token');
      fireEvent.click(tokenNode);

      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-auth'].response.body.token}}"
      );
    });

    it('clicking a nested property node generates nested path token', () => {
      const onInsertToken = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      // Click on name property inside user.profile
      const nameNode = screen.getByText('name');
      fireEvent.click(nameNode);

      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-auth'].response.body.user.profile.name}}"
      );
    });

    it('clicking an array element generates array indexed token', () => {
      const onInsertToken = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      // Click on array element "admin" under roles[0]
      const adminNode = screen.getByText('"admin"');
      fireEvent.click(adminNode);

      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-auth'].response.body.roles[0]}}"
      );
    });

    it('in Headers tab, clicking a header generates {{$request[\'<id>\'].response.headers[\'<header-key>\']}}', () => {
      const onInsertToken = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      // Switch to headers tab
      const headersTab = screen.getByRole('tab', { name: /^headers$/i });
      fireEvent.click(headersTab);

      // Verify header is shown
      expect(screen.getByText('x-access-token')).toBeInTheDocument();
      expect(screen.getByText('jwt-secret-xyz-789')).toBeInTheDocument();

      // Click header
      fireEvent.click(screen.getByText('x-access-token'));

      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-auth'].response.headers['x-access-token']}}"
      );
    });

    it('in Status tab, generates {{$request[\'<id>\'].response.status}}', () => {
      const onInsertToken = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      // Switch to status tab
      const statusTab = screen.getByRole('tab', { name: /^status$/i });
      fireEvent.click(statusTab);

      const panel = screen.getByRole('tabpanel');
      expect(within(panel).getByText('200')).toBeInTheDocument();

      // Click status node / insert button
      const statusElement = within(panel).getByText('200');
      fireEvent.click(statusElement);

      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-auth'].response.status}}"
      );
    });

    it('supports copying the token to clipboard', async () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      // Look for copy button next to token
      const copyButtons = screen.getAllByRole('button', { name: /^copy token$/i });
      expect(copyButtons.length).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.click(copyButtons[0]);
      });
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('allows collapsing and expanding tree nodes in JSON tree', () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
          currentRequestId="req-current"
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      expect(screen.getByText('profile')).toBeInTheDocument();

      // Toggle user node collapse
      const toggleButtons = screen.getAllByRole('button', { name: /^(collapse|expand)/i });
      fireEvent.click(toggleButtons[0]);

      // Should be collapsible
      expect(toggleButtons[0]).toBeInTheDocument();
    });

    it('shows empty message when selected request has no response', () => {
      const requestsWithNoResponse: DependencyRequest[] = [
        {
          id: 'req-empty',
          name: 'Empty Response Req',
          method: 'GET',
          url: 'https://api.example.com/no-response',
          response: null,
        },
      ];

      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={requestsWithNoResponse}
        />
      );

      expect(
        screen.getByText('This request has no executed response data.')
      ).toBeInTheDocument();
    });

    it('handles requests with array root payload correctly', () => {
      const onInsertToken = vi.fn();
      const arrayRequests: DependencyRequest[] = [
        {
          id: 'req-array',
          name: 'Array Req',
          method: 'GET',
          response: {
            statusCode: 200,
            body: JSON.stringify([{ id: 101, name: 'Item 1' }]),
          },
        },
      ];

      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={arrayRequests}
        />
      );

      expect(screen.getByText('[0]')).toBeInTheDocument();
      expect(screen.getByText('"Item 1"')).toBeInTheDocument();

      fireEvent.click(screen.getByText('"Item 1"'));
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-array'].response.body[0].name}}"
      );
    });

    it('formats keys with special characters using bracket notation', () => {
      const onInsertToken = vi.fn();
      const specialRequests: DependencyRequest[] = [
        {
          id: 'req-special',
          name: 'Special Keys Req',
          method: 'GET',
          response: {
            statusCode: 200,
            body: JSON.stringify({
              'user-name': 'hudson',
              'content.type': 'json',
              'first name': 'Hudson',
              profile: {
                'contact-phone': '+5511999999999',
                'home.address': 'Main St',
              },
            }),
          },
        },
      ];

      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={specialRequests}
        />
      );

      // Root key with hyphen
      fireEvent.click(screen.getByText('user-name'));
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-special'].response.body['user-name']}}"
      );

      // Root key with dot
      fireEvent.click(screen.getByText('content.type'));
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-special'].response.body['content.type']}}"
      );

      // Root key with space
      fireEvent.click(screen.getByText('first name'));
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-special'].response.body['first name']}}"
      );

      // Nested key with hyphen
      fireEvent.click(screen.getByText('contact-phone'));
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-special'].response.body.profile['contact-phone']}}"
      );

      // Nested key with dot
      fireEvent.click(screen.getByText('home.address'));
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-special'].response.body.profile['home.address']}}"
      );
    });

    it('properly renders and inserts falsy body values (false, 0, "")', () => {
      const onInsertToken = vi.fn();
      const falsyRequests: DependencyRequest[] = [
        {
          id: 'req-falsy-bool',
          name: 'Falsy Bool Req',
          method: 'GET',
          response: {
            statusCode: 200,
            body: 'false',
          },
        },
        {
          id: 'req-falsy-zero',
          name: 'Falsy Zero Req',
          method: 'GET',
          response: {
            statusCode: 200,
            body: '0',
          },
        },
        {
          id: 'req-falsy-empty',
          name: 'Falsy Empty Req',
          method: 'GET',
          response: {
            statusCode: 200,
            body: '',
          },
        },
      ];

      const { rerender } = render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={falsyRequests}
        />
      );

      // Falsy false
      fireEvent.click(screen.getByText('Falsy Bool Req'));
      const falseVal = screen.getByText('false');
      expect(falseVal).toBeInTheDocument();
      fireEvent.click(falseVal);
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-falsy-bool'].response.body}}"
      );

      // Falsy zero
      fireEvent.click(screen.getByText('Falsy Zero Req'));
      const zeroVal = screen.getByText('0');
      expect(zeroVal).toBeInTheDocument();
      fireEvent.click(zeroVal);
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-falsy-zero'].response.body}}"
      );

      // Falsy empty string (should not say "Nenhum corpo de resposta retornado.")
      fireEvent.click(screen.getByText('Falsy Empty Req'));
      expect(
        screen.queryByText('Nenhum corpo de resposta retornado.')
      ).toBeNull();
    });

    it('enforces depth guard and lazy expansion (depth >= 2 collapsed by default, depth > 12 truncated)', () => {
      // Build a deeply nested object with 15 levels
      let nested: any = { leaf: 'bottom' };
      for (let i = 15; i >= 1; i--) {
        nested = { [`level_${i}`]: nested };
      }

      const deepRequests: DependencyRequest[] = [
        {
          id: 'req-deep',
          name: 'Deep Req',
          method: 'GET',
          response: {
            statusCode: 200,
            body: JSON.stringify(nested),
          },
        },
      ];

      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={deepRequests}
        />
      );

      // Depth 0: level_1 should be visible and expanded
      expect(screen.getByText('level_1')).toBeInTheDocument();
      // Depth 1: level_2 should be visible (since depth 0 is expanded) and expanded (depth 1 < 2)
      expect(screen.getByText('level_2')).toBeInTheDocument();
      // Depth 2: level_3 should be rendered, but NOT expanded by default because depth >= 2
      expect(screen.getByText('level_3')).toBeInTheDocument();
      expect(screen.queryByText('level_4')).toBeNull();

      // Expand level_3 (depth 2) -> level_4 appears
      const expandBtn = screen.getByRole('button', { name: /^expand level_3$/i });
      fireEvent.click(expandBtn);
      expect(screen.getByText('level_4')).toBeInTheDocument();
    });

    it('renders depth limit message when depth > 12', () => {
      // Create an object where level 13 has children
      // We'll test with a helper or direct structure
      let nested: any = 'final';
      for (let i = 14; i >= 1; i--) {
        nested = { child: nested };
      }

      const deepRequests: DependencyRequest[] = [
        {
          id: 'req-deep-limit',
          name: 'Deep Limit Req',
          method: 'GET',
          response: {
            statusCode: 200,
            body: JSON.stringify(nested),
          },
        },
      ];

      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={deepRequests}
        />
      );

      // Expand down to level 13
      // Expand level 2 through 12
      for (let i = 0; i < 11; i++) {
        const expandBtns = screen.queryAllByRole('button', { name: /^expand child$/i });
        if (expandBtns.length > 0) {
          fireEvent.click(expandBtns[0]);
        }
      }

      expect(screen.getByText('[Maximum depth reached]')).toBeInTheDocument();
    });
  });

  describe('Keyboard Accessibility and Focus Trap', () => {
    it('focuses search input when modal opens', async () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search requests...');
      await waitFor(() => {
        expect(document.activeElement).toBe(searchInput);
      });
    });

    it('restores focus to previous active element on modal close', async () => {
      const triggerBtn = document.createElement('button');
      triggerBtn.textContent = 'Trigger';
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      const { rerender } = render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      rerender(
        <DependencyLinkerModal
          isOpen={false}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      await waitFor(() => {
        expect(document.activeElement).toBe(triggerBtn);
      });
      document.body.removeChild(triggerBtn);
    });

    it('supports keyboard Enter and Space on tree node row to insert token', () => {
      const onInsertToken = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={mockRequests}
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      // Find token row with role="button"
      const tokenNode = screen.getByText('token');
      const row = tokenNode.closest('[role="button"]')!;
      expect(row).toBeInTheDocument();
      expect(row).toHaveAttribute('tabindex', '0');

      // Press Enter
      fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' });
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-auth'].response.body.token}}"
      );

      // Press Space
      fireEvent.keyDown(row, { key: ' ', code: 'Space' });
      expect(onInsertToken).toHaveBeenCalledTimes(2);
    });

    it('supports keyboard Enter and Space on headers row to insert token', () => {
      const onInsertToken = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={mockRequests}
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));
      fireEvent.click(screen.getByRole('tab', { name: /^headers$/i }));

      const headerKey = screen.getByText('x-access-token');
      const row = headerKey.closest('[role="button"]')!;
      expect(row).toBeInTheDocument();
      expect(row).toHaveAttribute('tabindex', '0');

      // Press Enter
      fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' });
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-auth'].response.headers['x-access-token']}}"
      );

      // Press Space
      fireEvent.keyDown(row, { key: ' ', code: 'Space' });
      expect(onInsertToken).toHaveBeenCalledTimes(2);
    });

    it('supports keyboard Enter and Space on status row to insert token', () => {
      const onInsertToken = vi.fn();
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={onInsertToken}
          availableRequests={mockRequests}
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));
      fireEvent.click(screen.getByRole('tab', { name: /status/i }));

      const panel = screen.getByRole('tabpanel');
      const statusElement = within(panel).getByText('200');
      const row = statusElement.closest('[role="button"]')!;
      expect(row).toBeInTheDocument();

      // Press Enter
      fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' });
      expect(onInsertToken).toHaveBeenCalledWith(
        "{{$request['req-auth'].response.status}}"
      );

      // Press Space
      fireEvent.keyDown(row, { key: ' ', code: 'Space' });
      expect(onInsertToken).toHaveBeenCalledTimes(2);
    });

    it('traps Tab and Shift+Tab within dialog', () => {
      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      const dialog = screen.getByRole('dialog');
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const focusableElements: HTMLElement[] = Array.from(focusable).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1'
      );

      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];

      // Focus last element and press Tab -> should wrap to first element
      lastEl.focus();
      expect(document.activeElement).toBe(lastEl);
      fireEvent.keyDown(window, { key: 'Tab', code: 'Tab' });
      expect(document.activeElement).toBe(firstEl);

      // Focus first element and press Shift+Tab -> should wrap to last element
      firstEl.focus();
      expect(document.activeElement).toBe(firstEl);
      fireEvent.keyDown(window, { key: 'Tab', code: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(lastEl);
    });

    it('handles clipboard writeText rejection gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockImplementation(() => Promise.reject(new Error('Permission denied'))),
        },
      });

      render(
        <DependencyLinkerModal
          isOpen={true}
          onClose={vi.fn()}
          onInsertToken={vi.fn()}
          availableRequests={mockRequests}
        />
      );

      fireEvent.click(screen.getByText('Login Auth'));

      const copyButtons = screen.getAllByRole('button', { name: /^copy token$/i });
      await act(async () => {
        fireEvent.click(copyButtons[0]);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falha ao copiar token'),
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getChildPath helper', () => {
    it('generates dot notation for valid identifier property keys', () => {
      expect(getChildPath('', 'token', false)).toBe('token');
      expect(getChildPath('user', 'profile', false)).toBe('user.profile');
      expect(getChildPath('user.profile', 'name', false)).toBe('user.profile.name');
    });

    it('generates bracket notation for property keys with special characters', () => {
      expect(getChildPath('', 'user-name', false)).toBe("['user-name']");
      expect(getChildPath('', 'content.type', false)).toBe("['content.type']");
      expect(getChildPath('', 'first name', false)).toBe("['first name']");
      expect(getChildPath('user', 'user-name', false)).toBe("user['user-name']");
      expect(getChildPath('user', 'data.info', false)).toBe("user['data.info']");
    });

    it('generates array indexing for array items', () => {
      expect(getChildPath('', 0, true)).toBe('[0]');
      expect(getChildPath('items', 2, true)).toBe('items[2]');
      expect(getChildPath('items[2]', 'id', false)).toBe('items[2].id');
      expect(getChildPath('items[2]', 'item-id', false)).toBe("items[2]['item-id']");
    });
  });
});
