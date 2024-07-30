<h1>node-service <a href="https://www.npmjs.com/package/node-service?activeTab=readme"><img alt="NPM Version" src="https://img.shields.io/npm/v/node-service"></a></h1>

This NodeJS library allows to easily install and control OS services on Windows, MacOS and linux using shell commands. Uses sudo-prompt if admin privileges are needed.

## Goal
The goal of this repository is to simplify the creation and management of OS services using NodeJS.

## Features

- One configuration for all OS services: Windows, MacOS, Linux
- Supported functions: installation/uninstallation, start, stop, status
- Supported scopes: "system" (user asked for admin privileges) or "user"
- TS typings
- Async functions

## Disclaimer

This project is in an early development stage. There may be bugs or missing features. Currently this package doesn't parse existing service config files (e.g. on Linux).

## Remarks

- Windows: If you plan to use this library for windows, make sure that winsw is installed on the user's machine. You can add a winsw.exe binary to your application and define the path to that file in the options.
- MacOS: Make sure, that the plist package is installed: `npm install plist`

## Installation

Make sure that sudo-prompt is installed:

```shell
   npm install sudo-prompt
```

```shell
   npm install node-service
```

On macOS targets "plist" is needed:

```shell
   npm install plist
```

## Example

````javascript
import {initializeOSService} from 'node-service';
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
      pathToWinswConfig: resolve(join("data", "winsw.xml"))
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
