# TWF Clients Sites — Monorepo

Monorepo de 9 sitios web para negocios reales de Montevideo (Ciudad Vieja, Centro, Cordón) repartidos en 3 tiers de complejidad.

Plan completo: [`../prospects/PLAN.md`](../prospects/PLAN.md). Fichas de descubrimiento: [`../prospects/FICHAS.md`](../prospects/FICHAS.md).

## Stack

- **Astro 5** + **Tailwind CSS 4** + **TypeScript estricto** en los 9 sitios.
- **Supabase** (postgres + auth + storage + RLS) en los 3 sitios Tier 3.
- **pnpm workspaces** + **Resend** + **Zod**.

## Estructura

```
clients-sites/
├── packages/
│   ├── config/   # tailwind preset, tsconfig base
│   ├── ui/       # componentes Astro compartidos
│   ├── lib/      # analytics, schema.org, i18n, forms, supabase/resend clients
│   └── content/  # schemas Zod compartidos
├── sites/
│   ├── tier1-caro-morales/      # piloto
│   ├── tier1-bosque-tattoo/
│   ├── tier1-diana-saravia/
│   ├── tier2-bar-tasende/
│   ├── tier2-bar-hispano/
│   ├── tier2-babilonia-libros/
│   ├── tier3-plaza-fuerte/
│   ├── tier3-karausz/
│   └── tier3-posada-al-sur/
└── supabase/
    ├── plaza-fuerte/
    ├── karausz/
    └── posada-al-sur/
```

## Comandos

```bash
pnpm install              # instala dependencias en todo el workspace
pnpm dev                  # corre dev servers de los 9 sitios en paralelo
pnpm --filter ./sites/tier1-caro-morales dev   # un solo sitio
pnpm build                # buildea los 9
pnpm check                # astro check en los 9
pnpm typecheck            # tsc --noEmit
```

## Convenciones

- Branch naming: `feat/<sitio-slug>/<feature>`.
- Commits convencionales con scope: `feat(caro-morales): add hero section`.
- Cada sitio tiene su `.env.example`. Nada commiteado.

## Datos pendientes del cliente

Ver sección 15 de [`../prospects/PLAN.md`](../prospects/PLAN.md).
