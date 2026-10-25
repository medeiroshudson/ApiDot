import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DependencyLinkerModal,
  DependencyRequest,
} from './DependencyLinkerModal';

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

      const closeButton = screen.getByRole('button', { name: /fechar/i });
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

      const cancelButton = screen.getByRole('button', { name: /cancelar/i });
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
      expect(screen.getByText('POST')).toBeInTheDocument();
      expect(screen.getByText('https://api.example.com/v1/auth/login')).toBeInTheDocument();

      expect(screen.getByText('Get Users List')).toBeInTheDocument();
      expect(screen.getByText('GET')).toBeInTheDocument();
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

      const searchInput = screen.getByPlaceholderText(/buscar/i);
      fireEvent.change(searchInput, { target: { value: 'Users' } });

      expect(screen.getByText('Get Users List')).toBeInTheDocument();
      expect(screen.queryByText('Login Auth')).toBeNull();
    });
  });

  describe('Tabs and Response Inspector', () => {
    it('when a request with response data is selected, displays tabs: "Corpo (Body)", "Cabeçalhos (Headers)", "Status"', () => {
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

      expect(screen.getByRole('tab', { name: /corpo/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /cabeçalhos/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /status/i })).toBeInTheDocument();
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
      const headersTab = screen.getByRole('tab', { name: /cabeçalhos/i });
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
      const statusTab = screen.getByRole('tab', { name: /status/i });
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
      const copyButtons = screen.getAllByRole('button', { name: /copiar/i });
      expect(copyButtons.length).toBeGreaterThan(0);

      fireEvent.click(copyButtons[0]);
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
      const toggleButtons = screen.getAllByRole('button', { name: /recolher|expandir|toggle/i });
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
        screen.getByText(/esta requisição não possui dados de resposta executados/i)
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
  });
});
