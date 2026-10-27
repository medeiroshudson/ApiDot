'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Sparkles,
  Layers,
  FileText,
  HelpCircle,
} from 'lucide-react';

export type SchemaPropertyType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array';

export interface PropertyNode {
  id: string;
  name: string;
  type: SchemaPropertyType;
  required: boolean;
  description: string;
  example: string;
  children?: PropertyNode[];
}

export interface ResponseNode {
  id: string;
  statusCode: string;
  description: string;
  example: string;
}

export interface StructuredSchema {
  summary?: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: string;
    type?: string;
    required?: boolean;
    description?: string;
    defaultOrExample?: string;
  }>;
  body?: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
  responses?: Array<{
    statusCode: string;
    description?: string;
    example?: string;
    schema?: any;
  }>;
}

export interface SpecificationTabProps {
  schemaDefinition?: string;
  onChange?: (schemaJson: string) => void;
  onUpdateSchema?: (schemaJson: string) => void;
  onGenerateBodyExample?: (sampleJson: string) => void;
  disabled?: boolean;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function isValidType(t: any): t is SchemaPropertyType {
  return ['string', 'integer', 'number', 'boolean', 'object', 'array'].includes(t);
}

/**
 * Normalizes and parses incoming schemaDefinition string or object.
 * Wraps legacy raw JSON Schema into { body: ... }.
 */
export function parseSchemaDefinition(raw?: string | object): StructuredSchema {
  if (!raw) {
    return {
      summary: '',
      description: '',
      parameters: [],
      body: { type: 'object', properties: {}, required: [] },
      responses: [],
    };
  }

  let parsed: any;
  if (typeof raw === 'object') {
    parsed = raw;
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        summary: '',
        description: '',
        parameters: [],
        body: { type: 'object', properties: {}, required: [] },
        responses: [],
      };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      summary: '',
      description: '',
      parameters: [],
      body: { type: 'object', properties: {}, required: [] },
      responses: [],
    };
  }

  // Check if it's already a structured schema definition
  if ('body' in parsed || 'responses' in parsed || 'parameters' in parsed) {
    return {
      summary: parsed.summary || '',
      description: parsed.description || '',
      parameters: Array.isArray(parsed.parameters) ? parsed.parameters : [],
      body:
        parsed.body && typeof parsed.body === 'object'
          ? parsed.body
          : { type: 'object', properties: {}, required: [] },
      responses: Array.isArray(parsed.responses) ? parsed.responses : [],
    };
  }

  // Legacy schema: wrap as body
  return {
    summary: parsed.title || parsed.summary || '',
    description: parsed.description || '',
    parameters: [],
    body: parsed,
    responses: [],
  };
}

/**
 * Converts a JSON Schema properties map into an editable PropertyNode tree.
 */
export function schemaPropertiesToTree(
  properties?: Record<string, any>,
  requiredList: string[] = []
): PropertyNode[] {
  if (!properties || typeof properties !== 'object') return [];
  const nodes: PropertyNode[] = [];

  for (const [key, val] of Object.entries(properties)) {
    if (!val || typeof val !== 'object') continue;
    const type: SchemaPropertyType = isValidType(val.type) ? val.type : 'string';
    const children =
      type === 'object' && val.properties
        ? schemaPropertiesToTree(
            val.properties,
            Array.isArray(val.required) ? val.required : []
          )
        : [];

    let exampleStr = '';
    if (val.example !== undefined && val.example !== null) {
      exampleStr =
        typeof val.example === 'object'
          ? JSON.stringify(val.example)
          : String(val.example);
    } else if (val.default !== undefined && val.default !== null) {
      exampleStr =
        typeof val.default === 'object'
          ? JSON.stringify(val.default)
          : String(val.default);
    }

    nodes.push({
      id: generateId(),
      name: key,
      type,
      required: Array.isArray(requiredList) && requiredList.includes(key),
      description: val.description || '',
      example: exampleStr,
      children,
    });
  }

  return nodes;
}

/**
 * Serializes an editable PropertyNode tree back into JSON Schema properties and required list.
 */
export function treeToSchemaProperties(nodes: PropertyNode[]): {
  properties: Record<string, any>;
  required: string[];
} {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const node of nodes) {
    const trimmedName = node.name.trim();
    if (!trimmedName) continue;

    const propDef: Record<string, any> = {
      type: node.type,
    };

    if (node.description?.trim()) {
      propDef.description = node.description.trim();
    }

    if (node.example !== undefined && node.example !== '') {
      if (node.type === 'integer') {
        const num = parseInt(node.example, 10);
        propDef.example = isNaN(num) ? node.example : num;
      } else if (node.type === 'number') {
        const num = parseFloat(node.example);
        propDef.example = isNaN(num) ? node.example : num;
      } else if (node.type === 'boolean') {
        propDef.example = node.example === 'true' || node.example === true;
      } else {
        propDef.example = node.example;
      }
    }

    if (node.type === 'object') {
      if (node.children && node.children.length > 0) {
        const childSchema = treeToSchemaProperties(node.children);
        propDef.properties = childSchema.properties;
        if (childSchema.required.length > 0) {
          propDef.required = childSchema.required;
        }
      } else {
        propDef.properties = {};
      }
    }

    if (node.type === 'array') {
      propDef.items = { type: 'string' };
    }

    properties[trimmedName] = propDef;
    if (node.required) {
      required.push(trimmedName);
    }
  }

  return { properties, required };
}

/**
 * Generates sample JSON object matching schema properties and examples.
 */
export function generateSampleFromProperties(nodes: PropertyNode[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const node of nodes) {
    const trimmed = node.name.trim();
    if (!trimmed) continue;
    result[trimmed] = generateSampleValue(node);
  }
  return result;
}

export function generateSampleValue(node: PropertyNode): any {
  const { type, example, children } = node;

  if (type === 'object') {
    if (children && children.length > 0) {
      return generateSampleFromProperties(children);
    }
    if (example) {
      try {
        return JSON.parse(example);
      } catch {
        return {};
      }
    }
    return {};
  }

  if (type === 'array') {
    if (example) {
      try {
        const parsed = JSON.parse(example);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      } catch {
        return [example];
      }
    }
    return [];
  }

  if (type === 'integer') {
    if (example !== undefined && example !== '') {
      const parsed = parseInt(String(example), 10);
      return isNaN(parsed) ? 1 : parsed;
    }
    return 1;
  }

  if (type === 'number') {
    if (example !== undefined && example !== '') {
      const parsed = parseFloat(String(example));
      return isNaN(parsed) ? 1.0 : parsed;
    }
    return 1.0;
  }

  if (type === 'boolean') {
    if (example !== undefined && example !== '') {
      if (typeof example === 'boolean') return example;
      return String(example).toLowerCase() === 'true';
    }
    return true;
  }

  // Default string
  if (example !== undefined && example !== '') {
    return String(example);
  }
  return node.name || 'string';
}

export function getStatusBadgeClasses(statusCode: string): string {
  const code = parseInt(statusCode, 10);
  if (code >= 200 && code < 300) {
    return 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60';
  }
  if (code >= 300 && code < 400) {
    return 'bg-blue-950/60 text-blue-400 border-blue-800/60';
  }
  if (code >= 400 && code < 500) {
    return 'bg-amber-950/60 text-amber-400 border-amber-800/60';
  }
  if (code >= 500) {
    return 'bg-rose-950/60 text-rose-400 border-rose-800/60';
  }
  return 'bg-neutral-800 text-neutral-400 border-neutral-700';
}

interface FlatPropertyNode extends PropertyNode {
  depth: number;
}

function flattenTree(nodes: PropertyNode[], depth = 0): FlatPropertyNode[] {
  const list: FlatPropertyNode[] = [];
  for (const node of nodes) {
    list.push({ ...node, depth });
    if (node.type === 'object' && node.children && node.children.length > 0) {
      list.push(...flattenTree(node.children, depth + 1));
    }
  }
  return list;
}

function updateNodeInTree(
  nodes: PropertyNode[],
  targetId: string,
  updater: (node: PropertyNode) => PropertyNode
): PropertyNode[] {
  return nodes.map((n) => {
    if (n.id === targetId) {
      return updater(n);
    }
    if (n.children && n.children.length > 0) {
      return {
        ...n,
        children: updateNodeInTree(n.children, targetId, updater),
      };
    }
    return n;
  });
}

function addChildToNodeInTree(
  nodes: PropertyNode[],
  parentId: string,
  child: PropertyNode
): PropertyNode[] {
  return nodes.map((n) => {
    if (n.id === parentId) {
      return {
        ...n,
        type: 'object',
        children: [...(n.children || []), child],
      };
    }
    if (n.children && n.children.length > 0) {
      return {
        ...n,
        children: addChildToNodeInTree(n.children, parentId, child),
      };
    }
    return n;
  });
}

function removeNodeFromTree(nodes: PropertyNode[], targetId: string): PropertyNode[] {
  return nodes
    .filter((n) => n.id !== targetId)
    .map((n) => {
      if (n.children && n.children.length > 0) {
        return {
          ...n,
          children: removeNodeFromTree(n.children, targetId),
        };
      }
      return n;
    });
}

export function SpecificationTab({
  schemaDefinition,
  onChange,
  onUpdateSchema,
  onGenerateBodyExample,
  disabled = false,
}: SpecificationTabProps) {
  const isSelfUpdatingRef = useRef(false);

  const initialParsed = useMemo(() => {
    return parseSchemaDefinition(schemaDefinition);
  }, [schemaDefinition]);

  const [summary, setSummary] = useState<string>(initialParsed.summary || '');
  const [description, setDescription] = useState<string>(initialParsed.description || '');
  const [parameters, setParameters] = useState<any[]>(initialParsed.parameters || []);
  const [propertyTree, setPropertyTree] = useState<PropertyNode[]>(() => {
    return schemaPropertiesToTree(
      initialParsed.body?.properties,
      initialParsed.body?.required
    );
  });
  const [responses, setResponses] = useState<ResponseNode[]>(() => {
    if (!initialParsed.responses || !Array.isArray(initialParsed.responses)) return [];
    return initialParsed.responses.map((r) => ({
      id: generateId(),
      statusCode: String(r.statusCode || '200'),
      description: r.description || '',
      example:
        typeof r.example === 'object'
          ? JSON.stringify(r.example)
          : String(r.example || ''),
    }));
  });

  // Synchronize when schemaDefinition prop changes from outside
  useEffect(() => {
    if (isSelfUpdatingRef.current) return;
    const parsed = parseSchemaDefinition(schemaDefinition);
    setSummary(parsed.summary || '');
    setDescription(parsed.description || '');
    setParameters(parsed.parameters || []);
    setPropertyTree(schemaPropertiesToTree(parsed.body?.properties, parsed.body?.required));
    setResponses(
      (parsed.responses || []).map((r) => ({
        id: generateId(),
        statusCode: String(r.statusCode || '200'),
        description: r.description || '',
        example:
          typeof r.example === 'object'
            ? JSON.stringify(r.example)
            : String(r.example || ''),
      }))
    );
  }, [schemaDefinition]);

  const emitSchema = useCallback(
    (
      newSummary: string,
      newDescription: string,
      newParams: any[],
      newTree: PropertyNode[],
      newResponses: ResponseNode[]
    ) => {
      isSelfUpdatingRef.current = true;
      const { properties, required } = treeToSchemaProperties(newTree);
      const structured: StructuredSchema = {
        summary: newSummary.trim(),
        description: newDescription.trim(),
        parameters: newParams,
        body: {
          type: 'object',
          properties,
          required,
        },
        responses: newResponses.map((r) => ({
          statusCode: r.statusCode.trim() || '200',
          description: r.description.trim(),
          example: r.example.trim(),
        })),
      };

      const jsonStr = JSON.stringify(structured, null, 2);
      onChange?.(jsonStr);
      onUpdateSchema?.(jsonStr);

      setTimeout(() => {
        isSelfUpdatingRef.current = false;
      }, 0);
    },
    [onChange, onUpdateSchema]
  );

  const handleSummaryChange = (val: string) => {
    setSummary(val);
    emitSchema(val, description, parameters, propertyTree, responses);
  };

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    emitSchema(summary, val, parameters, propertyTree, responses);
  };

  const handleAddRootProperty = () => {
    const newNode: PropertyNode = {
      id: generateId(),
      name: '',
      type: 'string',
      required: false,
      description: '',
      example: '',
      children: [],
    };
    const nextTree = [...propertyTree, newNode];
    setPropertyTree(nextTree);
    emitSchema(summary, description, parameters, nextTree, responses);
  };

  const handleAddChildProperty = (parentId: string) => {
    const childNode: PropertyNode = {
      id: generateId(),
      name: '',
      type: 'string',
      required: false,
      description: '',
      example: '',
      children: [],
    };
    const nextTree = addChildToNodeInTree(propertyTree, parentId, childNode);
    setPropertyTree(nextTree);
    emitSchema(summary, description, parameters, nextTree, responses);
  };

  const handleUpdateProperty = (id: string, updates: Partial<PropertyNode>) => {
    const nextTree = updateNodeInTree(propertyTree, id, (n) => ({ ...n, ...updates }));
    setPropertyTree(nextTree);
    emitSchema(summary, description, parameters, nextTree, responses);
  };

  const handleTypeChange = (id: string, nextType: SchemaPropertyType) => {
    const nextTree = updateNodeInTree(propertyTree, id, (n) => ({
      ...n,
      type: nextType,
      children: nextType === 'object' ? n.children || [] : undefined,
    }));
    setPropertyTree(nextTree);
    emitSchema(summary, description, parameters, nextTree, responses);
  };

  const handleRemoveProperty = (id: string) => {
    const nextTree = removeNodeFromTree(propertyTree, id);
    setPropertyTree(nextTree);
    emitSchema(summary, description, parameters, nextTree, responses);
  };

  const handleAddResponse = () => {
    const newResp: ResponseNode = {
      id: generateId(),
      statusCode: '200',
      description: '',
      example: '',
    };
    const nextResponses = [...responses, newResp];
    setResponses(nextResponses);
    emitSchema(summary, description, parameters, propertyTree, nextResponses);
  };

  const handleUpdateResponse = (id: string, updates: Partial<ResponseNode>) => {
    const nextResponses = responses.map((r) => (r.id === id ? { ...r, ...updates } : r));
    setResponses(nextResponses);
    emitSchema(summary, description, parameters, propertyTree, nextResponses);
  };

  const handleRemoveResponse = (id: string) => {
    const nextResponses = responses.filter((r) => r.id !== id);
    setResponses(nextResponses);
    emitSchema(summary, description, parameters, propertyTree, nextResponses);
  };

  const handleGenerateClick = () => {
    const sample = generateSampleFromProperties(propertyTree);
    const jsonStr = JSON.stringify(sample, null, 2);
    onGenerateBodyExample?.(jsonStr);
  };

  const flatProperties = useMemo(() => flattenTree(propertyTree), [propertyTree]);

  return (
    <div className="flex-1 overflow-y-auto pr-1 space-y-6 min-h-0 text-neutral-200">
      {/* Summary & Description Section */}
      <div className="p-3 bg-neutral-900/40 border border-neutral-800/80 rounded-lg space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-neutral-200">
              {summary ? summary : 'Especificação da API'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="spec-summary-input"
              className="block text-[11px] font-medium text-neutral-400 mb-1"
            >
              Resumo (Summary)
            </label>
            <input
              id="spec-summary-input"
              type="text"
              aria-label="Resumo da especificação"
              placeholder="ex: Obter detalhes do item"
              value={summary}
              disabled={disabled}
              onChange={(e) => handleSummaryChange(e.target.value)}
              className="h-8 w-full px-2.5 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="spec-description-input"
              className="block text-[11px] font-medium text-neutral-400 mb-1"
            >
              Descrição (Description)
            </label>
            <input
              id="spec-description-input"
              type="text"
              aria-label="Descrição da especificação"
              placeholder="ex: Retorna os dados completos do item a partir do seu ID"
              value={description}
              disabled={disabled}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              className="h-8 w-full px-2.5 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Body Schema Tree Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Corpo da Requisição (Schema)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Gerar Exemplo no Corpo"
              title="Gerar JSON no corpo da requisição baseado no schema"
              disabled={disabled}
              onClick={handleGenerateClick}
              className="h-7 px-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gerar Exemplo no Corpo</span>
            </button>

            <button
              type="button"
              aria-label="Adicionar Propriedade"
              title="Adicionar nova propriedade ao schema"
              disabled={disabled}
              onClick={handleAddRootProperty}
              className="h-7 px-2.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-medium text-xs flex items-center gap-1 transition-colors border border-neutral-700/60 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Propriedade</span>
            </button>
          </div>
        </div>

        {flatProperties.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-neutral-800 rounded-lg bg-neutral-900/20 text-neutral-500 text-xs">
            <p>Nenhuma propriedade definida no corpo da requisição.</p>
            <p className="mt-1 text-[11px] text-neutral-600">
              Clique em &quot;Adicionar Propriedade&quot; acima para estruturar o schema.
            </p>
          </div>
        ) : (
          <div className="border border-neutral-800 rounded-lg overflow-x-auto bg-neutral-900/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-900/80 text-[11px] font-medium text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
                  <th className="py-2 px-3 min-w-[200px] w-1/3">Propriedade</th>
                  <th className="py-2 px-2 w-28">Tipo</th>
                  <th className="py-2 px-2 w-24 text-center">Obrigatório</th>
                  <th className="py-2 px-2 w-1/4">Descrição</th>
                  <th className="py-2 px-2 w-1/4">Exemplo</th>
                  <th className="py-2 px-2 w-20 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {flatProperties.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-neutral-800/60 hover:bg-neutral-900/30 transition-colors"
                  >
                    {/* Propriedade (name) */}
                    <td className="py-1.5 px-3">
                      <div
                        className="flex items-center gap-1.5"
                        style={{ paddingLeft: `${row.depth * 16}px` }}
                      >
                        {row.depth > 0 && (
                          <span
                            className="text-neutral-500 font-mono text-xs select-none"
                            aria-hidden="true"
                          >
                            ↳
                          </span>
                        )}
                        <span className="text-xs font-mono font-medium text-neutral-200">
                          {row.name}
                        </span>
                        <input
                          type="text"
                          aria-label={`Nome da propriedade ${row.name || 'nova'}`}
                          placeholder="nome"
                          value={row.name}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateProperty(row.id, { name: e.target.value })
                          }
                          className="h-7 px-2 text-xs font-mono bg-neutral-900/90 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-[80px]"
                        />
                      </div>
                    </td>

                    {/* Tipo */}
                    <td className="py-1.5 px-2">
                      <select
                        aria-label={`Tipo da propriedade ${row.name || 'nova'}`}
                        value={row.type}
                        disabled={disabled}
                        onChange={(e) =>
                          handleTypeChange(
                            row.id,
                            e.target.value as SchemaPropertyType
                          )
                        }
                        className="h-7 px-2 text-xs bg-neutral-900 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full cursor-pointer"
                      >
                        <option value="string">string</option>
                        <option value="integer">integer</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="object">object</option>
                        <option value="array">array</option>
                      </select>
                    </td>

                    {/* Obrigatório */}
                    <td className="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Obrigatório ${row.name || 'nova'}`}
                        checked={row.required}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateProperty(row.id, {
                            required: e.target.checked,
                          })
                        }
                        className="w-3.5 h-3.5 rounded border-neutral-700 text-blue-600 focus:ring-blue-500 bg-neutral-900 cursor-pointer"
                      />
                    </td>

                    {/* Descrição */}
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        aria-label={`Descrição da propriedade ${row.name || 'nova'}`}
                        placeholder="Descrição..."
                        value={row.description}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateProperty(row.id, {
                            description: e.target.value,
                          })
                        }
                        className="h-7 px-2 text-xs bg-neutral-900/90 border border-neutral-800 rounded text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                      />
                    </td>

                    {/* Exemplo */}
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        aria-label={`Exemplo da propriedade ${row.name || 'nova'}`}
                        placeholder="Exemplo..."
                        value={row.example}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateProperty(row.id, {
                            example: e.target.value,
                          })
                        }
                        className="h-7 px-2 text-xs font-mono bg-neutral-900/90 border border-neutral-800 rounded text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                      />
                    </td>

                    {/* Ações */}
                    <td className="py-1.5 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {row.type === 'object' && (
                          <button
                            type="button"
                            aria-label={`Adicionar subpropriedade a ${
                              row.name || 'objeto'
                            }`}
                            title="Adicionar subpropriedade"
                            disabled={disabled}
                            onClick={() => handleAddChildProperty(row.id)}
                            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-blue-400" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Remover propriedade ${row.name || 'nova'}`}
                          title="Remover propriedade"
                          disabled={disabled}
                          onClick={() => handleRemoveProperty(row.id)}
                          className="p-1 rounded text-neutral-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expected Responses Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            Respostas Esperadas (Responses)
          </span>

          <button
            type="button"
            aria-label="Adicionar Resposta"
            title="Adicionar resposta esperada"
            disabled={disabled}
            onClick={handleAddResponse}
            className="h-7 px-2.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-medium text-xs flex items-center gap-1 transition-colors border border-neutral-700/60 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Resposta</span>
          </button>
        </div>

        {responses.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-neutral-800 rounded-lg bg-neutral-900/20 text-neutral-500 text-xs">
            <p>Nenhuma resposta esperada documentada.</p>
            <p className="mt-1 text-[11px] text-neutral-600">
              Clique em &quot;Adicionar Resposta&quot; para registrar os status HTTP suportados.
            </p>
          </div>
        ) : (
          <div className="border border-neutral-800 rounded-lg overflow-x-auto bg-neutral-900/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-900/80 text-[11px] font-medium text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
                  <th className="py-2 px-3 w-40">Código HTTP</th>
                  <th className="py-2 px-2 w-1/3">Descrição</th>
                  <th className="py-2 px-2 w-1/2">Exemplo / Schema</th>
                  <th className="py-2 px-2 w-16 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((resp) => (
                  <tr
                    key={resp.id}
                    className="border-b border-neutral-800/60 hover:bg-neutral-900/30 transition-colors"
                  >
                    {/* Status Code */}
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${getStatusBadgeClasses(
                            resp.statusCode
                          )}`}
                        >
                          {resp.statusCode || '200'}
                        </span>
                        <input
                          type="text"
                          aria-label="Código de status HTTP"
                          placeholder="200"
                          value={resp.statusCode}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateResponse(resp.id, {
                              statusCode: e.target.value,
                            })
                          }
                          className="h-7 w-20 px-2 text-xs font-mono bg-neutral-900/90 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </td>

                    {/* Descrição */}
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        aria-label="Descrição da resposta"
                        placeholder="ex: Operação bem-sucedida"
                        value={resp.description}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateResponse(resp.id, {
                            description: e.target.value,
                          })
                        }
                        className="h-7 px-2 text-xs bg-neutral-900/90 border border-neutral-800 rounded text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                      />
                    </td>

                    {/* Exemplo / Schema */}
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        aria-label="Exemplo da resposta"
                        placeholder='ex: {"id": 1, "status": "ok"}'
                        value={resp.example}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateResponse(resp.id, {
                            example: e.target.value,
                          })
                        }
                        className="h-7 px-2 text-xs font-mono bg-neutral-900/90 border border-neutral-800 rounded text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                      />
                    </td>

                    {/* Ações */}
                    <td className="py-1.5 px-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remover resposta ${resp.statusCode || '200'}`}
                        title="Remover resposta"
                        disabled={disabled}
                        onClick={() => handleRemoveResponse(resp.id)}
                        className="p-1 rounded text-neutral-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
