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
  afterAll: function () {
    let topParent = this.test;
    while (topParent.parent) topParent = topParent.parent;
    function isFailed(suite) {
      // Suites are recursive
      for (const s of suite.suites) {
        if (isFailed(s)) return true;
      }
      // Tests are not
      for (const test of suite.tests) {
        if (test.state === `failed`) return true;
      }
      return false;
    }
    isFailed(topParent) || clean();
  },
};

export const cacheFile = CACHE_DIR;
