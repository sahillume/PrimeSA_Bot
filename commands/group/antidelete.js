const database = require('../../database');

module.exports = {
    name: 'antidelete',
    aliases: ['deleteprotect'],
    description: 'Enable or disable AntiDelete',
    category: 'group',
    adminOnly: true,
    groupOnly: true,

    async execute(sock, msg, args, { from, reply }) {

        const settings = database.getGroupSettings(from);

        if (!args[0]) {
            return reply(
                `╭━━〔 ANTIDELETE 〕━━⬣

Status : ${settings.antidelete ? '🟢 ON' : '🔴 OFF'}

Commands

.antidelete on
.antidelete off

╰━━━━━━━━━━━━⬣`
            );
        }

        const option = args[0].toLowerCase();

        if (option === 'on') {

            database.updateGroupSettings(from, {
                antidelete: true
            });

            return reply('✅ AntiDelete enabled.');

        }

        if (option === 'off') {

            database.updateGroupSettings(from, {
                antidelete: false
            });

            return reply('❌ AntiDelete disabled.');

        }

        return reply('Usage:\n.antidelete on\n.antidelete off');

    }
};