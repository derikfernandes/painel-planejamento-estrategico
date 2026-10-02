const { lerPlanilha, postarScript, limparCache, PLANILHA_URL } = require("../lib/planilha");

module.exports = async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const data = await lerPlanilha();
      res.status(200).json({ ...data, planilha: PLANILHA_URL });
      return;
    }
    if (req.method === "POST") {
      try {
        const body = req.body || {};
        const comando = body.comando === "criar" ? "criar" : body.comando === "excluir" ? "excluir" : "atualizar";
        const data = await postarScript({ ...body, acao: comando });
        limparCache();
        res.status(200).json(data);
      } catch (error) {
        if (error.code === "sem-script") {
          res.status(409).json({ ok: false, erro: "sem-script" });
          return;
        }
        res.status(502).json({ ok: false, erro: error.message });
      }
      return;
    }
    res.status(405).json({ ok: false, erro: "Método não permitido" });
  } catch (error) {
    res.status(500).json({ ok: false, erro: error.message });
  }
};
