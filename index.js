const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const P = require('pino');
const config = require('./setting');
const axios = require('axios');
const path = require('path');
const AdmZip = require('adm-zip');

// Owner numbers
const ownerNumber = ["50944191145"];

// ==================== LOCAL FILES LOADER ====================
function loadLocalFiles() {
  console.log("📂 Loading local lib and plugins...");
  
  if (!fs.existsSync('./lib')) {
    console.log("❌ lib folder not found! Creating empty lib folder...");
    fs.mkdirSync('./lib', { recursive: true });
  } else {
    console.log("✅ lib folder found");
    const libFiles = fs.readdirSync('./lib').filter(f => f.endsWith('.js'));
    console.log(`📚 Found ${libFiles.length} lib files`);
  }
  
  if (!fs.existsSync('./plugins')) {
    console.log("❌ plugins folder not found! Creating empty plugins folder...");
    fs.mkdirSync('./plugins', { recursive: true });
  } else {
    console.log("✅ plugins folder found");
    const pluginFiles = fs.readdirSync('./plugins').filter(f => f.endsWith('.js'));
    console.log(`🔌 Found ${pluginFiles.length} plugin files`);
  }
  
  // Check for darkseid.html
  if (fs.existsSync('./lib/darkseid.html')) {
    console.log("✅ darkseid.html found in lib folder");
  } else {
    console.log("⚠️ darkseid.html not found in lib folder");
  }
  
  console.log("✅ Local files loaded successfully!");
}

loadLocalFiles();

// Message store for anti-delete
const messageStore = new Map();

// Group settings store (welcome on/off, welcome message, goodbye on/off, goodbye message)
const groupSettings = new Map();

// Default welcome message
const DEFAULT_WELCOME = "╭──❍ *WELCOME* ❍──╮\n│\n├─❍ *User:* @user\n├─❍ *Group:* @group\n├─❍ *Members:* @count\n│\n╰──────────────────────❍\n\n> ✨ Welcome! Hope you enjoy your stay! 🎉";

// Default goodbye message
const DEFAULT_GOODBYE = "╭──❍ *GOODBYE* ❍──╮\n│\n├─❍ *User:* @user\n├─❍ *Group:* @group\n├─❍ *Left the group*\n│\n╰──────────────────────❍\n\n> ✨ See you soon! Take care! 👋";

// Session handling
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
const CREDS = path.join(AUTH_DIR, 'creds.json');

if (!fs.existsSync(CREDS)) {
  if (!config.SESSION_ID) {
    console.log("❌ SESSION_ID missing");
    process.exit(1);
  }
  
  let session = config.SESSION_ID.trim();
  if (!session.startsWith("SBG-MD~")) {
    console.log("❌ Invalid SBG-MD session format");
    process.exit(1);
  }
  const encoded = session.substring("SBG-MD~".length);
  const raw = Buffer.from(encoded, 'base64');
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  try {
    const text = raw.toString('utf8');
    const creds = JSON.parse(text);
    fs.writeFileSync(CREDS, JSON.stringify(creds, null, 2), 'utf8');
    console.log("♻️ SBG-MD creds session restored successfully");
  } catch {
    try {
      const zip = new AdmZip(raw);
      zip.extractAllTo(AUTH_DIR, true);
      if (!fs.existsSync(CREDS)) throw new Error('creds.json missing from session bundle');
      console.log("♻️ SBG-MD multi-file session restored successfully");
    } catch (e) {
      console.error("❌ Could not restore SESSION_ID:", e.message);
      process.exit(1);
    }
  }
}

// Load group settings from file if exists
const SETTINGS_FILE = path.join(__dirname, 'group_settings.json');
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    const savedSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    for (const [groupId, settings] of Object.entries(savedSettings)) {
      groupSettings.set(groupId, settings);
    }
    console.log("✅ Group settings loaded from file");
  } catch (e) {
    console.log("⚠️ Could not load group settings");
  }
}

// Save group settings to file
function saveGroupSettings() {
  try {
    const settingsObj = {};
    for (const [groupId, settings] of groupSettings.entries()) {
      settingsObj[groupId] = settings;
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsObj, null, 2), 'utf8');
  } catch (e) {
    console.error("❌ Could not save group settings:", e);
  }
}

// Express server for web
const express = require('express');
const app = express();
const port = process.env.PORT || 9090;

// Serve the SBG-MD logo used by the web page
app.get('/sbg-logo.png', (req, res) => {
  const logoPath = path.join(__dirname, 'lib', 'sbg-logo.png');
  if (fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    res.status(404).send('Logo not found');
  }
});

// Serve HTML page
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'lib', 'darkseid.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SBG-MD Bot</title>
        <style>
          body { font-family: Arial; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center; padding: 50px; color: white; }
          .container { background: rgba(255,255,255,0.1); padding: 30px; border-radius: 10px; }
          h1 { font-size: 3em; }
          .status { color: #4CAF50; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 SBG-MD</h1>
          <p class="status">✅ BOT IS CONNECTED</p>
          <p>Type .menu in WhatsApp to see commands</p>
          <p>Owner: ${config.OWNER_NAME || 'SBG'}</p>
        </div>
      </body>
      </html>
    `);
  }
});

app.get('/lib/darkseid.html', (req, res) => {
  res.redirect('/');
});

// Functional session generator
app.use(express.json({ limit: '1mb' }));
const sessionJobs = new Map();

app.get('/session', (req, res) => {
  const file = path.join(__dirname, 'lib', 'session.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  res.status(404).send('Session page unavailable');
});

app.post('/api/session/pair', async (req, res) => {
  const phone = String(req.body?.phoneNumber || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone number. Use country code without +.' });
  const jobId = Math.random().toString(36).slice(2, 10);
  const dir = path.join(__dirname, 'tmp_sessions', jobId);
  fs.mkdirSync(dir, { recursive: true });
  sessionJobs.set(jobId, { status: 'starting', dir });
  res.json({ jobId });
  (async () => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(dir);
      const sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: P({ level: 'silent' }), browser: ['SBG-MD', 'Chrome', '1.0.0'] });
      sock.ev.on('creds.update', saveCreds);
      if (!sock.authState.creds.registered) {
        await new Promise(r => setTimeout(r, 1200));
        const code = await sock.requestPairingCode(phone);
        sessionJobs.set(jobId, { status: 'pairing', code, dir });
      } else {
        sessionJobs.set(jobId, { status: 'paired', dir });
      }
      const timeout = setTimeout(async () => {
        try { sock.end(undefined); } catch {}
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        sessionJobs.delete(jobId);
      }, 5 * 60 * 1000);
      sock.ev.on('connection.update', ({ connection }) => {
        if (connection === 'open') {
          clearTimeout(timeout);
          try {
            const zip = new AdmZip();
            for (const file of fs.readdirSync(dir)) zip.addLocalFile(path.join(dir, file));
            const session = 'SBG-MD~' + zip.toBuffer().toString('base64');
            sessionJobs.set(jobId, { status: 'complete', session, dir });
            try { sock.end(undefined); } catch {}
          } catch (e) { sessionJobs.set(jobId, { status: 'error', error: e.message, dir }); }
        }
      });
    } catch (e) {
      sessionJobs.set(jobId, { status: 'error', error: e.message, dir });
    }
  })();
});

app.get('/api/session/status/:jobId', (req, res) => {
  const job = sessionJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Session job not found or expired' });
  res.json({ status: job.status, code: job.code || null, session: job.session || null, error: job.error || null });
});

app.listen(port, '0.0.0.0', () => console.log(`🌐 Web server running on port ${port}`));

// Function to get user profile picture
async function getProfilePicture(sock, jid) {
  try {
    const ppUrl = await sock.profilePictureUrl(jid, 'image');
    return ppUrl;
  } catch {
    return 'https://i.ibb.co/spyR3qdd/SBG-MD.jpg'; // Default image
  }
}

// Main bot function
async function connectToWA() {
  console.log("✅ Using local lib and plugins only");
  
  const prefix = config.PREFIX || '.';
  console.log(`🤖 SBG-MD Connecting with prefix: "${prefix}"`);
  
  const { state: authState, saveCreds: saveCreds } = await useMultiFileAuthState(__dirname + '/auth_info_baileys/');
  
  // Load required modules from lib
  let functions, sms, botConfig;
  
  try {
    functions = require('./lib/functions');
    sms = require('./lib/msg').sms;
    botConfig = require('./lib/bot');
    console.log("✅ Lib files loaded successfully");
  } catch (err) {
    console.log("❌ Error loading lib files:", err);
    process.exit(1);
  }
  
  const { getBuffer, getGroupAdmins, fetchJson, runtime, sleep, isUrl, getRandom } = functions;
  
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: true,
    auth: authState,
    version: version
  });

  // Connection update handler
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const statusCode = lastDisconnect.error?.output?.statusCode;
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ Device Logged Out, please delete auth_info_baileys and rescan.");
        process.exit();
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        console.log("❌ Connection replaced. Another session is active.");
        process.exit();
      } else if (lastDisconnect.error?.message?.includes("Bad MAC")) {
        console.log("⚠️ Bad MAC error. Deleting session...");
        fs.rmSync(__dirname + '/auth_info_baileys', { recursive: true, force: true });
        connectToWA();
      } else {
        console.log("🔄 Connection closed, reconnecting...");
        connectToWA();
      }
    } else if (connection === 'open') {
      console.log("✅ SBG-MD Bot connected to WhatsApp!");
      
      // Load plugins
      console.log("🔌 Loading plugins...");
      const pluginFiles = fs.readdirSync('./plugins/').filter(f => f.endsWith('.js'));
      let loadedCount = 0;
      
      for (const file of pluginFiles) {
        try {
          require('./plugins/' + file);
          loadedCount++;
          console.log(`  ✅ Loaded: ${file}`);
        } catch (err) {
          console.log(`  ❌ Failed to load ${file}: ${err.message}`);
        }
      }
      
      console.log(`✅ Plugins loaded: ${loadedCount}/${pluginFiles.length}`);
      
      // Send connection message with image
      const aliveMsg = `*╭──────────────●●►*\n> *SBG-MD CONNECTED SUCCESSFULLY*\n\n> *Type ${prefix}menu to view commands*  \n\n*👑 JOIN DARKSEID COMMUNITY:*\nhttps://chat.whatsapp.com/J0lB5XlsKMTFgw28N2p1qu\n\n*╭⊱✫ SBG-MD ✫⊱╮*\n*│✫📂 Bot Name: ${botConfig.BOT_NAME}*\n*│✫🛡️ Owner: ${config.OWNER_NAME}*\n*│✫♻️ Prefix: ${prefix}*\n*│✫🌍 Mode: ${config.MODE}*\n*│✫⏰ Uptime: ${runtime(process.uptime())}*\n*╰──────────────●●►*\n\n> Enjoy Using SBG-MD`;
      
      // Image URL for connection message
      const imageUrl = 'https://i.ibb.co/spyR3qdd/SBG-MD.jpg';
      
      try {
        // Send to owner with image
        sock.sendMessage(ownerNumber[0] + '50944191145@s.whatsapp.net', {
          image: { url: imageUrl },
          caption: aliveMsg
        }).catch(() => {
          // Fallback to text if image fails
          sock.sendMessage(ownerNumber[0] + '@s.whatsapp.net', { text: aliveMsg });
        });
        
        // Send to bot's own number
        sock.sendMessage(sock.user.id, {
          image: { url: imageUrl },
          caption: aliveMsg
        }).catch(() => {
          sock.sendMessage(sock.user.id, { text: aliveMsg });
        });
        
        console.log("✅ Connection message sent with image");
      } catch (err) {
        console.log("⚠️ Could not send connection message with image, sending text only");
        sock.sendMessage(ownerNumber[0] + '@s.whatsapp.net', { text: aliveMsg });
      }
    }
  });

  // Anti-call feature
  const callMsg = `⚠️ *ANTI-CALL IS ACTIVE* ⚠️\n\nDear User,\n\nYou have attempted to call the bot. To ensure uninterrupted service, please refrain from calling.\n\nThank you for your understanding.\n\n${botConfig.COPYRIGHT || 'SBG-MD'}`;
  
  sock.ev.on('call', async (calls) => {
    if (config.ANTI_CALL === 'true') {
      for (const call of calls) {
        if (call.status === 'offer') {
          await sock.sendMessage(call.from, { text: callMsg });
          await sock.rejectCall(call.id, call.from);
          console.log(`📞 Rejected call from ${call.from}`);
        }
      }
    }
  });

  // Emoji list for auto react
  const emojiList = ['😊', '👍', '😂', '❤️', '🔥', '🥰', '👌', '💯', '🤣', '😎', '✨', '⭐', '🌟', '💫', '⚡', '💥', '🙏', '🎉', '👏', '💯', '👑', '🤖', '🫡', '✅', '🔰', '💚', '💙', '💜', '🖤', '🤍', '💛', '🧡', '💖', '💝', '💞'];
  
  // Creds update
  sock.ev.on('creds.update', saveCreds);
  
  // ==================== GROUP PARTICIPANTS UPDATE (WELCOME/GOODBYE) ====================
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { id, participants, action } = update;
      
      if (!id || !participants || !action) return;
      
      const groupMetadata = await sock.groupMetadata(id).catch(() => null);
      if (!groupMetadata) return;
      
      const groupName = groupMetadata.subject || 'Group';
      const groupDesc = groupMetadata.desc || 'No description';
      const memberCount = groupMetadata.participants.length;
      
      // Get group settings
      const settings = groupSettings.get(id) || {
        welcome: true,
        goodbye: true,
        welcomeMsg: DEFAULT_WELCOME,
        goodbyeMsg: DEFAULT_GOODBYE,
        antilink: true,
        antistatus: false,
        antibad: true
      };
      
      for (const participant of participants) {
        const participantJid = participant.split('@')[0];
        const pushName = participant.split('@')[0];
        
        if (action === 'add') {
          // WELCOME MESSAGE - Only if enabled
          if (settings.welcome) {
            try {
              // Get user's profile picture
              const ppUrl = await getProfilePicture(sock, participant);
              
              // Format welcome message with variables
              let welcomeText = settings.welcomeMsg || DEFAULT_WELCOME;
              welcomeText = welcomeText
                .replace(/@user/g, `@${participantJid}`)
                .replace(/@group/g, groupName)
                .replace(/@count/g, memberCount)
                .replace(/@desc/g, groupDesc.substring(0, 100));
              
              // Send welcome message with user's DP
              await sock.sendMessage(id, {
                image: { url: ppUrl },
                caption: welcomeText,
                mentions: [participant]
              }).catch(async () => {
                // Fallback to text if image fails
                await sock.sendMessage(id, {
                  text: welcomeText,
                  mentions: [participant]
                });
              });
              
              console.log(`👋 Welcome message sent to ${participantJid} in ${groupName}`);
            } catch (error) {
              console.error("❌ Welcome message error:", error);
            }
          }
          
        } else if (action === 'remove') {
          // GOODBYE MESSAGE - Only if enabled
          if (settings.goodbye) {
            try {
              // Get user's profile picture
              const ppUrl = await getProfilePicture(sock, participant).catch(() => 'https://i.ibb.co/spyR3qdd/SBG-MD.jpg');
              
              // Format goodbye message with variables
              let goodbyeText = settings.goodbyeMsg || DEFAULT_GOODBYE;
              goodbyeText = goodbyeText
                .replace(/@user/g, `@${participantJid}`)
                .replace(/@group/g, groupName)
                .replace(/@count/g, memberCount);
              
              // Send goodbye message with user's DP
              await sock.sendMessage(id, {
                image: { url: ppUrl },
                caption: goodbyeText,
                mentions: [participant]
              }).catch(async () => {
                // Fallback to text if image fails
                await sock.sendMessage(id, {
                  text: goodbyeText,
                  mentions: [participant]
                });
              });
              
              console.log(`👋 Goodbye message sent for ${participantJid} in ${groupName}`);
            } catch (error) {
              console.error("❌ Goodbye message error:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("❌ Welcome/Goodbye error:", error);
    }
  });

  // Main message handler
  sock.ev.on('messages.upsert', async (messageUpdate) => {
    try {
      const msg = messageUpdate.messages[0];
      
      if (!msg || !msg.message) {
        return;
      }
      
      // ============ STATUS HANDLING / STATUS SHARES IN GROUPS ============
      // A status posted directly to status@broadcast is NOT a group message.
      // A status shared/mentioned inside a group can arrive with one of the
      // WhatsApp status message wrappers below. When Anti-Status is enabled,
      // delete that group message (requires the bot to be a group admin).
      const rawMsg = msg.message || {};
      const msgTypeForStatus = getContentType(rawMsg) || '';
      const isStatusShare = Boolean(
        rawMsg.groupStatusMessage ||
        rawMsg.groupStatusMessageV2 ||
        rawMsg.statusMentionMessage ||
        rawMsg.statusMentionMessageV2 ||
        msgTypeForStatus === 'groupStatusMessage' ||
        msgTypeForStatus === 'groupStatusMessageV2' ||
        msgTypeForStatus === 'statusMentionMessage' ||
        msgTypeForStatus === 'statusMentionMessageV2'
      );

      if (msg.key && msg.key.remoteJid !== 'status@broadcast' && msg.key.remoteJid?.endsWith('@g.us') && isStatusShare) {
        const settings = groupSettings.get(msg.key.remoteJid) || { antistatus: false };
        if (settings.antistatus === true) {
          try {
            await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
            console.log(`🗑️ Anti-Status: status share deleted in ${msg.key.remoteJid}`);
          } catch (error) {
            console.error('❌ Anti-Status delete failed:', error.message);
          }
          return;
        }
      }

      // Direct WhatsApp statuses are handled separately and are never deleted here.
      if (msg.key && msg.key.remoteJid === 'status@broadcast') {
        
        // AUTO STATUS SEEN - Yeh status ko read karega
        if (config.AUTO_STATUS_MSG === 'true') {
          try {
            await sock.readMessages([msg.key]);
            console.log("📖 Status seen");
            
            // Status par react bhi karega
            const botJid = await jidNormalizedUser(sock.user.id);
            await sock.sendMessage(msg.key.remoteJid, {
              react: {
                key: msg.key,
                text: '💚'
              }
            }, {
              statusJidList: [msg.key.participant, botJid]
            }).catch(() => {});
            
          } catch (error) {
            console.error("❌ Failed to mark status as read:", error);
          }
        }
        
        // AUTO STATUS REPLY - Status uploader ko reply
        if (config.AUTO_STATUS_REPLY === 'true' && msg.key.participant) {
          try {
            const statusReplyMsg = botConfig.STATUS_MSG || 'Thanks for status! ❤️';
            await sock.sendMessage(msg.key.participant, {
              text: statusReplyMsg
            }).catch(() => {});
          } catch (error) {}
        }
        
        return; // Status messages ko further process nahi karna
      }
      
      // Get message type and content
      const msgType = getContentType(msg.message) || 'conversation';
      
      // Get message text
      let body = '';
      if (msgType === 'conversation') {
        body = msg.message.conversation || '';
      } else if (msgType === 'extendedTextMessage') {
        body = msg.message.extendedTextMessage?.text || '';
      } else if (msgType === 'imageMessage') {
        body = msg.message.imageMessage?.caption || '';
      } else if (msgType === 'videoMessage') {
        body = msg.message.videoMessage?.caption || '';
      }
      
      // Create m object
      const m = sms(sock, msg);
      
      // Check if it's a command
      const isCmd = body.startsWith(prefix);
      const command = isCmd ? body.slice(prefix.length).split(' ')[0].toLowerCase().trim() : '';
      const args = body.split(' ').slice(1);
      const q = args.join(' ');
      const from = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.remoteJid;
      const senderNumber = sender.split('@')[0];
      const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const isGroup = from.endsWith('@g.us');
      const isOwner = ownerNumber.includes(senderNumber);
      const pushName = msg.pushName || senderNumber;
      const botNumberPure = sock.user.id.split(':')[0];
      const isMe = senderNumber === botNumberPure;
      
      // Get mentions
      let mentions = [];
      if (msgType === 'extendedTextMessage' && msg.message.extendedTextMessage?.contextInfo?.mentionedJid) {
        mentions = msg.message.extendedTextMessage.contextInfo.mentionedJid;
      }
      
      // Group metadata
      let groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins;
      if (isGroup) {
        groupMetadata = await sock.groupMetadata(from).catch(() => ({}));
        groupName = groupMetadata?.subject || '';
        participants = groupMetadata?.participants || [];
        groupAdmins = participants.filter(p => p.admin).map(p => p.id);
        isBotAdmins = groupAdmins.includes(botNumber);
        isAdmins = groupAdmins.includes(sender);
      }
      
      // Get group settings
      let groupSetting = groupSettings.get(from) || {
        welcome: true,
        goodbye: true,
        welcomeMsg: DEFAULT_WELCOME,
        goodbyeMsg: DEFAULT_GOODBYE,
        antilink: true,
        antistatus: false,
        antibad: true
      };
      
      // Reply function
      const reply = (text) => {
        sock.sendMessage(from, { text }, { quoted: msg });
      };
      
      // Store message for anti-delete
      if (!msg.key.fromMe && msg.key.remoteJid !== 'status@broadcast') {
        messageStore.set(msg.key.id, msg);
        if (messageStore.size > 500) {
          const firstKey = messageStore.keys().next().value;
          messageStore.delete(firstKey);
        }
      }
      
      // Log command
      if (isCmd) {
        console.log(`🔍 Command: ${command} from ${pushName} (${senderNumber})`);
      }
      
      // ============ MODE HANDLING ============
      if (config.MODE === 'private' && isCmd && !isOwner && !isGroup) {
        return;
      }
      
      // ============ AUTO REACT ============
      if (config.AUTO_REACT === 'true' && !isCmd && !msg.key.fromMe && !isGroup) {
        const randomEmoji = emojiList[Math.floor(Math.random() * emojiList.length)];
        await m.react(randomEmoji).catch(() => {});
      }
      
      // ============ PRESENCE UPDATES ============
      if (config.AUTO_TYPING === 'true' && !msg.key.fromMe) {
        await sock.sendPresenceUpdate('composing', from).catch(() => {});
      }
      
      if (config.ALWAYS_ONLINE === 'true') {
        await sock.sendPresenceUpdate('available').catch(() => {});
      }
      
      if (config.READ_MESSAGE === 'true' && !msg.key.fromMe) {
        await sock.readMessages([msg.key]).catch(() => {});
      }
      
      // ============ WELCOME/GOODBYE COMMANDS ============
      if (isCmd && isGroup) {
        
        // WELCOME ON/OFF
        if (command === 'welcome') {
          if (!isAdmins && !isOwner) {
            return reply('❌ Only admins can use this command!');
          }
          
          const option = args[0]?.toLowerCase();
          
          if (option === 'on') {
            groupSetting.welcome = true;
            groupSettings.set(from, groupSetting);
            saveGroupSettings();
            reply('✅ Welcome messages have been turned ON for this group!');
          } else if (option === 'off') {
            groupSetting.welcome = false;
            groupSettings.set(from, groupSetting);
            saveGroupSettings();
            reply('✅ Welcome messages have been turned OFF for this group!');
          } else {
            reply(`Welcome messages are currently: ${groupSetting.welcome ? 'ON' : 'OFF'}\n\nUse:\n.welcome on - Turn ON\n.welcome off - Turn OFF`);
          }
        }
        
        // GOODBYE ON/OFF
        else if (command === 'goodbye') {
          if (!isAdmins && !isOwner) {
            return reply('❌ Only admins can use this command!');
          }
          
          const option = args[0]?.toLowerCase();
          
          if (option === 'on') {
            groupSetting.goodbye = true;
            groupSettings.set(from, groupSetting);
            saveGroupSettings();
            reply('✅ Goodbye messages have been turned ON for this group!');
          } else if (option === 'off') {
            groupSetting.goodbye = false;
            groupSettings.set(from, groupSetting);
            saveGroupSettings();
            reply('✅ Goodbye messages have been turned OFF for this group!');
          } else {
            reply(`Goodbye messages are currently: ${groupSetting.goodbye ? 'ON' : 'OFF'}\n\nUse:\n.goodbye on - Turn ON\n.goodbye off - Turn OFF`);
          }
        }
        
        // SET WELCOME MESSAGE
        else if (command === 'setwelcome') {
          if (!isAdmins && !isOwner) {
            return reply('❌ Only admins can use this command!');
          }
          
          if (!q) {
            return reply(`❌ Please provide a welcome message!\n\nAvailable variables:\n@user - Mention user\n@group - Group name\n@count - Member count\n@desc - Group description\n\nExample:\n.setwelcome Hello @user! Welcome to @group`);
          }
          
          groupSetting.welcomeMsg = q;
          groupSettings.set(from, groupSetting);
          saveGroupSettings();
          reply('✅ Welcome message has been updated!\n\nPreview:\n' + q.replace(/@user/g, '@user').replace(/@group/g, groupName).replace(/@count/g, participants.length));
        }
        
        // SET GOODBYE MESSAGE
        else if (command === 'setgoodbye') {
          if (!isAdmins && !isOwner) {
            return reply('❌ Only admins can use this command!');
          }
          
          if (!q) {
            return reply(`❌ Please provide a goodbye message!\n\nAvailable variables:\n@user - Mention user\n@group - Group name\n@count - Member count\n\nExample:\n.setgoodbye Goodbye @user! We'll miss you in @group`);
          }
          
          groupSetting.goodbyeMsg = q;
          groupSettings.set(from, groupSetting);
          saveGroupSettings();
          reply('✅ Goodbye message has been updated!\n\nPreview:\n' + q.replace(/@user/g, '@user').replace(/@group/g, groupName).replace(/@count/g, participants.length));
        }
        
        // RESET WELCOME
        else if (command === 'resetwelcome') {
          if (!isAdmins && !isOwner) {
            return reply('❌ Only admins can use this command!');
          }
          
          groupSetting.welcomeMsg = DEFAULT_WELCOME;
          groupSettings.set(from, groupSetting);
          saveGroupSettings();
          reply('✅ Welcome message has been reset to default!');
        }
        
        // RESET GOODBYE
        else if (command === 'resetgoodbye') {
          if (!isAdmins && !isOwner) {
            return reply('❌ Only admins can use this command!');
          }
          
          groupSetting.goodbyeMsg = DEFAULT_GOODBYE;
          groupSettings.set(from, groupSetting);
          saveGroupSettings();
          reply('✅ Goodbye message has been reset to default!');
        }
        
        // SHOW WELCOME SETTINGS
        else if (command === 'welcomesettings' || command === 'wsettings') {
          if (!isAdmins && !isOwner) {
            return reply('❌ Only admins can use this command!');
          }
          
          const settingsMsg = `╭──❍ *WELCOME SETTINGS* ❍──╮
│
├─❍ *Status:* ${groupSetting.welcome ? '✅ ON' : '❌ OFF'}
├─❍ *Goodbye:* ${groupSetting.goodbye ? '✅ ON' : '❌ OFF'}
│
├─❍ *Welcome Message:*
├─❍ ${groupSetting.welcomeMsg.substring(0, 50)}...
│
├─❍ *Goodbye Message:*
├─❍ ${groupSetting.goodbyeMsg.substring(0, 50)}...
│
╰──────────────────────❍

Commands:
.welcome on/off
.goodbye on/off
.setwelcome <text>
.setgoodbye <text>
.resetwelcome
.resetgoodbye`;
          
          reply(settingsMsg);
        }
      }
      
      // ============ COMMAND HANDLER (for other commands) ============
      const commandsPath = './lib/command';
      if (fs.existsSync(commandsPath + '.js')) {
        const commands = require(commandsPath);
        
        if (commands.commands && Array.isArray(commands.commands)) {
          
          // Handle prefix commands (skip welcome/goodbye commands as we handled them above)
          if (isCmd && !['welcome', 'goodbye', 'setwelcome', 'setgoodbye', 'resetwelcome', 'resetgoodbye', 'welcomesettings', 'wsettings'].includes(command)) {
            const commandObj = commands.commands.find(cmd => cmd.pattern === command) || 
                             commands.commands.find(cmd => cmd.alias && cmd.alias.includes(command));
            
            if (commandObj) {
              
              // Check permissions
              if (commandObj.category === 'owner' && !isOwner) {
                return reply('❌ This command is only for bot owner!');
              }
              
              if (commandObj.category === 'group' && !isGroup) {
                return reply('❌ This command can only be used in groups!');
              }
              
              if (commandObj.category === 'admin' && !isAdmins && !isOwner) {
                return reply('❌ This command is only for group admins!');
              }
              
              // Check if command is enabled for group
              if (commandObj.pattern === 'antilink' && groupSetting.antilink === false) {
                return reply('❌ Anti-link is disabled in this group!');
              }
              
              // React if specified
              if (commandObj.react) {
                await sock.sendMessage(from, { 
                  react: { text: commandObj.react, key: msg.key } 
                }).catch(() => {});
              }
              
              // Execute command
              try {
                await commandObj.function(sock, msg, m, {
                  from, reply, body, isCmd, command: commandObj,
                  args, q, isGroup, sender, senderNumber, botNumber,
                  pushname: pushName, isMe, isOwner, groupMetadata,
                  groupName, participants, groupAdmins, isBotAdmins, isAdmins,
                  getBuffer, fetchJson, mentions, prefix, runtime, sleep, isUrl,
                  groupSettings: groupSetting
                });
                if (commandObj.pattern === 'antilink' || commandObj.pattern === 'antistatus') saveGroupSettings();
                console.log(`✅ Command executed: ${command}`);
              } catch (err) {
                console.error(`❌ Command error:`, err);
                reply(`❌ Error: ${err.message}`);
              }
            }
          }
          
          // Handle non-command triggers
          for (const cmd of commands.commands) {
            try {
              if (cmd.on === 'text' && body && !isCmd) {
                await cmd.function(sock, msg, m, {
                  from, reply, body, isCmd: false, command: cmd,
                  args, q, isGroup, sender, senderNumber, botNumber,
                  pushname: pushName, isMe, isOwner, groupMetadata,
                  groupName, participants, groupAdmins, isBotAdmins, isAdmins,
                  getBuffer, fetchJson, mentions, prefix, runtime, sleep, isUrl,
                  groupSettings: groupSetting
                });
              } else if ((cmd.on === 'image' || cmd.on === 'photo') && msgType === 'imageMessage') {
                await cmd.function(sock, msg, m, {
                  from, reply, body, isCmd, command: cmd,
                  args, q, isGroup, sender, senderNumber, botNumber,
                  pushname: pushName, isMe, isOwner, groupMetadata,
                  groupName, participants, groupAdmins, isBotAdmins, isAdmins,
                  getBuffer, fetchJson, mentions, prefix, runtime, sleep, isUrl,
                  groupSettings: groupSetting
                });
              } else if (cmd.on === 'sticker' && msgType === 'stickerMessage') {
                await cmd.function(sock, msg, m, {
                  from, reply, body, isCmd, command: cmd,
                  args, q, isGroup, sender, senderNumber, botNumber,
                  pushname: pushName, isMe, isOwner, groupMetadata,
                  groupName, participants, groupAdmins, isBotAdmins, isAdmins,
                  getBuffer, fetchJson, mentions, prefix, runtime, sleep, isUrl,
                  groupSettings: groupSetting
                });
              }
            } catch (e) {}
          }
        }
      }
      
      // ============ READ COMMANDS ============
      if (config.READ_CMD === 'true' && isCmd) {
        await sock.readMessages([msg.key]).catch(() => {});
      }
      
      // ============ AUTO RECORDING ============
      if (config.AUTO_RECORDING === 'true' && !msg.key.fromMe) {
        await sock.sendPresenceUpdate('recording', from).catch(() => {});
      }
      
      // ============ ANTI LINK ============
      if (isGroup && !isAdmins && !isOwner && !msg.key.fromMe && groupSetting.antilink === true) {
        const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(chat\.whatsapp\.com\/[^\s]+)|(wa\.me\/[^\s]+)|(t\.me\/[^\s]+)|(instagram\.com\/[^\s]+)|(facebook\.com\/[^\s]+)|(youtube\.com\/[^\s]+)|(youtu\.be\/[^\s]+)|(tiktok\.com\/[^\s]+)|(twitter\.com\/[^\s]+)|(x\.com\/[^\s]+)/gi;
        if (linkRegex.test(body)) {
          await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
          await sock.sendMessage(from, { text: '🚫 *ANTI-LINK*\n\n🔗 Un lien a été supprimé.\n👑 Les administrateurs peuvent envoyer des liens.' }, { quoted: msg }).catch(() => {});
        }
      }
      
      // ============ ANTI DELETE ============
      if (config.ANTI_DELETE === 'true') {
        try {
          if (msg.message?.protocolMessage && msg.message.protocolMessage.type === 0) {
            if (msg.key.fromMe) return;
            
            const deletedMsgKey = msg.message.protocolMessage.key;
            const deletedMsg = messageStore.get(deletedMsgKey.id);
            
            if (deletedMsg) {
              const deletedBy = msg.key.participant || msg.key.remoteJid;
              const originalSender = deletedMsg.key.participant || deletedMsg.key.remoteJid;
              
              // Send to owner's inbox
              const sendTo = ownerNumber[0] + '@s.whatsapp.net';
              
              // Get original message content
              let originalContent = '';
              let messageType = '';
              const originalType = getContentType(deletedMsg.message);
              
              if (originalType === 'conversation') {
                originalContent = deletedMsg.message.conversation || '';
                messageType = 'Text';
              } else if (originalType === 'extendedTextMessage') {
                originalContent = deletedMsg.message.extendedTextMessage?.text || '';
                messageType = 'Text';
              } else if (originalType === 'imageMessage') {
                originalContent = deletedMsg.message.imageMessage?.caption || 'No caption';
                messageType = '🖼️ Image';
              } else if (originalType === 'videoMessage') {
                originalContent = deletedMsg.message.videoMessage?.caption || 'No caption';
                messageType = '🎥 Video';
              } else if (originalType === 'audioMessage') {
                originalContent = 'Audio message';
                messageType = '🎵 Audio';
              } else if (originalType === 'stickerMessage') {
                originalContent = 'Sticker';
                messageType = '🎨 Sticker';
              } else {
                originalContent = 'Media message';
                messageType = '📎 Media';
              }
              
              const chatType = from.includes('@g.us') ? '👥 Group' : '👤 Private Chat';
              let groupNameText = '';
              
              if (from.includes('@g.us') && groupName) {
                groupNameText = `\n├─❍ *Group:* ${groupName}`;
              }
              
              const now = new Date();
              const timeStr = now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const dateStr = now.toLocaleDateString('en-PK');
              
              const deleteMessage = `
╭──❍ *🚫 ANTI-DELETE ALERT* ❍──╮
│
├─❍ *Time:* ${timeStr}
├─❍ *Date:* ${dateStr}
├─❍ *Chat Type:* ${chatType}${groupNameText}
│
├─❍ *Deleted By:* @${deletedBy.split('@')[0]}
├─❍ *Original Sender:* @${originalSender.split('@')[0]}
│
├─❍ *Message Type:* ${messageType}
├─❍ *Content:* 
├─❍ \`${originalContent.substring(0, 500)}${originalContent.length > 500 ? '...' : ''}\`
│
╰──────────────────────❍
        
> _Message was deleted but bot saved it_ 🔰`;
              
              await sock.sendMessage(sendTo, {
                text: deleteMessage,
                mentions: [deletedBy, originalSender]
              }).catch(() => {});
              
              console.log(`🚫 Anti-delete: Message saved to inbox`);
            }
          }
        } catch (e) {
          console.error("Anti-delete error:", e);
        }
      }
      
    } catch (error) {
      console.error("❌ Message handler error:", error);
    }
  });
}

// Start bot
setTimeout(() => {
  connectToWA();
}, 4000);

// BOT SALLERS KI MKC