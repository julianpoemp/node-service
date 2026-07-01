import { ScriptRunner } from './functions';
import {
  OSServiceInstallationOptions,
  OSServiceManager,
  OSServiceOptions,
  OSServiceStatus
} from './os-service-manager';

export class WindowsServiceManager extends OSServiceManager {
  override async initialize(options: OSServiceOptions) {
    await super.initialize(options);
    await this.checkRequirements();
    await this.updateStatus();
  }

  private get servyCLIExecPath() {
    return this.options.windows?.pathToServyCliExe ?? 'servy-cli';
  }

  private get getServiceName() {
    return this.options.slug;
  }

  async checkRequirements() {
    let version = '';
    try {
      version = await ScriptRunner.run(`${this.servyCLIExecPath} version`);
      version = /Servy.CLI ([0-9]\.[0-9]\.[0-9])/g.exec(version)[1];
    } catch (e) {
      throw new Error(`Node-Service Error: Can't find servy-cli.exe binary. Make sure to have servy-cli v8 installed and referenced to %PATH$ environment variable. Or set the path to servy-cli.exe in options.windows.servyCLIExecPath. Download servy here: https://servy-win.github.io/`);
    }

    if (!version) {
      throw new Error(`Node-Service Error: Can't read version information. Make sure that you have servy-cli v8 installed.`);
    }
  }

  async install(command: string, commandArgs: string[], options: OSServiceInstallationOptions): Promise<void> {
    const envVars = [];
    if (options.env && Object.keys(options.env).length > 0) {
      for (const key of Object.keys(options.env)) {
        envVars.push(`${key}=${options.env[key].replace(/([=";])/g, '\\$1')}`);
      }
    }

    const installArgs = [
      `-n "${this.options.slug}"`,
      `-d "${options.description}"`,
      `-p "${command}"`,
      `-q`
    ];

    if (options.debugging) {
      installArgs.push(`--debug`);
    }

    if (options.cwd) {
      installArgs.push(`--startupDir="${options.cwd}"`);
    }

    if (envVars.length > 0) {
      installArgs.push(
        `--envVars="${envVars.join(';')}"`);
    }

    if (commandArgs.length > 0) {
      installArgs.push(`--params="${commandArgs.join(' ').replace(/\\"/g, '\\"')}"`);
    }

    const script = `${this.servyCLIExecPath} install ${installArgs.join(' ')}`;
    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name,
      headless: this.options.headless
    });
    await this.updateStatus();
  }

  async uninstall(): Promise<void> {
    await ScriptRunner.runAsAdmin(`${this.servyCLIExecPath} stop -n ${this.getServiceName} -q && ${this.servyCLIExecPath} uninstall -n ${this.getServiceName} -q`, {
      name: this.options.name,
      headless: this.options.headless
    });
    await this.updateStatus();
  }

  async start(): Promise<void> {
    await ScriptRunner.runAsAdmin(`${this.servyCLIExecPath} start -n ${this.getServiceName} -q`, {
      name: this.options.name,
      headless: this.options.headless
    });
    await this.updateStatus();
  }

  async stop(): Promise<void> {
    await ScriptRunner.runAsAdmin(`${this.servyCLIExecPath} stop -n ${this.getServiceName} -q`, {
      name: this.options.name,
      headless: this.options.headless
    });
    await this.updateStatus();
  }

  async isInstalled(): Promise<boolean> {
    await this.updateStatus();
    return this._status !== OSServiceStatus.not_installed;
  }

  async updateStatus(): Promise<void> {
    let output = "";

    try {
      output = await ScriptRunner.run(`${this.servyCLIExecPath} status -n ${this.getServiceName} -q`);
    } catch (e) {
      output = e;

      if (output.indexOf(" was not found on computer") > -1) {
        this._status = OSServiceStatus.not_installed;
        return;
      }

      process.exit(1);
    }

    const matches = /Service status for '[^']+': (\w+)/g.exec(output);

    if (matches && matches.length > 0) {
      switch (matches[1]) {
        case 'Running':
          this._status = OSServiceStatus.running;
          break;
        case 'Stopped':
          this._status = OSServiceStatus.stopped;
          break;
        case 'Start Pending':
          this._status = OSServiceStatus.waiting;
          break;
        default:
          this._status = OSServiceStatus.unknown;
      }
    }
  }

}
