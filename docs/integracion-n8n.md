# Integracion del agente local con n8n

## Objetivo

El agente local ejecuta el procesamiento de los CSV y produce un resultado
filtrado. n8n recibe solamente ese resultado JSON, no los archivos CSV
originales ni el contenido completo de las fuentes.

La arquitectura propuesta es:

```text
Solicitud del usuario
        |
        v
Agente local: agent.js + tools.js
        |
        v
exportar_resultados.js
        |
        v
n8n mediante Webhook o HTTP Request
        |
        +--> Google Sheets
        |
        +--> reporte en correo, archivo o documento
```

## Que recibe n8n

n8n debe recibir un objeto JSON como `datos/ejemplo_n8n.json`. El payload
contiene:

- `fecha_consulta`.
- `filtros` utilizados por el agente.
- `resumen.cantidad_registros`.
- `resumen.cantidad_instituciones_unicas`.
- `instituciones`, una lista deduplicada por `codigo_modular`.
- `registros`, los registros de servicio basico que fueron seleccionados.
- `reporte`, con resumen e interpretacion de las limitaciones.
- `campos_registro`, para documentar el esquema enviado.

Cada registro contiene código modular, nombre, ubicación administrativa,
coordenadas, servicio, consumo, deuda, indicador de pago, fecha de corte y
los estados `registro_servicio_basico` y `carencia_confirmada`.

## Como se evita enviar los CSV completos

`agent.js` usa `tools.js` para leer los archivos únicamente en el equipo
local. El exportador recibe `TOOL_RESULT`, no una ruta de archivo ni el CSV.

La función `exportarDesdeTrazaAgente()` toma solamente:

```js
trace.TOOL_RESULT.resultados
```

También admite `maxInstituciones`, que permite preparar un payload pequeño
para una demostración o para una primera prueba con n8n.

Ejemplo conceptual:

```js
const trace = runAgent("Busca colegios rurales de San Martín.");
const payload = exportarDesdeTrazaAgente(trace, {
  maxInstituciones: 5,
});
```

El archivo de ejemplo contiene cinco instituciones y no representa el envío
de los 77,247 registros disponibles en el resultado completo.

## Trazabilidad

La trazabilidad se conserva mediante:

- Nombre del agente.
- Fecha de consulta.
- Filtros aplicados.
- Código modular.
- Fecha de corte del registro.
- Cantidad de registros.
- Cantidad de instituciones únicas.
- Campo `cantidad_registros` por institución.

La cantidad de registros puede ser mayor que la cantidad de instituciones,
porque una institución puede tener varios registros de pagos.

## Insercion en Google Sheets

La integración desde el backend ya está implementada. La forma de operar el
workflow durante la demostración es:

1. Crear un nodo **Webhook** en n8n.
2. Ejecutar una consulta desde la interfaz web y pulsar el botón de registro.
3. Recibir el JSON en el nodo Webhook.
4. Usar un nodo **Code** o **Item Lists** para convertir `registros` en filas.
5. Usar un nodo **Google Sheets** con la operación de agregar filas.
6. Usar `resumen` y `reporte` para construir el reporte final.

Si n8n se ejecuta dentro de Docker, publica el puerto `5678` y el agente
corre directamente en el host, el agente normalmente debe llamar a:

```text
http://localhost:5678/webhook/<ruta>
```

La URL exacta dependerá del puerto publicado y de la ruta configurada en el
Webhook. Si el agente también se ejecuta dentro de un contenedor, debe
utilizar el nombre del servicio Docker de n8n cuando ambos contenedores estén
en la misma red. `host.docker.internal` solo sería necesario si un contenedor
debe acceder a un servicio que corre en el host.

No se deben crear credenciales automáticamente. Las credenciales de Google
Sheets se configurarían manualmente en n8n.

## Generacion del reporte

El mismo payload contiene la información para un reporte:

- Total de registros encontrados.
- Total de instituciones únicas.
- Filtros aplicados.
- Distribución por servicio.
- Deuda y consumo registrados.
- Fecha de corte.
- Limitaciones metodológicas.

El reporte debe decir “registro encontrado” cuando corresponda. No debe
afirmar que una institución carece de agua, luz o Internet solo porque no
aparezca un registro.

## Prueba local antes de n8n

El payload puede inspeccionarse localmente sin red:

```bash
node -e "const {runAgent}=require('./src/agent'); const {exportarDesdeTrazaAgente}=require('./src/exportar_resultados'); const t=runAgent('Busca colegios rurales de San Martín.'); console.log(JSON.stringify(exportarDesdeTrazaAgente(t,{maxInstituciones:5}),null,2));"
```

El archivo `datos/ejemplo_n8n.json` sirve como cuerpo de prueba para un
Webhook de n8n sin volver a enviar los CSV.
