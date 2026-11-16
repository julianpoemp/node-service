import {
  OSServiceInstallationOptions,
  OSServiceManager,
  OSServiceOptions,
  OSServiceStatus,
} from './os-service-manager';
import { exists, removeEmptyProperties, ScriptRunner, ScriptRunnerError, shellQuote, writeTempFile, buildLogFolderCommands } from './functions';
import { join } from 'path';
import { homedir } from 'os';
import * as Path from 'node:path';
import { mkdir, writeFile } from 'fs/promises';

/**
 * Maps the output of `systemctl status <name>.service` to a service status.
 * @returns undefined if the output contains no known state
 */
export function parseSystemctlState(output: string): OSServiceStatus | undefined {
  const state = / *Active: *([^ (]+) \(([^(]+)\)/.exec(output)?.[1];
  switch (state) {
    case 'active':
      return OSServiceStatus.running;
    case 'inactive':
      return OSServiceStatus.stopped;
    case 'activating':
    case 'deactivating':
    case 'reloading':
      return OSServiceStatus.waiting;
    case 'failed':
      return OSServiceStatus.failed;
    default:
      return undefined;
  }
}

/**
 * Escapes systemd specifiers (`%n`, `%h`, …) in a unit file value.
 */
export function escapeSystemdSpecifiers(value: string): string {
  return `${value}`.replace(/%/g, '%%');
}

/**
 * Quotes one word of ExecStart: paths and arguments with spaces, quotes, backslashes, `%` or `$` stay one argument
 * and arrive unchanged (systemd would otherwise expand specifiers and environment variables).
 */
export function quoteSystemdExecArg(value: string): string {
  const escaped = escapeSystemdSpecifiers(`${value}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')).replace(/\$/g, '$$$$');
  return `"${escaped}"`;
}

export function buildSystemdExecStart(command: string, args: string[]): string {
  return [command, ...args].map(quoteSystemdExecArg).join(' ');
}

/**
 * `Environment="KEY=value"` with quotes, backslashes and specifiers escaped. Environment= doesn't expand `$`.
 */
export function buildSystemdEnvironment(key: string, value: unknown): string {
  const escaped = escapeSystemdSpecifiers(`${key}=${value}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
  return `Environment="${escaped}"`;
}

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

  async install(
    command: string,
    commandArgs: string[],
    options: OSServiceInstallationOptions
  ) {
    this.command = Path.resolve(command);
    this.cwd = options.cwd;
    this.commandArgs = commandArgs;
    this._installationOptions = options;
    await this.prepareLogging();

    if (await this.isInstalled()) {
      throw new Error(
        `Node-Service Error: Can't install service. Service already exists. Remove it via systemctl disable or call manager.uninstall();`
      );
    }

    const configString = this.buildServiceFile(options);
    if (!(await exists(this.paths.root))) {
      await mkdir(this.paths.root, {
        recursive: true,
      });
    }
    const userCommand = this.options.level === 'system' ? '' : ' --user';

    // the unit file is written as is and copied by the script - no shell escaping of its content
    const unitFile = await writeTempFile(`${this.options.slug}.service`, configString);
    try {
      const commands = [];
      if (options.logging?.enabled) {
        commands.push(...buildLogFolderCommands(this.paths.logRoot, this.paths.log, this.paths.errorLog));
      }
      commands.push(
        `install -m 644 ${shellQuote(unitFile.path)} ${shellQuote(this.paths.config)}`,
        `systemctl${userCommand} daemon-reload`,
        `systemctl${userCommand} enable ${shellQuote(`${this.options.slug}.service`)}`
      );
      const script = commands.join(' && ');

      if (this.options.level === 'system') {
        this.debug(`RUN AS ADMIN`);
        this.debug(script);

        await ScriptRunner.runAsAdmin(script, {
          name: this.options.name,
          icns: this.options.icns,
          headless: this.options.headless,
        });
      } else {
        this.debug(`RUN`);
        this.debug(script);

        await ScriptRunner.run(script);
      }
    } finally {
      await unitFile.cleanup();
    }

    await this.updateStatus();
  }

  async isInstalled(): Promise<boolean> {
    await this.updateStatus();
    return (
      this._status !== OSServiceStatus.not_installed &&
      this._status !== OSServiceStatus.unknown
    );
  }

  async start(): Promise<void> {
    const userCommand = this.options.level === 'system' ? '' : ' --user';
    const script = `systemctl${userCommand} start "${this.options.slug}"`;
    if (this.options.level === 'system') {
      this.debug(`RUN AS ADMIN`);
      this.debug(script);

      await ScriptRunner.runAsAdmin(script, {
        name: this.options.name,
        headless: this.options.headless,
      });
    } else {
      this.debug(`RUN`);
      this.debug(script);

      await ScriptRunner.run(script);
    }
    await this.updateStatus();
  }

  async updateStatus(): Promise<void> {
    const userCommand = this.options.level === 'system' ? '' : ' --user';
    const command = `systemctl${userCommand} status ${this.options.slug}.service`;
    // systemctl status exits with 3 for inactive and 4 for unknown units
    const result = await ScriptRunner.exec(command);
    const status = parseSystemctlState(result.stdout);

    if (status) {
      this._status = status;
    } else if (/could not be found/.test(`${result.stdout}\n${result.stderr}`)) {
      this._status = OSServiceStatus.not_installed;
    } else if (result.code !== 0) {
      throw new ScriptRunnerError(command, result.code, result.stdout, result.stderr);
    }
  }

  async stop(): Promise<void> {
    const userCommand = this.options.level === 'system' ? '' : ' --user';
    const script = `systemctl${userCommand} stop '${this.options.slug}'`;
    if (this.options.level === 'system') {
      this.debug(`RUN AS ADMIN`);
      this.debug(script);

      await ScriptRunner.runAsAdmin(script, {
        name: this.options.name,
        headless: this.options.headless,
      });
    } else {
      this.debug(`RUN`);
      this.debug(script);

      await ScriptRunner.run(script);
    }
    await this.updateStatus();
  }

  async uninstall(): Promise<void> {
    const userCommand = this.options.level === 'system' ? '' : ' --user';
    let removeScript = `systemctl${userCommand} stop ${this.options.slug} && systemctl${userCommand} disable ${this.options.slug} && rm -f '${this.paths.config}' && systemctl${userCommand} daemon-reload`;

    if (
      this._installationOptions?.logging?.enabled &&
      this.paths.logRoot !== '/var/log/' &&
      this.paths.logRoot !== join(homedir(), '/log/')
    ) {
      removeScript += ` && rm -rf '${this.paths.logRoot}'`;
    }

    if (this.options.level === 'system') {
      this.debug(`RUN AS ADMIN`);
      this.debug(removeScript);

      await ScriptRunner.runAsAdmin(removeScript, {
        name: `Uninstallation of ${this.options.name}`,
        headless: this.options.headless,
      });
    } else {
      this.debug(`RUN`);
      this.debug(removeScript);

      await ScriptRunner.run(removeScript);
    }
    await this.updateStatus();
  }

  private buildServiceFile(options: OSServiceInstallationOptions): string {
    const command = buildSystemdExecStart(this.command, this.commandArgs ?? []);
    const configObject: {
      Unit: {
        Description: string;
        Before: string;
        After: string;
        StartLimitIntervalSec: number;
      };
      Service: {
        Type: string;
        Restart: string;
        RestartSec: number;
        StandardOutput?: string;
        StandardError?: string;
        User: string;
        WorkingDirectory: string;
        ExecStart: string;
      };
      Install: {
        WantedBy: string;
      };
    } = removeEmptyProperties({
      Unit: {
        Description: options.description,
        After: options.linux?.Unit?.After,
        Before: options.linux?.Unit?.Before,
        StartLimitIntervalSec: options.linux?.Unit?.StartLimitIntervalSync,
      },
      Service: {
        Type: options.linux?.Service?.Type,
        Restart: options.linux?.Service?.Restart,
        RestartSec: options.linux?.Service?.RestartSec,
        StandardOutput: this.paths.log
          ? `file:${escapeSystemdSpecifiers(this.paths.log)}`
          : undefined,
        StandardError: this.paths.errorLog
          ? `file:${escapeSystemdSpecifiers(this.paths.errorLog)}`
          : undefined,
        User: options.linux?.Service?.User,
        WorkingDirectory: this.cwd ? escapeSystemdSpecifiers(this.cwd) : undefined,
        ExecStart: command,
      },
      Install: {
        WantedBy: options.linux?.Install?.WantedBy,
      },
    });

    this.debug(`Build service file from object:`);
    this.debug(JSON.stringify(configObject, null, 2));

    let configString = ``;

    for (const attr of Object.keys(configObject)) {
      configString += `\n[${attr}]\n`;

      for (const key of Object.keys(configObject[attr])) {
        configString += `${key}=${configObject[attr][key]}\n`;

        if (key === 'ExecStart' && options.env) {
          for (const envKey of Object.keys(options.env)) {
            configString += `${buildSystemdEnvironment(envKey, options.env[envKey])}\n`;
          }
        }
      }
    }

    return configString;
  }

  private setPaths() {
    this.paths.root =
      this.options.level === 'system'
        ? '/etc/systemd/system/'
        : join(homedir(), '.config/systemd/user/');
    this.paths.config = join(this.paths.root, `${this.options.slug}.service`);
  }

  private async prepareLogging() {
    if (this._installationOptions?.logging?.enabled) {
      this.paths.logRoot =
        this._installationOptions.logging?.outDir ??
        (this.options.level === 'system'
          ? '/var/log/'
          : join(homedir(), 'log/')) + this.options.name.replace(/\s/g, '');
      this.paths.log = join(this.paths.logRoot, `${this.label}.log`);
      this.paths.errorLog = join(this.paths.logRoot, `${this.label}_error.log`);

      if (this.options.level === 'user') {
        if (!(await exists(this.paths.logRoot))) {
          await mkdir(this.paths.logRoot, { recursive: true });
          await ScriptRunner.run(`chmod 745 ${this.paths.logRoot}`);
        }
        if (!(await exists(this.paths.log))) {
          await writeFile(this.paths.log, '', { encoding: 'utf-8' });
          await ScriptRunner.run(`chmod 745 ${this.paths.log}`);
        }
        if (!(await exists(this.paths.errorLog))) {
          await writeFile(this.paths.errorLog, '', { encoding: 'utf-8' });
          await ScriptRunner.run(`chmod 745 ${this.paths.errorLog}`);
        }
      }
    }
  }
}
