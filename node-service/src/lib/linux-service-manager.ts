import {OSServiceInstallationOptions, OSServiceManager, OSServiceOptions, OSServiceStatus} from './os-service-manager';
import {exists, removeEmptyProperties, ScriptRunner} from './functions';
import {join} from 'path';
import {homedir} from 'os';
import * as Path from 'node:path';
import {mkdir, writeFile} from 'fs/promises';

export class LinuxServiceManager extends OSServiceManager {
  private paths: {
    root?: string;
    config?: string;
    logRoot?: string;
    log?: string;
    errorLog?: string;
  } = {};
  private command?: string;
  private commandArgs?: string[];
  private cwd?: string;

  get label(): string {
    return this.options!.slug;
  }

  override async initialize(options: OSServiceOptions) {
    await super.initialize(options);
    this.setPaths();
    await this.prepareLogging();
    await this.updateStatus();
  }

  async install(command: string, commandArgs: string[], options: OSServiceInstallationOptions) {
    this.command = Path.resolve(command);
    this.cwd = options.cwd;
    this.commandArgs = commandArgs;
    this._installationOptions = options;
    await this.prepareLogging();

    if (await this.isInstalled()) {
      throw new Error(`Can't install service. Service already exists. Unload it via launchctl unload or call manager.stop();`);
    }

    const configString = this.buildServiceFile(options);
    if (!await exists(this.paths.root)) {
      await mkdir(this.paths.root, {
        recursive: true
      });
    }
    const userCommand = this.options.level === 'system' ? '' : ' --user';

    const logFolderCreation = options.logging?.enabled ? `&& mkdir -p ${this.paths.logRoot} 2>/dev/null && chmod 745 ${this.paths.logRoot} && touch ${this.paths.log} 2>/dev/null && chmod 745 ${this.paths.log} && touch ${this.paths.errorLog} 2>/dev/null && chmod 745 ${this.paths.errorLog} ` : '';
    let script = `printf '${configString.replace(/'/g, '"').replace(/\n/g, '\\n')}' > "/tmp/${this.options.slug}.service" `;
    script += `${logFolderCreation}`;
    script += `&& mv -f "/tmp/${this.options.slug}.service" "${this.paths.config}" `;
    script += `&& systemctl${userCommand} daemon-reload && `;
    script += `systemctl${userCommand} enable ${this.options.slug}.service`;

    if (this.options.level === 'system') {
      await ScriptRunner.runAsAdmin(script, {
          name: this.options.name,
          icns: this.options.icns,
          headless: this.options.headless
        }
      );
    } else {
      await ScriptRunner.run(script);
    }

    await this.updateStatus();
  }

  async isInstalled(): Promise<boolean> {
    await this.updateStatus();
    return this._status !== OSServiceStatus.not_installed && this._status !== OSServiceStatus.unknown;
  }

  async start(): Promise<void> {
    const userCommand = this.options.level === 'system' ? '' : ' --user';
    const script = `systemctl${userCommand} start "${this.options.slug}"`;
    if (this.options.level === 'system') {
      await ScriptRunner.runAsAdmin(script, {
        name: this.options.name,
        headless: this.options.headless
      });
    } else {
      await ScriptRunner.run(script);
    }
    await this.updateStatus();
  }

  async updateStatus(): Promise<void> {
    try {
      const userCommand = this.options.level === 'system' ? '' : ' --user';
      const output = await ScriptRunner.run(`systemctl${userCommand} status ${this.options.slug}.service`);
      const matches = / *Active: *([^ (]+) \(([^(]+)\)/g.exec(output);

      if (matches && matches.length > 0) {
        switch (matches[1]) {
          case 'active':
            this._status = OSServiceStatus.running;
            break;
          case 'inactive':
            this._status = OSServiceStatus.stopped;
            break;
          case 'activating':
            this._status = OSServiceStatus.waiting;
            break;
          case 'failed':
            this._status = OSServiceStatus.failed;
            break;
        }
      }
    } catch (e) {
      if (/could not be found./g.exec(e)) {
        this._status = OSServiceStatus.not_installed;
      } else {
        throw new Error(e);
      }
    }
  }

  async stop(): Promise<void> {
    const userCommand = this.options.level === 'system' ? '' : ' --user';
    const script = `systemctl${userCommand} stop '${this.options.slug}'`;
    if (this.options.level === 'system') {
      await ScriptRunner.runAsAdmin(script
        , {
          name: this.options.name,
          headless: this.options.headless
        });
    } else {
      await ScriptRunner.run(script);
    }
    await this.updateStatus();
  }

  async uninstall(): Promise<void> {
    const userCommand = this.options.level === 'system' ? '' : ' --user';
    let removeScript = `systemctl${userCommand} stop ${this.options.slug} && systemctl${userCommand} disable ${this.options.slug} && rm -f '${this.paths.config}' && systemctl${userCommand} daemon-reload`;


    if (this._installationOptions?.logging?.enabled && this.paths.logRoot !== '/var/log/' && this.paths.logRoot !== join(homedir(), '/log/')) {
      removeScript += ` && rm -rf '${this.paths.logRoot}'`;
    }

    if (this.options.level === 'system') {
      await ScriptRunner.runAsAdmin(removeScript, {
        name: `Uninstallation of ${this.options.name}`,
        headless: this.options.headless
      });
    } else {
      await ScriptRunner.run(removeScript);
    }
    await this.updateStatus();
  }

  private buildServiceFile(options: OSServiceInstallationOptions): string {
    const command = `${this.command}${this.commandArgs ? ` ${this.commandArgs.join(' ')}` : ''}`;
    const configObject: {
      Unit: {
        Description: string;
        Before: string;
        After: string;
        StartLimitIntervalSec: number;
      },
      Service: {
        Type: string;
        Restart: string;
        RestartSec: number;
        StandardOutput?: string;
        StandardError?: string;
        User: string;
        WorkingDirectory: string;
        ExecStart: string;
      },
      Install: {
        WantedBy: string;
      }
    } = removeEmptyProperties({
      Unit: {
        Description: options.description,
        After: options.linux?.Unit?.After,
        Before: options.linux?.Unit?.Before,
        StartLimitIntervalSec: options.linux?.Unit?.StartLimitIntervalSync
      },
      Service: {
        Type: options.linux?.Service?.Type,
        Restart: options.linux?.Service?.Restart,
        RestartSec: options.linux?.Service?.RestartSec,
        StandardOutput: this.paths.log ? `file:${this.paths.log}` : undefined,
        StandardError: this.paths.errorLog ? `file:${this.paths.errorLog}` : undefined,
        User: options.linux?.Service?.User,
        WorkingDirectory: this.cwd,
        ExecStart: command
      },
      Install: {
        WantedBy: options.linux?.Install?.WantedBy
      }
    });

    let configString = ``;

    for (const attr of Object.keys(configObject)) {
      configString += `\n[${attr}]\n`;

      for (const key of Object.keys(configObject[attr])) {
        configString += `${key}=${configObject[attr][key]}\n`;
      }
    }

    return configString;
  }

  private setPaths() {
    this.paths.root = this.options.level === 'system' ? '/etc/systemd/system/' : join(homedir(), '.config/systemd/user/');
    this.paths.config = join(this.paths.root, `${this.options.slug}.service`);
  }

  private async prepareLogging() {
    if (this._installationOptions?.logging?.enabled) {
      this.paths.logRoot = this._installationOptions.logging?.outDir ?? (this.options.level === 'system' ? '/var/log/' : join(homedir(), 'log/')) + this.options.name.replace(/\s/g, '');
      this.paths.log = join(this.paths.logRoot,
        `${this.label}.log`
      );
      this.paths.errorLog = join(this.paths.logRoot,
        `${this.label}_error.log`
      );

      if (this.options.level === 'user') {
        if (!(await exists(this.paths.logRoot))) {
          await mkdir(this.paths.logRoot, {recursive: true});
          await ScriptRunner.run(
            `chmod 745 ${this.paths.logRoot}`
          );
        }
        if (!(await exists(this.paths.log))) {
          await writeFile(this.paths.log, '', {encoding: 'utf-8'});
          await ScriptRunner.run(
            `chmod 745 ${this.paths.log}`
          );
        }
        if (!(await exists(this.paths.errorLog))) {
          await writeFile(this.paths.errorLog, '', {encoding: 'utf-8'});
          await ScriptRunner.run(
            `chmod 745 ${this.paths.errorLog}`
          );
        }
      }
    }
  }
}
