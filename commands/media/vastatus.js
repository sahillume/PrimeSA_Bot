/**
 * vastatus - Post video (or image+audio) to WhatsApp Status (status@broadcast)
 * Usage:
 * - Reply to a video message with `.vastatus [optional caption]` to post that video as status
 * - Reply to an audio message with `.vastatus [optional caption]` to create a video from the bot banner image + audio and post it
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const ffmpegStatic = (() => { try { return require('ffmpeg-static') || 'ffmpeg' } catch(e) { return 'ffmpeg' } })();
const { getTempDir, createTempFilePath, deleteTempFile } = require('../../utils/tempManager');
const { toVideo } = require('../../utils/converter');
const Jimp = require('jimp');

async function makeBannerBuffer(botName) {
  const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
  if (fs.existsSync(imagePath)) return fs.readFileSync(imagePath);
  const width = 1280;
  const height = 720;
  const bg = await new Jimp(width, height, '#0b1220');
  const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  bg.print(font, 40, 200, botName || 'PrimeSA_Bot');
  const small = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  bg.print(small, 40, 320, 'PrimeSA_Bot v1 by pro Sahil');
  return await bg.getBufferAsync(Jimp.MIME_JPEG);
}

module.exports = {
  name: 'vastatus',
  aliases: ['videostatus','vstatus'],
  description: 'Post video or image+audio as WhatsApp Status',
  usage: '.vastatus (reply to video or audio) [caption]',
  category: 'media',

  async execute(sock, msg, args = [], extra = {}) {
    const from = extra.from || msg.key.remoteJid;
    const reply = extra.reply || (text => sock.sendMessage(from, { text }, { quoted: msg }));
    const caption = args.join(' ').trim() || undefined;

    try {
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctxInfo || !ctxInfo.quotedMessage) return reply('❌ Please reply to a video or audio message with .vastatus');

      const quoted = { key: { remoteJid: from, id: ctxInfo.stanzaId, participant: ctxInfo.participant }, message: ctxInfo.quotedMessage };

      const videoMsg = quoted.message?.videoMessage || quoted.message?.message?.videoMessage || (quoted.message?.documentMessage && quoted.message.documentMessage.mimetype && quoted.message.documentMessage.mimetype.startsWith('video'));
      const audioMsg = quoted.message?.audioMessage || quoted.message?.message?.audioMessage || (quoted.message?.documentMessage && quoted.message.documentMessage.mimetype && quoted.message.documentMessage.mimetype.startsWith('audio'));

      const tempDir = getTempDir();

      if (videoMsg) {
        // Download video
        const buffer = await downloadMediaMessage(quoted, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        if (!buffer) return reply('❌ Failed to download video.');

        // Convert/normalize to mp4 if necessary
        let outBuffer;
        try {
          outBuffer = await toVideo(buffer, 'tmp');
        } catch (e) {
          console.warn('[vastatus] toVideo failed, sending original buffer', e && e.message ? e.message : e);
          outBuffer = buffer;
        }

        await sock.sendMessage('status@broadcast', { video: outBuffer, mimetype: 'video/mp4', caption });
        return reply('✅ Video posted to status successfully!');
      }

      if (audioMsg) {
        // Download audio and create a video from banner image + audio
        const audioBuffer = await downloadMediaMessage(quoted, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        if (!audioBuffer) return reply('❌ Failed to download audio.');

        const bannerBuffer = await makeBannerBuffer(extra.config?.botName || (extra.botName) || 'PrimeSA_Bot');

        // Create temp files
        const imgPath = createTempFilePath('astatus_img', 'jpg');
        const audioPath = createTempFilePath('astatus_audio', 'tmp');
        const outPath = createTempFilePath('astatus_out', 'mp4');
        fs.writeFileSync(imgPath, bannerBuffer);
        fs.writeFileSync(audioPath, audioBuffer);

        // Build ffmpeg args: loop image and combine with audio
        const ffArgs = [
          '-y',
          '-loop', '1',
          '-i', imgPath,
          '-i', audioPath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          '-pix_fmt', 'yuv420p',
          outPath
        ];

        await new Promise((resolve, reject) => {
          const p = spawn(ffmpegStatic, ffArgs, { stdio: 'ignore' });
          p.on('error', reject);
          p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exited with ' + code)));
        });

        const outBuffer = fs.readFileSync(outPath);

        // cleanup
        deleteTempFile(imgPath);
        deleteTempFile(audioPath);
        deleteTempFile(outPath);

        await sock.sendMessage('status@broadcast', { video: outBuffer, mimetype: 'video/mp4', caption });
        return reply('✅ Video (image+audio) posted to status successfully!');
      }

      return reply('❌ Quoted message is neither a supported video nor audio file.');

    } catch (err) {
      console.error('[vastatus] error:', err && err.message ? err.message : err);
      try { return reply('❌ Failed to post video status.'); } catch(e){}
    }
  }
};
