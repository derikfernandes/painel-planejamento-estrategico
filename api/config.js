const os = require("os");
const { lerConfig, gravarConfig, PLANILHA_URL } = require("../lib/planilha");

function ipsLocais() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) found.push(net.address);
    }
  }
  return found;
}

module.exports = async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const config = lerConfig();
      res.status(200).json({
        scriptUrl: process.env.VERCEL ? "" : config.scriptUrl || "",
        gravacao: Boolean(config.scriptUrl),
        ips: process.env.VERCEL ? [] : ipsLocais(),
        planilha: PLANILHA_URL,
      });
      return;
    }
    if (req.method === "POST") {
      const scriptUrl = String((req.body || {}).scriptUrl || "").trim();
      if (scriptUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(scriptUrl)) {
        res.status(400).json({ ok: false, erro: "Cole a URL que termina com /exec" });
        return;
      }
      gravarConfig({ scriptUrl });
      res.status(200).json({ ok: true, gravacao: Boolean(scriptUrl) });
      return;
    }
    res.status(405).json({ ok: false, erro: "Método não permitido" });
  } catch (error) {
    const status = error.code === "vercel" ? 400 : 500;
    res.status(status).json({ ok: false, erro: error.message });
  }
};
