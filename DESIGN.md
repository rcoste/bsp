# DESIGN.md — tema base "fresca" (Fresca / juguetona)

> Punto de partida generado por raicode. No es identidad final: si el usuario
> corre su branding, este archivo se reemplaza completo.

## Dirección estética
fresco · juguetón · con energía · directo. Tu app arrancó con el tema Fresco: azul eléctrico, letras redonditas y mucho aire. Se siente ligero y con energía. Cámbialo cuando quieras.
Densidad media, mucho aire, jerarquía por tamaño y peso — no por color.

## Color (CSS custom properties, ver theme-tokens.css)
Un solo acento protagonista + neutros + semánticos. Nunca inventar colores nuevos.

| rol | claro | oscuro |
| --- | --- | --- |
| bg | `#F4F8FF` | `#0D1424` |
| surface | `#FFFFFF` | `#16203A` |
| border | `#D8E3F7` | `#26314F` |
| text | `#14213D` | `#E8EEFB` |
| text-muted | `#5A6B8C` | `#9AA9C6` |
| accent / hover / on | `#1B62F0` / `#0E4CC7` / `#FFFFFF` | `#79A6FF` / `#9CBEFF` / `#06122B` |
| success / bg | `#12855F` / `#DFF5EC` | `#57D6A6` / `#0F2E26` |
| warning / bg | `#8E6008` / `#FDF0D8` | `#E8BE5E` / `#2E260F` |
| error / bg | `#CF3535` / `#FDE8E8` | `#FF8A80` / `#351616` |

Todos los pares texto/fondo cumplen WCAG AA (>=4.5:1 en texto normal).
Usar `--c-*` vía las utilidades (`bg-app`, `text-muted`, `btn-primary`…), no hex sueltos.

## Tipografía (next/font/google)
- Display: **Baloo 2** 700 — títulos, nombre de app, números grandes.
- Body: **Nunito** 400/600 — todo lo demás.
- Escala: 12 / 13.5 / 15 / 19 / 27 / 38 px. Line-height 1.15 en títulos, 1.55 en texto.

```ts
import { Baloo_2, Nunito } from "next/font/google";
```

## Spacing, radii, sombras, motion
- Spacing: escala 4px (1=4 … 20=80). Padding de card 22-24px, gap de secciones 20-24px.
- Radii: sm 6 / md 10 / lg 16 / full 999.
- Sombras: solo `--shadow-1` (bordes sutiles) y `--shadow-2` (cards elevadas).
- Motion: 200ms `cubic-bezier(.2,0,.2,1)` en color/border/opacity/shadow. Nada decorativo.

## Componentes base (mismos en las 4 variantes)
- **Estado vacío**: título, una línea de ayuda, CTA primario. Ninguna lista vacía queda en blanco.
- **Loading**: skeleton en `--c-border` con pulse 1.2s (stagger 150ms) para contenido; spinner de 16px solo dentro del botón que disparó la acción. Nunca spinner de pantalla completa.
- **Botones**: primary / secondary / tertiary / danger, cada uno con hover, focus-visible (`outline: 2px solid var(--c-accent); outline-offset: 2px`), disabled y loading.
- **Forms**: input, select, textarea, checkbox, radio, toggle. Label arriba siempre visible; ayuda o error debajo en 12px. El error pinta el borde con `--c-error` y el mensaje dice qué hacer. Toque mínimo 44px en móvil.
- **Contenido largo** (`prose`): máx. 68ch, line-height 1.65, títulos en display, links con borde inferior. No centrar ni justificar.

## Gráficas
Serie principal `--c-series-1`; 2-4 son tonos de la misma familia. Máximo 4 series.

| serie | claro | oscuro |
| --- | --- | --- |
| 1 | `#1B62F0` | `#79A6FF` |
| 2 | `#5B8DF7` | `#4E7FDD` |
| 3 | `#9CB8FB` | `#ADC7FF` |
| 4 | `#123F9B` | `#2E5AA8` |

Permitido: barras, líneas, área simple, dona de máximo 4 rebanadas. Grid solo horizontal en `--c-border`.
Prohibido: 3D, arcoíris, doble eje Y, gradientes en las series.

## Anti-patterns
- Nada de arcoíris: un solo acento azul manda, lo demás son neutros fríos.
- No infantilizar con Comic Sans, stickers ni sombras de caricatura.
- Sin gradientes de fondo; el color vive en botones y estados.
- No animaciones que reboten o giren por decoración — 200ms y listo.
- No agregar una segunda familia tipográfica ni un segundo acento.
- No usar sombras de color ni bordes de 2px+.

## Componentes v1.1 (mismos en las 4 variantes)

- **Badge**: 5 tonos (neutral, success, warning, error, info). Pill de `padding: 4px 10px`, `--text-xs`, weight 600. Neutral va en outline (`--c-bg` + borde); los demás en tinte relleno sin borde. Punto opcional de 6px en `currentColor`. Conteos en `badge-count` (20px, fondo accent, `tabular-nums`). El texto dice el estado — el color nunca solo.
- **Tabs**: activo en `--c-accent` con `box-shadow: inset 0 -2px 0`; inactivo en muted; hover suma `--c-bg`; focus `outline: 2px solid var(--c-accent); outline-offset: -2px`; disabled en `--c-border`. Si no caben, **scroll horizontal** — nunca dos filas. Máximo 5. El segmentado funciona muy bien aquí (se siente como un juguete); úsalo para 2-3 vistas y tabs para el resto.
- **Bottom-nav** (solo móvil): 3-5 destinos, `56px + env(safe-area-inset-bottom)`, ícono 22px + etiqueta 10.5px/600. Activo con `aria-current="page"` en accent. El contenido reserva `calc(56px + safe-area + var(--space-4))`.
- **Modal / sheet**: escritorio centrado `max-width: 380px`; móvil sheet desde abajo con handle de 36×4px. Destructivo: título que nombra la cosa, cuerpo que dice qué se pierde, botón "Sí, borrar" en `--c-error`, **foco inicial en Cancelar**, Esc y clic afuera cancelan. En móvil los botones se apilan con el peligroso arriba.
- **Toast**: abajo-derecha en escritorio, arriba en móvil. 4s (7s con acción). Máximo 3. `border-left: 3px` del tono. Para confirmar lo hecho — un error que exige decisión va inline o en modal.
- **Avatar**: 24/32/40/56px, iniciales en display sobre `--c-avatar-1..4`, índice = `suma de charCodes % 4` (determinista). Texto siempre `--c-text`.
- **Imagen**: `aspect-ratio` fijo desde el primer render, `object-fit: cover`. Tres estados: cargando (pulse), sin foto (dashed + `image`), error (`--c-error-bg` + `image-off`).
- **list-row**: min-height 56px, título truncado a una línea, meta en muted, badge a la derecha. Es la unidad que más se repite.

## Móvil (el usuario final entra por el teléfono)

Un solo breakpoint: **768px**. Abajo de eso, una columna.

- La escala de texto **no cambia**; solo h1 38→30px y título de card 27→24px.
- **Inputs a 16px**: menos dispara el zoom automático de iOS.
- Padding de página 16px (24px en escritorio); padding de card 16px.
- Botones a ancho completo, apilados, primario arriba, alto ≥48px.
- **Las tablas se vuelven `list-row`.** Nunca scroll horizontal.
- Header sticky de 56px: volver a la izquierda, una sola acción a la derecha.
- Ancho máximo de contenido en escritorio: `--page-max: 1120px`.

## Iconografía

**Lucide**, una sola librería, `stroke-width: 1.75`. 18px en botón con texto, 20px suelto, 22px en nav; caja de toque siempre 44px. Alineación con `flex` + `gap: 7px`.

Funcional (permitido): el ícono **es** el control o etiqueta uno — borrar, editar, volver, cerrar, buscar, un destino del nav, el tono de un estado.
Decorativo (prohibido): acompaña un título o rellena espacio. **Prueba**: si al borrarlo no cambia lo que el usuario puede hacer o entender, bórralo.

Ícono solo → `aria-label`. Ícono junto a texto → `aria-hidden="true"`.

## Tokens nuevos de esta variante

El acento ya es azul, así que info se deriva de él en vez de meter un color nuevo al sistema.

| rol | claro | oscuro |
| --- | --- | --- |
| `--c-info` | `#1B62F0` | `#79A6FF` |
| `--c-info-bg` | `#E4ECFD` | `#1E2B47` |
| `--c-on-info-bg` | `#1A60EB` | `#79A6FF` |
| `--c-overlay` | `rgba(12,10,8,0.45)` | `rgba(0,0,0,0.7)` |
| `--c-avatar-1` | `#D6E3FC` | `#364B79` |
| `--c-avatar-2` | `#E1EAFE` | `#283E6E` |
| `--c-avatar-3` | `#EDF2FE` | `#465579` |
| `--c-avatar-4` | `#D4DCED` | `#1E335D` |

Todos medidos: el par de texto más bajo de v1.1 es 4.52:1.

## Anti-patterns v1.1

- Nunca menú hamburguesa. Con 2-5 secciones va bottom-nav; con más, cuatro y "Más".
- Nunca scroll horizontal en una tabla en móvil.
- Nunca un toast para un error que necesita decisión del usuario.
- Nunca borrar sin confirmar, y nunca con el foco puesto en el botón peligroso.
- Nunca dos librerías de iconos en la misma app.
- Nunca un ícono decorativo junto a un título.
