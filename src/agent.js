const {
  filtrar_colegios_rurales,
  obtener_ubicacion_colegio,
} = require("./tools");

const AGENT_NAME = "Analista de Conectividad Escolar";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function analyzeIntent(userInput) {
  const text = normalizeText(userInput);
  const codeMatch = text.match(/\b\d{6,8}\b/);
  const departmentMatch = text.match(/\b(?:de|en)\s+(san\s+martin)\b/);
  const argumentsForFilter = {};

  if (departmentMatch) argumentsForFilter.departamento = "San Martín";
  if (text.includes("deuda")) argumentsForFilter.deuda_minima = 0.01;

  if (codeMatch && (text.includes("donde") || text.includes("ubicad"))) {
    return {
      tipo: "ubicacion_colegio",
      descripcion: "La solicitud pide la ubicacion de un codigo modular.",
      argumentos: { codigo_modular: codeMatch[0] },
    };
  }

  if (text.includes("colegio") || text.includes("colegios") || text.includes("rural")) {
    return {
      tipo: "busqueda_rural",
      descripcion: "La solicitud pide filtrar servicios educativos rurales.",
      argumentos: argumentsForFilter,
    };
  }

  return {
    tipo: "no_reconocida",
    descripcion: "No se reconocio una solicitud compatible con las herramientas locales.",
    argumentos: {},
  };
}

function selectTool(intent) {
  if (intent.tipo === "ubicacion_colegio") return "obtener_ubicacion_colegio";
  if (intent.tipo === "busqueda_rural") return "filtrar_colegios_rurales";
  return null;
}

function countInstitutions(rows) {
  return new Set(rows.map((row) => row.codigo_modular).filter(Boolean)).size;
}

function generateFinalResponse(userInput, toolName, toolResult) {
  if (!toolName) {
    return "No pude identificar una herramienta local adecuada para esta solicitud.";
  }

  if (!toolResult || toolResult.ok === false) {
    return `No fue posible completar la consulta local: ${toolResult?.error || "resultado no disponible"}.`;
  }

  if (toolName === "obtener_ubicacion_colegio") {
    if (!toolResult.encontrado) {
      return `No se encontro una coincidencia local para el codigo modular ${toolResult.codigo_modular}.`;
    }
    const place = toolResult.resultado;
    return [
      `El colegio con codigo modular ${place.codigo_modular} figura en los registros locales como ${place.institucion}.`,
      `Ubicacion: ${place.distrito}, ${place.provincia}, ${place.departamento}.`,
      `Coordenadas: latitud ${place.latitud}, longitud ${place.longitud}.`,
      "La ubicacion proviene del registro local cruzado y no implica una evaluacion de carencia.",
    ].join(" ");
  }

  const rows = toolResult.resultados || [];
  const institutions = countInstitutions(rows);
  const hasDebtFilter = toolResult.filtros?.deuda_minima !== undefined;
  const scope = toolResult.filtros?.departamento
    ? ` en el departamento de ${toolResult.filtros.departamento}`
    : "";
  const condition = hasDebtFilter
    ? " con registros cuya deuda es igual o superior a 0.01"
    : "";

  return [
    `Se consultaron los registros locales de servicios educativos rurales${scope}.`,
    `Se encontraron ${rows.length} registros correspondientes a ${institutions} instituciones${condition}.`,
    "La fuente registra pagos de servicios basicos; estos datos no permiten confirmar por si solos la existencia de una carencia.",
    "La ausencia de un registro tampoco se interpreta como carencia confirmada.",
  ].join(" ");
}

function runAgent(userInput) {
  if (typeof userInput !== "string" || !userInput.trim()) {
    throw new Error("La solicitud del usuario debe ser un texto no vacio.");
  }

  const trace = {
    agent: AGENT_NAME,
    USER_INPUT: userInput,
  };

  trace.ANALYZE_INTENT = analyzeIntent(userInput);
  trace.TOOL_SELECTION = selectTool(trace.ANALYZE_INTENT);
  trace.TOOL_CALL = trace.TOOL_SELECTION
    ? {
        tool: trace.TOOL_SELECTION,
        arguments: trace.ANALYZE_INTENT.argumentos,
      }
    : null;

  if (trace.TOOL_SELECTION === "filtrar_colegios_rurales") {
    trace.TOOL_RESULT = filtrar_colegios_rurales(trace.TOOL_CALL.arguments);
  } else if (trace.TOOL_SELECTION === "obtener_ubicacion_colegio") {
    trace.TOOL_RESULT = obtener_ubicacion_colegio(trace.TOOL_CALL.arguments);
  } else {
    trace.TOOL_RESULT = {
      ok: false,
      error: "No hay una herramienta local seleccionada.",
    };
  }

  trace.FINAL_RESPONSE = generateFinalResponse(
    userInput,
    trace.TOOL_SELECTION,
    trace.TOOL_RESULT
  );
  return trace;
}

module.exports = {
  AGENT_NAME,
  analyzeIntent,
  selectTool,
  runAgent,
};
