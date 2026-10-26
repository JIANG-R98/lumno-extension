'use strict';

// Reading the scripts npm run build writes: which chunks an ES module entry
// loads before it runs.

const fs = require('fs');
const path = require('path');

// The relative paths an ES module imports statically. Built modules list
// their imports first, so reading stops at the first other statement.
function staticImports(source) {
  const imports = [];
  const statement = /^\s*import\s*(?:[^;"'`]*?\bfrom\s*)?(["'])([^"']+)\1\s*;?/;
  let rest = source.replace(/^(?:\s*\/\*[\s\S]*?\*\/|\s*\/\/[^\n]*\n)*/, '');
  let match = statement.exec(rest);
  while (match) {
    imports.push(match[2]);
    rest = rest.slice(match[0].length);
    match = statement.exec(rest);
  }
  return imports.filter((specifier) => specifier.startsWith('.'));
}

// The files loading `files` from buildDir runs, each module's chunks
// included; null when one of them is missing.
function routeFiles(buildDir, files) {
  const loaded = new Set();
  const visit = (file) => {
    if (loaded.has(file)) {
      return true;
    }
    const filePath = path.join(buildDir, file);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    loaded.add(file);
    return staticImports(fs.readFileSync(filePath, 'utf8'))
      .every((specifier) => visit(path.posix.join(path.posix.dirname(file), specifier)));
  };
  return files.every(visit) ? Array.from(loaded) : null;
}

module.exports = { routeFiles, staticImports };
