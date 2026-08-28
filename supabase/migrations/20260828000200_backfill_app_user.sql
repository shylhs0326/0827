insert into core.app_user (user_id, email, name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'name', '')
from auth.users
on conflict (user_id) do nothing;
