import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260904000000_create_agent_conversations.sql', 'utf8');

test('creates conversation and message tables with the operational fields', () => {
  assert.match(migration, /create table if not exists core\.agent_conversation/);
  assert.match(migration, /user_id uuid.*references auth\.users/);
  assert.match(migration, /user_email text/);
  assert.match(migration, /title text/);
  assert.match(migration, /started_at timestamptz/);
  assert.match(migration, /last_at timestamptz/);
  assert.match(migration, /create table if not exists core\.agent_message/);
  for (const field of ['role', 'content', 'answer jsonb', 'tool_trace jsonb', 'usage jsonb', 'guardrail jsonb', 'created_at timestamptz']) {
    assert.match(migration, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('RLS is fail-closed for owner access and admin read access', () => {
  assert.match(migration, /alter table core\.agent_conversation enable row level security/);
  assert.match(migration, /alter table core\.agent_message enable row level security/);
  assert.match(migration, /user_id = auth\.uid\(\) or core\.is_admin\(\)/);
  assert.match(migration, /core\.is_active_user\(\) and user_id = auth\.uid\(\)/);
  assert.match(migration, /agent_conversation\.id = agent_message\.conversation_id/);
  assert.match(migration, /revoke all .*agent_conversation.* from anon/);
});

test('save RPC stores question and answer in one database function', () => {
  assert.match(migration, /create or replace function core\.save_agent_turn/);
  assert.match(migration, /insert into core\.agent_conversation/);
  assert.match(migration, /insert into core\.agent_message[\s\S]*'user'/);
  assert.match(migration, /insert into core\.agent_message[\s\S]*'assistant'/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /grant execute on function core\.save_agent_turn/);
});
