import { useState } from 'react'
import type { Caso, Punto } from './tipos'
import { colorDano, fmt } from './calculo'

interface Props {
  caso: Caso
  punto: Punto
  valorGuardado: number | undefined
  onGuardar: (pct: number) => void
  onQuitar: () => void
  onCerrar: () => void
}

export default function HojaPunto({ caso, punto, valorGuardado, onGuardar, onQuitar, onCerrar }: Props) {
  const [valor, setValor] = useState(valorGuardado ?? 0)
  const ambiente = caso.ambientes.find((a) => a.id === punto.ambiente)!
  const fijar = (n: number) => setValor(Math.max(0, Math.min(100, Math.round(n) || 0)))

  return (
    <>
      <div className="velo" onClick={onCerrar} />
      <section className="hoja" role="dialog" aria-label={`Punto de inspección ${punto.id}`}>
        <div className="hoja-asa" />
        <header className="hoja-cab">
          <div>
            <h2>Punto de inspección #{punto.id}</h2>
            <p>
              <span className="pastilla" style={{ background: ambiente.color }} />
              {ambiente.id}, {ambiente.nombre.toLowerCase()}. Representa {fmt(punto.superficieHa)} ha
            </p>
          </div>
          <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        </header>

        <label className="campo-titulo" htmlFor="dano">Daño observado (%)</label>
        <div className="dano-fila">
          <input
            id="dano"
            className="dano-num"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={valor}
            onChange={(e) => fijar(Number(e.target.value))}
            onFocus={(e) => e.target.select()}
            style={{ color: colorDano(valor) }}
          />
          <input
            className="dano-barra"
            type="range"
            min={0}
            max={100}
            step={1}
            value={valor}
            onChange={(e) => fijar(Number(e.target.value))}
            aria-label="Daño observado"
            style={{ '--pct': `${valor}%`, '--tono': colorDano(valor) } as React.CSSProperties}
          />
        </div>
        <div className="rapidos">
          {[0, 25, 50, 75, 100].map((n) => (
            <button key={n} type="button" className={valor === n ? 'on' : ''} onClick={() => fijar(n)}>
              {n}
            </button>
          ))}
        </div>

        <button type="button" className="primario" onClick={() => onGuardar(valor)}>
          Guardar muestra
        </button>
        {valorGuardado !== undefined && (
          <button type="button" className="secundario" onClick={onQuitar}>
            Quitar muestra
          </button>
        )}
      </section>
    </>
  )
}
