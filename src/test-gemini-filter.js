let GoogleGenAI;

try {
  ({ GoogleGenAI } = require("@google/genai"));
} catch (error) {
  console.error("El paquete @google/genai no esta instalado.");
  console.error("Instalalo con:");
  console.error("npm install @google/genai");
  process.exitCode = 1;
}

const { filtrar_colegios_rurales } = require("./tools");

const USER_PROMPT = "Busca colegios rurales de San Martín.";
const TOOL_NAME = "filtrar_colegios_rurales";

const toolDeclaration = {
  type: "function",
  name: TOOL_NAME,
  description:
    "Consulta registros de instituciones educativas rurales y permite filtrarlos por departamento, provincia, distrito, codigo modular, servicio y si tienen deuda registrada.",
  parameters: {
    type: "object",
    properties: {
      departamento: {
        type: "string",
        description: "Departamento donde se ubican las instituciones.",
      },
      provincia: {
        type: "string",
        description: "Provincia donde se ubican las instituciones.",
      },
      distrito: {
        type: "string",
        description: "Distrito donde se ubican las instituciones.",
      },
      codigo_modular: {
        type: "string",
        description: "Codigo modular de la institucion educativa.",
      },
      servicio: {
        type: "string",
        description: "Tipo o descripcion del servicio basico, por ejemplo AGUA o LUZ.",
      },
      con_deuda: {
        type: "boolean",
        description: "Si es true, conserva registros con deuda registrada mayor que cero.",
      },
    },
  },
};

function getFunctionCall(interaction) {
  return (interaction.steps || []).find((step) => step.type === "function_call");
}

function getText(interaction) {
  const modelOutput = [...(interaction.steps || [])]
    .reverse()
    .find((step) => step.type === "model_output");
  return modelOutput?.text || interaction.output_text || "(Gemini no devolvio texto.)";
}

function parseArguments(functionCall) {
  if (!functionCall.arguments) return {};
  if (typeof functionCall.arguments === "string") {
    return JSON.parse(functionCall.arguments);
  }
  return functionCall.arguments;
}

function convertArgumentsToLocalTool(argumentsFromGemini) {
  const localArguments = { ...argumentsFromGemini };
  delete localArguments.con_deuda;
  if (argumentsFromGemini.con_deuda === true) {
    localArguments.deuda_minima = 0.01;
  }
  return localArguments;
}

function summarizeResult(toolResult) {
  const rows = toolResult.resultados || [];
  const institutions = new Set(rows.map((row) => row.codigo_modular).filter(Boolean));
  return {
    ok: toolResult.ok,
    cantidad_registros: toolResult.cantidad ?? rows.length,
    cantidad_instituciones_unicas: institutions.size,
    filtros: toolResult.filtros || {},
    muestra_primeros_10: rows.slice(0, 10),
    nota: "Se envia un resumen y una muestra; no se envian los registros completos ni los CSV.",
  };
}

async function main() {
  if (!GoogleGenAI) return;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("No se encontro la variable de entorno GEMINI_API_KEY.");
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const interaction = await client.interactions.create({
    model: "gemini-3.6-flash",
    input: USER_PROMPT,
    tools: [toolDeclaration],
  });

  const functionCall = getFunctionCall(interaction);
  if (!functionCall) {
    console.log("Gemini no solicito ninguna function call.");
    console.log("Respuesta recibida de Gemini:");
    console.log(getText(interaction));
    return;
  }

  console.log("Gemini solicito la herramienta.");
  console.log(`Nombre de la herramienta: ${functionCall.name}`);

  if (functionCall.name !== TOOL_NAME) {
    throw new Error(`Gemini solicito una herramienta no permitida: ${functionCall.name}`);
  }

  const argumentsFromGemini = parseArguments(functionCall);
  console.log("Argumentos generados por Gemini:");
  console.log(JSON.stringify(argumentsFromGemini, null, 2));

  const localArguments = convertArgumentsToLocalTool(argumentsFromGemini);
  const toolResult = filtrar_colegios_rurales(localArguments);
  const compactResult = summarizeResult(toolResult);

  console.log("Resumen del resultado local:");
  console.log(JSON.stringify(compactResult, null, 2));

  const callId = functionCall.call_id || functionCall.id;
  if (!callId) {
    throw new Error("Gemini no devolvio call_id para la funcion solicitada.");
  }

  const finalInteraction = await client.interactions.create({
    model: "gemini-3.6-flash",
    previous_interaction_id: interaction.id,
    input: [
      {
        type: "function_result",
        name: TOOL_NAME,
        call_id: callId,
        result: compactResult,
      },
    ],
  });

  console.log("Respuesta final de Gemini:");
  console.log(getText(finalInteraction));
}

main().catch((error) => {
  console.error("La prueba de Gemini Function Calling fallo:");
  console.error(error.message);
  process.exitCode = 1;
});
