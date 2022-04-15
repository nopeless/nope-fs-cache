import path from "path";
import { fileURLToPath } from "url";
import rimraf from "rimraf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CACHE_DIR = path.resolve(__dirname, `cache`);

function clean() {
  rimraf.sync(CACHE_DIR);
}

export const mochaHooks = {
  beforeAll: () => clean(),
  afterAll: () => clean(),
};
