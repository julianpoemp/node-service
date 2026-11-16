import { ChildProcess, exec } from 'child_process';
import * as SudoPrompt from '@vscode/sudo-prompt';
import * as fs from 'fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';

/**
 * removes all empty values from an given object.
 * @param obj
 * @param options
 */
export function removeEmptyProperties<T>(
  obj: T,
  options: {
    removeEmptyStrings?: boolean;
    removeNull?: boolean;
    removeUndefined?: boolean;
  } = {
    removeEmptyStrings: true,
    removeNull: true,
    removeUndefined: true,
  }
): T {
  if (Array.isArray(obj)) {
    const filtered = obj.filter(
      (a) =>
        (!options.removeUndefined || a !== undefined) &&
        (!options.removeNull || a !== null) &&
        (!options.removeEmptyStrings ||
          typeof a !== 'string' ||
          a.trim() !== '')
    );
    return filtered.map((a) => removeEmptyProperties<T>(a, options)) as T;
  } else {
    if (typeof obj === 'object') {
      const anyObj = obj as any;
      const keys = Object.keys(anyObj ?? {});

      for (const key of keys) {
        if (
          (options.removeNull && anyObj[key] === null) ||
          (options.removeUndefined && anyObj[key] === undefined) ||
          (anyObj[key] !== undefined &&
            anyObj[key] !== null &&
            anyObj[key].toString() === 'NaN') ||
          (options.removeEmptyStrings &&
            typeof anyObj[key] === 'string' &&
            anyObj[key].toString().trim() === '')
        ) {
          delete anyObj[key];
        } else if (typeof anyObj[key] === 'object') {
          anyObj[key] = removeEmptyProperties(anyObj[key], options);
        }
      }
      return anyObj;
    }
  }
  return obj;
}

export class ScriptRunnerOptions {
  showOutput = false;
  env: any = {};
  catchOutput = (data: string) => {
    console.log(data);
  };
  catchError = (data: string) => {
    process.stderr.write(data);
  };

  constructor(partial?: Partial<ScriptRunnerOptions>) {
    Object.assign(this, {
      ...(partial ?? {}),
    });
  }
}

/**
 * Error of a failed command. Contains the exit code and the complete output, the message contains stderr (or stdout if
 * stderr is empty) so that string matches like `/could not be found/` keep working on `${error}`.
 */
export class ScriptRunnerError extends Error {
  constructor(
    public readonly command: string,
    public readonly code: number | null,
    public readonly stdout: string,
    public readonly stderr: string,
    message?: string
  ) {
    super(
      message ??
        `Command failed with exit code ${code}: ${command}\n${
          stderr.trim() !== '' ? stderr : stdout
        }`
    );
    this.name = 'ScriptRunnerError';
  }
}

export interface ScriptRunnerResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export class ScriptRunner {
  public static runAsAdmin(
    command: string,
    options: {
      name?: string;
      headless?: boolean;
      icns?: string;
      env?: { [key: string]: string };
    }
  ): Promise<any> {
    if (os.platform() === 'win32') {
      options = {
        ...(options ?? {}),
        headless: false,
      };
    }

    if (options?.headless) {
      return ScriptRunner.run(`sudo -- sh -c ${shellQuote(command)}`, options);
    } else {
      return new Promise<void>((resolve, reject) => {
        SudoPrompt.exec(command, options, (error, stdout, stderr) => {
          if (error) {
            // stderr is usually an empty string (e.g. if the user cancelled the prompt) - keep the error message
            const stderrString = `${stderr ?? ''}`;
            reject(
              new ScriptRunnerError(
                command,
                (error as any).code ?? null,
                `${stdout ?? ''}`,
                stderrString,
                `${error.message}${
                  stderrString.trim() !== '' ? `\n${stderrString}` : ''
                }`
              )
            );
          } else {
            resolve();
          }
        });
      });
    }
  }

  /**
   * Runs a command and resolves with stdout. Rejects with a ScriptRunnerError if the command exits with a code != 0.
   */
  public static async run(
    scriptPath: string,
    options: Partial<ScriptRunnerOptions> = new ScriptRunnerOptions(),
    processCreatedCallback: (process: ChildProcess) => void = () => {
      // nothing
    }
  ): Promise<string> {
    const result = await ScriptRunner.exec(
      scriptPath,
      options,
      processCreatedCallback
    );
    if (result.code !== null && result.code !== 0) {
      throw new ScriptRunnerError(
        scriptPath,
        result.code,
        result.stdout,
        result.stderr
      );
    }
    return result.stdout;
  }

  /**
   * Runs a command and resolves with exit code, stdout and stderr - also if the exit code is != 0. Used for status
   * queries whose tools report states via exit codes (e.g. `systemctl status` exits with 3 for inactive services).
   * Rejects only if the command can't be started.
   */
  public static exec(
    scriptPath: string,
    options: Partial<ScriptRunnerOptions> = new ScriptRunnerOptions(),
    processCreatedCallback: (process: ChildProcess) => void = () => {
      // nothing
    }
  ): Promise<ScriptRunnerResult> {
    return new Promise<ScriptRunnerResult>((resolve, reject) => {
      const runnerOptions = new ScriptRunnerOptions(options);
      let stdout = '';
      let stderr = '';

      const childProcess = exec(scriptPath, {
        env: { ...process.env, ...runnerOptions.env },
      });

      if (!childProcess) {
        reject(new ScriptRunnerError(scriptPath, null, '', '', `Can't run script: ${scriptPath}`));
        return;
      }

      processCreatedCallback(childProcess);
      childProcess.stdin?.on('data', () => {
        // allows inputs to child
      });

      childProcess.stdout?.on('data', (data) => {
        stdout += data;
        if (runnerOptions.showOutput) {
          runnerOptions.catchOutput(data);
        }
      });
      childProcess.stdout?.on('error', (data) => {
        stderr += data;
        if (runnerOptions.showOutput) {
          runnerOptions.catchError(data.message);
        }
      });
      childProcess.stderr?.on('data', (data) => {
        stderr += data;
        if (runnerOptions.showOutput) {
          runnerOptions.catchError(data);
        }
      });

      childProcess.on('error', (error) => {
        reject(
          new ScriptRunnerError(scriptPath, null, stdout, stderr, `Can't run script ${scriptPath}: ${error.message}`)
        );
      });

      childProcess.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });
  }
}

export async function exists(path: string) {
  return new Promise<boolean>((resolve) => {
    fs.access(path, (error) => {
      if (error) resolve(false);
      else resolve(true);
    });
  });
}

/**
 * Quotes a value for POSIX shells (single quotes, embedded single quotes escaped).
 */
export function shellQuote(value: string): string {
  return `'${`${value}`.replace(/'/g, `'\\''`)}'`;
}

/**
 * Writes content to a file in a new temporary folder. Service files are written this way and moved to their target
 * by the (privileged) install script - no escaping of the file content in shell commands needed.
 */
export async function writeTempFile(
  fileName: string,
  content: string
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const folder = await mkdtemp(join(os.tmpdir(), 'node-service-'));
  const path = join(folder, fileName);
  await writeFile(path, content, { encoding: 'utf-8', mode: 0o644 });
  return {
    path,
    cleanup: () => rm(folder, { recursive: true, force: true }),
  };
}

/**
 * Shell commands that create the log folder and files (readable for the service).
 */
export function buildLogFolderCommands(logRoot: string, log: string, errorLog: string): string[] {
  return [
    `mkdir -p ${shellQuote(logRoot)}`,
    `chmod 745 ${shellQuote(logRoot)}`,
    `touch ${shellQuote(log)} ${shellQuote(errorLog)}`,
    `chmod 745 ${shellQuote(log)} ${shellQuote(errorLog)}`,
  ];
}
