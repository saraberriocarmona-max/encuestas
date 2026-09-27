# Integración con la aplicación anfitriona

La aplicación anfitriona ya contiene los datos del DANE por **manzana – barrio – municipio**.
Este módulo **no duplica** esa información: aporta únicamente lo que la anfitriona no tiene
(intención de voto por grupo demográfico y los indicadores de cultura política de la ECP) y se une a ella
por claves territoriales estándar.

## Claves de unión

| Nivel | Clave | Formato | Presente en encuestas CNE | Presente en ECP |
|---|---|---|---|---|
| Departamento | `cod_dpto` (DIVIPOLA) | texto, 2 dígitos (`"05"`) | casi siempre | sí (región/departamento según edición) |
| Municipio | `cod_mpio` (DIVIPOLA) | texto, 5 dígitos (`"05001"`) | a veces (ciudad de muestreo) | no en la base anonimizada |
| Localidad/comuna | `cod_comuna` (clave de la anfitriona) | según MGN / catastro local | rara vez | no |
| Barrio / manzana | `cod_manzana` (MGN, 22 dígitos) | — | **no** | **no** |

Los códigos siempre como **texto con ceros a la izquierda**; nunca como enteros.

## Por qué no bajar a barrio o manzana con las encuestas

1. Los microdatos publicados vienen anonimizados y la geografía más fina suele ser el municipio.
2. Aunque existiera, una celda de manzana con pocas personas encuestadas permitiría reidentificar
   (Ley 1581 de 2012) y no tendría validez estadística (n ínfimo, error enorme).
3. Lo correcto para bajar de escala es **posestratificación**: estimar el voto por celda demográfica
   (sexo × edad × educación × estrato …) a nivel municipal/departamental con las encuestas, y luego
   ponderar esas estimaciones con la composición demográfica que la anfitriona ya tiene por barrio o manzana
   (estilo MRP). El resultado es una *proyección modelada*, y la interfaz debe etiquetarla así.

## Contrato del módulo hacia la anfitriona

- **Entrada que el módulo necesita de la anfitriona** (solo para posestratificación, opcional):
  conteos de población por celda demográfica y unidad territorial
  `(cod_territorio, nivel, sexo, grupo_edad, educacion, estrato, n_personas)`.
- **Salida que entrega el módulo**: tablas agregadas con estimación, error estándar, IC95 y n efectivo,
  siempre con `encuesta_id`, `cod_territorio`, `nivel` y la variable demográfica — nunca microdatos.
- Categorías demográficas: el módulo publica su diccionario de armonización
  (`catalog/diccionario_armonizado.*`, pendiente) para que la anfitriona mapee sus propias categorías censales.
