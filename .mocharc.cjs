module.exports = {
  allowUncaught: true,
  bail: true,
  reporter: ["spec"],
  loader: "ts-node/esm",
  extension: [".spec.ts"],
}