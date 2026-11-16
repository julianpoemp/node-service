<h1>node-service <a href="https://www.npmjs.com/package/@julianpoemp/node-service?activeTab=readme"><img alt="NPM Version" src="https://img.shields.io/npm/v/@julianpoemp/node-service"></a></h1>

This NodeJS library allows to easily install and control OS background services on Windows, MacOS and Linux using shell commands. Uses [@vscode/sudo-prompt](https://github.com/microsoft/vscode-sudo-prompt) to request admin privileges on desktop and "sudo" only on headless servers.

## Goal
The goal of this repository is to simplify the creation and management of OS services using NodeJS.

## Features

- One configuration for all OS services: Windows, MacOS, Linux
- Supported functions: installation/uninstallation, start, stop, status
- Supported scopes: "system" (user asked for admin privileges) or "user" (macOS, Linux)
- Status queries without admin privileges
- Option "headless" for headless servers (Linux, MacOS only)
- TS typings
- Async functions

## Disclaimer

This project is in an early development stage. There may be bugs or missing features. Currently this package doesn't parse existing service config files (e.g. on Linux).

## Requirements

- Windows: [servy-cli](https://servy-win.github.io/) v8 or newer. Add servy-cli.exe to %PATH% or set the path in
  `options.windows.pathToServyCliExe`. servy-cli is only needed to install, uninstall, start and stop a service - the
  status is read via `sc.exe`.
- MacOS: Make sure, that the plist package is installed: `npm install plist`

## Windows notes

- servy only supports system services: the level `user` is installed as system service, all commands except the status
  query need admin privileges (UAC prompt).
- The status is read via `sc.exe query` (works without admin privileges and independent of the system language).
- Environment variables (`env`) are escaped for servy: `=`, `;`, `"` and `\` are prefixed with a backslash, so Windows
  paths and named pipes (`\\.\pipe\name`) arrive unchanged in the service.

## Debugging

With `debugging: true` the commands and generated service files are logged. Set `logger` to pass the output to your own
logging instead of `console.log`:

```typescript
const manager = await initializeOSService({
  name: 'Hello World Service Example',
  slug: 'hello-world',
  level: 'user',
  debugging: true,
  logger: (message, ...params) => myLogger.debug(message, ...params),
});
```

## Errors

Failing commands reject with a `ScriptRunnerError` (`Error` with `code`, `stdout` and `stderr`). Status queries don't
throw if a service doesn't exist, the status is `not_installed` then.

## Installation

Make sure that @vscode/sudo-prompt is installed (peer dependency):

```shell
   npm install @vscode/sudo-prompt
```

```shell
   npm install @julianpoemp/node-service
```

On macOS targets "plist" is needed:

```shell
   npm install plist
```

## Example

````javascript
import {initializeOSService} from '@julianpoemp/node-service';
import {join, resolve} from 'path';

async function wait(seconds: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 1000 * seconds)
  });
}

async function main() {
  const manager = await initializeOSService({
    name: 'Hello World Service Example',
    level: 'system',
    slug: 'hello-world',
    windows: {
      pathToServyCliExe: resolve(join("bin", "servy-cli.exe"))
    }
  });

  console.log("UNINSTALL!");
  await manager.uninstall();

  if (manager.status === 'not_installed') {
    console.log('Install...');
    const args: string[] = [
      "node"
    ];

    await manager.install(resolve(join("demo", "src", "assets", "hello-world.js")), args, {
      description: "This service just prints 'Hello world' every second.",
      logging: {
        enabled: true
      },
      linux: {
        Unit: {
          After: "network.target",
          StartLimitIntervalSync: 0
        },
        Service: {
          Type: "simple",
          Restart: "always",
          RestartSec: 5
        },
        Install: {
          WantedBy: "multi-user.target"
        }
      }
    });
    console.log('installed!');
    await manager.start();
  }

  while (true) {
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STAsTUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    await manager.stop();
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    await manager.start();
  }
}

main().catch((e)=>{
  console.log(e?.message ?? e);
})
````
