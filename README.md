# Analista de Conectividad Escolar

Agente de IA para el análisis de información educativa rural utilizando datos oficiales, procesamiento local y automatización con n8n y Google Sheets.

## Problema

La información educativa puede estar distribuida entre diferentes fuentes y formatos. Este proyecto permite consultar servicios educativos rurales, revisar registros de servicios básicos y preparar resultados trazables para una automatización posterior.

El sistema diferencia entre registros encontrados, instituciones únicas y carencias confirmadas. La ausencia de un registro no se interpreta como una carencia.

## ODS

**ODS 4 – Educación de calidad**

## Fuente de datos

Las fuentes son datos oficiales publicados en la **Plataforma Nacional de Datos Abiertos del Perú**.

Archivos locales utilizados:

- `datos/Listado de Servicios Educativos escolarizados_2.csv`
- `datos/pago_ssbb_local_escolar_0.csv`
- `datos/resultados_filtrados.csv`
- Sus diccionarios XLSX correspondientes.

El archivo `datos/pago_ssbb_local_escolar_0.csv` no se incluye en GitHub porque supera el límite de tamaño de archivo de GitHub. Debe conservarse localmente para ejecutar el procesamiento completo y obtenerse nuevamente desde la Plataforma Nacional de Datos Abiertos del Perú usando el nombre oficial del dataset. No se modifican los datos originales.

## Arquitectura

```text
Usuario
   ↓
Interfaz Web
   ↓
Backend Node.js
   ↓
Agente IA / Function Calling
   ↓
Herramientas locales
   ↓
Procesamiento de datos
   ↓
Exportación
   ↓
n8n
   ↓
Google Sheets
```

La demostración predeterminada utiliza el procesamiento local y no requiere una llamada a Gemini.

## Resultado de referencia

La consulta demo:

```text
Busca colegios rurales de San Martín y prepara los resultados para registrarlos.
```

produce:

- 1,373 instituciones educativas únicas.
- 77,247 registros de servicios básicos.
- Una muestra visual de hasta 10 instituciones deduplicadas por `codigo_modular`.
- Una exportación inicial a n8n limitada a 5 instituciones y 369 registros asociados.

## Herramientas

- `consultar_datos_educativos`: consulta metadatos, cobertura, periodos y limitaciones de las fuentes.
- `filtrar_colegios_rurales`: filtra los resultados reales por ruralidad, ubicación, código modular, servicio o deuda.
- `obtener_ubicacion_colegio`: consulta la ubicación registrada de un código modular.
- `registrar_resultados`: prepara resultados locales para una salida futura; no escribe directamente en Google Sheets.

## Tecnologías

- Node.js
- JavaScript
- HTML
- CSS
- Gemini
- Interactions API
- Function Calling
- n8n
- Google Sheets
- Datos Abiertos del Perú

## Instalación y ejecución

Requiere Node.js 20 o superior.

```bash
npm install
node src/server.js
```

Abrir en el navegador:

```text
http://localhost:3000
```

El modo demo está activo por defecto. También puede indicarse explícitamente en PowerShell:

```powershell
$env:DEMO_MODE = "true"
node src/server.js
```

## Modo demo

El modo demo utiliza `src/agent.js`, `src/tools.js` y los resultados locales. No ejecuta Gemini, no consume `GEMINI_API_KEY` y no envía los CSV a ningún modelo.

El navegador recibe un resumen y una muestra; los registros completos permanecen en el backend.

## Gemini

Los agentes Gemini utilizan la Interactions API y Function Calling. Para una integración posterior se requiere configurar la variable de entorno:

```text
GEMINI_API_KEY
```

Nunca se debe escribir su valor en el código ni publicarlo en GitHub. El archivo `.env.example` solo muestra el nombre de la variable.

Durante la demostración académica se recomienda mantener activo el modo demo para evitar consumo de cuota.

## n8n y Google Sheets

La integración existente utiliza el webhook local:

```text
http://localhost:5678/webhook-test/analista-conectividad
```

El flujo esperado en n8n es:

```text
Webhook
  ↓
Code
  ↓
Google Sheets
  ↓
Generar Reporte
  ↓
Respond to Webhook
```

El backend reutiliza `registrar_resultados()`, `exportarResultados()` y `enviarAN8n()`. El payload de demostración se limita a 5 instituciones y 369 registros asociados.

El webhook de prueba debe estar escuchando antes de pulsar **Registrar en Google Sheets**. Las credenciales de Google Sheets se configuran manualmente en n8n y no forman parte de este repositorio.

## Endpoints web

### `GET /api/health`

Devuelve el estado del servicio y el modo activo.

### `POST /api/analyze`

Recibe:

```json
{
  "consulta": "Busca colegios rurales de San Martín"
}
```

Devuelve la respuesta del agente local, el resumen y una muestra visual.

### `POST /api/register`

Utiliza la última consulta válida guardada en el backend, prepara el payload limitado y lo envía al webhook de n8n. No recibe registros desde el navegador.

## Limitación metodológica

Los registros disponibles corresponden a servicios básicos. Estos datos no permiten confirmar por sí solos la existencia de una carencia. La ausencia de un registro tampoco se interpreta como una carencia confirmada.

Por esta razón, `carencia_confirmada` conserva el valor `No determinada` cuando los datos no permiten confirmar una carencia. El proyecto no afirma que una institución carezca de Internet, electricidad, agua u otro servicio únicamente por ausencia de evidencia.

## Seguridad

- No se incluyen claves API, tokens, contraseñas ni credenciales de Google.
- `.env` y otros archivos de entorno están excluidos por `.gitignore`.
- `node_modules/` no se publica.
- El dataset de pagos mayor que 100 MB permanece local y no se sube al repositorio.
- El modo demo no ejecuta Gemini.

## Verificaciones locales

Pruebas permitidas sin Gemini:

```bash
node --check src/server.js
node --check src/web-service.js
node --check web/app.js
node src/test-tools.js
node src/test-agent.js
```

No ejecutar los archivos `test-gemini*.js`, `gemini-agent.js` ni `gemini-agent-n8n.js` durante la demostración en modo demo.
