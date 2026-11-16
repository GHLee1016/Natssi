-- Supabase SQL Editor에 붙여 넣고 실행하세요.
create table if not exists public.checkins (
  day date primary key,
  symptoms jsonb not null,
  updated_at timestamptz not null default now()
);

-- 브라우저에서 직접 읽고 쓰지 못하게 막습니다.
-- 서버만 service_role 키로 접근합니다(이 키는 RLS를 건너뜁니다).
alter table public.checkins enable row level security;
