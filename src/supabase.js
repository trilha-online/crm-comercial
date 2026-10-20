import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !chave) {
  document.body.innerHTML =
    '<p style="font:15px system-ui;padding:24px">Faltam as chaves do Supabase. Copie o arquivo <b>.env.example</b> para <b>.env.local</b>, preencha as duas linhas e rode <b>npm run dev</b> de novo.</p>';
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas");
}

export const supabase = createClient(url, chave, {
  auth: { persistSession: true, autoRefreshToken: true },
});
