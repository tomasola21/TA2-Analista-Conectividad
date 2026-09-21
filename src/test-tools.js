const assert = require("node:assert/strict");
const {
  consultar_datos_educativos,
  filtrar_colegios_rurales,
  obtener_ubicacion_colegio,
  registrar_resultados,
} = require("./tools");

function main() {
  const catalogo = consultar_datos_educativos();
  assert.equal(catalogo.ok, true);
  assert.equal(catalogo.datasets.length, 3);

  const filtrados = filtrar_colegios_rurales({ servicio: "LUZ" });
  assert.equal(filtrados.ok, true);
  assert.ok(filtrados.cantidad > 0);
  assert.ok(filtrados.resultados.every((row) => row.ruralidad === "Rural"));
  assert.ok(filtrados.resultados.every((row) => row.servicio === "LUZ"));

  const codigo = filtrados.resultados[0].codigo_modular;
  const ubicacion = obtener_ubicacion_colegio({ codigo_modular: codigo });
  assert.equal(ubicacion.ok, true);
  assert.equal(ubicacion.encontrado, true);
  assert.equal(ubicacion.resultado.codigo_modular, codigo);

  const inexistente = obtener_ubicacion_colegio({ codigo_modular: "9999999" });
  assert.equal(inexistente.ok, true);
  assert.equal(inexistente.encontrado, false);

  const registro = registrar_resultados({
    resultados: filtrados.resultados.slice(0, 2),
    destino: "pendiente_google_sheets",
  });
  assert.equal(registro.ok, true);
  assert.equal(registro.estado, "preparado");
  assert.equal(registro.cantidad, 2);

  console.log("Prueba consultar_datos_educativos: OK");
  console.log(`Prueba filtrar_colegios_rurales: OK (${filtrados.cantidad} registros LUZ)`);
  console.log(`Prueba obtener_ubicacion_colegio: OK (${codigo})`);
  console.log("Prueba obtener_ubicacion_colegio sin coincidencia: OK");
  console.log("Prueba registrar_resultados: OK");
}

main();
