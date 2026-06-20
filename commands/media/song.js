/**
 * Song Downloader - Download audio from YouTube
 */

const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APIs = require('../../utils/api');
const { toAudio } = require('../../utils/converter');

const AXIOS_DEFAULTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
};

module.exports = {
  name: 'song',
  aliases: ['play', 'music', 'yta'],
  category: 'media',
  description: 'Download audio from YouTube',
  usage: '.song <song name or YouTube link>',
  
  async execute(sock, msg, args) {
    try {
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;
      
      if (!text) {
        return await sock.sendMessage(chatId, { 
          text: 'Usage: .song <song name or YouTube link>' 
        }, { quoted: msg });
      }
      
      let video;
      
      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        video = { url: text };
      } else {
        const search = await yts(text);
        if (!search || !search.videos.length) {
          return await sock.sendMessage(chatId, { 
            text: 'No results found.' 
          }, { quoted: msg });
        }
        video = search.videos[0];
      }
      
      // Inform user and start "thinking/downloading" animation
      const to = chatId;
      try { await sock.sendPresenceUpdate('composing', to); } catch (e) {}
      let thinkingMsg = null;
      try {
        thinkingMsg = await sock.sendMessage(to, { text: `🔎 Searching: *${video.title}*\n⏱ Duration: ${video.timestamp}` }, { quoted: msg });
      } catch (e) {
        thinkingMsg = null;
      }
      const presenceInterval = setInterval(() => { try { sock.sendPresenceUpdate('composing', to); } catch (e) {} }, 3000);

      const updateThinking = async (textUpdate) => {
        try {
          if (thinkingMsg && thinkingMsg.key) {
            // attempt best-effort delete & resend to simulate an update
            try { await sock.sendMessage(to, { delete: thinkingMsg.key }); } catch (e) {}
          }
          thinkingMsg = await sock.sendMessage(to, { text: textUpdate }, { quoted: msg });
        } catch (e) {
          // ignore
        }
      };
      
      // Try multiple APIs with fallback chain
      let audioData;
      let audioBuffer;
      let downloadSuccess = false;
      
      // List of API methods to try
      const apiMethods = [
        { name: 'EliteProTech', method: () => APIs.getEliteProTechDownloadByUrl(video.url) },
        { name: 'Yupra', method: () => APIs.getYupraDownloadByUrl(video.url) },
        { name: 'Okatsu', method: () => APIs.getOkatsuDownloadByUrl(video.url) },
        { name: 'Izumi', method: () => APIs.getIzumiDownloadByUrl(video.url) }
      ];
      
      // Try each API until we successfully download audio
      for (const apiMethod of apiMethods) {
        try {
          audioData = await apiMethod.method();
          const audioUrl = audioData.download || audioData.dl || audioData.url;
          
          if (!audioUrl) {
            console.log(`${apiMethod.name} returned no download URL, trying next API...`);
            continue; // Try next API
          }
          
          // Try to download the audio file - stream first (so we can report progress)
          try {
            // Update thinking
            await updateThinking(`⬇️ Downloading from ${apiMethod.name}...`);

            const audioResponse = await axios.get(audioUrl, {
              responseType: 'stream',
              timeout: 90000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              validateStatus: s => s >= 200 && s < 400,
              headers: {
                ...AXIOS_DEFAULTS.headers,
                'Accept': '*/*',
                'Accept-Encoding': 'identity'
              }
            });

            const total = parseInt(audioResponse.headers['content-length'] || '0', 10) || 0;
            const chunks = [];
            let downloaded = 0;
            let lastPercent = 0;

            await new Promise((resolve, reject) => {
              audioResponse.data.on('data', (c) => {
                chunks.push(c);
                downloaded += c.length;
                if (total) {
                  const percent = Math.floor((downloaded / total) * 100);
                  if (percent - lastPercent >= 5) {
                    lastPercent = percent;
                    updateThinking(`⬇️ Downloading from ${apiMethod.name}: ${percent}%`);
                  }
                }
              });
              audioResponse.data.on('end', resolve);
              audioResponse.data.on('error', reject);
            });

            audioBuffer = Buffer.concat(chunks);
            if (audioBuffer && audioBuffer.length > 0) {
              downloadSuccess = true;
              break;
            }
          } catch (downloadErr) {
            const statusCode = downloadErr.response?.status || downloadErr.status;
            if (statusCode === 451) {
              console.log(`Download blocked (451) from ${apiMethod.name}, trying next API...`);
              continue;
            }

            // Fallback to arraybuffer mode if stream fails
            try {
              await updateThinking(`⬇️ Stream failed, trying fallback download from ${apiMethod.name}...`);
              const audioResponse = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: 90000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                decompress: true,
                validateStatus: s => s >= 200 && s < 400,
                headers: {
                  ...AXIOS_DEFAULTS.headers,
                  'Accept': '*/*',
                  'Accept-Encoding': 'identity'
                }
              });
              audioBuffer = Buffer.from(audioResponse.data);
              if (audioBuffer && audioBuffer.length > 0) {
                downloadSuccess = true;
                break;
              }
            } catch (streamErr) {
              const streamStatusCode = streamErr.response?.status || streamErr.status;
              if (streamStatusCode === 451) {
                console.log(`Stream/arraybuffer download blocked (451) from ${apiMethod.name}, trying next API...`);
              } else {
                console.log(`Download failed from ${apiMethod.name}:`, streamErr.message || streamErr);
              }
              continue;
            }
          }
        } catch (apiErr) {
          // API call failed, try next API
          console.log(`${apiMethod.name} API failed:`, apiErr.message);
          continue;
        }
      }
      
      // If all APIs failed, throw error
      if (!downloadSuccess || !audioBuffer) {
        throw new Error('All download sources failed. The content may be unavailable or blocked in your region.');
      }

      // Validate buffer
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Downloaded audio buffer is empty');
      }

      // Detect actual file format from signature
      const firstBytes = audioBuffer.slice(0, 12);
      const hexSignature = firstBytes.toString('hex');
      const asciiSignature = firstBytes.toString('ascii', 4, 8);

      let actualMimetype = 'audio/mpeg';
      let fileExtension = 'mp3';
      let detectedFormat = 'unknown';

      // Check for MP4/M4A (ftyp box)
      if (asciiSignature === 'ftyp' || hexSignature.startsWith('000000')) {
        // Check if it's M4A (audio/mp4)
        const ftypBox = audioBuffer.slice(4, 8).toString('ascii');
        if (ftypBox === 'ftyp') {
          detectedFormat = 'M4A/MP4';
          actualMimetype = 'audio/mp4';
          fileExtension = 'm4a';
        }
      }
      // Check for MP3 (ID3 tag or MPEG frame sync)
      else if (audioBuffer.toString('ascii', 0, 3) === 'ID3' || 
               (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)) {
        detectedFormat = 'MP3';
        actualMimetype = 'audio/mpeg';
        fileExtension = 'mp3';
      }
      // Check for OGG/Opus
      else if (audioBuffer.toString('ascii', 0, 4) === 'OggS') {
        detectedFormat = 'OGG/Opus';
        actualMimetype = 'audio/ogg; codecs=opus';
        fileExtension = 'ogg';
      }
      // Check for WAV
      else if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
        detectedFormat = 'WAV';
        actualMimetype = 'audio/wav';
        fileExtension = 'wav';
      }
      else {
        // Default: try to pick sensible default
        actualMimetype = 'audio/mpeg';
        fileExtension = 'mp3';
        detectedFormat = 'Unknown (defaulting to MP3)';
      }

      // Convert to MP3 if not already MP3
      let finalBuffer = audioBuffer;
      let finalMimetype = 'audio/mpeg';
      let finalExtension = 'mp3';

      // Indicate conversion step
      await updateThinking('🔄 Converting audio for best compatibility...');

      if (fileExtension !== 'mp3') {
        try {
          finalBuffer = await toAudio(audioBuffer, fileExtension);
          if (!finalBuffer || finalBuffer.length === 0) {
            throw new Error('Conversion returned empty buffer');
          }
          finalMimetype = 'audio/mpeg';
          finalExtension = 'mp3';
        } catch (convErr) {
          console.warn('Conversion to mp3 failed, will attempt to send original buffer:', convErr && convErr.message ? convErr.message : convErr);
          // fallback to original buffer
          finalBuffer = audioBuffer;
          finalMimetype = actualMimetype;
          finalExtension = fileExtension;
        }
      }

      // Send buffer as MP3
      // Ensure audioData exists for naming
      audioData = audioData || {};
      const safeTitle = (audioData.title || video.title || 'song')
        .replace(/[^\u0000-\u007F]/g, '')
        .replace(/[\/:*?"<>|]/g, '')
        .trim() || 'song';

      await updateThinking('📤 Uploading audio to chat...');
      await sock.sendMessage(chatId, {
        audio: finalBuffer,
        mimetype: finalMimetype,
        fileName: `${safeTitle}.${finalExtension}`,
        ptt: false
      }, { quoted: msg });

      // Clear presence & delete thinking message
      try { clearInterval(presenceInterval); } catch (e) {}
      try { await sock.sendPresenceUpdate('paused', to); } catch (e) {}
      try { if (thinkingMsg && thinkingMsg.key) await sock.sendMessage(to, { delete: thinkingMsg.key }); } catch (e) {}

      // Cleanup: Delete temp files created during conversion
      try {
        // Use centralized tempManager cleanup for safety
        const tempDir = require('../../utils/tempManager').getTempDir();
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          const now = Date.now();
          for (const file of files) {
            const filePath = path.join(tempDir, file);
            try {
              const stats = fs.statSync(filePath);
              // Delete temp files older than 30 seconds
              if (now - stats.mtimeMs > 30000) {
                try { require('../../utils/tempManager').deleteTempFile(filePath); } catch (e) {}
              }
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
    } catch (err) {
      console.error('Song command error:', err);
      // cleanup presence/thinking if they exist
      try { clearInterval(presenceInterval); } catch (e) {}
      try { await sock.sendPresenceUpdate('paused', chatId); } catch (e) {}
      try { if (thinkingMsg && thinkingMsg.key) await sock.sendMessage(chatId, { delete: thinkingMsg.key }); } catch (e) {}

      // Provide more specific error messages
      let errorMessage = '❌ Failed to download song.';
      if (err.message && err.message.includes('blocked')) {
        errorMessage = '❌ Download blocked. The content may be unavailable in your region or due to legal restrictions.';
      } else if (err.response?.status === 451 || err.status === 451) {
        errorMessage = '❌ Content unavailable (451). This may be due to legal restrictions or regional blocking.';
      } else if (err.message && err.message.includes('All download sources failed')) {
        errorMessage = '❌ All download sources failed. The content may be unavailable or blocked.';
      }

      await sock.sendMessage(msg.key.remoteJid, {
        text: errorMessage
      }, { quoted: msg });
    }
  }
};
