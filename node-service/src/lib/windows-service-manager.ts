// see https://learn.microsoft.com/de-de/windows-server/administration/windows-commands/sc-create

import {OSServiceManager, OSServiceOptions} from 'node-service';

export class WindowsServiceManager extends OSServiceManager {
  override async initialize(options: OSServiceOptions) {
    await super.initialize(options);
    // TODO continue here, develop on windows
  }

  install(command: string, commandArgs: string[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  uninstall(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  start(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  stop(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  isInstalled(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  updateStatus(): Promise<void> {
    throw new Error('Method not implemented.');
  }

}
