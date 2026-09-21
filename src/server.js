const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { analyze, register, health } = require("./web-service");

const PORT = Number(process.env.PORT || 3000);
const WEB_ROOT = path.resolve(__dirname, "..", "web");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("La solicitud supera el limite permitido."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("El cuerpo de la solicitud no es JSON valido."));
      }
    });
    request.on("error", reject);
  });
}

function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(WEB_ROOT, `.${requested}`);
  if (!filePath.startsWith(`${WEB_ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(error.code === "ENOENT" ? "Not found" : "Internal server error");
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, health());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      const body = await readJsonBody(request);
      if (typeof body.consulta !== "string" || !body.consulta.trim()) {
        sendJson(response, 400, { ok: false, error: "Escribe una consulta antes de analizar." });
        return;
      }
      const result = await analyze(body.consulta.trim());
      sendJson(response, result.status || 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/register") {
      const result = await register();
      sendJson(response, result.status || 200, result);
      return;
    }

    if (request.method === "GET") {
      serveStatic(request, response, url.pathname);
      return;
    }

    sendJson(response, 405, { ok: false, error: "Metodo no permitido." });
  } catch (error) {
    sendJson(response, error.message.includes("JSON") ? 400 : 500, {
      ok: false,
      error: error.message || "Error interno del servidor.",
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Analista de Conectividad Escolar disponible en http://localhost:${PORT}`);
  console.log("Modo demostracion local activo por defecto.");
});
