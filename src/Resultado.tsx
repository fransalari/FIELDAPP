import type { Caso, Muestras } from './tipos'
import { calcular, colorDano, fmt } from './calculo'

interface Props {
  caso: Caso
  muestras: Muestras
  onReiniciar: () => void
  onIrAInspeccion: () => void
}

export default function Resultado({ caso, muestras, onReiniciar, onIrAInspeccion }: Props) {
  const r = calcular(caso, muestras)
  const R = 52
  const largo = 2 * Math.PI * R
  const tono = r.dano === null ? '#c9cfc6' : colorDano(r.dano)

  return (
    <main className="resultado">
      <h1>Resultado de inspección</h1>

      <section className="tarjeta dano-lote">
        <svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true">
          <circle cx="64" cy="64" r={R} fill="none" stroke="#e7ebe3" strokeWidth="12" />
          <circle
            cx="64" cy="64" r={R} fill="none" stroke={tono} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(largo * (r.dano ?? 0)) / 100} ${largo}`} transform="rotate(-90 64 64)"
          />
          <text x="64" y="72" textAnchor="middle" className="aro-num">
            {r.dano === null ? '–' : fmt(r.dano)}
            {r.dano !== null && <tspan className="aro-pct"> %</tspan>}
          </text>
        </svg>
        <div>
          <p className="dano-rotulo">Daño estimado del lote</p>
          <p className="dano-nota">
            {r.dano === null
              ? 'Todavía no hay muestras cargadas.'
              : r.completo
                ? 'Promedio ponderado por la superficie de cada ambiente.'
                : `Parcial: calculado sobre ${fmt(r.supInspeccionada)} ha de ${fmt(caso.superficieHa)} ha. Faltan ambientes por inspeccionar.`}
          </p>
        </div>
      </section>

      <section className="cifras">
        <div className="tarjeta"><span>Superficie total</span><b>{fmt(caso.superficieHa)} ha</b></div>
        <div className="tarjeta"><span>Puntos inspeccionados</span><b>{r.puntosHechos} / {caso.puntos.length}</b></div>
        <div className="tarjeta"><span>Ambientes inspeccionados</span><b>{r.ambientesHechos} / {caso.ambientes.length}</b></div>
      </section>

      <section className="tarjeta tabla-caja">
        <table>
          <thead>
            <tr><th>Ambiente</th><th>Superficie</th><th>Muestras</th><th>Daño prom.</th><th>Aporte</th></tr>
          </thead>
          <tbody>
            {r.tabla.map((f) => (
              <tr key={f.ambiente.id}>
                <td><span className="pastilla" style={{ background: f.ambiente.color }} />{f.ambiente.id}</td>
                <td>{fmt(f.ambiente.superficieHa)} ha</td>
                <td>{f.muestras}</td>
                <td>{f.promedio === null ? '–' : `${fmt(f.promedio, 0)} %`}</td>
                <td>{f.contribucion === null ? '–' : `${fmt(f.contribucion)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {r.puntosHechos < caso.puntos.length && (
        <button type="button" className="primario" onClick={onIrAInspeccion}>
          Seguir inspeccionando ({caso.puntos.length - r.puntosHechos} puntos pendientes)
        </button>
      )}
      {r.puntosHechos > 0 && (
        <button type="button" className="secundario" onClick={() => confirm('¿Borrar todas las muestras de este lote?') && onReiniciar()}>
          Borrar muestras
        </button>
      )}
    </main>
  )
}
