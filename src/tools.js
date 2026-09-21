const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RESULTADOS_PATH = path.join(ROOT, "datos", "resultados_filtrados.csv");
const SERVICIOS_PATH = path.join(
  ROOT,
  "datos",
  "Listado de Servicios Educativos escolarizados_2.csv"
);
const PAGOS_PATH = path.join(ROOT, "datos", "pago_ssbb_local_escolar_0.csv");

const REQUIRED_RESULT_COLUMNS = [
  "codigo_modular",
  "nombre_institucion",
  "departamento",
  "provincia",
  "distrito",
  "ruralidad",
  "latitud",
  "longitud",
  "tipo_servicio_basico",
  "descripcion_servicio_basico",
  "CONSUMO",
  "DEUDA",
  "INDICADOR_PAGO",
  "fecha_corte",
];

let resultCache = null;

function parseCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    const next = text[i + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") i += 1;
      row.push(value);
      value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      value += character;
    }
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo requerido: ${filePath}`);
  }
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeCode(value) {
  const code = String(value ?? "").trim().replace(/\.0$/, "");
  if (!/^\d+$/.test(code)) return "";
  return code.padStart(7, "0");
}

function asNumber(value, fieldName) {
  const number = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(number)) {
    throw new Error(`El campo ${fieldName} debe ser numerico.`);
  }
  return number;
}

function getResults() {
  if (resultCache) return resultCache;
  const rows = readCsv(RESULTADOS_PATH);
  const missing = REQUIRED_RESULT_COLUMNS.filter((column) => !(column in (rows[0] || {})));
  if (missing.length > 0) {
    throw new Error(`Faltan columnas en resultados_filtrados.csv: ${missing.join(", ")}`);
  }
  resultCache = rows;
  return resultCache;
}

function datasetInfo(filePath, name, relevantColumns, period, coverage, limitations) {
  const rows = readCsv(filePath);
  return {
    nombre: name,
    registros: rows.length,
    columnas_relevantes: relevantColumns,
    periodo_fecha_corte: period,
    cobertura_geografica: coverage,
    limitaciones_conocidas: limitations,
  };
}

function consultar_datos_educativos() {
  try {
    return {
      ok: true,
      datasets: [
        datasetInfo(
          SERVICIOS_PATH,
          "Listado de Servicios Educativos escolarizados",
          ["COD_MOD", "CEN_EDU", "D_DPTO", "D_PROV", "D_DIST", "DAREACENSO", "CODGEO"],
          "Actualizacion observada: 10-06-2026",
          "Nacional, con departamento, provincia, distrito y ruralidad.",
          [
            "No contiene latitud ni longitud.",
            "No contiene Internet, electricidad, agua ni infraestructura.",
            "La ruralidad se expresa mediante DAREACENSO.",
          ]
        ),
        datasetInfo(
          PAGOS_PATH,
          "Registro de pago de servicios basicos de las IIEE de la region San Martin",
          [
            "CODIGO_MODULAR",
            "DESCRIPCION_TIPO",
            "CONSUMO",
            "DEUDA",
            "INDICADOR_PAGO",
            "LATITUD",
            "LONGITUD",
            "FECHA_CORTE",
          ],
          "Fecha de corte: 20250525 (25-05-2025)",
          "Region San Martin.",
          [
            "Representa registros de pago, no un censo de carencias.",
            "La ausencia de un registro no confirma que exista una carencia.",
            "No representa cobertura nacional.",
          ]
        ),
        datasetInfo(
          RESULTADOS_PATH,
          "Resultados rurales cruzados",
          REQUIRED_RESULT_COLUMNS,
          "Fecha de corte heredada del registro de pago: 20250525",
          "Servicios rurales con coincidencia en el registro de pagos, principalmente San Martin.",
          [
            "Contiene solo coincidencias del INNER JOIN.",
            "Un resultado encontrado significa registro de pago encontrado.",
            "La columna carencia_confirmada no determina una carencia.",
          ]
        ),
      ],
      identificador_comun: {
        primer_dataset: "COD_MOD",
        segundo_dataset: "CODIGO_MODULAR",
        normalizacion: "Texto numerico de siete digitos, conservando ceros iniciales.",
      },
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function validateFilterParams(params) {
  if (params === undefined || params === null) return {};
  if (typeof params !== "object" || Array.isArray(params)) {
    throw new Error("Los filtros deben ser un objeto.");
  }
  for (const field of ["departamento", "provincia", "distrito", "codigo_modular", "servicio"]) {
    if (params[field] !== undefined && typeof params[field] !== "string") {
      throw new Error(`El parametro ${field} debe ser texto.`);
    }
  }
  if (params.deuda_minima !== undefined) {
    const debt = asNumber(params.deuda_minima, "deuda_minima");
    if (debt < 0) throw new Error("deuda_minima no puede ser negativa.");
  }
  return params;
}

function projectResult(row) {
  return {
    codigo_modular: normalizeCode(row.codigo_modular),
    nombre_institucion: row.nombre_institucion,
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    ruralidad: row.ruralidad,
    latitud: row.latitud,
    longitud: row.longitud,
    servicio: row.tipo_servicio_basico,
    consumo: row.CONSUMO,
    deuda: row.DEUDA,
    indicador_pago: row.INDICADOR_PAGO,
    fecha_corte: row.fecha_corte,
    registro_servicio_basico: row.registro_servicio_basico,
    carencia_confirmada: row.carencia_confirmada,
  };
}

function filtrar_colegios_rurales(params = {}) {
  try {
    const filters = validateFilterParams(params);
    const minimumDebt =
      filters.deuda_minima === undefined
        ? undefined
        : asNumber(filters.deuda_minima, "deuda_minima");
    if (filters.codigo_modular !== undefined && !normalizeCode(filters.codigo_modular)) {
      throw new Error("codigo_modular debe contener un codigo numerico valido.");
    }
    const rows = getResults().filter((row) => {
      if (normalizeText(row.ruralidad) !== "RURAL") return false;
      if (filters.departamento && normalizeText(row.departamento) !== normalizeText(filters.departamento)) return false;
      if (filters.provincia && normalizeText(row.provincia) !== normalizeText(filters.provincia)) return false;
      if (filters.distrito && normalizeText(row.distrito) !== normalizeText(filters.distrito)) return false;
      if (filters.codigo_modular && normalizeCode(row.codigo_modular) !== normalizeCode(filters.codigo_modular)) return false;
      if (filters.servicio) {
        const service = normalizeText(filters.servicio);
        const type = normalizeText(row.tipo_servicio_basico);
        const description = normalizeText(row.descripcion_servicio_basico);
        if (type !== service && !description.includes(service)) return false;
      }
      if (minimumDebt !== undefined && asNumber(row.DEUDA, "DEUDA") < minimumDebt) return false;
      return true;
    });
    return { ok: true, cantidad: rows.length, filtros: filters, resultados: rows.map(projectResult) };
  } catch (error) {
    return { ok: false, error: error.message, resultados: [] };
  }
}

function obtener_ubicacion_colegio(params) {
  try {
    if (!params || typeof params.codigo_modular !== "string" || !params.codigo_modular.trim()) {
      throw new Error("codigo_modular es obligatorio y debe ser texto.");
    }
    const code = normalizeCode(params.codigo_modular);
    if (!code) throw new Error("codigo_modular debe contener un codigo numerico valido.");
    const row = getResults().find((candidate) => normalizeCode(candidate.codigo_modular) === code);
    if (!row) {
      return { ok: true, encontrado: false, mensaje: "No existe coincidencia para el codigo modular solicitado.", codigo_modular: code };
    }
    return {
      ok: true,
      encontrado: true,
      resultado: {
        codigo_modular: code,
        institucion: row.nombre_institucion,
        departamento: row.departamento,
        provincia: row.provincia,
        distrito: row.distrito,
        latitud: row.latitud,
        longitud: row.longitud,
      },
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function registrar_resultados(params) {
  try {
    if (!params || !Array.isArray(params.resultados)) {
      throw new Error("resultados debe ser un arreglo.");
    }
    if (typeof params.destino !== "string" || !params.destino.trim()) {
      throw new Error("destino es obligatorio y debe ser texto.");
    }
    return {
      ok: true,
      estado: "preparado",
      destino: params.destino.trim(),
      cantidad: params.resultados.length,
      resultados: params.resultados,
      integracion: "Google Sheets no esta conectada; no se realizo ninguna escritura externa.",
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = {
  consultar_datos_educativos,
  filtrar_colegios_rurales,
  obtener_ubicacion_colegio,
  registrar_resultados,
};
