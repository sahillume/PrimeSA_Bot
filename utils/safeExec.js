const { exec } = require('child_process');

/**
 * Execute a shell command with a timeout and output capture.
 * @param {string} cmd
 * @param {object} options - { timeout: ms }
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
module.exports = function execWithTimeout(cmd, options = {}) {
  const timeout = typeof options.timeout === 'number' ? options.timeout : 60 * 1000; // default 60s

  return new Promise((resolve, reject) => {
    const child = exec(cmd, { windowsHide: true, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        return reject(err);
      }
      resolve({ stdout: stdout || '', stderr: stderr || '' });
    });

    // kill child after timeout
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error('Command timed out'));
    }, timeout);

    child.on('exit', () => clearTimeout(timer));
    child.on('error', () => clearTimeout(timer));
  });
};
