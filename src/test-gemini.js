let GoogleGenAI;

try {
  ({ GoogleGenAI } = require("@google/genai"));
} catch (error) {
  console.error("El paquete @google/genai no esta instalado.");
  console.error("Instalalo con:");
  console.error("npm install @google/genai");
  process.exitCode = 1;
}

async function main() {
  if (!GoogleGenAI) return;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("No se encontro la variable de entorno GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: "Responde únicamente: conexión correcta",
  });

  console.log("Respuesta de Gemini:");
  console.log(response.text);
}

main().catch((error) => {
  console.error("La conexión con Gemini fallo:");
  console.error(error.message);
  process.exitCode = 1;
});
