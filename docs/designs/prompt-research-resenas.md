# Prompt de research — quejas de reseñas (para usar en otra sesión de Claude)

## Antes de pegarlo: cómo juntar las reseñas

- **5 a 7 productos**, **50 a 100 reseñas por producto**. Con menos, el umbral de "3 productos" no significa nada.
- **En español primero** (Google Play / App Store con región México o Latinoamérica). BSP es para hispanohablantes; las quejas de un usuario de EE.UU. pueden ser otras.
- **Todas las estrellas, no solo las malas.** Una queja dentro de una reseña de 4 estrellas ("me encanta, pero nunca sé qué ver después") es la señal más valiosa: viene de alguien que sí usa el producto.
- Candidatos (confianza entre paréntesis):
  - MyAnimeList — app oficial (alta)
  - Crunchyroll — ojo: mucha queja de video y cobros, el prompt la filtra (alta)
  - Apps de AniList de terceros, p. ej. AniHyou (media — AniList no tiene app oficial)
  - Anime-Planet (baja — revisa si tiene app con reseñas)
  - Cualquier app de "recomendador de anime" que aparezca al buscar en la tienda (media)
- **Reddit no son reseñas**, pero los hilos de "acabé X, ¿qué veo?" de r/anime o r/animemexico sirven. Si los usas, etiquétalos como `[foro]` para que el análisis los pueda separar.
- Formato por reseña, una por línea:
  `[Producto] [★N] texto de la reseña tal cual`

---

## El prompt (copia desde aquí)

Vas a hacer un análisis de demanda a partir de reseñas reales. Trabaja en español.

**Contexto de la categoría (no del producto):** son apps y servicios que la gente usa alrededor de ver anime: listas para registrar lo que ves, recomendadores, plataformas de streaming y foros. Me interesa UN trabajo específico que la gente les pide a estas apps:

> **Decidir qué ver después**, sobre todo en el momento en que acabas una serie y no sabes qué sigue.

Incluye en ese trabajo todo lo que toca la decisión: encontrar qué ver, saber si algo me va a gustar, saber cuántos episodios tiene o si ya terminó, saber dónde verlo, llevar el registro de lo que vi para que las recomendaciones mejoren, y el idioma en que se hace todo eso.

Te voy a pegar reseñas de [N] productos. Cada una trae el producto, las estrellas y el texto. Algunas pueden venir marcadas `[foro]`: no son reseñas de tienda, son publicaciones de foros.

[PEGAR RESEÑAS AQUÍ]

### Parte A — análisis a ciegas

**Paso 0. Filtra.** Separa cada queja en dos grupos:
- **Dentro del trabajo** (decidir qué ver, como lo definí arriba)
- **Fuera del trabajo** (reproducción de video, cobros, anuncios, crasheos, login, etc.)

Dime cuántas quejas cayeron en cada grupo. A partir de aquí trabaja **solo con las de dentro**. Si una queja es ambigua, déjala fuera y dime cuál fue.

**Paso 1.** Encuentra las quejas que se repiten en **al menos 3 productos distintos**. Ignora las que salen en uno o dos. Agrupa por problema de fondo, no por palabras: "nunca sé qué ver" y "me recomienda puras cosas que ya vi" pueden ser el mismo problema o dos distintos — decide y explica por qué.

**Paso 2.** Para cada queja que sobrevivió:
- cuántas reseñas la mencionan y en cuántos productos
- cuántas de esas reseñas son de 4-5 estrellas (gente que usa el producto y aun así se queja) y cuántas de 1-3
- **3 citas textuales**, cada una con su producto y estrellas

Reglas de las citas: cópialas **exactamente como vienen**, sin corregir ortografía. Si una está en inglés, cítala en inglés y pon la traducción entre corchetes después. **No cites nada que no esté en lo que te pegué.** Si no hay 3 citas buenas, pon las que haya y dilo.

**Paso 3.** Elige la queja más grande. Para que cuente como señal clara, necesita al menos **5% de las reseñas "dentro del trabajo"** y aparecer en **3 o más productos**. Si ninguna llega, escribe exactamente: **"no hay un hueco claro"**, y dime cuál quedó más cerca y qué faltaría para confirmarla. No fuerces una.

**Paso 4.** Escribe la hipótesis de demanda así:

> "Creemos que [quién, lo más específico que permitan las reseñas] sufre [problema, con las palabras de ellos] y dejaría de usar [lo que usa hoy] por [solución]."

Después, por separado: **¿hay evidencia en las reseñas de que pagarían por resolverlo?** Contesta con citas o con "no hay evidencia". No la infieras.

**Paso 5.** Escribe **3 títulos de anuncio para Google Ads** usando las palabras exactas de los clientes.
- **Máximo 30 caracteres cada uno, contando espacios.** Pon el conteo al lado.
- Cada título tiene que salir de una cita del paso 2: di de cuál.
- Nada de promesas que las reseñas no respaldan.

### Parte B — ahora sí, el producto

Lee esto **solo después de terminar la Parte A, sin cambiarla**:

> **BSP** es una app web en español, pensada para celular. Es un chat con una IA a la que le cuentas qué acabaste de ver, y te recomienda qué sigue: cada recomendación sale como tarjeta con portada, número de episodios, si ya terminó o sigue en emisión, dónde verla, y **una frase de por qué te la recomienda a ti**. Recuerda lo que viste, lo que quieres ver y lo que dejaste a medias, sin necesidad de crear cuenta. Su competidor real no es MyAnimeList sino **preguntarle a ChatGPT**.

**Paso 6.** Con honestidad:
- ¿BSP ataca la queja más grande del paso 3? Sí, parcialmente o no — y por qué.
- ¿Cuál de las quejas que encontraste **no resuelve** BSP?
- Si el hueco más grande no tiene nada que ver con BSP, **dilo claramente**. Ese resultado vale más que una confirmación.
