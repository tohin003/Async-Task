import { bundleSchema, DomainError, proposalSchema, type Bundle, type DataRecord, type Dataset, type DryRun, type Field, type FieldEvidence, type Mapping, type Plan, type Proposal, type Scalar, type Transform } from './contracts';
import { canonical, fingerprint } from './hash';

export const TRANSFORMATIONS = [
  { op: 'trim', label: 'Trim whitespace', description: 'Remove surrounding whitespace from strings.' },
  { op: 'lowercase', label: 'Lowercase', description: 'Normalize string casing without locale dependence.' },
  { op: 'uppercase', label: 'Uppercase', description: 'Convert strings to uppercase.' },
  { op: 'to_number', label: 'Parse number', description: 'Strict decimal parsing; no currency symbols, commas or trailing text.' },
  { op: 'to_integer', label: 'Parse integer', description: 'Parse a safe integer; reject fractions and unsafe values.' },
  { op: 'to_boolean', label: 'Parse boolean', description: 'Accept boolean, true/false, yes/no or 1/0 (case insensitive).' },
  { op: 'date_iso', label: 'ISO date', description: 'Validate YYYY-MM-DD calendar dates; reject ambiguous date formats.' },
  { op: 'enum_map', label: 'Map enum', description: 'Exact lookup from a provided JSON object; unknown values fail.' },
  { op: 'default', label: 'Default value', description: 'Fill only null, missing or empty values using a JSON scalar.' },
  { op: 'multiply', label: 'Multiply', description: 'Multiply a number by a finite factor; no arbitrary code.' },
] as const;

function fail(code: string, message: string): never { throw new DomainError(code, message); }
function asString(v: Scalar): string { if (typeof v !== 'string') fail('TYPE_MISMATCH', 'Transformation requires a string'); return v; }
function parseNumber(v: Scalar): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)) fail('INVALID_NUMBER', 'Expected an unambiguous decimal number');
  const n = Number(v);
  if (!Number.isFinite(n)) fail('INVALID_NUMBER', 'Number is not finite');
  return n;
}
export function validDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === v;
}
export function applyTransform(v: Scalar, t: Transform): Scalar {
  // Nullable values pass through normalization; the target validator handles requiredness.
  if (v === null && t.op !== 'default') return null;
  switch (t.op) {
    case 'trim': return asString(v).trim();
    case 'lowercase': return asString(v).toLowerCase();
    case 'uppercase': return asString(v).toUpperCase();
    case 'to_number': return parseNumber(v);
    case 'to_integer': { const n = parseNumber(v); if (!Number.isSafeInteger(n)) fail('INVALID_INTEGER', 'Expected a safe integer; fractions are not rounded'); return n; }
    case 'to_boolean': {
      if (typeof v === 'boolean') return v;
      if ([1, '1', 'true', 'yes'].includes(typeof v === 'string' ? v.toLowerCase() : v as number)) return true;
      if ([0, '0', 'false', 'no'].includes(typeof v === 'string' ? v.toLowerCase() : v as number)) return false;
      return fail('INVALID_BOOLEAN', 'Expected true/false, yes/no or 1/0');
    }
    case 'date_iso': { const s = asString(v); if (!validDate(s)) fail('INVALID_DATE', 'Expected a valid YYYY-MM-DD date'); return s; }
    case 'enum_map': {
      const map = parseEnumMap(t.arg);
      const key = String(v);
      if (!Object.hasOwn(map, key)) fail('UNMAPPED_ENUM', `No enum mapping for ${key}`);
      return map[key];
    }
    case 'default': return v === null || v === '' ? parseDefault(t.arg) : v;
    case 'multiply': { const factor = Number(t.arg); if (t.arg === null || t.arg.trim() === '' || !Number.isFinite(factor) || typeof v !== 'number') fail('INVALID_FACTOR', 'Multiply requires a number and finite factor'); const n = v * factor; if (!Number.isFinite(n)) fail('OVERFLOW', 'Multiplication overflow'); return n; }
    default: return fail('UNSUPPORTED_TRANSFORM', 'Transformation is not supported');
  }
}
export function parseEnumMap(arg: string | null): Record<string, Scalar> {
  let value: unknown;
  try { value = JSON.parse(arg ?? ''); } catch { return fail('INVALID_ARGUMENT', 'Enum mapping must be a JSON object'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 30) fail('INVALID_ARGUMENT', 'Enum mapping must contain at most 30 entries');
  for (const [key, v] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || (v !== null && !['string', 'number', 'boolean'].includes(typeof v))) fail('INVALID_ARGUMENT', 'Enum mapping must contain safe scalar values');
  }
  return value as Record<string, Scalar>;
}
export function parseDefault(arg: string | null): Scalar {
  let v: unknown;
  try { v = JSON.parse(arg ?? ''); } catch { return fail('INVALID_ARGUMENT', 'Default must be a JSON scalar'); }
  if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) fail('INVALID_ARGUMENT', 'Default must be a JSON scalar');
  return v as Scalar;
}
export function validateValue(v: Scalar, field: Field): { code: string; message: string } | null {
  if (v === null || v === '') return field.required ? { code: 'REQUIRED', message: 'Required value is missing or empty' } : null;
  const invalid = (code: string, message: string) => ({ code, message });
  switch (field.type) {
    case 'string': if (typeof v !== 'string') return invalid('TYPE_MISMATCH', 'Expected string'); break;
    case 'email': if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return invalid('INVALID_EMAIL', 'Email is not valid'); break;
    case 'number': if (typeof v !== 'number' || !Number.isFinite(v)) return invalid('TYPE_MISMATCH', 'Expected finite number'); break;
    case 'integer': if (typeof v !== 'number' || !Number.isSafeInteger(v)) return invalid('INVALID_INTEGER', 'Expected safe integer'); break;
    case 'boolean': if (typeof v !== 'boolean') return invalid('INVALID_BOOLEAN', 'Expected boolean'); break;
    case 'date': if (typeof v !== 'string' || !validDate(v)) return invalid('INVALID_DATE', 'Expected valid YYYY-MM-DD date'); break;
    case 'enum': if (typeof v !== 'string' || !field.values?.includes(v)) return invalid('INVALID_ENUM', `Expected one of: ${field.values?.join(', ')}`); break;
  }
  const measure = typeof v === 'string' ? v.length : typeof v === 'number' ? v : null;
  if (measure !== null && field.min !== undefined && measure < field.min) return invalid('BELOW_MIN', `Value must be at least ${field.min}${typeof v === 'string' ? ' characters' : ''}`);
  if (measure !== null && field.max !== undefined && measure > field.max) return invalid('ABOVE_MAX', `Value exceeds ${field.max}${typeof v === 'string' ? ' characters' : ''}`);
  return null;
}
export function validateProposal(input: unknown, bundle: Pick<Bundle, 'sourceSchema' | 'targetSchema'>): Proposal {
  const proposal = proposalSchema.parse(input);
  const source = new Set(bundle.sourceSchema.fields.map(f => f.name));
  const target = new Set(bundle.targetSchema.fields.map(f => f.name));
  const seen = new Set<string>();
  for (const m of proposal.mappings) {
    if (!target.has(m.target)) fail('UNKNOWN_TARGET', `Target field ${m.target} does not exist`);
    if (m.source && !source.has(m.source)) fail('UNKNOWN_SOURCE', `Source field ${m.source} does not exist`);
    if (seen.has(m.target)) fail('DUPLICATE_MAPPING', `Target ${m.target} is mapped twice`);
    seen.add(m.target);
    for (const t of m.transforms) {
      if (t.op === 'enum_map') parseEnumMap(t.arg);
      else if (t.op === 'default') parseDefault(t.arg);
      else if (t.op === 'multiply' && (t.arg === null || t.arg.trim() === '' || !Number.isFinite(Number(t.arg)))) fail('INVALID_ARGUMENT', 'Multiply factor must be finite');
      else if (!['enum_map', 'default', 'multiply'].includes(t.op) && t.arg !== null) fail('INVALID_ARGUMENT', `${t.op} takes no argument`);
    }
  }
  for (const field of target) if (!seen.has(field)) fail('MISSING_MAPPING', `Target field ${field} needs an explicit mapping (or explicit null source)`);
  for (const r of [...proposal.risks, ...proposal.questions.map(q => ({ field: q.target }))]) if (!target.has(r.field)) fail('UNKNOWN_TARGET', `Evidence refers to nonexistent target ${r.field}`);
  if (new Set(proposal.questions.map(q => q.id)).size !== proposal.questions.length) fail('DUPLICATE_QUESTION', 'Clarification IDs must be unique');
  return proposal;
}
export function createDataset(input: unknown, now = new Date().toISOString()): Dataset {
  const b = bundleSchema.parse(input);
  const hash = fingerprint(b);
  return { ...b, id: `dataset-${hash.slice(0, 16)}`, fingerprint: hash, createdAt: now };
}
export function planFingerprint(dataset: Dataset, p: Proposal): string {
  return fingerprint({ dataset: dataset.fingerprint, mappings: p.mappings, questions: p.questions });
}
export function proposalOf(plan: Proposal): Proposal { return { summary: plan.summary, mappings: plan.mappings, risks: plan.risks, questions: plan.questions }; }
function runValidated(dataset: Dataset, plan: Plan, now: string): DryRun {
  const unique = new Map(dataset.targetSchema.fields.filter(f => f.unique || f.name === dataset.targetSchema.primaryKey).map(f => [f.name, new Map<string, number>()]));
  const rows = dataset.records.map((source, index) => {
    const transformed: DataRecord = {};
    const errors: FieldEvidence[] = [];
    for (const field of dataset.targetSchema.fields) {
      const m = plan.mappings.find(m => m.target === field.name)!;
      const original = m.source ? source[m.source] ?? null : null;
      let v = original;
      let transformFailed = false;
      for (const t of m.transforms) {
        try { v = applyTransform(v, t); }
        catch (error) {
          errors.push({ field: field.name, sourceField: m.source, original, transformed: v, rule: t.op, code: error instanceof DomainError ? error.code : 'TRANSFORM_ERROR', message: error instanceof Error ? error.message : 'Transformation failed' });
          transformFailed = true; break;
        }
      }
      transformed[field.name] = v;
      if (!transformFailed) {
        const issue = validateValue(v, field);
        if (issue) errors.push({ field: field.name, sourceField: m.source, original, transformed: v, rule: `target.${field.type}`, ...issue });
      }
    }
    // Deterministic first valid row wins. Rejected rows do not reserve unique keys.
    if (errors.length === 0) {
      for (const [field, values] of unique) {
        const v = transformed[field];
        if (v === null || v === '') continue;
        const earlier = values.get(canonical(v));
        if (earlier !== undefined) errors.push({ field, sourceField: plan.mappings.find(m => m.target === field)?.source ?? null, original: source[plan.mappings.find(m => m.target === field)?.source ?? ''] ?? null, transformed: v, rule: 'unique', code: 'DUPLICATE_VALUE', message: `Duplicates accepted source row ${earlier + 1}` });
      }
      if (errors.length === 0) for (const [field, values] of unique) if (transformed[field] !== null && transformed[field] !== '') values.set(canonical(transformed[field]), index);
    }
    return { index, source, transformed, accepted: errors.length === 0, errors, key: errors.length === 0 ? canonical(transformed[dataset.targetSchema.primaryKey]) : null };
  });
  const accepted = rows.filter(r => r.accepted).length;
  return { planId: plan.id, planFingerprint: plan.fingerprint, digest: fingerprint({ plan: plan.fingerprint, rows }), rows, source: rows.length, transformed: rows.length, accepted, rejected: rows.length - accepted, createdAt: now };
}
export function runDryRun(dataset: Dataset, plan: Plan, now = new Date().toISOString()): DryRun {
  validateProposal(proposalOf(plan), dataset);
  if (plan.fingerprint !== planFingerprint(dataset, plan)) fail('STALE_PLAN', 'Plan fingerprint no longer matches its content');
  return runValidated(dataset, plan, now);
}
export function mappingLabel(m: Mapping): string { return m.transforms.length ? m.transforms.map(t => TRANSFORMATIONS.find(r => r.op === t.op)?.label).join(' → ') : 'Direct copy'; }
