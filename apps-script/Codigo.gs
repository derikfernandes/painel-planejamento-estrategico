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
  if (pedido.acao === "criar") return criar_(pedido);
  if (pedido.acao === "excluir") return excluir_(pedido);
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

function criar_(pedido) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var titulo = String(pedido.novoTitulo || "").trim();
    if (!titulo) return { ok: false, erro: "O título não pode ficar vazio." };
    var sh = aba_();
    var linha = Math.max(sh.getLastRow() + 1, 2);
    sh.getRange(linha, 1).setValue(String(pedido.status || "A Realizar"));
    sh.getRange(linha, 2).setValue(titulo);
    if (pedido.eixo != null && String(pedido.eixo).trim()) sh.getRange(linha, 3).setValue(String(pedido.eixo).trim());
    if (pedido.quando != null && String(pedido.quando).trim()) gravarQuando_(sh, linha, String(pedido.quando));
    if (pedido.recursos != null && String(pedido.recursos).trim()) sh.getRange(linha, 5).setValue(String(pedido.recursos).trim());
    if (pedido.divisao != null && String(pedido.divisao).trim()) sh.getRange(linha, 6).setValue(String(pedido.divisao).trim());
    if (pedido.medida != null && String(pedido.medida).trim()) sh.getRange(linha, 7).setValue(String(pedido.medida).trim());
    if (pedido.responsavel != null && String(pedido.responsavel).trim()) sh.getRange(linha, 8).setValue(String(pedido.responsavel).trim());
    if (pedido.estrategia != null && String(pedido.estrategia).trim()) sh.getRange(linha, 9).setValue(String(pedido.estrategia).trim());
    if (pedido.pe != null && String(pedido.pe).trim()) sh.getRange(linha, 10).setValue(String(pedido.pe).trim());
    if (pedido.apresentacao != null && String(pedido.apresentacao).trim()) sh.getRange(linha, 11).setValue(String(pedido.apresentacao).trim());
    var acompanhamento = String(pedido.acompanhamento || "").trim();
    var nota = String(pedido.nota || "").trim();
    if (nota) {
      var carimbo = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM");
      var linhaNota = "- Em " + carimbo + ": " + nota;
      acompanhamento = acompanhamento ? acompanhamento + "\n" + linhaNota : linhaNota;
    }
    if (acompanhamento) sh.getRange(linha, 12).setValue(acompanhamento);
    SpreadsheetApp.flush();
    return { ok: true, linha: linha };
  } catch (err) {
    return { ok: false, erro: err.message || String(err) };
  } finally {
    lock.releaseLock();
  }
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
    if (pedido.novoTitulo != null) {
      var novoTitulo = String(pedido.novoTitulo).trim();
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

function excluir_(pedido) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var linha = Number(pedido.linha);
    if (!linha || linha < 2) return { ok: false, erro: "Linha inválida" };
    var sh = aba_();
    var atual = textoCelula_(sh.getRange(linha, 2).getValue());
    var esperada = String(pedido.acaoEsperada || "").replace(/\s+/g, " ").trim();
    if (!esperada) return { ok: false, erro: "Título esperado ausente" };
    if (atual.replace(/\s+/g, " ").trim() !== esperada) {
      return { ok: false, erro: "Essa linha mudou na planilha. Atualize o painel e tente de novo." };
    }
    sh.deleteRow(linha);
    SpreadsheetApp.flush();
    return { ok: true, linha: linha };
  } catch (err) {
    return { ok: false, erro: err.message || String(err) };
  } finally {
    lock.releaseLock();
  }
}

function gravarQuando_(sh, linha, texto) {
  var limpo = String(texto || "").trim().replace(/^'/, "");
  var range = sh.getRange(linha, 4);
  var m = limpo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) {
    range.setValue(limpo);
    return;
  }
  var dia = Number(m[1]);
  var mes = Number(m[2]);
  var ano = Number(m[3]);
  var data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    throw new Error("Data inválida");
  }
  var formatada = ("0" + dia).slice(-2) + "/" + ("0" + mes).slice(-2) + "/" + ano;
  range.setNumberFormat("@");
  range.setValue(formatada);
}
