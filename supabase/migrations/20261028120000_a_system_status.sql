-- A 영역: 관리자 '시스템 상태' — DB 자동 반영 점검과 토큰 만료일 기록
-- (2026-10-28 GitHub 의 Supabase 토큰이 조용히 만료돼 마이그레이션이 멈춘 일의 재발 방지)

-- 앱 전체 설정 (관리자만 읽고 쓴다). 지금은 supabase_token_expires_on (YYYY-MM-DD) 하나
create table public.app_settings (
  key         text primary key check (key in ('supabase_token_expires_on')),
  value       text check (value is null or length(value) <= 100),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now()
);
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select, insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

create policy app_settings_select on public.app_settings for select to authenticated using (public.is_admin());
create policy app_settings_insert on public.app_settings for insert to authenticated with check (public.is_admin());
create policy app_settings_update on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 운영 DB 에 적용된 최신 마이그레이션 버전 (관리자만). supabase_migrations 스키마는 앱에서 직접 못 읽으므로 함수로
create function public.admin_system_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'latest_migration', (select max(version) from supabase_migrations.schema_migrations),
    'supabase_token_expires_on', (select value from public.app_settings where key = 'supabase_token_expires_on')
  );
end;
$$;
revoke execute on function public.admin_system_status() from public, anon;
grant execute on function public.admin_system_status() to authenticated;
