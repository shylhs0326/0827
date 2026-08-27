import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseEnv } from './env.ts';

test('accepts the legacy anon key when publishable key is absent', () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousPublishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const previousAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'legacy-anon-key';

  assert.deepEqual(getSupabaseEnv(), {
    url: 'https://example.supabase.co',
    publishableKey: 'legacy-anon-key',
  });

  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousPublishable === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousPublishable;
  if (previousAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousAnon;
});
