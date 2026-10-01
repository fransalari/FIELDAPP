import type { Caso, Muestras } from './tipos'

export const ESCALA = ['#3d9a50', '#e3b81f', '#ea7a1a', '#cf2f2a']

export function colorDano(pct: number) {
  return pct < 15 ? ESCALA[0] : pct < 35 ? ESCALA[1] : pct < 60 ? ESCALA[2] : ESCALA[3]
}

export const fmt = (n: number, dec = 1) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export const fmtFecha = (iso: string | null) =>
  iso ? iso.split('-').reverse().join('/') : 'Sin dato'

/**
 * Daño ponderado por superficie:
 *   daño lote = Σ (daño promedio del ambiente × superficie del ambiente) / superficie
 * Mientras falten ambientes sin muestras, se pondera solo sobre la superficie ya inspeccionada
 * y el resultado se marca como parcial.
 */
export function calcular(caso: Caso, muestras: Muestras) {
  const filas = caso.ambientes.map((a) => {
    const valores = caso.puntos
      .filter((p) => p.ambiente === a.id && muestras[p.id] !== undefined)
      .map((p) => muestras[p.id])
    const promedio = valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
    return { ambiente: a, muestras: valores.length, promedio }
  })
  const conDatos = filas.filter((f) => f.promedio !== null)
  const supInspeccionada = conDatos.reduce((s, f) => s + f.ambiente.superficieHa, 0)
  const tabla = filas.map((f) => ({
    ...f,
    contribucion:
      f.promedio !== null ? (f.promedio * f.ambiente.superficieHa) / supInspeccionada : null,
  }))
  const dano = conDatos.length ? tabla.reduce((s, f) => s + (f.contribucion ?? 0), 0) : null
  return {
    tabla,
    dano,
    supInspeccionada,
    puntosHechos: caso.puntos.filter((p) => muestras[p.id] !== undefined).length,
    ambientesHechos: conDatos.length,
    completo: conDatos.length === caso.ambientes.length,
  }
}
