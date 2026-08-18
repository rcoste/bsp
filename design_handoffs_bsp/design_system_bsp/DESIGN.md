# DESIGN.md — Design System BSP "Manga Modernist"

> Reemplaza al tema base "fresca". Fuente de verdad para toda la UI de BSP.
> Referencia visual viva: `BSP Manga.dc.html` (desktop) y `BSP Móvil.dc.html` (celular) del paquete de handoff.

## Dirección estética
Tinta sobre papel: flat, arquitectónico, evocando página de manga sin caer en cosplay. Rejillas visibles tipo *koma* (viñeta), cero radios, cero sombras decorativas, un solo acento rojo. La jerarquía la hacen el tamaño, el peso y las reglas de 2px — nunca el color solo. El chat es tinta (negro), la vitrina es papel (claro): el contraste entre paneles ES el layout.

## Color (CSS custom properties — ver tokens.css)
Un acento protagonista + neutros. Nunca inventar colores nuevos; los tonos intermedios salen del ramp o de color-mix sobre estos.

| rol | valor | uso |
| --- | --- | --- |
| `--c-paper` | `#f3f2f2` | fondo de la vitrina |
| `--c-ink` | `#201e1d` | texto, bordes koma, fondo del panel de chat |
| `--c-surface` | `#ffffff` | cards, globos de diálogo, filas |
| `--c-accent` | `#ec3013` | acción primaria, énfasis, tags NUEVO |
| `--c-accent-400` | `#f26a54` (aprox del ramp) | labels/hover sobre fondo tinta |
| `--c-accent-700` | `#b22410` (aprox del ramp) | texto rojo pequeño sobre claro (notas ★) |
| `--c-muted` | neutral-600 del ramp | metas, subtítulos |
| sobre tinta | `--c-paper` al 100% texto, al 40% bordes, al 25% divisores | todo lo que vive en el panel negro |

Regla: el acento a tamaño párrafo sobre claro usa `--c-accent-700`; sobre tinta usa `--c-accent-400`. Contraste mínimo 4.5:1 en texto normal.

## Tipografía
- **Una sola familia: Archivo** (Google Fonts). Headings 800, body 400/600.
- Escala: 10 / 11 / 12 / 14 / 15 / 20 / 30-34 px (móvil baja h1 a 20-22).
- Labels/kickers: 10-11px, uppercase, tracking 0.1-0.16em, weight 800.
- Títulos de sección en *itálica* (evoca portada de capítulo). Body siempre recto.
- Labels flush left siempre — también dentro de botones anchos. Nunca centrar copy de hero.

## Spacing, radii, bordes, motion
- Spacing: escala 4px. Padding de card 12-16px, secciones 26-44px según viewport.
- **Radius: 0px en absolutamente todo.** Sin excepciones.
- Bordes: 2px sólidos `--c-ink` para koma/globos/divisores fuertes; 1px `--c-divider` para bordes suaves.
- Sombras: ninguna decorativa.
- Motion: entrada de vista `viewIn` 0.45s cubic-bezier(0.2,0.7,0.2,1) (fade + 16px up); mensajes 0.25s; hoja móvil 0.3s. Nada que rebote.

## Componentes BSP

- **Koma grid** (rejilla de viñetas): grid con `gap: 2px` sobre fondo `--c-ink` + border 2px `--c-ink`. Las celdas son `--c-surface`. Es el patrón de toda colección de cards (tendencias, recomendaciones, búsqueda).
- **Globo de diálogo** (mensajes del chat): fondo `--c-surface`, texto `--c-ink`, border 2px `--c-ink`, padding 10×14, width fit-content, cola = cuadrado de 10px rotado 45° con border top+left. Usuario: fondo `--c-accent`, texto claro, alineado a la derecha, cola a la derecha.
- **Typing indicator**: 3 cuadrados de 6px en acento, blink 1s escalonado (0/0.15/0.3s). El texto llega completo (~550ms), nunca palabra por palabra en el aria-live.
- **Chip de atajo** (sobre fondo tinta): transparente, texto claro, border 1px blanco al 40%, Archivo 800 11-12px, `white-space: nowrap`, hover border+texto acento-400. Toque mínimo 36-44px. Comparten estado con el input: si uno se deshabilita, todos.
- **Tab de capítulo**: Archivo 800 10-11px uppercase, padding 6×10-12. Activo: fondo `--c-ink` texto claro. Inactivo: transparente, hover rojo. Fila con overflow-x auto sin scrollbar — nunca clipping ni dos filas. Cambio de vista instantáneo (los tabs son atajos; el chat es el conductor).
- **Portada**: proporción 2:3 (3:4 en tendencias desktop), caja reservada desde el primer frame, `object-fit/background cover`. Overlay de **medio tono**: radial-gradient(rgba(32,30,29,0.28) 1px, transparent 1px), size 4px, mix-blend multiply. Fallback sin imagen: iniciales grandes Archivo 800 neutral-500 sobre neutral-300 — intencional, nunca ícono roto.
- **Bloque "Próximo episodio"**: fondo acento + trama de medio tono clara (puntos 1.2px, grid 7px), border 2px tinta, texto claro.
- **Calificación de 3 estados**: "No fue lo mío · Estuvo bien · Me encantó". Botones en fila, activo = fondo acento texto claro. NUNCA estrellas ni escalas numéricas.
- **Selección de gustos**: portada marcada = outline 2px acento + palomita Lucide en cuadro rojo de 20-22px (nunca solo color). Al tercer marcado la IA arranca sola; "Saltar" siempre visible.
- **Loading de vitrina** (solo navegación por chat, ~650-700ms): overlay papel con líneas de velocidad (repeating-linear-gradient 115°, tinta 8%, franjas 22-26/2px), kicker CARGANDO rojo, quip otaku en itálica skew -5°, barra 3px con segmento rojo en loop 0.9s.
- **El porqué** en cards de recomendación: kicker rojo uppercase, máx 90 caracteres, siempre conectado a datos del usuario ("Porque viste X"); si no hay conexión, se omite. Prohibido "es muy popular".
- **Dock móvil**: barra de tinta inferior con último globo de Sen Pai (clamp 2 líneas), chips deslizables e input a 16px (evita zoom iOS). El hilo completo sube como hoja al 78% con fondo oscurecido, handle y ✕.
- **Estados vacíos**: título + una línea de ayuda + CTA primario. Nunca "No hay elementos".

## Iconografía
Lucide únicamente, stroke 2.2-2.4, esquinas cuadradas (`stroke-linecap: square` donde aplique). Sin emoji en la interfaz (el tono otaku vive en el copy, no en emojis). Ícono solo → aria-label.

## Voz (Sen Pai)
Otaku intenso y teatral en español — nakama, kokoro, ¡NANI!, referencias shonen — pero útil y breve (≤50 palabras). Nunca promete cantidades de resultados. Errores con voz humana ("Se me trabó el cerebro tantito"), nunca códigos técnicos.

## Anti-patterns
- Nada de radios, gradientes de fondo, sombras de color ni segunda familia tipográfica.
- Nunca centrar labels de botones ni copy de hero.
- Nunca colorear el estado solo con color: siempre ícono o texto además.
- Nunca spinner de pantalla completa: el loading de vitrina es el overlay de líneas de velocidad; dentro de botones, spinner de 16px.
- Nunca ocultar navegación por clipping: si no cabe, scroll horizontal sin barra.
- El medio tono y las líneas de velocidad son textura, no decoración por metro cuadrado: máximo un elemento tramado por vista además de las portadas.
