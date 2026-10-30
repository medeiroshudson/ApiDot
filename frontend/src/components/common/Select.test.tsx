import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Select } from './Select';

describe('Select Component', () => {
  describe('Rendering and Options', () => {
    it('renders a <select> element with role="combobox" and child options', () => {
      render(
        <Select aria-label="Escolher Fruta">
          <option value="maca">Maçã</option>
          <option value="banana">Banana</option>
          <option value="laranja">Laranja</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Escolher Fruta' });
      expect(select).toBeInTheDocument();
      expect(select.tagName).toBe('SELECT');

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(3);
      expect(screen.getByRole('option', { name: 'Maçã' })).toHaveValue('maca');
      expect(screen.getByRole('option', { name: 'Banana' })).toHaveValue('banana');
      expect(screen.getByRole('option', { name: 'Laranja' })).toHaveValue('laranja');
    });

    it('applies appearance-none and base styling classes to the <select>', () => {
      render(
        <Select aria-label="Teste de estilo">
          <option value="1">Opção 1</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Teste de estilo' });
      expect(select).toHaveClass('appearance-none');
      expect(select).toHaveClass('bg-neutral-900');
      expect(select).toHaveClass('border');
      expect(select).toHaveClass('border-neutral-800');
      expect(select).toHaveClass('text-neutral-200');
      expect(select).toHaveClass('rounded-md');
      expect(select).toHaveClass('cursor-pointer');
    });
  });

  describe('Value Selection and Change Events', () => {
    it('preserves selected value and fires onChange event when selection changes', () => {
      const handleChange = vi.fn();
      render(
        <Select aria-label="Ambiente" defaultValue="staging" onChange={handleChange}>
          <option value="dev">Desenvolvimento</option>
          <option value="staging">Homologação</option>
          <option value="prod">Produção</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Ambiente' }) as HTMLSelectElement;
      expect(select.value).toBe('staging');

      fireEvent.change(select, { target: { value: 'prod' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(select.value).toBe('prod');
    });

    it('works as a controlled component when value prop is passed', () => {
      const { rerender } = render(
        <Select aria-label="Controle" value="v1" onChange={() => {}}>
          <option value="v1">Versão 1</option>
          <option value="v2">Versão 2</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Controle' }) as HTMLSelectElement;
      expect(select.value).toBe('v1');

      rerender(
        <Select aria-label="Controle" value="v2" onChange={() => {}}>
          <option value="v1">Versão 1</option>
          <option value="v2">Versão 2</option>
        </Select>
      );
      expect(select.value).toBe('v2');
    });
  });

  describe('Ref Forwarding', () => {
    it('correctly forwards ref to the underlying HTMLSelectElement via forwardRef', () => {
      const selectRef = createRef<HTMLSelectElement>();
      render(
        <Select ref={selectRef} aria-label="Ref Test">
          <option value="a">A</option>
        </Select>
      );

      expect(selectRef.current).toBeInstanceOf(HTMLSelectElement);
      expect(selectRef.current?.tagName).toBe('SELECT');
      expect(selectRef.current?.getAttribute('aria-label')).toBe('Ref Test');
    });
  });

  describe('Lucide ChevronDown Icon', () => {
    it('renders <ChevronDown> icon with aria-hidden="true" and pointer-events-none', () => {
      const { container } = render(
        <Select aria-label="Chevron Test">
          <option value="1">1</option>
        </Select>
      );

      const icon = screen.getByTestId('select-chevron');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveClass('pointer-events-none');
      expect(icon).toHaveClass('absolute');
      expect(icon).toHaveClass('right-2.5');
      expect(icon).toHaveClass('top-1/2');
      expect(icon).toHaveClass('-translate-y-1/2');
      expect(icon).toHaveClass('w-3.5');
      expect(icon).toHaveClass('h-3.5');

      const svgIcon = container.querySelector('svg');
      expect(svgIcon).toBe(icon);
    });
  });

  describe('Size Variants', () => {
    it('applies sizeVariant="sm" by default with h-[30px], py-1.5, text-xs, pl-2.5, pr-8', () => {
      render(
        <Select aria-label="Default Size">
          <option value="1">1</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Default Size' });
      expect(select).toHaveClass('h-[30px]');
      expect(select).toHaveClass('py-1.5');
      expect(select).toHaveClass('text-xs');
      expect(select).toHaveClass('pl-2.5');
      expect(select).toHaveClass('pr-8');
      expect(select).not.toHaveClass('h-9');
    });

    it('applies sizeVariant="sm" when explicitly specified', () => {
      render(
        <Select sizeVariant="sm" aria-label="Small Size">
          <option value="1">1</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Small Size' });
      expect(select).toHaveClass('h-[30px]');
      expect(select).toHaveClass('py-1.5');
      expect(select).toHaveClass('text-xs');
      expect(select).toHaveClass('pl-2.5');
      expect(select).toHaveClass('pr-8');
      expect(select).not.toHaveClass('h-9');
    });

    it('applies sizeVariant="md" with h-9, text-xs, pl-2.5, pr-8', () => {
      render(
        <Select sizeVariant="md" aria-label="Medium Size">
          <option value="1">1</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Medium Size' });
      expect(select).toHaveClass('h-9');
      expect(select).toHaveClass('text-xs');
      expect(select).toHaveClass('pl-2.5');
      expect(select).toHaveClass('pr-8');
      expect(select).not.toHaveClass('h-[30px]');
    });
  });

  describe('Disabled State', () => {
    it('disables the <select> and applies opacity-50 to the chevron icon', () => {
      render(
        <Select disabled aria-label="Disabled Select">
          <option value="1">1</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Disabled Select' });
      expect(select).toBeDisabled();

      const chevron = screen.getByTestId('select-chevron');
      expect(chevron).toHaveClass('opacity-50');
    });

    it('enables the <select> and does not apply opacity-50 to the chevron when not disabled', () => {
      render(
        <Select aria-label="Active Select">
          <option value="1">1</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Active Select' });
      expect(select).toBeEnabled();

      const chevron = screen.getByTestId('select-chevron');
      expect(chevron).not.toHaveClass('opacity-50');
    });
  });

  describe('Class Names and Custom Styling', () => {
    it('applies custom className to the <select> element while retaining base classes', () => {
      render(
        <Select className="custom-select-class font-bold w-full" aria-label="Custom Style">
          <option value="1">1</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Custom Style' });
      expect(select).toHaveClass('custom-select-class');
      expect(select).toHaveClass('font-bold');
      expect(select).toHaveClass('w-full');
      expect(select).toHaveClass('appearance-none');
    });

    it('applies custom wrapperClassName to the outer container element', () => {
      const { container } = render(
        <Select wrapperClassName="custom-wrapper-class shrink-0" aria-label="Custom Wrapper">
          <option value="1">1</option>
        </Select>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-wrapper-class');
      expect(wrapper).toHaveClass('shrink-0');
      expect(wrapper).toHaveClass('relative');
      expect(wrapper).toHaveClass('inline-flex');
      expect(wrapper).toHaveClass('items-center');
    });

    it('applies custom iconClassName to the ChevronDown icon', () => {
      render(
        <Select iconClassName="custom-icon-class text-emerald-400" aria-label="Custom Icon">
          <option value="1">1</option>
        </Select>
      );

      const chevron = screen.getByTestId('select-chevron');
      expect(chevron).toHaveClass('custom-icon-class');
      expect(chevron).toHaveClass('text-emerald-400');
      expect(chevron).toHaveClass('pointer-events-none');
    });
  });

  describe('Standard HTML Attributes Forwarding', () => {
    it('forwards standard HTML select attributes like id, name, required, autoFocus', () => {
      render(
        <Select
          id="custom-select-id"
          name="customSelectName"
          required
          autoFocus
          aria-label="Attributes Test"
        >
          <option value="val">Val</option>
        </Select>
      );

      const select = screen.getByRole('combobox', { name: 'Attributes Test' });
      expect(select).toHaveAttribute('id', 'custom-select-id');
      expect(select).toHaveAttribute('name', 'customSelectName');
      expect(select).toBeRequired();
      expect(select).toHaveFocus();
    });
  });
});
