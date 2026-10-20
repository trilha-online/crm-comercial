// Tela do CRM — portada do artefato "Funil de Incorporadoras" do claude.ai.
// O código abaixo é o mesmo do artefato; só mudou de onde vêm os dados
// (window.crm, montado em main.js com o Supabase, no lugar de window.claude).
const ETAPAS=[
  {id:"mapeadas",nome:"Mapeadas",cor:"var(--s-map)"},
  {id:"contato",nome:"Fazer primeiro contato",cor:"var(--s-con)"},
  {id:"feito",nome:"Contato feito",cor:"var(--s-fei)"},
  {id:"reuniao",nome:"Reunião agendada",cor:"var(--s-reu)"},
  {id:"negociacao",nome:"Negociação",cor:"var(--s-neg)"},
  {id:"fechado",nome:"Fechado",cor:"var(--s-fec)"},
  {id:"perdido",nome:"Perdido",cor:"var(--s-per)"}
];
const ATIVAS=["mapeadas","contato","feito","reuniao","negociacao"];
const UFS=["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const nomeEtapa=id=>(ETAPAS.find(e=>e.id===id)||ETAPAS[0]).nome;

let db=null, docs=new Map(), loaded=false, ufFiltro="todos", busca="", aberto=null, readOnly=false;
const writing=new Map();
const $=s=>document.querySelector(s);
const fmt=n=>(Number(n)||0).toLocaleString("pt-BR");
const estoqueDe=d=>(d.empreendimentos||[]).reduce((a,e)=>a+(Number(e.estoque)||0),0);
const hojeISO=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const dataBR=s=>{if(!s)return"";const [y,m,d]=s.slice(0,10).split("-");return `${d}/${m}/${y}`};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slug=s=>s.normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"inc";

function toast(msg,err){const t=$("#toast");t.textContent=msg;t.className="toast"+(err?" err":"");t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}

function filtrados(){
  const q=busca.trim().toLowerCase();
  return [...docs.values()].filter(d=>{
    if(ufFiltro!=="todos"&&d.uf!==ufFiltro)return false;
    if(!q)return true;
    return d.nome.toLowerCase().includes(q)||(d.empreendimentos||[]).some(e=>(e.nome||"").toLowerCase().includes(q)||(e.cidade||"").toLowerCase().includes(q));
  });
}

function renderStats(lista){
  const ativos=lista.filter(d=>ATIVAS.includes(d.etapa));
  const uAtivas=ativos.reduce((a,d)=>a+estoqueDe(d),0);
  const fech=lista.filter(d=>d.etapa==="fechado");
  const neg=lista.filter(d=>d.etapa==="negociacao"||d.etapa==="reuniao");
  $("#stats").innerHTML=`
    <div class="stat lead"><span class="k">Unidades em prospecção</span><span class="v">${fmt(uAtivas)}<small>de ${fmt(ativos.length)} incorporadoras</small></span></div>
    <div class="stat"><span class="k">Em reunião ou negociação</span><span class="v">${fmt(neg.reduce((a,d)=>a+estoqueDe(d),0))}<small>un. · ${neg.length} inc.</small></span></div>
    <div class="stat"><span class="k">Fechado</span><span class="v">${fmt(fech.reduce((a,d)=>a+estoqueDe(d),0))}<small>un. · ${fech.length} inc.</small></span></div>`;
}

function renderChips(){
  const cont={};docs.forEach(d=>cont[d.uf]=(cont[d.uf]||0)+1);
  const ufs=Object.keys(cont).sort();
  if(ufFiltro!=="todos"&&!cont[ufFiltro])ufFiltro="todos";
  $("#ufChips").innerHTML=[`<button class="chip" type="button" data-uf="todos" aria-pressed="${ufFiltro==="todos"}">Todos<span class="n">${docs.size}</span></button>`,
    ...ufs.map(u=>`<button class="chip" type="button" data-uf="${u}" aria-pressed="${ufFiltro===u}">${u}<span class="n">${cont[u]}</span></button>`)].join("");
}

function ultimaNota(d){const h=(d.historico||[]).filter(n=>!n.auto);return h.length?h[h.length-1]:null}

function renderBoard(){
  renderChips();
  const lista=filtrados();
  renderStats(lista);
  const box=$("#stateBox"),scroll=$("#boardScroll");
  if(!db){box.hidden=false;scroll.hidden=true;box.innerHTML=loaded?"<strong>Não foi possível abrir os dados</strong>Recarregue a página ou entre de novo para ver e editar o funil.":"<strong>Carregando o funil…</strong>As incorporadoras aparecem aqui assim que os dados chegam.";return}
  if(loaded&&docs.size===0){box.hidden=false;scroll.hidden=true;box.innerHTML="<strong>Nenhuma incorporadora ainda</strong>Use “+ Nova incorporadora” para criar o primeiro card.";return}
  box.hidden=true;scroll.hidden=false;
  $("#board").innerHTML=ETAPAS.map(et=>{
    const cs=lista.filter(d=>d.etapa===et.id).sort((a,b)=>(!!b.prioridade-!!a.prioridade)||estoqueDe(b)-estoqueDe(a)||a.nome.localeCompare(b.nome));
    const un=cs.reduce((a,d)=>a+estoqueDe(d),0);
    return `<section class="col" data-etapa="${et.id}" aria-label="${et.nome}">
      <div class="col-head"><div class="col-title"><span class="dot" style="background:${et.cor}"></span>${et.nome}<span class="count">${cs.length}</span></div>
      <div class="col-units"><b>${fmt(un)}</b> unidades em estoque</div></div>
      <div class="cards">${cs.length?cs.map(cardHTML).join(""):`<div class="empty-col">Arraste um card para cá</div>`}</div></section>`;
  }).join("");
}

function cardHTML(d){
  const n=ultimaNota(d),emps=(d.empreendimentos||[]).length;
  const p=!!d.prioridade;
  return `<div class="card${p?" is-prio":""}" role="button" tabindex="0" draggable="${!readOnly}" data-id="${esc(d.id)}">
    <div class="card-top"><button class="prio" type="button" data-prio="${esc(d.id)}" aria-pressed="${p}" title="${p?"Tirar prioridade":"Marcar como prioridade"}" aria-label="${p?"Tirar prioridade":"Marcar como prioridade"}"></button><span class="card-name">${esc(d.nome)}</span><span class="uf">${esc(d.uf)}</span></div>
    <div class="card-meta"><span><span class="units">${fmt(estoqueDe(d))}</span> un.</span><span>${emps} empreend.</span></div>
    ${n?`<div class="card-note"><time>${dataBR(n.data)}</time>${esc(n.texto)}</div>`:""}
  </div>`;
}

async function salvar(d,msg){
  if(readOnly){toast("Você só pode visualizar este quadro.",true);return}
  const id=d.id,body={...d};delete body.id;body.atualizadoEm=new Date().toISOString();
  docs.set(id,{...body,id});renderBoard();if(aberto===id)renderDrawer(false);
  const prev=writing.get(id)||Promise.resolve();
  const p=prev.then(()=>db.collection("incorporadoras").doc(id).set(body)).then(()=>{if(msg)toast(msg)}).catch(e=>{
    if(e&&e.code==="invalid_argument"){readOnly=true;toast("Sem permissão para editar este quadro.",true)}
    else if(e&&e.code==="quota_exceeded")toast("O banco de dados está cheio. Exclua cards antigos.",true);
    else toast("Não salvou. Verifique a conexão e tente de novo.",true);
  });
  writing.set(id,p);return p;
}

async function moverEtapa(id,etapa){
  const d=docs.get(id);if(!d||d.etapa===etapa)return;
  const h=[...(d.historico||[]),{data:hojeISO(),texto:`Movida de “${nomeEtapa(d.etapa)}” para “${nomeEtapa(etapa)}”`,auto:true}];
  await salvar({...d,etapa,historico:h},`Movida para ${nomeEtapa(etapa)}`);
}

/* drag & drop */
document.addEventListener("dragstart",e=>{const c=e.target.closest?.(".card");if(!c)return;e.dataTransfer.setData("text/plain",c.dataset.id);e.dataTransfer.effectAllowed="move";c.classList.add("dragging")});
document.addEventListener("dragend",e=>{e.target.closest?.(".card")?.classList.remove("dragging");document.querySelectorAll(".col.over").forEach(c=>c.classList.remove("over"))});
$("#board").addEventListener("dragover",e=>{const col=e.target.closest(".col");if(!col)return;e.preventDefault();document.querySelectorAll(".col.over").forEach(c=>c!==col&&c.classList.remove("over"));col.classList.add("over")});
$("#board").addEventListener("dragleave",e=>{const col=e.target.closest(".col");if(col&&!col.contains(e.relatedTarget))col.classList.remove("over")});
$("#board").addEventListener("drop",e=>{const col=e.target.closest(".col");if(!col)return;e.preventDefault();col.classList.remove("over");const id=e.dataTransfer.getData("text/plain");if(id)moverEtapa(id,col.dataset.etapa)});
function alternarPrio(id){const d=docs.get(id);if(!d)return;const p=!d.prioridade;salvar({...d,prioridade:p},p?"Marcada como prioridade":"Prioridade removida")}
$("#board").addEventListener("click",e=>{const pb=e.target.closest(".prio");if(pb){e.stopPropagation();alternarPrio(pb.dataset.prio);return}const c=e.target.closest(".card");if(c)abrir(c.dataset.id)});
$("#board").addEventListener("keydown",e=>{if(e.target.closest(".prio"))return;const c=e.target.closest(".card");if(c&&(e.key==="Enter"||e.key===" ")){e.preventDefault();abrir(c.dataset.id)}});
$("#ufChips").addEventListener("click",e=>{const b=e.target.closest(".chip");if(!b)return;ufFiltro=b.dataset.uf;try{localStorage.setItem("crm-uf",ufFiltro)}catch(_){};renderBoard()});
$("#q").addEventListener("input",e=>{busca=e.target.value;renderBoard()});

/* gaveta */
function abrir(id){aberto=id;$("#scrim").hidden=false;$("#drawer").hidden=false;renderDrawer(true)}
function fechar(){aberto=null;$("#scrim").hidden=true;$("#drawer").hidden=true;$("#drawer").innerHTML=""}
$("#scrim").addEventListener("click",()=>{fechar();fecharKit()});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!$("#kit").hidden)fecharKit();else if(aberto)fechar()});

function renderDrawer(focus){
  const d=docs.get(aberto);if(!d){fechar();return}
  const dr=$("#drawer");
  const draft=dr.querySelector("#noteTxt")?.value||"",draftDate=dr.querySelector("#noteDate")?.value||hojeISO();
  const emps=d.empreendimentos||[];
  const hist=[...(d.historico||[])].map((n,i)=>({...n,i})).reverse();
  dr.innerHTML=`
    <div class="d-head"><input class="title" id="dNome" value="${esc(d.nome)}" aria-label="Nome da incorporadora"><button class="d-prio" type="button" id="dPrio" aria-pressed="${!!d.prioridade}"><span class="prio" aria-hidden="true" aria-pressed="${!!d.prioridade}"></span>Prioridade</button><button class="x" type="button" id="dClose" aria-label="Fechar">×</button></div>
    <div class="d-body">
      <div class="row2">
        <label class="f">Estado<select class="inp" id="dUf">${UFS.map(u=>`<option ${u===d.uf?"selected":""}>${u}</option>`).join("")}</select></label>
        <label class="f">Etapa<select class="inp" id="dEtapa">${ETAPAS.map(e=>`<option value="${e.id}" ${e.id===d.etapa?"selected":""}>${e.nome}</option>`).join("")}</select></label>
      </div>
      <section>
        <h2>Histórico <span class="aside">${hist.filter(n=>!n.auto).length} notas</span></h2>
        <div class="newnote">
          <textarea class="inp" id="noteTxt" placeholder="Ex.: Liguei para o diretor comercial, pediu o deck por e-mail. Retornar na sexta.">${esc(draft)}</textarea>
          <div class="bar"><input class="inp num" type="date" id="noteDate" value="${draftDate}" aria-label="Data da nota"><button class="btn primary small" type="button" id="noteAdd">Adicionar nota</button></div>
        </div>
        ${hist.length?`<ul class="notes" style="margin-top:14px">${hist.map(n=>`<li class="${n.auto?"auto":""}"><div class="body"><time>${dataBR(n.data)}</time><div class="txt">${esc(n.texto)}</div></div><button class="rm" type="button" data-rmnote="${n.i}" aria-label="Apagar nota">×</button></li>`).join("")}</ul>`:`<p class="hint" style="margin-top:10px">Nenhuma nota ainda.</p>`}
      </section>
      <section>
        <h2>Empreendimentos <span class="aside"><span class="num">${fmt(estoqueDe(d))}</span> unidades em estoque</span></h2>
        ${emps.length?`<div class="tbl-wrap"><table><thead><tr><th>Empreendimento</th><th>Cidade</th><th class="r">Total</th><th class="r">Estoque</th><th></th></tr></thead><tbody>
          ${emps.map((e,i)=>`<tr>
            <td><input class="cell" data-emp="${i}" data-f="nome" value="${esc(e.nome)}" aria-label="Nome do empreendimento"></td>
            <td><input class="cell" data-emp="${i}" data-f="cidade" value="${esc(e.cidade)}" aria-label="Cidade de ${esc(e.nome)}"></td>
            <td class="r"><input class="cell num r" type="number" min="0" inputmode="numeric" data-emp="${i}" data-f="total" value="${Number(e.total)||0}" aria-label="Total de unidades de ${esc(e.nome)}"></td>
            <td class="r"><input class="cell num r est" type="number" min="0" inputmode="numeric" data-emp="${i}" data-f="estoque" value="${Number(e.estoque)||0}" aria-label="Unidades em estoque de ${esc(e.nome)}"></td>
            <td><button class="rm" type="button" data-rmemp="${i}" aria-label="Remover ${esc(e.nome)}">×</button></td></tr>`).join("")}
        </tbody></table></div>`:`<p class="hint" style="margin:0">Nenhum empreendimento cadastrado.</p>`}
        <div class="addemp">
          <input class="inp" id="eNome" placeholder="Empreendimento" aria-label="Nome do empreendimento">
          <input class="inp" id="eCid" placeholder="Cidade" aria-label="Cidade">
          <input class="inp num" id="eTot" type="number" min="0" placeholder="Total" aria-label="Total de unidades">
          <input class="inp num" id="eEst" type="number" min="0" placeholder="Estoque" aria-label="Unidades em estoque">
          <button class="btn small" type="button" id="eAdd">Adicionar</button>
        </div>
      </section>
      <div class="danger-zone" id="dz"><button class="btn danger small" type="button" id="delAsk">Excluir incorporadora</button></div>
    </div>`;
  if(focus)dr.querySelector("#dClose").focus();
  dr.querySelector("#dClose").onclick=fechar;
  dr.querySelector("#dPrio").onclick=()=>alternarPrio(d.id);
  dr.querySelector("#dNome").onchange=e=>{const v=e.target.value.trim();if(v&&v!==d.nome)salvar({...d,nome:v},"Nome atualizado");else e.target.value=d.nome};
  dr.querySelector("#dUf").onchange=e=>salvar({...d,uf:e.target.value},"Estado atualizado");
  dr.querySelector("#dEtapa").onchange=e=>moverEtapa(d.id,e.target.value);
  dr.querySelector("#noteAdd").onclick=()=>{
    const t=dr.querySelector("#noteTxt").value.trim();if(!t){dr.querySelector("#noteTxt").focus();return}
    const dt=dr.querySelector("#noteDate").value||hojeISO();
    const h=[...(d.historico||[]),{data:dt,texto:t}].map((n,i)=>({n,i})).sort((a,b)=>a.n.data.localeCompare(b.n.data)||a.i-b.i).map(x=>x.n);
    dr.querySelector("#noteTxt").value="";
    salvar({...d,historico:h},"Nota adicionada");
  };
  dr.querySelectorAll("[data-rmnote]").forEach(b=>b.onclick=()=>{const i=+b.dataset.rmnote;salvar({...d,historico:(d.historico||[]).filter((_,j)=>j!==i)},"Nota apagada")});
  dr.querySelectorAll("[data-emp]").forEach(inp=>{
    inp.addEventListener("keydown",ev=>{if(ev.key==="Enter"){ev.preventDefault();inp.blur()}});
    inp.addEventListener("change",()=>{
      const cur=docs.get(d.id);if(!cur)return;
      const i=+inp.dataset.emp,f=inp.dataset.f,lista=[...(cur.empreendimentos||[])],e=lista[i];if(!e)return;
      const numerico=f==="total"||f==="estoque";
      let v=numerico?Math.max(0,parseInt(inp.value)||0):inp.value.trim();
      if(f==="nome"&&!v){inp.value=e.nome;return}
      if(v===(numerico?(Number(e[f])||0):(e[f]||""))){if(numerico)inp.value=v;return}
      const antes=e[f];lista[i]={...e,[f]:v};
      let h=cur.historico||[];
      if(numerico)h=[...h,{data:hojeISO(),texto:`${f==="estoque"?"Estoque":"Total de unidades"} de ${e.nome}: ${fmt(antes)} → ${fmt(v)}`,auto:true}];
      salvar({...cur,empreendimentos:lista,historico:h},f==="estoque"?"Estoque atualizado":"Empreendimento atualizado");
    });
  });
  dr.querySelectorAll("[data-rmemp]").forEach(b=>b.onclick=()=>{const i=+b.dataset.rmemp;salvar({...d,empreendimentos:emps.filter((_,j)=>j!==i)},"Empreendimento removido")});
  dr.querySelector("#eAdd").onclick=()=>{
    const nome=dr.querySelector("#eNome").value.trim();if(!nome){dr.querySelector("#eNome").focus();return}
    const e={nome,cidade:dr.querySelector("#eCid").value.trim(),total:Math.max(0,parseInt(dr.querySelector("#eTot").value)||0),estoque:Math.max(0,parseInt(dr.querySelector("#eEst").value)||0)};
    salvar({...d,empreendimentos:[...emps,e]},"Empreendimento adicionado");
  };
  dr.querySelector("#delAsk").onclick=()=>{
    const dz=dr.querySelector("#dz");
    dz.innerHTML=`<p>Excluir <b>${esc(d.nome)}</b> e todo o histórico? Não dá para desfazer.</p><button class="btn small" type="button" id="delNo">Cancelar</button><button class="btn danger solid small" type="button" id="delYes">Excluir</button>`;
    dz.querySelector("#delNo").onclick=()=>renderDrawer(false);
    dz.querySelector("#delYes").onclick=async()=>{
      const id=d.id;fechar();docs.delete(id);renderBoard();
      try{await db.collection("incorporadoras").doc(id).delete();toast("Incorporadora excluída")}catch(e){toast("Não excluiu. Tente de novo.",true)}
    };
  };
}

/* nova */
$("#nUf").innerHTML=UFS.map(u=>`<option ${u==="RS"?"selected":""}>${u}</option>`).join("");
$("#nEtapa").innerHTML=ETAPAS.map(e=>`<option value="${e.id}">${e.nome}</option>`).join("");
$("#btnNew").onclick=()=>{if(!db){toast("Os dados ainda não carregaram.",true);return}$("#formNew").reset();$("#nUf").value=ufFiltro!=="todos"?ufFiltro:"RS";$("#dlgNew").showModal();$("#nNome").focus()};
$("#nCancel").onclick=()=>$("#dlgNew").close();
$("#formNew").addEventListener("submit",e=>{
  e.preventDefault();
  const nome=$("#nNome").value.trim();if(!nome)return;
  let id=slug(nome),k=2;while(docs.has(id))id=slug(nome)+"-"+k++;
  const emp=$("#nEmp").value.trim();
  const agora=new Date().toISOString();
  const d={id,nome,uf:$("#nUf").value,etapa:$("#nEtapa").value,
    empreendimentos:emp?[{nome:emp,cidade:$("#nCid").value.trim(),total:Math.max(0,parseInt($("#nTot").value)||0),estoque:Math.max(0,parseInt($("#nEst").value)||0)}]:[],
    historico:[{data:hojeISO(),texto:"Card criado",auto:true}],criadoEm:agora};
  $("#dlgNew").close();
  salvar(d,"Card criado");
});

/* ===== kit comercial ===== */
let assets=null, msgs=[], mats=[], kitTab="msg", editMsg=null, matMode="arquivo";
const OKTYPES=["application/pdf","image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm"];
const EXT={pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",mp4:"video/mp4",webm:"video/webm"};
const fmtBytes=b=>b>=1048576?(b/1048576).toFixed(1).replace(".",",")+" MB":Math.max(1,Math.round(b/1024))+" KB";
const dominio=u=>{try{return new URL(u).hostname.replace(/^www\./,"")}catch(_){return u}};

function abrirKit(){fechar();$("#scrim").hidden=false;$("#kit").hidden=false;setTab(kitTab);$("#kitClose").focus()}
function fecharKit(){$("#kit").hidden=true;if(!aberto)$("#scrim").hidden=true}
$("#btnKit").onclick=abrirKit;
$("#kitClose").onclick=fecharKit;
function setTab(t){kitTab=t;document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===t));$("#pMsg").hidden=t!=="msg";$("#pMat").hidden=t!=="mat";try{localStorage.setItem("crm-kit-tab",t)}catch(_){}}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

async function copiar(texto,el){
  try{await navigator.clipboard.writeText(texto);toast("Copiado")}
  catch(_){
    if(el){const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);toast("Texto selecionado. Use Ctrl+C para copiar.")}
    else toast("Não foi possível copiar.",true);
  }
}

function renderMsgs(){
  $("#nMsg").textContent=msgs.length;
  const box=$("#msgList");
  if(!msgs.length){box.innerHTML=`<div class="kempty">Nenhuma mensagem ainda. Adicione abaixo os textos que você usa para prospectar.</div>`;return}
  box.innerHTML=msgs.map(m=>`<article class="msg" data-id="${esc(m.id)}">
    <div class="msg-h"><b>${esc(m.titulo)}</b><div class="kacts">
      <button class="btn primary small" type="button" data-act="copy">Copiar</button>
      <button class="btn small" type="button" data-act="edit">Editar</button>
      <button class="btn small danger" type="button" data-act="del" aria-label="Apagar mensagem">Apagar</button></div></div>
    <p class="txt">${esc(m.texto)}</p></article>`).join("");
}
$("#msgList").addEventListener("click",async e=>{
  const b=e.target.closest("[data-act]");if(!b)return;
  const art=b.closest(".msg"),id=art.dataset.id,m=msgs.find(x=>x.id===id);if(!m)return;
  const a=b.dataset.act;
  if(a==="copy")copiar(m.texto,art.querySelector(".txt"));
  else if(a==="edit"){editMsg=id;$("#msgTitulo").value=m.titulo;$("#msgTexto").value=m.texto;$("#msgSave").textContent="Salvar alterações";$("#msgSummary").textContent="Editando mensagem";$("#msgAdd").open=true;$("#msgTitulo").focus()}
  else if(a==="del"){b.parentElement.innerHTML=`<span class="q">Apagar?</span><button class="btn small" type="button" data-act="no">Não</button><button class="btn small danger solid" type="button" data-act="yes">Apagar</button>`}
  else if(a==="no")renderMsgs();
  else if(a==="yes"){try{await db.collection("kit_mensagens").doc(id).delete();toast("Mensagem apagada")}catch(_){toast("Não apagou. Tente de novo.",true)}}
});
function resetMsgForm(){editMsg=null;$("#msgForm").reset();$("#msgSave").textContent="Salvar mensagem";$("#msgSummary").textContent="+ Nova mensagem";$("#msgAdd").open=false}
$("#msgCancel").onclick=resetMsgForm;
$("#msgForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!db)return;
  const titulo=$("#msgTitulo").value.trim(),texto=$("#msgTexto").value.trim();if(!titulo||!texto)return;
  const btn=$("#msgSave");btn.disabled=true;
  try{
    if(editMsg){const m=msgs.find(x=>x.id===editMsg);await db.collection("kit_mensagens").doc(editMsg).set({titulo,texto,criadoEm:(m&&m.criadoEm)||new Date().toISOString(),atualizadoEm:new Date().toISOString()});toast("Mensagem atualizada")}
    else{await db.collection("kit_mensagens").add({titulo,texto,criadoEm:new Date().toISOString()});toast("Mensagem salva")}
    resetMsgForm();
  }catch(_){toast("Não salvou. Tente de novo.",true)}
  btn.disabled=false;
});

function renderMats(){
  $("#nMat").textContent=mats.length;
  const box=$("#matList");
  if(!mats.length){box.innerHTML=`<div class="kempty">Nenhum material ainda. Envie PDFs, imagens ou adicione links do Drive e do Canva.</div>`;return}
  box.innerHTML=mats.map(m=>{
    const isLink=m.tipo==="link",ct=m.contentType||"";
    const href=isLink?m.url:(m._href||"#");
    let cls="",lab="ARQ",style="";
    if(isLink){cls="link";lab="LINK"}
    else if(ct==="application/pdf"){cls="pdf";lab="PDF"}
    else if(ct.startsWith("image/")){cls="img";lab="IMG";style=` style="background-image:url('${esc(href)}')"`}
    else if(ct.startsWith("video/")){lab="VÍDEO"}
    const meta=isLink?dominio(m.url):[lab==="IMG"?"Imagem":lab==="VÍDEO"?"Vídeo":"PDF",m.tamanho?fmtBytes(m.tamanho):""].filter(Boolean).join(" · ");
    return `<article class="mat" data-id="${esc(m.id)}">
      <span class="ftype ${cls}"${style}>${lab}</span>
      <div class="mat-info"><b>${esc(m.nome)}</b><span>${esc(meta)}</span></div>
      <div class="kacts">
        <a class="btn small primary" href="${esc(href)}" target="_blank" rel="noopener">Abrir</a>
        ${isLink?`<button class="btn small" type="button" data-act="copylink">Copiar link</button>`:""}
        <button class="btn small danger" type="button" data-act="del" aria-label="Apagar material">Apagar</button>
      </div></article>`;
  }).join("");
}
$("#matList").addEventListener("click",async e=>{
  const b=e.target.closest("[data-act]");if(!b)return;
  const art=b.closest(".mat"),id=art.dataset.id,m=mats.find(x=>x.id===id);if(!m)return;
  const a=b.dataset.act;
  if(a==="copylink")copiar(m.url);
  else if(a==="del"){b.parentElement.innerHTML=`<span class="q">Apagar?</span><button class="btn small" type="button" data-act="no">Não</button><button class="btn small danger solid" type="button" data-act="yes">Apagar</button>`}
  else if(a==="no")renderMats();
  else if(a==="yes"){
    try{await db.collection("kit_materiais").doc(id).delete();toast("Material apagado")}catch(_){toast("Não apagou. Tente de novo.",true);return}
    if(m.assetId&&assets){try{await assets.delete(m.assetId)}catch(_){}}
  }
});
document.querySelectorAll(".segb").forEach(b=>b.onclick=()=>{matMode=b.dataset.mode;document.querySelectorAll(".segb").forEach(x=>x.setAttribute("aria-pressed",x===b));atualizarModo()});
function atualizarModo(){
  const semArq=!assets;
  $("#fileForm").hidden=matMode!=="arquivo"||semArq;
  $("#noAssets").hidden=!(matMode==="arquivo"&&semArq);
  $("#linkForm").hidden=matMode!=="link";
}
$("#fileForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!db||!assets)return;
  const f=$("#matFile").files[0];if(!f){$("#matFile").focus();return}
  const ext=(f.name.split(".").pop()||"").toLowerCase();
  const type=OKTYPES.includes(f.type)?f.type:EXT[ext];
  if(!type){toast("Tipo não aceito. Envie PDF, imagem ou vídeo (MP4/WebM).",true);return}
  if(f.size>20*1048576){toast("Arquivo maior que 20 MB. Comprima ou use um link.",true);return}
  const nome=$("#matFileNome").value.trim()||f.name.replace(/\.[^.]+$/,"");
  const btn=$("#fileSend");btn.disabled=true;btn.textContent="Enviando…";
  try{
    const r=await assets.upload(f,{type});
    await db.collection("kit_materiais").add({nome,tipo:"arquivo",assetId:r.id,contentType:r.contentType,tamanho:r.sizeBytes,arquivo:f.name,criadoEm:new Date().toISOString()});
    $("#fileForm").reset();$("#matAdd").open=false;toast("Material enviado");
  }catch(err){
    const c=err&&err.code;
    toast(c==="too_large"?"Arquivo grande demais (limite 20 MB).":c==="unsupported_type"?"Tipo não aceito. Envie PDF, imagem ou vídeo.":c==="quota_or_state"?"O espaço de arquivos está cheio. Apague algum material.":c==="rate_limited"?"Muitos envios seguidos. Espere um pouco.":"Não enviou. Tente de novo.",true);
  }
  btn.disabled=false;btn.textContent="Enviar arquivo";
});
$("#linkForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!db)return;
  const nome=$("#matLinkNome").value.trim();let url=$("#matLinkUrl").value.trim();if(!nome||!url)return;
  if(!/^https?:\/\//i.test(url))url="https://"+url;
  try{new URL(url)}catch(_){toast("Esse link não parece válido.",true);return}
  try{await db.collection("kit_materiais").add({nome,tipo:"link",url,criadoEm:new Date().toISOString()});$("#linkForm").reset();$("#matAdd").open=false;toast("Link adicionado")}
  catch(_){toast("Não salvou. Tente de novo.",true)}
});
function iniciarKit(){
  const byDate=(a,b)=>(a.criadoEm||"").localeCompare(b.criadoEm||"");
  db.collection("kit_mensagens").onSnapshot(s=>{msgs=s.docs.map(d=>({...d.data(),id:d.id})).sort(byDate);renderMsgs()},()=>{});
  db.collection("kit_materiais").onSnapshot(s=>{mats=s.docs.map(d=>({...d.data(),id:d.id})).sort(byDate);renderMats()},()=>{});
}
try{const t=localStorage.getItem("crm-kit-tab");if(t==="msg"||t==="mat")kitTab=t}catch(_){}
renderMsgs();renderMats();atualizarModo();

/* boot */
try{const u=localStorage.getItem("crm-uf");if(u)ufFiltro=u}catch(_){}
renderBoard();
(async()=>{
  try{db=await window.crm?.use?.("db")}catch(_){db=null}
  if(!db){loaded=true;renderBoard();return}
  iniciarKit();
  (async()=>{try{assets=await window.crm?.use?.("assets")}catch(_){assets=null}atualizarModo()})();
  db.collection("incorporadoras").onSnapshot(snap=>{
    const m=new Map();
    snap.docs.forEach(s=>{const v=s.data();if(v)m.set(s.id,{...v,id:s.id,uf:v.uf||"—",etapa:ETAPAS.some(e=>e.id===v.etapa)?v.etapa:"mapeadas"})});
    docs=m;loaded=true;renderBoard();
    if(aberto){const ae=document.activeElement;const typing=ae&&$("#drawer").contains(ae)&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName);if(!typing)renderDrawer(false)}
  },err=>{loaded=true;if(!docs.size){db=null;renderBoard()}toast("A conexão com os dados caiu. Recarregue a página.",true)});
})();
