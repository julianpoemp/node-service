import { execFile } from 'node:child_process';
import { ScriptRunner, ScriptRunnerError } from './functions';
import {
  OSServiceInstallationOptions,
  OSServiceManager,
  OSServiceOptions,
  OSServiceStatus,
} from './os-service-manager';

/**
 * minimum major version of servy-cli
 */
const SERVY_MIN_MAJOR_VERSION = 8;
/**
 * ERROR_SERVICE_DOES_NOT_EXIST, exit code of `sc.exe query` for a missing service
 */
const SC_ERROR_SERVICE_DOES_NOT_EXIST = 1060;

/**
 * Maps the output of `sc.exe query <name>` to a service status. The numeric SERVICE_STATUS state is used because the
 * text after it is localized on some systems.
 */
export function parseScQueryState(output: string): OSServiceStatus {
  const state = /STATE\s*:\s*(\d+)/.exec(output)?.[1];
  switch (state) {
    case '1': // SERVICE_STOPPED
    case '7': // SERVICE_PAUSED
      return OSServiceStatus.stopped;
    case '2': // SERVICE_START_PENDING
    case '3': // SERVICE_STOP_PENDING
    case '5': // SERVICE_CONTINUE_PENDING
    case '6': // SERVICE_PAUSE_PENDING
      return OSServiceStatus.waiting;
    case '4': // SERVICE_RUNNING
      return OSServiceStatus.running;
    default:
      return OSServiceStatus.unknown;
  }
}

/**
 * Reads the version from the output of `servy-cli version`, e.g. "Servy.CLI 8.7.0".
 */
export function parseServyVersion(output: string): string | undefined {
  return /Servy\.CLI\s+v?(\d+(?:\.\d+)*)/i.exec(output)?.[1];
}

/**
 * Escapes a value for servy's `--envVars="KEY=value;KEY2=value2"`: `=`, `;`, `"` and `\` are escaped with a backslash.
 * Without escaping backslashes, Windows paths like named pipes (`\\.\pipe\name`) arrive broken in the service.
 */
export function escapeServyEnvValue(value: string): string {
  return `${value}`.replace(/([=";\\])/g, '\\$1');
}

export class WindowsServiceManager extends OSServiceManager {
  private requirementsChecked = false;

  override async initialize(options: OSServiceOptions) {
    // the status is read via sc.exe - servy-cli is only checked before commands that need it, so a status query
    // works without servy-cli and without administrator privileges
    await super.initialize(options);

    if (options.level === 'user' && options.debugging) {
      console.log(
        `NODE-SERVICE DEBUG: servy only supports system services on Windows. Level "user" is installed as system service.`
      );
    }
  }

  private get servyCLIExecPath() {
    return this.options.windows?.pathToServyCliExe ?? 'servy-cli';
  }

  private get getServiceName() {
    return this.options.slug;
  }

  /**
   * Checks if servy-cli (v8 or newer) can be executed. The result is cached.
   */
  async checkRequirements() {
    if (this.requirementsChecked) {
      return;
    }

    let output = '';
    try {
      output = await ScriptRunner.run(`"${this.servyCLIExecPath}" version`);
    } catch (e) {
      throw new Error(
        `Node-Service Error: Can't run servy-cli (${this.servyCLIExecPath}). Make sure to have servy-cli v${SERVY_MIN_MAJOR_VERSION} installed and referenced in the %PATH% environment variable or set the path to servy-cli.exe in options.windows.pathToServyCliExe. Download servy here: https://servy-win.github.io/\n${
          (e as Error)?.message ?? e
        }`
      );
    }

    const version = parseServyVersion(output);
    if (!version) {
      throw new Error(
        `Node-Service Error: Can't read the version of servy-cli. Make sure that you have servy-cli v${SERVY_MIN_MAJOR_VERSION} installed. Output: ${output}`
      );
    }

    if (parseInt(version.split('.')[0], 10) < SERVY_MIN_MAJOR_VERSION) {
      throw new Error(
        `Node-Service Error: servy-cli v${version} is too old. Install servy-cli v${SERVY_MIN_MAJOR_VERSION} or newer.`
      );
    }

    this.requirementsChecked = true;
  }

  async install(
    command: string,
    commandArgs: string[],
    options: OSServiceInstallationOptions
  ): Promise<void> {
    await this.checkRequirements();
    const envVars = [];
    if (options.env && Object.keys(options.env).length > 0) {
      for (const key of Object.keys(options.env)) {
        envVars.push(`${key}=${escapeServyEnvValue(options.env[key])}`);
      }
    }

    const installArgs = [
      `-n "${this.options.slug}"`,
      `-d "${options.description}"`,
      `-p "${command}"`,
      `-q`,
    ];

    if (this.options.debugging) {
      installArgs.push(`--debug`);
    }

    if (options.cwd) {
      installArgs.push(`--startupDir="${options.cwd}"`);
    }

    if (envVars.length > 0) {
      installArgs.push(`--envVars="${envVars.join(';')}"`);
    }

    if (commandArgs.length > 0) {
      installArgs.push(
        `--params="${commandArgs.join(' ').replace(/\\"/g, '\\"')}"`
      );
    }

    const script = `"${this.servyCLIExecPath}" install ${installArgs.join(' ')}`;

    if (this.options.debugging) {
      console.log(`NODE-SERVICE DEBUG: ${script}`);
    }
    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name,
      headless: this.options.headless,
    });
    await this.updateStatus();
  }

  async uninstall(): Promise<void> {
    await this.checkRequirements();
    // "&" instead of "&&": stopping an already stopped service fails, the uninstallation has to run anyway
    const script = `"${this.servyCLIExecPath}" stop -n "${this.getServiceName}" -q & "${this.servyCLIExecPath}" uninstall -n "${this.getServiceName}" -q`;
    if (this.options.debugging) {
      console.log(`NODE-SERVICE DEBUG: ${script}`);
    }

    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name,
      headless: this.options.headless,
    });
    await this.updateStatus();
  }

  async start(): Promise<void> {
    await this.checkRequirements();
    const script = `"${this.servyCLIExecPath}" start -n "${this.getServiceName}" -q`;

    if (this.options.debugging) {
      console.log(`NODE-SERVICE DEBUG: ${script}`);
    }
    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name,
      headless: this.options.headless,
    });
    await this.updateStatus();
  }

  async stop(): Promise<void> {
    await this.checkRequirements();
    const script = `"${this.servyCLIExecPath}" stop -n "${this.getServiceName}" -q`;
    if (this.options.debugging) {
      console.log(`NODE-SERVICE DEBUG: ${script}`);
    }
    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name,
      headless: this.options.headless,
    });
    await this.updateStatus();
  }

  async isInstalled(): Promise<boolean> {
    await this.updateStatus();
    return this._status !== OSServiceStatus.not_installed;
  }

  /**
   * Reads the status via `sc.exe query`. Works without administrator privileges and independent of the system
   * language. servy-cli isn't used because it doesn't report a missing service reliably.
   */
  async updateStatus(): Promise<void> {
    const serviceName = this.getServiceName;
    this._status = await new Promise<OSServiceStatus>((resolve) => {
      execFile(
        'sc.exe',
        ['query', serviceName],
        { windowsHide: true, timeout: 10000 },
        (error, stdout, stderr) => {
          const code = (error as any)?.code;
          if (code === SC_ERROR_SERVICE_DOES_NOT_EXIST) {
            resolve(OSServiceStatus.not_installed);
            return;
          }
          if (error) {
            if (this.options.debugging) {
              console.log(
                `NODE-SERVICE DEBUG: ${
                  new ScriptRunnerError(`sc.exe query ${serviceName}`, typeof code === 'number' ? code : null, `${stdout}`, `${stderr}`)
                    .message
                }`
              );
            }
            resolve(OSServiceStatus.unknown);
            return;
          }
          resolve(parseScQueryState(`${stdout}`));
        }
      );
    });
  }
}
