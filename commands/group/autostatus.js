const fs = require('fs');
const path = require('path');
// owner check will be provided by handler when executing the command (ctx.isOwner)

const configPath = path.join(__dirname, '../data/autostatus.json');

// ---------- Safe Config Loader ----------
function getConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            const defaultConfig = {
                enabled: false,
                react: false,
                emoji: "💚"
            };
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        }

        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);

    } catch (err) {
        // fallback if file is corrupted
        return {
            enabled: false,
            react: false,
            emoji: "💚"
        };
    }
}

// ---------- Safe Config Saver ----------
function saveConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ---------- Main Command ----------
async function autoStatusCommand(sock, msg, args, ctx = {}) {
    const chatId = ctx.from || msg.key.remoteJid;
    const reply = ctx.reply || ((text) => sock.sendMessage(chatId, { text }, { quoted: msg }));
    const sender = msg.key.participant || msg.key.remoteJid;

    const isOwner = !!ctx.isOwner || msg.key.fromMe;

    // Owner-only protection
    if (!msg.key.fromMe && !isOwner) {
        return reply("❌ Owner only command.");
    }

    let config = getConfig();

    // ---------- No Args: Show Panel ----------
    if (!args[0]) {
        return sock.sendMessage(chatId, {
            text:
                `📊 *AutoStatus Panel*

📥 Status: ${config.enabled ? "ON" : "OFF"}
💫 React: ${config.react ? "ON" : "OFF"}
😊 Emoji: ${config.emoji}

📌 Commands:
.autostatus on
.autostatus off
.autostatus react on/off
.autostatus emoji 💚`
        }, { quoted: msg });
    }

    const cmd = args[0].toLowerCase();

    // ---------- Enable / Disable ----------
    if (cmd === "on") {
        config.enabled = true;
    }

    else if (cmd === "off") {
        config.enabled = false;
    }

    // ---------- React Toggle ----------
    else if (cmd === "react") {
        if (!args[1]) {
            return sock.sendMessage(chatId, {
                text: "❌ Usage: .autostatus react on/off"
            }, { quoted: msg });
        }

        config.react = args[1].toLowerCase() === "on";
    }

    // ---------- Emoji Change ----------
    else if (cmd === "emoji") {
        if (!args[1]) {
            return sock.sendMessage(chatId, {
                text: "❌ Usage: .autostatus emoji 💚"
            }, { quoted: msg });
        }

        config.emoji = args[1];
    }

    else {
        return sock.sendMessage(chatId, {
            text: "❌ Invalid command."
        }, { quoted: msg });
    }

    saveConfig(config);

    return reply(`✅ AutoStatus updated: *${cmd}*`);
}
// ---------- Auto Status runtime handler ----------
// This is called from the central message handler to process status messages safely.
async function handleStatus(sock, msg) {
    try {
        // Basic safety checks
        if (!msg || !msg.message) return;

        // Unwrap common containers (ephemeral/viewOnce/documentWithCaption)
        let content = msg.message;
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;

        const cfg = getConfig();
        if (!cfg || !cfg.enabled) return;

        const from = msg.key && msg.key.remoteJid ? msg.key.remoteJid : null;
        if (!from) return;

        // Detect status-type messages: status broadcast or protocol status mention
        const isStatusBroadcast = from === 'status@broadcast' ||
            !!content.groupStatusMentionMessage ||
            (content.protocolMessage && content.protocolMessage.type === 25);

        if (!isStatusBroadcast) return;

        // React to status if configured
        if (cfg.react && !msg.key.fromMe) {
            const emoji = cfg.emoji || '💚';
            try {
                await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
            } catch (e) {
                // Non-fatal, log and continue
                console.error('[AutoStatus] react error:', e && e.message ? e.message : e);
            }
        }

    } catch (err) {
        // Never throw from this helper - handler will continue
        console.error('[AutoStatus] handler error:', err && err.message ? err.message : err);
    }
}

// Export as a proper command module so commandLoader picks it up
module.exports = {
    name: 'autostatus',
    description: 'Configure AutoStatus behaviour (owner only)',
    category: 'owner',
    ownerOnly: true,
    async execute(sock, msg, args, ctx) {
        return autoStatusCommand(sock, msg, args, ctx);
    },
    handleStatus
};
