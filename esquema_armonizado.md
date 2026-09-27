# Esquema armonizado

Cada encuesta del CNE se traduce a este esquema con un archivo de mapeo `harmonizacion/encuestas/<id>.json`.
El motor (`harmonizacion/motor.py`) aplica el mapeo, normaliza los valores y escribe
`data/processed/<id>.parquet` (microdatos armonizados, **uso interno, no se publican**) y
`docs/validacion/<id>.md` (distribuciones ponderadas para revisar el mapeo).

## Variables canónicas

### Resultados (preguntas de voto)

| clave | contenido | normalización |
|---|---|---|
| `voto_1v` | Intención de voto presidencial 1.ª vuelta — **escenario principal** (el más amplio / el que la firma publica como titular). Después del 31-may-2026, voto declarado en 1.ª vuelta. | nombres canónicos de candidatos; NS/NR, Voto en blanco, Ninguno / no votaría, Voto nulo, Otro |
| `voto_2v` | Segunda vuelta **Iván Cepeda vs. Abelardo de la Espriella** (solo esa dupla). | Iván Cepeda / Abelardo de la Espriella / Blanco / nulo / NS / ninguno |
| `voto_senado` | Intención de voto a **Senado 2026** por partido/lista (antes del 8-mar-2026) o voto declarado (después). | nombres canónicos de partidos |
| `aprobacion` | Aprobación de la gestión del presidente Petro / del Gobierno (pregunta aprueba/desaprueba). **No** usar "imagen favorable" ni evaluaciones en escala. | Aprueba / Desaprueba / NS/NR |
| `evaluacion` | Evaluación o calificación de la gestión en escala (excelente/bueno/regular/malo; 1–6…). Medida distinta de `aprobacion`: no se comparan entre sí. | Aprueba (favorable) / Regular / Desaprueba (desfavorable) / NS/NR |

### Variables de cruce

| clave | contenido | columnas que genera el motor |
|---|---|---|
| `sexo` | sexo | `sexo` (Hombre / Mujer / Otro / NS) |
| `edad` | edad en años (numérica) | `edad4`, y `edad_grupo` si no hay grupo original |
| `edad_grupo` | grupo de edad original de la firma | `edad_grupo` (formato "25–34", "55 o más") y `edad4` (18–24 / 25–34 / 35–44 / 45 o más) |
| `educacion` | nivel educativo | `educacion` (5 niveles) y `educacion3` (Primaria o menos / Secundaria / Superior) |
| `estrato` | estrato socioeconómico | `estrato` (Estrato 1…6 / Sin estrato / NS/NR) |
| `zona` | urbana / rural | `zona` |
| `ingreso` | ingreso del hogar (categorías originales) | `ingreso` |
| `religion` | religión | `religion` |
| `region` | región según la firma | `region` |
| `departamento` | nombre o código DANE | `departamento`, `cod_dpto` |
| `municipio` | código DANE de 5 dígitos **(preferido)** o nombre (+ `col_departamento`) | `municipio` ("Medellín (Antioquia)"), `cod_mpio`; completa `departamento` si falta |
| `ideologia` | autoubicación izquierda–derecha | Izquierda / Centro-izquierda / Centro / Centro-derecha / Derecha / Ninguna / NS |
| `voto_2022_1v`, `voto_2022_2v` | voto presidencial 2022 declarado | candidatos |
| `voto_senado_2022` | voto Senado 2022 declarado | partidos |
| `voto_consultas_2026` | voto en consultas interpartidistas de marzo 2026 | candidatos |

**No incluir** identificadores de manzana, dirección, teléfono, encuestador ni texto libre.

## Formato del mapeo

```json
{
  "id": "2026-12-guarumo-ecoanalitica",
  "archivo": "data/raw/cne/2026-12-guarumo-ecoanalitica/GE_Base_....xlsx",
  "formato": "xlsx",              // opcional: sav | xlsx | csv | txt | xlsx_hoja_por_variable
  "hoja": "Percepción Pais Enero 2026 ",   // opcional (xlsx); si no existe se usa la hoja más grande
  "fila_encabezado": 0,           // opcional
  "etiquetas": true,              // .sav: usar etiquetas de valor (recomendado)
  "peso": "Factor",               // columna del factor de expansión; null si la firma no publica pesos
  "filtro": {"col": "...", "valores": ["..."]},   // opcional
  "variables": {
    "sexo": "¿Cuál fue el sexo asignado al nacer ...?",
    "municipio": {"col": "Dpmun"},
    "voto_2v": {"col": "12. En un eventual escenario ..."},
    "voto_1v": {"col": "P1", "map": {"98": "NS/NR"}},
    "voto_senado": {"cols": ["P8a", "P8b"]}
  },
  "preguntas_texto": {"voto_1v": "texto breve de la pregunta usada", "voto_2v": "..."},
  "notas": "decisiones del mapeo (qué escenario se tomó como principal, limitaciones)"
}
```

- Una variable puede ser un nombre de columna (texto) o un objeto con `col` | `cols` (coalesce), `map` (recodificación
  explícita de valores originales, se aplica antes de normalizar) y `tipo` (para forzar otra normalización).
- Los nombres de columna deben ser **exactamente** los que aparecen en `docs/inspeccion/<id>.md`.
- Validar siempre con `.venv\Scripts\python harmonizacion\motor.py <id>` y revisar `docs/validacion/<id>.md`:
  sin avisos de columnas faltantes, pocas categorías "raras" en candidatos/partidos, municipios con código DIVIPOLA,
  y toplines coherentes con el informe publicado por la firma (PDF en la carpeta de la encuesta).
