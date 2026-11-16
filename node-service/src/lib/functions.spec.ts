import { ScriptRunner, ScriptRunnerError, shellQuote, writeTempFile } from './functions';

const describeUnix = process.platform === 'win32' ? describe.skip : describe;

describeUnix('ScriptRunner', () => {
  it('run resolves with stdout', async () => {
    await expect(ScriptRunner.run('echo hello')).resolves.toBe('hello\n');
  });

  it('run rejects on exit code != 0 even without stderr', async () => {
    const error = await ScriptRunner.run('echo out; exit 3').catch((e) => e);
    expect(error).toBeInstanceOf(ScriptRunnerError);
    expect(error.code).toBe(3);
    expect(error.stdout).toBe('out\n');
    expect(`${error}`).toContain('out');
  });

  it('run rejects with stderr in the message', async () => {
    const error = await ScriptRunner.run('echo "could not be found." >&2; exit 4').catch((e) => e);
    expect(error.code).toBe(4);
    expect(error.message).toContain('could not be found.');
  });

  it('exec resolves with code, stdout and stderr', async () => {
    await expect(ScriptRunner.exec('echo out; echo err >&2; exit 3')).resolves.toEqual({
      code: 3,
      stdout: 'out\n',
      stderr: 'err\n',
    });
  });
});

describe('shellQuote', () => {
  it('quotes single quotes', () => {
    expect(shellQuote(`/Users/o'neil/my file`)).toBe(`'/Users/o'\\''neil/my file'`);
  });
});

describeUnix('writeTempFile', () => {
  it('writes the content unchanged and cleans up', async () => {
    const content = `[Service]\nExecStart="/opt/my app/run" '%%' \\n $HOME\n`;
    const file = await writeTempFile('x.service', content);
    await expect(ScriptRunner.run(`cat ${shellQuote(file.path)}`)).resolves.toBe(content);
    await file.cleanup();
    await expect(ScriptRunner.run(`test -e ${shellQuote(file.path)}`)).rejects.toBeInstanceOf(ScriptRunnerError);
  });
});
