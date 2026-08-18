# Design System BSP "Manga Modernist" — handoff incremental

## Cómo usar este paquete
Este paquete **complementa el handoff anterior** (`design_handoff_bsp_manga`) — no lo repite. Es solo el Design System: tokens, reglas y componentes. Instrucciones para Claude Code:

1. **Reemplaza `DESIGN.md` del repo** (tema "fresca" azul) con el `DESIGN.md` de este paquete. Es la nueva fuente de verdad visual.
2. **Integra `tokens.css`** como variables globales (en `app/globals.css` o como `@theme` de Tailwind v4). Todo color/tipo/espaciado/motion sale de ahí — nunca hex sueltos en componentes.
3. `modernist-reference.css` es el sistema padre del que derivan los tokens (ramps completos 100-900, clases .btn/.tag/.table/.input). Úsalo como referencia de valores exactos; no es obligatorio importarlo tal cual.
4. Los prototipos HTML del handoff anterior siguen siendo la referencia visual viva; ante duda entre este doc y aquel README, **este DESIGN.md manda en lo visual**, aquel README en estructura/comportamiento.

## Resumen de las 10 reglas que nunca se rompen
1. Una sola familia: **Archivo** (headings 800, body 400/600). Títulos de sección en itálica; body recto.
2. **Radius 0px en todo.** Sin sombras decorativas. Sin gradientes de fondo (las texturas manga de tokens.css no son gradientes decorativos: son tramas funcionales).
3. Un solo acento: **rojo #ec3013**. Sobre claro, texto pequeño rojo usa accent-700; sobre tinta, accent-400. Contraste ≥4.5:1.
4. Chat = tinta (#201e1d), vitrina = papel (#f3f2f2). Ese contraste es el layout; no diluirlo.
5. Colecciones de cards siempre en **koma grid**: gap 2px sobre fondo tinta + border 2px tinta.
6. Estados nunca solo con color: palomita/ícono/texto además (Lucide, stroke 2.2-2.4, sin emoji en UI).
7. Labels flush left, uppercase 10-11px tracking 0.12-0.16em — también dentro de botones anchos.
8. Calificación de **3 estados** (No fue lo mío / Estuvo bien / Me encantó). Nunca estrellas ni números.
9. Navegación que no cabe = scroll horizontal sin barra. Nunca clipping, nunca dos filas, nunca hamburguesa.
10. Toque mínimo 44px, inputs a 16px (zoom iOS), cajas de imagen reservadas desde el primer frame.

## Contenido
- `DESIGN.md` — el sistema completo: dirección, color, tipografía, spacing/motion, los 14 componentes BSP (koma grid, globo de diálogo, typing, chips, tabs de capítulo, portada + medio tono, bloque próximo episodio, calificación 3 estados, selección de gustos, loading con líneas de velocidad, "el porqué", dock móvil, estados vacíos) y anti-patterns.
- `tokens.css` — CSS custom properties: paleta, tipo, forma, motion y las 3 texturas manga (halftone-cover, halftone-accent, speedlines) como valores listos para usar.
- `modernist-reference.css` — sistema padre Modernist (ramps y clases base), solo referencia.
