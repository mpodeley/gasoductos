# gasoductos

Viewer estatico de la red argentina de transporte de gas, pensado para publicarse en GitHub Pages.

Mantiene la estetica e interactividad de `pruebacodex`, pero consume un snapshot canonico exportado desde `GCIE`, donde vive la logica de scrapers, normalizacion y modelado de red.

## Estado actual

- App React + Vite lista para Pages.
- Snapshot canonico en `data/processed/gcie-network-snapshot.json`.
- Exportador desde `GCIE` en `scripts/export_gcie_snapshot.py`.
- Viewer con:
  - timeline mensual;
  - filtro por gasoducto;
  - stress-only;
  - bubbles de `Source`, `Conv`, `NC`, `Bolivia`, `LNG`, `Sink` y `Observed`;
  - inspector de nodos y tramos.

## Flujo recomendado

Instalar dependencias:

```bash
npm ci
```

Regenerar el snapshot desde `GCIE`:

```bash
npm run export:gcie
```

Levantar la app local:

```bash
npm run dev
```

Generar build de produccion:

```bash
npm run build
```

## Fuente de verdad

Este repo no duplica ETL ni scrapers de `GCIE`.

- `GCIE` produce la red canonica, metricas mensuales y breakdown de fuentes.
- `gasoductos` solo exporta ese estado a un JSON estatico y lo renderiza para web publica.

## Scripts legacy

Se conservaron como referencia:

- `npm run fetch:enargas`
- `npm run fetch:flows`

Hoy el camino principal para actualizar datos es `npm run export:gcie`.
