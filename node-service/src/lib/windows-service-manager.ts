import {exists, ScriptRunner} from './functions';
import {writeFile} from 'fs/promises';
import {OSServiceInstallationOptions, OSServiceManager, OSServiceOptions, OSServiceStatus} from './os-service-manager';
import * as Path from 'node:path';

export class WindowsServiceManager extends OSServiceManager {
  override async initialize(options: OSServiceOptions) {
    await super.initialize(options);
    await this.checkRequirements();
    await this.updateStatus();
  }

  private get winswExePath() {
    return this.options.windows?.pathToWinswExe ?? 'winsw';
  }

  async checkRequirements() {
    let version = '';
    try {
      version = await ScriptRunner.run(`${this.winswExePath} --version`);
    } catch (e) {
      throw new Error(`Node-Service Error: Can't find winsw.exe binary. Make sure to have winsw v3 installed and referenced to %PATH$ environment variable. Or set the path to winsw.exe in options.windows.winsw.path.`);
    }

    if (!version) {
      throw new Error(`Node-Service Error: Can't read version information. Make sure that you have winsw v3 installed.`);
    }

    if (!this.options?.windows.pathToWinswConfig) {
      throw new Error('Node-Service Error: You have to define a path to a (non)-existing winsw configuration file. Please check options.windows.pathToWinswConfig')
    }
  }

  async install(command: string, commandArgs: string[], options: OSServiceInstallationOptions): Promise<void> {
    if (!this.options.windows?.pathToWinswConfig) {
      throw new Error('Node-Service Error: Missing config path to winsw config.');
    }

    if (!await exists(this.options.windows?.pathToWinswConfig)) {
      // create new winsw.xml config file
      await writeFile(this.options.windows?.pathToWinswConfig, this.buildWinsXML(command, commandArgs, options), {
        encoding: 'utf-8'
      });
    }

    const configDir = Path.parse(this.options.windows?.pathToWinswConfig).dir;
    const configName = Path.parse(this.options.windows?.pathToWinswConfig).base;
    const script = `cd "${configDir}" && ${this.winswExePath} install ${configName}`;
    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name,
      headless: this.options.headless
    });
    await this.updateStatus();
  }

  async uninstall(): Promise<void> {
    if (!this.options.windows?.pathToWinswConfig) {
      throw new Error('Node-Service Error: Missing config path to winsw config.');
    }

    await ScriptRunner.runAsAdmin(`${this.winswExePath} stop "${this.options.windows?.pathToWinswConfig}" && ${this.winswExePath} uninstall "${this.options.windows?.pathToWinswConfig}"`, {
      name: this.options.name,
      headless: this.options.headless
    });
    await this.updateStatus();
  }

  async start(): Promise<void> {
    if (!this.options.windows?.pathToWinswConfig) {
      throw new Error('Node-Service Error: Missing config path to winsw config.');
    }

    await ScriptRunner.runAsAdmin(`${this.winswExePath} start ${this.options.windows?.pathToWinswConfig}`, {
      name: this.options.name,
      headless: this.options.headless
    });
    await this.updateStatus();
  }

  async stop(): Promise<void> {
    if (!this.options.windows?.pathToWinswConfig) {
      throw new Error('Node-Service Error: Missing config path to winsw config.');
    }

    await ScriptRunner.runAsAdmin(`${this.winswExePath} stop ${this.options.windows?.pathToWinswConfig}`, {
      name: this.options.name,
      headless: this.options.headless
    });
    await this.updateStatus();
  }

  async isInstalled(): Promise<boolean> {
    await this.updateStatus();
    return await exists(this.options?.windows.pathToWinswConfig) && this._status !== OSServiceStatus.not_installed;
  }

  async updateStatus(): Promise<void> {
    if (this.options.windows?.pathToWinswConfig) {
      if (!await exists(this.options.windows?.pathToWinswConfig)) {
        this._status = OSServiceStatus.not_installed;
        return;
      }

      const output = await ScriptRunner.run(`${this.winswExePath} status "${this.options.windows?.pathToWinswConfig}"`);
      const matches = /I?n?[aA]ctive \(([^)]+)\)/g.exec(output);
      if (matches && matches.length > 0) {
        switch (matches[1]) {
          case 'running':
            this._status = OSServiceStatus.running;
            break;
          case 'stopped':
            this._status = OSServiceStatus.stopped;
            break;
          case 'waiting':
            this._status = OSServiceStatus.waiting;
            break;
          default:
            this._status = OSServiceStatus.unknown;
        }
      } else if (output === 'NonExistent\n') {
        this._status = OSServiceStatus.not_installed;
      }
    } else {
      this._status = OSServiceStatus.not_installed;
    }
  }

  private buildWinsXML(command: string, commandArgs: string[], installationOptions: OSServiceInstallationOptions) {
    let winswFileContent = `<service>
  <id>${this.options.slug}</id>
  <name>${this.options.name}</name>
  <description>${installationOptions.description}</description>
  <executable>${command}</executable>
  <arguments>${commandArgs.join(' ')}</arguments>`

    if (installationOptions.cwd) {
      winswFileContent += `
  <workingdirectory>${installationOptions.cwd}</workingdirectory>`
    }

    if (installationOptions.env && Object.keys(installationOptions.env).length > 0) {
      for (const key of Object.keys(installationOptions.env)) {
        winswFileContent += `
  <env name="${key}" value="${installationOptions.env[key].replace(/"/g, '"')}" />`;
      }
    }

    if (installationOptions.logging?.enabled) {
      if (installationOptions.logging?.outDir) {
        winswFileContent += `
  <logpath>${installationOptions.logging?.outDir}</logpath>`;
      }
      winswFileContent += `
  <log mode="roll-by-size">
  <sizeThreshold>10240</sizeThreshold>
  <keepFiles>4</keepFiles>`

      winswFileContent += `
  </log>`
    } else {
      winswFileContent += `
  <log mode="none"></log>`
    }

    winswFileContent += `
</service>`

    return winswFileContent;
  }

}
