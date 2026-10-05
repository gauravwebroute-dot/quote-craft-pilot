import { createHash } from 'node:crypto';
import { createQuoteStore as createSqliteQuoteStore } from './quoteStoreSqlite.js';
import { createQuoteStore as createSupabaseQuoteStore } from './quoteStoreSupabase.js';

// Kept for backwards compatibility and tests: the local SQLite implementation
// (synchronous). Route handlers `await` every store call, so they work with
// both this and the Supabase implementation (asynchronous).
export const createQuoteStore = createSqliteQuoteStore;
export { createSupabaseQuoteStore };

function selectDefaultStore() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    console.log('[quoteStore] Using Supabase (persistent) storage.');
    return createSupabaseQuoteStore();
  }
  console.error(
    '[quoteStore] WARNING: SUPABASE_URL / SUPABASE_KEY not set - falling back to local SQLite. ' +
      'On Render free tier this file is wiped on every restart, so saved quotes WILL disappear. ' +
      'Set both environment variables to enable persistent storage.',
  );
  return createSqliteQuoteStore();
}

export const defaultQuoteStore = selectDefaultStore();

export const hashPayload = (value) =>
  createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex');
