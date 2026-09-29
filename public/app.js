const state = {
  itens: [],
  atualizado: null,
  gravacao: false,
  planilha: "",
  divisao: "",
  estrategia: "",
  apresentacao: "",
  busca: "",
  horizonte: 7,
  foco: "alerta",
  aberto: null,
  rascunhos: {},
  scriptUrl: "",
};

const $ = (id) => document.getElementById(id);

const STATUS_PADRAO = ["A Realizar", "Em atraso", "Realizado", "Concluído", "Entregue", "Cancelado"];

function semAcento(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function normalizarStatus(status) {
  return semAcento(status).replace(/\s+/g, " ").trim();
}

function hojeIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function analisarQuando(texto) {
  const bruto = String(texto || "").trim();
  if (!bruto) return { tipo: "vazio" };
  const match = bruto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return { tipo: "texto", bruto };
  let ano = Number(match[3]);
  if (ano < 100) ano += 2000;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const invalida =
    ano < 2000 ||
    ano > 2100 ||
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia;
  if (invalida) return { tipo: "invalida", bruto };
  const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return { tipo: "data", iso, bruto };
}

function diferencaDias(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const [hA, hM, hD] = hojeIso().split("-").map(Number);
  const alvo = Date.UTC(ano, mes - 1, dia);
  const hoje = Date.UTC(hA, hM - 1, hD);
  return Math.round((alvo - hoje) / 86400000);
}

function situacaoDe(item) {
  const nome = normalizarStatus(item.status);
  if (nome === "cancelado") return "cancelado";
  if (nome === "realizado" || nome === "concluido" || nome === "entregue") return "feito";
  const quando = analisarQuando(item.quando);
  if (quando.tipo !== "data") return "sem-data";
  const dias = diferencaDias(quando.iso);
  if (dias < 0) return "vencido";
  if (dias <= state.horizonte) return "vias";
  return "prazo";
}

function textoPrazo(item) {
  const quando = analisarQuando(item.quando);
  if (quando.tipo === "vazio") return "Sem data";
  if (quando.tipo !== "data") return item.quando;
  const dias = diferencaDias(quando.iso);
  if (dias === 0) return "Vence hoje";
  if (dias < 0) return `Venceu há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`;
  return `Vence em ${dias} dia${dias === 1 ? "" : "s"}`;
}

function ultimaNota(texto) {
  const linhas = String(texto || "")
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
  return linhas.length ? linhas[linhas.length - 1] : "";
}

function baseFiltrada(opcoes = {}) {
  const busca = semAcento(state.busca);
  return state.itens.filter((item) => {
    if (!opcoes.ignorarDivisao && state.divisao && semAcento(item.divisao) !== semAcento(state.divisao)) return false;
    if (state.estrategia && item.estrategia !== state.estrategia) return false;
    if (state.apresentacao && item.apresentacao !== state.apresentacao) return false;
    if (!busca) return true;
    const bloco = [item.acao, item.responsavel, item.divisao, item.acompanhamento, item.medida, item.estrategia]
      .map(semAcento)
      .join("\n");
    return bloco.includes(busca);
  });
}

function ordenar(lista) {
  return [...lista].sort((a, b) => {
    const da = analisarQuando(a.quando);
    const db = analisarQuando(b.quando);
    const na = da.tipo === "data" ? diferencaDias(da.iso) : 9999;
    const nb = db.tipo === "data" ? diferencaDias(db.iso) : 9999;
    return na - nb || a.divisao.localeCompare(b.divisao, "pt") || a.acao.localeCompare(b.acao, "pt");
  });
}

function agrupar(lista) {
  const mapa = new Map();
  ordenar(lista).forEach((item) => {
    const chave = item.divisao || "Sem divisão";
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(item);
  });
  return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt"));
}

function escapeHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataLegivel() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function horaLegivel(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function contar(lista) {
  const contas = { vencido: 0, vias: 0, prazo: 0, feito: 0, semData: 0, cancelado: 0 };
  lista.forEach((item) => {
    const situacao = situacaoDe(item);
    if (situacao === "sem-data") contas.semData += 1;
    else contas[situacao] += 1;
  });
  return contas;
}

function renderResumo(contas) {
  const partes = [];
  if (contas.vencido) partes.push(`${contas.vencido} vencida${contas.vencido === 1 ? "" : "s"}`);
  if (contas.vias) partes.push(`${contas.vias} vence${contas.vias === 1 ? "" : "m"} em até ${state.horizonte} dias`);
  const recorte = state.divisao ? `${state.divisao} · ` : "";
  $("resumo").textContent = partes.length
    ? `${dataLegivel()} · ${recorte}${partes.join(" · ")}`
    : `${dataLegivel()} · ${recorte}nada vencido nem por vencer neste filtro`;
}

function renderSync() {
  const hora = horaLegivel(state.atualizado);
  $("sync").textContent = hora
    ? `Planilha lida às ${hora}${state.gravacao ? " · gravação ligada" : " · só leitura"}`
    : "";
  $("btn-gravacao").textContent = state.gravacao ? "Gravação ligada" : "Ligar gravação";
  $("btn-gravacao").setAttribute("aria-pressed", state.gravacao ? "true" : "false");
}

function renderKpis(lista) {
  const contas = contar(lista);
  renderResumo(contas);
  const cards = [
    ["vencido", "Vencidas", contas.vencido, "vencido"],
    ["vias", `Vence em ${state.horizonte} dias`, contas.vias, "vias"],
    ["prazo", "No prazo", contas.prazo, "prazo"],
    ["sem-data", "Data a corrigir", contas.semData, "outro"],
    ["feito", "Concluídas", contas.feito, "feito"],
  ];
  $("kpis").innerHTML = cards
    .map(
      ([foco, rotulo, total, cor]) => `
      <button type="button" class="kpi ${cor} ${state.foco === foco ? "ativo" : ""}" data-foco="${foco}">
        <b>${total}</b>
        <span>${rotulo}</span>
      </button>`
    )
    .join("");
  $("kpis").querySelectorAll(".kpi").forEach((botao) => {
    const foco = botao.dataset.foco;
    const ativo = state.foco === "alerta" ? foco === "vencido" || foco === "vias" : state.foco === foco;
    botao.classList.toggle("ativo", ativo);
  });
}

function renderDivisoes() {
  const lista = baseFiltrada({ ignorarDivisao: true });
  const mapa = new Map();
  state.itens.forEach((item) => {
    const nome = item.divisao || "Sem divisão";
    const chave = semAcento(nome);
    if (!mapa.has(chave)) mapa.set(chave, { nome, alerta: 0 });
    else if ((item.divisao || "").length > mapa.get(chave).nome.length) mapa.get(chave).nome = item.divisao;
  });
  lista.forEach((item) => {
    const chave = semAcento(item.divisao || "Sem divisão");
    const situacao = situacaoDe(item);
    if ((situacao === "vencido" || situacao === "vias" || situacao === "sem-data") && mapa.has(chave)) {
      mapa.get(chave).alerta += 1;
    }
  });
  const chips = [...mapa.values()].sort((a, b) => b.alerta - a.alerta || a.nome.localeCompare(b.nome, "pt"));
  $("divisoes").innerHTML =
    `<button type="button" class="chip" data-divisao="" aria-pressed="${state.divisao === "" ? "true" : "false"}">Todas</button>` +
    chips
      .map((chip) => {
        const ativo = semAcento(state.divisao) === semAcento(chip.nome);
        const alerta = chip.alerta ? `<small>${chip.alerta}</small>` : "";
        return `<button type="button" class="chip" data-divisao="${escapeHtml(chip.nome)}" aria-pressed="${ativo ? "true" : "false"}">${escapeHtml(chip.nome)}${alerta}</button>`;
      })
      .join("");
}

function opcoesStatus(atual) {
  const lista = STATUS_PADRAO.includes(atual) || !atual ? [...STATUS_PADRAO] : [atual, ...STATUS_PADRAO];
  return lista
    .map((status) => `<option ${status === atual ? "selected" : ""}>${escapeHtml(status)}</option>`)
    .join("");
}

const LAPIS = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

function ficha(item) {
  const rascunho = state.rascunhos[item.linha] || {};
  const status = rascunho.status ?? item.status;
  const quando = rascunho.quando ?? item.quando;
  const responsavel = rascunho.responsavel ?? item.responsavel;
  const divisao = rascunho.divisao ?? item.divisao;
  const nota = rascunho.nota ?? "";
  const acao = rascunho.acao ?? item.acao;
  const historico = rascunho.acompanhamento ?? item.acompanhamento ?? "";
  const titulo = rascunho.liberadoAcao
    ? `<textarea class="acao-editavel" data-campo="acao">${escapeHtml(acao)}</textarea>`
    : `<p class="acao-titulo">${escapeHtml(acao)}</p>`;
  const comentarios = rascunho.liberadoHistorico
    ? `<textarea class="historico-editavel" data-campo="acompanhamento">${escapeHtml(historico)}</textarea>`
    : `<div class="historico" tabindex="0">${escapeHtml(historico || "Ainda não há anotação de acompanhamento.")}</div>`;
  return `
    <div class="ficha" data-linha="${item.linha}">
      <div class="bloco-editavel">
        <p class="rotulo-campo">O que fazer</p>
        ${titulo}
        <button type="button" class="lapis" data-lapis="acao" data-linha="${item.linha}" aria-pressed="${rascunho.liberadoAcao ? "true" : "false"}" aria-label="Editar o que fazer">${LAPIS}</button>
      </div>
      <p class="contexto">${escapeHtml(item.estrategia || "Sem estratégia")}${item.medida ? " · " + escapeHtml(item.medida) : ""}</p>
      <div class="bloco-editavel">
        ${comentarios}
        <button type="button" class="lapis" data-lapis="historico" data-linha="${item.linha}" aria-pressed="${rascunho.liberadoHistorico ? "true" : "false"}" aria-label="Editar comentários anteriores">${LAPIS}</button>
      </div>
      <div class="grade-edicao">
        <label>Status <em class="marca">substitui</em><select data-campo="status">${opcoesStatus(status)}</select></label>
        <label>Quando <em class="marca">substitui</em><input data-campo="quando" value="${escapeHtml(quando)}" placeholder="dd/mm/aaaa" /></label>
        <label>Divisão / assessoria <em class="marca">substitui</em><input data-campo="divisao" value="${escapeHtml(divisao)}" /></label>
        <label>Responsável <em class="marca">substitui</em><input data-campo="responsavel" value="${escapeHtml(responsavel)}" /></label>
        <label class="largo">Nova anotação da reunião <em class="marca">acrescenta</em>
          <textarea data-campo="nota" placeholder="O que ficou decidido hoje. Entra no final, sem apagar o histórico.">${escapeHtml(nota)}</textarea>
        </label>
      </div>
      <p class="regra-gravacao">O título e os comentários antigos só mudam pelo lápis e substituem a célula. A anotação nova é somada no final.</p>
      <p class="aviso" data-aviso></p>
      <div class="modal-acoes">
        <button type="button" class="btn btn-solido" data-salvar="${item.linha}">Salvar na planilha</button>
      </div>
    </div>`;
}

function cartao(item) {
  const situacao = situacaoDe(item);
  const nota = ultimaNota(item.acompanhamento);
  const aberto = state.aberto === item.linha;
  return `
    <article>
      <button type="button" class="item" data-abrir="${item.linha}" aria-expanded="${aberto}">
        <div class="item-topo">
          <div><span class="selo ${situacao === "sem-data" ? "outro" : situacao}">${escapeHtml(item.status || "Sem status")}</span><span class="acao">${escapeHtml(item.acao)}</span></div>
          <span class="prazo">${escapeHtml(textoPrazo(item))}</span>
        </div>
        <div class="item-meta">
          <span>${escapeHtml(item.divisao || "Sem divisão")}</span>
          <span>${escapeHtml(item.responsavel || "Sem responsável")}</span>
        </div>
        ${nota && !aberto ? `<p class="nota-previa">${escapeHtml(nota)}</p>` : ""}
      </button>
      ${aberto ? ficha(item) : ""}
    </article>`;
}

function coluna(titulo, legenda, lista) {
  const grupos = state.divisao ? [["", ordenar(lista)]] : agrupar(lista);
  const corpo = lista.length
    ? grupos
        .map(([nome, itens]) => `<section class="grupo">${nome ? `<h3>${escapeHtml(nome)} · ${itens.length}</h3>` : ""}${itens.map(cartao).join("")}</section>`)
        .join("")
    : `<p class="vazio">Nenhuma ação neste grupo.</p>`;
  return `<section class="coluna"><h2>${titulo}</h2><p class="legenda">${legenda}</p>${corpo}</section>`;
}

function somarDias(iso, dias) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return data.toISOString().slice(0, 10);
}

function donut(partes) {
  const total = partes.reduce((soma, parte) => soma + parte.valor, 0);
  if (!total) {
    return `<svg class="donut" viewBox="0 0 120 120" role="img" aria-label="Sem ações neste filtro"><circle cx="60" cy="60" r="42" fill="none" stroke="#e3d9cb" stroke-width="16"></circle><text class="donut-num" x="60" y="64" text-anchor="middle">0</text></svg>`;
  }
  const raio = 42;
  const circunferencia = 2 * Math.PI * raio;
  let percorrido = 0;
  const arcos = partes
    .filter((parte) => parte.valor > 0)
    .map((parte) => {
      const trecho = (parte.valor / total) * circunferencia;
      const arco = `<circle cx="60" cy="60" r="${raio}" fill="none" stroke="${parte.cor}" stroke-width="16" stroke-dasharray="${trecho} ${circunferencia - trecho}" stroke-dashoffset="${-percorrido}" transform="rotate(-90 60 60)"></circle>`;
      percorrido += trecho;
      return arco;
    })
    .join("");
  return `<svg class="donut" viewBox="0 0 120 120" role="img" aria-label="Distribuição das ações">${arcos}<text class="donut-num" x="60" y="58" text-anchor="middle">${total}</text><text class="donut-rotulo" x="60" y="74" text-anchor="middle">ações</text></svg>`;
}

function renderGraficos(lista) {
  const contas = contar(lista);
  const partes = [
    ["vencido", "Vencidas", contas.vencido, "#8f2430"],
    ["vias", `Em ${state.horizonte} dias`, contas.vias, "#c47b1a"],
    ["prazo", "No prazo", contas.prazo, "#1e3a5f"],
    ["sem-data", "Data a corrigir", contas.semData, "#8a8178"],
    ["feito", "Concluídas", contas.feito, "#1d5c45"],
    ["cancelado", "Canceladas", contas.cancelado, "#c4b8aa"],
  ];
  const legenda = partes
    .map(
      ([foco, rotulo, valor, cor]) => `
      <button type="button" data-foco="${foco}">
        <span><i class="ponto" style="background:${cor}"></i>${rotulo}</span>
        <b>${valor}</b>
      </button>`
    )
    .join("");

  const porDivisao = new Map();
  baseFiltrada({ ignorarDivisao: true }).forEach((item) => {
    const nome = item.divisao || "Sem divisão";
    const situacao = situacaoDe(item);
    if (!["vencido", "vias", "prazo"].includes(situacao)) return;
    if (!porDivisao.has(nome)) porDivisao.set(nome, { vencido: 0, vias: 0, prazo: 0 });
    porDivisao.get(nome)[situacao] += 1;
  });
  const linhas = [...porDivisao.entries()]
    .map(([nome, valores]) => ({ nome, ...valores, total: valores.vencido + valores.vias + valores.prazo }))
    .sort((a, b) => b.vencido - a.vencido || b.vias - a.vias || b.total - a.total || a.nome.localeCompare(b.nome, "pt"));
  const maior = Math.max(1, ...linhas.map((linha) => linha.total));
  const barras = linhas
    .map((linha) => {
      const largura = (tipo) => `${(linha[tipo] / maior) * 100}%`;
      const ativa = semAcento(state.divisao) === semAcento(linha.nome);
      return `<button type="button" class="barra-linha ${ativa ? "ativa" : ""}" data-divisao="${escapeHtml(linha.nome)}">
        <span class="barra-nome">${escapeHtml(linha.nome)}</span>
        <span class="barra-trilho" title="${linha.vencido} vencidas, ${linha.vias} em vias, ${linha.prazo} no prazo">
          <i class="vencido" style="width:${largura("vencido")}"></i>
          <i class="vias" style="width:${largura("vias")}"></i>
          <i class="prazo" style="width:${largura("prazo")}"></i>
        </span>
        <b>${linha.total}</b>
      </button>`;
    })
    .join("");

  const hoje = hojeIso();
  const dias = [{ rotulo: "Venc.", valor: contas.vencido, tipo: "vencido" }];
  for (let indice = 0; indice <= state.horizonte; indice += 1) {
    const iso = somarDias(hoje, indice);
    const valor = lista.filter((item) => {
      const quando = analisarQuando(item.quando);
      return quando.tipo === "data" && quando.iso === iso && !["feito", "cancelado"].includes(situacaoDe(item));
    }).length;
    dias.push({ rotulo: iso.slice(8) + "/" + iso.slice(5, 7), valor, tipo: indice === 0 ? "hoje" : "vias" });
  }
  const maiorDia = Math.max(1, ...dias.map((dia) => dia.valor));
  const colunasDia = dias
    .map(
      (dia) => `<div class="dia ${dia.tipo}">
        <b style="height:${Math.max(4, (dia.valor / maiorDia) * 92)}px" title="${dia.valor}"></b>
        <span>${dia.valor || ""}</span>
        <small>${dia.rotulo}</small>
      </div>`
    )
    .join("");

  $("graficos").innerHTML = `
    <article class="grafico">
      <h2>Situação</h2>
      <div class="donut-bloco">${donut(partes.map(([id, rotulo, valor, cor]) => ({ id, rotulo, valor, cor })))}<div class="legenda-grafico">${legenda}</div></div>
    </article>
    <article class="grafico">
      <h2>Por divisão</h2>
      <p class="legenda">Aberto: vencidas, em vias e no prazo. Clique para filtrar.</p>
      <div class="barras">${barras || `<p class="vazio">Nenhuma ação em aberto.</p>`}</div>
    </article>
    <article class="grafico">
      <h2>Quando vence</h2>
      <p class="legenda">Já vencidas e os próximos ${state.horizonte} dias.</p>
      <div class="colunas-dias">${colunasDia}</div>
    </article>`;
}

function renderPainel(lista) {
  const mapa = {
    vencido: lista.filter((item) => situacaoDe(item) === "vencido"),
    vias: lista.filter((item) => situacaoDe(item) === "vias"),
    prazo: lista.filter((item) => situacaoDe(item) === "prazo"),
    "sem-data": lista.filter((item) => situacaoDe(item) === "sem-data"),
    feito: lista.filter((item) => situacaoDe(item) === "feito"),
  };
  if (state.foco === "alerta") {
    $("painel").innerHTML = `<div class="colunas">
      ${coluna("Vencidas", "Prazo passou e a ação ainda não está concluída.", mapa.vencido)}
      ${coluna(`Em vias de vencer`, `Ainda abertas, com prazo nos próximos ${state.horizonte} dias.`, mapa.vias)}
    </div>`;
  } else if (state.foco === "feito") {
    const cancelados = lista.filter((item) => situacaoDe(item) === "cancelado");
    $("painel").innerHTML = `<div class="colunas">
      ${coluna("Concluídas", "Realizado, concluído ou entregue.", mapa.feito)}
      ${coluna("Canceladas", "Fora do radar de prazo.", cancelados)}
    </div>`;
  } else if (state.foco === "sem-data") {
    $("painel").innerHTML = coluna("Data a corrigir", "Ação em aberto com prazo ausente, contínuo ou inválido.", mapa["sem-data"]);
  } else if (state.foco === "prazo") {
    $("painel").innerHTML = coluna("No prazo", "Em aberto, fora da janela de vencimento.", mapa.prazo);
  } else {
    $("painel").innerHTML = coluna("Vencidas", "Prazo passou e a ação ainda não está concluída.", mapa.vencido);
  }
  const aberto = document.querySelector(".ficha .historico");
  if (aberto) aberto.scrollTop = aberto.scrollHeight;
}

function preencherFiltros() {
  const estrategias = [...new Set(state.itens.map((item) => item.estrategia).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
  const apresentacoes = [...new Set(state.itens.map((item) => item.apresentacao).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
  const estrategia = $("estrategia");
  const atualEstrategia = state.estrategia;
  estrategia.innerHTML = `<option value="">Todas as estratégias</option>` + estrategias.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  estrategia.value = atualEstrategia;
  const apresentacao = $("apresentacao");
  const atualApresentacao = state.apresentacao;
  apresentacao.innerHTML = `<option value="">Todas</option>` + apresentacoes.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  apresentacao.value = atualApresentacao;
}

function render() {
  const lista = baseFiltrada();
  renderKpis(lista);
  renderGraficos(lista);
  renderDivisoes();
  renderPainel(lista);
  renderSync();
}

function toast(mensagem) {
  const el = $("toast");
  el.textContent = mensagem;
  el.classList.add("visivel");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("visivel"), 3200);
}

async function carregar() {
  $("btn-atualizar").disabled = true;
  try {
    const resposta = await fetch("/api/acoes");
    const data = await resposta.json();
    if (!resposta.ok) throw new Error(data.erro || "Falha ao ler a planilha");
    state.itens = data.itens || [];
    state.atualizado = data.atualizado;
    state.gravacao = Boolean(data.gravacao);
    state.planilha = data.planilha || state.planilha;
    $("link-planilha").href = state.planilha || "#";
    preencherFiltros();
    render();
  } catch (error) {
    $("resumo").textContent = error.message;
  } finally {
    $("btn-atualizar").disabled = false;
  }
}

function lerRascunho(linha) {
  const previo = state.rascunhos[linha] || {};
  const fichaEl = document.querySelector(`.ficha[data-linha="${linha}"]`);
  if (!fichaEl) return previo;
  const campo = (nome) => fichaEl.querySelector(`[data-campo="${nome}"]`);
  return {
    ...previo,
    status: campo("status").value,
    quando: campo("quando").value.trim(),
    divisao: campo("divisao").value.trim(),
    responsavel: campo("responsavel").value.trim(),
    nota: campo("nota").value.trim(),
    acao: campo("acao") ? campo("acao").value : previo.acao,
    acompanhamento: campo("acompanhamento") ? campo("acompanhamento").value : previo.acompanhamento,
  };
}

function validarQuando(texto, anterior) {
  if (texto === String(anterior || "").trim()) return "";
  const analise = analisarQuando(texto);
  if (analise.tipo === "invalida") return "Essa data não existe. Use dd/mm/aaaa, por exemplo 30/09/2026.";
  return "";
}

async function salvar(linha) {
  const item = state.itens.find((atual) => atual.linha === linha);
  const rascunho = lerRascunho(linha);
  const aviso = document.querySelector(`.ficha[data-linha="${linha}"] [data-aviso]`);
  const erroData = validarQuando(rascunho.quando, item.quando);
  if (erroData) {
    aviso.textContent = erroData;
    return;
  }
  const payload = { linha, acaoEsperada: item.acao };
  if (rascunho.status !== (item.status || "")) payload.status = rascunho.status;
  if (rascunho.quando !== String(item.quando || "").trim()) payload.quando = rascunho.quando;
  if (rascunho.divisao !== String(item.divisao || "").trim()) payload.divisao = rascunho.divisao;
  if (rascunho.responsavel !== String(item.responsavel || "").trim()) payload.responsavel = rascunho.responsavel;
  if (rascunho.acao != null && rascunho.acao.trim() !== item.acao.trim()) {
    if (!rascunho.acao.trim()) {
      aviso.textContent = "O título não pode ficar vazio.";
      return;
    }
    payload.novoTitulo = rascunho.acao.trim();
  }
  if (rascunho.acompanhamento != null && rascunho.acompanhamento !== (item.acompanhamento || "")) {
    payload.acompanhamento = rascunho.acompanhamento;
  }
  if (rascunho.nota) payload.nota = rascunho.nota;
  const substituiu = ["status", "quando", "divisao", "responsavel", "novoTitulo", "acompanhamento"].some((campo) => campo in payload);
  if (!substituiu && !rascunho.nota) {
    aviso.textContent = "Nada novo para gravar.";
    return;
  }
  const botao = document.querySelector(`[data-salvar="${linha}"]`);
  botao.disabled = true;
  botao.textContent = "Salvando…";
  try {
    const resposta = await fetch("/api/acoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resposta.json();
    if (resposta.status === 409 && data.erro === "sem-script") {
      botao.disabled = false;
      botao.textContent = "Salvar na planilha";
      $("modal").showModal();
      return;
    }
    if (!resposta.ok || data.ok === false) {
      const texto = String(data.erro || "");
      throw new Error(
        texto.includes("<") || texto.length > 240
          ? "A planilha pode ter gravado, mas o Google não devolveu a confirmação. Atualize o painel."
          : texto || "Não foi possível gravar"
      );
    }
    delete state.rascunhos[linha];
    toast(
      rascunho.nota && substituiu
        ? "Células substituídas e anotação acrescentada"
        : rascunho.nota
          ? "Anotação acrescentada ao acompanhamento"
          : "Células substituídas na planilha"
    );
    await carregar();
  } catch (error) {
    aviso.textContent = error.message;
    botao.disabled = false;
    botao.textContent = "Salvar na planilha";
  }
}

function montarPauta() {
  const lista = baseFiltrada();
  const blocos = [
    ["Vencidas", lista.filter((item) => situacaoDe(item) === "vencido")],
    [`Em vias de vencer (${state.horizonte} dias)`, lista.filter((item) => situacaoDe(item) === "vias")],
    ["Data a corrigir", lista.filter((item) => situacaoDe(item) === "sem-data")],
  ];
  const linhas = [`PAUTA — ${dataLegivel()}`];
  blocos.forEach(([titulo, itens]) => {
    if (!itens.length) return;
    linhas.push("", titulo.toUpperCase());
    ordenar(itens).forEach((item) => {
      linhas.push(`• ${item.divisao || "Sem divisão"} — ${item.acao.replace(/\s+/g, " ")} — ${textoPrazo(item)} — ${item.responsavel || "sem responsável"}`);
      const nota = ultimaNota(item.acompanhamento);
      if (nota) linhas.push(`  ${nota}`);
    });
  });
  return linhas.join("\n");
}

async function abrirGravacao() {
  const config = await fetch("/api/config").then((resposta) => resposta.json());
  state.scriptUrl = config.scriptUrl || "";
  $("script-url").value = state.scriptUrl;
  $("erro-config").textContent = "";
  $("modal").showModal();
}

document.addEventListener("click", (evento) => {
  const lapis = evento.target.closest("[data-lapis]");
  if (lapis) {
    const linha = Number(lapis.dataset.linha);
    const item = state.itens.find((atual) => atual.linha === linha);
    const atual = lerRascunho(linha);
    if (lapis.dataset.lapis === "acao") {
      atual.liberadoAcao = !atual.liberadoAcao;
      if (atual.acao == null) atual.acao = item.acao;
    } else {
      atual.liberadoHistorico = !atual.liberadoHistorico;
      if (atual.acompanhamento == null) atual.acompanhamento = item.acompanhamento || "";
    }
    state.rascunhos[linha] = atual;
    render();
    return;
  }
  const kpi = evento.target.closest("[data-foco]");
  if (kpi) {
    state.foco = state.foco === kpi.dataset.foco ? "alerta" : kpi.dataset.foco;
    state.aberto = null;
    render();
    return;
  }
  const chip = evento.target.closest("[data-divisao]");
  if (chip) {
    state.divisao = chip.dataset.divisao;
    state.aberto = null;
    render();
    return;
  }
  const abrir = evento.target.closest("[data-abrir]");
  if (abrir) {
    const linha = Number(abrir.dataset.abrir);
    state.aberto = state.aberto === linha ? null : linha;
    render();
    return;
  }
  const salvarBtn = evento.target.closest("[data-salvar]");
  if (salvarBtn) salvar(Number(salvarBtn.dataset.salvar));
});

document.addEventListener("input", (evento) => {
  const campo = evento.target.closest("[data-campo]");
  if (!campo) return;
  const fichaEl = campo.closest(".ficha");
  state.rascunhos[fichaEl.dataset.linha] = lerRascunho(fichaEl.dataset.linha);
});

$("busca").addEventListener("input", (evento) => {
  state.busca = evento.target.value;
  render();
});
$("estrategia").addEventListener("change", (evento) => {
  state.estrategia = evento.target.value;
  state.aberto = null;
  render();
});
$("apresentacao").addEventListener("change", (evento) => {
  state.apresentacao = evento.target.value;
  state.aberto = null;
  render();
});
$("horizonte").addEventListener("change", (evento) => {
  state.horizonte = Number(evento.target.value);
  render();
});
$("btn-atualizar").addEventListener("click", carregar);
$("btn-gravacao").addEventListener("click", abrirGravacao);
$("btn-fechar-modal").addEventListener("click", () => $("modal").close());
$("btn-pauta").addEventListener("click", async () => {
  await navigator.clipboard.writeText(montarPauta());
  toast("Pauta copiada");
});
$("btn-copiar-script").addEventListener("click", async () => {
  const codigo = await fetch("/api/script").then((resposta) => resposta.text());
  await navigator.clipboard.writeText(codigo);
  toast("Código copiado");
});
$("form-gravacao").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const scriptUrl = $("script-url").value.trim();
  const resposta = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scriptUrl }),
  });
  const data = await resposta.json();
  if (!resposta.ok) {
    $("erro-config").textContent = data.erro || "Não foi possível salvar";
    return;
  }
  state.gravacao = Boolean(scriptUrl);
  $("modal").close();
  toast(scriptUrl ? "Gravação ativada" : "Gravação desligada");
  renderSync();
});

carregar();
