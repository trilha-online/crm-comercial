-- =====================================================================
-- CRM Comercial — sincroniza o que foi feito no ARTEFATO em 21/10/2026
-- (motivo de perda testado no artefato depois da migração).
-- Rodar UMA vez, DEPOIS do 03_motivo_perda.sql.
-- Só mexe nesses cards; não apaga nada que tenha sido feito no CRM novo.
-- Se rodar duas vezes, o histórico não duplica (cada nota só entra se não existir).
-- =====================================================================
begin;

-- LMR: etapa perdido, motivo socios
update public.incorporadora set
  etapa = 'perdido',
  perda = '{"data": "2026-10-21", "motivo": "socios"}'::jsonb,
  atualizado_em = '2026-10-21T12:07:12.425Z'
where id = 'lmr';
update public.incorporadora set historico = historico || jsonb_build_array('{"auto": true, "data": "2026-10-21", "texto": "Motivo da perda: Travou na passagem para os sócios"}'::jsonb)
where id = 'lmr' and not historico @> jsonb_build_array('{"auto": true, "data": "2026-10-21", "texto": "Motivo da perda: Travou na passagem para os sócios"}'::jsonb);

-- Solidi: etapa perdido, motivo modelo
update public.incorporadora set
  etapa = 'perdido',
  perda = '{"data": "2026-10-21", "detalhe": "Justificou que não acredita queo problema seja o valor de entrada.Não deu muita conversa também, fizemos uma chamada rápida apenas e ele ficou de pensar e depois nunca mais me deu atenção .", "motivo": "modelo"}'::jsonb,
  atualizado_em = '2026-10-21T12:10:48.518Z'
where id = 'solidi';
update public.incorporadora set historico = historico || jsonb_build_array('{"auto": true, "data": "2026-10-21", "texto": "Movida de “Negociação” para “Perdido” · Motivo: Não topou o modelo da Trilha (Justificou que não acredita queo problema seja o valor de entrada.Não deu muita conversa também, fizemos uma chamada rápida apenas e ele ficou de pensar e depois nunca mais me deu atenção .)"}'::jsonb)
where id = 'solidi' and not historico @> jsonb_build_array('{"auto": true, "data": "2026-10-21", "texto": "Movida de “Negociação” para “Perdido” · Motivo: Não topou o modelo da Trilha (Justificou que não acredita queo problema seja o valor de entrada.Não deu muita conversa também, fizemos uma chamada rápida apenas e ele ficou de pensar e depois nunca mais me deu atenção .)"}'::jsonb);

-- 4T Construtora e Durafa foram EXCLUÍDAS no artefato.
-- Só tire os "--" das duas linhas abaixo se a exclusão foi de propósito:
-- delete from public.incorporadora where id = '4t-construtora';
-- delete from public.incorporadora where id = 'durafa';

commit;

-- Conferência
select id, nome, etapa, perda->>'motivo' as motivo
from public.incorporadora
where id in ('lmr','solidi','4t-construtora','durafa')
order by id;
