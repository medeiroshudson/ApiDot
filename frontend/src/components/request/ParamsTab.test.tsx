import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  ParamsTab,
  extractPathParamsFromUrl,
  parseQueryString,
  buildUrlWithQueryParams,
} from './ParamsTab';

describe('ParamsTab', () => {
  // Step 1 test verbatim from specification
  it('extracts :param segments as path parameters and syncs query table to URL', () => {
    const onUrlChange = vi.fn();
    render(
      <ParamsTab
        url="https://api.com/pets/:petId?limit=10"
        onUrlChange={onUrlChange}
      />
    );

    expect(screen.getByText('petId')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();

    const addQueryKey = screen.getByPlaceholderText(/Novo parâmetro/i);
    fireEvent.change(addQueryKey, { target: { value: 'page' } });
    fireEvent.blur(addQueryKey);

    expect(onUrlChange).toHaveBeenCalled();
  });

  it('extracts multiple :param segments and allows editing path parameter values', () => {
    const onPathParamsChange = vi.fn();
    render(
      <ParamsTab
        url="https://api.com/stores/:storeId/pets/:petId"
        onUrlChange={vi.fn()}
        onPathParamsChange={onPathParamsChange}
      />
    );

    expect(screen.getByText('storeId')).toBeInTheDocument();
    expect(screen.getByText('petId')).toBeInTheDocument();

    const storeInput = screen.getByPlaceholderText('Valor para :storeId');
    fireEvent.change(storeInput, { target: { value: 'store_99' } });

    expect(onPathParamsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store_99',
      })
    );
  });

  it('supports controlled pathParams prop', () => {
    render(
      <ParamsTab
        url="https://api.com/users/:userId"
        pathParams={{ userId: 'usr_abc' }}
        onUrlChange={vi.fn()}
      />
    );

    expect(screen.getByText('userId')).toBeInTheDocument();
    expect(screen.getByDisplayValue('usr_abc')).toBeInTheDocument();
  });

  it('displays empty state message when no path parameters are present in URL', () => {
    render(
      <ParamsTab
        url="https://api.com/pets"
        onUrlChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Nenhum parâmetro de rota detectado/i)
    ).toBeInTheDocument();
  });

  it('parses existing query parameters into table rows with enabled checkboxes', () => {
    render(
      <ParamsTab
        url="https://api.com/pets?status=available&limit=20"
        onUrlChange={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('status')).toBeInTheDocument();
    expect(screen.getByDisplayValue('available')).toBeInTheDocument();
    expect(screen.getByDisplayValue('limit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox', { name: /Ativar parâmetro/i });
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('updates URL query string when editing query parameter value', () => {
    const onUrlChange = vi.fn();
    render(
      <ParamsTab
        url="https://api.com/pets?limit=10"
        onUrlChange={onUrlChange}
      />
    );

    const valueInput = screen.getByDisplayValue('10');
    fireEvent.change(valueInput, { target: { value: '25' } });

    expect(onUrlChange).toHaveBeenCalledWith('https://api.com/pets?limit=25');
  });

  it('updates URL query string when editing query parameter key', () => {
    const onUrlChange = vi.fn();
    render(
      <ParamsTab
        url="https://api.com/pets?limit=10"
        onUrlChange={onUrlChange}
      />
    );

    const keyInput = screen.getByDisplayValue('limit');
    fireEvent.change(keyInput, { target: { value: 'count' } });

    expect(onUrlChange).toHaveBeenCalledWith('https://api.com/pets?count=10');
  });

  it('removes query parameter from URL when checkbox is disabled (unchecked)', () => {
    const onUrlChange = vi.fn();
    render(
      <ParamsTab
        url="https://api.com/pets?limit=10"
        onUrlChange={onUrlChange}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /Ativar parâmetro/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    expect(onUrlChange).toHaveBeenCalledWith('https://api.com/pets');
  });

  it('restores query parameter to URL when checkbox is re-enabled', () => {
    const onUrlChange = vi.fn();
    const { rerender } = render(
      <ParamsTab
        url="https://api.com/pets?limit=10"
        onUrlChange={onUrlChange}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /Ativar parâmetro/i });
    fireEvent.click(checkbox);
    expect(onUrlChange).toHaveBeenCalledWith('https://api.com/pets');

    // Simulate parent feeding back the url without query
    rerender(
      <ParamsTab
        url="https://api.com/pets"
        onUrlChange={onUrlChange}
      />
    );

    // Re-enable
    fireEvent.click(checkbox);
    expect(onUrlChange).toHaveBeenCalledWith('https://api.com/pets?limit=10');
  });

  it('deletes query parameter row when clicking delete button', () => {
    const onUrlChange = vi.fn();
    render(
      <ParamsTab
        url="https://api.com/pets?limit=10&page=1"
        onUrlChange={onUrlChange}
      />
    );

    const deleteButtons = screen.getAllByRole('button', { name: /Remover parâmetro/i });
    expect(deleteButtons).toHaveLength(2);

    fireEvent.click(deleteButtons[0]);

    expect(onUrlChange).toHaveBeenCalledWith('https://api.com/pets?page=1');
  });

  it('synchronizes table when URL prop changes externally without infinite loop', () => {
    const onUrlChange = vi.fn();
    const { rerender } = render(
      <ParamsTab
        url="https://api.com/pets?limit=10"
        onUrlChange={onUrlChange}
      />
    );

    expect(screen.getByDisplayValue('limit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();

    // External URL update
    rerender(
      <ParamsTab
        url="https://api.com/pets?search=fido&page=3"
        onUrlChange={onUrlChange}
      />
    );

    expect(screen.getByDisplayValue('search')).toBeInTheDocument();
    expect(screen.getByDisplayValue('fido')).toBeInTheDocument();
    expect(screen.getByDisplayValue('page')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument();

    // Verify external URL update did not invoke onUrlChange in an infinite loop
    expect(onUrlChange).not.toHaveBeenCalled();
  });

  it('preserves variable syntax {{variable}} and decodes URI characters', () => {
    render(
      <ParamsTab
        url="https://api.com/pets?token={{authToken}}&name=Rex%20The%20Dog"
        onUrlChange={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('{{authToken}}')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Rex The Dog')).toBeInTheDocument();
  });

  it('adds a new query parameter via the Adicionar Parâmetro button', () => {
    const onUrlChange = vi.fn();
    render(
      <ParamsTab
        url="https://api.com/pets"
        onUrlChange={onUrlChange}
      />
    );

    const addQueryKey = screen.getByPlaceholderText(/Novo parâmetro/i);
    fireEvent.change(addQueryKey, { target: { value: 'tag' } });

    const addBtn = screen.getByRole('button', { name: /Adicionar Parâmetro/i });
    fireEvent.click(addBtn);

    expect(onUrlChange).toHaveBeenCalledWith('https://api.com/pets?tag=');
  });

  it('extractPathParamsFromUrl helper isolates path params correctly ignoring ports', () => {
    expect(extractPathParamsFromUrl('http://localhost:5000/api/v1/users/:userId')).toEqual(['userId']);
    expect(extractPathParamsFromUrl('https://api.com/v1/:storeId/items/:itemId/details')).toEqual([
      'storeId',
      'itemId',
    ]);
    expect(extractPathParamsFromUrl('/pets/:id')).toEqual(['id']);
    expect(extractPathParamsFromUrl('https://api.com/plain/path')).toEqual([]);
    expect(extractPathParamsFromUrl('')).toEqual([]);
  });

  it('parseQueryString and buildUrlWithQueryParams helpers handle encoding correctly', () => {
    const rows = parseQueryString('a=1&b=hello%20world&token={{my_var}}');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ key: 'a', value: '1', enabled: true });
    expect(rows[1]).toMatchObject({ key: 'b', value: 'hello world', enabled: true });
    expect(rows[2]).toMatchObject({ key: 'token', value: '{{my_var}}', enabled: true });

    const newUrl = buildUrlWithQueryParams('https://api.com/items', rows);
    expect(newUrl).toBe('https://api.com/items?a=1&b=hello%20world&token={{my_var}}');
  });
});
