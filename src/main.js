import "./style.css";
import { supabase } from "./supabase.js";

const $ = (s) => document.querySelector(s);

function mostrarLogin(msg) {
  $("#app").hidden = true;
  $("#login").hidden = false;
  const e = $("#loginErro");
  e.textContent = msg || "";
  e.hidden = !msg;
  $("#loginEmail").focus();
}

let iniciado = false;
async function abrirCrm() {
  if (iniciado) return;
  // Confere se o e-mail logado está na lista de autorizados antes de abrir.
  const { data, error } = await supabase.from("usuario_autorizado").select("email").limit(1);
  if (error || !data?.length) {
    await supabase.auth.signOut();
    mostrarLogin(error ? "Não foi possível conferir o acesso. Tente de novo." : "Este e-mail não tem acesso ao CRM.");
    return;
  }
  iniciado = true;
  const { db, assets } = await import("./dados.js");
  window.crm = { use: async (nome) => (nome === "db" ? db : nome === "assets" ? assets : null) };
  $("#login").hidden = true;
  $("#app").hidden = false;
  await import("./app.js");
}

// Olhinho para mostrar/esconder a senha
const OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OLHO_FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.6 3.5M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';
const olho = $("#olhoSenha");
olho.innerHTML = OLHO;
olho.addEventListener("click", () => {
  const campo = $("#loginSenha");
  const mostrar = campo.type === "password";
  campo.type = mostrar ? "text" : "password";
  olho.innerHTML = mostrar ? OLHO_FECHADO : OLHO;
  olho.setAttribute("aria-pressed", String(mostrar));
  olho.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
  olho.title = mostrar ? "Esconder senha" : "Mostrar senha";
  campo.focus();
});

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn");
  btn.disabled = true;
  btn.textContent = "Entrando…";
  const { error } = await supabase.auth.signInWithPassword({
    email: $("#loginEmail").value.trim(),
    password: $("#loginSenha").value,
  });
  btn.disabled = false;
  btn.textContent = "Entrar";
  if (error) {
    mostrarLogin(
      /invalid login/i.test(error.message)
        ? "E-mail ou senha incorretos."
        : "Não foi possível entrar. Verifique a conexão e tente de novo."
    );
    return;
  }
  abrirCrm();
});

$("#btnSair").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

// Se a sessão acabar (ex.: saiu em outra aba), volta para a tela de entrada.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === "SIGNED_OUT" && iniciado) location.reload();
});

const { data } = await supabase.auth.getSession();
if (data.session) abrirCrm();
else mostrarLogin();
