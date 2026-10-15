// Ícones em traço, 24×24, os mesmos do PC (ui/icones.js) mais os do celular.
const ICONES = {
  logo: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" fill="currentColor" stroke="none"/><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z" fill="currentColor" stroke="none"/><path d="M5 16.5l.6 1.4 1.4.6-1.4.6L5 20.5l-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" stroke="none"/>',
  brilho: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z"/><path d="M5 16.5l.6 1.4 1.4.6-1.4.6L5 20.5l-.6-1.4-1.4-.6 1.4-.6z"/>',
  vassoura: '<path d="M14.5 3.5l6 6"/><path d="M17.5 6.5l-5 5"/><path d="M12.5 11.5l-2-2c-1.6-.6-3.6 0-4.8 1.4L3 14l7 7 3.1-2.7c1.4-1.2 2-3.2 1.4-4.8z"/><path d="M6.5 16.5l-2 2"/><path d="M9 19l-1.5 1.5"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  historico: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>',
  lupa: '<circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5l-4.8-4.8"/>',
  refazer: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M21 4v4.5h-4.5"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  sino: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  escudo: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  pasta: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  lixeira: '<path d="M4 6.5h16M9.5 6.5V4.5h5v2M6 6.5l1 13.5h10l1-13.5"/><path d="M10 10.5v6M14 10.5v6"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  imagem: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  documento: '<path d="M6.5 3.5h7l4.5 4.5v12.5h-11.5z"/><path d="M13.5 3.5V8H18M9.5 12.5h5M9.5 16h5"/>',
  olho: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  celular: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  apps: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  devolver: '<path d="M9 14L4.5 9.5 9 5"/><path d="M4.5 9.5h10a5 5 0 0 1 0 10H11"/>',
  musica: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
};

function icone(nome, classe = "") {
  const corpo = ICONES[nome] || ICONES.pasta;
  return `<svg class="ic ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
}

function preencherIcones(raiz = document) {
  raiz.querySelectorAll("[data-icone]").forEach((el) => {
    if (!el.dataset.feito) {
      el.insertAdjacentHTML("afterbegin", icone(el.dataset.icone));
      el.dataset.feito = "1";
    }
  });
}
