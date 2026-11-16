import { OSServiceStatus } from './os-service-manager';
import { parseSystemctlState } from './linux-service-manager';

describe('linux', () => {
  it('parseSystemctlState', () => {
    expect(parseSystemctlState('     Active: active (running) since Mon 2026-11-16')).toBe(OSServiceStatus.running);
    expect(parseSystemctlState('     Active: inactive (dead)')).toBe(OSServiceStatus.stopped);
    expect(parseSystemctlState('     Active: activating (auto-restart) since')).toBe(OSServiceStatus.waiting);
    expect(parseSystemctlState('     Active: failed (Result: exit-code)')).toBe(OSServiceStatus.failed);
    expect(parseSystemctlState('Unit x.service could not be found.')).toBeUndefined();
  });
});
