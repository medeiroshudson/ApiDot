import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  SpecificationTab,
  parseSchemaDefinition,
  extractSchemaProperties,
  generateSampleFromProperties,
  treeToSchemaProperties,
  schemaPropertiesToTree,
  PropertyNode,
} from './SpecificationTab';

describe('SpecificationTab', () => {
  it('renders property tree, adds new property, and triggers example generation', () => {
    const onGenerate = vi.fn();
    const initialSchema = JSON.stringify({
      summary: 'Get Item',
      body: {
        type: 'object',
        properties: { name: { type: 'string', example: 'Widget' } },
        required: ['name'],
      },
      responses: [{ statusCode: '200', description: 'Success' }],
    });

    render(
      <SpecificationTab
        schemaDefinition={initialSchema}
        onChange={vi.fn()}
        onGenerateBodyExample={onGenerate}
      />
    );

    expect(screen.getByText('Get Item')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();

    const generateBtn = screen.getByRole('button', { name: /Generate Example in Body/i });
    fireEvent.click(generateBtn);
    expect(onGenerate).toHaveBeenCalledWith(expect.stringContaining('Widget'));
  });

  it('allows adding a new root property and updating its fields', () => {
    const onChange = vi.fn();
    render(<SpecificationTab schemaDefinition="" onChange={onChange} />);

    // Click "Add Property"
    const addBtn = screen.getByRole('button', { name: /Add Property/i });
    fireEvent.click(addBtn);

    // Enter property name
    const nameInput = screen.getByPlaceholderText('name');
    fireEvent.change(nameInput, { target: { value: 'price' } });

    // Change type to number
    const typeSelect = screen.getByLabelText(/Property type/i);
    fireEvent.change(typeSelect, { target: { value: 'number' } });

    // Set example
    const exampleInput = screen.getByPlaceholderText('Example...');
    fireEvent.change(exampleInput, { target: { value: '99.9' } });

    // Check required
    const requiredCheckbox = screen.getByRole('checkbox', { name: /Required/i });
    fireEvent.click(requiredCheckbox);

    expect(onChange).toHaveBeenCalled();
    const lastCallArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    const parsed = JSON.parse(lastCallArg);
    expect(parsed.body.properties.price).toBeDefined();
    expect(parsed.body.properties.price.type).toBe('number');
    expect(parsed.body.properties.price.example).toBe(99.9);
    expect(parsed.body.required).toContain('price');
  });

  it('supports nested object properties with child addition', () => {
    const onChange = vi.fn();
    const initialSchema = JSON.stringify({
      body: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {},
          },
        },
      },
    });

    render(<SpecificationTab schemaDefinition={initialSchema} onChange={onChange} />);

    expect(screen.getByText('user')).toBeInTheDocument();

    // Click "+ Sub-campo" on user object row
    const addChildBtn = screen.getByRole('button', { name: /Add sub-property to user/i });
    fireEvent.click(addChildBtn);

    // New input for child property should be in document
    const inputs = screen.getAllByPlaceholderText('name');
    expect(inputs.length).toBeGreaterThanOrEqual(2);

    const childInput = inputs[inputs.length - 1];
    fireEvent.change(childInput, { target: { value: 'email' } });

    expect(onChange).toHaveBeenCalled();
    const lastCallArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    const parsed = JSON.parse(lastCallArg);
    expect(parsed.body.properties.user.properties.email).toBeDefined();
  });

  it('allows removing a property row from the tree', () => {
    const onChange = vi.fn();
    const initialSchema = JSON.stringify({
      body: {
        type: 'object',
        properties: {
          toDelete: { type: 'string', example: 'temp' },
        },
      },
    });

    render(<SpecificationTab schemaDefinition={initialSchema} onChange={onChange} />);

    expect(screen.getByText('toDelete')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /Remove property toDelete/i });
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('toDelete')).toBeNull();
    const lastCallArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    const parsed = JSON.parse(lastCallArg);
    expect(parsed.body.properties.toDelete).toBeUndefined();
  });

  it('allows adding, editing, and deleting expected responses', () => {
    const onChange = vi.fn();
    render(<SpecificationTab schemaDefinition="" onChange={onChange} />);

    // Click "+ Add Response"
    const addRespBtn = screen.getByRole('button', { name: /Add Response/i });
    fireEvent.click(addRespBtn);

    expect(screen.getByText('200')).toBeInTheDocument();

    // Edit status code to 404
    const statusInput = screen.getByLabelText(/HTTP status code/i);
    fireEvent.change(statusInput, { target: { value: '404' } });

    // Edit description
    const descInput = screen.getByLabelText(/Response description/i);
    fireEvent.change(descInput, { target: { value: 'Not Found' } });

    // Edit example
    const exampleInput = screen.getByLabelText(/Response example/i);
    fireEvent.change(exampleInput, { target: { value: '{"error": "not found"}' } });

    expect(onChange).toHaveBeenCalled();
    let lastCallArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    let parsed = JSON.parse(lastCallArg);
    expect(parsed.responses).toHaveLength(1);
    expect(parsed.responses[0].statusCode).toBe('404');
    expect(parsed.responses[0].description).toBe('Not Found');

    // Delete response
    const deleteRespBtn = screen.getByRole('button', { name: /Remove response 404/i });
    fireEvent.click(deleteRespBtn);

    lastCallArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    parsed = JSON.parse(lastCallArg);
    expect(parsed.responses).toHaveLength(0);
  });

  it('handles legacy raw JSON Schema wrapping into body', () => {
    const legacyRawSchema = JSON.stringify({
      type: 'object',
      properties: {
        legacyField: { type: 'string', example: 'old_value' },
      },
      required: ['legacyField'],
    });

    render(<SpecificationTab schemaDefinition={legacyRawSchema} />);

    expect(screen.getByText('legacyField')).toBeInTheDocument();
  });

  it('allows editing summary and description', () => {
    const onChange = vi.fn();
    render(<SpecificationTab schemaDefinition="" onChange={onChange} />);

    const summaryInput = screen.getByLabelText(/Specification summary/i);
    fireEvent.change(summaryInput, { target: { value: 'Criar Pedido' } });

    const descInput = screen.getByLabelText(/Specification description/i);
    fireEvent.change(descInput, { target: { value: 'Cria um novo pedido no sistema' } });

    expect(onChange).toHaveBeenCalled();
    const lastCallArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    const parsed = JSON.parse(lastCallArg);
    expect(parsed.summary).toBe('Criar Pedido');
    expect(parsed.description).toBe('Cria um novo pedido no sistema');
  });

  it('generates sample JSON values across all data types', () => {
    const nodes: PropertyNode[] = [
      { id: '1', name: 'title', type: 'string', required: true, description: '', example: 'Hello' },
      { id: '2', name: 'count', type: 'integer', required: true, description: '', example: '10' },
      { id: '3', name: 'ratio', type: 'number', required: false, description: '', example: '3.14' },
      { id: '4', name: 'active', type: 'boolean', required: false, description: '', example: 'false' },
      { id: '5', name: 'tags', type: 'array', required: false, description: '', example: '["a", "b"]' },
      {
        id: '6',
        name: 'meta',
        type: 'object',
        required: false,
        description: '',
        example: '',
        children: [
          { id: '7', name: 'version', type: 'integer', required: true, description: '', example: '2' },
        ],
      },
    ];

    const sample = generateSampleFromProperties(nodes);
    expect(sample).toEqual({
      title: 'Hello',
      count: 10,
      ratio: 3.14,
      active: false,
      tags: ['a', 'b'],
      meta: {
        version: 2,
      },
    });
  });

  it('parseSchemaDefinition normalizes malformed or empty inputs gracefully', () => {
    const emptyDef = parseSchemaDefinition('');
    expect(emptyDef.summary).toBe('');
    expect(emptyDef.body?.type).toBe('object');
    expect(emptyDef.responses).toEqual([]);

    const invalidJson = parseSchemaDefinition('not-json{');
    expect(invalidJson.summary).toBe('');
    expect(invalidJson.body?.type).toBe('object');
  });

  it('extractSchemaProperties extracts flattened list of properties from structured or legacy schema', () => {
    const structuredSchema = JSON.stringify({
      body: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Pet category name' },
          tags: { type: 'array', description: 'Pet tags' },
          owner: {
            type: 'object',
            properties: {
              email: { type: 'string', description: 'Owner email' },
            },
          },
        },
      },
    });

    const props = extractSchemaProperties(structuredSchema);
    expect(props).toEqual([
      { key: 'category', type: 'string', description: 'Pet category name' },
      { key: 'tags', type: 'array', description: 'Pet tags' },
      { key: 'owner', type: 'object', description: undefined },
      { key: 'email', type: 'string', description: 'Owner email' },
    ]);

    expect(extractSchemaProperties('')).toEqual([]);
    expect(extractSchemaProperties('invalid-json')).toEqual([]);

    const legacySchema = JSON.stringify({
      type: 'object',
      properties: {
        id: { type: 'integer' },
      },
    });
    expect(extractSchemaProperties(legacySchema)).toEqual([
      { key: 'id', type: 'integer', description: undefined },
    ]);
  });
});
