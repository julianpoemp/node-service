import {OSServiceInstallationOptions, OSServiceManager, OSServiceOptions, OSServiceStatus} from './os-service-manager';
import {build, parse, PlistObject} from 'plist';
import {exists, removeEmptyProperties, ScriptRunner} from './functions';
import {join} from 'path';
import {homedir} from 'os';
import * as Path from 'node:path';
import {mkdir, readFile, writeFile} from 'fs/promises';

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
  private cwd?: string;
  private domain?: string;

  get label(): string {
    return this.options!.slug;
  }

  override async initialize(options: OSServiceOptions) {
    await super.initialize(options);
    this.domain = await this.getServiceDomain();
    this.setPaths();
    await this.readFromPlist();
    await this.prepareLogging();
    await this.updateStatus();
  }

  async install(command: string, commandArgs: string[], options: OSServiceInstallationOptions) {
    this.command = Path.resolve(command);
    this.commandArgs = commandArgs;
    this._installationOptions = options;
    await this.prepareLogging();

    if (await this.isInstalled()) {
      throw new Error(`Can't install service. Service already exists. Unload it via launchctl unload or call manager.stop();`);
    }

    const plist = this.buildPlist(options);

    if (this.options.level === 'system') {
      const logFolderCreation = options.logging?.enabled ? `mkdir -p ${this.paths.logRoot} 2>/dev/null && chmod 745 ${this.paths.logRoot} && touch ${this.paths.log} 2>/dev/null && chmod 745 ${this.paths.log} && touch ${this.paths.errorLog} 2>/dev/null && chmod 745 ${this.paths.errorLog} && ` : '';
      await ScriptRunner.runAsAdmin(`${logFolderCreation}printf '${plist.replace(/["']/g, '\\"').replace(/\n/g, '\\n')}' > "/tmp/${this.options.slug}.plist" && mv -f "/tmp/${this.options.slug}.plist" /Library/LaunchDaemons/${this.options.slug}.plist && launchctl load -w "${this.paths.plist}"`, {
          name: this.options.name,
          headless: this.options.headless
        }
      );
    } else {
      await ScriptRunner.run(`echo "${plist.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" > "${this.paths.plist}" && launchctl load -w "${this.paths.plist}"`);
    }

    await this.updateStatus();
  }

  async isInstalled(): Promise<boolean> {
    await this.updateStatus();
    return this._status !== OSServiceStatus.not_installed && this._status !== OSServiceStatus.unknown;
  }

  async start(): Promise<void> {
    if (this.options.level === 'system') {
      await ScriptRunner.runAsAdmin(`launchctl start "${this.options.slug}"`, {
        name: this.options.name,
        headless: this.options.headless
      });
    } else {
      await ScriptRunner.run(`launchctl start "${this.options.slug}"`);
    }
    await this.updateStatus();
  }

  async updateStatus(): Promise<void> {
    try {
      if (this.domain) {
        const output = await ScriptRunner.run(`launchctl print ${this.domain}/${this.label}`);
        const matches = /state\s*=\s*([^\n]+)/g.exec(output);

        if (matches && matches.length > 0) {
          switch (matches[1]) {
            case 'running':
              this._status = OSServiceStatus.running;
              break;
            case 'not running':
              this._status = OSServiceStatus.stopped;
              break;
            case 'waiting':
              this._status = OSServiceStatus.waiting;
              break;
          }
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
    if (this.options.level === 'system') {
      await ScriptRunner.runAsAdmin(`launchctl stop '${this.options.slug}'`
        , {
          name: this.options.name,
          headless: this.options.headless
        });
    } else {
      await ScriptRunner.run(
        `launchctl stop '${this.options.slug}'`
      );
    }
    await this.updateStatus();
  }

  async uninstall(): Promise<void> {
    let removeScript = `launchctl unload '${this.paths.plist}' && rm -rf '${this.paths.plist}'`;

    if (this._installationOptions?.logging?.enabled && this.paths.logRoot !== '/Library/Logs/' && this.paths.logRoot !== join(homedir(), '/Library/Logs/')) {
      removeScript += ` '${this.paths.logRoot}'`;
    }

    if (this.options.level === 'system') {
      await ScriptRunner.runAsAdmin(removeScript, {
        name:
          `Uninstallation of ${this.options.name}`,
        headless: this.options.headless

      });
    } else {
      await ScriptRunner.run(removeScript);
    }
    await this.updateStatus();
  }

  private buildPlist(options: OSServiceInstallationOptions): string {
    const plistValue: PlistObject = {
      'Label': this.label,
      'ProgramArguments': [
        this.command,
        ...this.commandArgs
      ],
      'StartInterval': options.macos?.startInterval,
      'KeepAlive': options.macos?.keepAlive,
      'RunAtLoad': true,
      'WorkingDirectory': options.cwd,
      'StandardOutPath': options.logging?.enabled ? this.paths.log : undefined,
      'StandardErrorPath': options.logging?.enabled ? this.paths.errorLog : undefined
    };
    return build(removeEmptyProperties(plistValue));
  }

  private setPaths() {
    this.paths.root = this.options.level === 'system' ? '/Library/LaunchDaemons/' : join(homedir(), '/Library/LaunchAgents/');
    this.paths.plist = join(this.paths.root,
      `${this.options.slug}.plist`
    );
  }

  private async prepareLogging() {
    if (this._installationOptions?.logging?.enabled) {
      this.paths.logRoot = this._installationOptions.logging?.outDir ?? (this.options.level === 'system' ? '/Library/Logs/' : join(homedir(), '/Library/Logs/')) + this.options.name.replace(/\s/g, '');
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

  async readFromPlist() {
    if (this.paths.plist && await exists(this.paths.plist)) {
      const plistContent = await readFile(this.paths.plist, {
        encoding: 'utf-8'
      });

      const plist = parse(plistContent) as PlistObject;
      this.cwd = plist['WorkingDirectory'] as string;
      this.paths.log = plist['StandardOutPath'] as string;
      this.paths.errorLog = plist['StandardErrorPath'] as string;
      this.command = plist['ProgramArguments'][0] as string;
      this.commandArgs = (plist['ProgramArguments'] as string[]).slice(1);

      this._installationOptions = this._installationOptions ?? {};
      this._installationOptions = {
        ...this._installationOptions,
        logging: {
          enabled: plist['StandardOutPath'] !== undefined && plist['StandardErrorPath'] !== undefined,
          outDir: plist['StandardOutPath'] !== undefined && plist['StandardErrorPath'] !== undefined ? Path.parse(plist['StandardOutPath'] as string).dir : undefined
        },
        macos: {
          ...this._installationOptions.macos,
          startInterval: plist['StartInterval'] as number,
          keepAlive: plist['KeepAlive'] as boolean,
        }
      }
    }
  }

  private async getUID() {
    return (await ScriptRunner.run('id -u')).replace(/[\n\r\s]/g, '');
  }

  private async getServiceDomain() {
    if (this.options.level === 'system') {
      return 'system';
    } else if (this.options.level === 'user') {
      return `gui/${await this.getUID()}`;
    }
  }
}
