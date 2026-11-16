-- Supabase SQL Editor에 붙여 넣고 실행하세요. (v2: 사용자별 분리)
-- 주의: 이전 버전의 checkins 표(로그인 없던 시절 시험 데이터)는 지워집니다.
drop table if exists public.checkins;

create table public.checkins (
  user_id uuid not null references auth.users(id) on delete cascade,   -- 탈퇴하면 함께 삭제
  day date not null,
  symptoms jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.checkins enable row level security;

-- 서버는 service_role 키로 접근하므로 RLS를 건너뜁니다. 아래 정책은 '이중 안전장치'로,
-- 혹시 브라우저에서 anon/로그인 키로 직접 접근하더라도 자기 행만 보이게 합니다.
create policy "checkins_select_own" on public.checkins for select to authenticated using (auth.uid() = user_id);
create policy "checkins_insert_own" on public.checkins for insert to authenticated with check (auth.uid() = user_id);
create policy "checkins_update_own" on public.checkins for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "checkins_delete_own" on public.checkins for delete to authenticated using (auth.uid() = user_id);
