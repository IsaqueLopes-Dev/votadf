alter table public.profiles
  add column if not exists email text null,
  add column if not exists cpf text null,
  add column if not exists role text null default 'user';

create unique index if not exists profiles_email_key
  on public.profiles (lower(email))
  where email is not null;

create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

create unique index if not exists profiles_cpf_key
  on public.profiles (cpf)
  where cpf is not null;

update public.profiles p
set
  email = coalesce(p.email, u.email),
  username = coalesce(p.username, u.username),
  full_name = coalesce(p.full_name, u.username),
  cpf = coalesce(p.cpf, u.cpf),
  birth_date = coalesce(p.birth_date, u.birth_date),
  avatar_url = coalesce(p.avatar_url, u.avatar_url),
  role = coalesce(p.role, u.role, 'user'),
  updated_at = timezone('utc'::text, now())
from public.users u
where p.id = u.id;

insert into public.profiles (
  id,
  updated_at,
  email,
  username,
  full_name,
  cpf,
  birth_date,
  avatar_url,
  role
)
select
  u.id,
  timezone('utc'::text, now()),
  u.email,
  u.username,
  u.username,
  u.cpf,
  u.birth_date,
  u.avatar_url,
  coalesce(u.role, 'user')
from public.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);
