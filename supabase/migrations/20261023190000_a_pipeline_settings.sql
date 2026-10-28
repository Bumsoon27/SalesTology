-- A 영역: 부문별 파이프라인 설정 — 단계별 성사 확률(%)과 정체 기준일 (Salesforce 단계 확률 참고)
-- 행이 없으면 앱 기본값을 쓴다. 조회는 같은 부문(관리자는 전체), 변경은 관리자만.

create table public.team_pipeline_settings (
  team_id              uuid primary key references public.teams (id),
  -- {"discovery": 10, "quoting": 20, ...} 형태. 빠진 단계는 앱 기본값. 값 검증은 앱과 아래 체크 제약이 함께 한다
  stage_probabilities  jsonb not null default '{}'::jsonb check (jsonb_typeof(stage_probabilities) = 'object'),
  stale_after_days     int not null default 14 check (stale_after_days between 3 and 90),
  updated_by           uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at           timestamptz not null default now()
);

create trigger team_pipeline_settings_set_updated_at before update on public.team_pipeline_settings
  for each row execute function public.set_updated_at();

alter table public.team_pipeline_settings enable row level security;
revoke all on public.team_pipeline_settings from anon, authenticated;
grant select, insert, update on public.team_pipeline_settings to authenticated;
grant all on public.team_pipeline_settings to service_role;

create policy team_pipeline_settings_select on public.team_pipeline_settings for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
create policy team_pipeline_settings_insert on public.team_pipeline_settings for insert to authenticated
  with check (public.is_admin());
create policy team_pipeline_settings_update on public.team_pipeline_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
