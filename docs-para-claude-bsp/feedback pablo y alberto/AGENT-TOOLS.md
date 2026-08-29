# BSP_Chat — Tool-calling agent

**Self-contained implementation spec.** You do not need any other repository. Everything the port requires — the loop, the parsers, the validators, the tool schemas, the executors, the full system prompt — is written out below.

**What this is.** BSP_Chat is a working chat-first prototype of Binge Senpai (anime tracking + recommendations, Spanish). Its chat is currently a one-shot JSON action router with 5 hardcoded actions. This document ports it to the architecture the production Binge Senpai agent runs on: a real tool-calling loop over a text-XML protocol, with validation, corrective retries, budgets and idempotent writes.

**Language.** The spec is in English. **Every user-facing string, prompt rule and error message stays in Spanish** — that's Sen Pai's voice, defined in `DESIGN.md`. Production does the same: English system prompt and schemas, plus a rule telling the model to answer in the user's language.

**Rationale notes** marked *(prod)* describe what the production system measured or learned. They're there so you don't undo a rule that looks arbitrary. You can't verify them from here; treat them as design constraints, not as things to check.

---

## TL;DR

Today `send()` (`BSP Desktop v2.dc.html:493`, `BSP Móvil v2.dc.html:426`) makes one model call, asks for `{"reply":…,"action":"recs|guardados|serie|acabo|none"}`, parses it with `JSON.parse(raw.match(/\{[\s\S]*\}/)[0])`, and switches on `action`. Anything outside those five actions — or any parse hiccup — falls into `catch` → `fallbackRoute()` → *"No me quedó claro, nakama."*

| | Today | After this port |
| --- | --- | --- |
| Protocol | one JSON blob, 5 fixed actions | `<function_calls>` XML printed as message text, 6 tools |
| Turn | 1 model call | loop: call → parse → execute → append results → call again, until a tool-free reply |
| Context | `messages: [{role:'user', content: t}]` — one message, no history | full transcript: system + every turn + every tool result |
| Catalog | dumped into the system prompt as text | reached through search/read tools |
| Library | 3 booleans per series (`vistos`/`saved`/`rejected`) | real entries: estado + episodio + reacción |
| Failure | `catch` → generic "no te entendí" | validate → quote the defect back → retry → graceful wrap-up |
| UI trigger | the `action` field | entity tags in the reply + tool results |

The visual layer does not change: koma grid, speed-lines fill, the three-button card, the fixed chips, the móvil dock. This changes what drives them.

---

## 0. The environment you're working in

### 0.1 The framework

Both prototypes are single-file `DCLogic` components. There is **no build step** — you edit the `.dc.html` files and reload the browser.

- `class Component extends DCLogic` with a `state = {…}` class field, `this.setState(patch)` or `this.setState(s => patch)`, `this.props` (declared in `data-props` on the script tag).
- `renderVals()` returns one flat object; the `<x-dc>` template binds to it with `{{ name }}`.
- Control flow in the template is `<sc-if value="{{ flag }}">` and `<sc-for list="{{ arr }}" as="item">`.
- Event handlers are functions returned from `renderVals()` (`onClick="{{ ch.click }}"`).

Three consequences that shape everything below:

1. **`{{ x }}` renders TEXT, not HTML.** There is no `dangerouslySetInnerHTML` equivalent. You cannot hand the model's markup to the template and expect bold titles. Either strip tags to their inner text before rendering (the simple path, §13), or split the reply into a `parts` array and loop it with `sc-for` (the nicer path, also §13).
2. **New state keys must exist in the `state = {…}` literal**, or the first render reads `undefined`.
3. **Anything the template touches must come out of `renderVals()`.** Instance fields (`this._foo`) are fine for agent internals but invisible to the template.

### 0.2 The two files

`BSP Desktop v2.dc.html` (620 lines) and `BSP Móvil v2.dc.html` (532 lines) are near-duplicates: same `state`, same `CAT`, same `send()`, same helpers, different layout. **Every change in this document lands in both.** Line numbers are given as `Desktop:NNN / Móvil:NNN` throughout.

Strongly consider hoisting the whole agent (registry, loop, parsers, validators, prompt) into a shared `agent.js` that both files load with a `<script src="./agent.js">` in `<helmet>`, the way they already share `support.js` and `_ds/`. Attach it as `window.BSPAgent` and call into it from each component. Otherwise the two prototypes will drift on what the product does, which is worse than the duplication itself.

### 0.3 The model API

The host provides exactly one function:

```js
const text = await window.claude.complete({
  system: '…',                                   // string
  messages: [{ role: 'user'|'assistant', content: '…' }],
  max_tokens: 300
});
// → a plain string. No finish_reason. No streaming. No tools parameter.
```

Three things follow:

- **There is no native function-calling channel.** A tool runs only because the model *printed* the XML in its visible message text and you parsed it back out. This is not a workaround — it's the same protocol production uses, for the same reason.
- **You cannot read a finish reason**, so truncation is inferred (§7).
- **Multi-message history should work** — the parameter is already an array — but probe it once before building on it. Send `[{role:'user',content:'di HOLA'},{role:'assistant',content:'HOLA'},{role:'user',content:'¿qué acabas de decir?'}]`; if the answer references HOLA, history is honored. If it isn't, flatten instead (§7.3). Do this probe first; everything else assumes it passed.

`window.claude` may be absent entirely (opening the file straight from disk outside the host). Handle it as a first-class degrade, not an exception (§7.2).

---

## 1. Six ground rules

These are the invariants the whole design rests on. Break one and the rest stops working.

1. **A tool runs only when the model prints the XML.** Say this in the system prompt, at the top *and* at the bottom. Models otherwise route calls into a native channel that does nothing and leaks raw markup to the user. *(prod: this was the single most expensive failure mode; the prompt carries the warning twice on purpose.)*
2. **A turn is a loop, not a call.** One user message may cost 1–6 model calls. The turn ends when the model returns a reply with no `<function_calls>` in it.
3. **Tool results re-enter the transcript** as messages the model reads on the next call. That is the entire mechanism by which it knows what it found.
4. **IDs are never invented.** A series may be rendered as a card only if its id arrived in a tool result *in this conversation*. Enforce in code, not just in the prompt.
5. **Writes take absolute values, never increments** (`episodio: 3`, never "advance by one"). This is what makes a retry safe.
6. **A technical failure never wears a user-error costume.** *"No me quedó claro, nakama"* is a fine reply to a genuinely ambiguous message and a lie after a JSON parse error.

---

## 2. Data model — do this first

Nothing else can be built on three booleans. Today:

```js
// state (Desktop:292 / Móvil:224)
vistos: {}, saved: {}, rejected: {}
```

That cannot express "watching, on episode 3", which is what half the missing features need. Migrate before touching the chat.

### 2.1 New state shape

```js
state = {
  mode: 'arranque', setPara: '', setTipo: 'recs', setEmpty: false, cards: [], sets: [],
  messages: [], input: '', chipMode: 'inicial', pendingFinished: false,
  covers: {}, detail: null,

  // ── nuevo ──
  biblioteca: {},      // { [serieId]: { estado, episodio, reaccion, actualizado } }
  evitadas: {},        // { [serieId]: true }  — "no me la recomiendes", permanente
  toolProgress: null   // { summary, status } | null
};
```

Entry shape:

```js
{
  estado: 'guardada' | 'viendo' | 'vista' | 'abandonada',
  episodio: 0,                                        // absoluto
  reaccion: 'no_fue_lo_mio' | 'estuvo_bien' | 'me_encanto' | null,
  actualizado: 1730000000000                          // Date.now()
}
```

`reaccion` is the product's 3-state rating from `DESIGN.md` — *"NUNCA estrellas ni escalas numéricas"*. Keep the vocabulary; the model is told the enum in the schema.

**Soft dismissal vs permanent avoidance.** Today `rejected` conflates them, and a card dismissal is permanent with no undo. Split:

- **Soft** — dismissing a card ("No, otra cosa"): excluded from the *current* set only. Keep in `this._descartadas` (an in-memory `Set`, not persisted). Undoable.
- **Permanent** — `evitadas`, set by `avoid_series` when the user says "esa ya no me la recomiendes". Excluded from every future recommendation, persisted.

### 2.2 Accessors

Put these on the component so no other code touches the raw maps:

```js
entryOf(id)      { return this.state.biblioteca[id] || null; }
esVista(id)      { return this.entryOf(id)?.estado === 'vista'; }
esGuardada(id)   { return this.entryOf(id)?.estado === 'guardada'; }
enBiblioteca(id) { return !!this.entryOf(id); }
esEvitada(id)    { return !!this.state.evitadas[id]; }

writeEntry(id, patch) {
  this.setState(s => ({
    biblioteca: { ...s.biblioteca, [id]: { episodio: 0, reaccion: null, ...(s.biblioteca[id] || {}), ...patch, actualizado: Date.now() } }
  }));
  this.persist();
}

setEvitada(id, on = true) {
  this.setState(s => {
    const e = { ...s.evitadas };
    if (on) e[id] = true; else delete e[id];
    return { evitadas: e };
  });
  this.persist();
}
```

### 2.3 Persistence + migration

Old key `bsp-v2-memoria` holds `{vistos, saved, rejected, lastAcabo, lastSet}`. Write a new key and migrate once, so anyone with the demo already open doesn't lose their state:

```js
STORE_KEY = 'bsp-v3-memoria';

loadMemoria() {
  try {
    const v3 = JSON.parse(localStorage.getItem(this.STORE_KEY) || 'null');
    if (v3) return v3;
    const v2 = JSON.parse(localStorage.getItem('bsp-v2-memoria') || 'null');
    if (!v2) return null;
    const biblioteca = {}, evitadas = {};
    Object.keys(v2.vistos || {}).forEach(id => { if (v2.vistos[id]) biblioteca[id] = { estado: 'vista', episodio: 0, reaccion: null, actualizado: 0 }; });
    Object.keys(v2.saved  || {}).forEach(id => { if (v2.saved[id] && !biblioteca[id]) biblioteca[id] = { estado: 'guardada', episodio: 0, reaccion: null, actualizado: 0 }; });
    Object.keys(v2.rejected || {}).forEach(id => { if (v2.rejected[id]) evitadas[id] = true; });
    return { biblioteca, evitadas, lastAcabo: v2.lastAcabo || null, lastSet: v2.lastSet || [] };
  } catch (e) { return null; }
}

persist() {
  setTimeout(() => {
    const { biblioteca, evitadas } = this.state;
    try {
      localStorage.setItem(this.STORE_KEY, JSON.stringify({
        biblioteca, evitadas, lastAcabo: this._lastAcabo || null, lastSet: this._lastSetIds || []
      }));
    } catch (e) {}
  }, 0);
}
```

### 2.4 Call sites to update

`st.vistos[c.id]` / `st.saved[c.id]` appear throughout `renderVals()` (card labels, the arranque grid, the detail view, `seguias`, `trending`). Sweep them:

| Old | New |
| --- | --- |
| `st.vistos[id]` | `this.esVista(id)` |
| `st.saved[id]` | `this.esGuardada(id)` |
| `st.rejected[id]` | `this.esEvitada(id) \|\| this._descartadas.has(id)` |
| `marcaVista(c)` | `this.writeEntry(c.id, { estado: this.esVista(c.id) ? 'guardada' : 'vista' })` |
| `guarda(c)` | `this.writeEntry(c.id, { estado: this.esGuardada(c.id) ? 'viendo' : 'guardada' })` |
| `finished(c)` (`Desktop:471 / Móvil:404`) | `this.writeEntry(c.id, { estado: 'vista', episodio: c.eps })` |

`computeRecs()` (`Desktop:381 / Móvil:313`) reads all three maps to build its genre-affinity weights — update it to read `biblioteca` (`vista` → weight 2, `guardada` → 1, `evitadas` → −2) and to exclude `evitadas` and `_descartadas`. It stays; it becomes the body of the `recommend` path inside `search_series` (§5).

---

## 3. Runtime helpers

```js
// Result envelopes. Every tool returns one of these; the loop never sees a throw.
const ok   = data  => ({ ok: true,  data });
const fail = error => ({ ok: false, error });

// Params arrive as strings (XML text nodes). Coerce against the schema.
function normalizeArgs(params, schema) {
  const out = {};
  const props = (schema.parameters && schema.parameters.properties) || {};
  for (const [k, v] of Object.entries(params)) {
    const type = (props[k] || {}).type;
    if (v == null || v === '') continue;
    if (type === 'integer')      out[k] = parseInt(v, 10);
    else if (type === 'number')  out[k] = parseFloat(v);
    else if (type === 'boolean') out[k] = /^(true|1|sí|si|yes)$/i.test(String(v).trim());
    else if (type === 'array')   out[k] = String(v).split(',').map(s => s.trim()).filter(Boolean);
    else                         out[k] = String(v).trim();
    if (typeof out[k] === 'number' && Number.isNaN(out[k])) delete out[k];
  }
  return out;
}

// Stable identity for the duplicate memo (§11): sorted keys, trimmed strings,
// case PRESERVED on values.
function memoKey(name, args) {
  const entries = Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  return name + '|' + JSON.stringify(entries);
}

function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
```

Add one instance field in `componentDidMount`:

```js
this.history = [];               // el transcript
this.idsSeen = new Set();        // ids devueltos por herramientas EN esta conversación
this._descartadas = new Set();   // descartes suaves de tarjeta
this._porques = {};              // { id: 'el porqué que escribió el modelo' }
this._turnRunning = false;
```

---

## 4. The tool registry

One object. Each tool owns its schema, its executor, its progress copy, and two safety flags.

```js
get TOOLS() {
  if (this._tools) return this._tools;
  this._tools = {

    search_series: {
      replayable: true,
      schema: {
        name: 'search_series',
        description:
          'Busca series en el catálogo por título, tema, género o filtros. ' +
          'Usa `query` con un título cuando el usuario nombra algo concreto, y con un tema o vibra ' +
          'cuando pide algo por sensación ("algo tranquilo", "historias de venganza"). ' +
          'CUÁNDO NO USARLA: no la llames una vez por cada título que recuerdas — es el desperdicio más común. ' +
          'No reformules una búsqueda que ya hiciste: reordena el mismo catálogo y devuelve casi lo mismo. ' +
          'Una búsqueda bien hecha ES la respuesta; los resultados vienen ordenados de mejor a peor.',
        parameters: {
          type: 'object',
          properties: {
            query:           { type: 'string',  description: 'Título o tema. Déjalo vacío si sólo vas a filtrar.' },
            genero:          { type: 'string',  description: 'Un género exacto: Acción, Aventura, Fantasía, Drama, Comedia, Deportes, Misterio, Terror, Sobrenatural, Historia' },
            max_eps:         { type: 'integer', description: 'Máximo de episodios. Para "algo corto" usa 13.' },
            solo_terminadas: { type: 'boolean', description: 'true si el usuario pide algo que ya terminó de emitirse.' },
            excluir_vistas:  { type: 'boolean', description: 'true en TODA recomendación: quita lo que ya vio, guardó o descartó. false sólo cuando busca un título específico.' }
          }
        }
      },
      summary: a => a.query ? `Buscando "${String(a.query).slice(0, 34)}"` : 'Filtrando el archivo',
      run: (a, ctx) => ctx.toolSearchSeries(a)
    },

    get_series: {
      replayable: true,
      schema: {
        name: 'get_series',
        description:
          'Ficha completa de UNA serie: sinopsis, episodios, estado de emisión, dónde verla y relacionadas. ' +
          'Úsala cuando el usuario pregunta por una serie específica. ' +
          'CUÁNDO NO USARLA: nunca una llamada por cada título que vas a recomendar. Los resultados de ' +
          'search_series ya traen todo lo necesario para escribir una línea de gancho.',
        parameters: { type: 'object', properties: { serie_id: { type: 'string', description: 'id tal como llegó en un resultado, p. ej. "frieren"' } }, required: ['serie_id'] }
      },
      summary: () => 'Abriendo la ficha',
      run: (a, ctx) => ctx.toolGetSeries(a)
    },

    get_library: {
      replayable: true,
      schema: {
        name: 'get_library',
        description:
          'La biblioteca del usuario: qué vio, qué guardó, qué está viendo y en qué episodio va. ' +
          'Úsala para "¿qué me falta?", "¿en cuál iba?", "qué tengo guardado", "qué estoy viendo". ' +
          'Es una lectura barata: va en el MISMO bloque <function_calls> que tu primera búsqueda.',
        parameters: { type: 'object', properties: { estado: { type: 'string', enum: ['guardada', 'viendo', 'vista', 'abandonada'] } } }
      },
      summary: a => a.estado ? `Revisando tus ${a.estado}s` : 'Revisando tu biblioteca',
      run: (a, ctx) => ctx.toolGetLibrary(a)
    },

    get_taste: {
      replayable: true,
      schema: {
        name: 'get_taste',
        description:
          'Perfil de gusto: géneros que domina, qué marcó en el arranque, qué reacciones dio, qué ha evitado. ' +
          'Es una lectura barata y GRATIS: en cualquier turno de recomendación va en el MISMO bloque ' +
          '<function_calls> que tu primera búsqueda. No cuenta como búsqueda. ' +
          'Es de donde salen tus "porqués" — sin esto tus recomendaciones son genéricas.',
        parameters: { type: 'object', properties: {} }
      },
      summary: () => 'Leyendo tu gusto',
      run: (a, ctx) => ctx.toolGetTaste(a)
    },

    update_library: {
      replayable: false,
      schema: {
        name: 'update_library',
        description:
          'ESCRITURA. Agrega o actualiza una serie en la biblioteca del usuario. ' +
          'Llámala en el MISMO turno en que el usuario lo pide: "ya la acabé", "guárdamela", "voy en el 3", "la dejé", "me encantó". ' +
          'No preguntes "¿quieres que la agregue?" — pedirlo ya lo autorizó. ' +
          'SIEMPRE manda `estado` explícito: sin él, una entrada nueva cae como "guardada", que está mal para "ya la vi". ' +
          '`episodio` es el número ABSOLUTO en el que va, nunca un incremento. ' +
          'UNA llamada por serie: si el usuario nombra tres, son tres <invoke> dentro de un solo bloque.',
        parameters: {
          type: 'object',
          properties: {
            serie_id: { type: 'string' },
            estado:   { type: 'string', enum: ['guardada', 'viendo', 'vista', 'abandonada'] },
            episodio: { type: 'integer', description: 'Episodio absoluto en el que va.' },
            reaccion: { type: 'string', enum: ['no_fue_lo_mio', 'estuvo_bien', 'me_encanto'], description: 'Los 3 estados del producto. NUNCA estrellas ni números.' }
          },
          required: ['serie_id', 'estado']
        }
      },
      summary: a => ({ vista: 'Marcando como vista', viendo: 'Marcando como viendo', guardada: 'Guardando', abandonada: 'Marcando como abandonada' }[a.estado] || 'Actualizando tu biblioteca'),
      run: (a, ctx) => ctx.toolUpdateLibrary(a)
    },

    avoid_series: {
      replayable: false,
      schema: {
        name: 'avoid_series',
        description:
          'ESCRITURA. "Esa ya no me la recomiendes", "no me interesa ese estilo". ' +
          'La saca de TODA recomendación futura, de forma permanente. ' +
          'NO la uses para un simple descarte de tarjeta ("No, otra cosa") — eso es temporal y lo maneja la interfaz.',
        parameters: { type: 'object', properties: { serie_id: { type: 'string' } }, required: ['serie_id'] }
      },
      summary: () => 'Anotando que no va contigo',
      run: (a, ctx) => ctx.toolAvoidSeries(a)
    }
  };
  return this._tools;
}

toolDescriptions() {
  return Object.values(this.TOOLS).map(t => `<tool>${JSON.stringify(t.schema)}</tool>`).join('\n');
}
```

### Why the schemas read like that

- **Every description carries a "cuándo NO usarla".** *(prod: most runaway tool behaviour was fixed in schema prose, not in loop code.)* The two that matter here: don't search once per remembered title, and don't open a ficha per recommendation.
- **State the default that bites.** `update_library` spells out what an omitted `estado` costs, because models omit it and silently mis-file completed shows as saved.
- **Name the units.** `episodio` is absolute, said in the schema and again in the prompt.
- **Enums wherever the value set is closed.** Removes a whole class of retry.
- **Mark the free reads.** `get_taste` and `get_library` say explicitly that they batch with the first search and don't count as searches — otherwise "search discipline" makes the model skip the personalization read, and every recommendation comes out generic.

`replayable: false` on the two writes is deliberate: a second write to the same series legitimately differs (added vs updated), so it must never be absorbed by the duplicate memo (§11).

---

## 5. Tool executors

These run over the existing `CAT` array (`Desktop:297 / Móvil:229`) and the new `biblioteca`. They are the *only* place the catalog is read. That boundary is the point: when the 13 hardcoded entries are replaced by a real catalog, only these six functions change and the agent doesn't notice.

```js
// ── Shared shaping ──────────────────────────────────────────────
// Every result carries the library state of each title, so the model can
// see what it must not re-recommend without a second call.
serieToResult(c) {
  const e = this.entryOf(c.id);
  return {
    id: c.id,
    titulo: c.t,
    romaji: c.tr,
    año: c.y,
    episodios: c.eps,
    estado_emision: c.fin ? 'terminada' : 'en emisión',
    generos: c.gen,
    donde_verla: c.donde,
    sinopsis: c.syn,
    en_biblioteca: e ? { estado: e.estado, episodio: e.episodio, reaccion: e.reaccion } : false
  };
}

// Registering ids is what enforces ground rule 4 (§1). Call it on EVERY
// result that leaves a tool.
registerIds(results) {
  results.forEach(r => this.idsSeen.add(r.id));
  return results;
}

// One line of in-context reinforcement, appended to discovery-shaped results.
// It lands right before the model writes the answer, where a distant prompt
// rule is weakest. (prod: same trick, same reason.)
GUIA_RECOMENDACION = 'Al presentar estos títulos como recomendación, marca cada uno con type="recomendacion" y escribe su porqué.';

// ── search_series ───────────────────────────────────────────────
toolSearchSeries(a) {
  const q = a.query ? norm(a.query) : '';
  const toks = q ? q.split(/\s+/).filter(Boolean) : [];
  const descubrimiento = a.excluir_vistas !== false && !!(a.genero || a.max_eps || !q || toks.length > 3);

  let pool = this.CAT.slice();

  if (toks.length) {
    // Título primero, luego sinopsis: un match de título siempre gana.
    const porTitulo = pool.filter(c => toks.every(t => norm(c.t + ' ' + c.tr).includes(t)));
    const porTema   = pool.filter(c => !porTitulo.includes(c) && toks.some(t => norm(c.syn + ' ' + c.gen.join(' ')).includes(t)));
    pool = [...porTitulo, ...porTema];
  }

  if (a.genero)          pool = pool.filter(c => c.gen.some(g => norm(g) === norm(a.genero)));
  if (a.max_eps)         pool = pool.filter(c => c.eps <= a.max_eps);
  if (a.solo_terminadas) pool = pool.filter(c => c.fin);

  if (a.excluir_vistas) {
    pool = pool.filter(c => !this.enBiblioteca(c.id) && !this._descartadas.has(c.id));
  }
  // Las evitadas se ocultan SIEMPRE en descubrimiento, y nunca en una
  // búsqueda explícita por título: ocultarle al usuario algo que nombró
  // sería mentirle; ocultarlo de una recomendación es la promesa del producto.
  if (descubrimiento) pool = pool.filter(c => !this.esEvitada(c.id));

  // Orden: afinidad de gustos, como computeRecs.
  const pesos = this.generoPesos();
  const ranked = pool
    .map(c => ({ c, aff: c.gen.reduce((s, g) => s + (pesos[g] || 0), 0) + (c.niche ? (this.esVeterano() ? 3 : -1) : 0) }))
    .sort((x, y) => y.aff - x.aff)
    .slice(0, 8)
    .map(x => this.serieToResult(x.c));

  this.registerIds(ranked);

  const payload = { resultados: ranked, total: ranked.length };
  if (!ranked.length) payload.nota = 'Sin coincidencias. NO inventes títulos: dilo con honestidad y pide otra pista.';
  if (descubrimiento && ranked.length) payload.guia = this.GUIA_RECOMENDACION;
  return ok(payload);
}

generoPesos() {
  const g = {};
  Object.entries(this.state.biblioteca).forEach(([id, e]) => {
    const c = this.CAT.find(x => x.id === id);
    if (!c) return;
    let w = e.estado === 'vista' ? 2 : e.estado === 'viendo' ? 2 : e.estado === 'guardada' ? 1 : e.estado === 'abandonada' ? -1 : 0;
    if (e.reaccion === 'me_encanto') w += 2;
    if (e.reaccion === 'no_fue_lo_mio') w -= 2;
    c.gen.forEach(x => { g[x] = (g[x] || 0) + w; });
  });
  Object.keys(this.state.evitadas).forEach(id => {
    const c = this.CAT.find(x => x.id === id);
    if (c) c.gen.forEach(x => { g[x] = (g[x] || 0) - 2; });
  });
  return g;
}

esVeterano() { return this.CAT.some(c => c.niche && this.esVista(c.id)); }

// ── get_series ──────────────────────────────────────────────────
toolGetSeries(a) {
  const c = this.CAT.find(x => x.id === a.serie_id);
  if (!c) return fail(`No encontré la serie '${a.serie_id}'. Usa un id que haya salido en un resultado de búsqueda.`);
  const rel = this.CAT.filter(x => x.id !== c.id && x.gen.some(g => c.gen.includes(g))).slice(0, 3).map(x => this.serieToResult(x));
  this.registerIds([this.serieToResult(c), ...rel]);
  return ok({ serie: this.serieToResult(c), relacionadas: rel });
}

// ── get_library ─────────────────────────────────────────────────
toolGetLibrary(a) {
  const entries = Object.entries(this.state.biblioteca)
    .filter(([, e]) => !a.estado || e.estado === a.estado)
    .map(([id, e]) => {
      const c = this.CAT.find(x => x.id === id);
      if (!c) return null;
      return {
        id, titulo: c.t, episodios_totales: c.eps, estado: e.estado,
        episodio_actual: e.episodio, reaccion: e.reaccion,
        le_faltan: e.estado === 'viendo' ? Math.max(c.eps - e.episodio, 0) : null
      };
    })
    .filter(Boolean)
    .sort((x, y) => (this.state.biblioteca[y.id].actualizado || 0) - (this.state.biblioteca[x.id].actualizado || 0));

  this.registerIds(entries);
  const total = Object.keys(this.state.biblioteca).length;
  return ok({
    entradas: entries,
    total_biblioteca: total,
    nota: total === 0 ? 'Su biblioteca está vacía. No la trates como su historial: asume que sí ve anime y pregúntale.' : undefined
  });
}

// ── get_taste ───────────────────────────────────────────────────
toolGetTaste() {
  const pesos = this.generoPesos();
  const top = Object.entries(pesos).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g);
  const bajos = Object.entries(pesos).filter(([, w]) => w < 0).map(([g]) => g);
  const b = this.state.biblioteca;
  const nombres = ids => ids.map(id => (this.CAT.find(c => c.id === id) || {}).t).filter(Boolean);

  return ok({
    total_biblioteca: Object.keys(b).length,
    generos_fuertes: top,
    generos_flojos: bajos,
    le_encantaron: nombres(Object.keys(b).filter(id => b[id].reaccion === 'me_encanto')),
    no_le_gustaron: nombres(Object.keys(b).filter(id => b[id].reaccion === 'no_fue_lo_mio')),
    viendo_ahora: Object.keys(b).filter(id => b[id].estado === 'viendo').map(id => ({ titulo: (this.CAT.find(c => c.id === id) || {}).t, episodio: b[id].episodio })),
    evitadas: nombres(Object.keys(this.state.evitadas)),
    gusto_de_nicho: this.esVeterano(),
    nota: Object.keys(b).length < 3
      ? 'Biblioteca muy chica: no hay perfil todavía. Recomienda por la vibra que te dio y pide 2-3 títulos que ya haya amado.'
      : undefined
  });
}

// ── update_library (ESCRITURA) ──────────────────────────────────
toolUpdateLibrary(a) {
  const c = this.CAT.find(x => x.id === a.serie_id);
  if (!c) return fail(`No encontré la serie '${a.serie_id}'. Usa un id que haya salido en un resultado de búsqueda.`);

  const antes = this.entryOf(c.id);
  const ahora = {
    estado:   a.estado,
    // Valores ABSOLUTOS: reaplicar esto converge al mismo estado (§1 regla 5).
    episodio: a.episodio != null ? a.episodio : (a.estado === 'vista' ? c.eps : (antes?.episodio ?? 0)),
    reaccion: a.reaccion != null ? a.reaccion : (antes?.reaccion ?? null)
  };
  if (ahora.episodio > c.eps) ahora.episodio = c.eps;

  this.writeEntry(c.id, ahora);
  this._descartadas.delete(c.id);
  if (a.estado === 'vista') { this._lastAcabo = c.id; }

  // `antes` es lo que hace deshacible el recibo (§12).
  return ok({ accion: antes ? 'actualizada' : 'agregada', id: c.id, titulo: c.t, antes, ahora });
}

// ── avoid_series (ESCRITURA) ────────────────────────────────────
toolAvoidSeries(a) {
  const c = this.CAT.find(x => x.id === a.serie_id);
  if (!c) return fail(`No encontré la serie '${a.serie_id}'.`);
  this.setEvitada(c.id, true);
  return ok({ id: c.id, titulo: c.t, nota: 'No volverá a aparecer en recomendaciones.' });
}
```

**On the catalog.** 13 hardcoded entries make these executors trivial, and that's fine for a demo — but it's also the demo's ceiling, since the model can only ever talk about 13 shows. When a real catalog arrives, only `serieToResult` and the four read tools change. The agent, the prompt, the parsers and the loop stay exactly as written.

**Keep the honesty rule.** `README.md`: *"la IA solo redacta, nunca promete cantidades"*. The numbers (`episodios`, `estado_emision`, `donde_verla`) come from the catalog through the tool result. The model writes prose around them. `search_series` returning `nota: 'Sin coincidencias. NO inventes títulos'` is that rule enforced at the data layer instead of hoped for in the prompt.

---

## 6. The system prompt

Replace the prompt at `Desktop:505 / Móvil:438` entirely. Note what disappears: the `catalogo` variable built at `Desktop:503 / Móvil:436` that dumps all 13 series into the prompt, and the `Ya vio [...] guardadas [...] rechazadas [...]` line. **The tools are how the model sees the catalog and the library now.** Dumping them into the prompt as well means two sources of truth that drift.

**Layout rule:** everything that changes per conversation goes at the very END, after all static text. Providers cache on the longest shared token prefix, so a date or a user-state line near the top throws the cache away every turn. *(prod: moving per-conversation values to the tail was worth a large share of the cache hits.)*

```js
systemPrompt() {
  return `Eres Sen Pai, el guía de BSP (Binge Senpai): una app en español para descubrir y llevar la cuenta de tu anime. Otaku intenso y teatral —nakama, kokoro, ¡NANI!, referencias shonen— pero SIEMPRE útil y breve: máximo 50 palabras por respuesta, salvo que el usuario pida algo largo. Sin emoji en la interfaz; el tono vive en las palabras. Responde siempre en el idioma del usuario.

# FORMATO DE HERRAMIENTAS (CRÍTICO)

Aquí NO existe ningún canal nativo de function-calling. Una herramienta se ejecuta ÚNICAMENTE si el texto visible de tu mensaje contiene este XML literal:

<function_calls>
<invoke name="search_series">
<parameter name="query">algo tranquilo</parameter>
</invoke>
</function_calls>

NUNCA uses <tool_call>, <arg_key>, <arg_value>, <tool>, <parameters>, ningún formato con tokens <|…|>, ni un canal interno o JSON de llamadas. Esos NUNCA se ejecutan y se le imprimen al usuario como texto crudo.

Nunca anuncies una búsqueda sin imprimir el XML en ese MISMO mensaje: un turno que dice "déjame buscar" y no trae <function_calls> no hace absolutamente nada.

Dentro de los valores escapa & < > como &amp; &lt; &gt;. Un ángulo por etiqueta, todas cerradas.

# Tus herramientas

<tools>
${this.toolDescriptions()}
</tools>

Éstas son tus ÚNICAS herramientas. Nunca llames un nombre que no esté en esa lista.

## Cómo llamarlas

Llamadas INDEPENDIENTES van juntas en UN solo bloque:

<function_calls>
<invoke name="get_taste">
</invoke>
<invoke name="search_series">
<parameter name="query">venganza</parameter>
<parameter name="excluir_vistas">true</parameter>
</invoke>
</function_calls>

Llamadas DEPENDIENTES (necesitas el resultado de una para armar la otra) van en mensajes seguidos: emites el bloque, recibes <function_results>, emites el siguiente bloque.

Después de recibir <function_results>, tu siguiente mensaje completo debe ser O un nuevo <function_calls> O tu respuesta final al usuario. Nunca comentes, resumas ni repitas los resultados en medio.

## Disciplina de búsqueda

- UNA búsqueda por intención. Los resultados vienen ordenados de mejor a peor: la primera página ES la respuesta.
- Nunca reformules una búsqueda que ya hiciste: reordena el mismo catálogo y devuelve casi lo mismo.
- Nunca busques una serie sólo para conseguir su id o "verificarla".
- get_taste y get_library son lecturas gratis: van en el mismo bloque que tu primera búsqueda y no cuentan como búsquedas.
- Si los resultados salen flojos, responde con tus mejores 3 y dilo con honestidad. Más búsquedas no mejoran el orden.

# Ley de ids (CRÍTICO)

Sólo puedes mostrar como tarjeta una serie cuyo id haya llegado en un resultado de herramienta EN ESTA conversación. Nunca inventes, adivines ni recuerdes ids. Si recuerdas un título que no salió en resultados, menciónalo en el texto sin id — no aparecerá como tarjeta, y está bien.

# Cómo se ven tus respuestas

Cuando menciones una serie, envuélvela en <serie> con etiqueta de cierre:

- Con id (sólo si salió en un resultado de ESTA conversación):
  <serie id="frieren">Frieren</serie>
- Las que RECOMIENDAS activamente llevan type="recomendacion" y su porqué:
  <serie id="oddtaxi" type="recomendacion" porque="Porque viste Ping Pong · 13 eps y ya terminó">Odd Taxi</serie>
- Sin id, para algo que recuerdas pero no salió en resultados:
  <serie>Nombre</serie>

Reglas del porqué: máximo 90 caracteres, SIEMPRE atado a datos reales del usuario ("Porque viste X", "Como te encantó Y"). Si no hay conexión real, omítelo. Prohibido "es muy popular".

<serie> es la ÚNICA etiqueta que puedes inventar en tu respuesta. Cualquier otra se le borra al usuario.

# Reglas del producto

- Los datos verificables (episodios, terminada o en emisión, dónde verla) SIEMPRE salen de los resultados de herramientas. Nunca prometas cantidades ni inventes cifras.
- La calificación es de 3 estados: no_fue_lo_mio / estuvo_bien / me_encanto. NUNCA estrellas ni escalas numéricas.
- Cuando el usuario diga que ya vio, acabó, dejó o va en el episodio N de algo, llama update_library en ESE turno. Pedirlo ya lo autorizó: no preguntes "¿quieres que la agregue?".
- Si el usuario nombra varias series en un mensaje, son varias llamadas en un solo bloque. Cuéntalas antes de responder: si nombró tres y llamaste dos, te faltó una.
- Si el título que resolviste no es obviamente el que dijo el usuario, dilo en una cláusula: "Lo mandé a Odd Taxi — dime si era otra."
- Nunca cierres ofreciendo guardar o agregar algo: cada tarjeta ya trae su botón "Quiero verlo". Cierra con sustancia (con cuál empezar y por qué) o cierra limpio.
- No inventes interfaz, no culpes a la base de datos, no digas que hubo un problema de sincronización. Una frase honesta más una salida real siempre gana.
- Recomendaciones: 3 a 5 títulos con una línea de gancho cada uno. Si el usuario pide "algo para hoy", UNA recomendación y a lo mucho una alternativa — un menú de cuatro opciones es devolverle la decisión sin tomar.

# Ejemplo de un turno completo

Usuario: "recomiéndame algo de venganza"

Tu primer mensaje:

¡A cazar historias de venganza, nakama!

<function_calls>
<invoke name="get_taste">
</invoke>
<invoke name="search_series">
<parameter name="query">venganza</parameter>
<parameter name="excluir_vistas">true</parameter>
</invoke>
</function_calls>

(Llegan los resultados. NO los comentes. Toma los primeros que pasen tus exclusiones y escribe la respuesta de una vez, citando los ids que vinieron en los resultados.)

Tu segundo mensaje:

Tres que te van a doler bonito:

1. <serie id="vinland" type="recomendacion" porque="Porque te encantó Vinland Saga · 48 eps, terminada">Vinland Saga</serie> — venganza que se le voltea al protagonista.
2. <serie id="aot" type="recomendacion" porque="Como Attack on Titan: drama duro en 94 eps">Ataque a los Titanes</serie> — empieza como supervivencia y termina en otra cosa.

Arranca con Vinland Saga: pega justo en la comezón que describiste.

# Recordatorio de formato (léelo antes de cada llamada)

Sólo se ejecuta este XML, impreso como texto normal de tu mensaje:

<function_calls>
<invoke name="search_series">
<parameter name="query">Frieren</parameter>
</invoke>
</function_calls>

MAL: <tool_call>search_series<arg_key>query</arg_key></tool_call>
MAL: <tool>search_series</tool> / <parameters>…</parameters>
MAL: cualquier formato <|…|>, o mandar la llamada por un canal interno en vez del texto del mensaje.

# Contexto de esta conversación

<contexto>
Fecha: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
Biblioteca: ${Object.keys(this.state.biblioteca).length} series
${this.arranco ? 'El usuario ya hizo el arranque de gusto.' : 'El usuario todavía no marca nada: trátalo como nuevo, recomienda por vibra y no le pidas un cuestionario.'}
</contexto>

Este bloque es una foto del inicio del turno. Si un resultado de herramienta lo contradice, gana el resultado.`;
}
```

Three parts of that prompt earn their length:

- **The format block appears twice** (top and bottom). *(prod: models drift back into native dialects mid-conversation; the closing repetition is what catches it.)*
- **The worked example** moves behaviour more than any rule in the prompt. Keep it, keep it concrete, and keep it showing the batched read + search.
- **"No cierres ofreciendo guardar"** exists because every card already has a *Quiero verlo* button. *(prod maintains a list of banned paraphrases for exactly this; models regenerate the offer endlessly.)*

---

## 7. Calling the model

### 7.1 The call

```js
MAX_TOKENS = 1400;   // suficiente para 5 tarjetas con gancho + un bloque de llamadas

async callModel(turn, opts = {}) {
  turn.calls++;
  const started = Date.now();

  const raw = await window.claude.complete({
    system: this.systemPrompt(),
    messages: this.buildMessages(),
    max_tokens: opts.maxTokens || this.MAX_TOKENS
  });

  const text = closeToolCallTag(stripThinkTail(String(raw || '')));

  // No hay finish_reason en esta API. Heurística de truncado: la respuesta
  // se acercó al tope Y terminó sin cierre de oración ni de etiqueta.
  const near = String(raw || '').length > (opts.maxTokens || this.MAX_TOKENS) * 3.2;
  const truncated = near && !/[.!?…»"']\s*$/.test(text) && !/<\/function_calls>\s*$/.test(text);

  console.debug('[llm]', { ms: Date.now() - started, chars: text.length, truncated });
  return { text, truncated };
}
```

The truncation heuristic is deliberately conservative: a false positive costs one extra call, a false negative delivers a tool call cut mid-parameter. Chars-per-token ≈ 3.2 for Spanish; adjust if you see it firing on healthy replies.

### 7.2 When there is no model

`window.claude` can be missing (file opened outside the host, or the host's AI is off). Detect it once and degrade honestly — the README already promises a graceful fallback:

```js
hasModel() { return !!(window.claude && typeof window.claude.complete === 'function'); }
```

In `send()`, if `!this.hasModel()`, skip the loop and run `fallbackRoute(t, bubble)` (the existing regex router at `Desktop:479 / Móvil:412`) — but change its final line. Today it says *"No me quedó claro, nakama"*, which blames the user for the host being offline. It should say: *"Ando sin conexión al cerebro, nakama — te muevo la vitrina con lo básico."*

The regex router keeps earning its place as the offline degrade. What it stops being is the error path for a live model.

### 7.3 If multi-message history isn't honored

If the probe in §0.3 fails and the host only reads the last message, flatten instead of giving up on context:

```js
buildMessages() {
  if (this._historyHonored) return this.windowedHistory();
  const flat = this.windowedHistory()
    .map(m => (m.role === 'user' ? 'USUARIO: ' : 'SEN PAI: ') + m.content)
    .join('\n\n');
  return [{ role: 'user', content: flat + '\n\nSEN PAI:' }];
}
```

Same information, one message. Everything downstream is unchanged.

---

## 8. The transcript

The single biggest bug in the demo is `messages: [{ role: 'user', content: t }]` (`Desktop:506 / Móvil:439`). The model sees one message. *"Algo corto"* → *"más corto todavía"* has no referent for "más".

```js
MAX_TURNS_SENT = 12;

windowedHistory() {
  const msgs = this.history.slice(-this.MAX_TURNS_SENT * 3);
  // Nunca abrir la ventana en un resultado huérfano: el modelo leería
  // resultados sin la llamada que los produjo. Retrocede al primer mensaje
  // real de usuario.
  const i = msgs.findIndex(m => m.role === 'user' && !m.toolResult && !m.scaffold);
  return i > 0 ? msgs.slice(i) : msgs;
}

buildMessages() { return this.windowedHistory().map(({ role, content }) => ({ role, content })); }
```

Rules:

- **Push everything**: the user message, every assistant message *including its tool-call XML*, every tool-result message, every validation-feedback message.
- **Tool results ride `role: 'user'`** with a `<function_results>` wrapper and `toolResult: true`. There is no tool role in this API, and inventing one confuses your own window logic more than it confuses the model.
- **Scaffold messages are current-turn only.** Validation feedback and the wrap-up instruction get `scaffold: true` so the current turn's next call sees them — then drop them when the turn ends:

  ```js
  // en el finally de send()
  this.history = this.history.filter(m => !m.scaffold);
  ```

  *(prod: baked-in hints from finished turns get re-read by the model on every later turn — thousands of stale rows accumulated before this rule existed.)*

- **Format results byte-exactly like this.** The wrapper is what the model is taught to read:

```js
function formatToolResults(results) {
  return results.map(({ result }) =>
    result.ok
      ? `<function_results>\n<output>\n${JSON.stringify(result.data)}\n</output>\n</function_results>`
      : `<function_results>\n<error>\n${result.error}\n</error>\n</function_results>`
  ).join('\n\n');
}
```

---

## 9. Parsing — five passes

`JSON.parse(raw.match(/\{[\s\S]*\}/)[0])` (`Desktop:509 / Móvil:442`) throws on: no JSON at all, a `{` anywhere in the model's prose, a truncated object, a code fence. Every throw currently becomes *"No me quedó claro, nakama."*

```js
// ── 1. Extraer llamadas ─────────────────────────────────────────
// Escanea TODOS los <function_calls>, no sólo el primero: prosa que
// menciona la etiqueta produce un bloque impaseable, y hay que seguir al
// siguiente candidato en vez de rendirse.
function parseToolCalls(text) {
  if (!text || text.indexOf('<function_calls>') === -1) return [];
  const out = [];
  const re = /<function_calls>[\s\S]*?<\/function_calls>/g;
  let m;
  while ((m = re.exec(text))) out.push(...parseInvokes(m[0]));
  return out;
}

function parseInvokes(block) {
  // Repara ampersands sueltos ANTES de parsear. Es demostrablemente seguro:
  // el modelo escriba & o &amp;, la herramienta recibe & de todos modos.
  // < y > NO se reparan: escaparlos podría corromper el límite de una
  // etiqueta, así que esos se van por el camino de rechazo + feedback.
  const xml = block.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, '&amp;');
  let doc;
  try { doc = new DOMParser().parseFromString(xml, 'text/xml'); } catch (e) { return []; }
  if (doc.querySelector('parsererror')) return [];
  return Array.from(doc.querySelectorAll('invoke')).map(inv => ({
    name: inv.getAttribute('name'),
    params: Object.fromEntries(
      Array.from(inv.querySelectorAll('parameter')).map(p => [p.getAttribute('name'), p.textContent])
    )
  })).filter(c => c.name);
}

// ── 2. Sellar un bloque truncado ────────────────────────────────
// Llegar al tope de tokens a media llamada deja la etiqueta abierta.
// Ciérrala para que parsee — pero ver §10: una LLAMADA truncada se rechaza
// igual, porque el corte cae en bytes arbitrarios y un parámetro cortado a
// la mitad se ejecutaría corrupto.
function closeToolCallTag(text) {
  if (text.indexOf('<function_calls>') === -1 || text.indexOf('</function_calls>') !== -1) return text;
  return text.endsWith('</function_calls') ? text + '>' : text + '</function_calls>';
}

// ── 3. Quitar la cola de razonamiento filtrada ──────────────────
// Los modelos filtran su pensamiento al canal de contenido, terminado en
// </think>. Corta hasta el ÚLTIMO. El < inicial es opcional: algunos
// proveedores se lo comen al separar canales.
function stripThinkTail(text) {
  const m = text.match(/[\s\S]*<?\/think>/);
  let out = m ? text.slice(m[0].length) : text;
  return out.replace(/^\s*(?:<\/?think>|\/think>|think>|nk>|k>)\s*/, '').replace(/^\s+/, '');
}

// ── 4. Quitar el XML de lo que ve el usuario ────────────────────
function stripToolCalls(text) {
  return text.replace(/<function_calls>[\s\S]*?(?:<\/function_calls>|$)/g, '').trim();
}

// ── 5. Extracción de JSON balanceada ────────────────────────────
// Sólo si conservas algún contrato JSON en otra parte. Escanea de derecha
// a izquierda (el payload es lo último que emite el modelo) y devuelve el
// último objeto balanceado que parsee, respetando strings y escapes.
function extractJsonObject(text) {
  const clean = String(text).replace(/```(?:json)?/gi, '');
  for (let end = clean.length; end > 0;) {
    const start = clean.lastIndexOf('{', end - 1);
    if (start < 0) break;
    const slice = balancedSlice(clean, start);
    if (slice) { try { return JSON.parse(slice); } catch (e) {} }
    if (start === 0) break;
    end = start;
  }
  return null;
}

function balancedSlice(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}
```

Apply in this order on every raw response: `closeToolCallTag(stripThinkTail(raw))` — already wired into `callModel` (§7.1).

---

## 10. Validation, corrective feedback, retry

Never accept a response you can't execute, and never retry blind. *(prod: blind retry recovered ~40% of malformed calls; quoting the exact defect back recovered ~100%, and turned a full re-derivation into a focused fix.)*

### 10.1 Validate

```js
validate(text) {
  const errors = [];
  const outside = stripToolCalls(text).replace(/```[\s\S]*?```/g, '');

  // Dialectos equivocados. El parser los ignora, así que sin rechazarlos se
  // vuelven la "respuesta final" del turno y se imprimen como texto crudo.
  if (/<invoke/.test(outside))
    errors.push('Hay etiquetas <invoke> fuera de un bloque <function_calls>.');
  if (/<tool_call\b|<arg_key>|<arg_value>|<\/?tool>|<parameters>/i.test(outside))
    errors.push('Usaste el dialecto <tool_call>/<arg_key>/<tool> en vez de <function_calls>.');
  if (/<\|tool_calls?_/.test(outside))
    errors.push('Usaste un formato nativo con tokens <|tool_call_begin|> en vez de <function_calls>.');
  if (/\bethan_tool_call_|<xai:function_call|<minimax:tool_call/i.test(outside))
    errors.push('Enrutaste la llamada por un canal nativo. Aquí NO existe: imprime el XML como texto visible del mensaje.');

  // Resultados fabricados: el modelo escribiendo su propio <function_results>.
  // Sin esta comprobación se entrega como respuesta real.
  if (/<\/?function_results\b/i.test(outside))
    errors.push('Escribiste tú un bloque <function_results>. Los resultados los produce el sistema después de que tu <function_calls> se ejecuta — nunca los inventes.');

  // Herramienta inexistente / parámetros faltantes.
  const calls = parseToolCalls(text);
  for (const call of calls) {
    const tool = this.TOOLS[call.name];
    if (!tool) { errors.push(`Herramienta inexistente: ${call.name}`); continue; }
    for (const req of (tool.schema.parameters.required || []))
      if (!call.params[req]) errors.push(`Falta el parámetro obligatorio "${req}" en ${call.name}.`);
  }

  // Bloque abierto que el sellado no logró rescatar a un parse válido.
  if (text.indexOf('<function_calls>') !== -1 && !calls.length)
    errors.push('El bloque <function_calls> no es XML válido.');

  // Etiquetas inventadas en la prosa. Sólo <serie> es válida.
  const unknown = new Set();
  for (const m of outside.matchAll(/<([a-z_][a-z0-9_]*)\b[^>]*>/gi))
    if (!['serie', 'br', 'b', 'i', 'em', 'strong'].includes(m[1].toLowerCase())) unknown.add(m[1]);
  if (unknown.size) errors.push(`Etiquetas inventadas: ${[...unknown].join(', ')}. La única permitida es <serie>.`);

  // Sólo el fallo de etiquetas es "tolerable": el render las borra sin daño.
  // Un fallo de llamada nunca lo es.
  const onlyTags = errors.length > 0 && errors.every(e => e.startsWith('Etiquetas inventadas'));
  return { errors, tolerable: onlyTags };
}
```

### 10.2 Build actionable feedback

Do not send "your response was rejected". Send: what you emitted, what's wrong with it, and the correct shape.

```js
buildFeedback(raw, errors) {
  const m = raw.match(/<+function_calls>[\s\S]*?(?:<\/function_calls>|$)/) ||
            raw.match(/<+(?:invoke|tool_call|tool|parameters)\b[\s\S]*/) ||
            raw.match(/<\|tool_calls?_[\s\S]*/);
  if (!m) return `Tu respuesta anterior fue rechazada por esto:\n${errors.map(e => '- ' + e).join('\n')}\n\nCorrígelo y responde de nuevo.`;

  const block = m[0].trim().slice(0, 1500);
  const hints = [];

  if (/<\|tool_calls?_/.test(block))
    hints.push('usaste el formato nativo con tokens `<|tool_call_begin|>…`; aquí NO se aceptan tokens `<|…|>` — emite XML plano');
  else if (/\bethan_tool_call_|<xai:function_call|<minimax:tool_call/i.test(block))
    hints.push('enrutaste la llamada por un canal nativo de herramientas; aquí NO existe ese canal — imprime la llamada como texto visible del mensaje');
  else if (/<tool_call\b|<\/?tool>|<parameters>/i.test(block) && block.indexOf('<function_calls') === -1)
    hints.push('usaste `<tool_call>`/`<tool>`/`<parameters>`; este sistema exige `<function_calls>` envolviendo `<invoke name="…">` con `<parameter name="…">valor</parameter>`');

  if (/<<(?:invoke|function_calls|parameter)/.test(block))
    hints.push('duplicaste el ángulo de apertura (`<<invoke`); cada etiqueta abre con un solo `<`');

  const inv = [(block.match(/<invoke/g) || []).length, (block.match(/<\/invoke>/g) || []).length];
  const par = [(block.match(/<parameter/g) || []).length, (block.match(/<\/parameter>/g) || []).length];
  if (inv[0] > inv[1] || par[0] > par[1]) hints.push('dejaste una etiqueta sin cerrar: cada `<invoke>` necesita su `</invoke>` y cada `<parameter>` su `</parameter>`');
  else if (inv[1] > inv[0] || par[1] > par[0]) hints.push('hay más etiquetas de cierre que de apertura; emite exactamente una por cada apertura');

  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(block))
    hints.push('un valor trae `&`, `<` o `>` sin escapar; usa `&amp;`, `&lt;`, `&gt;`');

  if ((block.match(/<function_calls/g) || []).length > (block.match(/<\/function_calls>/g) || []).length)
    hints.push('el bloque se cortó antes de terminar; asegúrate de cerrarlo con `</function_calls>`');

  return [
    'Tu llamada a herramienta NO se pudo leer, así que NO se ejecutó. Esto fue exactamente lo que emitiste:',
    '', block, '',
    `Qué salió mal: ${hints.length ? hints.join('; ') : errors.join('; ')}`,
    '', 'Reenvía LA MISMA llamada como XML bien formado, exactamente con esta forma:', '',
    '<function_calls>\n<invoke name="nombre_herramienta">\n<parameter name="nombre_param">valor</parameter>\n</invoke>\n</function_calls>',
    '', 'Emite SÓLO el bloque corregido. No repitas tu análisis ni agregues texto.'
  ].join('\n');
}
```

### 10.3 The retry loop

```js
MAX_VALIDATION_RETRIES = 3;
TAG_TOLERATE_AFTER = 1;      // enseña una vez, luego acepta y limpia al renderizar
MAX_EMPTY_RETRIES = 2;

async callModelValidated(turn) {
  let emptyRetries = 0;

  for (let attempt = 0; attempt <= this.MAX_VALIDATION_RETRIES; attempt++) {
    if (turn.calls >= this.TURN_CALL_BUDGET) return null;

    const res = await this.callModel(turn);

    // Respuesta vacía: el modelo mandó todo a su canal privado.
    if (!res.text.trim()) {
      if (++emptyRetries > this.MAX_EMPTY_RETRIES) return null;
      this.history.push({ role: 'user', scaffold: true, content:
        'Tu respuesta no trajo contenido visible — el usuario nunca ve tu canal de razonamiento. ' +
        'Escribe tu respuesta al usuario (o el bloque <function_calls>) como texto normal del mensaje.' });
      continue;
    }

    // Una LLAMADA truncada se rechaza aunque el sellado la haya hecho
    // parseable: el corte cae en bytes arbitrarios y un parámetro cortado a
    // la mitad se ejecutaría corrupto. La PROSA truncada sí se entrega —
    // regenerarla probablemente la reproduce.
    const truncatedCall = res.truncated && res.text.indexOf('<function_calls>') !== -1;
    const v = truncatedCall
      ? { errors: ['La llamada se cortó por el límite de tokens; su XML no es confiable. Emite menos <invoke> por mensaje y valores más cortos.'], tolerable: false }
      : this.validate(res.text);

    if (!v.errors.length) return res;

    // Enseña, luego tolera: los fallos sólo-de-etiquetas son seguros de
    // aceptar (el render las borra). Otra regeneración completa por un
    // defecto cosmético es mal negocio.
    if (v.tolerable && attempt >= this.TAG_TOLERATE_AFTER) {
      console.warn('[validation] tolerando fallo de etiquetas', v.errors);
      return res;
    }

    console.warn('[validation]', attempt + 1, v.errors);
    // AMBOS empujes son obligatorios. Sin el mensaje inválido el feedback no
    // tiene referente; sin empujar nada, la siguiente llamada manda un prompt
    // byte a byte idéntico y el modelo reproduce el mismo defecto — el bucle
    // de reintento queda inerte.
    this.history.push({ role: 'assistant', content: res.text, invalid: true, scaffold: true });
    this.history.push({ role: 'user', scaffold: true, content: this.buildFeedback(res.text, v.errors) });
  }
  return null;   // el llamador va a wrapUp('validation_failed')
}
```

---

## 11. The turn loop

Replace `send()` (`Desktop:493 / Móvil:426`) with this.

```js
// ── Límites del turno ───────────────────────────────────────────
// Los tres son necesarios y distintos: las iteraciones atajan a un modelo
// que sigue llamando herramientas, el reloj ataja herramientas lentas, y el
// presupuesto de llamadas ataja bucles RÁPIDOS de fallo (un error instantáneo
// reintentando sin fin dentro del reloj).
MAX_ITERATIONS = 8;
TURN_WALL_CLOCK_MS = 45000;
TURN_CALL_BUDGET = 12;

async send() {
  const t = this.state.input.trim();
  if (!t) return;
  if (this._turnRunning) return;
  this._turnRunning = true;
  this.setState({ input: '', sugs: [] });

  this.user(t);

  // El flujo "¿acabaste alguna de estas?" sigue siendo local, sin modelo.
  if (this.state.pendingFinished) {
    const c = this.detectTitle(t);
    this.setState({ pendingFinished: false });
    if (c) { this._turnRunning = false; return this.finished(c); }
  }

  if (!this.hasModel()) { const b = this.typing(); this._turnRunning = false; return this.fallbackRoute(t, b); }

  this.history.push({ role: 'user', content: t });

  let bubble = this.typing();
  const turn = { deadline: Date.now() + this.TURN_WALL_CLOCK_MS, calls: 0, memo: new Map(),
                 toolCalls: 0, spend: { discovery: 0, write: 0 }, started: Date.now() };
  let iteration = 0, stop = 'answered';

  try {
    while (true) {
      iteration++;
      if (iteration > this.MAX_ITERATIONS)       { stop = 'max_iterations'; return await this.wrapUp(bubble, turn, stop); }
      if (Date.now() > turn.deadline)            { stop = 'timeout';        return await this.wrapUp(bubble, turn, stop); }
      if (turn.calls >= this.TURN_CALL_BUDGET)   { stop = 'call_budget';    return await this.wrapUp(bubble, turn, stop); }

      const res = await this.callModelValidated(turn);
      if (!res) { stop = 'validation_failed'; return await this.wrapUp(bubble, turn, stop); }

      this.history.push({ role: 'assistant', content: res.text });
      const calls = parseToolCalls(res.text);

      if (!calls.length) {
        this.resolveReply(bubble, res.text);      // §13
        return;
      }

      // El texto ANTES de la llamada se muestra ya: el usuario lo lee
      // mientras corren las herramientas.
      const preamble = stripToolCalls(res.text).trim();
      if (preamble) { this.resolveReply(bubble, preamble); bubble = null; }

      const results = [];
      for (const call of calls) {
        if (Date.now() > turn.deadline) {
          results.push({ call, result: fail('Se acabó el tiempo del turno — responde con lo que ya tienes, sin más llamadas.') });
          continue;
        }
        results.push({ call, result: await this.runTool(call, turn) });
      }
      turn.toolCalls += calls.length;

      this.history.push({ role: 'user', toolResult: true,
                          content: formatToolResults(results) + this.continuationHint(turn) });

      if (!bubble) bubble = this.typing();          // burbuja fresca para el siguiente mensaje
    }
  } catch (e) {
    stop = 'exception';
    console.error('[turn]', e);
    this.resolveReply(bubble || this.typing(), 'Se me trabó el cerebro tantito, nakama. Dale otra vez.');
  } finally {
    this._turnRunning = false;
    this.clearToolProgress();
    this.history = this.history.filter(m => !m.scaffold);      // §8
    console.info('[turn]', { stop, iteraciones: iteration, herramientas: turn.toolCalls,
                             llamadas: turn.calls, ms: Date.now() - turn.started, gasto: turn.spend });
  }
}
```

### Graceful wrap-up

Never dead-end on fixed copy while you can still get a real answer. Append a scaffold message telling the model to stop calling tools and answer from what it holds, then make one final call.

```js
async wrapUp(bubble, turn, reason) {
  const why = {
    timeout:           'Se te acabó el tiempo de este turno.',
    max_iterations:    'Llegaste al máximo de pasos de búsqueda.',
    call_budget:       'Llegaste al máximo de llamadas de este turno.',
    validation_failed: 'Tus últimas llamadas a herramientas no se pudieron leer.'
  }[reason] || 'Tienes que cerrar ya.';

  this.history.push({ role: 'user', scaffold: true, content:
    `${why} Con todo lo que ya reuniste, dale AHORA tu mejor respuesta al usuario. NO llames más herramientas: responde con texto directo.` });

  try {
    const res = await this.callModel(turn, { maxTokens: 900 });
    const text = stripToolCalls(res.text).trim();
    if (text) { this.resolveReply(bubble || this.typing(), text); return; }
  } catch (e) { console.error('[wrapup]', e); }

  this.resolveReply(bubble || this.typing(),
    'No alcancé a cerrar la búsqueda, nakama. Lo que sí encontré ya está en la vitrina — dime si le sigo.');
}
```

---

## 12. Budgets, duplicates, concurrency

### 12.1 Running a tool

```js
async runTool(call, turn) {
  const tool = this.TOOLS[call.name];
  if (!tool) return fail(`Herramienta desconocida: ${call.name}`);

  const args = normalizeArgs(call.params, tool.schema);
  const key = tool.replayable ? memoKey(call.name, args) : null;

  // Absorción de duplicados: el patrón #1 de descontrol es reemitir una
  // llamada idéntica. Devuelve lo memoizado con una nota explícita, para
  // que el modelo SEPA que se repitió en vez de creer que buscó de nuevo.
  if (key && turn.memo.has(key)) {
    const cached = turn.memo.get(key);
    console.debug('[tool] duplicada', call.name);
    return ok({ ...cached.data, nota_duplicado:
      '[llamada duplicada: ya ejecutaste esta llamada con parámetros idénticos en este turno; ' +
      'estos son los mismos resultados. No la repitas: úsalos o cambia los parámetros de forma significativa.]' });
  }

  this.broadcastToolProgress(tool, args, 'in_progress');
  const started = Date.now();
  try {
    const result = await tool.run(args, this);
    if (key && result.ok) turn.memo.set(key, result);
    if (call.name === 'update_library' || call.name === 'avoid_series') turn.spend.write++;
    else if (call.name === 'search_series') turn.spend.discovery++;
    console.debug('[tool]', call.name, { ms: Date.now() - started, ok: result.ok });
    return result;
  } catch (e) {
    console.error('[tool]', call.name, e);
    return fail(`Error de herramienta: ${e.message}`);
  } finally {
    this.broadcastToolProgress(tool, args, 'completed');
  }
}
```

### 12.2 The continuation hint

Appended to the tool-result message at send time, **never persisted** — same reason as scaffolds.

```js
DISCOVERY_WARN_AT = 4;
DISCOVERY_BUDGET = 8;

continuationHint(turn) {
  let hint = '\n\n[Continúa: emite <function_calls> si necesitas más datos, o tu respuesta final. ' +
             'NO comentes los resultados. Al redactar: vienen ordenados de mejor a peor — toma los ' +
             'primeros que pasen tus exclusiones y escribe directo, sin repasar uno por uno.]';
  if (turn.spend.discovery >= this.DISCOVERY_WARN_AT)
    hint += `\n[Recursos del turno: ${turn.spend.discovery} de ${this.DISCOVERY_BUDGET} búsquedas usadas. ` +
            'Si con lo que ya tienes puedes responder, responde ya.]';
  return hint;
}
```

The counter only appears above the threshold on purpose. *(prod: an always-on counter becomes a target the model spends up to; below the threshold it shouldn't know a number exists.)*

### 12.3 Concurrency

Two fast messages currently interleave: both mutate `state.messages`, and the second's typing bubble resolves into the first's slot. The `_turnRunning` guard handles the demo case. Also disable the input and the chips while a turn runs — `DESIGN.md` already says chips and input share state:

```js
// en renderVals()
inputDisabled: this._turnRunning,
chips: fixedChips.map(([label, click]) => ({ label, click: this._turnRunning ? () => {} : click }))
```

Since `_turnRunning` is an instance field, the template won't re-render when it flips. Either mirror it into state (`this.setState({ turnRunning: true })`) or accept that the guard is silent. Mirroring is better: a disabled input is honest feedback.

---

## 13. Rendering

### 13.1 Delete the `action` field

The reply's markup **is** the instruction. This is what makes "showed a card for a series that never came back from a tool" structurally impossible, instead of a rule you hope holds.

```js
// Tolerante a atributos a propósito: un regex que fija UN atributo se salta
// en silencio las etiquetas que traen otro, y la tarjeta nunca aparece.
const SERIE_TAG = /<serie((?:\s+[a-z_]+="[^"]*")*)\s*>([^<]*)<\/serie>/gi;
const ATTR      = /([a-z_]+)="([^"]*)"/gi;

parseSerieTags(text) {
  const out = [];
  for (const m of text.matchAll(SERIE_TAG)) {
    const attrs = {};
    for (const a of m[1].matchAll(ATTR)) attrs[a[1]] = a[2];
    out.push({ raw: m[0], attrs, texto: m[2] });
  }
  return out;
}

esRecomendacion(v) { return /^(recomendaci[oó]n|recomendado|recommendation|rec)$/i.test(String(v || '').trim()); }
```

### 13.2 The chat bubble

`{{ m.text }}` renders text, not HTML (§0.1). Two options:

**Simple:** strip every tag to its inner text before storing the message.

```js
plainText(text) {
  return stripToolCalls(text)
    .replace(SERIE_TAG, (_, __, inner) => inner)
    .replace(/<\/?[a-z][^>]*>/gi, '')      // cualquier etiqueta inventada que sobrevivió
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

**Nicer:** split into parts and loop them, so titles render bold and tappable.

```js
// en renderVals(), dentro del map de messages
partes: (m.parts || []).map(p => ({
  ...p,
  isSerie: !!p.id,
  isPlain: !p.id,
  open: p.id ? () => this.setState({ detail: p.id }) : null
}))
```

```html
<!-- dentro del globo, reemplazando <div>{{ m.text }}</div> -->
<div>
  <sc-for list="{{ m.partes }}" as="p" hint-placeholder-count="3">
    <sc-if value="{{ p.isPlain }}" hint-placeholder-val="{{ true }}"><span>{{ p.texto }}</span></sc-if>
    <sc-if value="{{ p.isSerie }}" hint-placeholder-val="{{ false }}">
      <span onClick="{{ p.open }}" role="button" style="font-family: var(--font-heading); font-weight: 800; cursor: pointer; border-bottom: 2px solid var(--color-accent)">{{ p.texto }}</span>
    </sc-if>
  </sc-for>
</div>
```

Build `parts` by walking `SERIE_TAG` matches and slicing the text between them. Start with the simple path; upgrade if it's worth the time.

### 13.3 The vitrina

```js
resolveReply(bubble, text) {
  const picks = [];
  for (const { attrs } of this.parseSerieTags(text)) {
    if (!attrs.id) continue;                       // sin id no hay tarjeta
    if (!this.idsSeen.has(attrs.id)) {             // §1 regla 4 — la mitad ejecutable
      console.warn('[render] id no visto en resultados, ignorado:', attrs.id);
      continue;
    }
    if (!this.esRecomendacion(attrs.type)) continue;
    if (!this.CAT.some(c => c.id === attrs.id)) continue;
    if (picks.some(p => p.id === attrs.id)) continue;
    picks.push({ id: attrs.id, porque: attrs.porque || null });
  }

  // El set se arma ANTES de resolver la burbuja: `resolve(id, texto, setId)`
  // necesita el id del set para colgar la tira de miniaturas "VER SET ⟶".
  let setId;
  if (picks.length) {
    // El modelo escribió el porqué; guárdalo para que la tarjeta lo use en
    // vez del texto genérico que calcula porque().
    picks.forEach(p => { if (p.porque) this._porques[p.id] = p.porque.slice(0, 90); });
    setId = this.showSet(this._lastPara || 'Para ti', 'recs', picks.map(p => p.id));
  }

  this.resolve(bubble, this.plainText(text), setId);
}
```

Two edits to existing code:

- **`startSet` must not create its own bubble.** Today it calls `typing()` and `resolve()` internally (`Desktop:400 / Móvil:332`). Split it: keep `startSet(para, tipo, ids, reply, opts)` for the local flows (`openGuardados`, `askAcabaste`, `pickSug`) and add `showSet(para, tipo, ids, opts)` that does everything except the bubble and **returns the new set's id** — the loop resolves the text itself, and needs that id to hang the "VER SET ⟶" thumbnail strip on the message.
- **The card's *porqué* prefers the model's.** In `renderVals()`, `porque: this.porque(c, this._lastOpts || {})` becomes `porque: this._porques[c.id] || this.porque(c, this._lastOpts || {})`. Keep `porque()` as the fallback: it's the honest, data-derived line when the model didn't write one.

---

## 14. Progress UI

The demo already has the right visual — speed-lines plus *"Verificando contra el archivo"* — but it's a fixed 800 ms animation (`fillMs`). Wire it to real execution:

```js
broadcastToolProgress(tool, args, status) {
  this.setState({ toolProgress: { summary: tool.summary(args), status } });
}
clearToolProgress() { this.setState({ toolProgress: null }); }
```

```js
// en renderVals()
showProgress: !!this.state.toolProgress,
progressText: this.state.toolProgress ? this.state.toolProgress.summary : ''
```

- `tool.summary(args)` is why every tool defines one: *"Buscando «algo tranquilo»"*, *"Marcando como vista"*, *"Revisando tu biblioteca"* beat a generic spinner and cost nothing.
- For batched writes, add a running count: *"Guardando en tu biblioteca · 3 listas"* — count successes inside the results loop.
- **Clear last.** Clear in the turn's `finally`, after the reply renders. *(prod had ordering bugs where a stale progress card outlived the answer because the clear raced the message render.)*

Keep `fillMs` for the card-fill animation itself. That's product texture, not a loading state.

---

## 15. Failure copy

`DESIGN.md`: *errores con voz humana, nunca códigos técnicos* — and, equally, never a technical error dressed as a user error.

| Situation | Copy |
| --- | --- |
| Genuinely ambiguous message | "No te sigo, nakama. ¿Es algo que acabas de ver, o quieres que te recomiende?" |
| Model/network failure, retries exhausted | "Se me trabó el cerebro tantito. Dale otra vez." |
| Host has no AI (offline) | "Ando sin conexión al cerebro, nakama — te muevo la vitrina con lo básico." |
| Tool found nothing | "Mi archivo no trae nada de eso, nakama — y no te voy a inventar títulos. Dame otra pista." |
| Turn hit its budget | The wrap-up answer from §11, never a hard stop. |
| Write succeeded | Name what you matched: "Listo: Frieren, vista." |
| Fuzzy match on a write | "Lo mandé a Odd Taxi — dime si era otra." |

**Optional: degeneracy detection.** If you ever see a model stuck emitting one character until the token cap, treat it as a failed call rather than rendering it:

```js
function lowEntropy(text) {
  const s = String(text).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  if (s.length < 500) return false;
  const counts = {};
  for (const ch of s) counts[ch] = (counts[ch] || 0) + 1;
  const max = Math.max(...Object.values(counts));
  return max / s.length > 0.45 || Object.keys(counts).length < 8;
}
```

Check it in `callModelValidated` before validating; on a hit, retry once, then wrap up.

---

## 16. Instrumentation

In a prototype the console *is* the dashboard, and "how many model calls did that question cost?" is the first question anyone asks.

Already wired above: `[llm]` per call (ms, chars, truncated), `[tool]` per execution (ms, ok) and on duplicates, `[validation]` per retry with its error list, `[render]` on a rejected id, `[turn]` once per turn (stop reason, iterations, tool calls, model calls, ms, spend).

Add a `window.__bsp = { history: () => this.history, ids: () => [...this.idsSeen], lib: () => this.state.biblioteca }` handle in `componentDidMount` so anyone demoing can inspect state from the console without a debugger.

---

## 17. Order of work

Each step leaves the demo working.

1. **Probe the API** (§0.3). Confirm multi-message history is honored before building on it. Ten minutes; it decides §7.3.
2. **Data model** (§2). `biblioteca` + `evitadas`, the accessors, the v2→v3 migration, the `renderVals` sweep. No chat changes yet — the UI keeps working through the accessors.
3. **Transcript** (§8). Send full history instead of one message. Half an hour, and it changes how the product feels more than anything else here.
4. **Loop + protocol** (§3–§7, §9, §11). New `send()`, registry with the four read tools only, parsers, executors. Keep the old JSON path behind a flag until the acceptance list passes.
5. **Validation + feedback + retry** (§10). No new behaviour, but it's what makes step 4 survive a real model.
6. **Writes** (§5, §12). `update_library`, `avoid_series`, receipts with `antes`, undo. Fix `rechaza()`'s race while you're in there (§18).
7. **Vitrina from tags** (§13). Delete `action`, add `idsSeen` enforcement, split `startSet`/`showSet`, wire `_porques`.
8. **Budgets, progress, instrumentation** (§12, §14, §16).
9. **Sync both files** — or hoist to `agent.js` (§0.2).

### Acceptance list

Type these into the demo. Every one fails today.

| Input | Must happen |
| --- | --- |
| "algo corto" → "más corto todavía" | Second turn understands "más" — the first turn is in context |
| "acabé frieren y voy en el 3 de dandadan" | TWO `update_library` calls in one block; both confirmed by name; the second's `episodio` is 3 |
| "esa ya no me la recomiendes" (after a card) | `avoid_series`; that title never returns in a later set |
| "¿qué me falta de lo que estoy viendo?" | `get_library`, answered from real per-episode progress |
| "recomiéndame algo" (cold) | `get_taste` + `search_series` batched in ONE `<function_calls>` block |
| "¿de qué trata odd taxi?" | ONE `get_series`; no recommendation set opens |
| Temporarily break the prompt's format block to force a malformed reply | Console shows a validation retry quoting the defect; the user gets a real answer, never "no me quedó claro" |
| Two messages sent fast | Second waits; no interleaved bubbles |
| Kill the network mid-turn | Honest copy; the UI is not stuck on a typing indicator |
| Open the file with no `window.claude` | Offline copy + the regex router; nothing throws |

---

## 18. Appendix A — what to delete

| File | Lines | What |
| --- | --- | --- |
| `BSP Desktop v2.dc.html` | 493–517 | `send()` — the whole JSON-action body |
| | 503 | the `catalogo` dump built for the prompt |
| | 505 | the `Responde SOLO JSON` system prompt |
| | 506 | `messages: [{ role: 'user', content: t }]` |
| | 509 | `JSON.parse(raw.match(/\{[\s\S]*\}/)[0])` |
| | 510–516 | the `if (j.action === …)` router |
| | 517 | `catch (e) { this.fallbackRoute(t, id); }` — becomes the offline path only |
| | 479–492 | `fallbackRoute()` — keep as offline degrade; change its last line (§7.2) |
| | 431–441 | `rechaza()` — the timeout race |
| | 292 | `vistos/saved/rejected` in the state literal |
| `BSP Móvil v2.dc.html` | 426–450 | `send()` |
| | 436, 438, 439, 442, 443–449, 450 | same items, same order |
| | 412–425 | `fallbackRoute()` |
| | 363–374 | `rechaza()` |
| | 224 | the state literal |

**The `rechaza()` race.** It schedules a `setState` 330 ms later that re-reads `this.state.cards` inside the timeout. Two fast dismissals overwrite each other. Capture the ids you need at call time:

```js
rechaza(c) {
  const shown = this.state.cards.map(cd => cd.id);       // capturado AHORA
  this._descartadas.add(c.id);                            // suave, no permanente
  this.setState(s => ({ cards: s.cards.map(cd => cd.id === c.id ? { ...cd, st: 'out' } : cd) }));
  setTimeout(() => {
    const next = this.computeRecs({ ...(this._lastOpts || {}), n: 1, exclude: shown });
    …
  }, 330);
}
```

And give it an undo: the dismissal is soft now, so a "deshacer" affordance on the message is a `this._descartadas.delete(id)` away.

**What does NOT get deleted:** `computeRecs()` (`Desktop:381 / Móvil:313`), `porque()` (`:368 / :300`) and `facts()` (`:366 / :298`) survive as the catalog's honest data layer, behind the tool interface. The model writes prose; the catalog keeps owning the numbers. That's the demo's own rule from `README.md` — *"la IA solo redacta, nunca promete cantidades"* — and it's the same rule the production system runs on.

---

## 19. Appendix B — state after the port

```js
state = {
  // vitrina
  mode, setPara, setTipo, setEmpty, cards, sets, detail, covers,
  // chat
  messages, input, chipMode, pendingFinished,
  // datos (nuevo)
  biblioteca: { [id]: { estado, episodio, reaccion, actualizado } },
  evitadas:   { [id]: true },
  // agente (nuevo)
  toolProgress: { summary, status } | null,
  turnRunning: false
}

// campos de instancia (no tocan el template)
this.history        = [];        // [{ role, content, toolResult?, scaffold?, invalid? }]
this.idsSeen        = new Set(); // ids devueltos por herramientas en esta conversación
this._descartadas   = new Set(); // descartes suaves de tarjeta
this._porques       = {};        // { id: porqué escrito por el modelo }
this._turnRunning   = false;
this._lastAcabo, this._lastSetIds, this._lastOpts, this._lastPara   // ya existían
```
