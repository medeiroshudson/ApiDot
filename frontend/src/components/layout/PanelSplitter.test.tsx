import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PanelSplitter } from './PanelSplitter';

describe('PanelSplitter', () => {
  beforeEach(() => {
    if (typeof window.PointerEvent === 'undefined') {
      class FakePointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, params: PointerEventInit = {}) {
          super(type, params);
          this.pointerId = params.pointerId ?? 0;
        }
      }
      // @ts-expect-error polyfill for jsdom
      window.PointerEvent = FakePointerEvent;
      // @ts-expect-error polyfill for jsdom
      global.PointerEvent = FakePointerEvent;
    }

    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Accessibility & ARIA Attributes', () => {
    it('renders with role="separator" and aria-orientation="vertical"', () => {
      render(
        <PanelSplitter
          id="test-splitter"
          ariaLabel="Redimensionar painel"
          onDeltaChange={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator', { name: 'Redimensionar painel' });
      expect(splitter).toBeInTheDocument();
      expect(splitter).toHaveAttribute('aria-orientation', 'vertical');
      expect(splitter).toHaveAttribute('tabIndex', '0');
      expect(splitter).toHaveAttribute('id', 'test-splitter');
    });

    it('sets aria-valuenow, aria-valuemin and aria-valuemax when provided', () => {
      render(
        <PanelSplitter
          id="sidebar-splitter"
          ariaLabel="Redimensionar barra lateral"
          valueNow={256}
          valueMin={180}
          valueMax={480}
          onDeltaChange={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator', { name: 'Redimensionar barra lateral' });
      expect(splitter).toHaveAttribute('aria-valuenow', '256');
      expect(splitter).toHaveAttribute('aria-valuemin', '180');
      expect(splitter).toHaveAttribute('aria-valuemax', '480');
    });

    it('omits aria-value attributes when not provided', () => {
      render(
        <PanelSplitter
          id="plain-splitter"
          ariaLabel="Divisor de painéis"
          onDeltaChange={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator', { name: 'Divisor de painéis' });
      expect(splitter).not.toHaveAttribute('aria-valuenow');
      expect(splitter).not.toHaveAttribute('aria-valuemin');
      expect(splitter).not.toHaveAttribute('aria-valuemax');
    });

    it('applies custom className while preserving required base styles', () => {
      render(
        <PanelSplitter
          id="styled-splitter"
          ariaLabel="Divisor estilizado"
          className="custom-splitter-class"
          onDeltaChange={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator');
      expect(splitter).toHaveClass('custom-splitter-class');
      expect(splitter).toHaveClass('cursor-col-resize');
    });
  });

  describe('Pointer Events & Dragging', () => {
    it('captures pointer and triggers onDeltaChange on pointer move after pointerdown', () => {
      const onDeltaChange = vi.fn();
      render(
        <PanelSplitter
          id="drag-splitter"
          ariaLabel="Divisor arrastável"
          onDeltaChange={onDeltaChange}
        />
      );

      const splitter = screen.getByRole('separator');

      // pointerdown initiates drag
      fireEvent.pointerDown(splitter, {
        pointerId: 1,
        clientX: 100,
        button: 0,
      });

      expect(splitter.setPointerCapture).toHaveBeenCalledWith(1);
      expect(splitter).toHaveAttribute('data-dragging', 'true');

      // pointermove with delta of +25px
      fireEvent.pointerMove(splitter, {
        pointerId: 1,
        clientX: 125,
      });

      expect(onDeltaChange).toHaveBeenCalledWith(25);

      // subsequent pointermove with delta of -10px (125 -> 115)
      fireEvent.pointerMove(splitter, {
        pointerId: 1,
        clientX: 115,
      });

      expect(onDeltaChange).toHaveBeenCalledWith(-10);
      expect(onDeltaChange).toHaveBeenCalledTimes(2);

      // pointerup ends drag and releases capture
      fireEvent.pointerUp(splitter, {
        pointerId: 1,
        clientX: 115,
      });

      expect(splitter.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(splitter).toHaveAttribute('data-dragging', 'false');

      // further pointermove should not trigger onDeltaChange
      fireEvent.pointerMove(splitter, {
        pointerId: 1,
        clientX: 150,
      });

      expect(onDeltaChange).toHaveBeenCalledTimes(2);
    });

    it('does not trigger onDeltaChange if pointermove occurs without pointerdown', () => {
      const onDeltaChange = vi.fn();
      render(
        <PanelSplitter
          id="idle-splitter"
          ariaLabel="Divisor ocioso"
          onDeltaChange={onDeltaChange}
        />
      );

      const splitter = screen.getByRole('separator');

      fireEvent.pointerMove(splitter, {
        pointerId: 1,
        clientX: 200,
      });

      expect(onDeltaChange).not.toHaveBeenCalled();
      expect(splitter).toHaveAttribute('data-dragging', 'false');
    });

    it('ignores pointerdown if button is not 0 (e.g. secondary / right click)', () => {
      const onDeltaChange = vi.fn();
      render(
        <PanelSplitter
          id="right-click-splitter"
          ariaLabel="Divisor clique direito"
          onDeltaChange={onDeltaChange}
        />
      );

      const splitter = screen.getByRole('separator');

      fireEvent.pointerDown(splitter, {
        pointerId: 1,
        clientX: 100,
        button: 2,
      });

      expect(splitter.setPointerCapture).not.toHaveBeenCalled();
      expect(splitter).toHaveAttribute('data-dragging', 'false');

      fireEvent.pointerMove(splitter, {
        pointerId: 1,
        clientX: 150,
      });

      expect(onDeltaChange).not.toHaveBeenCalled();
    });

    it('releases pointer capture and resets dragging state on pointercancel', () => {
      const onDeltaChange = vi.fn();
      render(
        <PanelSplitter
          id="cancel-splitter"
          ariaLabel="Divisor cancelamento"
          onDeltaChange={onDeltaChange}
        />
      );

      const splitter = screen.getByRole('separator');

      fireEvent.pointerDown(splitter, {
        pointerId: 2,
        clientX: 50,
        button: 0,
      });

      expect(splitter).toHaveAttribute('data-dragging', 'true');

      fireEvent.pointerCancel(splitter, {
        pointerId: 2,
      });

      expect(splitter.releasePointerCapture).toHaveBeenCalledWith(2);
      expect(splitter).toHaveAttribute('data-dragging', 'false');

      // Subsequent moves should be ignored
      fireEvent.pointerMove(splitter, {
        pointerId: 2,
        clientX: 80,
      });

      expect(onDeltaChange).not.toHaveBeenCalled();
    });

    it('does not call onDeltaChange if delta is 0 during move', () => {
      const onDeltaChange = vi.fn();
      render(
        <PanelSplitter
          id="zero-delta-splitter"
          ariaLabel="Divisor delta zero"
          onDeltaChange={onDeltaChange}
        />
      );

      const splitter = screen.getByRole('separator');

      fireEvent.pointerDown(splitter, {
        pointerId: 1,
        clientX: 100,
        button: 0,
      });

      fireEvent.pointerMove(splitter, {
        pointerId: 1,
        clientX: 100,
      });

      expect(onDeltaChange).not.toHaveBeenCalled();
    });
  });

  describe('Double Click Reset', () => {
    it('calls onReset when double clicked', () => {
      const onReset = vi.fn();
      render(
        <PanelSplitter
          id="reset-splitter"
          ariaLabel="Divisor com reset"
          onDeltaChange={vi.fn()}
          onReset={onReset}
        />
      );

      const splitter = screen.getByRole('separator');
      fireEvent.doubleClick(splitter);

      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('does not fail when onReset is not provided on double click', () => {
      render(
        <PanelSplitter
          id="no-reset-splitter"
          ariaLabel="Divisor sem reset"
          onDeltaChange={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator');
      expect(() => {
        fireEvent.doubleClick(splitter);
      }).not.toThrow();
    });
  });

  describe('Keyboard Navigation', () => {
    it('calls onDeltaChange(-10) on ArrowLeft key and prevents default', () => {
      const onDeltaChange = vi.fn();
      render(
        <PanelSplitter
          id="keyboard-splitter"
          ariaLabel="Divisor de teclado"
          onDeltaChange={onDeltaChange}
        />
      );

      const splitter = screen.getByRole('separator');
      const event = fireEvent.keyDown(splitter, { key: 'ArrowLeft' });

      expect(onDeltaChange).toHaveBeenCalledWith(-10);
      expect(event).toBe(false); // preventDefault was called
    });

    it('calls onDeltaChange(10) on ArrowRight key and prevents default', () => {
      const onDeltaChange = vi.fn();
      render(
        <PanelSplitter
          id="keyboard-splitter"
          ariaLabel="Divisor de teclado"
          onDeltaChange={onDeltaChange}
        />
      );

      const splitter = screen.getByRole('separator');
      const event = fireEvent.keyDown(splitter, { key: 'ArrowRight' });

      expect(onDeltaChange).toHaveBeenCalledWith(10);
      expect(event).toBe(false); // preventDefault was called
    });

    it('calls onReset on Enter key when onReset is provided and prevents default', () => {
      const onReset = vi.fn();
      render(
        <PanelSplitter
          id="keyboard-splitter"
          ariaLabel="Divisor de teclado"
          onDeltaChange={vi.fn()}
          onReset={onReset}
        />
      );

      const splitter = screen.getByRole('separator');
      const event = fireEvent.keyDown(splitter, { key: 'Enter' });

      expect(onReset).toHaveBeenCalledTimes(1);
      expect(event).toBe(false); // preventDefault was called
    });

    it('ignores unrelated keys (e.g. Tab, Escape, ArrowUp, ArrowDown)', () => {
      const onDeltaChange = vi.fn();
      const onReset = vi.fn();
      render(
        <PanelSplitter
          id="keyboard-splitter"
          ariaLabel="Divisor de teclado"
          onDeltaChange={onDeltaChange}
          onReset={onReset}
        />
      );

      const splitter = screen.getByRole('separator');

      fireEvent.keyDown(splitter, { key: 'Tab' });
      fireEvent.keyDown(splitter, { key: 'Escape' });
      fireEvent.keyDown(splitter, { key: 'ArrowUp' });
      fireEvent.keyDown(splitter, { key: 'ArrowDown' });

      expect(onDeltaChange).not.toHaveBeenCalled();
      expect(onReset).not.toHaveBeenCalled();
    });
  });
});
