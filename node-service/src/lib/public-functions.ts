import {platform} from 'os';
import {MacOSServiceManager, OSServiceManager, OSServiceOptions} from 'node-service';

export async function createOSService(options: OSServiceOptions): Promise<OSServiceManager> {
  if (platform() === 'darwin') {
  const manager = new MacOSServiceManager();
  await manager.initialize(options);
  return manager;
}

throw new Error('Not implemented');
}
