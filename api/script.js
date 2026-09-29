const { lerScript } = require("../lib/planilha");

module.exports = async function (req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido" });
    return;
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(lerScript());
};
