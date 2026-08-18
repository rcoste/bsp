# Decisiones sobre el entregable de diseño "skin manga"

Revisado el 2026-08-18. Cierra las tres tensiones que estaban abiertas en el
`CLAUDE.md` y las que aparecieron al revisar el bundle completo.

**Veredicto: se adopta la piel visual, se descarta el comportamiento que trae
debajo.** El sistema Modernist es coherente y diferenciador. Las secciones
"Interactions & Behavior" y "State Management" del `README.md` del handoff son
andamio del prototipo, no especificación — el prototipo hace trampa con un
temporizador falso de 700 ms donde la espera real es de 3 a 8 segundos.

---

## D1 — Se adopta el sistema Modernist, reemplazando a Fresco

Tipografía Archivo (una sola familia), radio 0 en todo, acento rojo `#ec3013`
sobre fondo `#f3f2f2`, tinta `#201e1d`, reglas divisorias de 2px, cero sombras
decorativas.

Consecuencia obligatoria: `DESIGN.md` y `app/globals.css` se regeneran con estos
tokens **en el mismo commit**. No conviven los dos temas. Contrastes verificados
contra WCAG AA: texto claro sobre rojo 4.5:1, acento-400 sobre tinta 7.8:1,
acento-700 sobre superficie 5.8:1. Pasan.

## D2 — Nada de cortina de carga sobre la vitrina

El handoff propone tapar la vitrina completa con un overlay opaco mientras la IA
piensa. Se rechaza: contradice `arquitectura.md` §2 ("las tarjetas no esperan al
texto") y `experiencia-y-estados.md` §3.3 ("la primera señal es la primera
portada que aparece en la vitrina"). Una cortina opaca tapa exactamente la
primera señal.

**En su lugar:** viñetas koma vacías — los mismos recuadros de 2px de tinta, con
las líneas de velocidad adentro — que se rellenan una por una conforme cada
anime se verifica. La frase otaku se conserva como línea pequeña arriba, no como
cortina de 34px.

## D3 — El contrato con la IA es el bucle con herramientas, no el JSON del prototipo

El prototipo pide un solo bloque JSON `{reply, action}`. Se descarta por dos
razones: (a) imposibilita el texto palabra por palabra que exige §3.2, porque
hay que esperar el JSON completo; (b) no es el candado anti-invención — en el
prototipo los títulos los elige código local sobre un catálogo de 10 animes
escritos a mano, así que la IA nunca nombra nada.

Se implementa `arquitectura.md` §2 tal cual: bucle con memoria intermedia,
herramienta `buscar_anime(titulo, razon)`, tarjetas antes que texto.

## D4 — Se recorta el Calendario semanal

Es la única vista genuinamente nueva y cara del handoff. Necesita datos de
emisión que la capa de catálogo no trae, agrega otra dependencia de Jikan (que
ya falló 10 de 10 veces en búsqueda durante la construcción), y empuja el
producto a ser un rastreador de series — el terreno donde murieron los
retadores de MyAnimeList.

**Corrección a lo anotado antes:** no son tres vistas fuera de alcance, es una.
La **Ficha de serie** SÍ está en el MVP (es el "panel de detalle", punto 2 del
alcance cerrado); solo cambia su presentación. La **Búsqueda** es casi gratis
—`lib/anime/catalogo.ts` ya busca local— y el prototipo la trata bien: se
dispara desde la conversación, sin campo de búsqueda separado. Ambas se quedan.

## D5 — Pestañas sí en escritorio, no en celular

En escritorio el chat vive permanentemente en la columna izquierda, así que
cambiar de pestaña no rompe la conversación — que era la razón del rechazo
original. En celular la vitrina tiene tope de 320px y la navegación va abajo:
ahí las pestañas no pueden ser la navegación, y detalle y lista se abren como
hoja superpuesta según `experiencia-y-estados.md` §5.

**Lo que el handoff perdió y se recupera:** la tira de miniaturas dentro de cada
mensaje de la IA (§2 del design doc), que deja volver a sets de recomendaciones
anteriores. Con pestañas y sin esa tira, un set viejo se pierde para siempre.

## D6 — "Sen Pai" baja dos rayas de volumen

El handoff trae una personalidad completa (otaku intenso y teatral, mayúsculas
gritadas, cuatro marcas de jerga por mensaje) que nunca se discutió en planning.
Riesgo concreto: el criterio de éxito es que 3 de cada 10 regresen, y una voz
teatral es divertida en la visita 1 y cansada en la visita 4 — variable que no
se puede medir hasta después de lanzar. Además gasta palabras del tope de ~50
en gritos en vez de en el porqué, que es el diferenciador.

Se conserva el nombre y el registro cálido de fan; se quitan las mayúsculas
gritadas y se baja a dos o tres marcas de otaku por conversación. **El texto de
personalidad vive en una sola constante aislada** (`lib/chat/personalidad.ts`)
para poder subirlo o bajarlo sin tocar nada más.

## D7 — Falta el layout de celular; hay que hacerlo

El README afirma que respeta el layout móvil ya definido, pero **no hay ni una
regla `@media` en los dos archivos del bundle**. Tres cosas romperían tal cual:

| Qué trae el handoff | Por qué rompe |
|---|---|
| `height: 100vh` + `overflow: hidden` | §1 lo prohíbe con nombre: en iPhone el teclado no ajusta `100vh` |
| Campos de texto a 14px | Menos de 16px hace que iOS haga zoom solo al enfocar |
| Botones de ~36px de alto | La regla es 44px de área tocable |

Es trabajo real que hay que presupuestar, no "aplicar el skin".

---

## Orden acordado

**Primero el chat con verificación, después el rediseño.** Maquillar una app que
todavía no conversa es maquillaje sobre un maniquí. El rediseño arranca cuando
el paso 3 de `arquitectura.md` §9 esté medido (mediana hasta la primera portada
por debajo de 8 segundos).
