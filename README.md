# CRM Comercial — Funil de Incorporadoras

CRM da Trilha para a prospecção de incorporadoras com estoque pronto.
É a mesma tela do artefato "Funil de Incorporadoras" do claude.ai, agora com banco próprio no Supabase.

- **Tela:** Vite + JavaScript puro (o código do artefato, sem reescrever)
- **Banco, login e arquivos:** Supabase (projeto só do CRM, separado do painel)
- **Publicação:** Vercel → `crm.trilha.online`

## Rodar no computador

1. Copie `.env.example` para `.env.local` e cole a **Project URL** e a **anon key** do Supabase do CRM.
2. No terminal, dentro da pasta:
   ```
   npm install
   npm run dev
   ```
3. Abra o endereço que aparecer (normalmente http://localhost:5173).

## Banco (uma vez só)

No SQL Editor do Supabase do CRM, nesta ordem:

1. `supabase/01_estrutura.sql` — cria as tabelas, as regras de acesso e o bucket dos arquivos do kit.
2. `supabase/02_carga_dados.sql` — traz os dados do artefato. No fim ele mostra os totais para conferir.

## Quem pode entrar

Só os e-mails da tabela `usuario_autorizado` (hoje, `contato@trilha.online`).
O usuário é criado no Supabase em **Authentication → Users → Add user** (marcar *Auto Confirm User*).
Para liberar outra pessoa no futuro: criar o usuário lá **e** rodar
`insert into public.usuario_autorizado (email) values ('pessoa@trilha.online');`

## Onde fica cada coisa

| Arquivo | O que é |
|---|---|
| `index.html` | A estrutura da tela (igual ao artefato) + a tela de entrada |
| `src/style.css` | O visual (igual ao artefato) |
| `src/app.js` | O comportamento do quadro, da gaveta e do kit (igual ao artefato) |
| `src/dados.js` | Onde os dados são lidos e gravados no Supabase |
| `src/main.js` | Entrada e saída (login) |
| `supabase/` | Os SQL do banco |

## Backup

O plano gratuito do Supabase não faz backup automático. Para guardar uma cópia:
**Table Editor → incorporadora → Export → CSV** (repetir para `kit_mensagem` e `kit_material`).
