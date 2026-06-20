/**
 * astatus - Post audio to WhatsApp Status (status@broadcast)
 * Usage: Reply to an audio message with `.astatus [optional caption]`
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { getTempDir, createTempFilePath, deleteTempFile } = require('../../utils/tempManager');
const { toPTT, toAudio } = require('../../utils/converter');

module.exports = {
  name: 'astatus',
  aliases: ['audiostatus', 'poststatusaudio'],
  description: 'Post replied audio as WhatsApp Status',
  usage: '.astatus (reply to audio) [caption]',
  category: 'media',

  async execute(sock, msg, args = [], extra = {}) {
    const from = extra.from || msg.key.remoteJid;
    const reply = extra.reply || (text => sock.sendMessage(from, { text }, { quoted: msg }));

    try {
      // Find quoted message (the audio we're replying to)
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctxInfo || !ctxInfo.quotedMessage) {
        return reply('❌ Please reply to an audio message with .astatus');
      }

      const quotedMsg = {
        key: {
          remoteJid: from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: ctxInfo.quotedMessage
      };

      const audioMessage = quotedMsg.message?.audioMessage || quotedMsg.message?.message?.audioMessage || quotedMsg.message?.documentMessage;
      if (!audioMessage) {
        return reply('❌ Quoted message is not an audio file. Reply to a voice note or audio file.');
      }

      // Download media
      const mediaBuffer = await downloadMediaMessage(
        quotedMsg,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!mediaBuffer || !Buffer.isBuffer(mediaBuffer)) {
        return reply('❌ Failed to download audio.');
      }

      // Convert to opus (PTT) for best compatibility
      let opusBuffer = null;
      try {
        // Try to convert to opus using ffmpeg helper
        // Determine extension from mimetype if available
        const mimetype = audioMessage.mimetype || audioMessage.mediaType || '';
        const ext = mimetype.split('/')[1] || 'mp3';
        opusBuffer = await toPTT(mediaBuffer, ext);
      } catch (e) {
        console.warn('[astatus] toPTT failed, falling back to toAudio:', e && e.message ? e.message : e);
        try {
          opusBuffer = await toAudio(mediaBuffer, 'tmp');
        } catch (err) {
          console.error('[astatus] conversion failed:', err && err.message ? err.message : err);
          // fallback: send original buffer
          opusBuffer = mediaBuffer;
        }
      }

      // Optional caption
      const caption = args.join(' ').trim() || undefined;

      // Send to status@broadcast
      const msgPayload = {
        audio: opusBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      };
      if (caption) msgPayload.caption = caption;

      await sock.sendMessage('status@broadcast', msgPayload);

      return reply('✅ Audio posted to status successfully!');

    } catch (error) {
      console.error('[astatus] error:', error && error.message ? error.message : error);
      return reply('❌ Failed to post audio to status.');
    }
  }
};
