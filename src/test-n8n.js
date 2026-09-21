const { runAgent } = require("./agent");
const {
  exportarDesdeTrazaAgente,
  enviarAN8n,
} = require("./exportar_resultados");

const WEBHOOK_URL = "http://localhost:5678/webhook-test/analista-conectividad";

async function main() {
  const traza = runAgent("Busca colegios rurales de San Martín.");
  const payload = exportarDesdeTrazaAgente(traza, {
    maxInstituciones: 5,
  });
  const response = await enviarAN8n(payload, WEBHOOK_URL);

  console.log("\nENVIO DE PRUEBA A N8N");
  console.log(`Cantidad de instituciones: ${payload.resumen.cantidad_instituciones_unicas}`);
  console.log(`Cantidad de registros: ${payload.resumen.cantidad_registros}`);
  console.log(`URL utilizada: ${WEBHOOK_URL}`);
  console.log(`Codigo HTTP recibido: ${response.status ?? "sin respuesta HTTP"}`);
  console.log("Respuesta de n8n:");
  if (response.respuesta === "") {
    console.log("(n8n respondio sin cuerpo de respuesta)");
  } else if (typeof response.respuesta === "string") {
    console.log(response.respuesta);
  } else if (response.respuesta !== null && response.respuesta !== undefined) {
    console.log(JSON.stringify(response.respuesta, null, 2));
  } else {
    console.log(response.error || "(n8n no devolvio contenido)");
  }

  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Error preparando el envio: ${error.message}`);
  process.exitCode = 1;
});
