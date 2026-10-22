-- A 영역: 마이페이지 — 본인 이름(실명) 수정
-- profiles 수정은 관리자만 가능하므로, 본인은 이 함수로 이름만 바꾼다.
create or replace function public.update_my_profile(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
begin
  if (select auth.uid()) is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 30 then
    raise exception '이름은 2~30자로 입력하세요.' using errcode = '22023';
  end if;
  update public.profiles set name = v_name where id = (select auth.uid()) and is_active;
end;
$$;

revoke execute on function public.update_my_profile(text) from public, anon;
grant execute on function public.update_my_profile(text) to authenticated;
