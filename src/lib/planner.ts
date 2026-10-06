import { z } from 'zod';
import {
  DomainError,
  LIMITS,
  schemaSchema,
  proposalSchema,
  scalarSchema,
  type Dataset,
  type Plan,
  type Proposal,
  type ToolTrace,
} from './contracts';
import { demoBundle, demoProposal } from './demo';
import {
  applyTransform,
  createDataset,
  proposalOf,
  TRANSFORMATIONS,
  validateProposal,
  validateValue,
} from './engine';
import { fingerprint } from './hash';

const profileSchema = z
  .object({
    field: z.string().max(64),
    total: z.number().int().min(1).max(LIMITS.records),
    missing: z.number().int().min(0).max(LIMITS.records),
    distinct: z.number().int().min(0).max(LIMITS.records),
    invalid: z.number().int().min(0).max(LIMITS.records),
    whitespace: z.number().int().min(0).max(LIMITS.records),
    categories: z
      .array(
        z
          .object({ value: scalarSchema, count: z.number().int().min(1).max(LIMITS.records) })
          .strict(),
      )
      .max(16),
    uncategorized: z.number().int().min(0).max(LIMITS.records),
    candidateIssues: z
      .object({
        email: z.number().int().min(0).max(LIMITS.records),
        isoDate: z.number().int().min(0).max(LIMITS.records),
        decimal: z.number().int().min(0).max(LIMITS.records),
        boolean: z.number().int().min(0).max(LIMITS.records),
      })
      .strict(),
    types: z.partialRecord(
      z.enum(['string', 'number', 'boolean', 'null']),
      z.number().int().min(0).max(LIMITS.records),
    ),
  })
  .strict();
export const inspectionSchema = z
  .object({
    datasetId: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    sourceSchema: schemaSchema,
    targetSchema: schemaSchema,
    recordCount: z.number().int().min(1).max(LIMITS.records),
    profiles: z.array(profileSchema).min(1).max(LIMITS.fields),
  })
  .strict()
  .superRefine((i, ctx) => {
    const names = i.sourceSchema.fields.map((f) => f.name);
    if (
      i.profiles.length !== names.length ||
      new Set(i.profiles.map((p) => p.field)).size !== names.length ||
      i.profiles.some(
        (p) =>
          !names.includes(p.field) ||
          p.total !== i.recordCount ||
          p.missing > p.total ||
          p.distinct > p.total ||
          p.invalid > p.total ||
          p.whitespace > (p.types.string ?? 0) ||
          p.missing +
            p.uncategorized +
            p.categories.reduce((sum, category) => sum + category.count, 0) !==
            p.total ||
          new Set(p.categories.map((category) => fingerprint(category.value))).size !==
            p.categories.length ||
          Object.values(p.candidateIssues).some((count) => count > p.total) ||
          Object.values(p.types).reduce((a, b) => a + (b ?? 0), 0) !== p.total,
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Profiles must account for every source field and record',
      });
  });
export type Inspection = z.infer<typeof inspectionSchema>;
const categoricalVocabulary = new Set([
  'enabled',
  'disabled',
  'hold',
  'active',
  'inactive',
  'paused',
  'pending',
  'archived',
  'open',
  'closed',
  'yes',
  'no',
  'true',
  'false',
  '1',
  '0',
  'maybe',
  'unknown',
]);
export function inspectDataset(d: Dataset): Inspection {
  return {
    datasetId: d.id,
    name: d.name,
    sourceSchema: d.sourceSchema,
    targetSchema: d.targetSchema,
    recordCount: d.records.length,
    profiles: d.sourceSchema.fields.map((f) => {
      const values = d.records.map((r) => r[f.name] ?? null);
      const types: Record<string, number> = {};
      const categories = new Map<string, { value: (typeof values)[number]; count: number }>();
      const categoricalRole = /(?:^|_)(?:status|state|opt_in|consent|enabled|active)(?:_|$)/i.test(
        f.name,
      );
      for (const v of values) {
        const t = v === null ? 'null' : typeof v;
        types[t] = (types[t] ?? 0) + 1;
        const safeCategory =
          typeof v === 'boolean' ||
          (typeof v === 'string' &&
            v.length <= 100 &&
            ((f.type === 'enum' && f.values?.includes(v)) ||
              (categoricalRole && categoricalVocabulary.has(v.trim().toLowerCase()))));
        if (v !== null && v !== '' && safeCategory) {
          const key = fingerprint(v);
          const category = categories.get(key);
          if (category) category.count++;
          else if (categories.size < 16) categories.set(key, { value: v, count: 1 });
        }
      }
      const present = values
        .filter((v) => v !== null && v !== '')
        .map((v) => (typeof v === 'string' ? v.trim() : v));
      const parseIssues = (op: 'to_number' | 'to_boolean') =>
        present.filter((v) => {
          try {
            applyTransform(v, { op, arg: null });
            return false;
          } catch {
            return true;
          }
        }).length;
      return {
        field: f.name,
        total: values.length,
        missing: values.filter((v) => v === null || v === '').length,
        distinct: new Set(values.map(fingerprint)).size,
        invalid: values.filter((v) => validateValue(v, f) !== null).length,
        whitespace: values.filter((v) => typeof v === 'string' && v !== v.trim()).length,
        categories: [...categories.values()],
        uncategorized:
          values.filter((v) => v !== null && v !== '').length -
          [...categories.values()].reduce((sum, category) => sum + category.count, 0),
        candidateIssues: {
          email: present.filter((v) =>
            validateValue(v, { name: f.name, type: 'email', required: false, unique: false }),
          ).length,
          isoDate: present.filter((v) =>
            validateValue(v, { name: f.name, type: 'date', required: false, unique: false }),
          ).length,
          decimal: parseIssues('to_number'),
          boolean: parseIssues('to_boolean'),
        },
        types,
      };
    }),
  };
}
function proposalFindings(proposal: Proposal, inspection: Inspection): string[] {
  const findings: string[] = [];
  for (const mapping of proposal.mappings) {
    const field = inspection.targetSchema.fields.find((f) => f.name === mapping.target)!;
    const profile = inspection.profiles.find((p) => p.field === mapping.source);
    if (
      profile?.whitespace &&
      ['email', 'date', 'boolean'].includes(field.type) &&
      !mapping.transforms.some((rule) => rule.op === 'trim' || rule.op === 'enum_map')
    )
      findings.push(
        `${mapping.target}: ${profile.whitespace} source strings contain surrounding whitespace. Add trim before strict ${field.type} parsing/validation; candidateIssues counts are measured after trimming.`,
      );
    const businessDecision = mapping.transforms.some(
      (rule) =>
        rule.op === 'default' ||
        (rule.op === 'enum_map' &&
          Object.entries(JSON.parse(rule.arg!)).some(([key, value]) => key !== String(value))),
    );
    if (
      businessDecision &&
      !proposal.questions.some((q) => q.target === mapping.target && q.blocking)
    )
      findings.push(
        `${mapping.target}: defaults and changed enum meanings require a blocking user clarification; the agent cannot choose business semantics silently.`,
      );
    if (
      !mapping.source &&
      field.required &&
      !mapping.transforms.some((t) => t.op === 'default') &&
      !proposal.questions.some((q) => q.target === mapping.target && q.blocking)
    )
      findings.push(`${mapping.target}: a missing required source needs a blocking clarification.`);
    if (profile?.categories.length) {
      const anyValid = profile.categories.some((category) => {
        try {
          const value = mapping.transforms.reduce(
            (v, rule) => applyTransform(v, rule),
            category.value,
          );
          return validateValue(value, field) === null;
        } catch {
          return false;
        }
      });
      if (!anyValid)
        findings.push(
          `${mapping.target}: none of the observed categorical values pass this pipeline for target type ${field.type}. Enum maps preserve JSON value types: boolean outputs must be unquoted true/false, or use to_boolean after the lookup. Map the observed source labels from profile_source to valid typed outputs, or explicitly leave the source null and ask a blocking clarification.`,
        );
    }
  }
  return findings;
}
export const TOOL_NAMES = [
  'inspect_schemas',
  'profile_source',
  'inspect_transformations',
  'validate_proposal',
] as const;
export function runInspectionTool(
  name: string,
  args: unknown,
  inspection: Inspection,
  trace: ToolTrace[],
): unknown {
  const blocked = (message: string) => {
    trace.push({ tool: name, status: 'blocked', detail: message });
    throw new DomainError('TOOL_BLOCKED', message);
  };
  if (!TOOL_NAMES.includes(name as (typeof TOOL_NAMES)[number]))
    return blocked(`Tool ${name} is outside the read-only allowlist`);
  if (name === 'validate_proposal') {
    const parsed = z.object({ proposal: proposalSchema }).strict().safeParse(args);
    if (!parsed.success) return blocked('Proposal arguments do not satisfy the bounded contract');
    try {
      validateProposal(parsed.data.proposal, inspection);
      const findings = proposalFindings(parsed.data.proposal, inspection);
      if (findings.length) throw new DomainError('UNSUPPORTED_ASSUMPTION', findings.join(' '));
    } catch (e) {
      return blocked(e instanceof Error ? e.message : 'Proposal failed semantic validation');
    }
    trace.push({
      tool: name,
      status: 'passed',
      detail: 'All target fields accounted for; source references and transformations verified.',
    });
    return {
      valid: true,
      mappings: parsed.data.proposal.mappings.length,
      blockingClarifications: parsed.data.proposal.questions.filter(
        (q) => q.blocking && !q.resolution,
      ).length,
    };
  }
  if (!z.object({}).strict().safeParse(args).success)
    return blocked('Inspection tools take no arguments');
  if (name === 'inspect_schemas') {
    trace.push({
      tool: name,
      status: 'passed',
      detail: `${inspection.sourceSchema.fields.length} source and ${inspection.targetSchema.fields.length} target fields inspected.`,
    });
    return { source: inspection.sourceSchema, target: inspection.targetSchema };
  }
  if (name === 'profile_source') {
    trace.push({
      tool: name,
      status: 'passed',
      detail: `${inspection.recordCount} records profiled; no raw rows or personal values disclosed.`,
    });
    return {
      recordCount: inspection.recordCount,
      profiles: inspection.profiles,
      note: 'whitespace counts strings needing trim. candidateIssues counts nonmissing values failing common target format/parsing checks AFTER trimming; it does not prove raw values are valid. categories contains aggregate counts only for declared enums, booleans and recognized status/consent vocabulary. Other values are counted as uncategorized; no names, IDs or contact values are disclosed. These are inspection hints, not a dry run.',
    };
  }
  trace.push({
    tool: name,
    status: 'passed',
    detail: `${TRANSFORMATIONS.length} finite transformations inspected.`,
  });
  return {
    transformations: TRANSFORMATIONS,
    arguments: {
      enum_map:
        'JSON object with at most 30 scalar entries. Output types are preserved: use unquoted true/false for booleans and numeric JSON values for numbers.',
      default: 'JSON scalar',
      multiply: 'finite numeric string',
      other: null,
    },
    limits: LIMITS,
  };
}
const aliases: Record<string, string[]> = {
  id: ['customerid', 'userid', 'recordid'],
  name: ['fullname', 'customername'],
  email: ['emailaddress', 'contactemail'],
  joinedat: ['signupdate', 'createdat', 'registrationdate'],
  totalspend: ['lifetimevalue', 'amount', 'total'],
  status: ['accountstatus'],
  subscribed: ['marketingoptin', 'optin'],
  country: ['countrycode'],
};
const normalized = (s: string) => s.toLowerCase().replace(/_/g, '');
export function demoPlan(dataset: Dataset): {
  proposal: Proposal;
  trace: ToolTrace[];
  provider: Plan['provider'];
} {
  const inspection = inspectDataset(dataset);
  const trace: ToolTrace[] = [];
  for (const name of TOOL_NAMES.slice(0, 3)) runInspectionTool(name, {}, inspection, trace);
  let proposal: Proposal;
  if (dataset.fingerprint === createDataset(demoBundle).fingerprint)
    proposal = structuredClone(demoProposal);
  else {
    const questions: Proposal['questions'] = [];
    const risks: Proposal['risks'] = [];
    const mappings: Proposal['mappings'] = dataset.targetSchema.fields.map((target) => {
      const source =
        dataset.sourceSchema.fields.find((f) => normalized(f.name) === normalized(target.name)) ??
        dataset.sourceSchema.fields.find((f) =>
          aliases[normalized(target.name)]?.includes(normalized(f.name)),
        );
      const transforms: Proposal['mappings'][number]['transforms'] = [];
      if (source?.type === 'string') transforms.push({ op: 'trim', arg: null });
      if (source && target.type === 'email') transforms.push({ op: 'lowercase', arg: null });
      if (source && target.type === 'date') transforms.push({ op: 'date_iso', arg: null });
      if (
        source &&
        source.type !== target.type &&
        ['number', 'integer', 'boolean'].includes(target.type)
      )
        transforms.push({
          op:
            target.type === 'number'
              ? 'to_number'
              : target.type === 'integer'
                ? 'to_integer'
                : 'to_boolean',
          arg: null,
        });
      if (!source) {
        questions.push({
          id: `missing-${target.name}`,
          target: target.name,
          question: `Which source field or explicit default should populate ${target.name}?`,
          blocking: target.required,
          resolution: null,
        });
        risks.push({
          field: target.name,
          severity: target.required ? 'high' : 'medium',
          message: 'No supported name match was found. The mapping is explicitly null.',
          evidence: `Available source fields: ${dataset.sourceSchema.fields.map((f) => f.name).join(', ')}`,
        });
      }
      if (
        source &&
        target.type === 'enum' &&
        !source.values?.every((v) => target.values?.includes(v))
      ) {
        questions.push({
          id: `enum-${target.name}`,
          target: target.name,
          question: `Confirm an explicit enum lookup for ${source.name} → ${target.name}; do not guess business semantics.`,
          blocking: true,
          resolution: null,
        });
        risks.push({
          field: target.name,
          severity: 'high',
          message: 'Enum compatibility needs an explicit business decision.',
          evidence: `Target permits ${target.values?.join(', ')}.`,
        });
      }
      const profile = inspection.profiles.find((p) => p.field === source?.name);
      if (source && target.required && profile?.missing)
        risks.push({
          field: target.name,
          severity: 'high',
          message: 'Missing required values will be quarantined; no default was inferred.',
          evidence: `${profile.missing} of ${profile.total} source values are missing.`,
        });
      return {
        target: target.name,
        source: source?.name ?? null,
        transforms,
        rationale: source
          ? `Supported field-name match ${source.name} → ${target.name}; strictly validate ${target.type} and constraints.`
          : 'No supported match. Review before approval.',
        confidence: source ? (source.name === target.name ? 1 : 0.78) : 0,
      };
    });
    proposal = {
      summary:
        'Deterministic demo proposal based on exact names and a documented alias registry. Inspect ambiguous mappings and resolve blocking questions before approval.',
      mappings,
      risks,
      questions,
    };
  }
  runInspectionTool('validate_proposal', { proposal }, inspection, trace);
  return { proposal, trace, provider: 'demo' };
}
export function validateLiveResult(
  input: unknown,
  inspection: Inspection,
  trace: ToolTrace[],
): Proposal {
  const proposal = validateProposal(input, inspection);
  // Live output cannot resolve a clarification on the user's behalf.
  if (proposal.questions.some((q) => q.resolution !== null))
    throw new DomainError(
      'AGENT_APPROVAL',
      'The planning agent cannot resolve user clarifications.',
    );
  runInspectionTool('validate_proposal', { proposal: proposalOf(proposal) }, inspection, trace);
  return proposal;
}
