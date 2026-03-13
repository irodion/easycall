import { describe, it, expect } from 'vitest';
import { screen, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { MockJitsiMeetExternalAPI } from '@/test/mocks/jitsi';
import type { JitsiMeetExternalAPI } from '@/types/jitsi';
import { ConnectionIndicator } from './ConnectionIndicator';

function createApi(): MockJitsiMeetExternalAPI {
  return new MockJitsiMeetExternalAPI('8x8.vc', { roomName: 'test-room' });
}

describe('ConnectionIndicator', () => {
  it('renders green indicator by default', () => {
    const api = createApi();
    renderWithProviders(<ConnectionIndicator api={api as unknown as JitsiMeetExternalAPI} />);
    expect(screen.getByText(/good connection/i)).toBeInTheDocument();
  });

  it('shows red indicator for poor quality (< 40)', async () => {
    const api = createApi();
    renderWithProviders(<ConnectionIndicator api={api as unknown as JitsiMeetExternalAPI} />);
    act(() => {
      api._emit('connectionQuality', { connectionQuality: 30 });
    });
    expect(screen.getByText(/poor connection/i)).toBeInTheDocument();
  });

  it('shows yellow indicator for fair quality (40-70)', async () => {
    const api = createApi();
    renderWithProviders(<ConnectionIndicator api={api as unknown as JitsiMeetExternalAPI} />);
    act(() => {
      api._emit('connectionQuality', { connectionQuality: 60 });
    });
    expect(screen.getByText(/fair connection/i)).toBeInTheDocument();
  });

  it('shows green indicator for good quality (> 70)', async () => {
    const api = createApi();
    renderWithProviders(<ConnectionIndicator api={api as unknown as JitsiMeetExternalAPI} />);
    act(() => {
      api._emit('connectionQuality', { connectionQuality: 80 });
    });
    expect(screen.getByText(/good connection/i)).toBeInTheDocument();
  });

  it('calls setVideoQuality when quality drops below 40', async () => {
    const api = createApi();
    renderWithProviders(<ConnectionIndicator api={api as unknown as JitsiMeetExternalAPI} />);
    act(() => {
      api._emit('connectionQuality', { connectionQuality: 25 });
    });
    const cmds = api.getExecutedCommands();
    expect(cmds.some((c) => c.command === 'setVideoQuality')).toBe(true);
    const videoQualityCmd = cmds.find((c) => c.command === 'setVideoQuality');
    expect(videoQualityCmd?.args[0]).toBe(180);
  });

  it('only calls setVideoQuality once for consecutive poor quality events', async () => {
    const api = createApi();
    renderWithProviders(<ConnectionIndicator api={api as unknown as JitsiMeetExternalAPI} />);
    act(() => {
      api._emit('connectionQuality', { connectionQuality: 25 });
      api._emit('connectionQuality', { connectionQuality: 15 });
      api._emit('connectionQuality', { connectionQuality: 10 });
    });
    const cmds = api.getExecutedCommands().filter((c) => c.command === 'setVideoQuality');
    expect(cmds).toHaveLength(1);
  });

  it('shows degraded toast on poor quality', async () => {
    const api = createApi();
    renderWithProviders(<ConnectionIndicator api={api as unknown as JitsiMeetExternalAPI} />);
    act(() => {
      api._emit('connectionQuality', { connectionQuality: 25 });
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('passes vitest-axe', async () => {
    const api = createApi();
    const { container } = renderWithProviders(
      <ConnectionIndicator api={api as unknown as JitsiMeetExternalAPI} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
