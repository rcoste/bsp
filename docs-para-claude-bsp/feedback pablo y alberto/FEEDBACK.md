# Feedback del demo BSP v2

Me metí a los dos prototipos con calma (código, no nada más clickear) y esto es lo que encontré.
Lo escribí para leerse de corrido, pero también para pegarlo en Claude Code y que pueda trabajar:
cada punto trae archivo y línea.

Los dos archivos —`BSP Desktop v2.dc.html` y `BSP Móvil v2.dc.html`— son la misma lógica con
distinto layout (los 28 métodos son idénticos), así que **cualquier cambio va en los dos**.
Cuando cito líneas van como `desktop / móvil`.

Los números de producción que menciono salen del análisis de retención del 28 de agosto sobre
1,982 usuarios reales.

---

## Lo primero, para no perder tiempo

Lo que ya está construido está bien construido. La tarjeta con sus tres datos verificables, el
llenado sin cortina, el arranque de gusto de tres toques, el historial de sets que puedes volver a
abrir desde el chat: nada de eso hay que tocarlo. Se siente bien y es la parte difícil de acertar.

El problema está abajo. **El demo no puede sostener una biblioteca.** Guarda tres booleanos por
serie (`vistos`, `saved`, `rejected`), trae 13 animes escritos a mano en el código, y no tiene
episodios ni estados. Nada más.

Eso pega justo donde duele, porque en producción la biblioteca resultó ser lo único que decide si
alguien regresa: **quien arma 20 títulos el primer día vuelve en un 46%; quien arma uno o dos,
en un 6%.** No es un factor más, es *el* factor.

Y por eso las funciones que se listaron en el hilo no son pendientes sueltos: son el mismo hueco
visto desde varios ángulos. Hacerlas como pantallas nuevas se va a sentir eterno; casi todas se
caen solas en cuanto exista el modelo de datos. El caso más claro es "con qué sigo": sin episodios
y sin estados no hay manera de decir "vas en el 8 de 12", por más pantalla que le pongas.

---

## La lista del hilo, revisada una por una

Tres ya están, una está a medias, cuatro no existen.

| Función | ¿Está? | Detalle |
|---|---|---|
| Sugerencias de anime | Sí | Es lo mejor del demo. `computeRecs` pondera géneros por vistos (+2), guardados (+1) y rechazados (−2), con sesgos *corto* / *raro* / *acción* |
| Ver detalles de una serie | Sí | Ficha completa: sinopsis, episodios, estado, año, dónde verla, relacionados. Le falta la lista de episodios y el "próximo episodio" |
| Evaluar mi gusto | Sí | Funciona, pero se corta a los 3 toques. Ahí hay algo grande, lo explico abajo |
| Buscar por nombre o género | A medias | Por nombre: local, sobre 13 títulos, máximo 3 resultados y sin tolerancia a errores de dedo. Por género no existe: el campo `gen` sólo puntúa recomendaciones, nunca busca. Ojo con cómo lo resuelves, ver "lo que yo no haría" |
| Marcar vista / **viendo** | No | "Vista" sí, como booleano. **"Viendo" no existe.** Y sin ese estado no hay continuar, no hay próximo episodio, no hay razón de volver mañana |
| Calificar | No | Nada, ni siquiera la calificación de 3 estados que `DESIGN.md` declara componente oficial. Sobre calificar por episodio: ver "lo que yo no haría" |
| Marcar episodios terminados | No | No hay entidad episodio. `eps: 32` es un número suelto: sin títulos, sin fechas de emisión, sin progreso |
| Saber con qué seguir | No | El rail "Seguías con esto" engaña: no son pendientes, son guardados más el último set de recomendaciones. Nunca te dice "vas en el 8 de 12" |

---

## Lo que también falta y no venía en esa lista

### Los tres cimientos

Esto va antes que cualquier pantalla. Vive en el objeto `CAT` (`297 / 229`) y en el `state`
(`292 / 224`).

**Entidad episodio.** Hoy `eps: 32` es un entero y ya. Con episodios reales desbloqueas marcar
episodios, continuar, calificar y el catch-up, todo de un jalón.

**Estado real** en lugar de los tres booleanos: viendo, vista, pendiente, pausada, abandonada.
De ahí sale el "con qué sigo" y todos los rails de continuar.

**Catálogo real.** Con 13 series `computeRecs` se queda sin pool y el bot contesta
*"¡Te acabaste mi archivo!"*. En una demo frente a alguien llegas ahí en dos minutos.

Hay un cuarto que es opcional pero sale barato: **emisión y calendario**. Hoy la única señal de
vida es `fin: true/false`. Sin un "el ep 9 sale el viernes" no existe razón para volver la semana
siguiente, y en producción esa razón duplica el regreso entre quienes ya tienen biblioteca.

### Seis cosas que el chat debería poder hacer y no puede

El prompt de Sen Pai (`505 / 438`) sólo acepta cinco acciones: `recs`, `guardados`, `serie`,
`acabo` y `none`. Todo lo demás se va al fallback de regex (`479 / 412`) y termina en
*"No me quedó claro, nakama"*.

- **Registrar avance hablando.** "Voy en el 8 de Frieren", "vi tres capítulos hoy". Este es el
  hueco más caro de todos: es la promesa central de un producto chat-first y hoy es literalmente
  imposible.
- **Calificar hablando.** "Me encantó", "estuvo floja". No hay acción `rate`.
- **"Esa ya no me la recomiendes."** El estado `rejected` existe adentro, pero sólo se toca con el
  botón; desde el chat no hay forma de escribirlo.
- **Preguntar sobre una serie.** "¿De qué trata?", "¿dónde la veo?". La acción `serie` pinta la
  tarjeta y ya; nunca contesta lo que preguntaste.
- **Buscar por lo que sea que se te ocurra.** "Algo de terror", "romance corto", "algo de los 90".
  Hoy los sesgos están quemados a tres (`corto`, `raro`, `accion`), así que cualquier otra forma de
  filtrar no existe. En un producto de chat, esto *es* la búsqueda por género.
- **Varias cosas en un mensaje.** "Acabé Frieren y voy en el 3 de Dandadan." El esquema JSON sólo
  admite un `serieId`, así que la otra mitad del mensaje se pierde sin avisar.

---

## La palanca grande: no cortes el arranque de gusto en 3

Línea `446 / 379`:

```js
if (Object.keys(vistos).filter(k => vistos[k]).length >= 3 && !this.arranco) {
```

Esto me parece lo más importante del documento, y es casi una línea de código.

El arranque de gusto ya es, sin que nadie lo diseñara así, el mejor constructor de biblioteca que
tiene el producto. Y a los tres toques lo cortas para saltar a recomendar. En producción la
mediana de títulos que agrega un usuario nuevo el día 1 es de dos, y ahí la retención es 6%.
Cruzando los 20 se va al 46%.

Déjalo correr hasta unos 20 con un medidor visible ("llevas 7, con 20 te leo completo") y lanza
las recomendaciones en paralelo, no en lugar de. Tres toques bastan para leer el gusto; no bastan
para construir nada.

---

## La pantalla de "¿qué quieres hacer?"

La idea va bien encaminada, pero vale la pena saber cómo salió cuando se probó en producción: con
ocho opciones, **230 personas vieron la puerta y nunca eligieron nada.** De las ocho ramas sólo
"vengo de otro tracker" produjo usuarios que se quedaran, y las dos de "busco dónde ver algo"
retuvieron un 3%.

Con cuatro puertas creo que sí funciona:

| Puerta | Aterriza en | Por qué esa |
|---|---|---|
| Recomiéndame algo | Arranque de gusto → recomendaciones | Es el 11% de lo que la gente le pide al chat, y de paso construye biblioteca |
| Traigo mi lista | Constructor rápido o importador | La única rama que en producción produjo gente que se quedó |
| ¿Con qué sigo? | Rail de continuar | Es la razón de volver. Necesita el estado "viendo" primero |
| Busco una serie | Búsqueda → ficha | Consulta puntual, pero que aterrice con el botón de agregar bien visible |

Dos condiciones. Que se pueda saltar en un toque, porque una puerta que atora es peor que no tener
puerta. Y que las cuatro terminen agregando títulos: la que responde y despide ("aquí la ves,
adiós") es justo la que retuvo 3%.

---

## Lo que yo no haría

Tres cosas de la lista que, tal cual están planteadas, pelean con lo que es el producto.

**Calificar por episodio.** Calificar por serie sí, y urge. Pero por episodio es fricción que sólo
piden los power users de MAL, y choca de frente con el propio `DESIGN.md`, que dice explícitamente
"NUNCA estrellas ni escalas numéricas" y define la calificación como tres botones. Empieza con los
tres estados por serie. Si alguien pide más granularidad, que sea por temporada, no por episodio.

**Una pantalla de filtros por género.** En un producto de chat, filtrar es escribir. Poner un panel
de checkboxes de géneros sería admitir que el chat no sirve para lo básico. Lo que falta no es la
UI de filtros: es que Sen Pai entienda "algo de terror pero corto" (ver los sesgos quemados
arriba). Misma función, y encaja con el producto en vez de contradecirlo.

**Las cuatro puertas como pantalla aparte.** Si abres un chat con un menú de botones, ya perdiste
la mitad del argumento. Que sean los primeros mensajes de Sen Pai con cuatro chips de respuesta
rápida, dentro de la conversación. Se responde igual de rápido, se puede ignorar escribiendo otra
cosa, y no rompe la promesa.

---

## Siete arreglos de implementación

Van ordenados por lo que rompen, no por dificultad.

**1. El chat no recuerda nada.** `506 / 439`

```js
messages: [{ role: 'user', content: t }],
```

Cada turno viaja solo. Le dices "recomiéndame algo corto" y luego "más corto todavía", y el modelo
no tiene idea de qué es "más". Es la razón número uno por la que un chat se siente tonto, y lo
peor es que no se nota probando un mensaje a la vez, que es como todos probamos. Manda los últimos
diez turnos del hilo. Es media hora y cambia por completo la sensación del producto.

**2. Hay estado guardado fuera del estado.** `292 / 224`

`_base`, `_lastSetIds`, `_lastOpts` y `arranco` son variables de instancia, no `state`, así que
cambiarlas no vuelve a pintar. El banner de "TE RECUERDO… ¿y ahora?" lee `this._base` dentro de
`renderVals` (`519 / 452`) y por eso a veces muestra la serie anterior o nada. Si algo decide lo
que se ve en pantalla, va en el estado.

**3. Un JSON mal formado se disfraza de "no te entendí".** `509 / 442`

```js
const j = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
```

Si el modelo no devolvió llaves, esto truena, y el `catch` manda todo al router de regex, que casi
siempre contesta "No me quedó claro, nakama". Un error técnico terminando disfrazado de
incomprensión es lo peor de los dos mundos: el usuario cree que se explicó mal y tú nunca te
enteras de que el modelo está fallando. Valida el `match` antes de indexar, reintenta una vez
recordándole el formato, y distingue "fallé yo" de "no te entendí" en la voz de Sen Pai — de hecho
`DESIGN.md` ya te dio la frase: "Se me trabó el cerebro tantito".

**4. Dos mensajes seguidos se pisan.** `493 / 426`

No hay bandera de ocupado ni cancelación, así que si mandas dos mensajes rápido ambas llamadas
resuelven y ambas pueden llamar `startSet`. Terminas con el set del primero y el globo del
segundo. Y en chat la gente sí escribe encima. Mete un `sending` en el estado que deshabilite
input y chips —`DESIGN.md` ya lo pide, "comparten estado con el input"— o un token de petición que
descarte las respuestas viejas.

**5. Las portadas tardan nueve segundos y se vuelven a bajar cada vez.** `317 / 249`

`loadCovers` pide una portada a la vez con 700 ms de espera entre cada una (`330 / 262`): trece por
0.7 son unos nueve segundos hasta que aparece la última. Y no guarda nada, así que cada recarga de
la página repite las trece llamadas. Con un catálogo real esto no se sostiene, y Jikan castiga por
IP cuando la aporreas. Para el demo yo de plano metería las trece portadas como archivos locales y
quitaría la dependencia de red; para el producto, caché con caducidad.

**6. Hay una carrera al descartar tarjetas.** `431 / 363`

`rechaza()` lee `this.state.cards` dentro de un `setTimeout` que corre después de un `setState`,
o sea que la lista de "ya mostradas" puede venir vieja y el reemplazo puede ser una serie que ya
está en pantalla. Se reproduce descartando dos tarjetas rápido, que es justo lo que hace alguien
explorando. Calcula el reemplazo dentro del `setState` funcional.

**7. Descartar es para siempre y no hay cómo deshacer.** `431 / 363`

`rechaza()` marca `rejected` permanentemente y pesa −2 en todas las recomendaciones que siguen. Un
toque accidental te envenena la sesión sin vuelta atrás. Como "descartar" es uno de los tres
botones principales de la tarjeta, vale la pena un deshacer en línea de unos segundos.

---

## Cómo lo ordenaría

1. **El modelo de datos: episodios y estados.** Sin esto casi todas las funciones de la lista son
   imposibles y el resto queda cojo. En un demo es una tarde, y desbloquea todo lo demás.
2. **El chat con memoria** (arreglo 1) y las acciones que le faltan al router, empezando por
   registrar avance hablando.
3. **Que el arranque de gusto no se detenga en 3.** Medidor visible, meta 20, recomendaciones en
   paralelo.
4. **Estado "viendo", rail de continuar y calificación de 3 estados.** Las tres juntas cierran el
   ciclo completo: agrego, veo, registro, y me dice con qué sigo.
5. **Catálogo real y portadas locales** (arreglo 5). Sin esto el demo se queda sin archivo a media
   presentación.
6. **Los cuatro chips de arranque y la búsqueda por vibra.** Hasta el final, porque las dos
   dependen de todo lo anterior.
