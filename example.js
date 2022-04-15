import fsc from "./dist/index.js";

const fsq = new fsc({ ttl: `1s` });

fsq.setSync(`foo`, Buffer.from(`bar`));

console.log(fsq.getSync(`foo`).toString());

await new Promise((r) => {
  setTimeout(r, 2000);
});

console.log(fsq.getSync(`foo`));
