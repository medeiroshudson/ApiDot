import { VariableItem } from '@/components/environment/VariableGrid';
import { EnvironmentGroup } from '@/components/environment/EnvironmentModal';

export function resolveVariables(
  globals: VariableItem[],
  collectionVariables: VariableItem[],
  environments: EnvironmentGroup[],
  activeEnvironment: string | null
): Record<string, string> {
  const merged: Record<string, string> = {};

  // 1. Globals (active only)
  globals.forEach((v) => {
    if (v.isActive !== false && v.key.trim()) {
      merged[v.key.trim()] = v.value;
    }
  });

  // 2. Collection (active only, overrides globals)
  collectionVariables.forEach((v) => {
    if (v.isActive !== false && v.key.trim()) {
      merged[v.key.trim()] = v.value;
    }
  });

  // 3. Active environment (active only, overrides collection & globals)
  if (activeEnvironment) {
    const envObj = environments.find(
      (e) => e.name.toLowerCase() === activeEnvironment.toLowerCase()
    );
    if (envObj) {
      envObj.variables.forEach((v) => {
        if (v.isActive !== false && v.key.trim()) {
          merged[v.key.trim()] = v.value;
        }
      });
    }
  }

  return merged;
}

export function interpolateVariables(template: string, variables: Record<string, string>): string {
  if (!template) return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_\.$-]+)\s*\}\}/g, (match, key) => {
    if (key.toLowerCase() === '$guid') {
      return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-0000-0000-000000000000';
    }
    if (key.toLowerCase() === '$timestamp') {
      return Math.floor(Date.now() / 1000).toString();
    }
    if (key.toLowerCase() === '$randomint') {
      return Math.floor(1000 + Math.random() * 9000).toString();
    }
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}
