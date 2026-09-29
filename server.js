const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const planilha = require("./lib/planilha");

const PORT = 4173;
const PUBLIC = path.join(__dirname, "public");

function ipsLocais() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) found.push(net.address);
    }
  }
  return found;
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/acoes") {
      const data = await planilha.lerPlanilha();
      return send(res, 200, JSON.stringify({ ...data, planilha: planilha.PLANILHA_URL }));
    }
    if (req.method === "POST" && url.pathname === "/api/acoes") {
      const payload = await lerCorpo(req);
      try {
        const data = await planilha.postarScript({ ...payload, acao: "atualizar" });
        planilha.limparCache();
        return send(res, 200, JSON.stringify(data));
      } catch (error) {
        if (error.code === "sem-script") return send(res, 409, JSON.stringify({ ok: false, erro: "sem-script" }));
        return send(res, 502, JSON.stringify({ ok: false, erro: error.message }));
      }
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      const config = planilha.lerConfig();
      return send(res, 200, JSON.stringify({
        scriptUrl: config.scriptUrl || "",
        gravacao: Boolean(config.scriptUrl),
        ips: ipsLocais(),
        planilha: planilha.PLANILHA_URL,
      }));
    }
    if (req.method === "POST" && url.pathname === "/api/config") {
      const body = await lerCorpo(req);
      const scriptUrl = String(body.scriptUrl || "").trim();
      if (scriptUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(scriptUrl)) {
        return send(res, 400, JSON.stringify({ ok: false, erro: "Cole a URL que termina com /exec" }));
      }
      planilha.gravarConfig({ scriptUrl });
      planilha.limparCache();
      return send(res, 200, JSON.stringify({ ok: true, gravacao: Boolean(scriptUrl) }));
    }
    if (req.method === "GET" && url.pathname === "/api/script") {
      return send(res, 200, planilha.lerScript(), "text/plain; charset=utf-8");
    }

    const rel = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return send(res, 403, "forbidden", "text/plain");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return send(res, 404, "não encontrado", "text/plain; charset=utf-8");
    }
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
    return send(res, 200, fs.readFileSync(file), types[path.extname(file)] || "application/octet-stream");
  } catch (error) {
    return send(res, 500, JSON.stringify({ ok: false, erro: error.message }));
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log("O painel já está aberto em http://localhost:" + PORT);
    process.exit(0);
  }
  throw error;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Painel em http://localhost:" + PORT);
});
