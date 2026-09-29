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
  const limpar = (valor) => String(valor || "").trim();
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

async function conferirNaPlanilha(payload) {
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    if (tentativa) await new Promise((resolver) => setTimeout(resolver, 800));
    const item = itensDoCsv(await textoDaPlanilha()).find((atual) => atual.linha === Number(payload.linha));
    if (!item) continue;
    const igual = (campo) =>
      String(item[campo] || "").replace(/\s+/g, " ").trim() === String(payload[campo] || "").replace(/\s+/g, " ").trim();
    if (payload.status != null && !igual("status")) continue;
    if (payload.divisao != null && !igual("divisao")) continue;
    if (payload.responsavel != null && !igual("responsavel")) continue;
    if (payload.quando != null && !mesmaData(item.quando, payload.quando)) continue;
    if (payload.nota && !String(item.acompanhamento || "").includes(String(payload.nota).trim())) continue;
    return true;
  }
  return false;
}

async function postarScript(payload) {
  const { scriptUrl } = lerConfig();
  if (!scriptUrl) {
    const error = new Error("Gravação ainda não ativada");
    error.code = "sem-script";
    throw error;
  }
  const body = JSON.stringify(payload);
  const first = await fetch(scriptUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body,
  });
  let texto = "";
  if (first.status >= 300 && first.status < 400) {
    const location = first.headers.get("location");
    if (location) {
      const second = await fetch(location, { method: "GET", redirect: "follow" });
      texto = await second.text();
    }
  } else {
    texto = await first.text();
  }
  const json = extrairJson(texto);
  if (json) {
    if (json.ok === false) throw new Error(json.erro || "Não foi possível gravar");
    return json;
  }
  if (payload.acao === "atualizar" && (await conferirNaPlanilha(payload))) return { ok: true, conferido: true };
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
