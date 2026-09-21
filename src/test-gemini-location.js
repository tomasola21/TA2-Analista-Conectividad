let GoogleGenAI;

try {
  ({ GoogleGenAI } = require("@google/genai"));
} catch (error) {
  console.error("El paquete @google/genai no esta instalado.");
  console.error("Instalalo con:");
  console.error("npm install @google/genai");
  process.exitCode = 1;
}

const { obtener_ubicacion_colegio } = require("./tools");

const USER_PROMPT = "¿Dónde está ubicada la institución con código modular 0789834?";
const TOOL_NAME = "obtener_ubicacion_colegio";

const toolDeclaration = {
  type: "function",
  name: TOOL_NAME,
  description:
    "Permite consultar la ubicación geográfica registrada de una institución educativa mediante su código modular. Devuelve latitud y longitud cuando existe un registro coincidente.",
  parameters: {
    type: "object",
    properties: {
      codigo_modular: {
        type: "string",
        description: "Código modular de la institución educativa.",
      },
    },
    required: ["codigo_modular"],
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

  const toolResult = obtener_ubicacion_colegio(argumentsFromGemini);
  console.log("Resultado devuelto por obtener_ubicacion_colegio():");
  console.log(JSON.stringify(toolResult, null, 2));

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
        result: toolResult,
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
