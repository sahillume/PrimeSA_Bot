const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getGroupSettings } = require('../database');
const TEMP_DIR = path.join(__dirname, '../tmp');

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}
const deletedMessages = new Map();
setInterval(() => {

    for (const [id, data] of deletedMessages.entries()) {

        try {

            if (
                data.mediaPath &&
                fs.existsSync(data.mediaPath)
            ) {
                fs.unlinkSync(data.mediaPath);
            }

        } catch { }

        deletedMessages.delete(id);

    }

}, 10 * 60 * 1000);

async function downloadMedia(message, type) {

    try {

        const stream = await downloadContentFromMessage(message, type);

        let buffer = Buffer.alloc(0);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        return buffer;

    } catch {

        return null;

    }

}

module.exports = (sock) => {


    sock.ev.on('messages.upsert', async ({ messages }) => {

        for (const msg of messages) {

            try {

                if (!msg.key?.id) continue;
                if (msg.key.fromMe) continue;

                const stored = {
                    msg,
                    mediaPath: null,
                    mediaType: null
                };

                if (msg.message?.imageMessage) {

                    const buffer = await downloadMedia(
                        msg.message.imageMessage,
                        'image'

                    );

                    if (buffer) {

                        const file = path.join(
                            TEMP_DIR,
                            `${msg.key.id}.jpg`
                        );

                        fs.writeFileSync(file, buffer);

                        stored.mediaPath = file;
                        stored.mediaType = 'image';

                    }

                }

                else if (msg.message?.videoMessage) {

                    const size = Number(msg.message.videoMessage.fileLength || 0);

                    // Skip videos larger than 10 MB
                    if (size > 10 * 1024 * 1024) continue;

                    const buffer = await downloadMedia(
                        msg.message.videoMessage,
                        'video'
                    );

                    if (buffer) {

                        const file = path.join(
                            TEMP_DIR,
                            `${msg.key.id}.mp4`
                        );

                        fs.writeFileSync(file, buffer);

                        stored.mediaPath = file;
                        stored.mediaType = 'video';

                    }

                }

                else if (msg.message?.audioMessage) {

                    const buffer = await downloadMedia(
                        msg.message.audioMessage,
                        'audio'
                    );

                    if (buffer) {

                        const file = path.join(
                            TEMP_DIR,
                            `${msg.key.id}.mp3`
                        );

                        fs.writeFileSync(file, buffer);

                        stored.mediaPath = file;
                        stored.mediaType = 'audio';

                    }

                }

                else if (msg.message?.stickerMessage) {

                    const buffer = await downloadMedia(
                        msg.message.stickerMessage,
                        'sticker'
                    );

                    if (buffer) {

                        const file = path.join(
                            TEMP_DIR,
                            `${msg.key.id}.webp`
                        );

                        fs.writeFileSync(file, buffer);

                        stored.mediaPath = file;
                        stored.mediaType = 'sticker';

                    }

                }

                else if (msg.message?.documentMessage) {

                    const ext =
                        msg.message.documentMessage.fileName?.split('.').pop() ||
                        'bin';

                    const buffer = await downloadMedia(
                        msg.message.documentMessage,
                        'document'
                    );

                    if (buffer) {

                        const file = path.join(
                            TEMP_DIR,
                            `${msg.key.id}.${ext}`
                        );

                        fs.writeFileSync(file, buffer);

                        stored.mediaPath = file;
                        stored.mediaType = 'document';

                    }

                }

                deletedMessages.set(msg.key.id, stored);

                if (deletedMessages.size > 100) {

                    const first = deletedMessages.keys().next().value;
                    const old = deletedMessages.get(first);

                    if (
                        old?.mediaPath &&
                        fs.existsSync(old.mediaPath)
                    ) {
                        try {
                            fs.unlinkSync(old.mediaPath);
                        } catch { }
                    }

                    deletedMessages.delete(first);
                }
            } catch (e) {
                console.error(e);
            }
        }

    });

    sock.ev.on('messages.update', async (updates) => {

        try {

            for (const update of updates) {

                if (update.update?.message !== null) continue;

                const stored = deletedMessages.get(update.key.id);

                if (!stored) continue;

                const original = stored.msg;
                if (!original) continue;

                const jid = update.key.remoteJid;

                // Groups: obey the setting
                // Private chats: always enabled
                if (jid.endsWith('@g.us')) {

                    const settings = getGroupSettings(jid);

                    if (!settings.antidelete) {
                        continue;
                    }

                }
                // No check for private chats - AntiDelete is always active there.

                const sender =
                    original.key.participant ||
                    original.key.remoteJid;

                let senderName = sender.split('@')[0];

                try {
                    senderName =
                        original.pushName ||
                        sender.split('@')[0];

                } catch { }

                let text =
                    original.message?.conversation ||
                    original.message?.extendedTextMessage?.text ||
                    '*Deleted Media Message*';

                const report =

                    `╭━━━〔 PRIME ANTIDELETE 〕━━━⬣
┃ 👤 Sender
┃ ${senderName}
┃
┃ 📞 Number
┃ @${sender.split('@')[0]}
┃
┃ 💬 Deleted Message
┃ ${text}
╰━━━━━━━━━━━━━━━━━━⬣`;


                await sock.sendMessage(jid, {
                    text: report,
                    mentions: [sender]
                });

                if (
                    stored.mediaPath &&
                    fs.existsSync(stored.mediaPath)
                ) {

                    switch (stored.mediaType) {

                        case 'image':

                            await sock.sendMessage(jid, {
                                image: { url: stored.mediaPath },
                                caption: '🖼️Sahil has Recovered deleted image'
                            });

                            break;

                        case 'video':

                            await sock.sendMessage(jid, {
                                video: { url: stored.mediaPath },
                                caption: '🎥Sahil has Recovered deleted video'
                            });

                            break;

                        case 'audio':

                            await sock.sendMessage(jid, {
                                audio: { url: stored.mediaPath },
                                mimetype: 'audio/mpeg',
                                ptt: false
                            });

                            break;

                        case 'sticker':

                            await sock.sendMessage(jid, {
                                sticker: { url: stored.mediaPath }
                            });

                            break;

                        case 'document':

                            await sock.sendMessage(jid, {
                                document: { url: stored.mediaPath },
                                fileName: 'Recovered_File'
                            });

                            break;

                    }

                }

                // Delete the temporary media file
                try {

                    if (
                        stored.mediaPath &&
                        fs.existsSync(stored.mediaPath)
                    ) {
                        fs.unlinkSync(stored.mediaPath);
                    }

                } catch { }

                // Remove from memory
                deletedMessages.delete(update.key.id);

            }

        } catch (err) {

            console.error(
                'AntiDelete Error:',
                err.message
            );

        }

    });

};

