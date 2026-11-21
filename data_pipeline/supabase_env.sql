-- 환경 데이터 표. Supabase SQL Editor에서 한 번 실행. (기존 checkins·routines 표는 건드리지 않음)

-- 1) 서울 25개 구 일별 환경 값 (공공데이터라 개인정보 없음). scripts/update_env.py가 매일 채운다.
create table if not exists public.env_daily (
  district  text not null,              -- '서대문구' (에어코리아 측정소 이름 = 자치구)
  date      date not null,
  pm10      real,                       -- 일평균 ㎍/㎥
  pm25      real,
  temp_avg  real,                       -- 기상청 ASOS 서울(108) 일평균 기온 ℃ (서울 공통)
  humid_avg real,                       -- 일평균 상대습도 %
  pm_source text,                       -- 'district' | 'seoul_median'(측정소 점검일이라 서울 중앙값으로 채움)
  primary key (district, date)
);
alter table public.env_daily enable row level security;
-- 누구나 읽기만 (쓰기는 service_role 키로만 → 정책 없음 = 차단)
drop policy if exists "env_daily_read" on public.env_daily;
create policy "env_daily_read" on public.env_daily for select to anon, authenticated using (true);

-- 2) 사용자가 사는 구. 가입 후 '내 계정'에서 고르게 한다 (선택 사항: 안 고르면 환경 비교를 하지 않음)
create table if not exists public.profiles (
  user_id  uuid primary key references auth.users(id) on delete cascade,   -- 탈퇴하면 함께 삭제
  district text check (district in (
    '강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구',
    '동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구',
    '용산구','은평구','종로구','중구','중랑구')),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_upsert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_upsert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
