# Interfaz web del Analista de Conectividad Escolar

## Arquitectura

```text
Navegador
   |
   v
src/server.js
   |
   v
src/web-service.js
   |
   +--> src/agent.js en modo demo
   |       |
   |       +--> src/tools.js
   |               |
   |               +--> datos/resultados_filtrados.csv
   |
   +--> registrar_resultados()
   +--> exportarResultados({ maxInstituciones: 5 })
   +--> enviarAN8n()
             |
             v
           n8n -> Google Sheets -> reporte
```

El navegador nunca lee los CSV ni llama directamente a Gemini. El backend
mantiene los resultados reales localmente y envía al navegador únicamente una
muestra de diez filas.

## Inicio

Desde la raíz del proyecto:

```powershell
node src/server.js
```

Abrir:

```text
http://localhost:3000
```

El servidor escucha solamente en `127.0.0.1`.

## Modo demostración

El modo demo está activo por defecto porque la cuota de Gemini puede no estar
disponible. La consulta de demostración utiliza `agent.js` y las herramientas
locales, sin hacer llamadas a Gemini:

```text
Busca colegios rurales de San Martín y prepara los resultados para registrarlos.
```

El backend muestra los 1,373 códigos modulares únicos y 77,247 registros de la
consulta local. La tabla muestra hasta diez instituciones diferentes, tomando
un registro real representativo por `codigo_modular`. El total de registros no
se reduce ni se elimina del procesamiento interno.

Al pulsar **Registrar en Google Sheets**, el backend usa los resultados reales
guardados en memoria, prepara un payload con `maxInstituciones: 5` y lo envía
al webhook existente:

```text
http://localhost:5678/webhook-test/analista-conectividad
```

No se envían los 77,247 registros al webhook durante esta primera prueba.

## Endpoints

### `GET /api/health`

Devuelve el estado del servicio:

```json
{
  "ok": true,
  "service": "Analista de Conectividad Escolar",
  "mode": "demo"
}
```

### `POST /api/analyze`

Entrada:

```json
{
  "consulta": "Busca colegios rurales de San Martín"
}
```

Devuelve respuesta textual, herramienta utilizada, resumen y diez registros
de muestra. Los resultados completos permanecen en el backend para el botón
de registro.

### `POST /api/register`

No recibe registros del navegador. Utiliza la última consulta válida guardada
por el backend y ejecuta:

```text
registrar_resultados()
exportarResultados({ maxInstituciones: 5 })
enviarAN8n()
```

Si n8n no está disponible, devuelve un error claro y no se presenta una
confirmación de Google Sheets.

## n8n y Docker

Mantén n8n ejecutándose en Docker con el puerto `5678` publicado. El workflow
debe estar escuchando el webhook de prueba antes de pulsar el botón de
registro. La URL no se modifica.

El flujo esperado en n8n es:

```text
Webhook -> Code -> Google Sheets -> Respond to Webhook
```

## Modo Gemini

La interfaz está preparada mediante la separación `web-service.js`: el modo
demo usa el agente local y el punto de entrada HTTP no expone claves ni
archivos. Para activar Gemini posteriormente debe crearse un adaptador
reutilizable que reciba la consulta HTTP y use el ciclo de
`gemini-agent.js`/`gemini-agent-n8n.js` sin ejecutar esos scripts al importarlos.

No se activa Gemini automáticamente. La variable prevista sigue siendo:

```text
GEMINI_API_KEY
```

## Demostración

1. Inicia n8n y deja el webhook en modo escucha.
2. Ejecuta `node src/server.js`.
3. Abre `http://localhost:3000`.
4. Conserva o escribe la consulta de San Martín.
5. Pulsa **Analizar**.
6. Muestra el resumen, la herramienta y las diez filas.
7. Pulsa **Registrar en Google Sheets**.
8. Verifica la respuesta HTTP y la hoja de cálculo desde n8n.

La aplicación diferencia registros de instituciones únicas y conserva
`carencia_confirmada` como `No determinada`. Los registros disponibles
corresponden a servicios básicos. Estos datos no permiten confirmar por sí
solos la existencia de una carencia. La ausencia de un registro tampoco se
interpreta como una carencia confirmada.
