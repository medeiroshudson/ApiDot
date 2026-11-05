import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DesktopSuccessPage from './page';
import { useI18nStore } from '@/stores/useI18nStore';

describe('DesktopSuccessPage (/auth/desktop-success)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18nStore.setState({ locale: 'en-US' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders authentication success message and open desktop button in en-US and pt-BR', () => {
    // en-US check
    useI18nStore.setState({ locale: 'en-US' });
    const { unmount } = render(<DesktopSuccessPage />);

    expect(screen.getByText(/Authentication Successful/i)).toBeInTheDocument();
    expect(
      screen.getByText(/You have successfully signed in\. You can now close this tab and return to ApiDot Desktop\./i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open ApiDot Desktop/i })).toBeInTheDocument();

    unmount();

    // pt-BR check
    useI18nStore.setState({ locale: 'pt-BR' });
    render(<DesktopSuccessPage />);

    expect(screen.getByText(/Autenticação Concluída com Sucesso/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Você foi autenticado com sucesso\. Você já pode fechar esta aba e voltar ao ApiDot Desktop\./i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir o ApiDot Desktop/i })).toBeInTheDocument();
  });

  it('renders ApiDot branding and visual elements', () => {
    render(<DesktopSuccessPage />);

    expect(screen.getByRole('img', { name: /ApiDot/i })).toBeInTheDocument();
    expect(screen.getByText('ApiDot')).toBeInTheDocument();
  });

  it('attempts to close window when action button is clicked', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    render(<DesktopSuccessPage />);
    const button = screen.getByRole('button', { name: /Open ApiDot Desktop/i });
    fireEvent.click(button);

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
