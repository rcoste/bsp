# Diseño de experiencia — bsp

Generado por /plan-design-review el 2026-08-17
Rama: main
Documentos base: docs/designs/recomendador-con-memoria.md, docs/plans/alcance-mvp.md

**Alcance de este documento: estructura y comportamiento, NO estética.** Colores, tipografías, personalidad visual y logo los define el flujo de diseño de raicode más adelante. Nada de aquí depende de esas elecciones ni las condiciona: esto define dónde va cada cosa y qué pasa en cada momento.

> **Sobre los bocetos grises** (`~/.gstack/projects/bsp/designs/layout-celular-20260817/`): sirvieron para tomar las decisiones D2 y D3 y **ya no representan el diseño**. Dos de los tres ponen el chat arriba (rechazado por D2) y los tres muestran 3 tarjetas en fila (rechazado por D3). Son historia de la decisión, no referencia de construcción. **Este documento manda sobre los bocetos.**

---

## 1. Estructura de la pantalla

### Celular (caso principal, hasta 768px de ancho)

```
┌─────────────────────────┐
│  VITRINA                │  46% del alto, tope 320px
│  ┌──────┐┌──            │  carrusel: 1 tarjeta + asomo
│  │portad││po            │
│  │  a   ││rt            │
│  └──────┘└──            │
│  Título del anime       │
│  Porque te gustó X      │
├─────────────────────────┤
│  CONVERSACIÓN           │  el resto del alto
│   ┌──────────────┐      │
│   │ mensaje AI   │      │
│   └──────────────┘      │
│  [chip] [chip] [chip]   │  refinamiento, deslizables
│ ┌───────────────┐ ┌───┐ │
│ │ Escribe... [→]│ │📑 3│ │  ← ambos al alcance del pulgar
│ └───────────────┘ └───┘ │
└─────────────────────────┘
```

**Presupuesto vertical (obligatorio, no orientativo).** En un teléfono chico (375×667) quedan ~560px útiles. Sin este reparto, la vitrina se come la pantalla y queda un solo mensaje visible:

| Zona | Alto | Nota |
|---|---|---|
| Vitrina | 46% del alto visible, **máximo 320px** | Con el teclado abierto se comprime a **128px** (portada 64×96 + título a una línea), no desaparece |
| Conversación | El resto | Mínimo 2 mensajes visibles con el teclado cerrado |
| Campo + botón de lista | Fijos abajo | Con `env(safe-area-inset-bottom)` |

**Las alturas se calculan con `visualViewport`, nunca con `100vh`.** En iOS Safari, `100vh` no se ajusta cuando sube el teclado: la decisión D2 completa depende de esto y fallaría en silencio. Esto es comportamiento, no estética, así que se decide aquí.

**El layout debe sobrevivir zoom de texto al 200%.** Alturas en porcentaje con mínimos, no valores fijos.

**D2 — Vitrina arriba, chat abajo.** Cuando el usuario toca el campo de texto, el teclado ocupa media pantalla. Con el chat arriba, tapa exactamente las portadas recién pedidas. Con la vitrina arriba, el teclado empuja el chat y las portadas siguen visibles (comprimidas, nunca ausentes). Además el campo queda abajo, donde llega el pulgar.

**D3 — Carrusel horizontal.** Tres tarjetas en fila en 375px dan ~110px cada una: portada de estampilla y título cortado. El carrusel muestra una tarjeta grande con media asomando a la derecha, que es el gesto que el usuario ya hace en Netflix y Crunchyroll.

*Excepción consciente al CLAUDE.md:* ese documento prohíbe scroll horizontal, con razón — pero apunta a **tablas de datos**, donde esconde información. Un carrusel de portadas es otro patrón, establecido para contenido visual. La regla sigue intacta para tablas.

### Los dos modos de la vitrina

La vitrina no es un componente fijo: tiene dos modos, y confundirlos es el error más fácil de cometer al construirla.

| Modo | Cuándo | Cómo se ve |
|---|---|---|
| **Selección** | Al llegar por primera vez (§3.0), antes de la primera recomendación | Cuadrícula compacta con scroll vertical dentro de los 320px: portadas de ~90×135px, 3 por fila, 8-10 en total |
| **Recomendación** | Desde la primera respuesta de la AI en adelante | Carrusel: una tarjeta grande + media asomando |

**El cambio de selección a recomendación ocurre una sola vez y no se revierte** dentro de una visita. Una vez que la app te recomendó algo, la vitrina es para eso. (Única excepción: el regreso con gustos marcados pero sin recomendaciones previas, §3.1.)

### Compu (768px o más)

Dos columnas: conversación izquierda (~40%), vitrina derecha (~60%), cada una con su scroll. La vitrina pasa de carrusel a cuadrícula de 2-3 columnas.

Ajustes propios de la compu, donde no hay pulgar ni teclado que suba:
- **Detalle del anime:** ventana centrada con el fondo oscurecido, no hoja que sube. Mismo contenido y mismo manejo de foco.
- **Mi lista:** botón en la cabecera de la columna de la vitrina (la regla de "abajo, al alcance del pulgar" no aplica sin pulgar).
- **Chips:** igual que en celular, encima del campo de texto.

---

## 2. El acople entre conversación y vitrina

**Esta es la mecánica que define el producto** y por eso se especifica antes que los estados: es lo que ChatGPT no puede hacer.

- **La vitrina siempre refleja el último set de recomendaciones**, con un encabezado que la ancla a lo que se pidió: *"Para: algo corto para el finde"*. Sin ese encabezado, el usuario que sube en la conversación ve un mensaje viejo junto a una vitrina nueva, y la app le está mintiendo.
- **Los sets anteriores no se pierden:** cada mensaje de la AI que trajo recomendaciones conserva dentro de sí una tira de miniaturas — una por título de ese set (hasta 5, ver §4). Al tocarlas, ese set vuelve a la vitrina y el encabezado cambia.
- **El scroll de la conversación no arrastra al usuario.** Si está leyendo mensajes viejos cuando llega una respuesta nueva, la conversación **no se mueve**: aparece una píldora tocable *"Nueva respuesta ↓"*. Solo baja solo si ya estaba al fondo (margen de 100px). Es el error clásico de las apps de chat, y aquí se agrava porque además le cambiaría la vitrina bajo los pies. La vitrina sí se actualiza — el encabezado que la ancla es justo lo que evita la confusión.
- **Regla dura contra el riesgo técnico #1:** la vitrina **solo muestra títulos verificados contra el catálogo, con portada y datos reales**. Si la AI nombró tres y solo dos existen, se muestran dos y la AI no menciona cantidades. **El prompt tiene prohibido prometer números** ("aquí tienes 3"). Si no se verifica ninguno, no hay estado de error: cae en conversación (§3.5).

---

## 3. Los estados

Un estado es qué ve el usuario en cada momento posible, no solo cuando todo sale bien.

### 3.0 Primera llegada (nadie ha escrito nada)

La vitrina **no está vacía**: ahí viven los chips de portadas del arranque de gusto, aprovechando el espacio más visible para la acción más importante del primer segundo.

- **Vitrina en modo selección** (ver §1): 8-10 portadas de animes muy conocidos en cuadrícula, bajo el encabezado "¿Cuál de estos has visto?". Se tocan para marcar (varios), con un ícono de palomita de lucide (`Check`) además del cambio de color — nunca solo color, para quien no distingue tonos.

**Con el teclado abierto**, la cuadrícula se comprime a una sola fila con scroll horizontal (portadas de 64×96), igual criterio que el modo recomendación: se encoge, nunca desaparece.
- **Conversación:** un mensaje corto de la AI. Una línea, no un párrafo.
- **Chips:** "Acabé una serie", "Algo corto para el finde", "Sorpréndeme". **Sin emoji** — el CLAUDE.md del proyecto lo prohíbe en la interfaz, y los íconos que hagan falta salen de lucide.
- **El campo de texto NO se enfoca solo** — si el teclado sube al abrir, tapa media propuesta.
- **Salida:** al tercer toque la AI arranca sola con lo que ya sabe. Un enlace "Saltar" siempre visible para quien prefiere escribir.

Meta: que en 20 segundos, sin teclear, la app ya sepa algo de ti.

### 3.1 Usuario que regresa

La tesis del producto es "cada visita te conoce mejor" y un criterio de éxito es que 3 de 10 regresen. Este es el momento donde esa promesa se prueba.

- **No se restaura la conversación vieja** (es ruido). Se restaura la **evidencia de que la app se acuerda**.
- **Vitrina:** encabezado "Seguías con esto" — lo guardado más las últimas recomendaciones.
- **Un solo mensaje de la AI**, que demuestre memoria concreta: *"La última vez acabaste Death Note. ¿Le entraste a alguno o buscamos otra cosa?"*.

**Si no hay memoria recuperable** (probable: el navegador de WhatsApp aísla el almacenamiento, ver §9), se muestra §3.0 tal cual, **sin mencionar que hubo algo antes**. Disculparse por haber olvidado es peor que nunca haber prometido recordar.

**Si hay memoria pero nada que mostrar** — alguien marcó dos portadas y se fue antes de la primera recomendación: la vitrina vuelve a **modo selección con lo ya marcado puesto**, y la AI retoma desde ahí: *"Vi que marcaste un par. ¿Le seguimos?"*. Es el único caso en que la vitrina regresa a modo selección.

### 3.2 La AI está pensando (3-8 segundos)

El estado más frecuente y el más fácil de arruinar.

- **El texto aparece palabra por palabra**, no de golpe. Convierte una espera pasiva en algo vivo; sin esto, 6 segundos de pantalla quieta se leen como app trabada.
- **La vitrina muestra tarjetas fantasma**: siluetas del tamaño exacto de las reales, para que la pantalla no brinque cuando llegan.
- **El campo no se bloquea.** Si el usuario manda un segundo mensaje, **se encola** y sale al terminar el turno, visible como pendiente. Encolar, no interrumpir: es lo que la gente ya espera de WhatsApp.

### 3.3 Red lenta (distinto de sin red)

El caso real en Latinoamérica es lento, no ausente. Sin esto, una espera de 30 segundos muestra el brillo fantasma para siempre.

**Los relojes se miden hasta la PRIMERA SEÑAL, no hasta el final.** "Primera señal" es lo primero que el usuario ve moverse: normalmente **la primera portada que aparece en la vitrina**, que llega antes que el texto (así está diseñado el flujo, ver la arquitectura). Si la respuesta no trae recomendaciones, la primera señal es la primera palabra.

Una respuesta larga que lleva 25 segundos escribiéndose bien está funcionando y no se toca; matarla sería un error.

- **A los 12 segundos sin ninguna señal:** la burbuja cambia a *"Está tardando más de lo normal"* con botones **Esperar** y **Cancelar**.
- **Cancelar** quita la burbuja de espera y las siluetas fantasma, devuelve el texto al campo y deja la vitrina como estaba. **No muestra mensaje de disculpa ni se trata como error** — el usuario decidió, no falló nada.
- **A los 30 segundos sin ninguna señal:** se corta solo y cae en §3.4, conservando el texto del usuario. **Salvo que el usuario haya tocado "Esperar"**: en ese caso ya decidió, y el corte automático se desactiva — queda solo "Cancelar" a su disposición. Quitarle el control después de que lo ejerció sería tratarlo como si no supiera lo que hizo.

**Si el texto empezó y se estanca a media frase** (el caso típico de red lenta, y el más fácil de dejar sin especificar): tras **10 segundos sin una palabra nueva**, se considera muerto. **El texto parcial se queda visible** — borrarlo se sentiría como que la app se comió lo que ya había dicho — y debajo aparece una línea con botón: *"Se cortó a media respuesta · Reintentar"*. Al reintentar, la respuesta se genera de nuevo completa y sustituye a la parcial.

### 3.4 La AI falla

- Mensaje en el hilo, con voz humana: *"Se me trabó el cerebro tantito. ¿Lo intentamos otra vez?"* + botón **Reintentar**.
- **Nunca** códigos de error ni jerga técnica.
- **El texto del usuario no se pierde:** vuelve al campo listo para reenviar.

### 3.5 La AI no entendió / no encontró nada

No es error, es conversación. La AI pregunta de vuelta: *"No me quedó claro qué buscas. ¿Fue algo que viste hace poco, o quieres empezar de cero?"*. **La vitrina conserva lo que estaba mostrando** — vaciarla castiga al usuario por una pregunta ambigua.

### 3.6 Mi lista vacía

Nunca "No hay elementos". Un estado vacío es una invitación con acción:

> **Tu lista está en blanco**
> Guarda aquí lo que quieras ver después. Empieza pidiéndole algo a la AI.
> **[ Pedir una recomendación ]** ← cierra el panel y enfoca el chat

### 3.7 Sin internet

Aviso fijo arriba: *"Sin conexión. Lo que ya viste sigue aquí."* La lista y las recomendaciones cargadas siguen navegables; solo el chat se deshabilita.

**El texto escrito se conserva en el campo y NO se envía solo.** Al volver la señal aparece una línea *"Volvió la conexión"* y el botón de enviar se reactiva — el usuario decide. Enviarlo automáticamente sería peor: si la señal vuelve cuarenta minutos después, la app manda un mensaje que ya nadie quiere y le consume uno de sus 20 mensajes. Mismo patrón manual que §3.4.

### 3.8 Aviso previo y tope de mensajes

- **En el mensaje 17**, una línea suave de la AI ofreciendo guardar la conversación. Sin aviso, el 21 se siente trampa aunque el copy sea amable.
- **En el 21**, invitación a guardar con correo, nunca puerta cerrada. El usuario que llega ahí es el más comprometido de todos.

**Las dos ramas, porque sin ellas la pieza es indecidible:**

| Si el usuario… | Qué pasa |
|---|---|
| **Da su correo** | El tope se levanta y puede seguir platicando. El mensaje de éxito lo dice explícitamente: *"Listo. Tu lista y tus gustos quedaron guardados — y puedes seguir platicando."* Esa es la única razón por la que alguien daría su correo, así que tiene que ser visible |
| **No lo da** | El campo de texto se deshabilita, pero **la app sigue navegable**: la vitrina, Mi lista y el detalle siguen funcionando. Una línea fija abajo: *"Guarda tu correo para seguir la conversación"*. Se corta la conversación, no el producto |

### 3.9 Tope de gasto alcanzado

Mensaje honesto y humano **dentro del hilo de la conversación**, donde el usuario ya está mirando: *"Estamos recibiendo muchísima gente hoy, vuelve mañana"*. Nunca error técnico ni pantalla en blanco.

**La app queda navegable**, igual que en §3.8: el campo y los chips se deshabilitan, pero la vitrina, Mi lista y el detalle siguen funcionando. Lo que se acaba es la conversación, no el producto.

### 3.10 Alcance del contador de mensajes

Los 20 mensajes se cuentan **por visita, en el dispositivo** — mismo identificador local que guarda la memoria de gusto. Consecuencias que hay que asumir de frente:

- **Se reinicia cada 24 horas.** No es una cuota de por vida; quien vuelve al día siguiente empieza otra vez en cero, y así debe ser: el tope existe para acotar una sesión, no para racionar el producto. (La arquitectura define "visita" como una ventana de 24 horas, porque del lado del servidor una ventana de tiempo se puede contar y una "visita" no.)
- **Es evadible** borrando datos del navegador o abriendo en incógnito. Ya está registrado como riesgo en el plan de alcance; el candado real (límite del lado del servidor) le toca a /plan-eng-review. Esta especificación cubre el caso normal, no el adversario.
- **Con cuenta creada, el tope no aplica** (§3.8).

---

## 4. La tarjeta de anime

En orden de importancia visual:

1. **Portada** (proporción 2:3, la de los pósters). **La caja se reserva desde el primer frame** — cero salto de layout — con bloque sólido mientras baja la imagen.
2. **Título.** Máximo 2 líneas, corte con puntos suspensivos, completo en el detalle. Los títulos de anime son largos de forma notoria: asumir que caben es un error garantizado.
3. **El porqué.** **Máximo 90 caracteres / 2 líneas.** Regla de contenido: si la razón no se conecta con algo que el usuario dijo o marcó, **no se muestra**. Mejor sin porqué que *"es muy popular"* — eso es exactamente lo que criticamos de las listas genéricas.
4. **Año y estado** (en emisión / terminado), en pequeño.
5. **Botón de guardar** en la esquina, con área tocable de 44px. Es la interacción más repetida del producto (la calificación de §5 también escribe datos, pero mucho menos seguido), así que se especifica completa:

| Situación | Comportamiento |
|---|---|
| Sin guardar | Ícono de contorno |
| Al tocar | Se rellena con palomita, el contador de "Mi lista" sube con la misma animación. Sin diálogo, sin espera |
| Ya guardado | Ícono relleno. Tocarlo otra vez lo quita, misma inmediatez |
| Quitar desde Mi lista | Se quita de inmediato y aparece un mensajito de 7 segundos: **"Quitado · Deshacer"**. Sin diálogo de confirmación, porque la acción es reversible — preguntar para algo que se puede deshacer es fricción sin beneficio |

**Cantidad:** 3 tarjetas por respuesta, tope 5 con "ver más". **Con un solo resultado la tarjeta ocupa el ancho completo** y desaparece el asomo — si no, se ve rota.

**Sin portada disponible:** bloque de color sólido con el título centrado. Se ve intencional, no averiado. Nunca un ícono roto.

---

## 5. Los paneles

Todo vive en una pantalla; detalle y lista se abren **encima** sin sacar de la conversación.

| Panel | Abre | Cierra |
|---|---|---|
| Detalle del anime | Tocas una tarjeta | Deslizando abajo, tocando fuera, ✕, o Escape |
| Mi lista | Botón **abajo**, junto al campo, con contador (`Mi lista · 3`) | Igual |

**Hoja que sube desde abajo, no pantalla completa.** Cubre ~85% del alto y deja ver la conversación detrás: comunica "esto es temporal" sin palabras. Pantalla completa se sentiría como navegar a otro sitio, que es justo lo que evitamos.

**El botón de "Mi lista" va abajo, no arriba a la derecha.** Arriba a la derecha es el punto más lejano del pulgar en un teléfono, y contradice la regla de navegación abajo del CLAUDE.md.

### Estados del panel de detalle

- **Cargando:** la sinopsis puede estar traduciéndose al vuelo — silueta gris, no pantalla vacía.
- **Sin sinopsis disponible:** se omite la sección en vez de mostrar un hueco.
- **"Dónde verlo" degradado:** el link es de búsqueda, no de disponibilidad garantizada. El texto lo dice sin prometer de más: *"Buscar en Crunchyroll"*, no *"Ver en Crunchyroll"*.
- **Título largo en el encabezado:** hasta 3 líneas, luego corte.

### Calificación (ruteada aquí por el plan de alcance)

**Tres estados, no estrellas:** *No fue lo mío · Estuvo bien · Me encantó*. Cinco estrellas piden una precisión que nadie tiene al calificar; la memoria de gusto solo necesita dirección, no decimales.

---

## 6. Los chips

Dos familias distintas:

- **Chips de arranque** (§3.0): portadas tocables para marcar lo que ya viste.
- **Chips de refinamiento:** 3 con cada respuesta que traiga recomendaciones, generados según lo recomendado — *"Más acción"*, *"Algo más corto"*, *"Menos conocido"*. Es la señal de gusto más barata que se puede capturar, y alimenta directo la memoria.

**Aparecen en la primera llegada y tras cada respuesta; se ocultan mientras el usuario escribe** (el alto vertical es escaso y no pueden vivir ahí permanentemente).

**Los chips mandan mensajes igual que el campo de texto, así que comparten su estado siempre.** Si el campo se deshabilita — sin internet (§3.7), tope de mensajes sin correo (§3.8), tope de gasto (§3.9) — **los chips se deshabilitan con él**. Sin esta regla, el tope de 20 mensajes se salta con un toque y se lleva por delante el control de gasto.

---

## 7. El flujo de la cuenta por correo

El plan de alcance marca esta pieza como el primer candidato de recorte. Si se construye, se construye completa — a medias es peor que no tenerla:

| Momento | Qué se ve |
|---|---|
| Invitación | Dentro de la conversación, no en pantalla aparte. Un campo de correo y un botón |
| Esperando el código | *"Te mandamos un código de 6 dígitos a tu correo"* + las 6 casillas |
| Código incorrecto | Las casillas se marcan, mensaje corto, **no se borra lo tecleado** |
| Código expirado | *"Ese código ya venció"* + botón de reenviar |
| Límite de correos | El correo de Supabase manda ~2 por hora: *"Ya mandamos varios códigos. Espera unos minutos e inténtalo de nuevo."* Nunca error técnico |
| Éxito | Confirmación de lo que se guardó: *"Listo. Tu lista y tus gustos quedaron guardados."* |

**Las casillas del código son 6, no 8.** Supabase manda 8 por default y hay que cambiarlo en su panel; sin eso el código no cabe y el login falla con un síntoma cruel: el correo SÍ llega, así que el usuario cree que se equivocó él.

---

## 8. Accesibilidad — mínimos no negociables

Si no se especifican ahora, no existen nunca.

- **Área tocable mínima 44×44px** en todo lo tocable, aunque el ícono se dibuje más chico.
- **Campo de texto a 16px o más.** Con menos, iOS hace zoom solo al enfocar y descuadra la pantalla.
- **Texto alternativo en cada portada** con el título del anime.
- **Contraste 4.5:1** en todo el texto. Se verifica cuando raicode entregue la paleta — anotado para que no se olvide.
- **Región viva** (`aria-live="polite"`) que anuncia **el mensaje completo, nunca palabra por palabra** — anunciar cada palabra sería tortura con lector de pantalla.
- **Anuncio al cambiar la vitrina:** "3 recomendaciones nuevas".
- **Manejo de foco en las hojas:** el foco entra al abrir, queda atrapado dentro, y **regresa a la tarjeta que la abrió** al cerrar. Escape cierra.
- **Los chips son botones de verdad** con `aria-pressed`, no divs con clic.
- **El carrusel se recorre con teclado** (flechas), no solo deslizando.
- **`lang="es"` en la página** para que el lector de pantalla pronuncie bien.
- **Respetar "reducir movimiento"** del sistema: se apagan el brillo de las siluetas y las transiciones.

---

## 9. El navegador de WhatsApp — canal principal, trato especial

La app se comparte por WhatsApp, así que la mayoría la abrirá en **su navegador interno**, no en Chrome ni Safari:

- **Prueba obligatoria ahí antes de compartir el link con nadie.** No es opcional: es el entorno real de tu primer usuario.
- **Nunca depender de "agregar a inicio"** ni de nada que ese navegador no tenga.
- **No asumir que `100vh` es estable** (ver §1).
- Su almacenamiento está aislado del navegador normal — ya registrado como riesgo en el design doc, con impacto en la medición de regresos.

---

## 10. Lo que este documento NO decide

**Flujo de diseño de raicode:** paleta, tipografías, logo, ícono de pestaña, personalidad visual, ilustraciones.

**/plan-eng-review:** cómo se implementa el texto palabra por palabra, de dónde salen las portadas del arranque, la mecánica del carrusel, y cómo se verifica cada título contra el catálogo antes de mostrarlo (§2, regla dura).
