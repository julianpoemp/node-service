import {ChildProcess, exec} from 'child_process';
import * as SudoPrompt from 'sudo-prompt';
import * as fs from 'fs';
import * as os from 'node:os';

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
    removeUndefined: true
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
      ...(partial ?? {})
    });
  }
}

export class ScriptRunner {
  public static runAsAdmin(command: string, options: {
    name?: string,
    headless?: boolean,
    icns?: string,
    env?: { [key: string]: string }
  }): Promise<any> {
    if (os.platform() === 'win32') {
      options = {
        ...(options ?? {}),
        headless: false
      };
    }

    if (options?.headless) {
      console.log(`sudo -- sh -c '${command.replace(/'/g, '"')}'`)
      return ScriptRunner.run(`sudo -- sh -c '${command.replace(/'/g, '"')}'`, options);
    } else {
      return new Promise<void>((resolve, reject) => {
        SudoPrompt.exec(command, options, (error, stdout, stderr) => {
          if (error) reject(stderr ?? error);
          else resolve();
        });
      });
    }
  }

  public static async run(
    scriptPath: string,
    options: Partial<ScriptRunnerOptions> = new ScriptRunnerOptions(),
    processCreatedCallback: (process: ChildProcess) => void = (process: ChildProcess) => {
    }
  ) {
    return new Promise<string>((resolve, reject) => {
      options = new ScriptRunnerOptions(options);
      let output = '';
      let error = '';

      const childProcess = exec(scriptPath, {
        env: {...process.env, ...options.env}
      });

      let pipeLine;
      if (childProcess) {
        processCreatedCallback(childProcess);
        childProcess.stdin.on('data', (data) => {
        }); // hack to allow inputs to child

        childProcess.stdout.on('data', (data) => {
          output += data;

          if (options.showOutput) {
            options.catchOutput(data);
          }
        });
        childProcess.stdout.on('error', (data) => {
          error += data;

          if (options.showOutput) {
            options.catchError(data.message);
          }
        });

        childProcess.stderr.on('data', (data) => {
          error += data;

          if (options.showOutput) {
            options.catchError(data);
          }
        });

        // what to do when the command is done
        childProcess.on('close', (code) => {
          if (pipeLine) {
            pipeLine.destroy();
          }
          if (code !== null && code !== 0 && error !== '') {
            reject(error);
          } else {
            resolve(output);
          }
        });
        childProcess.stdin.on('data', (data) => {
        }); // hack to allow inputs to child
      } else {
        if (pipeLine) {
          pipeLine.destroy();
        }
        reject('Can\'t run script.');
      }
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
