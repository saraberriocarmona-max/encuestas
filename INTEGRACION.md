# Guía de integración — `<voto-correlaciones>`

Módulo para explorar correlaciones entre variables demográficas, territoriales y de comportamiento político y la
intención de voto del ciclo electoral colombiano 2026 (presidencia 1.ª y 2.ª vuelta, **Senado 2026**, aprobación y
evaluación del Gobierno), a partir de los microdatos anonimizados que las firmas encuestadoras publican en el CNE
(Ley 2494 de 2025, art. 12).

- **Sin dependencias**: un archivo JavaScript (Web Component estándar) + un JSON de datos.
- Funciona en cualquier stack: HTML plano, React, Vue, Angular, Svelte, WordPress, Django/Rails templates.
- **Solo recibe agregados** ponderados (Σw, Σw², n por celda). Los grupos con n < 30 se suprimen antes de
  generar el JSON. Nunca se publican microdatos.

## Contenido del paquete

```
voto-correlaciones.js       el componente
data/agregados.json         los datos (≈ 4 MB; se sirve comprimido con gzip ≈ 10× menos)
index.html                  demostración completa
ejemplos/basico.html        integración mínima
ejemplos/mapa-divipola.html integración con una capa territorial de la anfitriona
manifest.json               versión, fecha de los datos, sha256 de cada archivo
esquema_armonizado.md       definición de cada variable y pregunta
integracion_app_anfitriona.md  unión con datos DANE por manzana / barrio / municipio
```

## 1. Integración mínima

```html
<script src="/ruta/voto-correlaciones.js"></script>
<voto-correlaciones src="/ruta/data/agregados.json"></voto-correlaciones>
```

El JSON debe servirse desde el mismo origen o con CORS habilitado. No abrir los HTML con `file://`
(los navegadores bloquean `fetch` local): usar cualquier servidor estático.

## 2. Atributos

| atributo | valores | efecto |
|---|---|---|
| `src` | URL | JSON de agregados |
| `theme` | `auto` (defecto) · `light` · `dark` | tema; `auto` sigue al sistema operativo |
| `vista` | `explorar` · `comparar` · `catalogo` | pestaña inicial |
| `vistas` | lista separada por comas | pestañas visibles; con una sola se oculta la barra |
| `encuesta` | id, p. ej. `2026-61-atlas-intel` | encuesta inicial (por defecto, la nacional más reciente) |
| `pregunta` | `voto_1v` · `voto_2v` · `voto_senado` · `aprobacion` · `evaluacion` | pregunta inicial |
| `variable` | clave canónica (ver esquema), p. ej. `departamento` | variable de cruce inicial |
| `opcion` | texto de la opción, p. ej. `Pacto Histórico` | opción inicial en el gráfico de puntos |
| `sin-encabezado` | (booleano) | oculta título y descripción |

## 3. API de JavaScript

```js
const el = document.querySelector('voto-correlaciones');

el.datos = objeto;                 // entregar los agregados sin URL (p. ej. desde el backend de la anfitriona)
el.seleccionar({ vista, encuesta, pregunta, variable, opcion });
el.seleccion;                      // { vista, encuesta, pregunta, variable, opcion }
el.tablaActual();                  // [{ grupo, codigo, n, n_efectivo, opciones: { 'Iván Cepeda': { p, lo, hi }, … } }]
el.encuestas;                      // metadatos: firma, fechas, ámbito, n, ponderada, preguntas, variables, notas…
```

## 4. Eventos

| evento | `detail` |
|---|---|
| `vc-ready` | `{ encuestas }` — datos cargados |
| `vc-error` | `{ mensaje }` — no se pudieron cargar o validar los datos |
| `vc-change` | `{ encuesta, variable, pregunta, opcion, territorio? }` — cada cambio de selección |

Cuando la variable de cruce es `departamento` o `municipio`, `territorio` trae los datos listos para una capa de mapa:

```js
el.addEventListener('vc-change', ({ detail }) => {
  if (!detail.territorio) return;
  // detail.territorio = { nivel: 'departamento' | 'municipio',
  //                       datos: [{ codigo: '05', nombre: 'Antioquia', p: .71, lo: .61, hi: .80, n: 470, n_efectivo: 86 }] }
  miCapa.setData(detail.territorio.datos.map(d => ({ divipola: d.codigo, valor: d.p })));
});
```

`codigo` es DIVIPOLA (DANE): 2 dígitos para departamento, 5 para municipio, siempre como texto con ceros a la izquierda.
Ver `integracion_app_anfitriona.md` para bajar a barrio / manzana mediante posestratificación (nunca cruzando
encuestas directamente a esa escala).

### React

```jsx
import { useEffect, useRef } from 'react';
import '/vendor/voto-correlaciones.js';          // registra el custom element una vez

export function VotoCorrelaciones({ onTerritorio, ...attrs }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const h = e => e.detail.territorio && onTerritorio?.(e.detail.territorio);
    el.addEventListener('vc-change', h);
    return () => el.removeEventListener('vc-change', h);
  }, [onTerritorio]);
  return <voto-correlaciones ref={ref} src="/data/agregados.json" {...attrs} />;
}
```

### iframe (aislamiento total)

```html
<iframe src="/voto-correlaciones/index.html" style="width:100%;height:1400px;border:0"></iframe>
```

## 5. Tema

Todas las variables visuales se pueden sobrescribir desde la anfitriona:

```css
voto-correlaciones {
  --vc-accent: #0b5cad;     /* pestaña activa, enlaces */
  --vc-plane: transparent;  /* fondo */
  --vc-surface: #fff;       /* tarjetas */
  --vc-ink: #111; --vc-ink-2: #555; --vc-muted: #888; --vc-grid: #e5e5e5; --vc-border: rgba(0,0,0,.1);
  /* paleta categórica (candidatos/partidos, en orden de peso global): --vc-s1 … --vc-s8 */
}
```

Los candidatos y partidos conservan su color en todas las encuestas; las respuestas no sustantivas
(NS/NR, blanco, ninguno, otro) van en gris.

## 6. Actualizar los datos

Los datos se regeneran desde el repositorio con un solo comando (armoniza, agrega, prueba y empaqueta):

```
.venv\Scripts\python construir.py
```

Si una prueba de regresión falla (un dato dejó de reproducir el informe oficial de la firma), no se genera el paquete.
Para añadir una encuesta nueva: descargar sus anexos (`scripts/02_descargar_anexos_cne.ps1`), escribir su mapeo
`harmonizacion/encuestas/<id>.json` (ver `esquema_armonizado.md`), validar con `harmonizacion/motor.py <id>` y
agregar sus cifras publicadas a `tests/test_agregados.py`.

## 7. Uso responsable (mostrar siempre)

- Asociación no es causalidad. Los IC ignoran estratos y conglomerados que las firmas no publican.
- Las firmas difieren en método (presencial, telefónico, digital), universo (votantes probables vs. adultos) y
  redacción; la vista *Comparar* lo advierte.
- Tempo y Cámara de Comercio de Valledupar no publicaron factor de expansión: resultados sin ponderar (se marca).
- Veda electoral: la normativa restringe la difusión de encuestas en los días previos a una elección; la anfitriona
  debe desactivar la publicación del módulo en esos periodos.
- Citar: firma, fecha de campo, n y enlace al registro del CNE (la ficha de cada encuesta los muestra).
