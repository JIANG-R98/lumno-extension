'use strict';

const { spawn } = require('child_process');

const extensionUrl = 'chrome-extension://kkcjcneagmlhpeaafngjdlpcfjakejgb/src/debug/pinned-recent-update-animation.html';
console.log(extensionUrl);

if (process.argv.includes('--print')) process.exit(0);

let child;
if (process.platform === 'win32') {
  child = spawn('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Start-Process -FilePath $args[0]',
    extensionUrl
  ], { detached: true, stdio: 'ignore', windowsHide: true });
} else if (process.platform === 'darwin') {
  child = spawn('open', [extensionUrl], { detached: true, stdio: 'ignore' });
} else {
  child = spawn('xdg-open', [extensionUrl], { detached: true, stdio: 'ignore' });
}
child.unref();
