---
status: ACTIVE
---
# Arquitectura — bsp

Generado por /plan-eng-review el 2026-08-18
Rama: main
Documentos base: docs/designs/recomendador-con-memoria.md, docs/plans/alcance-mvp.md, docs/designs/experiencia-y-estados.md

Repo en verde: sin código, sin commits. Nada que refactorizar, todo por decidir.

**Nota de método:** los límites de las APIs se verificaron en vivo el 2026-08-18 y el comportamiento de los modelos se tomó de la referencia oficial de la API de Anthropic, no de memoria. Donde algo no se pudo verificar, se dice.

---

## 1. De dónde salen los datos de anime

### Lo verificado (2026-08-18, en vivo)

| Fuente | Límite real | Términos | Prueba |
|---|---|---|---|
| **AniList** | **30/min** (su doc dice 90; el header `x-ratelimit-limit` devolvió 30) | **Regla 5 prohíbe** "anime and manga list or tracker services" | Responde bien |
| **Jikan** (MAL no oficial) | 60/min y 3/seg | No prohíbe apps con listas; pide no construir base propia | Devolvió **504** una vez; OK en los 3 intentos siguientes |
| **MAL oficial** | ~1/seg en la práctica | Vía oficial; MAL mismo es un tracker | 403 sin llave, como se espera |

**Cita textual de los términos de AniList:**
> "Use of the AniList API within competing, non-complementary services of the same nature is prohibited. This includes, but is not limited to, anime and manga list or tracker services."

bsp incluye lista personal de anime. **Confianza media-alta** en que es riesgo real: la regla es textual, su aplicación a un recomendador es interpretación.

### D1 — Jikan ahora, MAL oficial en paralelo

- **Se construye contra Jikan desde el día uno**: cero llaves, cero trámites.
- **Toda la capa de datos vive detrás de un solo archivo** (`lib/anime/catalogo.ts`) que expone `buscarPorTitulo()`, `porId()` y `porTemporada()`. Ninguna otra parte del código sabe de dónde salen los datos: cambiar de fuente es reescribir un archivo.
- **Jikan devuelve datos de MyAnimeList, así que los identificadores son los mismos** — migrar a la API oficial no invalida nada guardado.
- **Tarea de Roberto, cuando la app vaya en serio** (no bloquea el MVP): crear cuenta en MyAnimeList y registrar la app en `myanimelist.net/apiconfig`.

### D2 — Derechos de las portadas (cierra el Riesgo 3 del plan de alcance)

Las portadas vienen del CDN de MyAnimeList (`cdn.myanimelist.net`) y se muestran **enlazando directamente a su servidor**, no copiándolas a nuestro almacenamiento. Es la práctica común de las apps que usan estas APIs y mantiene claro que la imagen vive en su origen.

**Riesgo residual: bajo pero real.** No hay una licencia explícita que autorice el uso comercial de esas portadas. Para un MVP con 10 personas de prueba es aceptable; si el proyecto crece, se revisa. **Queda registrado como decisión consciente del fundador, no como un detalle que se nos pasó.**

### El caché, y por qué no viola términos

Tres reglas duras que separan un caché de "construir tu propia base de datos":

1. **Solo se guarda lo que ya se mostró a un usuario.** Nunca se descarga el catálogo por adelantado ni se recorre en masa.
2. **Todo expira**: 7 días para los datos de un anime, 24 horas para los resultados de búsqueda (mismo criterio que usa Jikan internamente).
3. **La búsqueda siempre consulta la fuente** cuando el caché no tiene la respuesta; el caché acelera, no sustituye.

---

## 2. El riesgo técnico central: que la AI no invente animes

**El problema:** un modelo de lenguaje puede nombrar con total seguridad un anime que no existe, o con un título que no coincide con ningún registro real. Si eso llega a la vitrina, el usuario ve una tarjeta rota justo en el momento de la verdad.

### D3 — Bucle con memoria intermedia: verificar primero, escribir después

**Por qué no se puede hacer de la forma obvia:** la API de Anthropic emite el texto del modelo **antes** que la llamada a la herramienta, en el mismo turno. Si ese texto se transmite al navegador palabra por palabra, la AI puede escribir "te recomiendo Monster, Psycho-Pass y Ergo Proxy" y verificar *después*. Una instrucción de "no menciones títulos sin verificar" es una sugerencia, no un candado — el texto ya salió.

**La solución no son "dos turnos fijos", es un bucle con memoria intermedia.** La diferencia importa: la mayoría de los mensajes ("hola", "gracias", "¿por qué me recomendaste ese?") no necesitan verificar nada, y un diseño de dos turnos fijos los haría pagar el doble de tiempo y de dinero sin razón.

```
  ┌──────────────────────────────────────────────────────────┐
  │ Se pide una respuesta a la AI.                           │
  │ El texto se va guardando en una MEMORIA INTERMEDIA del    │
  │ servidor — todavía no viaja al navegador.                │
  └──────────────────────────────────────────────────────────┘
        │
        ├─► ¿Terminó SIN pedir herramienta?  (charla normal)
        │      └─► Se vuelca la memoria intermedia al navegador.
        │          El navegador la muestra con efecto de máquina de
        │          escribir para que se vea igual que el otro camino.
        │          Cero tiempo extra, cero costo extra. FIN.
        │
        └─► ¿Terminó PIDIENDO la herramienta?  (quiere recomendar)
               ├─► Se DESCARTA el texto de la memoria intermedia
               ├─► Se ejecutan las búsquedas, en paralelo entre sí
               │     ✅ verificado → LA TARJETA SALE YA A LA VITRINA
               │     ❌ no existe   → se descarta en silencio
               └─► Se vuelve a pedir respuesta (máximo 3 vueltas)
                     └─► La vuelta que no pide herramienta SÍ se
                         transmite palabra por palabra.
```

**Regla técnica que evita un error críptico en el primer intento:** esto es **una sola conversación con varias llamadas encadenadas**, no llamadas independientes. "Descartar el texto" significa *no enviarlo al navegador*, **nunca borrarlo de la conversación**. El mensaje completo de la AI — incluidos sus bloques de razonamiento, que vienen **firmados criptográficamente** — se reenvía **tal cual, sin editar ni un carácter**, junto con el resultado de cada herramienta. Editar o quitar esos bloques invalida la firma y la API rechaza la petición. Quien lo implemente creerá que el problema es el texto de las instrucciones y perderá horas.

**Tope de 3 vueltas.** Sonnet 5 encadena verificaciones (busca un título, no lo encuentra, prueba otro). Sin tope, un caso raro podría dar vueltas indefinidamente; con tope, en la última vuelta se responde con lo que se haya verificado.

**El truco que salva la espera:** las tarjetas **no esperan al texto**. En cuanto la herramienta verifica un anime, su tarjeta sale a la vitrina. El usuario ve portadas llegando mientras la AI todavía redacta. La espera se convierte en una secuencia que se siente viva en lugar de una pantalla congelada.

**Alternativas descartadas:**
- *Buscar después de que la AI responde:* hay que borrar títulos del texto ya escrito. Se ve como censura y deja la respuesta coja.
- *Darle a la AI una lista pre-filtrada por género:* las etiquetas son burdas y no capturan tono ni ritmo, que es justo donde el conocimiento del modelo le gana a MyAnimeList.

### Configuración del modelo (verificada contra la referencia oficial)

- **Se deja el pensamiento activo** (`thinking: {type: "adaptive"}`, que además es el default en Sonnet 5) **con `effort: "low"` o `"medium"`**. Esto es una corrección importante: apagar el pensamiento reduce la latencia, pero **la documentación oficial advierte que con el pensamiento apagado el modelo usa MENOS herramientas** — y toda nuestra defensa contra animes inventados depende de que llame a la herramienta. Bajar el esfuerzo da el ahorro sin romper el mecanismo.
- **`display: "summarized"`** para poder diagnosticar por qué recomendó lo que recomendó cuando corramos las 10 conversaciones de prueba.
- **Dos puntos de caché, no uno**: uno sobre las instrucciones del sistema y otro al final del historial, para que las vueltas 2 y 3 del bucle no vuelvan a pagar la conversación completa. Caché de prompt (`cache_control: {type: "ephemeral"}`) sobre las instrucciones del sistema: las lecturas cuestan una décima parte. El mínimo para que se cachee en Sonnet 5 es de ~1024 tokens; las instrucciones con las reglas de §2 lo superan.

  **Regla dura, o el descuento se evapora en silencio:** el caché exige que el texto sea **idéntico carácter por carácter** entre peticiones. Como el producto es "recomendaciones personalizadas", el impulso natural es meter el gusto del usuario o la fecha de hoy en las instrucciones del sistema — y con eso el caché no acierta **nunca, para ningún usuario**, y el costo real sube sin que nadie se entere. Las instrucciones del sistema son iguales para todos; el gusto, el historial y todo lo variable viajan como mensajes, después del punto de caché. **Al medir en el paso 3 se verifica que las lecturas de caché sean mayores que cero**; si salen en cero, algo lo está invalidando.
- **La herramienta devuelve solo 6 campos** (`id, titulo, titulo_en, año, estado, portada`), nunca el JSON crudo de Jikan, que trae 2-5 KB por anime y se acumularía en cada vuelta.

**Dónde viaja el "porqué" — la pieza que casi se pierde.** El porqué es el diferenciador del producto, y como las tarjetas salen **antes** que el texto, no puede venir en el texto. Solución: **la AI escribe la razón al pedir la búsqueda, no al recibirla.** La herramienta se llama con dos datos, `titulo` y `razon` (máximo 90 caracteres, ver §4 del documento de experiencia), y la razón viaja con la tarjeta desde el primer instante. Si la AI no puede dar una razón conectada con lo que el usuario dijo, manda el campo vacío y la tarjeta sale sin porqué — que es exactamente la regla de contenido acordada.

**De dónde salen los chips de refinamiento.** El servidor no puede inventarlos (la herramienta no devuelve géneros) — **los escribe la AI en su última vuelta**, junto con el texto, mediante una segunda herramienta `proponer_chips(tres_textos)` que no consulta nada externo: solo recoge lo que la AI propone y lo emite como evento `chips`. Así los chips se refieren a lo que realmente se recomendó ("más acción", "menos episodios") en vez de a etiquetas genéricas.

**Tope de tarjetas por respuesta: 5.** El bucle permite hasta 3 vueltas y las búsquedas van en paralelo, así que sin regla dura una respuesta podría verificar siete títulos y romper lo acordado en §4 del documento de experiencia (3 por respuesta, tope 5). Al llegar a 5 verificadas, las demás se descartan.

**Reglas de instrucción, no negociables:**
- Prohibido mencionar cantidades ("aquí tienes 3") — si dos de tres no se verifican, la promesa queda incumplida a la vista.
- Prohibido mencionar un título que la herramienta no confirmó.
- Si ningún candidato se verifica, no hay error: pregunta de vuelta (§3.5 del documento de experiencia).

**Decisión sobre títulos en español (verificada en pruebas reales):** MyAnimeList **no guarda títulos en español** — "El viaje de Chihiro" no existe en su catálogo, solo "Sen to Chihiro no Kamikakushi" y "Spirited Away". Por eso las instrucciones de la AI le piden **llamar a la herramienta con el título original o en inglés**, no con la traducción al español. La AI sabe la equivalencia; el catálogo no. En la conversación con el usuario sí puede usar el nombre en español.

**Búsqueda en el catálogo local antes de salir a internet:** se busca primero en lo ya cacheado. Beneficio permanente (menos peticiones, respuestas en ~300 ms) y además mantiene la app en pie cuando la fuente externa se cae — que ocurrió dos veces durante la construcción, con el buscador de Jikan devolviendo 504 en 10 de 10 consultas. La búsqueda local es deliberadamente **más estricta** que la externa: es un respaldo, y ante la duda descarta. (Recorre el catálogo local completo; con miles de títulos habría que indexar, con decenas es instantáneo.)

**Cómo se compara un título:** Jikan devuelve `title`, `title_english` y `title_synonyms`. Se compara contra los tres, normalizando (sin acentos, sin signos, minúsculas), y se acepta el mejor resultado solo si supera un umbral de parecido. **Si el parecido es dudoso, se descarta** — mostrar el anime equivocado es peor que mostrar uno menos.

---

## 3. Los límites de peticiones, donde esto se cae en producción

Jikan permite **3 por segundo y 60 por minuto**. Una respuesta puede necesitar 3-5 verificaciones.

**Corrección aritmética:** un freno de "2 por segundo sostenidos" da 120 por minuto — el doble del techo. El freno necesita las dos dimensiones: **ráfaga de hasta 3 por segundo, 1 por segundo sostenido**.

**Y el freno no puede vivir en la memoria del servidor.** Vercel levanta varias copias aisladas de la aplicación bajo carga; una fila en memoria daría una fila por copia y el límite real se multiplicaría. Es peor que no tener freno, porque da falsa seguridad.

**Las tres defensas, en orden:**

1. **Dos cachés, no uno.** El de búsquedas (`consulta → ids`, 24 h) es el que hace el trabajo: la herramienta busca por título, así que un caché indexado solo por identificador nunca la ayudaría. El de datos (`id → anime`, 7 días) sirve a la vitrina y al detalle.

   Dos reglas que multiplican su efecto:
   - **Los resultados vacíos se cachean igual.** Un título inventado por la AI es, por definición, el que nunca encuentra nada — y los modelos inventan títulos parecidos entre sí, así que se repiten. Si el código pregunta "¿hay resultados guardados?" en vez de "¿ya buscamos esto?", cada título fantasma sale a internet para siempre, quemando el presupuesto de peticiones justo en el peor caso.
   - **Una sola respuesta de Jikan llena los dos cachés.** La respuesta de búsqueda ya trae los datos completos de cada anime; si no se guardan ambos a la vez, un acierto en el caché de búsquedas seguiría necesitando una segunda llamada.
2. **Un freno en la base de datos, no en memoria — y con las dos dimensiones.** Contar solo por segundo no sirve: 3 por segundo, cada segundo, dan 180 por minuto, el triple del techo. El freno es un **cubo de fichas** en una sola fila: se rellena **una ficha cada 1.1 segundos** hasta un máximo de 3, y cada llamada toma una ficha antes de salir. Eso da ráfagas de 3 con un ritmo sostenido de ~54 por minuto — por debajo del techo de 60, con margen. (Rellenar a 1 ficha por segundo exacto daría 63 por minuto: por encima del techo.)

   **Qué pasa cuando no hay ficha:** el llamador espera y reintenta, con un tope total de **6 segundos**; pasado eso, ese candidato se descarta y la AI sigue con otro. Sin ese tope, una respuesta con 5 verificaciones y caché frío podría acercarse al corte de 30 segundos de §3.3 y el usuario vería un error en un flujo que estaba funcionando.

   **Las verificaciones se piden en paralelo pero salen serializadas por el freno** — el paralelismo sirve para las que aciertan en el caché (instantáneas); las que salen a internet respetan el ritmo.
3. **Reintento con espera creciente.** Ante un 429 o un 504 (que se vio en vivo), se reintenta a 1 s, 3 s y 9 s. Al tercer fallo se descarta ese candidato y la AI sigue con otro. **Una caída de Jikan degrada la respuesta, nunca tumba la app.**

---

## 4. Las piezas y cómo se hablan

```
  NAVEGADOR (celular)
    │  ninguna llave vive aquí
    ▼
  SERVIDOR (funciones de Next.js en Vercel)
    │
    ├─► /api/chat ─────► Anthropic (Sonnet 5)
    │        │           bucle: se guarda en memoria intermedia
    │        │           hasta que una vuelta no pide herramienta
    │        └─► herramienta buscar_anime
    │                 ├─► caché de búsquedas (Supabase)
    │                 └─► Jikan (con freno en base de datos)
    │
    ├─► /api/traducir ─► Anthropic (Haiku 4.5), bajo demanda
    │
    └─► Supabase (SIEMPRE desde el servidor, nunca desde el navegador)
         ├─ catalogo_cache    (datos de anime, 7 días)
         ├─ busquedas_cache   (título → ids, 24 horas)
         ├─ perfiles          (gusto anónimo y con cuenta)
         ├─ listas            (visto / quiero ver / calificación)
         ├─ uso               (contadores de mensajes)
         ├─ jikan_fichas      (el freno)
         └─ errores           (para saber qué se rompió)
```

**Regla de seguridad:** las llaves de Anthropic y la llave de servicio de Supabase **solo existen del lado del servidor**. Una llave en el navegador significa que cualquiera puede gastar tu presupuesto de API.

### Cómo viajan las tarjetas y el texto por el mismo canal

El mecanismo que define el producto — portadas primero, texto después — necesita que **un mismo canal lleve dos cosas distintas**. Si se usa una librería de chat lista para usar, esas librerías solo transmiten texto, y el mecanismo desaparece en silencio: las tarjetas terminarían apareciendo al final, junto con el texto, y nadie notaría que se perdió.

`/api/chat` devuelve un flujo de eventos con nombre:

| Evento | Cuándo | Qué lleva |
|---|---|---|
| `tarjeta` | En cuanto la herramienta verifica un anime | Los 6 campos + `razon` (el porqué, puede ir vacío) |
| `texto` | Mientras la AI redacta | Un pedacito de texto |
| `chips` | Al final de una respuesta con recomendaciones | Los 3 chips de refinamiento (§6 del doc de experiencia) |
| `fin` | Al terminar | — |
| `error` | Si algo falla | El estado que corresponde de §3.3-3.9 |

El navegador lee ese flujo directamente. **No se usa una librería de chat** para esta ruta.

---

## 5. Los datos y su seguridad

```
perfiles
  id                 uuid, llave primaria
  dispositivo_id     texto, ÚNICO       ← identificador del navegador
  usuario_id         uuid, ÚNICO, nulo hasta que crea cuenta
  gusto              json
  ultimas_recomendaciones json          ← para el estado "Seguías con esto"
  creado_en          fecha
  actualizado_en     fecha              ← decide qué gana al fusionar

listas
  id, perfil_id → perfiles, anime_id (entero, el id de MAL)
  estado         texto: visto | quiero_ver
  calificacion   texto: no_fue_lo_mio | estuvo_bien | me_encanto | nulo
  UNIQUE(perfil_id, anime_id)           ← evita duplicados al tocar dos veces

catalogo_cache    anime_id (llave), datos json, sinopsis_es texto, expira_en
busquedas_cache   consulta_normalizada (llave), anime_ids json, expira_en
uso               clave, tipo, ventana_inicio, conteo — PRIMARY KEY(clave,tipo,ventana_inicio)
jikan_fichas      UNA SOLA FILA: fichas numeric, ultima_recarga fecha
errores           id, ruta, mensaje, contexto json, creado_en
```

### Tres operaciones que DEBEN vivir dentro de la base de datos

Esto no es un detalle de estilo: **la librería con la que se habla a Supabase no puede agrupar varias escrituras en una sola operación indivisible, ni sumar uno a un contador sin leerlo primero.** Escrito de la forma natural, el resultado son bugs silenciosos: contadores que pierden cuentas cuando llegan dos peticiones al mismo tiempo, y fusiones que se quedan a medias y borran la lista de alguien.

Las tres se escriben como funciones **dentro de la base de datos** (cada función es indivisible por definición) y se llaman desde el servidor:

| Función | Qué hace | Por qué ahí |
|---|---|---|
| `fusionar_perfil(anonimo, cuenta)` | Copia la lista del perfil anónimo ignorando duplicados y borra el perfil anónimo | Si falla a medias, no queda nada a medias. Es la operación que puede borrar los datos de alguien |
| `incrementar_uso(clave, tipo, ventana)` | Suma uno y devuelve el total, en una sola operación | Leer-y-luego-escribir pierde cuentas con peticiones simultáneas, que es justo el caso que el candado quiere frenar |
| `tomar_slot_jikan()` | El cubo de fichas de §3: rellena y descuenta en una sola operación | Es lo que hace que el freno funcione entre todas las copias de la aplicación |

**Limpieza:** `incrementar_uso` aprovecha su paso para borrar las filas vencidas de su propia tabla, y lo mismo hacen las lecturas de caché con las suyas. Sin eso, las tablas crecen para siempre y en el plan gratuito de Supabase eso es una fuga lenta que nadie ve hasta que la base se llena. El cubo de fichas no tiene el problema: es una sola fila.

### La seguridad de la base: cerrada, no "con reglas"

Supabase tiene reglas de acceso por fila (RLS), pero **esas reglas no pueden proteger perfiles anónimos**: distinguen usuarios por su sesión de login, y aquí la mayoría no tiene login. Una regla que permita leer perfiles anónimos tendría que permitirlos todos.

**Decisión: la base se cierra por completo y ningún dato pasa por el navegador.** Todo acceso ocurre en el servidor, con la llave de servicio. El navegador nunca habla con Supabase directamente. Además de ser seguro, es más simple de construir: una sola vía de acceso en lugar de dos.

### El identificador del dispositivo: cookie firmada, no almacenamiento local

Guardarlo en el almacenamiento del navegador lo deja legible por cualquier script y viajando en cada petición, así que quien consiga el identificador de otra persona puede leer su lista. **Se usa una cookie firmada por el servidor, marcada como inaccesible para scripts.** De paso mejora la persistencia en el navegador de WhatsApp y en iOS — mitiga parcialmente la Open Question 6.

### La fusión al crear cuenta (SOLO si el paso 8 sobrevive)

**Esta sección entera depende de que la cuenta por correo no se recorte.** El plan de alcance la marca como el primer candidato de recorte, y es aproximadamente un día de trabajo. Si se recorta, esta sección y su prueba automática se van con ella.

Es la operación que más puede doler: un fallo a medias borra la lista de alguien.

- **Toda la fusión ocurre dentro de una sola transacción** en la base de datos. Si algo falla, no queda nada a medias.
- **Si el correo ya tenía perfil, ese gana**; la lista del perfil anónimo se copia ignorando duplicados y el perfil anónimo se borra.
- **`UNIQUE(usuario_id)`** evita que un usuario con tres dispositivos termine con tres perfiles y la fusión nunca se dispare.
- **Se descarta la heurística de "conservar el gusto más reciente"** — era la parte más compleja y la de menos valor. Gana el perfil de la cuenta, y punto.

---

## 6. Los candados de gasto (cierran el Riesgo 5)

El tope de 20 mensajes vive en el dispositivo, así que se evade en incógnito. Los candados reales son tres, y el tercero es el que más importa:

1. **Por dispositivo:** 20 mensajes por visita. El que el usuario ve. **"Visita" es una ventana de 24 horas** por dispositivo — sin esa definición, el servidor no tiene forma de contar (una "visita" no existe del lado del servidor, una ventana de tiempo sí).
2. **Para usuarios con cuenta:** 100 mensajes al día. §3.8 dice que con correo "el tope se levanta", y es cierto para el tope de 20 — pero crear una cuenta con código de correo no cuesta nada, así que sin ningún tope la cuenta sería la puerta abierta al gasto. 100 al día es holgadísimo para un usuario real e imposible de alcanzar sin intención.
3. **Por dirección de internet:** **300 por hora**, no 60. Las operadoras móviles de Latinoamérica comparten una misma dirección pública entre miles de personas; 60 por hora bloquearía a un barrio entero desde el primer día. La dirección se guarda como huella con secreto del servidor (**HMAC**, no un hash simple: el espacio de direcciones de internet es tan chico que un hash sin secreto se revierte por fuerza bruta).

   **De dónde se lee la dirección importa tanto como cómo se guarda:** se lee de la cabecera `x-vercel-forwarded-for`, que pone Vercel y el visitante no puede falsificar. Leer la cabecera común `x-forwarded-for` haría el candado decorativo — cualquiera antepone una dirección inventada en cada petición y el tope deja de existir, justo contra el automatizado que motivó ponerlo.
4. **Tope de tamaño — el candado que de verdad protege el presupuesto.** El historial viaja desde el navegador en cada petición. Sin límite, cualquiera manda 200 mensajes largos y quema el presupuesto en unas decenas de peticiones sin tocar el tope de 20, que cuenta mensajes, no tamaño.

   **El servidor recorta, no rechaza.** Un tope de 20 mensajes del usuario significa hasta ~40 entradas en el historial (van y vienen), así que rechazar a las 24 cortaría al usuario legítimo a la mitad de lo prometido, con un error genérico. En su lugar: se conserva el historial reciente hasta un tope de caracteres y se descarta el más viejo, **siempre respetando los pares completos de "búsqueda + resultado"** (partirlos rompe la petición). Máximo ~2,000 caracteres por mensaje del usuario; eso sí se rechaza, porque nadie escribe tanto de buena fe.

**Los contadores se incrementan de forma atómica** (una sola operación que suma y devuelve), no leyendo-y-luego-escribiendo: dos peticiones simultáneas con el patrón ingenuo pierden incrementos, que es justo el caso que se quiere frenar.

**Qué ve el usuario en cada tope** (sin esto, quien implemente adivina):

| Tope | Pantalla |
|---|---|
| 20 mensajes sin cuenta | §3.8 — invitación a guardar con correo |
| 100 al día con cuenta | §3.9 — mensaje humano de "vuelve mañana" |
| 300 por hora por dirección | §3.9 — el mismo, sin explicar el motivo real |
| Tope de gasto de Anthropic | §3.9, **nunca** el genérico de "se me trabó el cerebro" |

---

## 7. Decisiones menores, cerradas

| Tema | Decisión |
|---|---|
| **Traducción de sinopsis** | Bajo demanda, solo del anime que se abre en el detalle. Se cachea. **Solo traduce animes que ya existen en el caché de catálogo** — eso la acota sola: nadie puede pedir traducciones arbitrarias, porque solo hay algo que traducir si ese anime ya se mostró |
| **Portadas** | Enlace directo al CDN de MyAnimeList, sin pasar por el optimizador de imágenes de Vercel (consumiría la cuota gratuita en pocas visitas). Carga diferida |
| **"Dónde verlo"** | Link de búsqueda armado con el título, sin promesa por país |
| **Portadas del arranque de gusto** | 10 títulos muy conocidos, fijos en el código, **con sus datos precargados en el caché desde la primera migración**. Si se pidieran en vivo, competirían con el freno y la primera visita — el momento más importante del producto — empezaría con diez segundos de cuadrícula vacía |
| **Duración de las funciones** | `maxDuration` explícito de 120 segundos en `/api/chat`. El bucle con verificaciones y reintentos puede pasar del default y cortarse a media respuesta |
| **Observabilidad** | Tabla `errores` y captura en cada ruta del servidor. Cinco minutos de trabajo que evitan depurar a ciegas — sin esto, un fundador no técnico no tiene forma de saber que algo se rompió en producción |

---

## 8. Pruebas — lo que rompe el producto en silencio

| Qué | Por qué | Tipo |
|---|---|---|
| **La comparación de títulos** | Decide si se muestra el anime correcto. Casos: acentos, mayúsculas, español vs romaji, títulos parecidos que NO deben confundirse | Automática |
| **El freno en la base de datos** | Con conexiones concurrentes reales, no en un solo proceso — un test de un solo proceso da confianza falsa sobre un problema que solo existe con varias copias | Automática |
| **El reintento ante 429 y 504** | Se vio un 504 real. Debe degradar, no tumbar | Automática |
| **Los tres candados de gasto** | Que dispositivo, dirección e historial cuenten por separado y ninguno se salte | Automática |
| **La fusión de perfiles** | Escribe datos del usuario. Un error aquí borra su lista | Automática |
| **Las 10 conversaciones de prueba** | Riesgo 1 del plan de alcance. **No se automatiza — se juzgan a mano** | Manual, obligatoria |

**No se prueba automáticamente en el MVP:** el aspecto visual (para eso está /design-review con la app corriendo) y los flujos completos de navegador (caros de mantener, poco valor con una sola pantalla).

---

## 9. Orden de construcción

Cada paso deja algo visible funcionando.

1. **Esqueleto + tema visual** — Next.js, el tema de raicode, una pantalla que carga en el celular.
2. **La capa de catálogo** — los dos cachés, el freno en base de datos, el reintento, la tabla de errores, y sus pruebas. Es el cimiento.
3. **El chat con verificación** — la parte que decide si el producto sirve. **Aquí se corren las 10 conversaciones de prueba y se mide el tiempo hasta la primera portada visible (no hasta la primera palabra). Si la mediana pasa de 8 segundos, se replantea antes de seguir.** La calidad y la velocidad se miden juntas, no una ahora y otra después.

   **Expectativa realista:** con caché frío el camino completo (pensar, verificar 3-5 títulos a un ritmo de uno por segundo, redactar) puede acercarse a 10 segundos hasta la primera palabra; **la primera portada llega mucho antes**, y por eso es la que se mide. Con caché caliente — el caso normal después de las primeras conversaciones — la primera portada aparece en pocos segundos.
4. **La vitrina** — carrusel, tarjetas, estados.
5. **Los paneles** — detalle y mi lista.
6. **Memoria y perfil** — cookie firmada, gusto, guardado.
7. **Candados** — los tres topes y la alerta de gasto.
8. **La cuenta por correo** — lo último a propósito: lo más caro y el primer candidato de recorte (Riesgo 4).

---

## 10. Lo que queda abierto

**Dos tareas de Roberto, ninguna bloquea el MVP:**
- **El tope de gasto en la consola de Anthropic** — alerta a $25, tope duro a $50. **El mismo día que se conecte la llave de API**, no después: sin eso, el estado de cuenta sería el primer aviso.
- **La llave oficial de MyAnimeList** — registrar la app cuando vaya en serio.
- **Disponibilidad por país** (OQ5) — sin fuente gratuita confiable. Se queda el link de búsqueda.
- **Persistencia del identificador en WhatsApp/iOS** (OQ6) — mitigado con la cookie firmada, no resuelto del todo. Afecta la medición, no el producto.
- **El costo real por conversación** — el plan de alcance lo estimó con supuestos explícitos. Dos cosas lo mueven hacia arriba (el resultado de la herramienta se acumula en el contexto; Sonnet 5 usa un tokenizador nuevo que cuenta más) y dos hacia abajo (el caché de prompt descuenta 90% en las lecturas; el esfuerzo bajo reduce el pensamiento). **Se mide de verdad durante el paso 3**, con las 10 conversaciones de prueba, en lugar de re-estimar a ciegas.
