/**
 * Advanced Menu Command
 * - Animated ASCII header (random per open)
 * - Time-based greeting
 * - Dynamic username greeting
 * - Random theme (accent emoji)
 * - Buttons for quick category selection (User / Fun / Admin)
 * - Search support: .menu search <term>
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const ASCII_HEADERS = [
  '  ____  _ __  __ ____  _   _\n |  _ \| \/  |  _ \| \ | |',
  '  _____  _   _  ____  ____\n |  __ \| \ | |/ __ \|  _ \\',
  '  _____ _ __   __ _  ___  \n |  __ \|  _ \ / _` |/ _ \\'
];

const THEMES = [
  { name: 'Solar', emoji: '🌅' },
  { name: 'Lunar', emoji: '🌙' },
  { name: 'Neon', emoji: '✨' },
  { name: 'Cyber', emoji: '🤖' }
];

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good Night';
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

async function makeBannerImage(botName) {
  // If static image exists, use it
  const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
  if (fs.existsSync(imagePath)) return fs.readFileSync(imagePath);

  // Otherwise generate a simple banner dynamically
  const width = 800;
  const height = 240;
  const bg = await new Jimp(width, height, '#0b1220');
  const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  bg.print(font, 20, 60, botName);
  const small = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  bg.print(small, 20, 140, 'PrimeSA_Bot v1 by pro Sahil');
  const buffer = await bg.getBufferAsync(Jimp.MIME_JPEG);
  return buffer;
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu [category|search <term>]',

  async execute(sock, msg, args = [], extra = {}) {
    try {
      const ctx = extra || {};
      const from = ctx.from || msg.key.remoteJid;
      const sender = (ctx.sender || msg.key.participant || msg.key.remoteJid || '').split('@')[0];
      const isOwner = !!ctx.isOwner;
      const isAdmin = !!ctx.isAdmin;
      const isMod = !!ctx.isMod;
      const isGroup = !!ctx.isGroup;

      const allCommands = loadCommands();

      // Build filtered commands map by permission for this user
      const categories = {};
      allCommands.forEach((cmd, name) => {
        if (cmd.name !== name) return; // ignore aliases

        // Permission filtering: hide owner/admin/mod commands from unauthorized users
        if (cmd.ownerOnly && !isOwner) return;
        if (cmd.adminOnly && !isAdmin && !isOwner) return;
        if (cmd.modOnly && !isMod && !isOwner) return;
        // groupOnly/privateOnly will be shown regardless; commands themselves still check

        const cat = cmd.category || 'other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(cmd);
      });

      // Random theme and header
      const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
      const header = ASCII_HEADERS[Math.floor(Math.random() * ASCII_HEADERS.length)];
      const greet = timeGreeting();

      // If user asked for search
      if (args[0] && args[0].toLowerCase() === 'search') {
        const q = args.slice(1).join(' ').toLowerCase();
        if (!q) return ctx.reply('Usage: .menu search <term>');
        const hits = [];
        allCommands.forEach((cmd, name) => {
          if (cmd.name !== name) return;
          const hay = `${cmd.name} ${cmd.description || ''} ${cmd.category || ''}`.toLowerCase();
          if (hay.includes(q)) {
            // Check permissions
            if (cmd.ownerOnly && !isOwner) return;
            if (cmd.adminOnly && !isAdmin && !isOwner) return;
            if (cmd.modOnly && !isMod && !isOwner) return;
            hits.push(cmd);
          }
        });
        if (hits.length === 0) return ctx.reply(`No commands matched "${q}"`);
        let out = `${theme.emoji} Search results for "${q}" (${hits.length})\n\n`;
        hits.forEach(c => out += `• ${config.prefix}${c.name} — ${c.description || ''}\n`);
        return ctx.reply(out);
      }

      // If specific category requested (.menu admin)
      const categoryArg = args[0] ? args[0].toLowerCase() : null;

      // Compose text
      let text = `${theme.emoji} ${header}\n\n`;
      text += `• ${greet} ${sender}\n`;
      text += `• Prefix: ${config.prefix} | Version: 1.0.0\n`;
      text += `• Theme: ${theme.name}\n\n`;

      // If showing a single category
      if (categoryArg) {
        const list = categories[categoryArg];
        if (!list || list.length === 0) return ctx.reply(`No commands available for category: ${categoryArg}`);
        // If many commands in this category, send a paginated list (ListMessage)
        if (list.length > 8) {
          // Build sections for Baileys list message
          const rows = list.map(c => ({
            title: `${config.prefix}${c.name}`,
            rowId: `menu_cmd:${c.name}`,
            description: c.description || ''
          }));

          const sections = [{ title: `${categoryArg.toUpperCase()} Commands`, rows }];

          const listMessage = {
            title: `${config.botName} • ${categoryArg.toUpperCase()}`,
            text: `${theme.emoji} ${greet} ${sender}\nSelect a command to run`,
            buttonText: 'Select Command',
            footer: `Powered by ${config.botName}`,
            sections
          };

          // Send list message (no image change)
          return await sock.sendMessage(from, { listMessage }, { quoted: msg });
        }

        text += `=== ${categoryArg.toUpperCase()} ===\n`;
        list.forEach(c => text += `• ${config.prefix}${c.name} ${c.usage || ''} — ${c.description || ''}\n`);
      } else {
        // Summary view: show counts per category
        Object.keys(categories).forEach(cat => {
          text += `• ${cat} — ${categories[cat].length} commands\n`;
        });
        text += `\nUse buttons below to open a category, or use \`.menu <category>\` or \`.menu search <term>\`.`;
      }

      // Build buttons (3 max). Provide User, Fun, Admin if available
      const buttons = [];
      if (categories.general) buttons.push({ buttonId: 'btn_menu_general', buttonText: { displayText: 'User' }, type: 1 });
      if (categories.fun) buttons.push({ buttonId: 'btn_menu_fun', buttonText: { displayText: 'Fun' }, type: 1 });
      if (categories.admin) buttons.push({ buttonId: 'btn_menu_admin', buttonText: { displayText: 'Admin' }, type: 1 });
      // Always include a help/search quick button if space
      if (buttons.length < 3) buttons.push({ buttonId: 'btn_menu_search', buttonText: { displayText: 'Search' }, type: 1 });

      const imageBuffer = await makeBannerImage(config.botName || 'PrimeSA_Bot');

      // Send message as template buttons with image
      await sock.sendMessage(from, {
        image: imageBuffer,
        caption: text,
        footer: `@${sender} • ${config.botName}`,
        buttons,
        headerType: 4,
        mentions: [msg.key.participant || msg.key.remoteJid]
      }, { quoted: msg });

    } catch (err) {
      console.error('[Menu] error', err && err.message ? err.message : err);
      try { extra.reply && await extra.reply('❌ Failed to show menu.'); } catch (e) {}
    }
  }
};
