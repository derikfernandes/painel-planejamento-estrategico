const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "config.json");
const SCRIPT_PATH = path.join(ROOT, "apps-script", "Codigo.gs");
const SHEET_ID = "1xjFBjLjKRViJ3fj8BevIRZNNxxHUTaPH4SI4DK6VhKQ";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const PLANILHA_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

const COLUNAS = [
  "status",
  "acao",
  "eixo",
  "quando",
  "recursos",
  "divisao",
  "medida",
  "responsavel",
  "estrategia",
  "pe",
  "apresentacao",
  "acompanhamento",
];

let cache = null;

function lerConfig() {
  if (process.env.SCRIPT_URL) return { scriptUrl: process.env.SCRIPT_URL.trim() };
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { scriptUrl: "" };
  }
}

function gravarConfig(config) {
  if (process.env.VERCEL) {
    const error = new Error("Neste endereço a gravação já fica na configuração do servidor.");
    error.code = "vercel";
    throw error;
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function itensDoCsv(text) {
  const rows = parseCsv(text);
  const itens = [];
  rows.forEach((cells, index) => {
    if (index === 0) return;
    const acao = (cells[1] || "").trim();
    if (!acao) return;
    const item = { linha: index + 1 };
    COLUNAS.forEach((key, col) => {
      item[key] = (cells[col] || "").replace(/\r/g, "").trim();
    });
    itens.push(item);
  });
  return itens;
}

function extrairJson(texto) {
  const bruto = String(texto || "").trim();
  if (bruto.startsWith("{") || bruto.startsWith("[")) {
    try {
      return JSON.parse(bruto);
    } catch {
      return null;
    }
  }
  const trecho = bruto.match(/\{[\s\S]*"ok"[\s\S]*\}/);
  if (!trecho) return null;
  try {
    return JSON.parse(trecho[0]);
  } catch {
    return null;
  }
}

function mesmaData(atual, esperado) {
  const limpar = (valor) => String(valor || "").trim().replace(/^'/, "");
  if (limpar(atual) === limpar(esperado)) return true;
  const partes = (valor) => {
    const match = limpar(valor).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) return null;
    let ano = Number(match[3]);
    if (ano < 100) ano += 2000;
    return `${ano}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  };
  const a = partes(atual);
  const b = partes(esperado);
  return Boolean(a && b && a === b);
}

async function textoDaPlanilha() {
  const response = await fetch(CSV_URL + "&cb=" + Date.now(), { redirect: "follow", cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível reler a planilha");
  return response.text();
}

function bateComPayload(item, payload) {
  const igual = (campo) =>
    String(item[campo] || "").replace(/\s+/g, " ").trim() === String(payload[campo] || "").replace(/\s+/g, " ").trim();
  if (payload.status != null && !igual("status")) return false;
  if (payload.divisao != null && !igual("divisao")) return false;
  if (payload.responsavel != null && !igual("responsavel")) return false;
  if (payload.quando != null && !mesmaData(item.quando, payload.quando)) return false;
  if (payload.novoTitulo != null) {
    const titulo = String(item.acao || "").replace(/\s+/g, " ").trim();
    const esperado = String(payload.novoTitulo).replace(/\s+/g, " ").trim();
    if (titulo !== esperado) return false;
  }
  if (payload.acompanhamento != null) {
    const texto = String(item.acompanhamento || "").replace(/\r\n/g, "\n").trim();
    const esperado = String(payload.acompanhamento).replace(/\r\n/g, "\n").trim();
    if (payload.nota) {
      if (!texto.includes(esperado) || !texto.includes(String(payload.nota).trim())) return false;
    } else if (texto !== esperado) return false;
  }
  if (payload.nota && !String(item.acompanhamento || "").includes(String(payload.nota).trim())) return false;
  return true;
}

async function textoDoScript(scriptUrl, payload) {
  const first = await fetch(scriptUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (first.status >= 300 && first.status < 400) {
    const location = first.headers.get("location");
    if (!location) return "";
    const second = await fetch(location, { method: "GET", redirect: "follow" });
    return second.text();
  }
  return first.text();
}

async function itensAoVivo(scriptUrl) {
  const json = extrairJson(await textoDoScript(scriptUrl, { acao: "listar" }));
  return json && Array.isArray(json.itens) ? json.itens : null;
}

async function conferirNaPlanilha(payload, scriptUrl) {
  if (scriptUrl) {
    const itens = await itensAoVivo(scriptUrl);
    if (itens) {
      const item = itens.find((atual) => atual.linha === Number(payload.linha));
      return Boolean(item && bateComPayload(item, payload));
    }
  }
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    if (tentativa) await new Promise((resolver) => setTimeout(resolver, 800));
    const item = itensDoCsv(await textoDaPlanilha()).find((atual) => atual.linha === Number(payload.linha));
    if (item && bateComPayload(item, payload)) return true;
  }
  return false;
}

function dataComoTexto(texto) {
  const limpo = String(texto || "").trim();
  const match = limpo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return limpo;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const invalida =
    ano < 2000 ||
    ano > 2100 ||
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia;
  if (invalida) return limpo;
  const formatada = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
  return `'${formatada}`;
}

async function postarScript(payload) {
  const { scriptUrl } = lerConfig();
  if (!scriptUrl) {
    const error = new Error("Gravação ainda não ativada");
    error.code = "sem-script";
    throw error;
  }
  const enviado = { ...payload };
  if (enviado.quando != null) enviado.quando = dataComoTexto(enviado.quando);
  const json = extrairJson(await textoDoScript(scriptUrl, enviado));
  const alterouCelula = ["novoTitulo", "acompanhamento", "quando", "status", "divisao", "responsavel"].some(
    (campo) => enviado[campo] != null
  );
  if (json) {
    if (json.ok === false) throw new Error(json.erro || "Não foi possível gravar");
    if (Array.isArray(json.itens) && (enviado.acao === "atualizar" || enviado.acao === "criar")) {
      throw new Error("A implantação publicada ainda é a antiga. Em Implantar, Gerenciar implantações, edite e escolha Nova versão.");
    }
    if (enviado.acao === "criar") {
      if (!json.linha) throw new Error("O Apps Script não devolveu a linha criada. Implante a versão nova do código.");
      const esperado = { ...enviado, linha: json.linha };
      if (!(await conferirNaPlanilha(esperado, scriptUrl))) {
        throw new Error("O objetivo novo não apareceu na planilha. Atualize o Apps Script e implante uma nova versão.");
      }
      return json;
    }
    if (alterouCelula && !(await conferirNaPlanilha(enviado, scriptUrl))) {
      throw new Error("A alteração não apareceu na planilha. Atualize o painel e confira a célula.");
    }
    return json;
  }
  if (enviado.acao === "atualizar" && (await conferirNaPlanilha(enviado, scriptUrl))) return { ok: true, conferido: true };
  throw new Error("O Google não confirmou a gravação. Atualize o painel e confira se a linha mudou.");
}

async function lerPlanilha() {
  const config = lerConfig();
  if (config.scriptUrl) {
    try {
      const data = await postarScript({ acao: "listar" });
      if (data && Array.isArray(data.itens)) {
        cache = { atualizado: new Date().toISOString(), origem: "planilha", gravacao: true, itens: data.itens };
        return cache;
      }
    } catch (error) {
      console.error("Falha ao ler pelo Apps Script, usando CSV:", error.message);
    }
  }
  const response = await fetch(CSV_URL, { redirect: "follow" });
  if (!response.ok) throw new Error("Não foi possível ler a planilha (" + response.status + ")");
  cache = {
    atualizado: new Date().toISOString(),
    origem: "planilha",
    gravacao: Boolean(config.scriptUrl),
    itens: itensDoCsv(await response.text()),
  };
  return cache;
}

function limparCache() {
  cache = null;
}

function lerScript() {
  return fs.readFileSync(SCRIPT_PATH, "utf8");
}

module.exports = {
  PLANILHA_URL,
  lerConfig,
  gravarConfig,
  lerPlanilha,
  postarScript,
  limparCache,
  lerScript,
};
