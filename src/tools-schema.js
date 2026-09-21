const toolsSchema = [
  {
    name: "consultar_datos_educativos",
    description:
      "Consulta el catalogo local de datasets educativos disponibles, sus registros, columnas relevantes, periodos o fechas de corte, cobertura y limitaciones. Usar antes de responder sobre el alcance o la calidad de las fuentes. No envia datos a ningun modelo.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "filtrar_colegios_rurales",
    description:
      "Filtra localmente registros rurales del resultado cruzado entre servicios educativos y pagos de servicios basicos. Usar cuando se solicite buscar por ubicacion, codigo modular, tipo de servicio o deuda minima. Devuelve solo registros encontrados; la ausencia de un registro no demuestra una carencia.",
    parameters: {
      type: "object",
      properties: {
        departamento: { type: "string", description: "Nombre del departamento." },
        provincia: { type: "string", description: "Nombre de la provincia." },
        distrito: { type: "string", description: "Nombre del distrito." },
        codigo_modular: { type: "string", description: "Codigo modular de siete digitos." },
        servicio: { type: "string", description: "Tipo o descripcion del servicio, por ejemplo AGUA o LUZ." },
        deuda_minima: { type: "number", minimum: 0, description: "Deuda minima incluida en el resultado." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "obtener_ubicacion_colegio",
    description:
      "Busca localmente un codigo modular en el resultado cruzado y devuelve la institucion, ubicacion administrativa y coordenadas. Si no existe coincidencia, informa claramente que no fue encontrado.",
    parameters: {
      type: "object",
      properties: {
        codigo_modular: { type: "string", description: "Codigo modular de la institucion educativa." },
      },
      required: ["codigo_modular"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_resultados",
    description:
      "Prepara resultados locales para una futura salida externa, como Google Sheets mediante n8n. No conecta APIs ni escribe en Google Sheets; solo valida y devuelve una estructura serializable.",
    parameters: {
      type: "object",
      properties: {
        resultados: { type: "array", description: "Arreglo de resultados previamente obtenidos." },
        destino: { type: "string", description: "Identificador o nombre del destino futuro." },
      },
      required: ["resultados", "destino"],
      additionalProperties: false,
    },
  },
];

module.exports = toolsSchema;
