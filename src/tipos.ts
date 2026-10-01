import type { Feature } from 'geojson'

export type Capa = 'previo' | 'posterior' | 'cambio' | 'ambientes'

export interface Ambiente {
  id: string
  nombre: string
  color: string
  superficieHa: number
  porcentaje: number
  cambioMedioPct: number
}

export interface Punto {
  id: number
  ambiente: string
  lon: number
  lat: number
  superficieHa: number
}

export interface Caso {
  id: string
  lote: string
  cultivo: string
  fechaSiniestro: string | null
  evento: string
  superficieHa: number
  fechaPrevia: string
  fechaPosterior: string
  esquinas: [number, number][]
  limite: Feature
  cambioClases: number[]
  ambientes: Ambiente[]
  puntos: Punto[]
}

export interface CasoResumen {
  id: string
  lote: string
  cultivo: string
  superficieHa: number
}

/** Daño observado (%) por id de punto */
export type Muestras = Record<number, number>
