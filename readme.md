# Repastos

SaaS multi-cliente para el manejo de repastos (potreros) en ganaderías de Costa Rica: lechería, carne y doble propósito. cc

## Módulos

| Módulo | Qué hace |
| --- | --- |
| **Inicio** | KPIs (listos, en espera, carga animal UA/ha o UA/mz, lluvia 30 d, gasto en insumos), alertas de sobreocupación y de aplicaciones con ganado, siguiente pastoreo sugerido, próximas liberaciones |
| **Mapa** | Imagen satelital (MapLibre). Dibujas cada potrero o **importas el mapa de la finca**: KML/KMZ (Google Earth), Shapefile `.zip`, GeoJSON o GPX. Las coordenadas en CRTM05 se reproyectan solas. El área se calcula sola. Colores por estado: listo, en descanso, en espera, ocupado |
| **Área aprovechable** | Se marcan en el mapa (o se importan; "Bosque", "Camino", "Quebrada"… se reconocen por el nombre) las áreas que no se pastorean: bosque, protección, agua, caminos, instalaciones, forraje de corta. Su intersección con cada potrero se descuenta sola (las zonas se unen antes, para no restar dos veces un traslape). Cada potrero admite además un descuento manual (árboles dispersos, charral). La carga animal y las cantidades de las aplicaciones usan el área aprovechable; Potreros muestra el uso del suelo por finca. Caminos, quebradas y cercas que vienen como **líneas** (QGIS, Google Earth) o se dibujan como línea se convierten en una franja del ancho indicado (camino 4 m, protección 30 m…; [src/lib/franja.ts](src/lib/franja.ts)); el ancho se puede cambiar después. Un recorrido GPS que vuelve cerca del inicio se toma como perímetro |
| **Módulos por hato** | Grupos de potreros por hato (Ordeño AM, Ordeño PM, Secas, Novillas…), cada uno con su color. Se crean con un clic según el tipo de ganadería, se asignan potreros marcándolos en lote y el mapa se puede colorear por módulo. Inicio muestra por módulo los potreros listos, la carga y cuántos días de descanso permite la rotación (`(n − 1) × días de ocupación`) |
| **Rotación** | Lotes (hatos) con UA y módulo, días de ocupación vs objetivo, **siguiente potrero sugerido dentro del módulo** con movimiento de un toque, mover y sacar lotes, historial. **No permite meter ganado a un potrero en tiempo de espera** (validado en el servidor) |
| **Aplicaciones** | Abonos, foliares, enmiendas y agroquímicos sobre uno o varios potreros. Dosis por ha o mz, cantidad total, costo en ₡ y fecha de liberación según el período de reingreso |
| **Insumos** | Catálogo por ganadería: N-P-K, ingrediente activo, registro SFE/MAG, reingreso, retiro de leche y carne, precio. Se precargan solo fertilizantes de composición estándar |
| **Aforos y lluvia** | kg MS/ha (cuadro, regla, plato, visual), hojas por rebrote y pluviómetro diario |
| **Forraje** | Cobertura estimada de cada potrero hoy y en 7/14 días, tasa de crecimiento, etapa de hoja y **prioridad de pastoreo** (pasándose, pastorear ya, pronto, esperar). **Cuña forrajera** con línea objetivo (entrada → residuo) y excedente/faltante en t MS; demanda de los lotes vs crecimiento y días de pasto en pie. Modelo en [src/lib/forraje.ts](src/lib/forraje.ts): parámetros por pasto de CR (kikuyo, estrella, brachiarias, Mombasa…), temperatura por altitud, régimen de lluvias (Pacífico seco, Valle Central, Caribe/Zona Norte) o el pluviómetro de la finca, y calibración con dos aforos seguidos. No depende de satélite, así que funciona con nubosidad |
| **Planificador** | Orden de los próximos potreros de cada lote con fechas, cobertura proyectada al entrar y oferta vs demanda (corto / ajustado / sobra). Plan automático por forraje, días objetivo o descanso; se reordena, se cambian días y se ejecuta el siguiente movimiento. Marca los potreros que a la fecha de entrada siguen en tiempo de espera. La demanda usa % del peso vivo por categoría menos el suplemento (kg MS/animal/día) del lote |
| **Labores** | Siembra/resiembra, chapia, cosecha (ensilaje, pacas), riego, cercas, tareas pendientes y notas sobre uno o varios potreros, con costo en ₡. El potrero muestra los días desde pastoreo, abono, foliar, fumigación, chapia, cosecha, siembra y aforo |
| **Herramientas** | Calculadoras: etapa de hoja, franjas con cerca eléctrica, respuesta al nitrógeno vs concentrado (₡/kg MS), banco forrajero de corta (King grass, caña, maíz…) y días de pastoreo disponibles |
| **Reportes** | Reporte de rotación por período y lote: movimientos con descanso previo y aforo de entrada, resumen por potrero, insumos y labores. Se imprime o guarda en PDF y se comparte por WhatsApp |
| **Potrero** | Historial de pastoreos, aplicaciones, aforos, N-P-K aplicado en 12 meses, fotos y documentos (Object Storage) |
| **Ajustes** | Ganadería (tipo de producción, unidad ha/mz), fincas (provincia, cantón) y equipo con roles |

Estado de un potrero (prioridad): **ocupado** > **en espera** (producto con reingreso vigente) > **en descanso** (menos días que su objetivo) > **listo**. La lógica está en [src/lib/dominio.ts](src/lib/dominio.ts). La comparten la app y la Neon Function `api`.

## Stack

- **Next.js 16** (App Router, Cache Components) + Tailwind 4. Diseño basado en el perfil Agriculture/Farm Tech de ui-ux-pro-max (Organic Biophilic + Flat), con Plus Jakarta Sans e Inter. Es mobile-first, con barra inferior en el celular.
- **Neon** (proyecto `wild-meadow-86001718`, rama `production`), declarado en [neon.ts](neon.ts):
  - **Postgres** con Drizzle y `node-postgres`. Esquema en [src/db/schema.ts](src/db/schema.ts) y migraciones en [drizzle/](drizzle/).
  - **Neon Auth** (Managed Better Auth). Rutas protegidas con [src/proxy.ts](src/proxy.ts).
  - **Object Storage**: bucket privado `assets` con URLs firmadas.
  - **Functions**: `api` (Hono) en [functions/api.ts](functions/api.ts), que verifica el JWT de Neon Auth.
- **MapLibre GL + Terra Draw + Turf** para el mapa. Las teselas satelitales usan Esri World Imagery por defecto. Antes de usarlo comercialmente, revisa los términos o configura `NEXT_PUBLIC_SATELLITE_TILES` y `NEXT_PUBLIC_SATELLITE_ATTRIBUTION` con un proveedor con licencia (MapTiler, Mapbox, Esri con API key).

## Multi-tenant

Cada ganadería es una `organizacion`. Los usuarios entran por `membresias` con un rol:

- propietario
- administrador: configura
- operador: registra en campo
- lector

Todas las tablas llevan `org_id`. Cada acción y consulta valida la membresía con `requireOrg()` ([src/lib/tenant.ts](src/lib/tenant.ts)).

## Unidades

Las áreas se guardan siempre en hectáreas y las dosis por hectárea. Área aprovechable = área del potrero − `area_excluida_ha` (calculada en [src/lib/area-excluida.ts](src/lib/area-excluida.ts) al guardar zonas o límites) − `descuento_ha`. La interfaz convierte a manzanas (1 mz = 0,69873 ha) según la preferencia de cada ganadería.

## Desarrollo

```bash
npm install
neon env pull            # escribe .env.local (añade NEON_AUTH_COOKIE_SECRET: openssl rand -base64 32)
npm run db:migrate
npm run dev              # predev copia el worker de MapLibre a public/maplibre/
```

- **Esquema:** edita `src/db/schema.ts`, luego `npm run db:generate` y `npm run db:migrate`.
- **Servicios de Neon:** edita `neon.ts` y luego `neon deploy`.
- **E2E** (usa Microsoft Edge): `npm run build && npm start`, luego `npm run e2e -- http://localhost:3000 [carpeta-capturas]`.
