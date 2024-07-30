async function wait(seconds){
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  })
}

async function main() {
  console.log("Hello world!");
  await wait(1);
  await main();
}

main().catch((e)=> {
    console.log(e);
  }
);
