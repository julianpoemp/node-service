import {OSServiceInstallationOptions, OSServiceManager, OSServiceOptions, OSServiceStatus} from 'node-service';
import { ScriptRunner } from './functions';

// see https://learn.microsoft.com/de-de/windows-server/administration/windows-commands/sc-create

export class WindowsServiceManager extends OSServiceManager {
  override async initialize(options: OSServiceOptions) {
    await super.initialize(options);
  }

  async install(command: string, commandArgs: string[], options: OSServiceInstallationOptions): Promise<void> {
    const script = `sc.exe create ${this.options.slug} binpath= "${command}${commandArgs.length === 0 ? '' : ' ' + commandArgs.map(a => a.replace(/"/g, '\'')).join(' ')}" DisplayName= "${this.options.name}" start= auto type= share`;
    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name
    });
  }

  async uninstall(): Promise<void> {
    await ScriptRunner.runAsAdmin(`sc.exe delete ${this.options.slug}`, {
      name: this.options.name
    });
  }

  async start(): Promise<void> {
    await ScriptRunner.runAsAdmin(`sc.exe start ${this.options.slug}`, {
      name: this.options.name
    });
  }

  async stop(): Promise<void> {
    await ScriptRunner.runAsAdmin(`sc.exe stop ${this.options.slug}`, {
      name: this.options.name
    });
  }

  isInstalled(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  async updateStatus(): Promise<void> {
    try {

      const output = await ScriptRunner.run(`sc.exe query "${this.options.slug}"`);
      let matches = /\[SC] EnumQueryServicesStatus:OpenService[^0-9]+([0-9]+)/g.exec(output);
      if (matches && matches[1] === '1060') {
        this._status = OSServiceStatus.not_installed;
      } else {
        matches = /STATE\s*:\s[0-9]\s*(\w+)/g.exec(output);

        if (matches && matches.length > 0) {
          switch (matches[1]) {
            case 'RUNNING':
              this._status = OSServiceStatus.running;
              break;
            case 'STOPPED':
              this._status = OSServiceStatus.stopped;
              break;
            case 'WAITING':
              this._status = OSServiceStatus.waiting;
              break;
            default:
              this._status = OSServiceStatus.unknown;
          }
        }
      }
    } catch (e) {
      throw new Error(e);
    }
  }

}
