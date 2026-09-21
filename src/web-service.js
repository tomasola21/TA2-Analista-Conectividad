const {
  runAgent,
} = require("./agent");
const {
  registrar_resultados,
} = require("./tools");
const {
  exportarResultados,
  enviarAN8n,
} = require("./exportar_resultados");

const WEBHOOK_URL = "http://localhost:5678/webhook-test/analista-conectividad";
const DEMO_MODE = process.env.DEMO_MODE !== "false";

let lastAnalysis = null;

function countUnique(rows) {
  return new Set(rows.map((row) => row.codigo_modular).filter(Boolean)).size;
}

function getSummary(toolResult, queriedAt) {
  const rows = toolResult.resultados || [];
  const filters = toolResult.filtros || {};
  const firstRow = rows[0] || {};
  return {
    institutions: countUnique(rows),
    records: rows.length,
    department: filters.departamento || firstRow.departamento || "No especificado",
    queryDate: queriedAt,
    cutoffDate: firstRow.fecha_corte || "No disponible",
  };
}

function getInstitutionSample(rows, limit = 10) {
  const seen = new Set();
  const sample = [];
  for (const row of rows) {
    if (!row.codigo_modular || seen.has(row.codigo_modular)) continue;
    seen.add(row.codigo_modular);
    sample.push(row);
    if (sample.length === limit) break;
  }
  return sample;
}

function publicAnalysis(trace, queriedAt) {
  const toolResult = trace.TOOL_RESULT;
  const rows = toolResult.resultados || [];
  return {
    ok: true,
    mode: "demo",
    modeLabel: "Modo demostración local",
    processing: "Procesamiento local",
    response: trace.FINAL_RESPONSE,
    tool: trace.TOOL_SELECTION,
    summary: getSummary(toolResult, queriedAt),
    results: getInstitutionSample(rows),
    displayedRecords: Math.min(rows.length, 10),
    displayedInstitutions: Math.min(countUnique(rows), 10),
  };
}

async function analyze(consulta) {
  if (!DEMO_MODE) {
    return {
      ok: false,
      status: 503,
      error: "El modo Gemini no esta expuesto como servicio HTTP en esta version. Activa DEMO_MODE=true para la demostracion local.",
    };
  }

  const queriedAt = new Date().toISOString();
  const trace = runAgent(consulta);
  const toolResult = trace.TOOL_RESULT;
  if (!toolResult || toolResult.ok !== true || !Array.isArray(toolResult.resultados)) {
    return {
      ok: false,
      status: 422,
      error: toolResult?.error || "La consulta no produjo resultados validos.",
    };
  }

  lastAnalysis = {
    trace,
    toolResult,
    queriedAt,
  };
  return publicAnalysis(trace, queriedAt);
}

async function register() {
  if (!lastAnalysis || !lastAnalysis.toolResult) {
    return {
      ok: false,
      status: 409,
      error: "Primero ejecuta una consulta con resultados reales.",
    };
  }

  const { toolResult, queriedAt } = lastAnalysis;
  if (!Array.isArray(toolResult.resultados) || toolResult.resultados.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "La ultima consulta no contiene resultados para registrar.",
    };
  }

  const registroResult = registrar_resultados({
    resultados: toolResult.resultados,
    destino: "google_sheets",
  });
  if (!registroResult.ok) {
    return {
      ok: false,
      status: 422,
      error: registroResult.error || "No se pudieron preparar los resultados.",
    };
  }

  const payload = exportarResultados({
    resultados: registroResult.resultados,
    filtros: toolResult.filtros || {},
    fechaConsulta: queriedAt,
    maxInstituciones: 5,
  });
  const n8nResponse = await enviarAN8n(payload, WEBHOOK_URL);
  if (!n8nResponse.ok) {
    return {
      ok: false,
      status: 502,
      error: n8nResponse.error || "n8n no pudo recibir el payload.",
      n8nStatus: n8nResponse.status,
    };
  }

  return {
    ok: true,
    message: "Resultados enviados correctamente a n8n y registrados en Google Sheets.",
    mode: "demo",
    webhookStatus: n8nResponse.status,
    institutions: payload.resumen.cantidad_instituciones_unicas,
    records: payload.resumen.cantidad_registros,
    url: WEBHOOK_URL,
  };
}

function health() {
  return {
    ok: true,
    service: "Analista de Conectividad Escolar",
    mode: DEMO_MODE ? "demo" : "gemini",
  };
}

module.exports = {
  analyze,
  register,
  health,
  DEMO_MODE,
};
