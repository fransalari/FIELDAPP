import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, Marker, LngLatBounds, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Capa, Caso, Muestras } from './tipos'

// MapLibre v6 + Vite: el worker tiene que pasar por el pipeline de Vite.
setWorkerUrl(maplibreWorkerUrl)

const CAPAS: Capa[] = ['previo', 'posterior', 'cambio', 'ambientes']

const ESTILO: StyleSpecification = {
  version: 8,
  projection: { type: 'mercator' },
  sources: {
    esri: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Esri, Maxar',
      maxzoom: 18,
    },
  },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#dfe4da' } },
    { id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-saturation': -0.35 } },
  ],
}

const RELLENO = { top: 70, bottom: 30, left: 28, right: 28 }

function limites(caso: Caso) {
  const b = new LngLatBounds()
  caso.esquinas.forEach((c) => b.extend(c))
  return b
}

interface Props {
  caso: Caso
  capa: Capa
  muestras: Muestras
  seleccionado: number | null
  onPunto: (id: number) => void
}

export default function Mapa({ caso, capa, muestras, seleccionado, onPunto }: Props) {
  const cont = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapLibreMap | null>(null)
  const marcadores = useRef<Map<number, HTMLButtonElement>>(new Map())
  const capaActual = useRef(capa)
  capaActual.current = capa
  const alTocar = useRef(onPunto)
  alTocar.current = onPunto

  // Crear el mapa una vez por caso
  useEffect(() => {
    const m = new MapLibreMap({
      container: cont.current!,
      style: ESTILO,
      bounds: limites(caso),
      fitBoundsOptions: { padding: RELLENO },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    m.touchZoomRotate.disableRotation()
    mapa.current = m

    m.on('load', () => {
      for (const c of CAPAS) {
        m.addSource(c, {
          type: 'image',
          url: `${import.meta.env.BASE_URL}data/${caso.id}/${c}.png`,
          coordinates: caso.esquinas as [[number, number], [number, number], [number, number], [number, number]],
        })
        m.addLayer({
          id: c,
          type: 'raster',
          source: c,
          layout: { visibility: c === capaActual.current ? 'visible' : 'none' },
          paint: { 'raster-resampling': 'nearest', 'raster-opacity': 0.92, 'raster-fade-duration': 0 },
        })
      }
      m.addSource('limite', { type: 'geojson', data: caso.limite })
      m.addLayer({ id: 'limite-sombra', type: 'line', source: 'limite', paint: { 'line-color': '#14201a', 'line-width': 5, 'line-opacity': 0.55 } })
      m.addLayer({ id: 'limite', type: 'line', source: 'limite', paint: { 'line-color': '#ffffff', 'line-width': 2.5 } })
    })

    const mapaMarcadores = marcadores.current
    for (const p of caso.puntos) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'punto'
      el.style.setProperty('--amb', caso.ambientes.find((a) => a.id === p.ambiente)!.color)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        alTocar.current(p.id)
      })
      new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m)
      mapaMarcadores.set(p.id, el)
    }

    return () => {
      mapaMarcadores.clear()
      m.remove()
      mapa.current = null
    }
  }, [caso])

  // Cambiar capa visible
  useEffect(() => {
    const m = mapa.current
    if (!m) return
    const aplicar = () => CAPAS.forEach((c) => m.getLayer(c) && m.setLayoutProperty(c, 'visibility', c === capa ? 'visible' : 'none'))
    if (m.isStyleLoaded()) aplicar()
    else m.once('load', aplicar)
  }, [capa, caso])

  // Estado visual de cada punto: pendiente / inspeccionado / seleccionado
  useEffect(() => {
    for (const p of caso.puntos) {
      const el = marcadores.current.get(p.id)
      if (!el) continue
      const hecho = muestras[p.id] !== undefined
      el.classList.toggle('hecho', hecho)
      el.classList.toggle('activo', seleccionado === p.id)
      el.textContent = hecho ? '✓' : String(p.id)
      el.setAttribute('aria-label', `Punto ${p.id}, ${hecho ? `inspeccionado, ${muestras[p.id]} % de daño` : 'pendiente'}`)
    }
  }, [caso, muestras, seleccionado])

  // Al abrir un punto se lo lleva a la parte visible (sobre la hoja inferior); al cerrar se vuelve al lote completo
  const huboSeleccion = useRef(false)
  useEffect(() => {
    const m = mapa.current
    if (!m) return
    const p = caso.puntos.find((x) => x.id === seleccionado)
    if (p) m.easeTo({ center: [p.lon, p.lat], offset: [0, -120], duration: 350 })
    else if (huboSeleccion.current) m.fitBounds(limites(caso), { padding: RELLENO, duration: 350 })
    huboSeleccion.current = !!p
  }, [caso, seleccionado])

  return (
    <div className="mapa">
      <div ref={cont} className="mapa-lienzo" />
      <button
        type="button"
        className="recentrar"
        aria-label="Centrar el lote"
        onClick={() => mapa.current?.fitBounds(limites(caso), { padding: RELLENO, duration: 400 })}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>
    </div>
  )
}
