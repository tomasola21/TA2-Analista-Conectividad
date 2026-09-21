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
  registrar_resultados,
  filtrar_colegios_rurales,
} = require("./tools");

const USER_PROMPT = "Registra los resultados encontrados de la consulta de colegios rurales de San Martín.";
const TOOL_NAME = "registrar_resultados";

const toolDeclaration = {
  type: "function",
  name: TOOL_NAME,
  description:
    "Prepara resultados locales para una futura salida externa. Recibe un arreglo resultados y un destino. No conecta Google Sheets ni realiza escrituras externas.",
  parameters: {
    type: "object",
    properties: {
      resultados: {
        type: "array",
        description: "Resultados encontrados. Para esta prueba debe ser una muestra pequena de hasta cinco registros.",
        items: { type: "object" },
      },
      destino: {
        type: "string",
        description: "Identificador del destino futuro de los resultados.",
      },
    },
    required: ["resultados", "destino"],
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

  const generatedArguments = parseArguments(functionCall);
  console.log("Argumentos generados por Gemini:");
  console.log(JSON.stringify(generatedArguments, null, 2));

  const localSample = filtrar_colegios_rurales({
    codigo_modular: "0789834",
  });
  if (!localSample.ok) {
    throw new Error(`No se pudo obtener la muestra local: ${localSample.error}`);
  }

  // Los registros se obtienen localmente para no pedirle a Gemini datos que
  // no conoce ni enviarle los CSV. El destino puede venir de la llamada.
  const argumentos = {
    resultados: localSample.resultados.slice(0, 5),
    destino: generatedArguments.destino || "prueba_local",
  };
  const toolResult = registrar_resultados(argumentos);

  console.log("Resultado devuelto por registrar_resultados():");
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
