# FIELDAPP: inspección de siniestros agrícolas (prototipo)

App mobile-first para que un perito inspeccione un lote siniestrado: compara NDVI previo y posterior,
ve el cambio detectado y los ambientes, carga el daño en puntos de muestreo y obtiene el daño del lote
ponderado por superficie.

Stack (el mismo de AGRO / Portal-Pericial-AGRO, sin backend): Vite + React + TypeScript + MapLibre GL.

## Ejecutar

```bash
npm install
npm run dev        # abre http://localhost:5173 (y la IP de red para probar desde el teléfono)
```

Las muestras se guardan en el teléfono (localStorage), por lote.

## Datos de cada siniestro

Cada lote es una carpeta `datos/<id>/` con:

| Archivo | Qué es |
|---|---|
| `*_ndvi_pre_AAAA-MM-DD.tif` | TIFF previo (NDVI). La fecha sale del nombre |
| `*_ndvi_post_AAAA-MM-DD.tif` | TIFF posterior (NDVI) |
| `*_tasa_cambio_pct.tif` | Tasa de cambio en % |
| `*_clusters*.tif` | Ambientes (opcional: si falta, se generan 4 por cuartiles del cambio) |
| `*.kml` o `*.kmz` | Límite del lote (opcional: si falta, se usa el contorno del raster) |

Fecha del siniestro, cultivo, evento y nombre del lote van en `datos/casos.json` (hoy son **MOCK**).

Después de agregar o cambiar datos:

```bash
pip install rasterio numpy pillow scipy shapely
npm run datos      # genera public/data/<id>/{previo,posterior,cambio,ambientes}.png + meta.json
```

## Cómo se calcula

- **Cambio detectado**: caída de NDVI. Bajo < 10 %, medio 10–25 %, alto 25–45 %, muy alto > 45 % (`CORTES_CAMBIO` en el script).
- **Ambientes**: clases del raster de clusters, ordenadas de menor a mayor caída media de NDVI.
- **Puntos de muestreo**: 2 por ambiente, +1 en el de mayor daño y +1 en el de mayor variabilidad; a más de 30 m del borde del lote y separados entre sí.
- **Daño del lote** = Σ (daño promedio del ambiente × superficie del ambiente) / superficie. Si faltan ambientes, se muestra como parcial (`src/calculo.ts`).

## Estructura

```
datos/                 rasters originales + casos.json
scripts/preparar_datos.py
public/data/           salida del script (lo que lee la app)
src/App.tsx            pantalla de inspección, navegación
src/Mapa.tsx           MapLibre: capas, límite, puntos
src/HojaPunto.tsx      carga de daño por punto
src/Resultado.tsx      resumen y tabla
src/calculo.ts         cálculo ponderado
```
