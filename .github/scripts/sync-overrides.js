const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const mainDeps = {
  react: pkg.dependencies?.react || pkg.devDependencies?.react,
  'react-dom': pkg.dependencies?.['react-dom'] || pkg.devDependencies?.['react-dom'],
  '@auth/core': pkg.dependencies?.['@auth/core'] || pkg.devDependencies?.['@auth/core'],
};

let changed = false;

function setOverride(pkg, dep, version) {
  if (!pkg.overrides) pkg.overrides = {};
  for (const key of Object.keys(pkg.overrides)) {
    if (typeof pkg.overrides[key] === 'object' && pkg.overrides[key][dep]) {
      if (pkg.overrides[key][dep] !== version) {
        pkg.overrides[key][dep] = version;
        changed = true;
      }
    }
  }
}

for (const dep of Object.keys(mainDeps)) {
  if (!mainDeps[dep]) continue;
  setOverride(pkg, dep, mainDeps[dep]);
}

if (changed) {
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('package.json overrides updated.');
} else {
  console.log('No override changes needed.');
}