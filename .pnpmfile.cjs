// Optional: Custom pnpm configuration
// This file can be used to customize pnpm behavior

function readPackage(pkg, context) {
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};

