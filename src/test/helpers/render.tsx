import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  routerProps?: MemoryRouterProps;
}

export function renderWithProviders(
  ui: ReactElement,
  { routerProps, ...renderOptions }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <MemoryRouter {...routerProps}>{children}</MemoryRouter>
      </I18nextProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
