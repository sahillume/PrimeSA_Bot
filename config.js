/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['27835515085','27724469823'], // Add your number without + or spaces (e.g., 2783551XXXX)
    ownerName: ['Professor', 'Sahil'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'PrimeSA_Bot',
    prefix: '.',
    sessionName: 'session',
    sessionID: process.env.SESSION_ID || '',
    newsletterJid: '120363406672648713@newsletter', // Newsletter JID for menu forwarding
    updateZipUrl: 'https://github.com/sahillume/PrimeBot/archive/refs/heads/main.zip', // URL to latest code zip for .update command
    
    // Sticker Configuration
    packname: 'PrimeSA_Bot',
    
    // Bot Behavior
    selfMode: false, // Private mode - only owner can use commands
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    autoReact: false,
    autoReactMode: 'bot', // set bot or all via cmd
    autoDownload: false,
    
    // Group Settings Defaults
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete', // 'delete', 'kick', 'warn'
      antitag: false,
      antitagAction: 'delete',
      antiall: false, // Owner only - blocks all messages from non-admins
      antiviewonce: false,
      antibot: false,
      anticall: false, // Anti-call feature
      antigroupmention: false, // Anti-group mention feature
      antigroupmentionAction: 'delete', // 'delete', 'kick'
      welcome: false,
      welcomeMessage: '╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @user 👋\n┃Member count: #memberCount\n┃𝚃𝙸𝙼𝙴: time⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\ngroupDesc\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ botName*',
      goodbye: false,
      goodbyeMessage: 'Goodbye @user 👋 We will never miss you!',
      antiSpam: false,
      antidelete: true,
      nsfw: false,
      detect: false,
      chatbot: false,
      autosticker: false // Auto-convert images/videos to stickers
    },
    
    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: ''
    },
    
    // Message Configuration
    messages: {
        wait: '⏳ PrimeSA_Bot is processing your request...',
        success: '✅ PrimeSA_Bot completed successfully!',
        error: '❌ PrimeSA_Bot encountered an error!',
        ownerOnly: '👑 This command is restricted to the bot owner.',
        adminOnly: '🛡️ This command is restricted to group admins.',
        groupOnly: '👥 This command can only be used in groups.',
        privateOnly: '💬 This command can only be used in private chat.',
        botAdminNeeded: '🤖 PrimeSA_Bot must be an admin to perform this action.',
        invalidCommand: '❓ Unknown command. Type .menu to view available commands.'
    },
    
    // Timezone
    timezone: 'Africa/Johannesburg',
    
    // Limits
    maxWarnings: 3,
    
    // Social Links (optional)
    social: {
        github: 'https://github.com/sahillume/PrimeBot',
      youtube: 'https://youtube.com/@professorsahil-m7q?si=ZXZpSGxNwQaDy0J3'
    }
};
  