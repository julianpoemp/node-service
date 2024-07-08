import {platform} from 'os';
import {MacOSServiceManager, OSServiceInstallationOptions, OSServiceManager, OSServiceOptions} from 'node-service';
import {WindowsServiceManager} from './windows-service-manager';

export async function initializeOSService(options: OSServiceOptions): Promise<OSServiceManager> {
  if (platform() === 'darwin') {
    const manager = new MacOSServiceManager();
    await manager.initialize(options);
    return manager;
  } else if (platform() === 'win32') {
    const manager = new WindowsServiceManager();
    await manager.initialize(options);
    return manager;
  }

  throw new Error('Not implemented');
}
