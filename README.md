# bsp

Descubrimiento de anime en español para el momento en que acabas una serie y no sabes qué sigue.
Chat con IA que te conoce + vitrina visual que reacciona a la conversación.

## Cómo correrlo en tu compu

```bash
npm install
npm run dev
```

Abre http://localhost:3000

## Qué necesitas configurar

Copia `.env.example` a `.env.local` y llena los valores. Cada variable tiene un comentario
arriba diciendo de dónde se saca.

## Dónde está documentado el proyecto

| Documento | Qué contiene |
|---|---|
| [Diseño](docs/designs/recomendador-con-memoria.md) | Qué se construye y por qué |
| [Alcance](docs/plans/alcance-mvp.md) | Qué entra al MVP y qué no |
| [Experiencia](docs/designs/experiencia-y-estados.md) | Cada pantalla y cada estado |
| [Arquitectura](docs/plans/arquitectura.md) | Cómo se construye |
| [Diseño visual](DESIGN.md) | Colores, tipografías y componentes |

## Stack

Next.js · Tailwind · Supabase · API de Claude · datos de anime vía Jikan
