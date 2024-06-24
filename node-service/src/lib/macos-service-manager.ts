import {OSServiceManager, OSServiceOptions, OSServiceStatus} from './os-service-manager';
import {exec} from 'sudo-prompt';
import {build, PlistObject} from 'plist';
import {removeEmptyProperties, ScriptRunner} from './functions';
import {dirname, join} from 'path';
import {homedir} from 'os';
import * as Path from 'node:path';

export class MacOSServiceManager extends OSServiceManager {
  private paths: {
    plist?: string;
    root?: string;
    logRoot?: string;
    log?: string;
    errorLog?: string;
  } = {};
  private command?: string;
  private commandArgs?: string[];

  get label(): string {
    return this.options?.macos?.label ?? this.options?.slug;
  }

  get cwd(): string {
    return this.options.cwd ?? (this.commandArgs && this.commandArgs.length > 0) ? dirname(this.commandArgs[0]) : '';
  }

  override async initialize(options: OSServiceOptions) {
    await super.initialize(options);
    this.setPaths();
    await this.prepareLogging();
  }

  install(command: string, commandArgs: string[]): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      this.command = Path.resolve(command);
      this.commandArgs = commandArgs;

      if (await this.isInstalled()) {
        reject(new Error(`Can't install service. Service already exists. Unload it via launchctl unload or call manager.stop();`));
        return;
      }

      const plist = this.buildPlist();

      exec(`echo -e "${plist.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" > "${this.paths.plist}" && launchctl load -w "${this.paths.plist}"`, {
          name: this.options.name
        },
        async (error, stdout, stderr) => {
          if (error) reject(error);
          else {
            await this.updateStatus();
            resolve();
          }
        }
      );
    })
  }

  async isInstalled(): Promise<boolean> {
    await this.updateStatus();
    return this._status !== OSServiceStatus.not_installed && this._status !== OSServiceStatus.unknown;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      exec(`launchctl load "${this.paths.plist}"`, {
        name: this.options.name
      }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve();
      })
    });
  }

  async updateStatus(): Promise<void> {
    try {
      const output = await ScriptRunner.run(`launchctl print system/${this.label}`);
      const matches = /state\s*=\s*([^\n]+)/g.exec(output);

      if (matches && matches.length > 0) {
        switch (matches[1]) {
          case 'running':
            this._status = OSServiceStatus.running;
            break;
          case 'stopped':
            this._status = OSServiceStatus.stopped;
            break;
          case 'waiting':
            this._status = OSServiceStatus.stopped;
            break;
          default:
            this._status = OSServiceStatus.unknown;
        }
      }
    } catch (e) {
      if (/Could not find service/g.exec(e)) {
        this._status = OSServiceStatus.not_installed;
      } else {
        throw new Error(e);
      }
    }
  }

  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      exec(`launchctl unload "${this.paths.plist}"`, {
        name: this.options.name
      }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve();
      })
    });
  }

  async uninstall(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let removeScript = `launchctl unload "${this.paths.plist}" && rm -rf "${this.paths.plist}"`;
      if (this.options.logging?.enabled && this.paths.logRoot !== '/Library/Logs/' && this.paths.logRoot !== join(homedir(), '/Library/Logs/')) removeScript += ` "${this.paths.logRoot}"`;

      exec(removeScript, {
        name: `Uninstallation of ${this.options.name}`
      }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve();
      })
    });
  }

  private buildPlist(): string {
    const plistValue: PlistObject = {
      'Label': this.label,
      'ProgramArguments': [
        this.command,
        ...this.commandArgs
      ],
      'StartInterval': this.options.macos?.startInterval,
      'KeepAlive': this.options.macos?.keepAlive,
      'RunAtLoad': true,
      'WorkingDirectory': this.cwd,
      'StandardOutPath': this.paths.log,
      'StandardErrorPath': this.paths.errorLog
    };
    return build(removeEmptyProperties(plistValue));
  }

  private setPaths() {
    this.paths.root = this.options.level === 'system' ? '/Library/LaunchDaemons/' : join(homedir(), '/Library/LaunchAgents/');
    this.paths.plist = join(this.paths.root, `${this.options.slug}.plist`);
  }

  private async prepareLogging() {
    if (this.options?.logging?.enabled) {
      this.paths.logRoot = this.options.logging?.outDir ?? (this.options.level === 'system' ? '/Library/Logs/' : join(homedir(), '/Library/Logs/')) + this.options.name;
      this.paths.log = join(this.paths.logRoot, `${this.label}.log`);
      this.paths.errorLog = join(this.paths.logRoot, `${this.label}_error.log`);
    }
  }
}
