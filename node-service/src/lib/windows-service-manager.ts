import { execFile } from 'node:child_process';
import { exists, ScriptRunner, ScriptRunnerError } from './functions';
import {
  OSServiceInstallationOptions,
  OSServiceManager,
  OSServiceOptions,
  OSServiceStatus,
} from './os-service-manager';

/**
 * minimum major version of servy-cli (documentation only, the version can't be read without admin privileges)
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

    if (options.level === 'user') {
      this.debug(`servy only supports system services on Windows. Level "user" is installed as system service.`);
    }
  }

  private get servyCLIExecPath() {
    return this.options.windows?.pathToServyCliExe ?? 'servy-cli';
  }

  private get getServiceName() {
    return this.options.slug;
  }

  /**
   * Checks if servy-cli exists. The result is cached.
   *
   * servy-cli isn't executed here: it creates a key in C:\\ProgramData\\Servy\\security on every start and fails
   * without administrator privileges, even for `servy-cli version`. It only runs in the elevated install/uninstall/
   * start/stop scripts.
   */
  async checkRequirements() {
    if (this.requirementsChecked) {
      return;
    }

    const configuredPath = this.options.windows?.pathToServyCliExe;
    const notFound = (details: string) =>
      new Error(
        `Node-Service Error: servy-cli not found (${details}). Make sure to have servy-cli v${SERVY_MIN_MAJOR_VERSION} or newer installed and referenced in the %PATH% environment variable or set the path to servy-cli.exe in options.windows.pathToServyCliExe. Download servy here: https://servy-win.github.io/`
      );

    if (configuredPath) {
      if (!(await exists(configuredPath))) {
        throw notFound(configuredPath);
      }
    } else {
      try {
        // where.exe only searches %PATH%, it doesn't start servy-cli
        await ScriptRunner.run('where servy-cli');
      } catch {
        throw notFound('not in %PATH%');
      }
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

    this.debug(script);

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
    this.debug(script);

    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name,
      headless: this.options.headless,
    });
    await this.updateStatus();
  }

  async start(): Promise<void> {
    await this.checkRequirements();
    const script = `"${this.servyCLIExecPath}" start -n "${this.getServiceName}" -q`;

    this.debug(script);

    await ScriptRunner.runAsAdmin(script, {
      name: this.options.name,
      headless: this.options.headless,
    });
    await this.updateStatus();
  }

  async stop(): Promise<void> {
    await this.checkRequirements();
    const script = `"${this.servyCLIExecPath}" stop -n "${this.getServiceName}" -q`;
    this.debug(script);

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
            this.debug(
              new ScriptRunnerError(`sc.exe query ${serviceName}`, typeof code === 'number' ? code : null, `${stdout}`, `${stderr}`)
                .message
            );

            resolve(OSServiceStatus.unknown);
            return;
          }
          resolve(parseScQueryState(`${stdout}`));
        }
      );
    });
  }
}
