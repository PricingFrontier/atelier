import { http, HttpResponse } from 'msw'
import {
  mockProjectSummaries,
  mockProjectSummary,
  mockColumns,
  mockExplorationData,
  mockFitResult,
  mockModelSummary,
  mockDiagnosticsData,
  mockCoefTable,
} from '../fixtures'

export const handlers = [
  // ── Projects ────────────────────────────────────────────

  http.get('/api/projects', () => {
    return HttpResponse.json(mockProjectSummaries)
  }),

  http.post('/api/projects', async ({ request }) => {
    const body = (await request.json()) as { name?: string }
    return HttpResponse.json({
      id: 'proj-new',
      name: body?.name ?? 'New Project',
    })
  }),

  http.get('/api/projects/:id', ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      ...mockProjectSummary,
      id,
      config: {
        projectId: id,
        projectName: mockProjectSummary.name,
        response: 'claim_count',
        family: 'poisson',
        link: 'log',
        offset: 'exposure',
        weights: null,
        columns: mockColumns,
        datasetPath: '/data/motor_insurance.parquet',
        split: null,
      },
      terms: [
        { column: 'region', type: 'categorical', label: 'region' },
        { column: 'vehicle_age', type: 'bs', df: 5, label: 'vehicle_age (bs, df=5)' },
        { column: 'driver_age', type: 'ns', df: 3, label: 'driver_age (ns, df=3)' },
        { column: 'fuel_type', type: 'categorical', label: 'fuel_type' },
      ],
    })
  }),

  http.put('/api/projects/:id/config', () => {
    return HttpResponse.json({ status: 'ok' })
  }),

  http.delete('/api/projects/:id', () => {
    return HttpResponse.json({ status: 'ok' })
  }),

  // ── Datasets ────────────────────────────────────────────

  http.post('/api/datasets/upload', () => {
    return HttpResponse.json({
      path: '/data/motor_insurance.parquet',
      n_rows: 60000,
      n_cols: 12,
      columns: mockColumns,
    })
  }),

  http.post('/api/datasets/column-values', async ({ request }) => {
    const body = (await request.json()) as { column?: string }
    return HttpResponse.json({
      column: body?.column ?? 'region',
      values: ['Central', 'North', 'South', 'East', 'West', 'Rural'],
    })
  }),

  http.post('/api/datasets/validate', () => {
    return HttpResponse.json({
      errors: [],
      warnings: [],
    })
  }),

  // ── Fitting ─────────────────────────────────────────────

  http.post('/api/fit', () => {
    return HttpResponse.json(mockFitResult)
  }),

  // ── Exploration ─────────────────────────────────────────

  http.post('/api/explore', () => {
    return HttpResponse.json(mockExplorationData)
  }),

  // ── Models ──────────────────────────────────────────────

  http.post('/api/models/save', () => {
    return HttpResponse.json({
      id: 'model-new',
      version: 4,
    })
  }),

  http.get('/api/models/:projectId/history', () => {
    return HttpResponse.json(mockModelSummary)
  }),

  http.get('/api/models/detail/:modelId', ({ params }) => {
    const { modelId } = params
    const summary = mockModelSummary.find((m) => m.id === modelId) ?? mockModelSummary[0]
    return HttpResponse.json({
      ...summary,
      coef_table: mockCoefTable,
      diagnostics: mockDiagnosticsData,
      terms: [
        { column: 'region', type: 'categorical', label: 'region' },
        { column: 'vehicle_age', type: 'bs', df: 5, label: 'vehicle_age (bs, df=5)' },
        { column: 'driver_age', type: 'ns', df: 3, label: 'driver_age (ns, df=3)' },
        { column: 'fuel_type', type: 'categorical', label: 'fuel_type' },
      ],
      generated_code: 'import rustystats as rs\n# Generated model code...',
    })
  }),
]
