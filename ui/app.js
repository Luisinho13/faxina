"use strict";
window.__erros = [];
window.addEventListener("error", (e) => window.__erros.push(e.message));
window.addEventListener("unhandledrejection", (e) => window.__erros.push(String(e.reason)));

const temaDoWindows = matchMedia("(prefers-color-scheme: dark)");
const aplicarTema = () => (document.documentElement.dataset.tema = temaDoWindows.matches ? "escuro" : "claro");
aplicarTema();
temaDoWindows.addEventListener("change", aplicarTema);

// ================================================================ utilidades
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NUM1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const NUM0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const GB = 2 ** 30, MB = 2 ** 20;

function tamanho(b) {
  if (!b) return "0 MB";
  if (b >= 100 * GB) return NUM0.format(b / GB) + " GB";
  if (b >= GB) return NUM1.format(b / GB) + " GB";
  if (b >= MB) return NUM0.format(b / MB) + " MB";
  return "< 1 MB";
}
function plural(n, um, varios) { return `${NUM0.format(n)} ${n === 1 ? um : varios}`; }
function esc(t) { return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DIAS_LONGOS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const MESES = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
function data(ts) { const d = new Date(ts * 1000); return `${d.getDate()} de ${MESES[d.getMonth()]}`; }
function hora(ts) { const d = new Date(ts * 1000); return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function dataLonga(d) {
  return `${DIAS_LONGOS[(d.getDay() + 6) % 7]}, ${d.getDate()} de ${MESES[d.getMonth()]} às ` +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const GRUPOS = [
  ["Sistema", "--g-sistema"],
  ["Jogos e placa de vídeo", "--g-jogos"],
  ["Navegadores", "--g-navegadores"],
  ["Aplicativos", "--g-aplicativos"],
  ["Programação", "--g-programacao"],
  ["Seus arquivos", "--g-arquivos"],
];
const corDoGrupo = (g) => `var(${(GRUPOS.find((x) => x[0] === g) || GRUPOS[0])[1]})`;

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
  estado: null,     // vindo do Python
  analise: null,    // { id: {...} }
  escolha: {},      // { id: { marcada, itens: Set } }
  trabalhando: false,
};
const cat = (id) => S.estado.categorias.find((c) => c.id === id);

// Progresso mandado pelo Python durante análise e limpeza.
window.Faxina = {
  progresso({ feito, total, nome, fase }) {
    const p = total ? Math.min(1, feito / total) : 0;
    $("#anel-frente").style.strokeDashoffset = 326.7 * (1 - p);
    $("#anel-numero").textContent = Math.round(p * 100) + "%";
    if (nome) $("#trabalhando-detalhe").textContent = (fase === "limpar" ? "Limpando " : "Olhando ") + nome + "…";
  },
};

// ================================================================ navegação
function irPara(tela) {
  $$(".menu-item").forEach((b) => b.classList.toggle("ativo", b.dataset.tela === tela));
  $$(".tela").forEach((t) => t.classList.toggle("ativa", t.id === "tela-" + tela));
  if (tela === "historico") desenharHistorico();
  $(".principal").scrollTop = 0;
}

function mostrarEstado(nome) {
  $$("#tela-limpeza .estado").forEach((e) => (e.hidden = e.id !== "estado-" + nome));
  $(".principal").scrollTop = 0;
}

// ================================================================ lateral
function desenharDiscos() {
  $("#discos").innerHTML = S.estado.discos.map((d) => {
    const usado = 1 - d.livre / d.total;
    return `<div class="disco">
      <div class="disco-topo"><strong>${icone("disco")}${d.letra}:</strong><span>${tamanho(d.livre)} livres</span></div>
      <div class="disco-barra"><i class="${usado > .9 ? "cheio" : ""}" style="width:${(usado * 100).toFixed(1)}%"></i></div>
    </div>`;
  }).join("");
  $("#admin").innerHTML = S.estado.admin
    ? `${icone("escudo")} Rodando como administrador`
    : `<button id="virar-admin">${icone("escudo")} Abrir como administrador</button>`;
  $("#virar-admin")?.addEventListener("click", () => S.api.reiniciar_como_admin());
}

function desenharFatos() {
  const sistema = S.estado.discos.find((d) => d.sistema) || S.estado.discos[0];
  const u = S.estado.ultima, ag = S.estado.agenda;
  const fatos = [
    ["disco", `Livre no ${sistema.letra}:`, tamanho(sistema.livre), `de ${tamanho(sistema.total)}`],
    ["historico", "Última faxina", u ? tamanho(u.liberado) : "Nenhuma ainda", u ? data(u.quando) : "esta vai ser a primeira"],
    ["calendario", "Faxina automática",
      ag.ativo ? (ag.frequencia === "semanal" ? "Toda semana" : "Todo mês") : "Desligada",
      ag.ativo ? "próxima: " + data(new Date(ag.proxima).getTime() / 1000) : `<a href="#" data-ir="agenda">ligar agora</a>`],
  ];
  $("#fatos").innerHTML = fatos.map(([ic, rot, val, sub]) =>
    `<div class="fato"><small>${icone(ic)}${rot}</small><strong>${val}</strong><span>${sub}</span></div>`).join("");
}

// ================================================================ análise
async function analisar() {
  if (S.trabalhando) return;
  S.trabalhando = true;
  $("#trabalhando-titulo").textContent = "Analisando seu PC…";
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
      const pode = !bloqueada(c, a) && a.tamanho > 0;
      S.escolha[c.id] = {
        marcada: pode && c.nivel === "seguro",
        itens: new Set(c.selecao_por_item ? a.itens.map((i) => i.chave) : []),
      };
    }
    desenharResultado();
    mostrarEstado("resultado");
  } catch (e) {
    aviso("A análise falhou: " + e, true);
    mostrarEstado("inicio");
  } finally {
    S.trabalhando = false;
  }
}
const esperarAte = (t) => new Promise((ok) => setTimeout(ok, Math.max(0, t - Date.now())));

function bloqueada(c, a) {
  return (c.admin && !S.estado.admin) || (a.sem_permissao && a.tamanho === 0);
}

function tamanhoEscolhido(id) {
  const c = cat(id), a = S.analise[id], e = S.escolha[id];
  if (!e || !e.marcada) return 0;
  if (!c.selecao_por_item) return a.tamanho;
  return a.itens.filter((i) => e.itens.has(i.chave)).reduce((s, i) => s + i.tamanho, 0);
}

function desenharResultado() {
  const cats = S.estado.categorias.filter((c) => S.analise[c.id]);
  const comAlgo = cats.filter((c) => S.analise[c.id].tamanho > 0 && !bloqueada(c, S.analise[c.id]));
  const travadas = cats.filter((c) => bloqueada(c, S.analise[c.id]) && S.analise[c.id].tamanho > 0);
  const limpas = cats.filter((c) => S.analise[c.id].tamanho === 0 && !bloqueada(c, S.analise[c.id]));
  const total = comAlgo.reduce((s, c) => s + S.analise[c.id].tamanho, 0);

  contar($("#total-encontrado"), total);

  // barra por grupo
  const porGrupo = GRUPOS.map(([g]) => [g, comAlgo.filter((c) => c.grupo === g).reduce((s, c) => s + S.analise[c.id].tamanho, 0)]).filter(([, v]) => v > 0);
  $("#barra-grupos").innerHTML = porGrupo.map(([g, v]) => `<i style="flex-grow:${v};background:${corDoGrupo(g)}" title="${esc(g)}: ${tamanho(v)}"></i>`).join("");
  $("#legenda").innerHTML = porGrupo.map(([g, v]) => `<span><i style="background:${corDoGrupo(g)}"></i>${esc(g)} · ${tamanho(v)}</span>`).join("");

  // faixa de administrador
  const extra = travadas.reduce((s, c) => s + S.analise[c.id].tamanho, 0);
  $("#aviso-admin").innerHTML = extra >= 50 * MB && !S.estado.admin ? `
    <div class="faixa">${icone("escudo")}
      <p><strong>Mais ${tamanho(extra)}</strong> em ${travadas.map((c) => esc(c.nome)).join(" e ")}. Essas pastas são do Windows e só abrem com permissão de administrador.</p>
      <button class="botao fantasma" id="faixa-admin">Abrir como administrador</button>
    </div>` : "";
  $("#faixa-admin")?.addEventListener("click", () => S.api.reiniciar_como_admin());

  // grupos
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
  const detalhe = c.destino === "esvaziar_lixeira"
    ? plural(a.arquivos, "item", "itens")
    : plural(a.arquivos, "arquivo", "arquivos");
  const itens = a.itens.map((i) => `
    <div class="item">
      ${c.selecao_por_item ? `<label class="marcar"><input type="checkbox" data-item="${esc(i.chave)}" ${e.itens.has(i.chave) ? "checked" : ""}><span></span></label>` : ""}
      <span class="item-nome" title="${esc(i.local)}">${esc(i.nome)}${i.e_pasta ? `<small>${plural(i.arquivos, "arquivo", "arquivos")}</small>` : `<small>${data(i.modificado)}</small>`}</span>
      <span class="item-tamanho">${tamanho(i.tamanho)}</span>
      <button class="item-pasta" data-abrir="${esc(i.chave)}" title="Mostrar no Explorador">${icone("pasta")}</button>
    </div>`).join("");
  const resto = a.total_itens - a.itens.length;
  return `<div class="cat" data-cat="${c.id}" style="--cor:${corDoGrupo(c.grupo)}">
    <div class="cat-linha">
      <label class="marcar" onclick="event.stopPropagation()"><input type="checkbox" data-marcar="${c.id}" ${e.marcada ? "checked" : ""}><span></span></label>
      <span class="cat-icone">${icone(c.icone)}</span>
      <div class="cat-texto">
        <div class="cat-nome">${esc(c.nome)} ${selo}</div>
        <p class="cat-desc">${esc(c.descricao)}</p>
        ${c.aviso ? `<p class="cat-aviso">${icone("info")}${esc(c.aviso)}</p>` : ""}
      </div>
      <div class="cat-tamanho">${tamanho(a.tamanho)}<small>${detalhe}</small></div>
      ${a.itens.length ? `<button class="cat-abrir" title="Ver o que tem">${icone("seta")}</button>` : `<span style="width:30px"></span>`}
    </div>
    ${a.itens.length ? `<div class="itens">${itens}${resto > 0 ? `<div class="mais">e mais ${plural(resto, "item", "itens")} menores</div>` : ""}</div>` : ""}
  </div>`;
}

function ligarCategorias() {
  $$("#grupos .cat").forEach((el) => {
    const id = el.dataset.cat;
    el.querySelector(".cat-linha").addEventListener("click", () => {
      if (el.querySelector(".itens")) el.classList.toggle("aberta");
    });
    el.querySelector("[data-marcar]").addEventListener("change", (ev) => {
      const e = S.escolha[id];
      e.marcada = ev.target.checked;
      if (cat(id).selecao_por_item) {
        e.itens = new Set(e.marcada ? S.analise[id].itens.map((i) => i.chave) : []);
        el.querySelectorAll("[data-item]").forEach((x) => (x.checked = e.marcada));
      }
      atualizarSelecao();
    });
    el.querySelectorAll("[data-item]").forEach((x) => x.addEventListener("change", () => {
      const e = S.escolha[id];
      x.checked ? e.itens.add(x.dataset.item) : e.itens.delete(x.dataset.item);
      e.marcada = e.itens.size > 0;
      atualizarSelecao();
    }));
    el.querySelectorAll("[data-abrir]").forEach((b) => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      S.api.abrir_local(b.dataset.abrir);
    }));
  });
}

function atualizarSelecao() {
  let total = 0, n = 0;
  for (const id in S.escolha) {
    const t = tamanhoEscolhido(id);
    if (S.escolha[id].marcada && t >= 0) { total += t; n++; }
    const caixa = $(`[data-marcar="${id}"]`);
    if (caixa && cat(id).selecao_por_item) {
      const todos = S.analise[id].itens.length, marcados = S.escolha[id].itens.size;
      caixa.checked = marcados > 0;
      caixa.indeterminate = marcados > 0 && marcados < todos;
    }
  }
  $("#selecionado").textContent = tamanho(total);
  $("#selecionado-detalhe").textContent = n ? `selecionados em ${plural(n, "categoria", "categorias")}` : "nada selecionado";
  $("#limpar").disabled = n === 0;
}

// ================================================================ limpeza
function confirmarSeNecessario() {
  const delicadas = Object.keys(S.escolha).filter((id) => S.escolha[id].marcada && cat(id).nivel === "revisar");
  if (!delicadas.length) return Promise.resolve(true);
  const linhas = delicadas.map((id) => {
    const c = cat(id), e = S.escolha[id];
    let texto;
    if (c.destino === "lixeira") texto = `${plural(c.selecao_por_item ? e.itens.size : S.analise[id].itens.length, "arquivo vai", "arquivos vão")} para a lixeira. Dá para desfazer.`;
    else if (c.destino === "esvaziar_lixeira") texto = "A lixeira será esvaziada. Isso não dá para desfazer.";
    else texto = c.aviso || "Revise antes de continuar.";
    return `<div class="modal-item">${icone("info")}<div><strong>${esc(c.nome)} · ${tamanho(tamanhoEscolhido(id))}</strong><p>${esc(texto)}</p></div></div>`;
  }).join("");
  $("#modal-corpo").innerHTML = `<p class="mudo" style="margin-bottom:10px">Estes itens não são só cache:</p>` + linhas;
  $("#modal").hidden = false;
  $("#modal-ok").focus();
  return new Promise((ok) => {
    const fechar = (v) => { $("#modal").hidden = true; ok(v); };
    $("#modal-ok").onclick = () => fechar(true);
    $("#modal-cancelar").onclick = () => fechar(false);
    $("#modal").onclick = (ev) => { if (ev.target.id === "modal") fechar(false); };
  });
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
    S.estado.discos = r.discos;
    S.estado.ultima = r.ultima;
    desenharDiscos();
    desenharPronto(r);
    mostrarEstado("pronto");
  } catch (e) {
    aviso("A limpeza falhou: " + e, true);
    mostrarEstado("resultado");
  } finally {
    S.trabalhando = false;
  }
}

function desenharPronto(r) {
  contar($("#liberado"), r.liberado, 1400);
  const sistema = r.discos.find((d) => d.sistema) || r.discos[0];
  const pulados = Object.values(r.resultados).reduce((s, x) => s + x.pulados, 0);
  $("#pronto-detalhe").innerHTML =
    `O disco ${sistema.letra}: agora tem <strong>${tamanho(sistema.livre)}</strong> livres.` +
    (pulados ? ` ${plural(pulados, "arquivo estava em uso e ficou", "arquivos estavam em uso e ficaram")} para a próxima.` : "");
  const linhas = Object.entries(r.resultados)
    .sort((a, b) => b[1].liberado - a[1].liberado)
    .map(([id, x]) => `<div><span>${esc(cat(id).nome)}${x.erro ? ` <em>· ${esc(x.erro)}</em>` : ""}</span><span>${tamanho(x.liberado)}</span></div>`);
  $("#lista-final").innerHTML = linhas.join("");
  $("#lista-final").hidden = !linhas.length;
  if (r.liberado > 0) confete();
}

function confete() {
  const caixa = $("#confete");
  const cores = ["var(--g-sistema)", "var(--g-jogos)", "var(--g-navegadores)", "var(--g-aplicativos)", "var(--acento)", "var(--g-arquivos)"];
  caixa.innerHTML = Array.from({ length: 46 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${cores[i % cores.length]};animation-delay:${Math.random() * .7}s;animation-duration:${1.8 + Math.random() * 1.4}s"></i>`).join("");
}

function contar(el, alvo, ms = 900) {
  const inicio = performance.now();
  const passo = (agora) => {
    const p = Math.min(1, (agora - inicio) / ms);
    const suave = 1 - Math.pow(1 - p, 3);
    el.textContent = tamanho(alvo * suave);
    if (p < 1) requestAnimationFrame(passo);
    else el.textContent = tamanho(alvo);
  };
  requestAnimationFrame(passo);
}

// ================================================================ agenda
let AG = null;

function proximaExecucao(ag) {
  const agora = new Date();
  const [h, m] = ag.hora.split(":").map(Number);
  if (ag.frequencia === "semanal") {
    const c = new Date(agora);
    c.setDate(agora.getDate() + ((ag.dia_semana - ((agora.getDay() + 6) % 7)) + 7) % 7);
    c.setHours(h, m, 0, 0);
    if (c <= agora) c.setDate(c.getDate() + 7);
    return c;
  }
  for (let i = 0; i < 2; i++) {
    const ano = agora.getFullYear(), mes = agora.getMonth() + i;
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    const c = new Date(ano, mes, Math.min(ag.dia_mes, ultimo), h, m);
    if (c > agora) return c;
  }
}

function desenharAgenda() {
  AG = { ...S.estado.agenda };
  $("#ag-ativo").checked = AG.ativo;
  $("#ag-dia-semana").innerHTML = DIAS.map((d, i) => `<button data-valor="${i}">${d}</button>`).join("");
  $("#ag-dia-mes").innerHTML = Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">Dia ${i + 1}</option>`).join("");
  $$("#ag-dia-semana button").forEach((b) => b.addEventListener("click", () => { AG.dia_semana = +b.dataset.valor; atualizarAgenda(); }));
  atualizarAgenda();
}

function atualizarAgenda() {
  $("#agenda-campos").classList.toggle("desligado", !AG.ativo);
  $$("#ag-frequencia button").forEach((b) => b.classList.toggle("ativo", b.dataset.valor === AG.frequencia));
  $$("#ag-dia-semana button").forEach((b) => b.classList.toggle("ativo", +b.dataset.valor === AG.dia_semana));
  $$("#ag-modo .opcao").forEach((b) => b.classList.toggle("ativo", b.dataset.valor === AG.modo));
  $("#campo-semana").hidden = AG.frequencia !== "semanal";
  $("#campo-mes").hidden = AG.frequencia !== "mensal";
  $("#ag-dia-mes").value = AG.dia_mes;
  $("#ag-hora").value = AG.hora;
  $("#ag-limite").value = AG.limite_gb;
  const faixa = $("#ag-limite");
  faixa.style.setProperty("--cheio", ((AG.limite_gb - faixa.min) / (faixa.max - faixa.min) * 100) + "%");
  $("#ag-limite-valor").textContent = NUM1.format(AG.limite_gb).replace(",0", "") + " GB";
  $("#ag-limite").closest(".limite").style.display = AG.modo === "avisar" ? "" : "none";

  const salvo = S.estado.agenda;
  const mudou = JSON.stringify(normalizar(AG)) !== JSON.stringify(normalizar(salvo));
  const quando = (a) => (a.frequencia === "semanal" ? "toda " + DIAS_LONGOS[a.dia_semana] : "todo dia " + a.dia_mes) + " às " + a.hora;
  $("#agenda-status").textContent = mudou
    ? (AG.ativo ? "Alterações não salvas" : "Vai ser desligada ao salvar")
    : salvo.ativo
      ? `Ligada · ${quando(salvo)} · ${salvo.modo === "avisar" ? "só avisa" : "limpa o que é seguro"}`
      : "Desligada";
  $("#ag-proxima").innerHTML = AG.ativo ? `Próxima: <strong>${dataLonga(proximaExecucao(AG))}</strong>` : "";
  $("#ag-salvar").disabled = !mudou;
}
const normalizar = ({ ativo, frequencia, dia_mes, dia_semana, hora, modo, limite_gb }) =>
  ({ ativo, frequencia, dia_mes: +dia_mes, dia_semana: +dia_semana, hora, modo, limite_gb: +limite_gb });

async function salvarAgenda() {
  $("#ag-salvar").disabled = true;
  const r = await S.api.salvar_agenda(normalizar(AG));
  if (!r.ok) { aviso("O Windows recusou o agendamento: " + r.erro, true); atualizarAgenda(); return; }
  S.estado.agenda = r.agenda;
  aviso(r.agenda.ativo ? "Combinado! A Faxina vai passar " + (r.agenda.frequencia === "semanal" ? "toda semana." : "todo mês.") : "Faxina automática desligada.");
  atualizarAgenda();
  desenharFatos();
}

// ================================================================ histórico
async function desenharHistorico() {
  const lista = await S.api.historico();
  const total = lista.reduce((s, x) => s + x.liberado, 0);
  const maior = lista.reduce((m, x) => Math.max(m, x.liberado), 0);
  $("#hist-numeros").innerHTML = [
    ["brilho", "Liberado no total", tamanho(total)],
    ["vassoura", "Faxinas feitas", NUM0.format(lista.length)],
    ["disco", "Maior faxina", tamanho(maior)],
  ].map(([ic, r, v]) => `<div class="fato"><small>${icone(ic)}${r}</small><strong>${v}</strong></div>`).join("");
  $("#hist-lista").innerHTML = lista.length
    ? lista.slice().reverse().map((x) => `
      <div class="hist-linha" title="${esc(x.categorias.map((c) => c.nome + ": " + tamanho(c.liberado)).join("\n"))}">
        <div class="hist-data"><strong>${data(x.quando)}</strong><small>${hora(x.quando)} · ${x.modo === "agendado" ? "automática" : "manual"}</small></div>
        <div class="hist-barra"><i style="width:${maior ? Math.max(2, x.liberado / maior * 100) : 0}%"></i></div>
        <div class="hist-valor">${tamanho(x.liberado)}</div>
      </div>`).join("")
    : `<div class="vazio">${icone("historico")}<p>Nenhuma faxina ainda. A primeira aparece aqui.</p></div>`;
}

// ================================================================ início
function ligarTela() {
  $$(".menu-item").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.tela)));
  document.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-ir]");
    if (alvo) { ev.preventDefault(); irPara(alvo.dataset.ir); }
  });
  $("#analisar").addEventListener("click", analisar);
  $("#reanalisar").addEventListener("click", analisar);
  $("#de-novo").addEventListener("click", analisar);
  $("#limpar").addEventListener("click", limpar);

  $("#ag-ativo").addEventListener("change", (e) => { AG.ativo = e.target.checked; atualizarAgenda(); });
  $$("#ag-frequencia button").forEach((b) => b.addEventListener("click", () => { AG.frequencia = b.dataset.valor; atualizarAgenda(); }));
  $$("#ag-modo .opcao").forEach((b) => b.addEventListener("click", () => { AG.modo = b.dataset.valor; atualizarAgenda(); }));
  $("#ag-dia-mes").addEventListener("change", (e) => { AG.dia_mes = +e.target.value; atualizarAgenda(); });
  $("#ag-hora").addEventListener("change", (e) => { if (e.target.value) { AG.hora = e.target.value; atualizarAgenda(); } });
  $("#ag-limite").addEventListener("input", (e) => { AG.limite_gb = +e.target.value; atualizarAgenda(); });
  $("#ag-salvar").addEventListener("click", salvarAgenda);
  $("#ag-testar").addEventListener("click", async () => {
    await S.api.testar_aviso();
    aviso("Mandei uma notificação de exemplo para o canto da tela.");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) $("#modal-cancelar").click(); });
}

async function iniciar(api) {
  S.api = api;
  S.estado = await api.estado();
  preencherIcones();
  desenharDiscos();
  desenharFatos();
  desenharAgenda();
  ligarTela();
  if (new URLSearchParams(location.search).has("analisar")) analisar();
}

if (window.pywebview?.api) iniciar(window.pywebview.api);
else window.addEventListener("pywebviewready", () => iniciar(window.pywebview.api));
// Fora do app (para ver a tela no navegador), usa dados de mentira.
setTimeout(() => {
  if (!S.api && !window.pywebview) {
    const s = document.createElement("script");
    s.src = "mock.js";
    s.onload = () => iniciar(window.API_DE_MENTIRA);
    document.body.appendChild(s);
  }
}, 400);
