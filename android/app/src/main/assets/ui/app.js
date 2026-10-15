"use strict";
window.__erros = [];
window.addEventListener("error", (e) => window.__erros.push(e.message));
window.addEventListener("unhandledrejection", (e) => window.__erros.push(String(e.reason)));

// O tema vem do app (?tema= e Faxina.moldura); fora dele, do sistema.
const parametros = new URLSearchParams(location.search);
const temaDoSistema = matchMedia("(prefers-color-scheme: dark)");
const aplicarTema = (t) => (document.documentElement.dataset.tema = t || (temaDoSistema.matches ? "escuro" : "claro"));
aplicarTema(parametros.get("tema"));
if (!parametros.get("tema")) temaDoSistema.addEventListener("change", () => aplicarTema());

// ================================================================ utilidades
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NUM1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const NUM0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const GB = 2 ** 30, MB = 2 ** 20, DIA = 86400;

function tamanho(b) {
  if (!b) return "0 MB";
  if (b >= 100 * GB) return NUM0.format(b / GB) + " GB";
  if (b >= GB) return NUM1.format(b / GB) + " GB";
  if (b >= MB) return NUM0.format(b / MB) + " MB";
  return "< 1 MB";
}
function plural(n, um, varios) { return `${NUM0.format(n)} ${n === 1 ? um : varios}`; }
function esc(t) { return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
function data(ts) {
  const d = new Date(ts * 1000);
  const ano = d.getFullYear() !== new Date().getFullYear() ? ` de ${d.getFullYear()}` : "";
  return `${d.getDate()} de ${MESES[d.getMonth()]}${ano}`;
}
function hora(ts) { return new Date(ts * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

const GRUPOS = [
  ["WhatsApp", "--g-whatsapp"],
  ["Seus arquivos", "--g-arquivos"],
  ["Sistema", "--g-sistema"],
];
const corDoGrupo = (g) => `var(${(GRUPOS.find((x) => x[0] === g) || GRUPOS[0])[1]})`;

function tipoDoArquivo(nome) {
  const ext = (nome.split(".").pop() || "").toLowerCase();
  if (["mp4", "3gp", "mkv", "mov", "webm", "avi"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) return "imagem";
  if (["mp3", "opus", "ogg", "m4a", "aac", "wav"].includes(ext)) return "musica";
  if (["apk", "apks", "xapk", "apkm"].includes(ext)) return "download";
  return "documento";
}

let toastTimer;
function aviso(texto, erro = false) {
  const t = $("#toast");
  t.textContent = texto;
  t.className = "toast" + (erro ? " erro" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4200);
}

// ================================================================ estado
const S = {
  api: null,
  estado: null,     // vindo do app
  analise: null,    // { id: {...} }
  escolha: {},      // { id: { marcada, itens: Set } }
  trabalhando: false,
  tela: "limpeza",
  fase: "carregando",
};
const cat = (id) => S.estado.categorias.find((c) => c.id === id);

// Chamado pelo app (MainActivity e Ponte).
window.Faxina = {
  progresso({ feito, total, nome, fase }) {
    const p = total ? Math.min(1, feito / total) : 0;
    $("#anel-frente").style.strokeDashoffset = 326.7 * (1 - p);
    $("#anel-numero").textContent = Math.round(p * 100) + "%";
    if (nome) $("#trabalhando-detalhe").textContent = (fase === "limpar" ? "Limpando " : "Olhando ") + nome + "…";
  },
  moldura(topo, base, tema) {
    const r = document.documentElement.style;
    r.setProperty("--topo", topo + "px");
    r.setProperty("--base", base + "px");
    if (tema) aplicarTema(tema);
  },
  voltou() { if (S.api && !S.trabalhando) atualizarEstado(); },
  analisarAgora() { irPara("limpeza"); if (S.estado?.permissao) analisar(); },
  // Botão voltar do Android. true = a tela tratou.
  voltar() {
    if (!$("#modal").hidden) { $("#modal-cancelar").click(); return true; }
    if (S.trabalhando) return true;
    if (S.tela !== "limpeza") { irPara("limpeza"); return true; }
    if (S.fase === "resultado" || S.fase === "pronto") { mostrarEstado("inicio"); return true; }
    return false;
  },
};

// ================================================================ navegação
function irPara(tela) {
  S.tela = tela;
  $$(".aba").forEach((b) => b.classList.toggle("ativo", b.dataset.tela === tela));
  $$(".tela").forEach((t) => t.classList.toggle("ativa", t.id === "tela-" + tela));
  if (tela === "historico") desenharHistorico();
  if (tela === "lixeira") desenharLixeira();
  if (tela === "limpeza" && S.fase === "inicio") desenharInicio();
  window.scrollTo(0, 0);
}

function mostrarEstado(nome) {
  S.fase = nome;
  $$("#tela-limpeza .estado").forEach((e) => (e.hidden = e.id !== "estado-" + nome));
  $("#limpar").closest(".barra-acao").hidden = nome !== "resultado";
  if (nome === "inicio") desenharInicio();
  window.scrollTo(0, 0);
}

async function atualizarEstado() {
  S.estado = await S.api.estado();
  if (S.fase === "carregando" || S.fase === "permissao" || S.fase === "inicio") {
    mostrarEstado(S.estado.permissao ? "inicio" : "permissao");
  }
  if (S.tela === "lixeira") desenharLixeira();
}

// ================================================================ início
function desenharInicio() {
  const e = S.estado, esp = e.armazenamento;
  const usado = 1 - esp.livre / esp.total;
  $("#espaco").innerHTML = `
    <div class="espaco-topo"><strong>${icone("celular")}Armazenamento</strong><span><b>${tamanho(esp.livre)}</b> livres de ${tamanho(esp.total)}</span></div>
    <div class="espaco-barra-uso"><i class="${usado > .9 ? "cheio" : ""}" style="width:${(usado * 100).toFixed(1)}%"></i></div>
    ${usado > .9 ? `<p class="espaco-alerta">O celular está quase cheio. Vale a pena dar uma geral.</p>` : ""}`;
  const u = e.ultima, ag = e.agenda;
  const fatos = [
    ["historico", "Última faxina", u ? tamanho(u.liberado) : "Nenhuma ainda", u ? data(u.quando) : "esta vai ser a primeira"],
    ["calendario", "Faxina automática",
      ag.ativo ? (ag.frequencia === "semanal" ? "Toda semana" : "Todo mês") : "Desligada",
      ag.ativo ? "só avisa" : `<a href="#" data-ir="agenda">ligar</a>`],
  ];
  if (e.lixeira.itens) {
    fatos.push(["lixeira", "Na lixeira da Faxina", tamanho(e.lixeira.tamanho),
      `${plural(e.lixeira.itens, "item", "itens")} · <a href="#" data-ir="lixeira">ver</a>`]);
  }
  $("#fatos").innerHTML = fatos.map(([ic, rot, val, sub], i) =>
    `<div class="fato${i === 2 ? " largo" : ""}"><small>${icone(ic)}${rot}</small><strong>${val}</strong><span>${sub}</span></div>`).join("");
}

function desenharPermissao() {
  $("#dica-permissao").textContent = S.estado.sdk >= 30
    ? "O Android vai abrir uma tela. Ligue a chave da Faxina e volte aqui."
    : "O Android vai perguntar. É só tocar em Permitir.";
}

// ================================================================ análise
async function analisar() {
  if (S.trabalhando) return;
  S.trabalhando = true;
  $("#trabalhando-titulo").textContent = "Olhando o celular…";
  $("#trabalhando-detalhe").innerHTML = "&nbsp;";
  window.Faxina.progresso({ feito: 0, total: 1 });
  mostrarEstado("trabalhando");
  try {
    const inicio = Date.now();
    const r = await S.api.analisar();
    await esperarAte(inicio + 900); // o anel precisa de um instante para ser lido
    S.analise = r.categorias;
    S.escolha = {};
    for (const c of S.estado.categorias) {
      const a = S.analise[c.id];
      if (!a) continue;
      S.escolha[c.id] = {
        marcada: a.tamanho > 0 && c.nivel === "seguro",
        itens: new Set(c.selecao_por_item && c.nivel === "seguro" ? a.itens.map((i) => i.chave) : []),
      };
    }
    desenharResultado();
    mostrarEstado("resultado");
  } catch (e) {
    aviso("A análise falhou: " + e.message, true);
    mostrarEstado("inicio");
  } finally {
    S.trabalhando = false;
  }
}
const esperarAte = (t) => new Promise((ok) => setTimeout(ok, Math.max(0, t - Date.now())));

function tamanhoEscolhido(id) {
  const c = cat(id), a = S.analise[id], e = S.escolha[id];
  if (!e || !e.marcada) return 0;
  if (!c.selecao_por_item) return a.tamanho;
  return a.itens.filter((i) => e.itens.has(i.chave)).reduce((s, i) => s + i.tamanho, 0);
}

function desenharResultado() {
  const cats = S.estado.categorias.filter((c) => S.analise[c.id]);
  const comAlgo = cats.filter((c) => S.analise[c.id].tamanho > 0);
  const limpas = cats.filter((c) => S.analise[c.id].tamanho === 0);
  const total = comAlgo.reduce((s, c) => s + S.analise[c.id].tamanho, 0);

  contar($("#total-encontrado"), total);

  const porGrupo = GRUPOS.map(([g]) => [g, comAlgo.filter((c) => c.grupo === g).reduce((s, c) => s + S.analise[c.id].tamanho, 0)]).filter(([, v]) => v > 0);
  $("#barra-grupos").innerHTML = porGrupo.map(([g, v]) => `<i style="flex-grow:${v};background:${corDoGrupo(g)}"></i>`).join("");
  $("#legenda").innerHTML = porGrupo.map(([g, v]) => `<span><i style="background:${corDoGrupo(g)}"></i>${esc(g)} · ${tamanho(v)}</span>`).join("");

  // O cache dos apps não se mede antes: o Android limpa e a gente vê depois quanto saiu.
  $("#cache-apps").innerHTML = S.estado.cache_apps ? `
    <div class="faixa">
      <div class="faixa-topo">
        <span class="cat-icone">${icone("apps")}</span>
        <p><strong>Cache dos aplicativos</strong>O Android pode limpar de uma vez o cache que os apps guardam. Ele mesmo pergunta antes, e nenhuma conversa ou foto sai.</p>
      </div>
      <button class="botao fantasma" id="limpar-cache">${icone("vassoura")}Limpar o cache dos apps</button>
    </div>` : "";
  $("#limpar-cache")?.addEventListener("click", limparCacheDosApps);

  $("#grupos").innerHTML = GRUPOS.map(([g]) => {
    const doGrupo = comAlgo.filter((c) => c.grupo === g).sort((x, y) => S.analise[y.id].tamanho - S.analise[x.id].tamanho);
    if (!doGrupo.length) return "";
    const soma = doGrupo.reduce((s, c) => s + S.analise[c.id].tamanho, 0);
    return `<div class="grupo">
      <div class="grupo-titulo"><span>${esc(g)}</span><span>${tamanho(soma)}</span></div>
      <div class="lista">${doGrupo.map(linhaCategoria).join("")}</div>
    </div>`;
  }).join("");

  $("#ja-limpo").innerHTML = limpas.length
    ? `<span>Já está limpo:</span>` + limpas.map((c) => `<span class="chip">${icone("ok")}${esc(c.nome)}</span>`).join("")
    : "";

  ligarCategorias();
  atualizarSelecao();
}

function linhaCategoria(c) {
  const a = S.analise[c.id];
  const e = S.escolha[c.id];
  const selo = c.nivel === "seguro"
    ? `<span class="selo seguro">${icone("escudo")}Seguro</span>`
    : `<span class="selo revisar">${icone("info")}Revisar</span>`;
  const destino = c.destino === "lixeira" ? "vai para a lixeira" : c.destino === "esvaziar_lixeira" ? "sai de vez" : "sai de vez";
  const itens = a.itens.map((i) => {
    const tipo = i.e_pasta ? "pasta" : tipoDoArquivo(i.nome);
    const sub = i.e_pasta ? plural(i.arquivos, "arquivo", "arquivos") : data(i.modificado) + (i.enviado ? " · você enviou" : "");
    return `
    <div class="item">
      ${c.selecao_por_item ? `<label class="marcar"><input type="checkbox" data-item="${esc(i.chave)}" ${e.itens.has(i.chave) ? "checked" : ""}><span></span></label>` : ""}
      <span class="item-tipo">${icone(tipo)}</span>
      <span class="item-texto"><span class="item-nome">${esc(i.nome)}</span><small>${sub} · ${tamanho(i.tamanho)}</small></span>
      ${!i.e_pasta && c.destino !== "esvaziar_lixeira" ? `<button class="item-ver" data-ver="${esc(i.chave)}" aria-label="Ver ${esc(i.nome)}">${icone("olho")}</button>` : ""}
    </div>`;
  }).join("");
  const resto = a.total_itens - a.itens.length;
  const acoes = c.selecao_por_item && a.itens.length > 1
    ? `<div class="itens-acoes"><button data-todos="1">Marcar todos</button><button data-todos="0">Desmarcar todos</button></div>` : "";
  return `<div class="cat" data-cat="${c.id}" style="--cor:${corDoGrupo(c.grupo)}">
    <div class="cat-linha">
      <label class="marcar"><input type="checkbox" data-marcar="${c.id}" ${e.marcada ? "checked" : ""}><span></span></label>
      <span class="cat-icone">${icone(c.icone)}</span>
      <div class="cat-texto">
        <div class="cat-topo"><span class="cat-nome">${esc(c.nome)}</span><span class="cat-tamanho">${tamanho(a.tamanho)}</span></div>
        <p class="cat-desc">${esc(c.descricao)}</p>
        <div class="cat-pe">${selo}<span>${plural(a.total_itens, "item", "itens")} · ${destino}</span></div>
        ${c.aviso ? `<p class="cat-aviso">${icone("info")}${esc(c.aviso)}</p>` : ""}
      </div>
      ${a.itens.length ? `<button class="cat-abrir" aria-label="Ver o que tem">${icone("seta")}</button>` : ""}
    </div>
    ${a.itens.length ? `<div class="itens">${acoes}${itens}${resto > 0 ? `<div class="mais">e mais ${plural(resto, "item menor", "itens menores")}${c.selecao_por_item ? ", que ficam" : ""}</div>` : ""}</div>` : ""}
  </div>`;
}

function ligarCategorias() {
  $$("#grupos .cat").forEach((el) => {
    const id = el.dataset.cat;
    el.querySelector(".cat-linha").addEventListener("click", (ev) => {
      if (ev.target.closest(".marcar")) return;
      if (el.querySelector(".itens")) el.classList.toggle("aberta");
    });
    el.querySelector("[data-marcar]").addEventListener("change", (ev) => {
      const e = S.escolha[id];
      e.marcada = ev.target.checked;
      if (cat(id).selecao_por_item) {
        e.itens = new Set(e.marcada ? S.analise[id].itens.map((i) => i.chave) : []);
        el.querySelectorAll("[data-item]").forEach((x) => (x.checked = e.marcada));
        // Marcou uma categoria que é para revisar: abre a lista, para ver o que está indo.
        if (e.marcada && cat(id).nivel === "revisar") el.classList.add("aberta");
      }
      atualizarSelecao();
    });
    el.querySelectorAll("[data-item]").forEach((x) => x.addEventListener("change", () => {
      const e = S.escolha[id];
      x.checked ? e.itens.add(x.dataset.item) : e.itens.delete(x.dataset.item);
      e.marcada = e.itens.size > 0;
      atualizarSelecao();
    }));
    el.querySelectorAll("[data-todos]").forEach((b) => b.addEventListener("click", () => {
      const todos = b.dataset.todos === "1";
      const e = S.escolha[id];
      e.itens = new Set(todos ? S.analise[id].itens.map((i) => i.chave) : []);
      e.marcada = todos;
      el.querySelectorAll("[data-item]").forEach((x) => (x.checked = todos));
      atualizarSelecao();
    }));
    el.querySelectorAll("[data-ver]").forEach((b) => b.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const abriu = await S.api.ver(b.dataset.ver);
      if (!abriu) aviso("Não achei um app no celular para abrir este arquivo.", true);
    }));
  });
}

function atualizarSelecao() {
  let total = 0, n = 0;
  for (const id in S.escolha) {
    const t = tamanhoEscolhido(id);
    if (S.escolha[id].marcada) { total += t; n++; }
    const caixa = $(`[data-marcar="${id}"]`);
    if (caixa && cat(id).selecao_por_item) {
      const todos = S.analise[id].itens.length, marcados = S.escolha[id].itens.size;
      caixa.checked = marcados > 0;
      caixa.indeterminate = marcados > 0 && marcados < todos;
    }
  }
  $("#selecionado").textContent = tamanho(total);
  $("#selecionado-detalhe").textContent = n ? `em ${plural(n, "categoria", "categorias")}` : "nada marcado";
  $("#limpar").disabled = n === 0;
}

// ================================================================ limpeza
function perguntar(titulo, corpo, ok = "Pode limpar") {
  $("#modal-titulo").textContent = titulo;
  $("#modal-corpo").innerHTML = corpo;
  $("#modal-ok").textContent = ok;
  $("#modal").hidden = false;
  return new Promise((pronto) => {
    const fechar = (v) => { $("#modal").hidden = true; pronto(v); };
    $("#modal-ok").onclick = () => fechar(true);
    $("#modal-cancelar").onclick = () => fechar(false);
    $("#modal").onclick = (ev) => { if (ev.target.id === "modal") fechar(false); };
  });
}

function confirmarSeNecessario() {
  const delicadas = Object.keys(S.escolha).filter((id) => S.escolha[id].marcada && cat(id).nivel === "revisar");
  if (!delicadas.length) return Promise.resolve(true);
  const linhas = delicadas.map((id) => {
    const c = cat(id), e = S.escolha[id];
    let texto;
    if (c.destino === "lixeira") {
      texto = `${plural(e.itens.size, "item vai", "itens vão")} para a lixeira da Faxina. Dá para devolver por 30 dias; o espaço volta quando a lixeira esvaziar.`;
    } else if (c.destino === "esvaziar_lixeira") {
      texto = "A lixeira da Faxina será esvaziada. Isso não dá para desfazer.";
    } else {
      texto = c.aviso || "Confira antes de continuar.";
    }
    return `<div class="modal-item">${icone("info")}<div><strong>${esc(c.nome)} · ${tamanho(tamanhoEscolhido(id))}</strong><p>${esc(texto)}</p></div></div>`;
  }).join("");
  return perguntar("Antes de limpar", `<p class="mudo" style="margin-bottom:8px">Estes itens não são só cache:</p>` + linhas);
}

async function limpar() {
  if (S.trabalhando || !(await confirmarSeNecessario())) return;
  const escolha = {};
  for (const id in S.escolha) {
    const e = S.escolha[id];
    if (!e.marcada) continue;
    escolha[id] = cat(id).selecao_por_item ? [...e.itens] : null;
  }
  S.trabalhando = true;
  $("#trabalhando-titulo").textContent = "Limpando…";
  $("#trabalhando-detalhe").innerHTML = "&nbsp;";
  window.Faxina.progresso({ feito: 0, total: 1 });
  mostrarEstado("trabalhando");
  try {
    const inicio = Date.now();
    const r = await S.api.limpar(escolha);
    await esperarAte(inicio + 900);
    S.estado.armazenamento = r.armazenamento;
    S.estado.ultima = r.ultima;
    desenharPronto(r);
    mostrarEstado("pronto");
    S.estado = await S.api.estado();
  } catch (e) {
    aviso("A limpeza falhou: " + e.message, true);
    mostrarEstado("resultado");
  } finally {
    S.trabalhando = false;
  }
}

function desenharPronto(r) {
  const soLixeira = !r.liberado && r.para_lixeira > 0;
  contar($("#liberado"), soLixeira ? r.para_lixeira : r.liberado, 1400);
  $("#liberado-rotulo").textContent = soLixeira ? "na lixeira da Faxina" : "liberados";
  const pulados = Object.values(r.resultados).reduce((s, x) => s + x.pulados, 0);
  let detalhe = soLixeira
    ? "Dá para devolver por 30 dias, na aba Lixeira. O espaço volta quando ela esvaziar."
    : `O celular agora tem <strong>${tamanho(r.armazenamento.livre)}</strong> livres.` +
      (r.para_lixeira ? ` Mais ${tamanho(r.para_lixeira)} foram para a lixeira: dá para devolver por 30 dias.` : "");
  if (pulados) detalhe += ` ${plural(pulados, "arquivo não pôde sair e ficou", "arquivos não puderam sair e ficaram")}.`;
  $("#pronto-detalhe").innerHTML = detalhe;
  $("#pronto-esvaziar").hidden = !r.para_lixeira;
  const linhas = Object.entries(r.resultados)
    .filter(([, x]) => x.liberado || x.para_lixeira || x.erro)
    .sort((a, b) => (b[1].liberado + b[1].para_lixeira) - (a[1].liberado + a[1].para_lixeira))
    .map(([id, x]) => `<div><span>${esc(cat(id).nome)}${x.erro ? `<em>${esc(x.erro)}</em>` : ""}</span>
      <span>${x.liberado ? tamanho(x.liberado) : ""}${x.para_lixeira ? `<em>${tamanho(x.para_lixeira)} na lixeira</em>` : ""}</span></div>`);
  $("#lista-final").innerHTML = linhas.join("");
  $("#lista-final").hidden = !linhas.length;
  if (r.liberado > 0 || r.para_lixeira > 0) confete();
}

async function limparCacheDosApps() {
  const b = $("#limpar-cache");
  b.disabled = true;
  try {
    const r = await S.api.limpar_cache_apps();
    if (r.erro) aviso(r.erro, true);
    else if (r.cancelado) aviso("Tudo bem, o cache ficou.");
    else {
      S.estado.armazenamento = r.armazenamento;
      S.estado.ultima = r.ultima;
      aviso(r.liberado >= MB ? `Pronto: o Android liberou cerca de ${tamanho(r.liberado)}.` : "Pronto: os apps estavam com pouco cache.");
      b.innerHTML = `${icone("ok")}Cache limpo`;
      return;
    }
  } catch (e) {
    aviso("Não deu para limpar o cache: " + e.message, true);
  }
  b.disabled = false;
}

function confete() {
  const caixa = $("#confete");
  const cores = ["var(--g-sistema)", "var(--g-whatsapp)", "var(--g-arquivos)", "var(--g-aplicativos)", "var(--acento)"];
  caixa.innerHTML = Array.from({ length: 40 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${cores[i % cores.length]};animation-delay:${Math.random() * .7}s;animation-duration:${1.8 + Math.random() * 1.4}s"></i>`).join("");
}

function contar(el, alvo, ms = 900) {
  const vez = (el.__contagem = (el.__contagem || 0) + 1); // uma contagem nova cancela a anterior
  const inicio = performance.now();
  const passo = () => {
    if (el.__contagem !== vez) return;
    const p = Math.max(0, Math.min(1, (performance.now() - inicio) / ms));
    el.textContent = tamanho(alvo * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  // Sem quadros (tela apagada no meio), o número certo aparece mesmo assim.
  setTimeout(() => {
    if (el.__contagem !== vez) return;
    el.__contagem++;
    el.textContent = tamanho(alvo);
  }, ms + 100);
}

// ================================================================ lixeira
async function desenharLixeira() {
  const lista = await S.api.lixeira();
  const total = lista.reduce((s, x) => s + x.tamanho, 0);
  $("#lixeira-resumo").innerHTML = `
    <div><strong>${tamanho(total)}</strong><span>${lista.length ? plural(lista.length, "item", "itens") : "Vazia"}</span></div>
    <button class="botao fantasma perigo" id="esvaziar" ${lista.length ? "" : "disabled"}>${icone("lixeira")}Esvaziar</button>`;
  $("#esvaziar").addEventListener("click", () => esvaziarLixeira(lista.length, total));
  const caixa = $("#lixeira-lista");
  caixa.className = lista.length ? "cartao" : "";
  caixa.innerHTML = lista.length
    ? lista.map((x) => `
      <div class="lixo">
        <span class="item-tipo">${icone(tipoDoArquivo(x.nome))}</span>
        <span class="item-texto"><span class="item-nome">${esc(x.nome)}</span>
          <small>${tamanho(x.tamanho)}${x.origem ? " · de " + esc(x.origem) : ""} · ${x.dias_restantes > 1 ? `some em ${x.dias_restantes} dias` : "some amanhã"}</small></span>
        <button class="botao fantasma" data-devolver="${esc(x.id)}">${icone("devolver")}Devolver</button>
      </div>`).join("")
    : `<div class="vazio">${icone("lixeira")}<p>Nada na lixeira. O que for para cá nas faxinas aparece aqui.</p></div>`;
  $$("[data-devolver]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    const r = await S.api.devolver(b.dataset.devolver);
    if (r.ok) aviso(`Devolvido para ${r.onde || "o lugar de antes"}.`);
    else aviso(r.erro, true);
    desenharLixeira();
    S.estado = await S.api.estado();
  }));
}

async function esvaziarLixeira(n, total) {
  if (n === undefined) {
    const lista = await S.api.lixeira();
    n = lista.length;
    total = lista.reduce((s, x) => s + x.tamanho, 0);
  }
  const ok = await perguntar("Esvaziar a lixeira?",
    `<div class="modal-item">${icone("info")}<div><strong>${plural(n, "item", "itens")} · ${tamanho(total)}</strong><p>Saem de vez e o espaço volta para o celular. Isso não dá para desfazer.</p></div></div>`,
    "Esvaziar");
  if (!ok) return;
  const r = await S.api.esvaziar_lixeira();
  S.estado.armazenamento = r.armazenamento;
  S.estado.ultima = r.ultima;
  aviso(`Pronto: ${tamanho(r.liberado)} liberados.`);
  if (S.tela === "lixeira") desenharLixeira();
  if (S.fase === "pronto") {
    $("#pronto-esvaziar").hidden = true;
    $("#pronto-detalhe").innerHTML = `Lixeira esvaziada. O celular agora tem <strong>${tamanho(r.armazenamento.livre)}</strong> livres.`;
    contar($("#liberado"), r.liberado, 900);
    $("#liberado-rotulo").textContent = "liberados";
    confete();
  }
  S.estado = await S.api.estado();
}

// ================================================================ agenda
let AG = null;
const intervalo = (f) => (f === "semanal" ? 7 : 30) * DIA * 1000;

function desenharAgenda() {
  AG = { ...S.estado.agenda };
  $("#ag-ativo").checked = AG.ativo;
  atualizarAgenda();
}

function atualizarAgenda() {
  $("#agenda-campos").classList.toggle("desligado", !AG.ativo);
  $$("#ag-frequencia button").forEach((b) => b.classList.toggle("ativo", b.dataset.valor === AG.frequencia));
  $("#ag-limite").value = AG.limite_gb;
  const faixa = $("#ag-limite");
  faixa.style.setProperty("--cheio", ((AG.limite_gb - faixa.min) / (faixa.max - faixa.min) * 100) + "%");
  $("#ag-limite-valor").textContent = NUM1.format(AG.limite_gb).replace(",0", "") + " GB";

  const salvo = S.estado.agenda;
  const mudou = JSON.stringify(normalizar(AG)) !== JSON.stringify(normalizar(salvo));
  $("#agenda-status").textContent = mudou
    ? (AG.ativo ? "Alterações não salvas" : "Vai ser desligada ao salvar")
    : salvo.ativo
      ? `Ligada · ${salvo.frequencia === "semanal" ? "toda semana" : "todo mês"} · avisa a partir de ${NUM1.format(salvo.limite_gb).replace(",0", "")} GB`
      : "Desligada";
  let proxima = null;
  if (AG.ativo) proxima = !mudou && salvo.proxima ? new Date(salvo.proxima) : new Date(Date.now() + intervalo(AG.frequencia));
  $("#ag-proxima").innerHTML = proxima
    ? `Próxima olhada: <strong>por volta de ${DIAS_LONGOS[proxima.getDay()]}, ${proxima.getDate()} de ${MESES[proxima.getMonth()]}</strong>`
    : "";
  $("#ag-salvar").disabled = !mudou;
}
const normalizar = ({ ativo, frequencia, limite_gb }) => ({ ativo, frequencia, limite_gb: +limite_gb });

async function salvarAgenda() {
  $("#ag-salvar").disabled = true;
  const r = await S.api.salvar_agenda(normalizar(AG));
  if (!r.ok) { aviso("Não deu para salvar: " + r.erro, true); atualizarAgenda(); return; }
  S.estado.agenda = r.agenda;
  aviso(r.agenda.ativo ? "Combinado! A Faxina vai olhar " + (r.agenda.frequencia === "semanal" ? "toda semana." : "todo mês.") : "Faxina automática desligada.");
  atualizarAgenda();
}

// ================================================================ histórico
const MODOS = { manual: "manual", cache: "cache dos apps", lixeira: "lixeira esvaziada", expirou: "lixeira (30 dias)" };

async function desenharHistorico() {
  const lista = await S.api.historico();
  const total = lista.reduce((s, x) => s + x.liberado, 0);
  const maior = lista.reduce((m, x) => Math.max(m, x.liberado), 0);
  $("#hist-numeros").innerHTML = [
    ["brilho", "Liberado no total", tamanho(total)],
    ["vassoura", "Faxinas feitas", NUM0.format(lista.length)],
    ["celular", "Maior faxina", tamanho(maior)],
  ].map(([ic, r, v]) => `<div class="fato"><small>${icone(ic)}${r}</small><strong>${v}</strong></div>`).join("");
  $("#hist-lista").innerHTML = lista.length
    ? lista.slice().reverse().map((x) => `
      <div class="hist-linha">
        <div class="hist-data"><strong>${data(x.quando)}</strong><small>${hora(x.quando)} · ${MODOS[x.modo] || x.modo}</small></div>
        <div class="hist-barra"><i style="width:${maior ? Math.max(2, x.liberado / maior * 100) : 0}%"></i></div>
        <div class="hist-valor">${tamanho(x.liberado)}</div>
        ${x.para_lixeira ? `<div class="hist-detalhe">e ${tamanho(x.para_lixeira)} para a lixeira</div>` : ""}
      </div>`).join("")
    : `<div class="vazio">${icone("historico")}<p>Nenhuma faxina ainda. A primeira aparece aqui.</p></div>`;
}

// ================================================================ início
function ligarTela() {
  $$(".aba").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.tela)));
  document.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-ir]");
    if (alvo) { ev.preventDefault(); irPara(alvo.dataset.ir); }
  });
  $("#pedir-permissao").addEventListener("click", () => S.api.pedir_permissao());
  $("#analisar").addEventListener("click", analisar);
  $("#reanalisar").addEventListener("click", analisar);
  $("#de-novo").addEventListener("click", analisar);
  $("#limpar").addEventListener("click", limpar);
  $("#pronto-esvaziar").addEventListener("click", () => esvaziarLixeira());

  $("#ag-ativo").addEventListener("change", (e) => { AG.ativo = e.target.checked; atualizarAgenda(); });
  $$("#ag-frequencia button").forEach((b) => b.addEventListener("click", () => { AG.frequencia = b.dataset.valor; atualizarAgenda(); }));
  $("#ag-limite").addEventListener("input", (e) => { AG.limite_gb = +e.target.value; atualizarAgenda(); });
  $("#ag-salvar").addEventListener("click", salvarAgenda);
  $("#ag-testar").addEventListener("click", async () => {
    const r = await S.api.testar_aviso();
    if (r.ok) aviso("Mandei uma notificação de exemplo. Olhe lá em cima.");
    else aviso(r.erro, true);
  });
}

async function iniciar(api) {
  S.api = api;
  S.estado = await api.estado();
  preencherIcones();
  desenharPermissao();
  desenharAgenda();
  ligarTela();
  mostrarEstado(S.estado.permissao ? "inicio" : "permissao");
  if (parametros.has("analisar") && S.estado.permissao) analisar();
}

// A ponte com o app: cada chamada vira uma Promise, respondida por Nativo_resposta.
function apiNativa() {
  const pendentes = new Map();
  let n = 0;
  window.Nativo_resposta = (id, ok, valor) => {
    const p = pendentes.get(id);
    if (!p) return;
    pendentes.delete(id);
    ok ? p.ok(valor) : p.falha(new Error(valor));
  };
  return new Proxy({}, {
    get: (_, metodo) => metodo === "then" ? undefined : (...args) => new Promise((ok, falha) => {
      const id = ++n;
      pendentes.set(id, { ok, falha });
      window.Nativo.chamar(id, String(metodo), JSON.stringify(args));
    }),
  });
}

if (window.Nativo) iniciar(apiNativa());
else {
  // Fora do app (para ver a tela no navegador), usa dados de mentira.
  const s = document.createElement("script");
  s.src = "mock.js";
  s.onload = () => iniciar(window.API_DE_MENTIRA);
  document.body.appendChild(s);
}
