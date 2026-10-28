-- A 영역: 실적 리포트가 부문 단위로 변경 이력을 읽는다 (수주·실주 시점 계산)
create index activity_log_team_entity_created_idx on public.activity_log (team_id, entity_type, created_at);
