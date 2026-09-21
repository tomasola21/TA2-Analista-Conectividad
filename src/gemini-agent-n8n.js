let GoogleGenAI;

try {
  ({ GoogleGenAI } = require("@google/genai"));
} catch (error) {
  console.error("El paquete @google/genai no esta instalado.");
  console.error("Instalalo con:");
  console.error("npm install @google/genai");
  process.exitCode = 1;
}

const {
  consultar_datos_educativos,
  filtrar_colegios_rurales,
  obtener_ubicacion_colegio,
  registrar_resultados,
} = require("./tools");
const toolsSchema = require("./tools-schema");
const {
  exportarResultados,
  enviarAN8n,
} = require("./exportar_resultados");

const AGENT_NAME = "Analista de conectividad escolar";
const MODEL = "gemini-3.6-flash";
const MAX_TOOL_ROUNDS = 10;
const USER_PROMPT = "Busca colegios rurales de San Martín y prepara los resultados para registrarlos.";
const WEBHOOK_URL = "http://localhost:5678/webhook-test/analista-conectividad";

const SYSTEM_PROMPT = `Eres el agente "Analista de conectividad escolar".

Analizas información oficial de servicios educativos y registros de servicios básicos para apoyar la identificación y consulta de colegios rurales.

Reglas obligatorias:
1. Utiliza las herramientas disponibles para obtener información real.
2. Nunca inventes colegios, códigos modulares, coordenadas, consumos, deudas ni resultados.
3. Nunca afirmes que una institución carece de un servicio únicamente porque no existe un registro de pago.
4. Respeta carencia_confirmada exactamente como venga de la herramienta.
5. Indica cuando la información complementaria de servicios básicos corresponde a San Martín.
6. Informa fechas de corte o actualización cuando sean relevantes.
7. Si una consulta es ambigua y necesita información adicional, pide aclaración.
8. Mantén un tono profesional e institucional.
9. Explica las limitaciones de los datos cuando sean importantes.
10. Los CSV se procesan localmente. Solo recibes metadatos, argumentos necesarios y resultados resumidos.
11. Para registrar resultados, utiliza únicamente información obtenida previamente mediante una herramienta de consulta. No inventes registros.
12. Si se solicitan registros sin resultados previos, primero consulta los datos necesarios.
13. No realices escrituras externas desde este agente. registrar_resultados solo prepara datos.
14. No afirmes que Google Sheets fue actualizado.

Reglas de enrutamiento:
15. Utiliza consultar_datos_educativos UNICAMENTE cuando el usuario pregunte explicitamente por fuentes de datos, datasets, estructura, variables o columnas, cobertura, fechas de actualizacion o corte, metodologia o limitaciones de las fuentes.
16. No utilices consultar_datos_educativos para buscar, filtrar o ubicar colegios, buscar colegios rurales, buscar por departamento, provincia, distrito o codigo modular, consultar deuda, preparar resultados o registrar resultados.
17. Para busquedas de colegios rurales utiliza directamente filtrar_colegios_rurales.
18. Para busquedas de ubicacion por codigo modular utiliza directamente obtener_ubicacion_colegio.
19. Si filtrar_colegios_rurales ya produjo resultados y el usuario solicita preparar o registrar esos resultados, utiliza los resultados reales almacenados en state.resultadosReales y no vuelvas a consultar metadatos.
20. No inventes resultados. registrar_resultados debe trabajar con los resultados reales almacenados localmente.
21. Despues de recibir un resultado exitoso de registrar_resultados, genera la respuesta final y no solicites herramientas adicionales.
22. Prioriza siempre la herramienta directamente relacionada con la intencion del usuario y evita llamadas innecesarias.

Distingue siempre entre datos encontrados, datos no encontrados, ausencia de evidencia y carencia confirmada.`;

const localTools = {
  consultar_datos_educativos,
  filtrar_colegios_rurales,
  obtener_ubicacion_colegio,
  registrar_resultados,
};

const geminiTools = toolsSchema.map(({ name, description, parameters }) => ({
  type: "function",
  name,
  description,
  parameters,
}));

function parseArguments(functionCall) {
  if (!functionCall.arguments) return {};
  if (typeof functionCall.arguments === "string") {
    return JSON.parse(functionCall.arguments);
  }
  return functionCall.arguments;
}

function getFunctionCalls(interaction) {
  return (interaction.steps || []).filter((step) => step.type === "function_call");
}

function getFinalText(interaction) {
  const modelOutput = [...(interaction.steps || [])]
    .reverse()
    .find((step) => step.type === "model_output");
  return modelOutput?.text || interaction.output_text || "(Gemini no devolvio texto.)";
}

function countUniqueInstitutions(rows) {
  return new Set(rows.map((row) => row.codigo_modular).filter(Boolean)).size;
}

function summarizeForGemini(toolName, result) {
  if (toolName === "filtrar_colegios_rurales" && result.ok) {
    const rows = result.resultados || [];
    return {
      ok: true,
      cantidad_registros: result.cantidad ?? rows.length,
      cantidad_instituciones_unicas: countUniqueInstitutions(rows),
      filtros: result.filtros,
      muestra: rows.slice(0, 5),
      nota: "Los registros completos permanecen localmente; solo se envia un resumen y una muestra.",
    };
  }

  if (toolName === "registrar_resultados" && result.ok) {
    return {
      ok: true,
      estado: result.estado,
      destino: result.destino,
      cantidad: result.cantidad,
      integracion: result.integracion,
    };
  }

  return result;
}

function summarizeForConsole(toolName, result) {
  return summarizeForGemini(toolName, result);
}

function createToolState() {
  return {
    resultadosObtenidos: false,
    resultadosReales: [],
    ultimosFiltros: {},
  };
}

function executeTool(toolName, argumentsValue, state) {
  if (!Object.prototype.hasOwnProperty.call(localTools, toolName)) {
    return {
      ok: false,
      error: `Herramienta desconocida: ${toolName}. No fue ejecutada.`,
    };
  }

  if (toolName === "registrar_resultados") {
    if (!state.resultadosObtenidos || state.resultadosReales.length === 0) {
      return {
        ok: false,
        error: "No existen resultados reales obtenidos previamente. Primero debe realizarse una consulta.",
      };
    }

    return registrar_resultados({
      resultados: state.resultadosReales,
      destino: argumentsValue.destino,
    });
  }

  const result = localTools[toolName](argumentsValue);
  if (
    toolName === "filtrar_colegios_rurales" &&
    result.ok === true &&
    Array.isArray(result.resultados) &&
    result.resultados.length > 0
  ) {
    state.resultadosObtenidos = true;
    state.resultadosReales = result.resultados;
    state.ultimosFiltros = result.filtros || {};
  }
  return result;
}

function createExportPayload(registroResult, state) {
  if (!registroResult || registroResult.ok !== true) {
    throw new Error("No se puede exportar: registrar_resultados no fue exitoso.");
  }

  return exportarResultados({
    resultados: registroResult.resultados || state.resultadosReales,
    filtros: state.ultimosFiltros,
    fechaConsulta: new Date().toISOString(),
    maxInstituciones: 5,
  });
}

async function main() {
  if (!GoogleGenAI) return;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("No se encontro la variable de entorno GEMINI_API_KEY.");
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const state = createToolState();
  let interaction = await client.interactions.create({
    model: MODEL,
    input: USER_PROMPT,
    system_instruction: SYSTEM_PROMPT,
    tools: geminiTools,
  });

  console.log("========================================");
  console.log("AGENTE GEMINI + N8N");
  console.log("========================================");
  console.log(`Pregunta:\n${USER_PROMPT}`);

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round += 1) {
    const functionCalls = getFunctionCalls(interaction);
    if (functionCalls.length === 0) {
      console.log("\n[RESPUESTA FINAL GEMINI]");
      console.log(getFinalText(interaction));
      return;
    }

    console.log(`\n[RONDA ${round}]`);
    const functionResults = [];

    for (const functionCall of functionCalls) {
      const argumentsValue = parseArguments(functionCall);
      console.log(`Herramienta: ${functionCall.name}`);
      console.log("Argumentos:");
      console.log(JSON.stringify(
        functionCall.name === "registrar_resultados"
          ? { destino: argumentsValue.destino, resultados: "se usan resultados reales locales" }
          : argumentsValue,
        null,
        2
      ));

      let result;
      try {
        result = executeTool(functionCall.name, argumentsValue, state);
      } catch (error) {
        result = { ok: false, error: error.message };
      }

      console.log("Resultado local:");
      console.log(JSON.stringify(summarizeForConsole(functionCall.name, result), null, 2));

      if (functionCall.name === "registrar_resultados" && result.ok === true) {
        try {
          const payload = createExportPayload(result, state);
          console.log("\n[EXPORTACION]");
          console.log(`Instituciones: ${payload.resumen.cantidad_instituciones_unicas}`);
          console.log(`Registros: ${payload.resumen.cantidad_registros}`);

          const n8nResponse = await enviarAN8n(payload, WEBHOOK_URL);
          console.log("\n[ENVIO A N8N]");
          console.log(`URL: ${WEBHOOK_URL}`);
          console.log(`HTTP: ${n8nResponse.status ?? "sin respuesta HTTP"}`);
          console.log("\n[RESPUESTA DE N8N]");
          if (n8nResponse.respuesta === "") {
            console.log("(n8n respondio sin cuerpo de respuesta)");
          } else if (typeof n8nResponse.respuesta === "string") {
            console.log(n8nResponse.respuesta);
          } else {
            console.log(JSON.stringify(n8nResponse.respuesta ?? n8nResponse.error, null, 2));
          }

          result = {
            ...result,
            exportacion: {
              ok: true,
              instituciones: payload.resumen.cantidad_instituciones_unicas,
              registros: payload.resumen.cantidad_registros,
            },
            n8n: {
              ok: n8nResponse.ok,
              status: n8nResponse.status,
              error: n8nResponse.error,
            },
          };
        } catch (error) {
          console.error(`Error de exportacion o envio a n8n: ${error.message}`);
          result = {
            ...result,
            exportacion: { ok: false, error: error.message },
          };
        }
      }

      functionResults.push({
        type: "function_result",
        name: functionCall.name,
        call_id: functionCall.call_id || functionCall.id,
        result: summarizeForGemini(functionCall.name, result),
      });
    }

    interaction = await client.interactions.create({
      model: MODEL,
      previous_interaction_id: interaction.id,
      input: functionResults,
      system_instruction: SYSTEM_PROMPT,
      tools: geminiTools,
    });
  }

  throw new Error(`Se alcanzo el limite de ${MAX_TOOL_ROUNDS} rondas de herramientas.`);
}

main().catch((error) => {
  console.error("El agente Gemini + n8n fallo:");
  console.error(error.message);
  process.exitCode = 1;
});
