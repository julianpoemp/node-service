import { OSServiceStatus } from './os-service-manager';
import { escapeServyEnvValue, parseScQueryState, WindowsServiceManager } from './windows-service-manager';

describe('windows', () => {
  const scQuery = (state: string) => `
SERVICE_NAME: ocb-service
        TYPE               : 10  WIN32_OWN_PROCESS
        STATE              : ${state}
        WIN32_EXIT_CODE    : 0  (0x0)
`;

  it('parseScQueryState maps the numeric state', () => {
    expect(parseScQueryState(scQuery('4  RUNNING'))).toBe(OSServiceStatus.running);
    expect(parseScQueryState(scQuery('1  STOPPED'))).toBe(OSServiceStatus.stopped);
    expect(parseScQueryState(scQuery('2  START_PENDING'))).toBe(OSServiceStatus.waiting);
    expect(parseScQueryState(scQuery('3  STOP_PENDING'))).toBe(OSServiceStatus.waiting);
    expect(parseScQueryState(scQuery('7  PAUSED'))).toBe(OSServiceStatus.stopped);
  });

  it('parseScQueryState returns unknown for unexpected output', () => {
    expect(parseScQueryState('')).toBe(OSServiceStatus.unknown);
    expect(parseScQueryState('[SC] OpenService FAILED 5:\n\nAccess is denied.')).toBe(OSServiceStatus.unknown);
  });

  it('escapeServyEnvValue escapes backslashes of named pipes and paths', () => {
    expect(escapeServyEnvValue('\\\\.\\pipe\\ocb_123')).toBe('\\\\\\\\.\\\\pipe\\\\ocb_123');
    expect(escapeServyEnvValue('C:\\data\\config.json')).toBe('C:\\\\data\\\\config.json');
    expect(escapeServyEnvValue('a=b;c"d')).toBe('a\\=b\\;c\\"d');
  });
});

describe('logger option', () => {
  it('receives the debug output instead of console.log', async () => {
    const messages: unknown[] = [];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const manager = new WindowsServiceManager();
    await manager.initialize({
      name: 'Test',
      slug: 'node-service-test-does-not-exist',
      level: 'user',
      debugging: true,
      logger: (message) => messages.push(message),
    });
    expect(messages.some((a) => `${a}`.startsWith('NODE-SERVICE DEBUG: servy only supports system services'))).toBe(true);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs nothing without debugging', async () => {
    const messages: unknown[] = [];
    const manager = new WindowsServiceManager();
    await manager.initialize({ name: 'Test', slug: 'x', level: 'user', logger: (message) => messages.push(message) });
    expect(messages).toEqual([]);
  });
});

describe('checkRequirements', () => {
  it("doesn't execute servy-cli, a missing configured path is reported", async () => {
    const manager = new WindowsServiceManager();
    await manager.initialize({
      name: 'Test',
      slug: 'x',
      level: 'system',
      windows: { pathToServyCliExe: '/does/not/exist/servy-cli.exe' },
    });
    await expect(manager.checkRequirements()).rejects.toThrow('servy-cli not found (/does/not/exist/servy-cli.exe)');
  });

  it('accepts an existing configured path without running it', async () => {
    const manager = new WindowsServiceManager();
    // any existing file - executing it would fail
    await manager.initialize({ name: 'Test', slug: 'x', level: 'system', windows: { pathToServyCliExe: __filename } });
    await expect(manager.checkRequirements()).resolves.toBeUndefined();
  });
});
