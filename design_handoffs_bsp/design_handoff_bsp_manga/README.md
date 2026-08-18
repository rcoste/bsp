# Handoff: BSP — Chat otaku con vitrina (skin manga)

## Overview
BSP es una plataforma de descubrimiento de anime en español (MyAnimeList meets Claude Code meets IMDb). Una sola pantalla dividida: **chat con IA a la izquierda** (asistente "Sen Pai", tono otaku intenso) y **vitrina a la derecha** que reacciona a la conversación. La navegación principal es conversacional (texto libre + chips de atajo); los tabs de la vitrina son atajos secundarios de regreso. Este handoff implementa el **layout desktop (≥768px)**; el layout móvil (vitrina arriba 46%/máx 320px, chat abajo) ya está definido en `docs/designs/experiencia-y-estados.md` del repo `rcoste/bsp` y este diseño lo respeta.

## About the Design Files
Los archivos de este bundle son **referencias de diseño creadas en HTML** — prototipos que muestran el look y comportamiento buscado, NO código de producción para copiar. La tarea es **recrear estos diseños en el codebase existente** (`rcoste/bsp`: Next.js App Router + Tailwind + Supabase + Jikan API) usando sus patrones ya establecidos (`components/Pantalla.tsx`, `Conversacion.tsx`, `Vitrina.tsx`, `lib/anime/catalogo.ts`). Los tokens de este diseño (sistema "Modernist") reemplazan al tema "fresca" de `DESIGN.md` para el skin manga, o conviven detrás de un theme switch — decisión del equipo.

## Fidelity
**High-fidelity.** Colores, tipografía, espaciados e interacciones son finales. Recrear pixel-perfect con los patrones del codebase. Dos archivos:
- `BSP Manga.dc.html` — **versión elegida** (skin manga: chat en tinta negra, globos de diálogo, viñetas koma, medio tono, tabs de capítulo).
- `BSP.dc.html` — versión base previa (misma estructura, sin skin manga), solo como referencia histórica.

## Design Tokens (sistema "Modernist")
- **Fondo (vitrina):** `#f3f2f2` · **Tinta / texto:** `#201e1d` · **Superficie (cards, globos):** blanco `#ffffff`
- **Acento único:** rojo `#ec3013` (ramp: acento-400 para labels sobre fondo oscuro, acento-700 para texto rojo pequeño sobre claro)
- **Tipografía:** Archivo en todo (headings weight 800, body 400/600). Sin segunda familia.
- **Radios: 0px en absolutamente todo.** Sin sombras decorativas. Reglas divisorias de 2px sólidas.
- **Iconos:** Lucide, stroke ~2.2, sin emoji en UI.
- Labels/kickers: 10-11px, uppercase, letter-spacing 0.1-0.16em, weight 800, Archivo.

## Screens / Views

### Estructura raíz
- Flex horizontal a 100vh, overflow hidden.
- **Chat (aside):** 430px fijos, fondo tinta `#201e1d`, texto claro, border-right 2px.
- **Vitrina (main):** flex 1, fondo `#f3f2f2`, columna: header 64px + contenido scrollable.
- Ambos headers miden **exactamente 64px** para que la regla de 2px corra continua entre paneles.

### Chat (panel izquierdo, fondo tinta)
- **Header (64px):** cuadro rojo 14px + "BSP" (Archivo 800, 22px) + subtítulo "Tu universo otaku, en español" (11px, neutral-400) + tag "BETA" outline claro a la derecha.
- **Hilo:** scroll vertical. Cada mensaje lleva label uppercase 10px (bot: "SEN PAI" en acento-400; usuario: "TÚ" en neutral-400).
  - **Globo del bot:** fondo blanco, texto tinta, border 2px tinta, padding 10×14px, width fit-content, cola: cuadrado 10px rotado 45° arriba-izquierda (border top+left 2px tinta).
  - **Globo del usuario:** alineado a la derecha, fondo acento rojo, texto claro, border 2px tinta, misma cola arriba-derecha.
  - **Typing indicator:** 3 cuadrados 6px rojos con blink escalonado (1s, delays 0/0.15/0.3s) antes de resolver el texto (~550ms).
  - Entrada de mensaje: animación msgIn 0.25s (fade + translateY 6px).
- **Chips (encima del input):** botones transparentes, texto claro, border 1px blanco al 40%, Archivo 800 12px, hover border+texto acento-400. `white-space: nowrap` (nunca partir en dos líneas). Dos familias:
  - *Iniciales* (antes de la primera recomendación): "Acabé una serie" · "Algo corto para el finde" · "Sorpréndeme".
  - *Refinamiento* (después): "Más acción" · "Algo más corto" · "Menos conocido" · "¿Cuándo sale el próximo cap?" · "Sorpréndeme".
- **Barra de input:** input claro (clase estándar del DS) con placeholder "Acabé una serie, ¿qué sigo?" + botón "Mi lista · N" (mismo estilo que chips) + botón enviar primario rojo con flecha. Enter envía.

### Vitrina — header con tabs (64px)
- Cuadrito rojo 10px + fila de tabs: "Inicio · Para ti · Calendario · Mi lista" (+ "Ficha" o "Búsqueda" solo cuando esa vista está activa; "Perfil" solo durante onboarding).
- Tab: Archivo 800 11px uppercase, padding 6×10px. Activo: fondo tinta, texto claro. Inactivo: transparente, texto tinta, hover borde+texto rojo. Fila con overflow-x auto sin scrollbar (nunca clipping).
- Tabs cambian de vista **instantáneamente** (sin loading) — son atajos; el chat es el conductor.

### Transición de carga (solo navegación por chat)
- Overlay que cubre la vitrina (~700ms): kicker "CARGANDO" rojo, quip otaku grande (34px, itálica, skew -5°, ej. "Consultando al Consejo Supremo de Senpais..."), barra de progreso 280×3px con segmento rojo en loop (0.9s linear), fondo con **líneas de velocidad** (repeating-linear-gradient 115°, tinta al 8%, franjas 26/2px).
- Cada vista entra con viewIn 0.45s cubic-bezier(0.2,0.7,0.2,1) (fade + translateY 16px).

### Vista: Selección de gustos (estado inicial de la vitrina)
- Kicker "VITRINA · MODO SELECCIÓN" + h1 itálico 30px "¿Cuál de estos has visto?" + línea de ayuda con enlace "Saltar".
- Grid 5 columnas (máx 760px) de 10 portadas 2:3 con título debajo (Archivo 800 11px). Seleccionada: outline 2px rojo + palomita (check Lucide) en cuadro rojo 22px esquina superior derecha (nunca solo color).
- Contador "N marcadas · al tercer toque arranco solo". **Al tercer marcado la IA arranca sola**: mensaje de bot + transición a recomendaciones (una sola vez, no se revierte).

### Vista: Inicio
- Kicker + h1 itálico 32px "Tu universo otaku. En tu idioma." + párrafo muted + hr 2px.
- "En tendencia hoy": grid **1 fila × 6** cards koma (gap 2px sobre fondo tinta + border 2px tinta = viñetas de manga). Card: portada 3:4 + título Archivo 800 13px + meta 11px + "★ 9.2" rojo-700.

### Vista: Recomendaciones ("Para ti")
- Encabezado ancla **"Para: {lo pedido}"** (h6 rojo) — ej. "Para: algo corto para el finde". Obligatorio: ancla la vitrina al último pedido.
- Grid 2×2 koma. Card horizontal: portada 84px 2:3 + **el porqué** (kicker rojo uppercase, máx 90 caracteres, SIEMPRE conectado a datos del usuario: "Porque viste X", "32 episodios · se acaba rápido"; si no hay conexión, se omite — nunca "es muy popular") + título + año/eps/estado + nota.
- Lógica de ranking: afinidad por géneros de lo visto/calificado (love +2, no −2), con sesgos por chip (acción/corto/menos conocido). Solo títulos verificados contra catálogo; el prompt de la IA tiene **prohibido prometer cantidades**.

### Vista: Ficha de serie
- Grid 210px + flex. Izquierda: póster 2:3 + bloque rojo "PRÓXIMO EPISODIO" (si está en emisión) con **trama de medio tono** (radial-gradient puntos claros 1.2px, grid 7px) y border 2px tinta.
- Derecha: kicker géneros · h1 30px · meta (año/estudio/eps/estado) · nota comunidad 42px rojo-700 "/10 · COMUNIDAD" · sinopsis 15px · hr · botón "Guardar en mi lista"/"En tu lista ✓" (secundario con icono bookmark) · **calificación de 3 estados**: "No fue lo mío · Estuvo bien · Me encantó" (botones; activo = fondo rojo texto claro). NUNCA estrellas ni escala 1-10 · hr · tabla "Últimos episodios" (3 filas).

### Vista: Calendario semanal
- Por día (solo días con estrenos): label uppercase + filas blancas clicables: título + episodio + tag "NUEVO" rojo.

### Vista: Mi lista
- Tabla: Título (clicable) / Estado / Tu opinión (etiqueta de 3 estados o "—") / botón ghost "Quitar".
- **Estado vacío obligatorio:** "Tu lista está en blanco" + "Guarda aquí lo que quieras ver después. Empieza pidiéndole algo a Sen Pai." + botón primario "Pedir una recomendación" (dispara el flujo de recs).

### Vista: Búsqueda
- "Resultados: «query»" + contador + grid 3 columnas koma (mismas cards que tendencias). Sin resultados: mensaje amigable, nunca vacío seco.

## Portadas (thumbnails)
- Fuente: **Jikan** (`https://api.jikan.moe/v4/anime/{mal_id}`) — la misma del codebase (`lib/anime/catalogo.ts` ya cachea en Supabase; usar ese caché, no fetch directo del cliente).
- Respetar rate limit: en el prototipo, cola secuencial a ~700ms por petición con reintento (hasta 3) y backoff 2.5s en 429.
- Render: background-image cover sobre caja con proporción reservada desde el primer frame (cero layout shift). Fallback: iniciales grandes (Archivo 800, neutral-500) sobre neutral-300 — se ve intencional.
- **Overlay de medio tono** sobre cada portada: radial-gradient(rgba(32,30,29,0.28) 1px, transparent 1px), background-size 4px, mix-blend-mode multiply.
- Tweak `colorCovers` (default true): en false aplica filter grayscale(1) contrast(1.05).
- MAL ids usados: Frieren 52991, One Piece 21, JJK 40748, FMAB 5114, AOT 16498, Solo Leveling 52299, Haikyuu 20583, CSM 44511, Spy x Family 50265, Vinland Saga 37521.

## Interactions & Behavior
- **Chat → vitrina:** cada intención mueve la vitrina con overlay de carga + quip. La IA (Claude) responde en personaje y devuelve JSON `{reply, action: recs|calendario|lista|buscar|serie|inicio|none, serieId?, query?, para?}`; el cliente aplica la acción. En el prototipo hay fallback por regex si la IA no responde (recomendar/calendario/lista/sorpréndeme/acabé/búsqueda por título o género).
- **Personalidad Sen Pai:** otaku intenso y teatral (nakama, kokoro, ¡NANI!, referencias shonen), siempre en español, útil y breve (~50 palabras máx). Prohibido prometer cantidades de resultados.
- **Chips comparten estado con el input:** si el input se deshabilita, los chips también (regla del design doc §6).
- Scroll del chat: auto-scroll solo si el usuario ya estaba al fondo.
- Estados de red/errores/tope de mensajes: seguir `docs/designs/experiencia-y-estados.md` §3 del repo (este prototipo no los implementa todos).

## State Management
- `view` (onboarding | inicio | recs | serie | calendario | lista | buscar), `selected` (serie activa), `loading` + `quip`.
- `vistos` (marcas de selección — alimentan afinidad), `marks` (mi lista), `ratings` (no | ok | love), `covers` (cache de portadas), `recsPara` (texto ancla), `recsBias` (accion | corto | raro | null), `onboarded`, `messages`, `pendingSearch` / `pendingFinished` (esperando nombre de serie).
- En producción: persistir vistos/marks/ratings vía Supabase (esquema ya existente en el repo).

## Assets
- Sin assets propios: portadas vía Jikan, iconos Lucide inline (check, bookmark, send/arrow), fuente Archivo (Google Fonts).

## Files
- `BSP Manga.dc.html` — diseño final elegido (referencia principal).
- `BSP.dc.html` — versión base sin skin manga (referencia).
- `styles.css` — tokens y clases del sistema Modernist (colores, ramps, .btn, .tag, .table, .input, .hr).
- Repo fuente: `rcoste/bsp` (branch main) — `components/Pantalla.tsx`, `Conversacion.tsx`, `Vitrina.tsx`, `lib/anime/catalogo.ts`, `docs/designs/experiencia-y-estados.md` (estados y móvil).
