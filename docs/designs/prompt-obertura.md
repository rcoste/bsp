# Prompt para Claude Design — la obertura de BSP

> Pégalo tal cual. Está escrito para leerse sin acceso al repo.

---

Diseña la **entrada interactiva** de una app móvil web. No una pantalla de
bienvenida: los primeros ~5 segundos de alguien que llega por primera vez y no
sabe qué es esto.

## El producto

**BSP** — recomendador de anime en español para el momento exacto en que
acabas una serie y no sabes qué ver. Se usa **en celular** (se comparte por
WhatsApp y también llega gente de anuncios de Google).

La pantalla tiene dos mitades que conviven siempre:
- **Arriba, la vitrina** (fondo claro): portadas de anime en una rejilla estilo
  viñetas de manga, separadas por 2px de tinta.
- **Abajo, el chat** (fondo tinta, ~35% de la altura): una IA con personalidad
  otaku ("Sen Pai") a la que le hablas en español.

El valor que hay que comunicar en esos segundos: *le dices qué acabaste de ver
y te dice cuál sigue, con cuántos episodios tiene, si ya terminó y dónde verla.*

## El problema a resolver

Hoy hay una obertura que **se siente estática**: dos líneas de texto sobre
tinta que aparecen, y a los 4.8s la pantalla se parte en dos mitades que se
separan revelando la app. Se ve bien pero **le ocurre al usuario** — no
participa. Nadie toca nada hasta que termina.

**Quiero que la entrada sea interactiva sin volverse un cuestionario.**

## La restricción dura (viene de datos reales, no es opinión)

La versión anterior de este producto midió 1,982 usuarios. Su pantalla de
bienvenida ofrecía 8 opciones para elegir: **230 personas la vieron y nunca
eligieron nada.** Se quedaron ahí.

Por eso:

- ❌ **NO** un carrusel de 3 pantallas con "Siguiente".
- ❌ **NO** un menú de "¿qué quieres hacer?" con opciones.
- ❌ **NO** pedir datos, cuenta, ni preferencias.
- ❌ **NO** un tutorial con globitos señalando la interfaz.
- ✅ **SÍ** que cualquier toque en cualquier lado avance o salte.
- ✅ **SÍ** que se pueda ignorar completamente y aun así llegar a la app.
- ✅ **SÍ** que el primer toque del usuario **ya sea uso real de la app**, no
  un paso de tutorial que después hay que repetir de verdad.

Esa última es la clave que busco: **que la introducción y la primera acción
real sean lo mismo.** Un tutorial que enseña a marcar series y luego te pide
marcarlas otra vez desperdició el único momento de atención que tenías.

## El dato que ordena la prioridad

En producción: quien marca **~20 series el primer día vuelve 46%**; quien marca
1 o 2, vuelve **6%**. Marcar series es LA acción que predice retención.

Entonces la entrada tiene un solo trabajo: **que la persona toque su primera
portada lo antes posible, y que le den ganas de tocar más.** Todo lo demás
—explicar el chat, la personalidad, las funciones— puede esperar o no ocurrir
nunca.

## Ideas de dirección (no son requisitos, elige o propón mejor)

- Las portadas **entran volando** hacia su posición en la rejilla y la primera
  que tocas dispara la reacción (se marca, la app responde algo).
- Una portada **sola en el centro** con "¿ya la viste?" — la respondes tocando
  y de ahí la rejilla se arma alrededor.
- El corte en dos mitades **lo provoca el usuario**: arrastra, o su primer
  toque abre la app.
- La vitrina arranca llena y el chat "escribe" su primera línea reaccionando a
  lo que la persona toca.

## Sistema visual (respétalo, no lo reinventes)

Se llama **"Manga Modernist"**. Es blanco y negro con un rojo, tipografía
gruesa, cero decoración.

**Color**
| token | valor | uso |
|---|---|---|
| `--c-paper` | `#f3f2f2` | fondo claro (vitrina) |
| `--c-ink` | `#201e1d` | tinta: texto, bordes, fondo del chat |
| `--c-surface` | `#ffffff` | tarjetas |
| `--c-accent` | `#ec3013` | acción primaria, el único color |
| `--c-accent-400` | `#f26a54` | texto/acento **sobre tinta** |
| `--c-accent-700` | `#b22410` | texto rojo pequeño **sobre claro** |
| `--c-muted` | `#6f6b68` | subtítulos |

Sobre tinta: texto en `--c-paper`, bordes al 40% de opacidad, divisores al 25%.

**Tipografía** — una sola familia: **Archivo** (Google Fonts).
- Títulos 800, itálica (evoca portada de capítulo de manga). Body recto, 400/600.
- Escala px: 10 / 11 / 12 / 14 / 15 / 20 / 22. En escritorio el h1 sube a 32.
- Kickers: 10-11px, MAYÚSCULAS, tracking 0.1–0.16em, weight 800.
- **Labels siempre alineados a la izquierda**, incluso dentro de botones anchos.
  Nunca centrar copy de hero.

**Forma y movimiento**
- **Radius 0px en absolutamente todo. Sin excepciones.**
- Bordes 2px sólidos tinta. **Cero sombras decorativas. Cero gradientes.**
- Spacing en escala de 4px.
- Motion: `cubic-bezier(0.2, 0.7, 0.2, 1)`. Entradas 0.45s, micro 0.25s.
  **Nada que rebote.**
- Texturas permitidas (con moderación, máximo un elemento tramado por vista
  además de las portadas):
  - *Medio tono* sobre portadas: `radial-gradient(rgba(32,30,29,0.28) 1px,
    transparent 1px)`, size 4px, `mix-blend-mode: multiply`.
  - *Líneas de velocidad*: `repeating-linear-gradient(115deg, transparent 0
    26px, rgba(32,30,29,0.08) 26px 28px)`.
- Íconos: **Lucide** únicamente, stroke 2.2–2.4. **Cero emoji en la interfaz.**

**Voz** — español latino neutro, otaku intenso pero breve (≤50 palabras).
Usa "nakama". Nunca promete cantidades de resultados.

## Restricciones técnicas

- **React + TypeScript**, componente de cliente. Tailwind v4 con los tokens de
  arriba como variables CSS.
- **Sin librerías nuevas** de animación (nada de Framer Motion, GSAP, Lottie):
  solo CSS y `useState`/`useEffect`.
- **Móvil primero**, un solo breakpoint en 768px.
- `prefers-reduced-motion: reduce` → la entrada **no aparece**, se va directo a
  la app.
- Toque mínimo de 44px.
- Objetivo: **≤6 segundos** para quien no toca nada.
- Debe verse bien mientras las portadas todavía cargan (llegan de un CDN
  externo, tardan): reserva la caja desde el primer frame; el fallback de una
  portada sin imagen son sus iniciales grandes sobre `--c-neutral-300`, nunca
  un ícono roto.

## Qué quiero de vuelta

1. La **secuencia paso a paso**: qué ve la persona en cada momento, qué la hace
   avanzar, y en qué segundo.
2. **Dónde exactamente ocurre su primer toque** y por qué ahí.
3. El **componente React** listo para pegar, con los tokens de arriba.
4. Qué pasa en los tres bordes: **la salta**, **no hace nada**, y
   **`prefers-reduced-motion`**.

Si crees que la entrada correcta es **no tener entrada** —que la app se explique
sola desde el primer frame— dilo y arguméntalo. Es una respuesta válida.
