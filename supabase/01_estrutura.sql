-- =====================================================================
-- CRM Comercial da Trilha — estrutura do banco
-- Rodar UMA vez no SQL Editor do Supabase do CRM (não é o banco do painel).
-- Pode rodar de novo sem quebrar nada: tudo usa "if not exists".
--
-- Cada tabela espelha uma coleção do artefato antigo:
--   incorporadora  ← "incorporadoras"  (empreendimentos e histórico ficam
--                                       dentro do card, como no artefato)
--   kit_mensagem   ← "kit_mensagens"
--   kit_material   ← "kit_materiais"   (arquivos vão para o bucket "kit-materiais")
-- =====================================================================

-- ---------- Quem pode entrar ----------
-- Só os e-mails desta lista enxergam ou editam qualquer coisa.
-- Para dar acesso a mais alguém no futuro:
--   insert into public.usuario_autorizado (email) values ('fulano@trilha.online');
create table if not exists public.usuario_autorizado (
  email      text primary key check (email = lower(email)),
  criado_em  timestamptz not null default now()
);

insert into public.usuario_autorizado (email)
values ('contato@trilha.online')
on conflict (email) do nothing;

create or replace function public.crm_autorizado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuario_autorizado
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.crm_autorizado() from public, anon;
grant execute on function public.crm_autorizado() to authenticated;

-- ---------- Incorporadoras (os cards do funil) ----------
create table if not exists public.incorporadora (
  id               text primary key,               -- slug, ex.: "4t-construtora"
  nome             text not null check (length(trim(nome)) > 0),
  uf               text not null check (uf ~ '^[A-Z]{2}$'),
  etapa            text not null default 'mapeadas' check (etapa in
                     ('mapeadas','contato','feito','reuniao','negociacao','fechado','perdido')),
  prioridade       boolean not null default false,
  -- [{nome, cidade, total, estoque}]
  empreendimentos  jsonb not null default '[]'::jsonb check (jsonb_typeof(empreendimentos) = 'array'),
  -- [{data: "AAAA-MM-DD", texto, auto?}]
  historico        jsonb not null default '[]'::jsonb check (jsonb_typeof(historico) = 'array'),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz
);

create index if not exists incorporadora_etapa_idx on public.incorporadora (etapa);

-- ---------- Kit comercial: mensagens prontas ----------
create table if not exists public.kit_mensagem (
  id             text primary key default replace(gen_random_uuid()::text, '-', ''),
  titulo         text not null check (length(trim(titulo)) > 0),
  texto          text not null check (length(trim(texto)) > 0),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz
);

-- ---------- Kit comercial: materiais (links ou arquivos) ----------
create table if not exists public.kit_material (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  nome          text not null check (length(trim(nome)) > 0),
  tipo          text not null check (tipo in ('link','arquivo')),
  url           text,          -- quando tipo = 'link'
  arquivo_path  text,          -- caminho no bucket, quando tipo = 'arquivo'
  content_type  text,
  tamanho       bigint,
  arquivo       text,          -- nome original do arquivo enviado
  criado_em     timestamptz not null default now(),
  check (
    (tipo = 'link'    and url is not null) or
    (tipo = 'arquivo' and arquivo_path is not null)
  )
);

-- ---------- Segurança (RLS): só quem está na lista ----------
alter table public.usuario_autorizado enable row level security;
alter table public.incorporadora      enable row level security;
alter table public.kit_mensagem       enable row level security;
alter table public.kit_material       enable row level security;

revoke all on public.usuario_autorizado, public.incorporadora,
              public.kit_mensagem, public.kit_material from anon;
grant select, insert, update, delete on public.incorporadora,
              public.kit_mensagem, public.kit_material to authenticated;
grant select on public.usuario_autorizado to authenticated;

drop policy if exists "autorizado le a propria linha" on public.usuario_autorizado;
create policy "autorizado le a propria linha" on public.usuario_autorizado
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "crm autorizado" on public.incorporadora;
create policy "crm autorizado" on public.incorporadora
  for all to authenticated
  using (public.crm_autorizado()) with check (public.crm_autorizado());

drop policy if exists "crm autorizado" on public.kit_mensagem;
create policy "crm autorizado" on public.kit_mensagem
  for all to authenticated
  using (public.crm_autorizado()) with check (public.crm_autorizado());

drop policy if exists "crm autorizado" on public.kit_material;
create policy "crm autorizado" on public.kit_material
  for all to authenticated
  using (public.crm_autorizado()) with check (public.crm_autorizado());

-- ---------- Arquivos do kit (bucket privado, até 20 MB) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kit-materiais', 'kit-materiais', false, 20971520,
        array['application/pdf','image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do nothing;

drop policy if exists "crm kit le" on storage.objects;
create policy "crm kit le" on storage.objects
  for select to authenticated
  using (bucket_id = 'kit-materiais' and public.crm_autorizado());

drop policy if exists "crm kit envia" on storage.objects;
create policy "crm kit envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kit-materiais' and public.crm_autorizado());

drop policy if exists "crm kit apaga" on storage.objects;
create policy "crm kit apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kit-materiais' and public.crm_autorizado());

-- ---------- Tempo real (duas abas abertas ficam sincronizadas) ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['incorporadora','kit_mensagem','kit_material'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
