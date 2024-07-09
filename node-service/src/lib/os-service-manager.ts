export interface OSServiceOptions {
  name: string;
  slug: string;
  level: 'system' | 'user';
  windows?: WindowsOSServiceOptions;
}

export interface OSServiceInstallationOptions {
  description?: string;
  cwd?: string;
  env?: Record<string, any>;
  logging?: {
    enabled: boolean;
    outDir?: string;
  }
  macos?: MacOSServiceOptions;
}

export interface MacOSServiceOptions {
  label: string;
  startInterval?: number;
  keepAlive?: boolean;
}

export interface WindowsOSServiceOptions {
  pathToWinswExe?: string;
  pathToWinswConfig?: string;
}

export enum OSServiceStatus {
  'not_installed' = 'not_installed',
  'installing' = 'installing',
  'unknown' = 'unknown',
  'waiting' = 'waiting',
  'running' = 'running',
  'stopped' = 'stopped'
}

export abstract class OSServiceManager {
  get installationOptions(): OSServiceInstallationOptions {
    return this._installationOptions;
  }

  get status(): OSServiceStatus {
    return this._status;
  }

  protected options?: OSServiceOptions;
  protected _status = OSServiceStatus.not_installed;
  protected _installationOptions?: OSServiceInstallationOptions;

  public async initialize(options: OSServiceOptions) {
    this.options = options;
    await this.updateStatus();
  }

  abstract install(command: string, commandArgs: string[], options: OSServiceInstallationOptions): Promise<void>;

  abstract uninstall(): Promise<void>;

  abstract start(): Promise<void>;

  abstract stop(): Promise<void>;

  abstract isInstalled(): Promise<boolean>;

  abstract updateStatus(): Promise<void>;
}
