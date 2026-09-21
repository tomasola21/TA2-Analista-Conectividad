const assert = require("node:assert/strict");
const { runAgent } = require("./agent");

const requests = [
  "Busca colegios rurales de San Martín.",
  "Busca colegios rurales de San Martín con deuda.",
  "¿Dónde está ubicado el colegio con código 0789834?",
];

function resultCount(trace) {
  if (Array.isArray(trace.TOOL_RESULT?.resultados)) {
    return trace.TOOL_RESULT.resultados.length;
  }
  return trace.TOOL_RESULT?.encontrado ? 1 : 0;
}

function main() {
  const traces = requests.map(runAgent);

  assert.equal(traces[0].TOOL_SELECTION, "filtrar_colegios_rurales");
  assert.equal(traces[0].TOOL_CALL.arguments.departamento, "San Martín");
  assert.ok(resultCount(traces[0]) > 0);

  assert.equal(traces[1].TOOL_SELECTION, "filtrar_colegios_rurales");
  assert.equal(traces[1].TOOL_CALL.arguments.deuda_minima, 0.01);
  assert.ok(resultCount(traces[1]) > 0);

  assert.equal(traces[2].TOOL_SELECTION, "obtener_ubicacion_colegio");
  assert.equal(traces[2].TOOL_CALL.arguments.codigo_modular, "0789834");
  assert.equal(resultCount(traces[2]), 1);

  traces.forEach((trace, index) => {
    console.log(`\nPRUEBA ${index + 1}`);
    console.log(`Solicitud original: ${trace.USER_INPUT}`);
    console.log(`Herramienta seleccionada: ${trace.TOOL_SELECTION}`);
    console.log(`Argumentos enviados: ${JSON.stringify(trace.TOOL_CALL.arguments)}`);
    console.log(`Cantidad de resultados: ${resultCount(trace)}`);
    console.log(`Respuesta final: ${trace.FINAL_RESPONSE}`);
  });

  console.log("\nLas 3 pruebas del ciclo local del agente finalizaron correctamente.");
}

main();
