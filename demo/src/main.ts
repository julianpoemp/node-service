import {initializeOSService} from 'node-service';
import {join, resolve} from 'path';

async function wait(seconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, 1000 * seconds)
  });
}

async function main() {
  const manager = await initializeOSService({
    name: 'HelloWorld',
    level: 'system',
    slug: 'hello-world',
    headless: true
  });

  if(await manager.isInstalled()) {
    console.log("UNINSTALL!");
    await manager.uninstall();
  } else {
    console.log("not installed");
  }


  if (manager.status === 'not_installed') {
    console.log('Install...');
    const args: string[] = [
      resolve(join("assets", "hello-world.js"))
    ];

    await manager.install("node", args, {
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
    // await manager.start();
  }

  await manager.start();

  while (true) {
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
  }
}

main().catch((e)=>{
  console.log(e?.message ?? e);
})
