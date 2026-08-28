# Alcance de la v1 — entrega para diseño

**Para quién es este documento:** para quien ajuste el diseño de bsp (Binge Senpai
reconstruido). Está escrito para leerse solo, sin el resto del repo.

**Qué cambia:** recorta el alcance del MVP que estaba en `docs/plans/alcance-mvp.md`.
Donde este documento contradiga a ese, manda este. Lo que no menciona, no cambia
— en particular el sistema visual Modernist de `docs/designs/decisiones-skin-manga.md`
se conserva completo.

**Fecha:** 2026-08-19.

---

## 1. El producto en una frase

Un chat en español que te recomienda qué anime ver cuando acabas una serie, con
una vitrina de portadas que reacciona a la conversación.

**El momento exacto:** son las 11 de la noche, acabas de terminar una serie,
estás en el celular, y no sabes qué sigue.

**El competidor real es ChatGPT gratis**, no MyAnimeList. Se le gana con tres
cosas que un chat de puro texto no puede dar: portadas, datos verificados que un
modelo de lenguaje inventa (cuántos episodios, si ya terminó, dónde verlo), y
memoria del gusto que crece con cada visita.

---

## 2. La regla que ordena todo

**La tarjeta de anime es el producto.** No la conversación, no la lista, no la
ficha. Todo lo que una persona necesita para decidir si ve algo tiene que caber
en la tarjeta, sin abrir nada.

De ahí salen tres consecuencias de diseño:

1. **Una sola pantalla.** Cambiar de pantalla rompe la conversación, que es la
   ventaja contra ChatGPT. Lo que se abra, se abre encima.
2. **El celular es el caso principal**, no una adaptación. La app se comparte por
   WhatsApp. En celular: vitrina arriba, chat abajo.
3. **Cero pantallas de administración.** No hay pantalla de lista, no hay pantalla
   de perfil, no hay ajustes. Si un módulo necesita su propia pantalla para
   existir, no es de la v1.

---

## 2b. Celular y escritorio

El diseño cubre los dos, con jerarquía clara: **el celular es el caso principal
y el escritorio es la adaptación**, no al revés (la app se comparte por WhatsApp
y se abre en el teléfono).

- **Celular:** vitrina arriba (tope de 320px de alto), chat abajo. Las tarjetas
  se deslizan en carrusel. La hoja de detalle sube desde abajo, encima de todo.
- **Escritorio:** dos columnas — chat fijo a la izquierda (~430px), vitrina a la
  derecha. El detalle se abre como panel.

**Consecuencia del recorte que simplifica el escritorio:** el plan anterior
aprobaba pestañas en escritorio (Inicio · Calendario · Mi lista) porque esas
vistas existían. Con el Calendario fuera y la lista viviendo en el chat
(módulo 5), **las pestañas desaparecen también en escritorio**: quedan las dos
columnas y nada más. Un solo modelo mental en ambos tamaños.

---

## 3. Los seis módulos de la v1

### Módulo 1 — Arranque de gusto (20 segundos)

Lo primero que ve alguien que llega. Una parrilla de portadas tocables: "toca lo
que ya viste". Mata la página en blanco y alimenta la memoria desde el segundo
cero.

**Debe contener:**
- Portadas grandes, tocables, con marca clara de seleccionado.
- Una salida visible para quien no quiera jugar ("mejor pregúntame").

**Necesidad nueva, no diseñada todavía:** la selección tiene que **calibrar si
habla con un novato o con un veterano**. Un otaku se sale en tres segundos si le
recomiendas Death Note. La señal ya está en qué portadas toca — el diseño tiene
que dejar espacio para que la parrilla mezcle títulos obvios con títulos de nicho,
porque de esa mezcla sale la calibración. Si todas las portadas son de las cinco
series famosas, la señal se pierde.

**No debe contener:** filtros de género, pasos múltiples, barra de progreso.

---

### Módulo 2 — Chat + vitrina

La pantalla principal. Ya construida; el diseño existente se conserva.

**Lo importante para diseño, y no es negociable técnicamente:** entre que alguien
pregunta y que aparece la primera portada pasan **de 3 a 8 segundos reales**. Las
tarjetas aparecen **antes** que el texto, una por una, conforme cada anime se
verifica contra el catálogo.

Eso ya está resuelto con las viñetas koma vacías que se rellenan de a una. **No
se debe tapar la vitrina con una cortina de carga** — taparía justo la primera
señal de que algo está pasando.

**Se conserva del diseño actual:** la tira de miniaturas dentro de cada mensaje
de la IA, que deja volver a sets de recomendaciones anteriores. Sin ella, un set
viejo se pierde para siempre.

---

### Módulo 3 — La tarjeta de anime (el módulo más importante)

Aquí es donde se gana o se pierde el producto. La tarjeta actual muestra portada
y título. **No alcanza.**

**Debe contener, visible sin abrir nada:**

| Dato | Por qué |
|---|---|
| Portada | Es la mitad de la decisión |
| Título en español + romaji | La gente busca por los dos |
| **Cuántos episodios** | El filtro real de un fan no es el género, es la duración: 12 episodios y 300 son decisiones distintas |
| **Terminado o en emisión** | Nadie quiere empezar algo sin final |
| Año | Ubica la expectativa de animación |
| **Dónde verlo** | Sin esto, la recomendación no se convierte en ver algo |
| **El porqué, en una línea** | Ver abajo |

Los tres datos en negritas son exactamente lo que ChatGPT inventa con total
seguridad. Son la ventaja competitiva, no un adorno de ficha — tienen que
tener peso visual, no ser letra chica.

**El porqué:** máximo 90 caracteres, y tiene que ser específico. "Porque te gustó
Death Note" no vale nada. "Mismo director de Death Note, y son 12 episodios" sí.
Prohibido "es muy popular" y prohibido prometer cantidades. La vaguedad nos iguala
con ChatGPT.

**Tres botones en la tarjeta, los tres del mismo peso visual:**

- **Ya lo vi**
- **Quiero verlo**
- **No, otra cosa**

El tercero es el más importante y el que más se suele esconder. En la versión
anterior de este producto existía enterrado en un menú y **lo usaron 5 personas en
total**. Rechazar es lo que más rápido le enseña el gusto a la máquina: va grande
y visible, no en un menú de tres puntitos.

**Estados que la tarjeta necesita:** vacía (viñeta koma con líneas de velocidad,
mientras se verifica), llena, ya marcada como vista, ya marcada como quiero verla,
descartada (se va con una animación corta, no desaparece de golpe).

---

### Módulo 4 — Hoja de detalle

Se abre desde la tarjeta, encima de todo, sin perder la conversación. En celular
es una hoja que sube desde abajo; en escritorio, un panel.

**Queda demotada respecto al plan anterior.** Como la tarjeta ya carga los datos
de decisión, la hoja solo sirve para una cosa: **la sinopsis sin spoilers**. Los
fans de anime son alérgicos a los spoilers, y una sinopsis de temporada 2 arruina
la temporada 1 — la sinopsis tiene que estar escrita para eso.

**Contiene:** sinopsis sin spoilers, dónde verlo (con más detalle que la tarjeta),
títulos relacionados. Nada más.

**No contiene:** personajes, actores de voz, estudios, reseñas, galerías,
estadísticas, episodios uno por uno. Todo eso es el producto viejo.

---

### Módulo 5 — Memoria del gusto y lista vía chat

La memoria no tiene interfaz propia. Funciona sin cuenta, guardada en el
dispositivo. Lo que alguien toca en el arranque de gusto y lo que marca en las
tarjetas alimenta las siguientes recomendaciones.

**Lo primero que el diseño tiene que resolver:** que se note que la app te está
conociendo. Una tarjeta ya marcada tiene que verse marcada la próxima vez que
aparezca. Sin esa continuidad visible, la memoria existe y nadie lo nota — y la
memoria es la razón de ser del producto.

**Lo segundo: la lista vive en la conversación, no en una pantalla.** Un chip
**"mis guardados"**, siempre visible junto al campo de texto, llena la vitrina
con las tarjetas que la persona marcó como "quiero verlo" — con sus botones y
su estado, como cualquier otro set. Ahí mismo puede marcar "ya lo vi" o
descartar. También debe funcionar pidiéndolo por escrito ("¿qué tenía
guardado?").

Detalles que el diseño debe cubrir:
- El chip con la lista vacía: no se esconde — al tocarlo, la vitrina lo explica
  ("aquí van a vivir las que marques con Quiero verlo").
- Cómo se distingue en la vitrina un set de guardados de un set de
  recomendaciones nuevas (el encabezado ancla "Para: {lo pedido}" ya existe;
  aquí sería "Tus guardados").
- Ese set también queda en la tira de miniaturas del mensaje, como cualquier
  otro — se regresa a él igual.

---

### Módulo 6 — Búsqueda directa (autocompletado en el mismo campo)

Para el que no quiere recomendación sino un título concreto: "quiero ver la
tarjeta de Spy x Family, no platicar".

**No es un campo de búsqueda aparte.** Dos campos obligan a cada persona a
clasificar su intención antes de escribir, y en celular el segundo campo roba
espacio a la vitrina. Es un solo campo — el del chat — con autocompletado
encima, como las menciones de WhatsApp:

1. La persona escribe en el campo de siempre ("spy fam").
2. Encima del campo, en la zona de los chips, aparecen hasta **3 sugerencias**:
   mini-portada + título. Salen del catálogo local, así que son **instantáneas**
   — sin esperar a la AI.
3. **Tocar una sugerencia** pone la tarjeta verificada en la vitrina, con
   encabezado ancla **"Buscaste: Spy x Family"** y sus tres botones. Sin llamada
   a la AI: cero espera y **no consume uno de los 20 mensajes**.
4. **Ignorarlas y seguir escribiendo** manda el mensaje a la AI normal. El
   autocompletado nunca captura el Enter ni estorba una frase conversacional
   ("acabé spy x family, ¿ahora qué?") — se quita solo al enviar.

Detalles que el diseño debe cubrir:
- Las sugerencias comparten la zona con los chips: mientras hay sugerencias,
  los chips se ocultan; al borrarse el texto, vuelven.
- El set "Buscaste: X" entra a la tira de miniaturas del historial como
  cualquier otro set.
- **El estado "no hay sugerencia":** el autocompletado busca solo en el
  catálogo local (hoy ~28 títulos semilla), así que muchos títulos reales no
  van a sugerir nada. Ese silencio NO debe leerse como "no existe": simplemente
  no aparece nada y el camino natural es enviar el mensaje, donde la AI sí
  busca con su herramienta. No diseñar un "sin resultados" — el vacío aquí es
  mudo a propósito.

---

## 3b. El home: la vitrina en reposo

**La vitrina nunca está vacía.** Su estado de reposo siempre es contenido
(portadas), nunca botones ni un logo de bienvenida. Qué muestra depende de
quién llega:

| Quién llega | Qué ve la vitrina | Qué dice el chat |
|---|---|---|
| **Primera visita** | El arranque de gusto (módulo 1): cuadrícula de portadas bajo "¿Cuál de estos has visto?" | Un mensaje de una línea + los chips |
| **Regresa, con memoria** | Encabezado **"Seguías con esto"**: sus guardados + las últimas recomendaciones | Un solo mensaje que demuestre memoria concreta: "La última vez acabaste Death Note. ¿Le entraste a alguno?" |
| **Regresa, sin memoria recuperable** (el navegador de WhatsApp aísla el almacenamiento — pasa seguido) | La primera visita tal cual, **sin mencionar que hubo algo antes** | Disculparse por olvidar es peor que nunca haber prometido recordar |

**Los atajos son chips de texto encima del campo, no botones en la vitrina:**
"Acabé una serie" · "Algo corto para el finde" · "Sorpréndeme" · "Mis guardados".
Esa misma zona la usa el autocompletado del módulo 6 cuando hay texto escrito.
Regla dura: no convertir el home en una botonera o un dashboard de accesos —
eso es el producto viejo. La vitrina muestra, el chat pide.

El detalle fino de estos estados (alturas, teclado abierto, qué pasa al tercer
toque) está en `docs/designs/experiencia-y-estados.md` §3.0 y §3.1; este
resumen no lo sustituye.

---

## 4. Lo que se cae respecto al plan anterior

| Se cae | Por qué |
|---|---|
| **Pantalla o panel de "mi lista"** | Es administración, no descubrimiento. La sustituye la lista vía chat (ver módulo 5): un chip "mis guardados" llena la vitrina con las tarjetas guardadas — mismo caso de uso, cero pantallas nuevas |
| **Calendario semanal** | Ya estaba recortado; se confirma |
| **Ficha completa de serie** | Se reduce a la hoja de sinopsis del módulo 4 |
| **Manga, en cualquier forma** | En la versión anterior fue el 3.5% de la demanda y el 4% de lo registrado |

**Riesgo registrado y cómo se cubre:** alguien que marque 12 series como "quiero
verlo" va a querer verlas juntas en la segunda visita. Eso lo cubre la lista vía
chat del módulo 5. Lo único que queda más débil sin una vista propia es la
sensación de colección ("ver mi biblioteca crecer") — asumido a propósito: si en
las pruebas se extraña, la bandeja dedicada entra en la v1.1.

---

## 5. Lo que va en la v1.1 (no diseñar todavía, sí dejarle lugar)

1. **Aviso de episodio nuevo de lo que estás viendo.** Es la única razón sólida
   para volver, y por lo tanto la única razón honesta para pedir un correo. Ojo con
   el argumento: "guarda tu lista" no le importa a nadie; "te aviso cuando salga el
   8" sí. La versión anterior pidió el correo con el primer argumento y solo el 9%
   lo verificó.
2. **Bandeja dedicada de lo guardado** — solo si la lista vía chat se queda
   corta en las pruebas (la sensación de colección es lo que no cubre).
3. **Tarjeta compartible por WhatsApp.**

---

## 6. Dos cosas de fan que valen puntos y hay que verificar antes de prometer

- **Después de una serie pesada no quieres más de lo mismo, quieres despejarte.**
  "Acabé Vinland Saga" debería poder ir en dos direcciones: *más de eso* o *sácame
  de ahí*. Es la clase de detalle que solo diseña alguien que ha sentido el vacío
  post-serie. Cabe como dos chips en la conversación, no necesita pantalla.
  **Confianza: alta**, no depende de datos externos.

- **Doblaje latino.** Ni MyAnimeList ni ChatGPT te dicen con confianza si algo
  tiene doblaje latino, y para una audiencia hispanohablante es un factor de
  decisión real. **Confianza: baja** en que la fuente de datos actual lo tenga.
  Verificar antes de diseñarle un lugar en la tarjeta.

---

## 7. Origen de los números que aparecen aquí

Las cifras de uso (9% de correos verificados, 5 personas usaron el descarte, 3.5%
de demanda de manga) vienen del análisis de la versión anterior del producto,
`docs-para-claude-bsp/FEATURES_AND_USE_CASES_AUG14_EDIT_ROB.md`. Son datos
auto-reportados en ese documento y **no fueron verificados de forma independiente**.
Sirven para orientar decisiones de diseño, no como prueba.
