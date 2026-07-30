import type { CSSProperties } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'

/**
 * Shared recharts theming for the dashboard and report charts.
 *
 * Colours come from the data-viz reference palette: a fixed-order categorical
 * set (identity), a single-hue ordinal blue ramp for aged buckets (magnitude),
 * and theme-aware chrome (grid / axis / ink). Both light and dark are stepped
 * for their own surface — the dark column is not an automatic flip.
 */

// Categorical slots — assigned in fixed order, never cycled past slot 8.
const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

// Ordinal single-hue (blue) ramp for aged buckets 0-30 → 120+ (older = deeper).
const AGED_LIGHT = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281']
const AGED_DARK = ['#6da7ec', '#5598e7', '#3987e5', '#256abf', '#184f95']

export interface ChartTheme {
  dark: boolean
  reducedMotion: boolean
  categorical: string[]
  aged: string[]
  /** Categorical colour for series slot i (fixed order). */
  series: (i: number) => string
  grid: string
  tick: string
  axis: string
  surface: string
  text: string
  good: string
  bad: string
  primary: string
  cursorFill: string
  tooltipStyle: CSSProperties
}

export function useChartTheme(): ChartTheme {
  const dark = useUIStore((s) => s.theme) === 'dark'
  const reducedMotion = !!useReducedMotion()
  const categorical = dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
  const grid = dark ? '#2c2c2a' : '#e1e0d9'
  const surface = dark ? '#1a1a19' : '#fcfcfb'
  const text = dark ? '#ffffff' : '#0b0b0b'
  return {
    dark,
    reducedMotion,
    categorical,
    aged: dark ? AGED_DARK : AGED_LIGHT,
    series: (i: number) => categorical[i % categorical.length],
    grid,
    tick: '#898781',
    axis: dark ? '#383835' : '#c3c2b7',
    surface,
    text,
    good: dark ? '#0ca30c' : '#006300',
    bad: dark ? '#e66767' : '#e34948',
    primary: dark ? '#3987e5' : '#2a78d6',
    cursorFill: dark ? 'rgba(255,255,255,0.06)' : 'rgba(11,11,11,0.04)',
    tooltipStyle: {
      background: surface,
      border: `1px solid ${grid}`,
      borderRadius: 8,
      color: text,
      fontSize: 13,
    },
  }
}

/** Two-decimal money for tooltips. */
export const chartMoney = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Compact axis ticks: 12,500 → "12.5k", 3,200,000 → "3.2M". */
export const chartCompact = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
  return `${v}`
}
