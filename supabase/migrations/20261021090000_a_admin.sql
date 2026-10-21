-- A 영역: 관리자 화면용 함수 (설계서 §5.4)
-- teams.join_code 는 클라이언트 조회가 막혀 있으므로, 관리자만 이 함수들로 보고 바꾼다.

create or replace function public.admin_list_teams()
returns table (id uuid, name text, join_code text, member_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return query
    select t.id, t.name, t.join_code,
           (select count(*) from public.profiles p where p.team_id = t.id and p.is_active)
      from public.teams t
     order by t.join_code;
end;
$$;

create or replace function public.admin_set_join_code(p_team_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
begin
  if not public.is_admin() then
    raise exception '관리자만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Za-z0-9]{4,20}$' then
    raise exception '가입 코드는 영문·숫자 4~20자입니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.teams where join_code = v_code and id <> p_team_id) then
    raise exception '다른 부문이 이미 쓰는 코드입니다.' using errcode = '23505';
  end if;
  update public.teams set join_code = v_code where id = p_team_id;
end;
$$;

-- 관리자 본인은 비활성화할 수 없게 막는다 (잠김 방지)
create or replace function public.guard_self_deactivate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = (select auth.uid()) and old.is_active and not new.is_active then
    raise exception '본인 계정은 비활성화할 수 없습니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_self_deactivate before update of is_active on public.profiles
  for each row execute function public.guard_self_deactivate();

revoke execute on function public.admin_list_teams() from public, anon;
revoke execute on function public.admin_set_join_code(uuid, text) from public, anon;
grant execute on function public.admin_list_teams() to authenticated;
grant execute on function public.admin_set_join_code(uuid, text) to authenticated;
