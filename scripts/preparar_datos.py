"""
Convierte los rasters de cada siniestro (datos/<id>/) en archivos livianos
para la app (public/data/<id>/): PNGs coloreados + meta.json.

Uso:  pip install rasterio numpy pillow scipy shapely
      python scripts/preparar_datos.py

Archivos esperados en datos/<id>/ :
  *_ndvi_pre_AAAA-MM-DD.tif     imagen previa (NDVI)
  *_ndvi_post_AAAA-MM-DD.tif    imagen posterior (NDVI)
  *_tasa_cambio_pct.tif         tasa de cambio en %
  *_clusters*.tif               ambientes (opcional; si falta se generan por rangos de cambio)
  *.kml / *.kmz                 límite del lote (opcional; si falta se deriva del raster)
"""
import glob, json, os, re, zipfile
import numpy as np
import rasterio
from rasterio.features import shapes, geometry_mask
from rasterio.warp import transform as warp_transform, transform_geom
from PIL import Image
from scipy.ndimage import distance_transform_edt
from shapely.geometry import shape, mapping, Polygon
from shapely.ops import unary_union

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = os.path.join(RAIZ, "datos")
SALIDA = os.path.join(RAIZ, "public", "data")

# Escala de impacto: verde, amarillo, naranja, rojo
ESCALA = ["#3d9a50", "#e3b81f", "#ea7a1a", "#cf2f2a"]
NOMBRES = {
    3: ["Bajo impacto", "Impacto medio", "Alto impacto"],
    4: ["Bajo impacto", "Impacto medio", "Alto impacto", "Muy alto impacto"],
}
COLORES = {3: [ESCALA[0], ESCALA[1], ESCALA[3]], 4: ESCALA}
# Caída de NDVI (%) que separa cambio bajo / medio / alto / muy alto
CORTES_CAMBIO = [10, 25, 45]
BORDE_MIN_M = 30  # distancia mínima de un punto de muestreo al borde del lote


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def rampa_ndvi(v):
    """NDVI 0.1–0.9 → suelo desnudo (ocre) a vegetación densa (verde oscuro)."""
    paradas = [(0.1, (150, 96, 52)), (0.3, (214, 176, 98)), (0.5, (236, 229, 140)),
               (0.7, (120, 186, 86)), (0.9, (22, 104, 52))]
    xs = [p[0] for p in paradas]
    return np.stack([np.interp(v, xs, [p[1][c] for p in paradas]) for c in range(3)], -1)


def guardar_png(rgb, mascara, ruta, escala=6):
    rgba = np.zeros(mascara.shape + (4,), np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(mascara, 255, 0)
    img = Image.fromarray(rgba)
    img = img.resize((img.width * escala, img.height * escala), Image.NEAREST)
    img.save(ruta, optimize=True)


def leer_kml(carpeta):
    for f in glob.glob(os.path.join(carpeta, "*.km[lz]")):
        if f.endswith(".kmz"):
            with zipfile.ZipFile(f) as z:
                texto = z.read([n for n in z.namelist() if n.endswith(".kml")][0]).decode("utf8")
        else:
            texto = open(f, encoding="utf8").read()
        m = re.search(r"<coordinates>(.*?)</coordinates>", texto, re.S)
        if m:
            pts = [tuple(map(float, p.split(",")[:2])) for p in m.group(1).split()]
            return Polygon(pts)
    return None


def elegir_puntos(zona, dist_borde, n, res, ocupados):
    """n puntos bien adentro del ambiente y separados entre sí (greedy farthest-point)."""
    interior = distance_transform_edt(zona) * res
    # candidatos: lejos del borde del lote y, si alcanza, también del borde del ambiente
    for candidatos in (zona & (dist_borde >= BORDE_MIN_M) & (interior >= 2 * res),
                       zona & (dist_borde >= BORDE_MIN_M), zona):
        if candidatos.sum() >= n * 4 or candidatos is zona:
            break
    filas, cols = np.nonzero(candidatos)
    profundidad = interior[filas, cols] / res
    separacion = np.sqrt(zona.sum() / n)          # distancia deseada entre puntos (píxeles)
    previos = list(ocupados)
    elegidos = []
    while len(elegidos) < n:
        todos = previos + [(filas[i], cols[i]) for i in elegidos]
        d = np.min([np.hypot(filas - f, cols - c) for f, c in todos], axis=0) if todos else np.full(len(filas), separacion)
        # suficientemente lejos de los demás puntos y, a igualdad, lo más adentro posible
        elegidos.append(int(np.argmax(np.minimum(d, separacion) + 0.05 * profundidad)))
    return [(int(filas[i]), int(cols[i])) for i in elegidos]


def procesar(id_caso, info):
    carpeta = os.path.join(ENTRADA, id_caso)
    uno = lambda patron: (glob.glob(os.path.join(carpeta, patron)) or [None])[0]
    f_pre, f_post = uno("*_ndvi_pre_*.tif"), uno("*_ndvi_post_*.tif")
    f_cambio, f_clusters = uno("*_tasa_cambio*.tif"), uno("*_clusters*.tif")
    fecha = lambda f: re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(f)).group(1)

    with rasterio.open(f_cambio) as src:
        cambio = src.read(1).astype("float32")
        tr, crs, res = src.transform, src.crs, src.res[0]
        b = src.bounds
    pre = rasterio.open(f_pre).read(1)
    post = rasterio.open(f_post).read(1)
    mascara = np.isfinite(cambio)

    # Límite del lote: KML/KMZ si existe; si no, contorno de los píxeles válidos
    lote_ll = leer_kml(carpeta)
    if lote_ll is not None:
        lote_utm = shape(transform_geom("EPSG:4326", crs, mapping(lote_ll)))
        mascara &= geometry_mask([mapping(lote_utm)], cambio.shape, tr, invert=True)
    else:
        lote_utm = unary_union([shape(g) for g, v in shapes(mascara.astype("uint8"), mask=mascara, transform=tr)])
        lote_ll = shape(transform_geom(crs, "EPSG:4326", mapping(lote_utm)))

    ha_pixel = res * res / 10000
    sup_total = round(float(mascara.sum() * ha_pixel), 1)

    # Ambientes: raster de clusters si existe; si no, cuartiles de la tasa de cambio
    if f_clusters:
        cl = rasterio.open(f_clusters).read(1)
        ids = [int(v) for v in np.unique(cl[mascara & np.isfinite(cl)])]
    else:
        q = np.quantile(cambio[mascara], [0.25, 0.5, 0.75])
        cl = np.where(mascara, np.digitize(-cambio, -q[::-1]) + 1, np.nan)
        ids = [1, 2, 3, 4]
    # ordenar de menor a mayor impacto (cambio más negativo = más daño)
    ids.sort(key=lambda i: -float(np.nanmean(cambio[mascara & (cl == i)])))
    n = len(ids)
    orden = np.full(cambio.shape, -1)
    for k, i in enumerate(ids):
        orden[mascara & (cl == i)] = k

    dist_borde = distance_transform_edt(np.pad(mascara, 1))[1:-1, 1:-1] * res
    desvios = [float(np.std(cambio[orden == k])) for k in range(n)]
    partes = [float((orden == k).sum() / mascara.sum()) for k in range(n)]
    cupos = [1 if p < 0.03 else 2 for p in partes]   # ambientes mínimos: un solo punto
    cupos[n - 1] += 1                                 # más puntos donde hay más daño
    cupos[int(np.argmax([d if p >= 0.1 else 0 for d, p in zip(desvios, partes)]))] += 1  # y más variabilidad

    ambientes, puntos, ocupados = [], [], []
    for k in range(n):
        zona = orden == k
        sup = round(float(zona.sum() * ha_pixel), 1)
        ambientes.append({
            "id": f"A{k + 1}", "nombre": NOMBRES.get(n, NOMBRES[4])[k], "color": COLORES.get(n, ESCALA)[k],
            "superficieHa": sup, "porcentaje": round(100 * zona.sum() / mascara.sum()),
            "cambioMedioPct": round(float(cambio[zona].mean()), 1),
        })
        for fila, col in elegir_puntos(zona, dist_borde, cupos[k], res, ocupados):
            ocupados.append((fila, col))
            x, y = tr * (col + 0.5, fila + 0.5)
            lon, lat = warp_transform(crs, "EPSG:4326", [x], [y])
            puntos.append({"ambiente": f"A{k + 1}", "lon": round(lon[0], 6), "lat": round(lat[0], 6),
                           "superficieHa": round(sup / cupos[k], 1)})
    for i, p in enumerate(puntos):
        p["id"] = i + 1

    # PNGs
    destino = os.path.join(SALIDA, id_caso)
    os.makedirs(destino, exist_ok=True)
    guardar_png(rampa_ndvi(np.nan_to_num(pre, nan=0.1)), mascara, os.path.join(destino, "previo.png"))
    guardar_png(rampa_ndvi(np.nan_to_num(post, nan=0.1)), mascara, os.path.join(destino, "posterior.png"))
    clase = np.digitize(-np.nan_to_num(cambio), CORTES_CAMBIO)
    guardar_png(np.array([hex_rgb(c) for c in ESCALA])[clase], mascara, os.path.join(destino, "cambio.png"))
    guardar_png(np.array([hex_rgb(a["color"]) for a in ambientes])[np.clip(orden, 0, n - 1)], mascara,
                os.path.join(destino, "ambientes.png"))

    # Esquinas de la imagen en lon/lat (sup-izq, sup-der, inf-der, inf-izq), formato MapLibre
    xs, ys = warp_transform(crs, "EPSG:4326", [b.left, b.right, b.right, b.left], [b.top, b.top, b.bottom, b.bottom])
    meta = {
        "id": id_caso, **info, "superficieHa": sup_total,
        "fechaPrevia": fecha(f_pre), "fechaPosterior": fecha(f_post),
        "esquinas": [[round(x, 7), round(y, 7)] for x, y in zip(xs, ys)],
        "lote": info.get("lote", f"Lote {id_caso}"),
        "limite": {"type": "Feature", "properties": {}, "geometry": mapping(lote_ll)},
        "cambioClases": [round(100 * float((clase[mascara] == c).mean())) for c in range(4)],
        "ambientes": ambientes, "puntos": puntos,
    }
    json.dump(meta, open(os.path.join(destino, "meta.json"), "w", encoding="utf8"), ensure_ascii=False)
    print(id_caso, sup_total, "ha |", [(a["id"], a["superficieHa"], a["cambioMedioPct"]) for a in ambientes], "|", len(puntos), "puntos")
    return {"id": id_caso, "lote": meta["lote"], "cultivo": info.get("cultivo"), "superficieHa": sup_total}


if __name__ == "__main__":
    casos = json.load(open(os.path.join(ENTRADA, "casos.json"), encoding="utf8"))
    indice = []
    carpetas = [os.path.basename(c.rstrip("/\\")) for c in glob.glob(os.path.join(ENTRADA, "*/"))]
    # primero los casos listados en casos.json (en ese orden), después el resto
    for id_caso in [c for c in casos if c in carpetas] + sorted(c for c in carpetas if c not in casos):
        indice.append(procesar(id_caso, casos.get(id_caso, {"cultivo": "Sin dato", "fechaSiniestro": None, "evento": "Granizo"})))
    json.dump(indice, open(os.path.join(SALIDA, "casos.json"), "w", encoding="utf8"), ensure_ascii=False)
