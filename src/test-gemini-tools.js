let GoogleGenAI;

try {
  ({ GoogleGenAI } = require("@google/genai"));
} catch (error) {
  console.error("El paquete @google/genai no esta instalado.");
  console.error("Instalalo con:");
  console.error("npm install @google/genai");
  process.exitCode = 1;
}

const { consultar_datos_educativos } = require("./tools");

const USER_PROMPT = "¿Qué datos contiene nuestro conjunto de datos educativos?";
const TOOL_NAME = "consultar_datos_educativos";

const toolDeclaration = {
  type: "function",
  name: TOOL_NAME,
  description: "Consulta localmente los datasets educativos disponibles, sus columnas, periodos, cobertura y limitaciones.",
  parameters: {
    type: "object",
    properties: {},
  },
};

function getFunctionCall(interaction) {
  return (interaction.steps || []).find((step) => step.type === "function_call");
}

function getText(interaction) {
  const steps = interaction.steps || [];
  const modelOutput = [...steps]
    .reverse()
    .find((step) => step.type === "model_output");
  return modelOutput?.text || interaction.output_text || "(Gemini no devolvio texto.)";
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
    console.log("Gemini no solicito la herramienta.");
    console.log("Respuesta recibida de Gemini:");
    console.log(getText(interaction));
    return;
  }

  console.log("Gemini solicito la herramienta.");
  console.log(`Nombre de la herramienta: ${functionCall.name}`);

  if (functionCall.name !== TOOL_NAME) {
    throw new Error(`Gemini solicito una herramienta no permitida: ${functionCall.name}`);
  }

  const toolResult = consultar_datos_educativos();
  console.log("Resultado devuelto por consultar_datos_educativos():");
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

  console.log("Respuesta final generada por Gemini:");
  console.log(getText(finalInteraction));
}

main().catch((error) => {
  console.error("La prueba de Gemini Function Calling fallo:");
  console.error(error.message);
  process.exitCode = 1;
});
