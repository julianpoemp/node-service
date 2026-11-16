import { OSServiceStatus } from './os-service-manager';
import { escapeServyEnvValue, parseScQueryState, parseServyVersion, WindowsServiceManager } from './windows-service-manager';

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

  it('parseServyVersion', () => {
    expect(parseServyVersion('Servy.CLI 8.7.0')).toBe('8.7.0');
    expect(parseServyVersion('Servy.CLI 8.10.1\r\n')).toBe('8.10.1');
    expect(parseServyVersion('Servy.CLI v8.7')).toBe('8.7');
    expect(parseServyVersion('something else')).toBeUndefined();
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
