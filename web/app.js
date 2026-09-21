const form = document.querySelector("#query-form");
const queryInput = document.querySelector("#query");
const analyzeButton = form.querySelector("button");
const registerButton = document.querySelector("#register-button");
const resultsSection = document.querySelector("#results-section");
const alertBox = document.querySelector("#alert");

function setStep(stepName) {
  const order = ["waiting", "analyzing", "processing", "complete"];
  document.querySelectorAll(".process-step").forEach((step) => {
    const current = order.indexOf(step.dataset.step);
    const target = order.indexOf(stepName);
    step.classList.toggle("active", current === target);
    step.classList.toggle("done", current < target);
  });
}

function showAlert(message, type = "error") {
  alertBox.textContent = message;
  alertBox.className = `alert ${type}`;
}

function clearAlert() {
  alertBox.className = "alert hidden";
  alertBox.textContent = "";
}

function escapeHtml(value) {
  return String(value ?? "—").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character]));
}

function renderTable(rows) {
  const body = document.querySelector("#results-body");
  body.innerHTML = rows.map((row) => `<tr>
    <td>${escapeHtml(row.codigo_modular)}</td>
    <td>${escapeHtml(row.nombre_institucion)}</td>
    <td>${escapeHtml(row.departamento)}</td>
    <td>${escapeHtml(row.provincia)}</td>
    <td>${escapeHtml(row.distrito)}</td>
    <td>${escapeHtml(row.latitud)}</td>
    <td>${escapeHtml(row.longitud)}</td>
    <td>${escapeHtml(row.servicio)}</td>
    <td>${escapeHtml(row.consumo)}</td>
    <td>${escapeHtml(row.deuda)}</td>
    <td>${escapeHtml(row.indicador_pago)}</td>
    <td>${escapeHtml(row.ruralidad)}</td>
    <td>${escapeHtml(row.carencia_confirmada)}</td>
  </tr>`).join("");
}

function renderAnalysis(data) {
  const summary = data.summary;
  const oldWarning = "La fuente registra pagos de servicios basicos; estos datos no permiten confirmar por si solos la existencia de una carencia. La ausencia de un registro tampoco se interpreta como carencia confirmada.";
  const methodologyWarning = "Los registros disponibles corresponden a servicios básicos. Estos datos no permiten confirmar por sí solos la existencia de una carencia. La ausencia de un registro tampoco se interpreta como una carencia confirmada.";
  const responseWithoutWarning = String(data.response || "").replace(oldWarning, "").trim();
  document.querySelector("#agent-response").textContent = [responseWithoutWarning, methodologyWarning].filter(Boolean).join(" ");
  document.querySelector("#tool-name").textContent = data.tool || "—";
  document.querySelector("#institutions").textContent = summary.institutions.toLocaleString("es-PE");
  document.querySelector("#records").textContent = summary.records.toLocaleString("es-PE");
  document.querySelector("#department").textContent = summary.department;
  document.querySelector("#cutoff").textContent = summary.cutoffDate;
  document.querySelector("#table-count").textContent = `${data.displayedInstitutions ?? data.results.length} de ${summary.institutions.toLocaleString("es-PE")} instituciones encontradas`;
  renderTable(data.results);
  const first = data.results[0] || {};
  document.querySelector("#latitude").textContent = first.latitud ?? "—";
  document.querySelector("#longitude").textContent = first.longitud ?? "—";
  resultsSection.classList.remove("hidden");
  document.querySelector("#register-status").textContent = "Los resultados están listos para enviarse al flujo de automatización.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const consulta = queryInput.value.trim();
  if (!consulta) {
    showAlert("Escribe una consulta antes de analizar.");
    return;
  }
  clearAlert();
  analyzeButton.disabled = true;
  analyzeButton.querySelector("span").textContent = "Analizando...";
  setStep("analyzing");
  try {
    setStep("processing");
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consulta }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo analizar la consulta.");
    renderAnalysis(data);
    setStep("complete");
  } catch (error) {
    showAlert(error.message);
    setStep("waiting");
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.querySelector("span").textContent = "Analizar";
  }
});

registerButton.addEventListener("click", async () => {
  clearAlert();
  registerButton.disabled = true;
  registerButton.querySelector("span").textContent = "Enviando...";
  document.querySelector("#register-status").textContent = "Preparando automatización...";
  try {
    const response = await fetch("/api/register", { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "n8n no pudo recibir los resultados.");
    document.querySelector("#register-status").textContent = `✓ Resultados enviados correctamente a n8n y registrados en Google Sheets. · ${data.institutions} instituciones`;
    showAlert("Resultados enviados correctamente a n8n y registrados en Google Sheets.", "success");
  } catch (error) {
    document.querySelector("#register-status").textContent = "⚠ No fue posible completar el registro en Google Sheets. Verifica que n8n esté activo y escuchando el webhook.";
    showAlert("⚠ No fue posible completar el registro en Google Sheets. Verifica que n8n esté activo y escuchando el webhook.");
  } finally {
    registerButton.disabled = false;
    registerButton.querySelector("span").textContent = "↗";
  }
});
