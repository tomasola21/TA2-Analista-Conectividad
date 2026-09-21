const OpenAI = require("openai");

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("No se encontro la variable de entorno OPENAI_API_KEY.");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await client.responses.create({
    model: "gpt-5.6-luna",
    input: "Responde únicamente: conexión correcta",
  });

  console.log("Respuesta de OpenAI:");
  console.log(response.output_text);
}

main().catch((error) => {
  console.error("La conexión con OpenAI fallo:");
  console.error(error.message);
  process.exitCode = 1;
});
