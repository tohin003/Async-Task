import { z } from 'zod';

export const LIMITS = { records: 500, fields: 32, bytes: 1_000_000, versions: 50 } as const;
export const scalarSchema = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]);
export type Scalar = z.infer<typeof scalarSchema>;
export type DataRecord = Record<string, Scalar>;
const fieldName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).refine(v => !['constructor', 'prototype', '__proto__'].includes(v), 'Reserved field name');
export const fieldSchema = z.object({
  name: fieldName,
  type: z.enum(['string', 'number', 'integer', 'boolean', 'date', 'email', 'enum']),
  required: z.boolean(),
  unique: z.boolean().default(false),
  values: z.array(z.string().max(100)).max(30).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  description: z.string().max(300).optional(),
}).strict();
export type Field = z.infer<typeof fieldSchema>;
export const schemaSchema = z.object({
  name: z.string().min(1).max(80),
  primaryKey: fieldName,
  fields: z.array(fieldSchema).min(1).max(LIMITS.fields),
}).strict().superRefine((s, ctx) => {
  if (new Set(s.fields.map(f => f.name)).size !== s.fields.length) ctx.addIssue({ code: 'custom', message: 'Field names must be unique' });
  const pk = s.fields.find(f => f.name === s.primaryKey);
  if (!pk?.required || !['string', 'integer'].includes(pk.type)) ctx.addIssue({ code: 'custom', message: 'Primary key must be a required string or integer' });
  for (const f of s.fields) {
    if (f.type === 'enum' && !f.values?.length) ctx.addIssue({ code: 'custom', message: `${f.name}: enum requires values` });
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) ctx.addIssue({ code: 'custom', message: `${f.name}: min exceeds max` });
  }
});
export type DataSchema = z.infer<typeof schemaSchema>;
export const bundleSchema = z.object({
  name: z.string().min(1).max(80),
  sourceSchema: schemaSchema,
  targetSchema: schemaSchema,
  records: z.array(z.record(fieldName, scalarSchema)).min(1).max(LIMITS.records),
}).strict().superRefine((b, ctx) => {
  const names = new Set(b.sourceSchema.fields.map(f => f.name));
  b.records.forEach((r, i) => {
    for (const key of Object.keys(r)) if (!names.has(key)) ctx.addIssue({ code: 'custom', message: `Record ${i + 1}: undeclared source field ${key}` });
  });
  if (new TextEncoder().encode(JSON.stringify(b)).length > LIMITS.bytes) ctx.addIssue({ code: 'custom', message: 'Dataset exceeds 1 MB limit' });
});
export type Bundle = z.infer<typeof bundleSchema>;
export type Dataset = Bundle & { id: string; fingerprint: string; createdAt: string };

export const OPERATIONS = ['trim', 'lowercase', 'uppercase', 'to_number', 'to_integer', 'to_boolean', 'date_iso', 'enum_map', 'default', 'multiply'] as const;
export const transformSchema = z.object({ op: z.enum(OPERATIONS), arg: z.string().max(2000).nullable() }).strict();
export type Transform = z.infer<typeof transformSchema>;
export const mappingSchema = z.object({
  target: fieldName,
  source: fieldName.nullable(),
  transforms: z.array(transformSchema).max(6),
  rationale: z.string().max(800),
  confidence: z.number().min(0).max(1),
}).strict();
export type Mapping = z.infer<typeof mappingSchema>;
export const proposalSchema = z.object({
  summary: z.string().min(1).max(2000),
  mappings: z.array(mappingSchema).min(1).max(LIMITS.fields),
  risks: z.array(z.object({ field: fieldName, severity: z.enum(['low', 'medium', 'high']), message: z.string().max(1000), evidence: z.string().max(1000) }).strict()).max(64),
  questions: z.array(z.object({ id: z.string().min(1).max(64), target: fieldName, question: z.string().max(1000), blocking: z.boolean(), resolution: z.string().max(1000).nullable() }).strict()).max(32),
}).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export type ToolTrace = { tool: string; status: 'passed' | 'blocked'; detail: string };
export type Plan = Proposal & { id: string; version: number; datasetId: string; fingerprint: string; createdAt: string; provider: 'demo' | 'live' | 'manual'; trace: ToolTrace[] };
export type FieldEvidence = { field: string; sourceField: string | null; original: Scalar; transformed: Scalar; rule: string; code: string; message: string };
export type RowResult = { index: number; source: DataRecord; transformed: DataRecord; accepted: boolean; errors: FieldEvidence[]; key: string | null };
export type DryRun = { planId: string; planFingerprint: string; digest: string; rows: RowResult[]; source: number; transformed: number; accepted: number; rejected: number; createdAt: string };
export type Approval = { planId: string; planFingerprint: string; dryRunDigest: string; reviewer: string; note: string; createdAt: string };
export type TargetRow = { key: string; data: DataRecord; planId: string; executionId: string; digest: string };
export type Execution = { id: string; planId: string; attempt: number; inserted: number; skipped: number; rejected: number; status: 'committed' | 'failed' | 'rolled_back'; error: string | null; createdAt: string; rolledBackAt: string | null };
export type AuditEvent = { id: string; type: 'dataset' | 'plan' | 'dry_run' | 'approval' | 'execution' | 'retry' | 'rollback' | 'reconciliation'; planId: string | null; actor: string; detail: string; createdAt: string; previousHash: string; hash: string };
export type Workspace = { format: 1; revision: number; dataset: Dataset; datasets: Dataset[]; plans: Plan[]; dryRuns: Record<string, DryRun>; approvals: Record<string, Approval>; executions: Execution[]; target: TargetRow[]; events: AuditEvent[] };

export class DomainError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'DomainError'; }
}
