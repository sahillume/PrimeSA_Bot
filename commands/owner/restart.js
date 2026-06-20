/**
 * Restart Command - Restart bot (Owner Only)
 */

const execWithTimeout = require('../../utils/safeExec');

module.exports = {
  name: 'restart',
  aliases: ['reboot', 'reload'],
  category: 'owner',
  description: 'Restart the bot (Owner Only)',
  usage: '.restart',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      await extra.reply('🔁 Restarting bot...');

      const run = async (cmd) => {
        const res = await execWithTimeout(cmd, { timeout: 30 * 1000 });
        return (res && res.stdout) ? String(res.stdout) : String(res.stderr || '');
      };

      try {
        // If running under PM2, this will restart it
        await run('pm2 restart all');
        return;
      } catch (e) {
        console.log('PM2 not available, falling back to process.exit');
      }

      // For panels & nodemon – they usually restart on exit
      setTimeout(() => {
        process.exit(0);
      }, 500);
    } catch (error) {
      console.error('Restart error:', error);
      await extra.reply(`❌ Error restarting bot: ${error.message}`);
    }
  },
};
