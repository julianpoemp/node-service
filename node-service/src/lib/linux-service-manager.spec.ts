import { OSServiceStatus } from './os-service-manager';
import { buildSystemdEnvironment, buildSystemdExecStart, parseSystemctlState } from './linux-service-manager';

describe('linux', () => {
  it('parseSystemctlState', () => {
    expect(parseSystemctlState('     Active: active (running) since Mon 2026-11-16')).toBe(OSServiceStatus.running);
    expect(parseSystemctlState('     Active: inactive (dead)')).toBe(OSServiceStatus.stopped);
    expect(parseSystemctlState('     Active: activating (auto-restart) since')).toBe(OSServiceStatus.waiting);
    expect(parseSystemctlState('     Active: failed (Result: exit-code)')).toBe(OSServiceStatus.failed);
    expect(parseSystemctlState('Unit x.service could not be found.')).toBeUndefined();
  });
});

describe('systemd quoting', () => {
  it('ExecStart keeps paths with spaces, quotes, % and $ as one argument', () => {
    expect(buildSystemdExecStart('/opt/my app/octra-cli', ['serve', '--name', 'a "b"', '50%', '$HOME'])).toBe(
      '"/opt/my app/octra-cli" "serve" "--name" "a \\"b\\"" "50%%" "$$HOME"'
    );
  });

  it('Environment escapes quotes, backslashes and specifiers', () => {
    expect(buildSystemdEnvironment('OCB_SOCKET_PATH', '/tmp/ocb socket')).toBe('Environment="OCB_SOCKET_PATH=/tmp/ocb socket"');
    expect(buildSystemdEnvironment('TOKEN', 'a"b\\c%d$e')).toBe('Environment="TOKEN=a\\"b\\\\c%%d$e"');
  });
});
