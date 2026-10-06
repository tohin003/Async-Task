import type { Workspace } from './contracts';
import { createDataset, planFingerprint, proposalOf, validateProposal } from './engine';
import { demoBundle, demoProposal } from './demo';
import { applyCommand, emptyWorkspace, verifyHistory, type Command } from './lifecycle';

const DATABASE = 'relay-workbench-v1';
const STORE = 'workspace';
let dbPromise: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); dbPromise = null; }; resolve(request.result); };
    request.onerror = () => { dbPromise = null; reject(new Error('Local mock storage is unavailable. Allow browser storage and reload.')); };
  });
  return dbPromise;
}
export function seedWorkspace(): Workspace {
  let w = emptyWorkspace(createDataset(demoBundle));
  w = applyCommand(w, { type: 'plan', proposal: demoProposal, provider: 'demo', datasetId: w.dataset.id, trace: [
    { tool: 'inspect_schemas', status: 'passed', detail: '8 source fields and 8 target fields inspected.' },
    { tool: 'profile_source', status: 'passed', detail: '120 records profiled locally; raw records remain in this browser.' },
    { tool: 'inspect_transformations', status: 'passed', detail: '10 finite transformations available. No arbitrary code.' },
    { tool: 'validate_proposal', status: 'passed', detail: 'All referenced fields and transformations exist.' },
  ] });
  return w;
}
export function validateStoredWorkspace(value: unknown): Workspace {
  // IndexedDB holds application-authored structured data. Integrity failures never reset silently.
  const w = value as Workspace;
  if (!w || w.format !== 1 || !Number.isInteger(w.revision) || !Array.isArray(w.datasets) || !Array.isArray(w.plans) || !Array.isArray(w.target) || !Array.isArray(w.executions) || !w.dryRuns || !w.approvals || !Array.isArray(w.events) || !verifyHistory(w.events)) throw new Error('Workspace format or history is damaged. Export a recovery snapshot or reset the local demo.');
  for (const d of w.datasets) if (createDataset({ name: d.name, sourceSchema: d.sourceSchema, targetSchema: d.targetSchema, records: d.records }).fingerprint !== d.fingerprint) throw new Error('Dataset integrity check failed.');
  if (!w.datasets.some(d => d.id === w.dataset.id && d.fingerprint === w.dataset.fingerprint)) throw new Error('Current dataset is missing from the workspace.');
  for (const p of w.plans) {
    const d = w.datasets.find(d => d.id === p.datasetId);
    if (!d || planFingerprint(d, validateProposal(proposalOf(p), d)) !== p.fingerprint) throw new Error('Plan integrity check failed.');
  }
  return w;
}
async function transaction(change?: (w: Workspace | undefined) => Workspace): Promise<Workspace> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, change ? 'readwrite' : 'readonly');
    const request = tx.objectStore(STORE).get('current');
    let result: Workspace;
    let caught: unknown;
    request.onsuccess = () => {
      try {
        const old = request.result as Workspace | undefined;
        result = change ? change(old) : validateStoredWorkspace(old);
        if (change) tx.objectStore(STORE).put(result, 'current');
      } catch (error) { caught = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(caught ?? new Error('Could not commit local mock storage. No partial migration was saved.'));
    tx.onabort = () => reject(caught ?? new Error('Local transaction was aborted. No partial migration was saved.'));
  });
}
export async function loadWorkspace(): Promise<Workspace> { return transaction(w => w ? validateStoredWorkspace(w) : seedWorkspace()); }
export async function dispatch(command: Command): Promise<Workspace> {
  const w = await transaction(old => applyCommand(validateStoredWorkspace(old), command));
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(DATABASE); channel.postMessage(w.revision); channel.close(); }
  return w;
}
export async function resetWorkspace(): Promise<Workspace> { return transaction(() => seedWorkspace()); }
export async function recoverySnapshot(): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => { const r = db.transaction(STORE).objectStore(STORE).get('current'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export function watchWorkspace(callback: () => void): () => void {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DATABASE) : null;
  if (channel) channel.onmessage = callback;
  return () => channel?.close();
}
