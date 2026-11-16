import { OSServiceStatus } from './os-service-manager';
import { parseLaunchctlState } from './macos-service-manager';

describe('macos', () => {
  it('parseLaunchctlState', () => {
    expect(parseLaunchctlState('gui/501/x = {\n\tstate = running\n')).toBe(OSServiceStatus.running);
    expect(parseLaunchctlState('\tstate = not running\n')).toBe(OSServiceStatus.stopped);
    expect(parseLaunchctlState('\tstate = spawn scheduled\n')).toBe(OSServiceStatus.waiting);
    expect(parseLaunchctlState('Could not find service "x" in domain for user gui: 501')).toBeUndefined();
  });
});
