/**
 * Cole este arquivo no Apps Script da planilha (Extensões → Apps Script).
 * Implante como app da Web: executar como você, acesso para qualquer pessoa.
 * A planilha precisa estar aberta a partir deste projeto vinculado.
 */
function doGet(e) {
  return responder_(rotear_(e && e.parameter ? e.parameter : {}));
}

function doPost(e) {
  var corpo = {};
  try {
    corpo = JSON.parse(e.postData.contents);
  } catch (err) {
    corpo = e.parameter || {};
  }
  return responder_(rotear_(corpo));
}

function responder_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function rotear_(pedido) {
  if (pedido.acao === "atualizar") return atualizar_(pedido);
  return listar_();
}

function aba_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var cabecalho = sheets[i].getRange(1, 1, 1, 12).getDisplayValues()[0].join(" ").toLowerCase();
    if (cabecalho.indexOf("divis") !== -1 && cabecalho.indexOf("acompanhamento") !== -1) return sheets[i];
  }
  return sheets[0];
}

function textoCelula_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, "America/Sao_Paulo", "dd/MM/yyyy");
  }
  return String(valor || "").replace(/\r/g, "").trim();
}

function listar_() {
  var sh = aba_();
  var values = sh.getDataRange().getValues();
  var itens = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var acao = textoCelula_(r[1]);
    if (!acao) continue;
    itens.push({
      linha: i + 1,
      status: textoCelula_(r[0]),
      acao: acao,
      eixo: textoCelula_(r[2]),
      quando: textoCelula_(r[3]),
      recursos: textoCelula_(r[4]),
      divisao: textoCelula_(r[5]),
      medida: textoCelula_(r[6]),
      responsavel: textoCelula_(r[7]),
      estrategia: textoCelula_(r[8]),
      pe: textoCelula_(r[9]),
      apresentacao: textoCelula_(r[10]),
      acompanhamento: textoCelula_(r[11]),
    });
  }
  return { ok: true, atualizado: new Date().toISOString(), itens: itens };
}

function atualizar_(pedido) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var linha = Number(pedido.linha);
    if (!linha || linha < 2) return { ok: false, erro: "Linha inválida" };
    var sh = aba_();
    var atual = textoCelula_(sh.getRange(linha, 2).getValue());
    var esperada = String(pedido.acaoEsperada || "").replace(/\s+/g, " ").trim();
    if (atual.replace(/\s+/g, " ").trim() !== esperada) {
      return { ok: false, erro: "Essa linha mudou na planilha. Atualize o painel e tente de novo." };
    }
    if (pedido.status != null) sh.getRange(linha, 1).setValue(String(pedido.status));
    if (pedido.quando != null) gravarQuando_(sh, linha, String(pedido.quando));
    if (pedido.divisao != null) sh.getRange(linha, 6).setValue(String(pedido.divisao));
    if (pedido.responsavel != null) sh.getRange(linha, 8).setValue(String(pedido.responsavel));
    if (pedido.acao != null) {
      var novoTitulo = String(pedido.acao).trim();
      if (!novoTitulo) return { ok: false, erro: "O título não pode ficar vazio." };
      sh.getRange(linha, 2).setValue(novoTitulo);
    }
    if (pedido.acompanhamento != null) sh.getRange(linha, 12).setValue(String(pedido.acompanhamento));
    var nota = String(pedido.nota || "").trim();
    if (nota) {
      var cell = sh.getRange(linha, 12);
      var prev = textoCelula_(cell.getValue());
      var carimbo = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM");
      var linhaNota = "- Em " + carimbo + ": " + nota;
      cell.setValue(prev ? prev + "\n" + linhaNota : linhaNota);
    }
    SpreadsheetApp.flush();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message || String(err) };
  } finally {
    lock.releaseLock();
  }
}

function gravarQuando_(sh, linha, texto) {
  var m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) {
    sh.getRange(linha, 4).setValue(texto.trim());
    return;
  }
  var dia = Number(m[1]);
  var mes = Number(m[2]);
  var ano = Number(m[3]);
  var data = new Date(ano, mes - 1, dia, 12, 0, 0);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    throw new Error("Data inválida");
  }
  var range = sh.getRange(linha, 4);
  range.setValue(data);
  range.setNumberFormat("dd/MM/yyyy");
}
