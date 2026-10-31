import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  MethodBadge,
  HTTP_METHOD_BADGES,
  METHOD_COLORS,
  DEFAULT_METHOD_BADGE_STYLE,
} from './MethodBadge';

describe('MethodBadge', () => {
  describe('Constants and Exports', () => {
    it('exports HTTP_METHOD_BADGES with consistent color definitions', () => {
      expect(HTTP_METHOD_BADGES).toBeDefined();
      expect(HTTP_METHOD_BADGES.GET).toBe('text-emerald-400 bg-emerald-950/60 border-emerald-800/80');
      expect(HTTP_METHOD_BADGES.POST).toBe('text-blue-400 bg-blue-950/60 border-blue-800/80');
      expect(HTTP_METHOD_BADGES.PUT).toBe('text-amber-400 bg-amber-950/60 border-amber-800/80');
      expect(HTTP_METHOD_BADGES.PATCH).toBe('text-purple-400 bg-purple-950/60 border-purple-800/80');
      expect(HTTP_METHOD_BADGES.DELETE).toBe('text-rose-400 bg-rose-950/60 border-rose-800/80');
      expect(HTTP_METHOD_BADGES.HEAD).toBe('text-neutral-400 bg-neutral-900 border-neutral-700');
      expect(HTTP_METHOD_BADGES.OPTIONS).toBe('text-cyan-400 bg-cyan-950/60 border-cyan-800/80');
    });

    it('exports METHOD_COLORS as an alias of HTTP_METHOD_BADGES', () => {
      expect(METHOD_COLORS).toBe(HTTP_METHOD_BADGES);
    });

    it('exports DEFAULT_METHOD_BADGE_STYLE for neutral fallback', () => {
      expect(DEFAULT_METHOD_BADGE_STYLE).toBe('text-neutral-400 bg-neutral-900 border-neutral-700');
    });
  });

  describe('Standard HTTP Methods Rendering', () => {
    const standardMethods: Array<keyof typeof HTTP_METHOD_BADGES> = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ];

    standardMethods.forEach((method) => {
      it(`renders method ${method} with its defined badge color classes`, () => {
        render(<MethodBadge method={method} data-testid={`badge-${method}`} />);
        const badge = screen.getByTestId(`badge-${method}`);

        expect(badge).toHaveTextContent(method);
        expect(badge.className).toContain(HTTP_METHOD_BADGES[method]);
      });
    });
  });

  describe('Case Normalization and Trimming', () => {
    it('normalizes lowercase method to uppercase and applies matching colors', () => {
      render(<MethodBadge method="post" data-testid="badge-post" />);
      const badge = screen.getByTestId('badge-post');

      expect(badge).toHaveTextContent('POST');
      expect(badge.className).toContain(HTTP_METHOD_BADGES.POST);
    });

    it('normalizes mixed case and trims whitespace', () => {
      render(<MethodBadge method="  DeLeTe  " data-testid="badge-delete" />);
      const badge = screen.getByTestId('badge-delete');

      expect(badge).toHaveTextContent('DELETE');
      expect(badge.className).toContain(HTTP_METHOD_BADGES.DELETE);
    });
  });

  describe('Fallback for Unspecified Methods', () => {
    it('defaults to GET when method is null', () => {
      render(<MethodBadge method={null} data-testid="badge-null" />);
      const badge = screen.getByTestId('badge-null');

      expect(badge).toHaveTextContent('GET');
      expect(badge.className).toContain(HTTP_METHOD_BADGES.GET);
    });

    it('defaults to GET when method is undefined or omitted', () => {
      render(<MethodBadge data-testid="badge-undefined" />);
      const badge = screen.getByTestId('badge-undefined');

      expect(badge).toHaveTextContent('GET');
      expect(badge.className).toContain(HTTP_METHOD_BADGES.GET);
    });

    it('defaults to GET when method is an empty string or whitespace', () => {
      render(<MethodBadge method="   " data-testid="badge-empty" />);
      const badge = screen.getByTestId('badge-empty');

      expect(badge).toHaveTextContent('GET');
      expect(badge.className).toContain(HTTP_METHOD_BADGES.GET);
    });
  });

  describe('Unknown / Custom Method Fallback', () => {
    it('renders custom method in uppercase with neutral fallback styling', () => {
      render(<MethodBadge method="CUSTOM" data-testid="badge-custom" />);
      const badge = screen.getByTestId('badge-custom');

      expect(badge).toHaveTextContent('CUSTOM');
      expect(badge.className).toContain('text-neutral-400 bg-neutral-900 border-neutral-700');
    });

    it('normalizes lowercase custom method and applies neutral fallback', () => {
      render(<MethodBadge method="graphql" data-testid="badge-graphql" />);
      const badge = screen.getByTestId('badge-graphql');

      expect(badge).toHaveTextContent('GRAPHQL');
      expect(badge.className).toContain('text-neutral-400 bg-neutral-900 border-neutral-700');
    });
  });

  describe('Fixed Width and Layout Styling', () => {
    it('applies fixed width w-[52px], shrink-0 and pill styling classes by default', () => {
      render(<MethodBadge method="GET" data-testid="badge-layout" />);
      const badge = screen.getByTestId('badge-layout');

      expect(badge).toHaveClass('w-[52px]');
      expect(badge).toHaveClass('shrink-0');
      expect(badge).toHaveClass('h-5');
      expect(badge).toHaveClass('text-[10px]');
      expect(badge).toHaveClass('font-mono');
      expect(badge).toHaveClass('font-semibold');
      expect(badge).toHaveClass('rounded');
      expect(badge).toHaveClass('border');
      expect(badge).toHaveClass('uppercase');
      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('justify-center');
      expect(badge).toHaveClass('select-none');
    });

    it('maintains fixed width w-[52px] for 3-letter (GET) and 7-letter (OPTIONS) methods', () => {
      render(
        <div>
          <MethodBadge method="GET" data-testid="badge-get" />
          <MethodBadge method="OPTIONS" data-testid="badge-options" />
        </div>
      );
      const getBadge = screen.getByTestId('badge-get');
      const optionsBadge = screen.getByTestId('badge-options');

      expect(getBadge).toHaveClass('w-[52px]');
      expect(optionsBadge).toHaveClass('w-[52px]');
    });

    it('supports size="md" variant with larger dimensions', () => {
      render(<MethodBadge method="POST" size="md" data-testid="badge-md" />);
      const badge = screen.getByTestId('badge-md');

      expect(badge).toHaveClass('w-16');
      expect(badge).toHaveClass('h-6');
      expect(badge).toHaveClass('text-xs');
    });

    it('supports size="sm" variant explicitly matching default dimensions', () => {
      render(<MethodBadge method="POST" size="sm" data-testid="badge-sm" />);
      const badge = screen.getByTestId('badge-sm');

      expect(badge).toHaveClass('w-[52px]');
      expect(badge).toHaveClass('h-5');
      expect(badge).toHaveClass('text-[10px]');
    });
  });

  describe('HTML Attributes and Prop Forwarding', () => {
    it('combines custom className with badge classes', () => {
      render(<MethodBadge method="POST" className="shadow-sm my-custom-class" data-testid="badge-custom-class" />);
      const badge = screen.getByTestId('badge-custom-class');

      expect(badge).toHaveClass('my-custom-class');
      expect(badge).toHaveClass('shadow-sm');
      expect(badge).toHaveClass('w-[52px]');
      expect(badge.className).toContain(HTTP_METHOD_BADGES.POST);
    });

    it('forwards standard HTML attributes and click handlers', () => {
      const handleClick = vi.fn();
      render(
        <MethodBadge
          method="PUT"
          id="custom-put-id"
          title="HTTP PUT Method"
          role="status"
          onClick={handleClick}
          data-testid="badge-props"
        />
      );
      const badge = screen.getByTestId('badge-props');

      expect(badge).toHaveAttribute('id', 'custom-put-id');
      expect(badge).toHaveAttribute('title', 'HTTP PUT Method');
      expect(badge).toHaveAttribute('role', 'status');

      fireEvent.click(badge);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
