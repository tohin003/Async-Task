import type { Bundle, DataRecord, Proposal } from './contracts';

const people = ['Amelia Hart', 'Oliver Chen', 'Isla Morgan', 'Noah Patel', 'Mia Thompson', 'Leo Rivera', 'Sofia Kim', 'Ethan Brooks', 'Ava Singh', 'Lucas Martin', 'Chloe Davis', 'Arjun Shah'];
export const demoBundle: Bundle = {
  name: 'Customer registry migration',
  sourceSchema: { name: 'legacy_customers', primaryKey: 'customer_id', fields: [
    { name: 'customer_id', type: 'string', required: true, unique: true, description: 'Stable legacy customer identifier' },
    { name: 'full_name', type: 'string', required: true, unique: false },
    { name: 'email_address', type: 'string', required: true, unique: false },
    { name: 'signup_date', type: 'string', required: true, unique: false },
    { name: 'lifetime_value', type: 'string', required: false, unique: false, description: 'Decimal amount in USD' },
    { name: 'account_status', type: 'string', required: true, unique: false },
    { name: 'marketing_opt_in', type: 'string', required: false, unique: false },
    { name: 'country', type: 'string', required: false, unique: false },
  ] },
  targetSchema: { name: 'customers_v2', primaryKey: 'id', fields: [
    { name: 'id', type: 'string', required: true, unique: true },
    { name: 'name', type: 'string', required: true, unique: false, max: 100 },
    { name: 'email', type: 'email', required: true, unique: true },
    { name: 'joined_at', type: 'date', required: true, unique: false },
    { name: 'total_spend', type: 'number', required: true, unique: false, min: 0 },
    { name: 'status', type: 'enum', required: true, unique: false, values: ['active', 'inactive', 'paused'] },
    { name: 'subscribed', type: 'boolean', required: true, unique: false },
    { name: 'country', type: 'string', required: false, unique: false, min: 2, max: 2 },
  ] },
  records: Array.from({ length: 120 }, (_, i): DataRecord => ({
    customer_id: `CUS-${String(i + 1).padStart(4, '0')}`,
    full_name: ` ${people[i % people.length]} `,
    email_address: ` ${people[i % people.length].split(' ')[0].toUpperCase()}.${i + 1}@example.com `,
    signup_date: `2025-${String(i % 12 + 1).padStart(2, '0')}-${String(i % 27 + 1).padStart(2, '0')}`,
    lifetime_value: i % 13 === 0 ? null : (35.5 + i * 19.25).toFixed(2),
    account_status: ['enabled', 'disabled', 'hold'][i % 3],
    marketing_opt_in: i % 2 === 0 ? 'yes' : 'no',
    country: ['us', 'gb', 'in', 'ca'][i % 4],
  })).map((r, i) => {
    if ([8, 27, 46, 65].includes(i)) r.email_address = 'invalid-email';
    if ([14, 44, 74].includes(i)) r.signup_date = '2025-02-30';
    if ([21, 81].includes(i)) r.lifetime_value = 'USD 120';
    if (i === 99) r.customer_id = 'CUS-0001';
    if (i === 109) r.customer_id = '';
    if (i === 119) r.marketing_opt_in = 'maybe';
    return r;
  }),
};
export const demoProposal: Proposal = {
  summary: 'Map the legacy customer registry to the typed customer schema. Normalize whitespace and casing, strictly parse amounts and dates, and translate account statuses. Invalid records are quarantined with field-level evidence.',
  mappings: [
    { target: 'id', source: 'customer_id', transforms: [{ op: 'trim', arg: null }], rationale: 'Preserve the stable customer identifier. Duplicate or empty IDs are quarantined.', confidence: 1 },
    { target: 'name', source: 'full_name', transforms: [{ op: 'trim', arg: null }], rationale: 'Remove surrounding whitespace without changing the customer name.', confidence: 0.99 },
    { target: 'email', source: 'email_address', transforms: [{ op: 'trim', arg: null }, { op: 'lowercase', arg: null }], rationale: 'Normalize legacy contact emails and enforce target uniqueness and format.', confidence: 0.98 },
    { target: 'joined_at', source: 'signup_date', transforms: [{ op: 'date_iso', arg: null }], rationale: 'Accept valid ISO calendar dates only; ambiguous or impossible dates are rejected.', confidence: 0.97 },
    { target: 'total_spend', source: 'lifetime_value', transforms: [{ op: 'default', arg: '0' }, { op: 'to_number', arg: null }], rationale: 'Parse decimal USD values. Default missing totals to zero after reviewer confirmation.', confidence: 0.92 },
    { target: 'status', source: 'account_status', transforms: [{ op: 'enum_map', arg: '{"enabled":"active","disabled":"inactive","hold":"paused"}' }], rationale: 'Translate each legacy state explicitly. Unknown statuses are quarantined.', confidence: 0.95 },
    { target: 'subscribed', source: 'marketing_opt_in', transforms: [{ op: 'to_boolean', arg: null }], rationale: 'Translate explicit yes/no values. Never infer consent from missing data.', confidence: 0.98 },
    { target: 'country', source: 'country', transforms: [{ op: 'uppercase', arg: null }], rationale: 'Normalize two-letter country codes to uppercase.', confidence: 1 },
  ],
  risks: [
    { field: 'total_spend', severity: 'medium', message: 'Defaulting a missing lifetime value to zero changes the distinction between unknown and zero.', evidence: '10 of 120 source records have a null lifetime_value.' },
    { field: 'email', severity: 'high', message: 'Invalid contact emails must not reach the target. Case normalization may expose duplicates.', evidence: '4 source emails fail format validation.' },
    { field: 'joined_at', severity: 'high', message: 'Impossible calendar dates are quarantined; no date guessing is supported.', evidence: '3 source records contain 2025-02-30.' },
  ],
  questions: [
    { id: 'default-spend', target: 'total_spend', question: 'Is zero an acceptable default for missing lifetime values?', blocking: true, resolution: null },
    { id: 'status-meaning', target: 'status', question: 'Does the legacy “hold” state mean “paused” in the new customer registry?', blocking: true, resolution: null },
  ],
};
