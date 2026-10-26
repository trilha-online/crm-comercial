-- =====================================================================
-- CRM Comercial — nomes das colunas editáveis (26/10/2026)
-- Rodar UMA vez no SQL Editor do Supabase do CRM, ANTES de publicar o código.
-- Pode rodar de novo sem problema (não sobrescreve nomes já trocados).
--
-- Cada coluna continua com o mesmo id e o mesmo papel no sistema
-- (perdido pede motivo, fechado alimenta o número "Fechado" etc.).
-- Só o NOME que aparece na tela passa a vir daqui.
-- =====================================================================

create table if not exists public.etapa (
  id             text primary key check (id in
                   ('mapeadas','contato','feito','reuniao','negociacao','fechado','perdido')),
  nome           text not null check (length(btrim(nome)) between 1 and 40),
  ordem          int  not null,
  atualizado_em  timestamptz
);

-- Dois nomes iguais deixariam o histórico ambíguo.
create unique index if not exists etapa_nome_unico on public.etapa (lower(btrim(nome)));

insert into public.etapa (id, nome, ordem) values
  ('mapeadas',   'Mapeadas',               1),
  ('contato',    'Fazer primeiro contato', 2),
  ('feito',      'Contato feito',          3),
  ('reuniao',    'Reunião agendada',       4),
  ('negociacao', 'Negociação',             5),
  ('fechado',    'Fechado',                6),
  ('perdido',    'Perdido',                7)
on conflict (id) do nothing;

alter table public.etapa enable row level security;
revoke all on public.etapa from anon;
grant select, update (nome, atualizado_em) on public.etapa to authenticated;

drop policy if exists "crm autorizado le" on public.etapa;
create policy "crm autorizado le" on public.etapa
  for select to authenticated using (public.crm_autorizado());

drop policy if exists "crm autorizado renomeia" on public.etapa;
create policy "crm autorizado renomeia" on public.etapa
  for update to authenticated
  using (public.crm_autorizado()) with check (public.crm_autorizado());

-- ---------- Renomear: coluna + histórico, tudo ou nada ----------
-- Troca o nome e, no mesmo passo, reescreve as notas automáticas
-- "Movida de “Antigo” para “X”". Só mexe na parte antes de " · "
-- (depois dela vem o motivo da perda, que é texto do usuário).
create or replace function public.renomear_etapa(p_id text, p_nome text)
returns public.etapa
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_antigo text;
  v_novo   text := btrim(coalesce(p_nome, ''));
  v_linha  public.etapa;
begin
  if not public.crm_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if length(v_novo) = 0 or length(v_novo) > 40 then
    raise exception 'O nome precisa ter de 1 a 40 caracteres' using errcode = '22023';
  end if;

  select nome into v_antigo from public.etapa where id = p_id for update;
  if not found then
    raise exception 'Coluna não encontrada' using errcode = 'P0002';
  end if;

  if v_antigo = v_novo then
    select * into v_linha from public.etapa where id = p_id;
    return v_linha;
  end if;

  if exists (select 1 from public.etapa
             where lower(btrim(nome)) = lower(v_novo) and id <> p_id) then
    raise exception 'Já existe uma coluna com esse nome' using errcode = '23505';
  end if;

  update public.etapa set nome = v_novo, atualizado_em = now()
  where id = p_id
  returning * into v_linha;

  update public.incorporadora i
  set historico = (
    select jsonb_agg(
      case
        when coalesce((h->>'auto')::boolean, false)
             and (h->>'texto') like 'Movida de “%'
        then jsonb_set(h, '{texto}', to_jsonb(
               replace(split_part(h->>'texto', ' · ', 1),
                       '“' || v_antigo || '”', '“' || v_novo || '”')
               || case when position(' · ' in h->>'texto') > 0
                       then substr(h->>'texto', position(' · ' in h->>'texto'))
                       else '' end))
        else h
      end
      order by ord)
    from jsonb_array_elements(i.historico) with ordinality as t(h, ord)
  )
  where exists (
    select 1 from jsonb_array_elements(i.historico) h
    where coalesce((h->>'auto')::boolean, false)
      and position('“' || v_antigo || '”' in split_part(h->>'texto', ' · ', 1)) > 0
  );

  return v_linha;
end;
$$;

revoke all on function public.renomear_etapa(text, text) from public, anon;
grant execute on function public.renomear_etapa(text, text) to authenticated;

-- Tempo real: outra aba aberta vê o nome novo na hora.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'etapa') then
    alter publication supabase_realtime add table public.etapa;
  end if;
end $$;

-- ---------- Conferência: as 7 colunas, na ordem ----------
select ordem, id, nome from public.etapa order by ordem;
