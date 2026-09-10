create table if not exists core.agent_conversation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  title text not null,
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);

create table if not exists core.agent_message (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references core.agent_conversation(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null,
  answer jsonb,
  tool_trace jsonb,
  usage jsonb,
  guardrail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_conversation_user_last_idx on core.agent_conversation(user_id, last_at desc);
create index if not exists agent_message_conversation_created_idx on core.agent_message(conversation_id, created_at);

alter table core.agent_conversation enable row level security;
alter table core.agent_message enable row level security;

revoke all on core.agent_conversation, core.agent_message from anon;
revoke all on core.agent_conversation, core.agent_message from public;
grant select, insert on core.agent_conversation to authenticated;
grant select, insert on core.agent_message to authenticated;

drop policy if exists agent_conversation_owner_select on core.agent_conversation;
create policy agent_conversation_owner_select on core.agent_conversation
  for select to authenticated
  using (core.is_active_user() and (user_id = auth.uid() or core.is_admin()));

drop policy if exists agent_conversation_owner_insert on core.agent_conversation;
create policy agent_conversation_owner_insert on core.agent_conversation
  for insert to authenticated
  with check (core.is_active_user() and user_id = auth.uid());

drop policy if exists agent_message_owner_select on core.agent_message;
create policy agent_message_owner_select on core.agent_message
  for select to authenticated
  using (
    core.is_active_user()
    and exists (
      select 1
      from core.agent_conversation
      where agent_conversation.id = agent_message.conversation_id
        and (agent_conversation.user_id = auth.uid() or core.is_admin())
    )
  );

drop policy if exists agent_message_owner_insert on core.agent_message;
create policy agent_message_owner_insert on core.agent_message
  for insert to authenticated
  with check (
    core.is_active_user()
    and exists (
      select 1
      from core.agent_conversation
      where agent_conversation.id = agent_message.conversation_id
        and agent_conversation.user_id = auth.uid()
    )
  );

create or replace function core.save_agent_turn(
  p_title text,
  p_question text,
  p_answer jsonb,
  p_tool_trace jsonb default '[]'::jsonb,
  p_usage jsonb default null,
  p_guardrail jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_conversation_id uuid;
begin
  if v_user_id is null or not core.is_active_user() then
    raise exception 'AGENT_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select email into v_user_email from core.app_user where user_id = v_user_id and active = true;
  if v_user_email is null then
    raise exception 'AGENT_USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into core.agent_conversation(user_id, user_email, title)
  values (v_user_id, v_user_email, coalesce(nullif(btrim(p_title), ''), left(p_question, 80)))
  returning id into v_conversation_id;

  insert into core.agent_message(conversation_id, role, content)
  values (v_conversation_id, 'user', p_question);

  insert into core.agent_message(conversation_id, role, content, answer, tool_trace, usage, guardrail)
  values (v_conversation_id, 'assistant', coalesce(p_answer ->> 'answer', ''), p_answer, p_tool_trace, p_usage, p_guardrail);

  update core.agent_conversation set last_at = now() where id = v_conversation_id;
  return v_conversation_id;
end;
$$;

revoke all on function core.save_agent_turn(text, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function core.save_agent_turn(text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
