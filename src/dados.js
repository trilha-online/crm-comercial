// Camada de dados do CRM.
// Imita a interface do banco do artefato antigo (collection/doc/set/add/delete/onSnapshot
// e assets.upload/delete), mas grava no Supabase. Assim a tela (app.js) ficou igual à
// do artefato, só trocando de onde os dados vêm.
import { supabase } from "./supabase.js";

const BUCKET = "kit-materiais";
const URL_VALIDADE_S = 12 * 3600; // links assinados dos arquivos do kit valem 12 h

const semVazios = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// Cada coleção do artefato → uma tabela, com a conversão de nomes de campo.
const COLECOES = {
  incorporadoras: {
    tabela: "incorporadora",
    paraLinha: (id, d) =>
      semVazios({
        id,
        nome: d.nome,
        uf: d.uf,
        etapa: d.etapa,
        prioridade: !!d.prioridade,
        empreendimentos: d.empreendimentos || [],
        historico: d.historico || [],
        criado_em: d.criadoEm,
        atualizado_em: d.atualizadoEm ?? null,
      }),
    deLinha: (r) => ({
      nome: r.nome,
      uf: r.uf,
      etapa: r.etapa,
      prioridade: r.prioridade,
      empreendimentos: r.empreendimentos || [],
      historico: r.historico || [],
      criadoEm: r.criado_em,
      atualizadoEm: r.atualizado_em,
    }),
  },
  kit_mensagens: {
    tabela: "kit_mensagem",
    paraLinha: (id, d) =>
      semVazios({ id, titulo: d.titulo, texto: d.texto, criado_em: d.criadoEm, atualizado_em: d.atualizadoEm ?? null }),
    deLinha: (r) => ({ titulo: r.titulo, texto: r.texto, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em }),
  },
  kit_materiais: {
    tabela: "kit_material",
    paraLinha: (id, d) =>
      semVazios({
        id,
        nome: d.nome,
        tipo: d.tipo,
        url: d.url ?? null,
        arquivo_path: d.assetId ?? null,
        content_type: d.contentType ?? null,
        tamanho: d.tamanho ?? null,
        arquivo: d.arquivo ?? null,
        criado_em: d.criadoEm,
      }),
    deLinha: (r) =>
      semVazios({
        nome: r.nome,
        tipo: r.tipo,
        url: r.url ?? undefined,
        assetId: r.arquivo_path ?? undefined,
        contentType: r.content_type ?? undefined,
        tamanho: r.tamanho ?? undefined,
        arquivo: r.arquivo ?? undefined,
        criadoEm: r.criado_em,
      }),
  },
};

// Traduz erros do Supabase para os códigos que a tela já sabe mostrar.
function erro(e) {
  const err = new Error(e?.message || "erro");
  if (e?.code === "42501") err.code = "invalid_argument"; // sem permissão (RLS)
  else if (e?.code === "53100" || e?.code === "54000") err.code = "quota_exceeded";
  else err.code = e?.code || "unknown";
  return err;
}

// Links assinados para abrir arquivos do bucket privado.
const urls = new Map(); // path -> { url, ate }
async function assinar(paths) {
  const agora = Date.now();
  const faltam = paths.filter((p) => !(urls.get(p)?.ate > agora + 3600e3));
  if (faltam.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(faltam, URL_VALIDADE_S);
    if (!error)
      (data || []).forEach((s) => {
        if (s.signedUrl) urls.set(s.path, { url: s.signedUrl, ate: agora + URL_VALIDADE_S * 1000 });
      });
  }
}

const lojas = new Map();

function loja(nome) {
  if (lojas.has(nome)) return lojas.get(nome);
  const cfg = COLECOES[nome];
  if (!cfg) throw new Error("Coleção desconhecida: " + nome);
  const l = { nome, cfg, cache: new Map(), ouvintes: new Set(), carregou: false, canal: null };

  l.emitir = async () => {
    if (nome === "kit_materiais") {
      const paths = [...l.cache.values()].filter((m) => m.tipo === "arquivo" && m.assetId).map((m) => m.assetId);
      if (paths.length) await assinar(paths);
    }
    const docs = [...l.cache.entries()].map(([id, v]) => {
      const dados = nome === "kit_materiais" && v.assetId ? { ...v, _href: urls.get(v.assetId)?.url } : v;
      return { id, data: () => ({ ...dados }) };
    });
    l.ouvintes.forEach((o) => o.ok({ docs }));
  };

  l.aplicar = (linha) => l.cache.set(linha.id, cfg.deLinha(linha));

  l.carregar = async () => {
    const { data, error } = await supabase.from(cfg.tabela).select("*").range(0, 4999);
    if (error) throw erro(error);
    l.cache = new Map();
    (data || []).forEach(l.aplicar);
    l.carregou = true;
    await l.emitir();
  };

  l.ouvirMudancas = () => {
    if (l.canal) return;
    l.canal = supabase
      .channel("crm-" + cfg.tabela)
      .on("postgres_changes", { event: "*", schema: "public", table: cfg.tabela }, (p) => {
        if (p.eventType === "DELETE") l.cache.delete(p.old?.id);
        else if (p.new?.id) l.aplicar(p.new);
        l.emitir();
      })
      .subscribe();
  };

  lojas.set(nome, l);
  return l;
}

// Ao voltar para a aba depois de um tempo (ex.: notebook dormiu), recarrega tudo
// para não ficar com dado velho caso alguma mudança em tempo real tenha se perdido.
let escondidoEm = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    escondidoEm = Date.now();
    return;
  }
  if (escondidoEm && Date.now() - escondidoEm > 60e3)
    lojas.forEach((l) => l.carregou && l.carregar().catch(() => {}));
});

export const db = {
  collection(nome) {
    const l = loja(nome);
    const { tabela, paraLinha } = l.cfg;
    return {
      doc(id) {
        return {
          async set(dados) {
            const { data, error } = await supabase
              .from(tabela)
              .upsert(paraLinha(id, dados), { onConflict: "id" })
              .select()
              .single();
            if (error) throw erro(error);
            l.aplicar(data);
            await l.emitir();
          },
          async delete() {
            const { error } = await supabase.from(tabela).delete().eq("id", id);
            if (error) throw erro(error);
            l.cache.delete(id);
            await l.emitir();
          },
        };
      },
      async add(dados) {
        const linha = paraLinha(undefined, dados);
        delete linha.id;
        const { data, error } = await supabase.from(tabela).insert(linha).select().single();
        if (error) throw erro(error);
        l.aplicar(data);
        await l.emitir();
        return { id: data.id };
      },
      onSnapshot(ok, falhou) {
        const o = { ok, falhou };
        l.ouvintes.add(o);
        if (l.carregou) l.emitir();
        else
          l.carregar()
            .then(() => l.ouvirMudancas())
            .catch((e) => falhou && falhou(e));
        return () => l.ouvintes.delete(o);
      },
    };
  },
};

export const assets = {
  async upload(arquivo, { type }) {
    const ext = (arquivo.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: type, upsert: false });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      const e = new Error(error.message);
      e.code =
        msg.includes("exceeded the maximum") || msg.includes("too large") || error.statusCode === "413"
          ? "too_large"
          : msg.includes("mime") || msg.includes("not supported")
            ? "unsupported_type"
            : msg.includes("quota")
              ? "quota_or_state"
              : "unknown";
      throw e;
    }
    return { id: path, contentType: type, sizeBytes: arquivo.size };
  },
  async delete(path) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw new Error(error.message);
    urls.delete(path);
  },
};
