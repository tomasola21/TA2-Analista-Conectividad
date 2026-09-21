"""Cruza servicios educativos rurales con registros de servicios basicos.

Los CSV se procesan localmente. Este script no envia datos a modelos de
lenguaje ni modifica los archivos de entrada.
"""

from pathlib import Path

import pandas as pd


RAIZ_PROYECTO = Path(__file__).resolve().parent.parent
ARCHIVO_SERVICIOS = RAIZ_PROYECTO / "datos" / "Listado de Servicios Educativos escolarizados_2.csv"
ARCHIVO_PAGOS = RAIZ_PROYECTO / "datos" / "pago_ssbb_local_escolar_0.csv"
ARCHIVO_SALIDA = RAIZ_PROYECTO / "datos" / "resultados_filtrados.csv"


def leer_csv(ruta: Path) -> pd.DataFrame:
    """Lee un CSV local con el formato usado por los datasets oficiales."""
    return pd.read_csv(ruta, sep=";", dtype="string", encoding="utf-8-sig")


def normalizar_identificador(serie: pd.Series) -> pd.Series:
    """Normaliza codigos modulares conservando ceros iniciales.

    Se eliminan espacios, un posible sufijo decimal y caracteres no
    numericos. Los codigos del MINEDU tienen siete digitos.
    """
    resultado = (
        serie.fillna("")
        .astype("string")
        .str.strip()
        .str.replace(r"\.0$", "", regex=True)
        .str.replace(r"[^0-9]", "", regex=True)
    )
    return resultado.where(resultado.eq(""), resultado.str.zfill(7))


def exigir_columnas(df: pd.DataFrame, columnas: list[str], nombre: str) -> None:
    faltantes = sorted(set(columnas) - set(df.columns))
    if faltantes:
        raise ValueError(f"Faltan columnas en {nombre}: {', '.join(faltantes)}")


def main() -> None:
    servicios = leer_csv(ARCHIVO_SERVICIOS)
    pagos = leer_csv(ARCHIVO_PAGOS)

    columnas_servicios = [
        "COD_MOD",
        "CEN_EDU",
        "D_DPTO",
        "D_PROV",
        "D_DIST",
        "DAREACENSO",
    ]
    columnas_pagos = [
        "CODIGO_MODULAR",
        "DESCRIPCION_TIPO",
        "DESCRIPCION_PAGO_SUMINISTRO",
        "CONSUMO",
        "DEUDA",
        "VALOR_TOTAL",
        "INDICADOR_PAGO",
        "DESCRIPCION_INDICADOR_PAGO",
        "LATITUD",
        "LONGITUD",
        "FECHA_CORTE",
    ]
    exigir_columnas(servicios, columnas_servicios, "servicios educativos")
    exigir_columnas(pagos, columnas_pagos, "pagos de servicios basicos")

    print("\nARCHIVOS")
    print(f"Servicios educativos: {len(servicios):,} registros")
    print(f"Pagos de servicios basicos: {len(pagos):,} registros")
    print("\nCOLUMNAS REALES - SERVICIOS EDUCATIVOS")
    print(list(servicios.columns))
    print("\nCOLUMNAS REALES - PAGOS DE SERVICIOS BASICOS")
    print(list(pagos.columns))

    servicios["_id_normalizado"] = normalizar_identificador(servicios["COD_MOD"])
    pagos["_id_normalizado"] = normalizar_identificador(pagos["CODIGO_MODULAR"])

    ids_exactos = set(servicios["COD_MOD"].dropna().str.strip()) & set(
        pagos["CODIGO_MODULAR"].dropna().str.strip()
    )
    ids_servicios = set(servicios["_id_normalizado"].dropna())
    ids_pagos = set(pagos["_id_normalizado"].dropna())
    ids_comunes = ids_servicios & ids_pagos
    print("\nIDENTIFICADOR COMUN")
    print("Primer dataset: COD_MOD")
    print("Segundo dataset: CODIGO_MODULAR")
    print("Normalizacion aplicada: espacios, sufijo .0 y caracteres no numericos")
    print(f"Codigos comunes antes de normalizar: {len(ids_exactos):,}")
    print(f"Codigos comunes despues de normalizar: {len(ids_comunes):,}")

    cruzado = servicios.merge(
        pagos,
        on="_id_normalizado",
        how="inner",
        suffixes=("_servicio", "_pago"),
    )
    print(f"Registros despues del INNER JOIN: {len(cruzado):,}")

    rurales = cruzado[cruzado["DAREACENSO"].str.strip().eq("Rural")].copy()

    resultado = rurales[
        [
            "COD_MOD",
            "CEN_EDU",
            "D_DPTO",
            "D_PROV",
            "D_DIST",
            "DAREACENSO",
            "LATITUD",
            "LONGITUD",
            "DESCRIPCION_TIPO",
            "DESCRIPCION_PAGO_SUMINISTRO",
            "CONSUMO",
            "DEUDA",
            "VALOR_TOTAL",
            "INDICADOR_PAGO",
            "DESCRIPCION_INDICADOR_PAGO",
            "FECHA_CORTE",
        ]
    ].rename(
        columns={
            "COD_MOD": "codigo_modular",
            "CEN_EDU": "nombre_institucion",
            "D_DPTO": "departamento",
            "D_PROV": "provincia",
            "D_DIST": "distrito",
            "DAREACENSO": "ruralidad",
            "DESCRIPCION_TIPO": "tipo_servicio_basico",
            "DESCRIPCION_PAGO_SUMINISTRO": "descripcion_servicio_basico",
            "FECHA_CORTE": "fecha_corte",
        }
    )

    # Un pago prueba que existe un registro contable, no que haya o no haya
    # una carencia. La ausencia de un registro tampoco se interpreta como tal.
    resultado["registro_servicio_basico"] = "Encontrado"
    resultado["carencia_confirmada"] = "No determinada"

    columnas_salida = [
        "codigo_modular",
        "nombre_institucion",
        "departamento",
        "provincia",
        "distrito",
        "ruralidad",
        "LATITUD",
        "LONGITUD",
        "tipo_servicio_basico",
        "descripcion_servicio_basico",
        "CONSUMO",
        "DEUDA",
        "VALOR_TOTAL",
        "INDICADOR_PAGO",
        "DESCRIPCION_INDICADOR_PAGO",
        "fecha_corte",
        "registro_servicio_basico",
        "carencia_confirmada",
    ]
    resultado = resultado[columnas_salida].rename(
        columns={"LATITUD": "latitud", "LONGITUD": "longitud"}
    )
    resultado.to_csv(ARCHIVO_SALIDA, sep=";", index=False, encoding="utf-8-sig")

    print(f"Servicios rurales con registro de pago: {len(resultado):,}")
    print("\nCOLUMNAS UTILIZADAS EN EL RESULTADO")
    print(list(resultado.columns))
    print("\nPRIMEROS 10 RESULTADOS")
    print(resultado.head(10).to_string(index=False))
    print(f"\nResultado guardado en: {ARCHIVO_SALIDA}")


if __name__ == "__main__":
    main()
