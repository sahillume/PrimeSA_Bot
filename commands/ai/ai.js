/**
 * AI Chat Command - ChatGPT-style responses
 */

const APIs = require('../../utils/api');

module.exports = {
  name: 'ai',
  aliases: ['gpt', 'chatgpt', 'ask'],
  category: 'ai',
  description: 'Chat with AI (ChatGPT-style)',
  usage: '.ai <question>',
  
  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply('❌ Usage: .ai <question>\n\nExample: .ai What is the capital of France?');
      }
      
      const question = args.join(' ');
      const to = extra.from || msg.key.remoteJid;

      // Start animated "thinking" effect: presence composing + a temporary message
      try {
        await sock.sendPresenceUpdate('composing', to);
      } catch (e) {
        // ignore presence errors
      }

      // send a small thinking message that will be deleted later
      let thinkingMsg = null;
      try {
        thinkingMsg = await sock.sendMessage(to, { text: '🤖 PrimeSA-ai is thinking...'}, { quoted: msg });
      } catch (e) {
        // ignore send errors
      }

      // keep presence alive every 3s until response is ready
      const presenceInterval = setInterval(() => {
        try { sock.sendPresenceUpdate('composing', to); } catch (e) {}
      }, 3000);

      let response;
      try {
        response = await APIs.chatAI(question);
      } finally {
        clearInterval(presenceInterval);
        try { sock.sendPresenceUpdate('paused', to); } catch (e) {}
      }

      // Send only the answer without labels
      const answer = response.response || response.msg || response.data?.msg || response;

      // Delete the thinking message if sent
      try {
        if (thinkingMsg && thinkingMsg.key) {
          await sock.sendMessage(to, { delete: thinkingMsg.key });
        }
      } catch (e) {
        // ignore deletion errors
      }

      await extra.reply(answer);
      
    } catch (error) {
      console.error('[ai] error', error);
      try { await extra.reply(`❌ AI Error: ${error.message}`); } catch(e){}
    }
  }
};
