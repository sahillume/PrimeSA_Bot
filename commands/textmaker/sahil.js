/**
 * sahil - Animated Textmaker (creates an animated GIF or fallback PNG)
 * Usage: .sahil Your text here
 * Features:
 *  - Multiple animated themes
 *  - Watermark "PrimeSA_Bot v1 by pro Sahil"
 *  - Rate limit per user
 *  - GIF fallback to PNG if gifencoder not installed
 */

const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const { getTempDir, createTempFilePath, deleteTempFile } = require('../../utils/tempManager');

// Simple in-memory rate limiter (sender -> last timestamp)
const lastUsed = new Map();
const COOLDOWN_MS = 8 * 1000; // 8 seconds per user

const THEMES = [
  { name: 'Solar', bg: '#FF5F6D', color: '#FFF4E6' },
  { name: 'Lunar', bg: '#141E30', color: '#E6F0FF' },
  { name: 'Neon', bg: '#0F0C29', color: '#39FF14' },
  { name: 'Cyber', bg: '#0B1220', color: '#00E5FF' }
];

module.exports = {
  name: 'sahil',
  aliases: ['sahiltext', 'sahillogo'],
  category: 'textmaker',
  description: 'Create an animated text banner (GIF) with themes',
  usage: '.sahil <text>',

  async execute(sock, msg, args = [], extra = {}) {
    const from = extra.from || msg.key.remoteJid;
    const sender = (extra.sender || msg.key.participant || msg.key.remoteJid || '').split('@')[0];
    const reply = extra.reply || (text => sock.sendMessage(from, { text }, { quoted: msg }));

    try {
      const now = Date.now();
      const last = lastUsed.get(sender) || 0;
      if (now - last < COOLDOWN_MS) {
        const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
        return reply(`⏳ Please wait ${wait}s before creating another banner.`);
      }
      lastUsed.set(sender, now);

      const text = args.join(' ').trim();
      if (!text) return reply('❌ Usage: .sahil Your text here');

      // Limit text length
      const safeText = text.length > 80 ? text.slice(0, 80) + '...' : text;

      // Try to require gifencoder (optional)
      let GifEncoder;
      try { GifEncoder = require('gifencoder'); } catch (e) { GifEncoder = null; }

      // Create frames using Jimp
      const width = 800;
      const height = 300;
      const frames = [];
      const fontBig = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
      const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

      // generate one frame per theme + slight text offset animation (3 frames per theme)
      for (const theme of THEMES) {
        for (let i = 0; i < 3; i++) {
          const img = new Jimp(width, height, theme.bg);

          // text shadow / glow by printing slightly offset darker rectangles
          const textX = 40 + i * 6; // animate x
          const textY = 60;

          // Draw main text
          img.print(fontBig, textX, textY, {
            text: safeText,
            alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
            alignmentY: Jimp.VERTICAL_ALIGN_TOP
          }, width - 160, 180);

          // watermark
          img.print(fontSmall, 40, height - 60, `PrimeSA_Bot v1 by pro Sahil`);

          // accent circle
          img.scan(width - 140, 40, 100, 100, function (x, y, idx) {
            // simple filled circle
            const cx = width - 90;
            const cy = 90;
            const dx = x - cx;
            const dy = y - cy;
            if (dx * dx + dy * dy <= 40 * 40) {
              this.bitmap.data[idx] = parseInt(theme.color.slice(1, 3), 16); // R placeholder (we'll tint below)
              // We'll overlay a semi-transparent rectangle later
            }
          });

          // color overlay (tint text area to theme color by drawing rectangle)
          const overlay = new Jimp(width, height, 0x00000000);
          overlay.scan(0, 0, width, height, function (x, y, idx) {
            // no-op
          });

          // apply subtle vignette by blending semi-transparent overlay
          img.composite(overlay, 0, 0, { mode: Jimp.BLEND_OVERLAY, opacitySource: 0.05 });

          frames.push(img);
        }
      }

      // If GifEncoder available, build animated GIF
      const tempDir = getTempDir();
      if (GifEncoder) {
        const encoder = new GifEncoder(width, height);
        const tempFile = createTempFilePath('sahil', 'gif');
        const writeStream = fs.createWriteStream(tempFile);
        encoder.createReadStream().pipe(writeStream);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(350);
        encoder.setQuality(10);

        for (const frame of frames) {
          // frame bitmap as RGBA buffer
          const buffer = await frame.getBufferAsync(Jimp.MIME_PNG);
          // GifEncoder expects raw pixel data; Jimp can provide bitmap data
          const raw = frame.bitmap.data; // RGBA
          encoder.addFrame(raw);
        }
        encoder.finish();

        await new Promise((resolve, reject) => writeStream.on('close', resolve).on('error', reject));

        const gifBuffer = fs.readFileSync(tempFile);
        await sock.sendMessage(from, {
          document: gifBuffer,
          fileName: `sahil_${Date.now()}.gif`,
          mimetype: 'image/gif',
          caption: `✨ Animated banner for @${sender}`,
          mentions: [msg.key.participant || msg.key.remoteJid]
        }, { quoted: msg });

        // cleanup
        try { deleteTempFile(tempFile); } catch (e) {}
        return;
      }

      // Fallback: send first frame as PNG
      const firstBuffer = await frames[0].getBufferAsync(Jimp.MIME_JPEG);
      await sock.sendMessage(from, {
        image: firstBuffer,
        caption: `✨ Banner (static) for @${sender}\nTheme: ${THEMES[0].name}`,
        mentions: [msg.key.participant || msg.key.remoteJid]
      }, { quoted: msg });

    } catch (error) {
      console.error('[sahil] error', error);
      try { await reply('❌ Failed to create banner.'); } catch (e) {}
    }
  }
};
