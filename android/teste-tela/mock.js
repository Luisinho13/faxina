// Dados de mentira para ver a tela do celular no navegador do PC, sem o app.
// fotografar.ps1 copia a pasta ui com este arquivo junto e abre no Edge.
// ?demo=resultado | aberto | pronto | lixeira | agenda | historico | permissao
"use strict";
(() => {
  const GB = 2 ** 30, MB = 2 ** 20, agora = Date.now() / 1000, dia = 86400;
  const demo = new URLSearchParams(location.search).get("demo") || "";
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

  const videos = [
    ["VID-20250812-WA0031.mp4", 412 * MB, 60, true], ["VID-20251003-WA0007.mp4", 287 * MB, 12],
    ["VID-20250530-WA0112.mp4", 198 * MB, 140], ["Bom dia abençoado.mp4", 96 * MB, 30],
    ["VID-20240921-WA0004.mp4", 88 * MB, 390, true], ["VID-20250101-WA0020.mp4", 61 * MB, 286],
  ].map(([nome, tamanho, dias, enviado], i) => ({ chave: "wa_videos/" + i, nome, tamanho, arquivos: 1, e_pasta: false, modificado: agora - dias * dia, enviado: !!enviado }));

  const categorias = [
    { id: "wa_videos", nome: "Vídeos do WhatsApp", descricao: "Vídeos recebidos e enviados nas conversas. Os maiores aparecem primeiro.", grupo: "WhatsApp", icone: "video", nivel: "revisar", destino: "lixeira", selecao_por_item: true, aviso: "Confira antes: pode ter vídeo de família. Toque no olho para assistir." },
    { id: "wa_documentos", nome: "Documentos do WhatsApp", descricao: "PDFs, planilhas e outros arquivos recebidos nas conversas.", grupo: "WhatsApp", icone: "documento", nivel: "revisar", destino: "lixeira", selecao_por_item: true, aviso: "" },
    { id: "wa_status", nome: "Status já vistos", descricao: "Fotos e vídeos de status que já passaram. O WhatsApp não usa mais.", grupo: "WhatsApp", icone: "olho", nivel: "seguro", destino: "apagar", selecao_por_item: false, aviso: "" },
    { id: "instaladores", nome: "Instaladores de apps", descricao: "Arquivos .apk baixados. O app já instalado não depende deles.", grupo: "Seus arquivos", icone: "download", nivel: "revisar", destino: "lixeira", selecao_por_item: true, aviso: "" },
    { id: "downloads_antigos", nome: "Downloads antigos", descricao: "O que está na pasta Download há mais de 3 meses.", grupo: "Seus arquivos", icone: "pasta", nivel: "revisar", destino: "lixeira", selecao_por_item: true, aviso: "" },
    { id: "miniaturas", nome: "Miniaturas da galeria", descricao: "Imagens pequenas que a galeria guarda para abrir rápido. Ela refaz sozinha.", grupo: "Sistema", icone: "imagem", nivel: "seguro", destino: "apagar", selecao_por_item: false, aviso: "" },
    { id: "lixeira", nome: "Lixeira da Faxina", descricao: "O que saiu nas últimas faxinas. Some sozinho depois de 30 dias.", grupo: "Sistema", icone: "lixeira", nivel: "revisar", destino: "esvaziar_lixeira", selecao_por_item: false, aviso: "" },
  ];
  const item = (id, i, nome, tamanho, dias, extra = {}) => ({ chave: `${id}/${i}`, nome, tamanho, arquivos: 1, e_pasta: false, modificado: agora - dias * dia, ...extra });
  const analise = {
    wa_videos: { tamanho: videos.reduce((s, v) => s + v.tamanho, 0) + 310 * MB, arquivos: 48, total_itens: 48, itens: videos },
    wa_documentos: { tamanho: 74 * MB, arquivos: 12, total_itens: 12, itens: [item("wa_documentos", 0, "Cardápio Natal.pdf", 31 * MB, 300), item("wa_documentos", 1, "Comprovante.pdf", 2 * MB, 40)] },
    wa_status: { tamanho: 143 * MB, arquivos: 37, total_itens: 37, itens: [item("wa_status", 0, "a81f.mp4", 22 * MB, 3)] },
    instaladores: { tamanho: 233 * MB, arquivos: 2, total_itens: 2, itens: [item("instaladores", 0, "app-caixa-tem.apk", 140 * MB, 200), item("instaladores", 1, "FreeFire.apk", 93 * MB, 410)] },
    downloads_antigos: { tamanho: 512 * MB, arquivos: 9, total_itens: 9, itens: [item("downloads_antigos", 0, "Filme do aniversário.mp4", 380 * MB, 220), item("downloads_antigos", 1, "Fotos 2023", 132 * MB, 500, { e_pasta: true, arquivos: 41 })] },
    miniaturas: { tamanho: 389 * MB, arquivos: 2210, total_itens: 1, itens: [] },
    lixeira: { tamanho: 0, arquivos: 0, total_itens: 0, itens: [] },
  };
  for (const a of Object.values(analise)) { a.pulados_recentes = 0; a.sem_permissao = false; }

  let agenda = { ativo: false, frequencia: "mensal", limite_gb: 1, proxima: null };
  const estado = () => ({
    permissao: demo !== "permissao", sdk: 34, cache_apps: true,
    armazenamento: { total: 64e9, livre: 3.1 * GB },
    ultima: { quando: agora - 40 * dia, liberado: 2.4 * GB },
    agenda, lixeira: { tamanho: 699 * MB, itens: 3 }, categorias,
  });

  window.API_DE_MENTIRA = {
    estado: async () => estado(),
    analisar: async () => {
      for (let i = 0; i <= 7; i++) { window.Faxina.progresso({ feito: i, total: 7, nome: categorias[i]?.nome || "", fase: "analisar" }); await espera(80); }
      return { categorias: JSON.parse(JSON.stringify(analise)) };
    },
    limpar: async () => ({
      liberado: 532 * MB, para_lixeira: 699 * MB,
      resultados: { miniaturas: { liberado: 389 * MB, para_lixeira: 0, pulados: 0 }, wa_status: { liberado: 143 * MB, para_lixeira: 0, pulados: 0 }, wa_videos: { liberado: 0, para_lixeira: 699 * MB, pulados: 0 } },
      armazenamento: { total: 64e9, livre: 3.6 * GB }, ultima: { quando: agora, liberado: 532 * MB },
    }),
    ver: async () => true,
    lixeira: async () => [
      { id: "1", nome: "VID-20250812-WA0031.mp4", origem: "WhatsApp Video (enviados)", tamanho: 412 * MB, quando: agora - 2 * dia, dias_restantes: 28 },
      { id: "2", nome: "VID-20251003-WA0007.mp4", origem: "WhatsApp Video", tamanho: 287 * MB, quando: agora - 2 * dia, dias_restantes: 28 },
      { id: "3", nome: "Boleto setembro.pdf", origem: "Download", tamanho: 1.2 * MB, quando: agora - 29 * dia, dias_restantes: 1 },
    ],
    devolver: async () => ({ ok: true, onde: "WhatsApp Video" }),
    esvaziar_lixeira: async () => ({ liberado: 699 * MB, armazenamento: { total: 64e9, livre: 4.3 * GB }, ultima: null }),
    historico: async () => [
      { quando: agora - 70 * dia, modo: "manual", liberado: 1.1 * GB, para_lixeira: 0, categorias: [] },
      { quando: agora - 40 * dia, modo: "cache", liberado: 2.4 * GB, para_lixeira: 0, categorias: [] },
      { quando: agora - 10 * dia, modo: "manual", liberado: 532 * MB, para_lixeira: 699 * MB, categorias: [] },
    ],
    salvar_agenda: async (a) => { agenda = { ...a, proxima: Date.now() + 30 * dia * 1000 }; return { ok: true, agenda }; },
    testar_aviso: async () => ({ ok: true }),
    pedir_permissao: async () => true,
    limpar_cache_apps: async () => ({ ok: true, liberado: 1.3 * GB, armazenamento: { total: 64e9, livre: 4.4 * GB } }),
  };

  // Leva a tela até o ponto pedido, como alguém tocando.
  (async () => {
    window.Faxina.moldura(28, 16); // barra de status e barra de gestos de um celular comum
    // Foto: sem animação, como com "remover animações" ligado no celular.
    document.head.insertAdjacentHTML("beforeend", "<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>");
    await espera(150);
    const clicar = (s) => document.querySelector(s).click();
    if (["resultado", "aberto", "pronto", "modal"].includes(demo)) { clicar("#analisar"); await espera(1500); }
    if (demo === "aberto") {
      const v = document.querySelector('[data-cat="wa_videos"]');
      v.querySelector("[data-marcar]").click();
      v.querySelectorAll("[data-item]")[3].click();
      v.querySelector(".cat-linha").scrollIntoView();
      window.scrollBy(0, -80);
    }
    if (demo === "modal") { document.querySelector('[data-cat="wa_videos"] [data-marcar]').click(); clicar("#limpar"); }
    if (demo === "pronto") { clicar("#limpar"); await espera(100); clicar("#modal-ok"); }
    if (["lixeira", "agenda", "historico"].includes(demo)) clicar(`.aba[data-tela="${demo}"]`);
    if (demo === "agenda") { clicar("#ag-ativo"); }
  })();
})();
