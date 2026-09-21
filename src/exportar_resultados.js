const AGENT_NAME = "Analista de Conectividad Escolar";

const OUTPUT_FIELDS = [
  "codigo_modular",
  "nombre_institucion",
  "departamento",
  "provincia",
  "distrito",
  "ruralidad",
  "latitud",
  "longitud",
  "servicio",
  "consumo",
  "deuda",
  "indicador_pago",
  "fecha_corte",
  "registro_servicio_basico",
  "carencia_confirmada",
];

function toNumberOrOriginal(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : value;
}

function normalizeCode(value) {
  const code = String(value ?? "").trim().replace(/\.0$/, "");
  return /^\d+$/.test(code) ? code.padStart(7, "0") : code;
}

function mapRecord(row) {
  return {
    codigo_modular: normalizeCode(row.codigo_modular),
    nombre_institucion: row.nombre_institucion ?? null,
    departamento: row.departamento ?? null,
    provincia: row.provincia ?? null,
    distrito: row.distrito ?? null,
    ruralidad: row.ruralidad ?? null,
    latitud: toNumberOrOriginal(row.latitud),
    longitud: toNumberOrOriginal(row.longitud),
    servicio: row.servicio ?? null,
    consumo: toNumberOrOriginal(row.consumo),
    deuda: toNumberOrOriginal(row.deuda),
    indicador_pago: row.indicador_pago ?? null,
    fecha_corte: row.fecha_corte ?? null,
    registro_servicio_basico: row.registro_servicio_basico ?? null,
    carencia_confirmada: row.carencia_confirmada ?? "No determinada",
  };
}

function validateInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("La entrada del exportador debe ser un objeto.");
  }
  if (!Array.isArray(input.resultados)) {
    throw new Error("La entrada debe contener resultados como arreglo.");
  }
  if (input.maxInstituciones !== undefined) {
    if (!Number.isInteger(input.maxInstituciones) || input.maxInstituciones < 1) {
      throw new Error("maxInstituciones debe ser un entero positivo.");
    }
  }
}

function exportarResultados(input) {
  validateInput(input);

  const allRecords = input.resultados.map(mapRecord);
  const selectedCodes = new Set();
  const records = [];

  for (const record of allRecords) {
    if (!record.codigo_modular) continue;
    if (
      input.maxInstituciones !== undefined &&
      !selectedCodes.has(record.codigo_modular) &&
      selectedCodes.size >= input.maxInstituciones
    ) {
      continue;
    }
    selectedCodes.add(record.codigo_modular);
    records.push(record);
  }

  const institutionMap = new Map();
  for (const record of records) {
    if (!institutionMap.has(record.codigo_modular)) {
      institutionMap.set(record.codigo_modular, {
        codigo_modular: record.codigo_modular,
        nombre_institucion: record.nombre_institucion,
        departamento: record.departamento,
        provincia: record.provincia,
        distrito: record.distrito,
        ruralidad: record.ruralidad,
        latitud: record.latitud,
        longitud: record.longitud,
        cantidad_registros: 0,
      });
    }
    institutionMap.get(record.codigo_modular).cantidad_registros += 1;
  }

  const cantidadInstitucionesOriginales = new Set(
    allRecords.map((record) => record.codigo_modular).filter(Boolean)
  ).size;

  return {
    version_payload: "1.0",
    agente: AGENT_NAME,
    fecha_consulta: input.fechaConsulta || new Date().toISOString(),
    filtros: input.filtros || {},
    resumen: {
      cantidad_registros: records.length,
      cantidad_instituciones_unicas: institutionMap.size,
      registros_recibidos: allRecords.length,
      instituciones_unicas_recibidas: cantidadInstitucionesOriginales,
      limite_instituciones_aplicado: input.maxInstituciones ?? null,
    },
    instituciones: [...institutionMap.values()],
    registros: records,
    reporte: {
      titulo: "Reporte de resultados del Analista de Conectividad Escolar",
      resumen:
        `Se exportaron ${records.length} registros correspondientes a ${institutionMap.size} instituciones educativas unicas.`,
      interpretacion:
        "Los datos representan registros encontrados de servicios basicos y no confirman por si solos una carencia.",
      limitaciones: [
        "La ausencia de un registro no se interpreta como carencia.",
        "La fuente de pagos corresponde a la region San Martin y no representa cobertura nacional.",
        "La cantidad de registros puede ser mayor que la cantidad de instituciones por existir varios pagos por institucion.",
      ],
    },
    campos_registro: OUTPUT_FIELDS,
  };
}

function exportarDesdeResultadoHerramienta(toolResult, options = {}) {
  if (!toolResult || toolResult.ok !== true) {
    throw new Error("El resultado de la herramienta no es valido o contiene un error.");
  }
  return exportarResultados({
    resultados: toolResult.resultados || [],
    filtros: toolResult.filtros || {},
    fechaConsulta: options.fechaConsulta,
    maxInstituciones: options.maxInstituciones,
  });
}

function exportarDesdeTrazaAgente(trace, options = {}) {
  if (!trace || !trace.TOOL_RESULT) {
    throw new Error("La traza del agente no contiene TOOL_RESULT.");
  }
  return exportarDesdeResultadoHerramienta(trace.TOOL_RESULT, options);
}

async function enviarAN8n(payload, webhookUrl, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("payload debe ser un objeto JSON.");
  }
  if (typeof webhookUrl !== "string" || !webhookUrl.trim()) {
    throw new Error("webhookUrl es obligatorio.");
  }

  let url;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error("webhookUrl no es una URL valida.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("webhookUrl debe utilizar HTTP o HTTPS.");
  }

  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("timeoutMs debe ser un entero positivo.");
  }
  if (typeof fetch !== "function") {
    throw new Error("Esta version de Node.js no expone fetch global.");
  }

  let body;
  try {
    body = JSON.stringify(payload);
  } catch (error) {
    throw new Error(`No se pudo serializar el payload: ${error.message}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });
    const responseText = await response.text();
    let responseData = responseText;
    try {
      if (responseText.trim() !== "") {
        responseData = JSON.parse(responseText);
      }
    } catch {
      // La respuesta puede ser texto plano; se conserva sin modificar.
    }

    const result = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: url.toString(),
      respuesta: responseData,
    };
    if (!response.ok) {
      result.error = `n8n respondio con HTTP ${response.status}.`;
      console.error(`n8n respondio con error HTTP ${response.status}.`);
    } else {
      console.log(`n8n respondio correctamente con HTTP ${response.status}.`);
    }
    return result;
  } catch (error) {
    const timedOut = error.name === "AbortError";
    const result = {
      ok: false,
      status: null,
      url: url.toString(),
      respuesta: null,
      error: timedOut
        ? `Timeout: n8n no respondio en ${timeoutMs} ms.`
        : `No se pudo conectar con n8n: ${error.message}`,
    };
    console.error(result.error);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  OUTPUT_FIELDS,
  exportarResultados,
  exportarDesdeResultadoHerramienta,
  exportarDesdeTrazaAgente,
  enviarAN8n,
};
