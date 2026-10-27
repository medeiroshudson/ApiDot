import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseViewer, ResponseData } from './ResponseViewer';

describe('ResponseViewer', () => {
  beforeEach(() => {
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders empty/idle state when response is null and isLoading is false', () => {
    render(<ResponseViewer response={null} isLoading={false} />);
    expect(
      screen.getByText('Dispare uma requisição para visualizar a resposta')
    ).toBeInTheDocument();
  });

  describe('Loading State', () => {
    it('renders loading skeleton and spinner when isLoading is true', () => {
      render(<ResponseViewer response={null} isLoading={true} />);

      expect(screen.getByText('Enviando requisição...')).toBeInTheDocument();
      expect(screen.getByTestId('response-loading')).toBeInTheDocument();
      expect(
        screen.queryByText('Dispare uma requisição para visualizar a resposta')
      ).not.toBeInTheDocument();
    });

    it('renders loading state when isLoading is true even if response exists', () => {
      const response: ResponseData = {
        statusCode: 200,
        statusText: 'OK',
        durationMs: 120,
        body: '{"foo":"bar"}',
      };

      render(<ResponseViewer response={response} isLoading={true} />);

      expect(screen.getByText('Enviando requisição...')).toBeInTheDocument();
      expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument();
    });
  });

  describe('Status badges styling', () => {
    it('renders 1xx informational status badge with sky styling', () => {
      const response: ResponseData = {
        statusCode: 101,
        statusText: 'Switching Protocols',
        durationMs: 30,
        body: '',
      };

      render(<ResponseViewer response={response} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent('101 Switching Protocols');
      expect(badge.className).toMatch(/sky/);
      expect(badge.className).toContain('bg-sky-950');
      expect(badge.className).toContain('text-sky-400');
      expect(badge.className).toContain('border-sky-800');
    });

    it('renders 2xx success status badge with emerald styling', () => {
      const response: ResponseData = {
        statusCode: 200,
        statusText: 'OK',
        durationMs: 142,
        body: '{"message":"success"}',
      };

      render(<ResponseViewer response={response} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent('200 OK');
      expect(badge.className).toMatch(/emerald/);
    });

    it('renders 3xx redirect status badge with amber styling', () => {
      const response: ResponseData = {
        statusCode: 302,
        statusText: 'Found',
        durationMs: 45,
        body: '',
      };

      render(<ResponseViewer response={response} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent('302 Found');
      expect(badge.className).toMatch(/amber/);
    });

    it('renders 4xx client error status badge with rose styling', () => {
      const response: ResponseData = {
        statusCode: 404,
        statusText: 'Not Found',
        durationMs: 80,
        body: '{"error":"not found"}',
      };

      render(<ResponseViewer response={response} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent('404 Not Found');
      expect(badge.className).toMatch(/rose/);
    });

    it('renders 5xx server error status badge with rose styling', () => {
      const response: ResponseData = {
        statusCode: 500,
        statusText: 'Internal Server Error',
        durationMs: 310,
        body: '{"error":"crash"}',
      };

      render(<ResponseViewer response={response} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent('500 Internal Server Error');
      expect(badge.className).toMatch(/rose/);
    });

    it('renders network/system error badge when statusCode is 0 or errorMessage is present', () => {
      const response: ResponseData = {
        statusCode: 0,
        statusText: 'Network Error',
        errorMessage: 'Connection refused',
        durationMs: 12,
        body: '',
      };

      render(<ResponseViewer response={response} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent(/Error|Connection refused/i);
      expect(badge.className).toMatch(/rose/);
    });
  });

  describe('Size and Duration formatting', () => {
    it('formats duration and payload size in bytes and kilobytes', () => {
      const response: ResponseData = {
        statusCode: 200,
        statusText: 'OK',
        durationMs: 142,
        sizeBytes: 2048,
        body: '{"status":"ok"}',
      };

      render(<ResponseViewer response={response} />);
      expect(screen.getByText('142 ms')).toBeInTheDocument();
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    });

    it('calculates size from body string when sizeBytes is omitted', () => {
      const body = 'hello world'; // 11 bytes
      const response: ResponseData = {
        statusCode: 200,
        statusText: 'OK',
        durationMs: 50,
        body,
      };

      render(<ResponseViewer response={response} />);
      expect(screen.getByText('11 B')).toBeInTheDocument();
    });
  });

  describe('JSON Pretty Printing and CodeEditor Standardization', () => {
    it('pretty prints valid JSON payload in Pretty tab with CodeEditor', () => {
      const rawJson = '{"key":"value","num":42,"active":true}';
      const response: ResponseData = {
        statusCode: 200,
        statusText: 'OK',
        durationMs: 100,
        body: rawJson,
      };

      render(<ResponseViewer response={response} />);
      const prettyCode = screen.getByTestId('response-pretty-content');
      expect(prettyCode.querySelector('.cm-editor')).toBeInTheDocument();
      expect(prettyCode.textContent).toContain('"key": "value"');
      expect(prettyCode.textContent).toContain('"num": 42');
      expect(prettyCode.textContent).toContain('"active": true');
    });

    it('falls back to raw text if body is invalid JSON', () => {
      const plainText = 'Not a JSON object';
      const response: ResponseData = {
        statusCode: 200,
        statusText: 'OK',
        durationMs: 100,
        body: plainText,
      };

      render(<ResponseViewer response={response} />);
      const prettyCode = screen.getByTestId('response-pretty-content');
      expect(prettyCode.querySelector('.cm-editor')).toBeInTheDocument();
      expect(prettyCode.textContent).toContain('Not a JSON object');
    });
  });

  describe('Tabs and Keyboard Navigation (WAI-ARIA roving tabIndex)', () => {
    const mockResponse: ResponseData = {
      statusCode: 200,
      statusText: 'OK',
      durationMs: 150,
      body: '{\"message\":\"hello\"}',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-1234',
      },
      timing: {
        dnsLookupMs: 5,
        tlsHandshakeMs: 10,
        timeToFirstByteMs: 80,
        contentTransferMs: 20,
        totalDurationMs: 115,
      },
    };

    it('switches between Pretty, Raw, Headers, and Timings tabs on click and lazy-mounts panel content', () => {
      render(<ResponseViewer response={mockResponse} />);

      // Default tab is Pretty - pretty content is mounted, raw content is not mounted
      expect(screen.getByRole('tab', { name: /Pretty/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByTestId('response-pretty-content')).toBeInTheDocument();
      expect(screen.queryByTestId('response-raw-content')).not.toBeInTheDocument();

      // Switch to Raw tab
      fireEvent.click(screen.getByRole('tab', { name: /Raw/i }));
      expect(screen.getByRole('tab', { name: /Raw/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByTestId('response-raw-content')).toHaveTextContent(
        '{\"message\":\"hello\"}'
      );
      expect(screen.queryByTestId('response-pretty-content')).not.toBeInTheDocument();

      // Switch to Headers tab
      fireEvent.click(screen.getByRole('tab', { name: /Headers/i }));
      expect(screen.getByRole('tab', { name: /Headers/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByText('content-type')).toBeInTheDocument();
      expect(screen.getByText('application/json')).toBeInTheDocument();

      // Switch to Timings tab
      fireEvent.click(screen.getByRole('tab', { name: /Timings/i }));
      expect(screen.getByRole('tab', { name: /Timings/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByText('DNS Lookup')).toBeInTheDocument();
      expect(screen.getByText('80.0 ms')).toBeInTheDocument();
    });

    it('supports keyboard roving tabIndex navigation (ArrowRight, ArrowLeft, Home, End)', () => {
      render(<ResponseViewer response={mockResponse} />);

      const prettyTab = screen.getByRole('tab', { name: /Pretty/i });
      const rawTab = screen.getByRole('tab', { name: /Raw/i });
      const headersTab = screen.getByRole('tab', { name: /Headers/i });
      const timingsTab = screen.getByRole('tab', { name: /Timings/i });

      expect(prettyTab).toHaveAttribute('tabIndex', '0');
      expect(rawTab).toHaveAttribute('tabIndex', '-1');

      // ArrowRight from Pretty -> Raw
      fireEvent.keyDown(prettyTab, { key: 'ArrowRight' });
      expect(rawTab).toHaveAttribute('aria-selected', 'true');
      expect(rawTab).toHaveAttribute('tabIndex', '0');
      expect(prettyTab).toHaveAttribute('tabIndex', '-1');

      // ArrowRight from Raw -> Headers
      fireEvent.keyDown(rawTab, { key: 'ArrowRight' });
      expect(headersTab).toHaveAttribute('aria-selected', 'true');

      // End key -> Timings
      fireEvent.keyDown(headersTab, { key: 'End' });
      expect(timingsTab).toHaveAttribute('aria-selected', 'true');

      // Home key -> Pretty
      fireEvent.keyDown(timingsTab, { key: 'Home' });
      expect(prettyTab).toHaveAttribute('aria-selected', 'true');

      // ArrowLeft from Pretty -> Timings (circular wrap)
      fireEvent.keyDown(prettyTab, { key: 'ArrowLeft' });
      expect(timingsTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Copy Body Action with Dynamic A11y and Feedback', () => {
    it('copies response body to clipboard with dynamic aria-label and aria-live status update', async () => {
      const response: ResponseData = {
        statusCode: 200,
        statusText: 'OK',
        durationMs: 142,
        body: '{\"foo\":\"bar\"}',
      };

      render(<ResponseViewer response={response} />);

      const copyButton = screen.getByRole('button', {
        name: 'Copiar corpo da resposta',
      });
      expect(copyButton).toHaveAttribute('aria-label', 'Copiar corpo da resposta');

      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveTextContent('');

      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{\"foo\":\"bar\"}');
      expect(await screen.findByText('Copiado!')).toBeInTheDocument();

      // Dynamic aria-label on the copy button
      expect(copyButton).toHaveAttribute('aria-label', 'Corpo da resposta copiado');

      // sr-only aria-live polite announcement
      expect(liveRegion).toHaveTextContent(
        'Corpo da resposta copiado para a área de transferência'
      );
    });

    it('handles clipboard failure gracefully and provides error feedback in UI and aria-live', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      const response: ResponseData = {
        statusCode: 200,
        statusText: 'OK',
        durationMs: 142,
        body: '{\"foo\":\"bar\"}',
      };

      render(<ResponseViewer response={response} />);

      const copyButton = screen.getByRole('button', {
        name: 'Copiar corpo da resposta',
      });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('Falha ao copiar')).toBeInTheDocument();
      });

      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveTextContent('Falha ao copiar corpo da resposta');
    });
  });

  describe('cURL Export Action in ResponseViewer', () => {
    const mockResponse: ResponseData = {
      statusCode: 200,
      statusText: 'OK',
      durationMs: 142,
      body: '{"status":"success"}',
    };

    it('renders "Copiar cURL" button in top bar next to "Copiar" body button when response is present', () => {
      render(
        <ResponseViewer
          response={mockResponse}
          executedCurl="curl https://api.example.com"
        />
      );

      const copyCurlBtn = screen.getByRole('button', {
        name: 'Copiar cURL da requisição',
      });
      expect(copyCurlBtn).toBeInTheDocument();

      const copyBodyBtn = screen.getByRole('button', {
        name: 'Copiar corpo da resposta',
      });
      expect(copyCurlBtn.parentElement).toBe(copyBodyBtn.parentElement);
    });

    it('disables "Copiar cURL" button when executedCurl is not provided or is empty/whitespace', () => {
      const { rerender } = render(<ResponseViewer response={mockResponse} />);

      const copyCurlBtn = screen.getByRole('button', {
        name: 'Copiar cURL da requisição',
      });
      expect(copyCurlBtn).toBeDisabled();

      rerender(<ResponseViewer response={mockResponse} executedCurl="" />);
      expect(copyCurlBtn).toBeDisabled();

      rerender(<ResponseViewer response={mockResponse} executedCurl="   " />);
      expect(copyCurlBtn).toBeDisabled();
    });

    it('enables "Copiar cURL" button when executedCurl is passed with non-empty content', () => {
      render(
        <ResponseViewer
          response={mockResponse}
          executedCurl="curl -X GET 'https://api.example.com/items'"
        />
      );

      const copyCurlBtn = screen.getByRole('button', {
        name: 'Copiar cURL da requisição',
      });
      expect(copyCurlBtn).toBeEnabled();
    });

    it('clicking "Copiar cURL" calls navigator.clipboard.writeText with executedCurl and displays "Copiado!" feedback for 2000ms', async () => {
      vi.useFakeTimers();
      try {
        const curlCommand =
          "curl -X POST 'https://api.example.com/items' -H 'Content-Type: application/json' --data-raw '{\"name\":\"item1\"}'";

        render(
          <ResponseViewer
            response={mockResponse}
            executedCurl={curlCommand}
          />
        );

        const copyCurlBtn = screen.getByRole('button', {
          name: 'Copiar cURL da requisição',
        });
        expect(screen.queryByText('Copiado!')).toBeNull();
        expect(screen.getByText('Copiar cURL')).toBeInTheDocument();

        await act(async () => {
          fireEvent.click(copyCurlBtn);
        });

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(curlCommand);

        // Feedback in UI and dynamic ARIA label
        expect(copyCurlBtn).toHaveAttribute('aria-label', 'Comando cURL copiado');
        expect(screen.getByText('Copiado!')).toBeInTheDocument();

        // sr-only polite announcement
        const liveRegion = screen.getByRole('status');
        expect(liveRegion).toHaveTextContent(
          'Comando cURL copiado para a área de transferência'
        );

        // Advance timers by 2000ms
        await act(async () => {
          vi.advanceTimersByTime(2000);
        });

        // Reverts back to initial state
        expect(copyCurlBtn).toHaveAttribute('aria-label', 'Copiar cURL da requisição');
        expect(screen.getByText('Copiar cURL')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('handles clipboard failure gracefully without breaking UI or throwing errors', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Clipboard write rejected')),
        },
      });

      render(
        <ResponseViewer
          response={mockResponse}
          executedCurl="curl https://api.example.com"
        />
      );

      const copyCurlBtn = screen.getByRole('button', {
        name: 'Copiar cURL da requisição',
      });

      await act(async () => {
        fireEvent.click(copyCurlBtn);
      });

      expect(copyCurlBtn).toBeInTheDocument();
    });

    it('handles missing navigator.clipboard gracefully', async () => {
      const originalClipboard = navigator.clipboard;
      try {
        // @ts-expect-error simulating environment without clipboard
        delete navigator.clipboard;

        render(
          <ResponseViewer
            response={mockResponse}
            executedCurl="curl https://api.example.com"
          />
        );

        const copyCurlBtn = screen.getByRole('button', {
          name: 'Copiar cURL da requisição',
        });

        await act(async () => {
          fireEvent.click(copyCurlBtn);
        });

        expect(copyCurlBtn).toBeInTheDocument();
      } finally {
        Object.assign(navigator, { clipboard: originalClipboard });
      }
    });

    it('cleans up timeout timer on unmount', () => {
      vi.useFakeTimers();
      try {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        const { unmount } = render(
          <ResponseViewer
            response={mockResponse}
            executedCurl="curl https://api.example.com"
          />
        );

        const copyCurlBtn = screen.getByRole('button', {
          name: 'Copiar cURL da requisição',
        });

        act(() => {
          fireEvent.click(copyCurlBtn);
        });

        unmount();
        expect(clearTimeoutSpy).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
