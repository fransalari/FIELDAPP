import { useEffect, useState } from 'react'
import Mapa from './Mapa'
import HojaPunto from './HojaPunto'
import Resultado from './Resultado'
import { ESCALA, calcular, fmt, fmtFecha } from './calculo'
import type { Capa, Caso, CasoResumen, Muestras } from './tipos'

const CAPAS: { id: Capa; nombre: string }[] = [
  { id: 'previo', nombre: 'Previo' },
  { id: 'posterior', nombre: 'Posterior' },
  { id: 'cambio', nombre: 'Cambio' },
  { id: 'ambientes', nombre: 'Ambientes' },
]
const CLASES_CAMBIO = ['Bajo', 'Medio', 'Alto', 'Muy alto']
const DATOS = `${import.meta.env.BASE_URL}data`
const clave = (id: string) => `fieldapp:muestras:${id}`

function leerMuestras(id: string): Muestras {
  try {
    return JSON.parse(localStorage.getItem(clave(id)) ?? '{}')
  } catch {
    return {}
  }
}

export default function App() {
  const [casos, setCasos] = useState<CasoResumen[]>([])
  const [caso, setCaso] = useState<Caso | null>(null)
  const [muestras, setMuestras] = useState<Muestras>({})
  const [capa, setCapa] = useState<Capa>('posterior')
  const [vista, setVista] = useState<'inspeccion' | 'resultado'>('inspeccion')
  const [punto, setPunto] = useState<number | null>(null)
  const [eligiendo, setEligiendo] = useState(false)
  const [error, setError] = useState('')

  const abrirCaso = (id: string) =>
    fetch(`${DATOS}/${id}/meta.json`)
      .then((r) => r.json())
      .then((c: Caso) => {
        setMuestras(leerMuestras(c.id))
        setCaso(c)
        setPunto(null)
        setEligiendo(false)
      })
      .catch(() => setError('No se pudieron leer los datos del lote. Ejecutá "npm run datos" y recargá.'))

  useEffect(() => {
    fetch(`${DATOS}/casos.json`)
      .then((r) => r.json())
      .then((lista: CasoResumen[]) => {
        setCasos(lista)
        return abrirCaso(lista[0].id)
      })
      .catch(() => setError('No se encontró public/data/casos.json. Ejecutá "npm run datos" y recargá.'))
  }, [])

  const guardar = (m: Muestras) => {
    setMuestras(m)
    if (caso) localStorage.setItem(clave(caso.id), JSON.stringify(m))
  }

  if (error) return <p className="aviso">{error}</p>
  if (!caso) return <p className="aviso">Cargando lote…</p>

  const r = calcular(caso, muestras)
  const estado =
    r.puntosHechos === 0 ? 'Pendiente de inspección' : r.puntosHechos < caso.puntos.length ? 'Inspección en curso' : 'Inspección completa'
  const puntoSel = caso.puntos.find((p) => p.id === punto)

  return (
    <div className="app">
      {vista === 'inspeccion' ? (
        <>
          <header className="siniestro">
            <button type="button" className="siniestro-lote" onClick={() => setEligiendo(true)}>
              <span>
                <b>{caso.lote}</b>
                <small>{caso.cultivo}, {fmt(caso.superficieHa)} ha</small>
              </span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <dl>
              <div><dt>Siniestro</dt><dd>{fmtFecha(caso.fechaSiniestro)}</dd></div>
              <div><dt>Evento</dt><dd>{caso.evento}</dd></div>
              <div><dt>Estado</dt><dd className={`estado e${Math.sign(r.puntosHechos) + (r.puntosHechos === caso.puntos.length ? 1 : 0)}`}>{estado}</dd></div>
            </dl>
          </header>

          <div className="mapa-zona">
            <Mapa key={caso.id} caso={caso} capa={capa} muestras={muestras} seleccionado={punto} onPunto={setPunto} />
            <div className="capas" role="tablist" aria-label="Capa del mapa">
              {CAPAS.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={capa === c.id} className={capa === c.id ? 'on' : ''} onClick={() => setCapa(c.id)}>
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          <section className="panel">
            {(capa === 'previo' || capa === 'posterior') && (
              <>
                <div className="panel-cab">
                  <b>{capa === 'previo' ? 'Imagen previa' : 'Imagen posterior'}</b>
                  <span>Fecha: {fmtFecha(capa === 'previo' ? caso.fechaPrevia : caso.fechaPosterior)}</span>
                </div>
                <div className="rampa" />
                <div className="rampa-rotulos"><span>Poca vegetación</span><span>Índice NDVI</span><span>Mucha vegetación</span></div>
              </>
            )}
            {capa === 'cambio' && (
              <>
                <div className="panel-cab"><b>Cambio detectado</b><span>Caída de NDVI</span></div>
                <ul className="leyenda">
                  {CLASES_CAMBIO.map((n, i) => (
                    <li key={n}><span className="pastilla" style={{ background: ESCALA[i] }} />{n}<i>{caso.cambioClases[i]} %</i></li>
                  ))}
                </ul>
              </>
            )}
            {capa === 'ambientes' && (
              <>
                <div className="panel-cab"><b>Ambientes detectados</b><span>{caso.puntos.length} puntos de muestreo</span></div>
                <ul className="ambientes">
                  {caso.ambientes.map((a) => (
                    <li key={a.id}>
                      <span className="amb-id" style={{ background: a.color }}>{a.id}</span>
                      <span className="amb-nombre">{a.nombre}</span>
                      <span className="amb-sup">{fmt(a.superficieHa)} ha</span>
                      <span className="amb-pct">{a.porcentaje} %</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="progreso">
              <b>{r.puntosHechos} de {caso.puntos.length}</b> puntos inspeccionados.
              {r.puntosHechos === 0 && ' Tocá un punto numerado para cargar el daño.'}
            </p>
          </section>
        </>
      ) : (
        <Resultado caso={caso} muestras={muestras} onReiniciar={() => guardar({})} onIrAInspeccion={() => setVista('inspeccion')} />
      )}

      <nav className="barra">
        <button type="button" className={vista === 'inspeccion' ? 'on' : ''} onClick={() => setVista('inspeccion')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          Inspección
        </button>
        <button type="button" className={vista === 'resultado' ? 'on' : ''} onClick={() => { setPunto(null); setVista('resultado') }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>
          Resultado
          {r.dano !== null && <em>{fmt(r.dano, 0)} %</em>}
        </button>
      </nav>

      {vista === 'inspeccion' && puntoSel && (
        <HojaPunto
          key={puntoSel.id}
          caso={caso}
          punto={puntoSel}
          valorGuardado={muestras[puntoSel.id]}
          onGuardar={(pct) => { guardar({ ...muestras, [puntoSel.id]: pct }); setPunto(null) }}
          onQuitar={() => { const m = { ...muestras }; delete m[puntoSel.id]; guardar(m); setPunto(null) }}
          onCerrar={() => setPunto(null)}
        />
      )}

      {eligiendo && (
        <>
          <div className="velo" onClick={() => setEligiendo(false)} />
          <section className="hoja" role="dialog" aria-label="Elegir lote">
            <div className="hoja-asa" />
            <header className="hoja-cab"><div><h2>Lotes a inspeccionar</h2></div><button type="button" className="cerrar" onClick={() => setEligiendo(false)} aria-label="Cerrar">×</button></header>
            <ul className="lotes">
              {casos.map((c) => (
                <li key={c.id}>
                  <button type="button" className={c.id === caso.id ? 'on' : ''} onClick={() => abrirCaso(c.id)}>
                    <b>{c.lote}</b><span>{c.cultivo}, {fmt(c.superficieHa)} ha</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
