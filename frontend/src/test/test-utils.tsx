import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom'
import type { ReactElement } from 'react'

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  routerProps?: MemoryRouterProps
}

function customRender(ui: ReactElement, options: CustomRenderOptions = {}) {
  const { routerProps, ...renderOptions } = options
  return render(ui, {
    wrapper: ({ children }) => <MemoryRouter {...routerProps}>{children}</MemoryRouter>,
    ...renderOptions,
  })
}

export * from '@testing-library/react'
export { customRender as render }
