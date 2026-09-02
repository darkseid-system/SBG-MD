const { cmd, commands } = require('../lib/command');
const os = require('os')
const fs = require('fs')
const bot = require('../lib/bot')
const config = require('../setting')
//===============================User======================================
cmd({
    pattern: "user info",
    react: "👤",
    alias: ["user", "profile"],
    desc: "Get complete user profile information",
    category: "group",
    use: '.person [@tag or reply]',
    filename: __filename
},
async (conn, mek, m, { from, sender, isGroup, reply, quoted, participants }) => {
    try {
        // 1. DETERMINE TARGET USER
        let userJid = quoted?.sender || 
                     mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                     sender;

        // 2. VERIFY USER EXISTS
        const [user] = await conn.onWhatsApp(userJid).catch(() => []);
        if (!user?.exists) return reply("❌ User not found on WhatsApp");

        // 3. GET PROFILE PICTURE
        let ppUrl;
        try {
            ppUrl = await conn.profilePictureUrl(userJid, 'image');
        } catch {
            ppUrl = 'https://i.ibb.co/spyR3qdd/SBG-MD.jpg';
        }

        // 4. GET NAME (MULTI-SOURCE FALLBACK)
        let userName = userJid.split('@')[0];
        try {
            // Try group participant info first
            if (isGroup) {
                const member = participants.find(p => p.id === userJid);
                if (member?.notify) userName = member.notify;
            }
            
            // Try contact DB
            if (userName === userJid.split('@')[0] && conn.contactDB) {
                const contact = await conn.contactDB.get(userJid).catch(() => null);
                if (contact?.name) userName = contact.name;
            }
            
            // Try presence as final fallback
            if (userName === userJid.split('@')[0]) {
                const presence = await conn.presenceSubscribe(userJid).catch(() => null);
                if (presence?.pushname) userName = presence.pushname;
            }
        } catch (e) {
            console.log("Name fetch error:", e);
        }

        // 5. GET BIO/ABOUT
        let bio = {};
        try {
            // Try personal status
            const statusData = await conn.fetchStatus(userJid).catch(() => null);
            if (statusData?.status) {
                bio = {
                    text: statusData.status,
                    type: "Personal",
                    updated: statusData.setAt ? new Date(statusData.setAt * 1000) : null
                };
            } else {
                // Try business profile
                const businessProfile = await conn.getBusinessProfile(userJid).catch(() => null);
                if (businessProfile?.description) {
                    bio = {
                        text: businessProfile.description,
                        type: "Business",
                        updated: null
                    };
                }
            }
        } catch (e) {
            console.log("Bio fetch error:", e);
        }

        // 6. GET GROUP ROLE
        let groupRole = "";
        if (isGroup) {
            const participant = participants.find(p => p.id === userJid);
            groupRole = participant?.admin ? "👑 Admin" : "👥 Member";
        }

        // 7. FORMAT OUTPUT
        const formattedBio = bio.text ? 
            `${bio.text}\n└─ 📌 ${bio.type} Bio${bio.updated ? ` | 🕒 ${bio.updated.toLocaleString()}` : ''}` : 
            "No bio available";

        const userInfo = `
*GC MEMBER INFORMATION 🧊*

📛 *Name:* ${userName}
🔢 *Number:* ${userJid.replace(/@.+/, '')}
📌 *Account Type:* ${user.isBusiness ? "💼 Business" : user.isEnterprise ? "🏢 Enterprise" : "👤 Personal"}

*📝 About:*
${formattedBio}

*⚙️ Account Info:*
✅ Registered: ${user.isUser ? "Yes" : "No"}
🛡️ Verified: ${user.verifiedName ? "✅ Verified" : "❌ Not verified"}
${isGroup ? `👥 *Group Role:* ${groupRole}` : ''}
`.trim();

        // 8. SEND RESULT
        await conn.sendMessage(from, {
            image: { url: ppUrl },
            caption: userInfo,
            mentions: [userJid]
        }, { quoted: mek });

    } catch (e) {
        console.error("Person command error:", e);
        reply(`❌ Error: ${e.message || "Failed to fetch profile"}`);
    }
});
//===============================Add A Member===============================
cmd({
    pattern: "add",
    alias: ["a", "invite"],
    desc: "Adds a member to the group",
    category: "admin",
    react: "➕",
    filename: __filename
},
async (conn, mek, m, {
    from, q, isGroup, isBotAdmins, reply, quoted, senderNumber
}) => {
    // Check if the command is used in a group
    if (!isGroup) return reply("❌ This command can only be used in groups.");

    // Get the bot owner's number dynamically from conn.user.id
    /*const botOwner = conn.user.id.split(":")[0];
    if (senderNumber !== botOwner) {
        return reply("❌ Only the bot owner can use this command.");
    }*/

    // Check if the bot is an admin
    if (!isBotAdmins) return reply("❌ I need to be an admin to use this command.");

    let number;
    if (m.quoted) {
        number = m.quoted.sender.split("@")[0]; // If replying to a message, get the sender's number
    } else if (q && q.includes("@")) {
        number = q.replace(/[@\s]/g, ''); // If manually typing a number with '@'
    } else if (q && /^\d+$/.test(q)) {
        number = q; // If directly typing a number
    } else {
        return reply("❌ Please reply to a message, mention a user, or provide a number to add.");
    }

    const jid = number + "@s.whatsapp.net";

    try {
        await conn.groupParticipantsUpdate(from, [jid], "add");
        reply(`✅ Successfully added @${number}`, { mentions: [jid] });
    } catch (error) {
        console.error("Add command error:", error);
        reply("❌ Failed to add the member.");
    }
});
//-----------------------------------------------Get Group Admins-----------------------------------------------
cmd({
    pattern: "admins",
    desc: "Get a list of group admins.",
    react: "👥",
    category: "group",
    filename: __filename
},
async (conn, mek, m, {
    from, quoted, body, isCmd, command, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply
}) => {
    try {
        const groupMetadata = await conn.groupMetadata(from);
        const admins = groupMetadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(admin => `@${admin.id.split('@')[0]}`)
            .join('\n');

        return await conn.sendMessage(from, {
            text: `*Group Admins:*\n\n${admins}`,
            mentions: groupMetadata.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(admin => admin.id)
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        return await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply(`Error: ${e.message}`);
    }
});

//------------------------------------------------------------Set Group Description--------------------------------------------------------------

cmd({
    pattern: "groupdesc",
    desc: "Change the group description.",
    use: '.groupdesc <New Description>',
    react: "👥",
    category: "group",
    filename: __filename
},
async (conn, mek, m, {
    from, args, quoted, body, isCmd, command, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply
}) => {
    try {
        if (!isAdmins) return reply(`You Must Be Admin For Use This Command`);
        if (args.length === 0) return reply('Please provide a new group description.');

        const newDesc = args.join(' '); // Join all arguments as the new description
        await conn.groupUpdateDescription(from, newDesc);

        return await conn.sendMessage(from, {
            text: `Group description has been updated to:\n\n${newDesc}`
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        return await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply(`Error: ${e.message}`);
    }
});

//-----------------------------------------------------------Get Group Info-------------------------------------------------------------

cmd({
    pattern: "groupinfo",
    desc: "Get information about the group.",
    react: "👥",
    category: "group",
    filename: __filename
},
async (conn, mek, m, {
    from, quoted, body, isCmd, command, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply
}) => {
    try {
        const groupMetadata = await conn.groupMetadata(from); // Get group metadata
        const groupInfo = `
*Group Name:* ${groupMetadata.subject}
*Group Description:* ${groupMetadata.desc || 'No description'}
*Members:* ${groupMetadata.participants.length}
*Created At:* ${new Date(groupMetadata.creation * 1000).toLocaleString()}
        `;
        return await conn.sendMessage(from, {
            text: groupInfo
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        return await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply(`Error: ${e.message}`);
    }
});

//-----------------------------------------------Get Group Invite Link-----------------------------------------------

cmd({
    pattern: "grouplink",
    desc: "Get the group's invite link.",
    react: "👥",
    category: "group",
    filename: __filename
},
async (conn, mek, m, {
    from, quoted, body, isCmd, command, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply
}) => {
    try {
        const inviteLink = await conn.groupInviteCode(from);
        return await conn.sendMessage(from, {
            text: `*Here is your group's invite link:* https://chat.whatsapp.com/${inviteLink}`
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        return await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply(`Error: ${e.message}`);
    }
});

//-----------------------------------------------Group Name Change-----------------------------------------------

cmd({
    pattern: "gname",
    desc: "Change the group name",
    use: ".gname <New Group Name>",
    react: "✏️",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, sender, groupMetadata, args, reply }) => {
    if (!isGroup) {
        return await reply("This command can only be used in groups.");
    }
    const botNumber = conn.user.jid;
    const isBotAdmin = groupMetadata.participants.some(participant => participant.jid === botNumber && participant.admin);
    
    if (!isBotAdmin) {
        return await reply("I'm not an admin in this group.");
    }
    const newName = args.join(" ");
    if (!newName) {
        return await reply("Please provide a new group name.");
    }
    try {
        await conn.groupUpdateSubject(from, newName);
        return await reply(`Group name changed to "${newName}" successfully!`);
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } })
    } catch (error) {
        console.error('Error changing group name:', error);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        return await reply("Failed to change the group name. Please try again later.");
    }
});


//---------------------------------------------Group Subject Change --------------------------------------------

cmd({
    pattern: "setsubject",
    desc: "Change the group subject.",
    use: '.setsubject <New Subject>',
    react: "👥",
    category: "group",
    filename: __filename
},
async (conn, mek, m, {
    from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply
}) => {
    try {
        if (!isAdmins) return reply(`You Must Be Admin For Use This Command`);
        if (args.length === 0) return await conn.sendMessage(from, {
            text: 'Please provide a new group subject.'
        }, { quoted: mek });

        const newSubject = args.join(' '); // Join all arguments as the new subject
        await conn.groupUpdateSubject(from, newSubject);

        return await conn.sendMessage(from, {
            text: `Group subject has been updated to: ${newSubject}`
        }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } })

    } catch (e) {
        console.log(e);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply(`Error: ${e.message}`);
    }
});


//---------------------------------------------REQUEST --------------------------------------------
// Command to view pending join requests
cmd({
    pattern: "requests",
    desc: "View pending join requests",
    use: ".requests",
    react: "📝",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, reply }) => {
    if (!isGroup) {
        return await reply("This command can only be used in groups.");
    }
    const botNumber = conn.user.jid;
    const groupMetadata = await conn.groupMetadata(from);
    const isBotAdmin = groupMetadata.participants.some(participant => participant.jid === botNumber && participant.admin);

    if (!isBotAdmin) {
        return await reply("I'm not an admin in this group.");
    }

    try {
        const requests = await conn.groupRequestParticipantsList(from);
        if (requests.length === 0) {
            return await reply("No pending join requests.");
        }

        let msg = "Pending Join Requests:\n\n";
        requests.forEach((request, index) => {
            msg += `${index + 1}. @${request.jid.split("@")[0]}\n`;
        });
        return await reply(msg, { mentions: requests.map(r => r.jid) });
    } catch (error) {
        console.error('Error retrieving join requests:', error);
        return await reply("Failed to retrieve join requests. Please try again later.");
    }
});

// Command to accept group join requests
cmd({
    pattern: "accept",
    desc: "Accept group join request(s)",
    use: ".accept <request numbers>",
    react: "✔️",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, reply, match }) => {
    // Check if the command is being used in a group
    if (!isGroup) {
        return await reply("This command can only be used in groups.");
    }
    const botNumber = conn.user.jid;
    const groupMetadata = await conn.groupMetadata(from);
    const isBotAdmin = groupMetadata.participants.some(participant => participant.jid === botNumber && participant.admin);

    if (!isBotAdmin) {
        return await reply("_I'm not an admin in this group._");
    }
    try {
        const requests = await conn.groupRequestParticipantsList(from);
        if (requests.length === 0) {
            return await reply("No pending join requests.");
        }
        if (!match) {
            return await reply("_Provide the number(s) of the request(s) to accept, separated by commas._");
        }
        const indexes = match.split(",").map(num => parseInt(num.trim()) - 1);
        const validIndexes = indexes.filter(index => index >= 0 && index < requests.length);
        if (validIndexes.length === 0) {
            return await reply("_Invalid request number(s)._");
        }
        for (let index of validIndexes) {
            await conn.groupRequestParticipantsUpdate(from, [requests[index].jid], "accept");
        }
        return await reply(`_Accepted ${validIndexes.length} join request(s)._`);
    } catch (error) {
        console.error('Error accepting join requests:', error);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        return await reply("Failed to accept join requests. Please try again later.");
    }
});

// Command to reject group join requests
cmd({
    pattern: "reject",
    desc: "Reject group join request(s)",
    use: ".reject <request numbers>",
    react: "❌",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, reply, match }) => {
    if (!isGroup) {
        return await reply("This command can only be used in groups.");
    }
    const botNumber = conn.user.jid;
    const groupMetadata = await conn.groupMetadata(from);
    const isBotAdmin = groupMetadata.participants.some(participant => participant.jid === botNumber && participant.admin);

    if (!isBotAdmin) {
        return await reply("I'm not an admin in this group.");
    }

    try {
        const requests = await conn.groupRequestParticipantsList(from);
        if (requests.length === 0) {
            return await reply("No pending join requests.");
        }
        if (!match) {
            return await reply("Provide the number(s) of the request(s) to reject, separated by commas.");
        }

        const indexes = match.split(",").map(num => parseInt(num.trim()) - 1);
        const validIndexes = indexes.filter(index => index >= 0 && index < requests.length);

        if (validIndexes.length === 0) {
            return await reply("_Invalid request number(s)._");
        }
        for (let index of validIndexes) {
            await conn.groupRequestParticipantsUpdate(from, [requests[index].jid], "reject");
        }

        return await reply(`_Rejected ${validIndexes.length} join request(s)._`);
    } catch (error) {
        console.error('Error rejecting join requests:', error);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        return await reply("Failed to reject join requests. Please try again later.");
    }
});




//===========================================Anti Link============================================
cmd({
    pattern: "antilink",
    alias: ["antilink", "anti-link"],
    desc: "Enable or disable link deletion for this group",
    category: "group",
    react: "🔗",
    use: ".antilink on/off",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isAdmins, isOwner, args, reply, groupSettings }) => {
    if (!isGroup) return reply("❌ This command can only be used in a group.");
    if (!isAdmins && !isOwner) return reply("❌ Only group admins can use this command.");
    const option = (args[0] || '').toLowerCase();
    if (!['on','off'].includes(option)) {
        return reply(`🔗 *ANTI-LINK*\n\nStatus: ${groupSettings.antilink !== false ? '✅ ON' : '❌ OFF'}\n\nUse:\n.antilink on\n.antilink off`);
    }
    groupSettings.antilink = option === 'on';
    reply(`🔗 Anti-link is now *${option.toUpperCase()}* for this group.\n\n${option === 'on' ? '🚫 Links sent by non-admin members will be deleted automatically.' : '✅ Link deletion is disabled.'}`);
    return { save: true };
});

//---------------------------------------------Hide Tag --------------------------------------------

cmd({
    pattern: "hidetag",
    desc: "Tags everyperson of group without mentioning their numbers",
    react: "👥",
    category: "group",
    filename: __filename,
    use: '<text>',
},
(conn, mek, m, {
    from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply
}) => {
try { 
    if (!m.isGroup) return reply(tlang().group);
if (!m.isGroup) return reply('only for groups');
if (!isAdmins) return reply(`You Must Be Admin For Use This Command`);
    conn.sendMessage(m.chat, {
        text: q ? text : "",
        mentions: participants.map((a) => a.id),
    }, {
        quoted: mek ,messageId:genMsgId() 
    });
} catch (e) {
reply('Error !!')
l(e)
}
})

//---------------------------------------------Kick --------------------------------------------

cmd({
    pattern: "kick",
    desc: "Kicks replied/quoted user from group.",
    react: "👥",
    category: "group",
    filename: __filename,
    use: '<quote|reply|number>',
},           
async (conn, mek, m, {
    from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply
}) => {
    try {
        if (!m.isGroup) return reply('This command is only for groups.');
        if (!isBotAdmins) return reply(`I can't do that. Please make me a group admin.`);
        if (!isAdmins) return reply(`You must be an admin to use this command.`);
    
        const user = quoted ? quoted.sender : null;
        if (!user) return reply('Please reply to a user to kick them.');

        await conn.groupParticipantsUpdate(m.chat, [user], "remove");
        reply(`${user} has been kicked out of the group!`);
    } catch (e) {
        console.log(e);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply('Error occurred while trying to kick the user.');
    }
});


//unlock group

cmd({
    pattern: "unlock",
    desc: "Allow all participants to modify the group's settings",
    react: "🔓",
    category: "group",
    filename: __filename
}, async (conn, mek, m, { isGroup, isBotAdmins, isAdmins, args, reply }) => {
    try {
        if (!isGroup) return reply("This command is only for groups.");
        if (!isBotAdmins) return reply("I need to be a group admin to perform this action.");
        if (!isAdmins) return reply("You must be an admin to use this command.");

        await conn.groupSettingUpdate(mek.key.remoteJid, 'unlocked');

        reply("Group settings unlocked. All participants can modify the group's settings.");

    } catch (e) {
        console.log(e);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply(`Error: ${e}`);
    }
});

//lock group

cmd({
    pattern: "lock",
    desc: "Only allow admins to modify the group's settings",
    react: "🔒",
    category: "group",
    filename: __filename
}, async (conn, mek, m, { isGroup, isBotAdmins, isAdmins, args, reply }) => {
    try {
        if (!isGroup) return reply("This command is only for groups.");
        if (!isBotAdmins) return reply("I need to be a group admin to perform this action.");
        if (!isAdmins) return reply("You must be an admin to use this command.");

        await conn.groupSettingUpdate(mek.key.remoteJid, 'locked');

        reply("Group settings locked. Only admins can modify the group's settings.");

    } catch (e) {
        console.log(e);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply(`Error: ${e}`);
    }
});

//Automaticaly Add Specific Country Members

cmd({
    pattern: "approve",
    desc: "Automatically approve Specific Country users in the waiting list",
    react: "✅",
    category: "group",
    filename: __filename
}, async (conn, mek, m, { isGroup, isBotAdmins, isAdmins, args, reply }) => {
    try {
        if (!isGroup) return reply("This command is only for groups.");
        if (!isBotAdmins) return reply("I need to be a group admin to perform this action.");
        if (!isAdmins) return reply("You must be an admin to use this command.");

        const groupJid = mek.key.remoteJid;
        const response = await conn.groupRequestParticipantsList(groupJid);
        
        if (response.length === 0) {
            return reply("No participants are in the waiting list.");
        }
        const toAddUsers = response.filter(user => user.jid.startsWith(config.AUTO_ADD_Country_Code));

        if (toAddUsers.length === 0) {
            return reply("No +92 users found in the waiting list.");
        }

        const userJids = toAddUsers.map(user => user.jid);
        const approveResponse = await conn.groupRequestParticipantsUpdate(
            groupJid, 
            userJids,
            "approve"
        );

        console.log(approveResponse);
        reply(`Approved the following +92 users:\n${userJids.join("\n")}`);

    } catch (e) {
        console.log(e);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        reply(`Error: ${e}`);
    }
});

// Command to create a poll
cmd({
    pattern: "poll",
    desc: "Create a poll",
    use: ".poll <Question> | <Option1> | <Option2> | ...",
    react: "📊",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, reply, match }) => {
    if (!isGroup) {
        return await reply("This command can only be used in groups.");
    }
    const [question, ...options] = match.split("|").map(item => item.trim());
    if (!question || options.length < 2) {
        return await reply("Usage: .poll <Question> | <Option1> | <Option2> | ...");
    }

    // Create the poll object
    const poll = {
        name: question,
        values: options,
        selectableCount: 1,
    };

    try {
        await conn.sendMessage(from, { poll });
        return await reply("Poll created successfully.");
    } catch (error) {
        console.error('Error creating poll:', error);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } })
        return await reply("Failed to create poll. Please try again later.");
    }
});

//getpic
cmd({
    pattern: "getpic",
    desc: "Get the group profile picture.",
    category: "group",
    react: "🖼️",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        if (!isGroup) return reply('This command can only be used in a group.')

        const groupPic = await conn.getProfilePicture(from)
        await conn.sendMessage(from, { image: { url: groupPic }, caption: 'Group Profile Picture' })
    } catch (e) {
        console.log(e)
        reply(`${e}`)
    }
})
//=======================================Kick All==================================================
cmd({
    pattern: "kickall",
    desc: "Kicks all non-admin members from the group.",
    react: "👏",
    category: "group",
    filename: __filename,
},           
async(conn, mek, m,{from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{
      if (!isAdmins) return reply(`ONLY ADMINS CAN USE THIS CMD 🪄♻️`)
      if (!isOwner) return reply(`SORRY ADMINS YOU R NOT BOT OWNER 🪄♻️`)
      
        // Check if the command is used in a group
        if (!isGroup) return reply(`This command is only for groups.`);
        
        // Check if the bot has admin privileges
        if (!isBotAdmins) return reply(`I need admin privileges to kick users.`);
        // Fetch all participants from the group
        const allParticipants = groupMetadata.participants;
        // Filter out the admins (including the bot)
        const nonAdminParticipants = allParticipants.filter(member => !groupAdmins.includes(member.id));
        if (nonAdminParticipants.length === 0) {
            return reply('There are no non-admin members to kick.');
        }
        // Start removing non-admin participants
        for (let participant of nonAdminParticipants) {
            await conn.groupParticipantsUpdate(m.chat, [participant.id], "remove");
  }
        // Send a confirmation message once done
        reply(`Successfully kicked all non-admin members from the group.`);
        
    } catch (e) {
        console.error('Error kicking users:', e);
        reply('An error occurred while trying to kick all members. Please try again.');
    }
});
//==============================================Purge Group======================================================
cmd({
    pattern: "purge",
    alias: ["puge"],
    desc: "Remove all non-admin members from the group, keeping only admins.",
    react: "🧹",
    category: "group",
    use: ".purge",
    filename: __filename
},
async (conn, mek, m, {
    from, isGroup, isBotAdmins, isAdmins, groupMetadata, groupAdmins, reply
}) => {
    try {
        if (!isGroup) return reply("❌ This command can only be used in a group.");
        if (!isAdmins) return reply("❌ Only group admins can use .purge.");
        if (!isBotAdmins) return reply("❌ SBG-MD must be a group admin to perform the purge.");

        const metadata = groupMetadata || await conn.groupMetadata(from);
        const adminJids = new Set(
            (metadata.participants || [])
                .filter(p => p.admin === "admin" || p.admin === "superadmin")
                .map(p => p.id)
        );

        // Never remove an admin, including the bot itself.
        const targets = (metadata.participants || [])
            .filter(p => !adminJids.has(p.id))
            .map(p => p.id);

        if (!targets.length) {
            return reply("ℹ️ Aucun membre non-admin à supprimer. Les admins sont conservés.");
        }

        let removed = 0;
        let failed = 0;
        const batchSize = 5;
        const total = targets.length;
        const totalBatches = Math.ceil(total / batchSize);

        // Send one message and edit it as the purge progresses.
        let progressMessage = null;
        try {
            progressMessage = await conn.sendMessage(from, {
                text: `🧹 *PURGE SBG-MD EN COURS...*\n\n⏳ Préparation...\n👥 Membres à supprimer : *${total}*\n👑 Admins protégés : *${adminJids.size}*`
            });
        } catch (err) {
            console.error("Unable to send purge progress message:", err);
        }

        const updateProgress = async (processed, batchNumber) => {
            if (!progressMessage) return;
            const percent = Math.min(100, Math.round((processed / total) * 100));
            const filled = Math.round(percent / 10);
            const bar = "█".repeat(filled) + "░".repeat(10 - filled);
            const text =
                `🧹 *PURGE SBG-MD EN COURS...*\n\n` +
                `📊 Progression : *${percent}%*\n` +
                `${bar}\n\n` +
                `👥 Traités : *${processed}/${total}*\n` +
                `✅ Supprimés : *${removed}*\n` +
                `❌ Échecs : *${failed}*\n` +
                `📦 Lot : *${Math.min(batchNumber, totalBatches)}/${totalBatches}*\n` +
                `👑 Admins protégés : *${adminJids.size}*`;

            try {
                await conn.sendMessage(from, { text, edit: progressMessage.key });
            } catch (err) {
                console.error("Unable to update purge progress message:", err);
            }
        };

        for (let i = 0; i < total; i += batchSize) {
            const batch = targets.slice(i, i + batchSize);
            try {
                const result = await conn.groupParticipantsUpdate(from, batch, "remove");
                const successful = Array.isArray(result)
                    ? result.filter(r => r.status === "200" || r.status === 200).length
                    : batch.length;
                removed += successful;
                failed += Math.max(0, batch.length - successful);
            } catch (err) {
                failed += batch.length;
                console.error("Purge batch error:", err);
            }

            await updateProgress(Math.min(i + batch.length, total), Math.floor(i / batchSize) + 1);
        }

        const remainingAdmins = (metadata.participants || [])
            .filter(p => p.admin === "admin" || p.admin === "superadmin")
            .map(p => `@${p.id.split("@")[0]}`)
            .join("\n");

        const finalText =
            `✅ *SUCCÈS PURGE BY SBG-MD*\n\n` +
            `📊 Progression : *100%*\n` +
            `██████████\n\n` +
            `🧹 Membres supprimés : *${removed}/${targets.length}*\n` +
            `❌ Échecs : *${failed}*\n` +
            `👑 Admins conservés : *${adminJids.size}*\n\n` +
            `*Numéros admins conservés :*\n${remainingAdmins || "Aucun"}`;

        if (progressMessage) {
            try {
                await conn.sendMessage(from, { text: finalText, edit: progressMessage.key });
                return;
            } catch (err) {
                console.error("Unable to finalize purge progress message:", err);
            }
        }

        return reply(finalText);
    } catch (e) {
        console.error("Purge command error:", e);
        return reply(`❌ Purge failed: ${e.message || "unknown error"}`);
    }
});

//==============================================Open Time======================================================
cmd({
    pattern: "opentime",
    react: "🔖",
    desc: "To open group to a time",
    category: "group",
    use: '.opentime',
    filename: __filename
},
async(conn, mek, m,{from, prefix, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{   
if (!isGroup) return reply('This Command Only For Group')
if (!isAdmins) return reply('You Are Not A Admin')	
  if (args[1] == 'second') {
                    var timer = args[0] * `1000`
                } else if (args[1] == 'minute') {
                    var timer = args[0] * `60000`
                } else if (args[1] == 'hour') {
                    var timer = args[0] * `3600000`
                } else if (args[1] == 'day') {
                    var timer = args[0] * `86400000`
                } else {
                    return reply('*select:*\nsecond\nminute\nhour\n\n*example*\n10 second')
                }
                reply(`Open time ${q} starting from now`)
                setTimeout(() => {
                    var nomor = mek.participant
                    const open = `*OPEN TIME* THE GROUP WAS OPENED BY SBG-MD TO APPROVED ADMIN\n NOW MEMBERS CAN SEND MESSAGES 🔓`
                    conn.groupSettingUpdate(from, 'not_announcement')
                    reply(open)
                }, timer)
await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }}) 
} catch (e) {
reply('*Error !!*')
l(e)
}
})

cmd({
    pattern: "closetime",
    react: "🔖",
    desc: "To close group to a time",
    category: "group",
    use: '.closstime',
    filename: __filename
},
async(conn, mek, m,{from, prefix, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{   
if (!isGroup) return reply('This Command Only For Group')
if (!isAdmins) return reply('You Are Not A Admin')	
                if (args[1] == 'second') {
                    var timer = args[0] * `1000`
                } else if (args[1] == 'minute') {
                    var timer = args[0] * `60000`
                } else if (args[1] == 'hour') {
                    var timer = args[0] * `3600000`
                } else if (args[1] == 'day') {
                    var timer = args[0] * `86400000`
                } else {
                    return reply('*select:*\nsecond\nminute\nhour\n\n*Example*\n10 second')
                }
                reply(`Close time ${q} starting from now`)
                setTimeout(() => {
                    var nomor = m.participant
                    const close = `*CLOSE TIME* GROUP CLOSED BY SBG-MD AT APPROVED ADMIN\nNOW ONLY ADMIN CAN SEND MESSAGES 🔐`
                    conn.groupSettingUpdate(from, 'announcement')
                    reply(close)
                }, timer)
await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }}) 
} catch (e) {
reply('*Error !!*')
l(e)
}
})


cmd({
    pattern: "tagadmin",
    alais:["tagadmins"],
    react: "🙀",
    desc: "Tags all the admins in the group.",
    category: "group",
    filename: __filename,
},           
async(conn, mek, m,{from, prefix, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{
        // Check if the command is used in a group
        if (!isGroup) return reply(`This command is only for groups.`);
        if (!isAdmins) return reply(`This command is only for group admin.`);
        
        // Fetch all group admins
        const admins = groupAdmins;
        if (admins.length === 0) {
            return reply('There are no admins in this group.');
        }
        // Create a message with all admin tags
        let adminTagMessage = '*TAGGING ALL ADMINS IN THE GROUP 🔳*\n\n';
        for (let admin of admins) {
            adminTagMessage += `@${admin.split('@')[0]}\n`;  // Mention each admin by their number
        }
        // Send the message and tag the admins
        await conn.sendMessage(from, { text: adminTagMessage, mentions: admins }, { quoted: mek });
    } catch (e) {
        console.error('Error tagging admins:', e);
        reply('you are not an admin.');
    }
})
//========================================Rank================================================
// Simulated in-memory storage for user levels
const userLevels = {};

// Function to calculate level based on XP
const calculateLevel = (xp) => Math.floor(0.1 * Math.sqrt(xp));

cmd({
    pattern: "rank",  // Adjusted to rank
    desc: "Check the level of a user.",
    react: "📊",
    category: "group",
    use: ".rank [@mention or reply]",
    filename: __filename,
}, async (conn, mek, m, { reply, isGroup, mentionedJid , from }) => {
    try {
        let target;

        // Determine the target user
        // Case 1: If there's a mention, use the mentioned user.
        if (mentionedJid?.length > 0) {
            target = mentionedJid[0]; // First mentioned user
        } 
        // Case 2: If the user is replying to a message, use the sender of the quoted message.
        else if (m.quoted && m.quoted.sender) {
            target = m.quoted.sender; // User who sent the quoted message
        } 
        // Case 3: If neither mention nor reply, use the sender of the command.
        else {
            target = m.sender; // Default to the sender if no mention or reply
        }

        if (!target) {
            return reply("❌ Please mention a user or reply to their message to check their rank.");
        }

        // Initialize user data if not present
        if (!userLevels[target]) {
            userLevels[target] = { experience: 0, messages: 0 };
        }

        // Simulate experience gain
        const userData = userLevels[target];
        userData.messages += 1;
        userData.experience += Math.floor(Math.random() * 10) + 5;

        const level = calculateLevel(userData.experience);
        const nextLevelXP = Math.pow((level + 1) / 0.1, 2);
        const currentLevelXP = Math.pow(level / 0.1, 2);
        const progressPercent = Math.floor(((userData.experience - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100);
        const progressBar = "⭐".repeat(progressPercent / 10) + "⚪".repeat(10 - progressPercent / 10);

        // URL of the image for the rank
        const levelImageURL = bot.ALIVE_IMG; // Replace with your desired image URL
        
        // Send rank information in text and image
        const caption = `📊 *Rank Information*\n\n👤 *User*: @${
            target.split("@")[0]
        }\n🔝 *Level*: ${level}\n🔄 *Progression*: ${progressPercent}%\n${progressBar}\n📩 *Messages Sent*: ${
            userData.messages
        }\n✨ *XP*: ${userData.experience}\n\n*${bot.COPYRIGHT}*`;

        // Send the image and caption together
        console.log(`♻ Rank Command Used : ${from}`);
        await conn.sendMessage(
            m.chat,
            { image: { url: levelImageURL }, caption, mentions: [target] },
            { quoted: mek }
        );

    } catch (error) {
        console.error("Error in rank command:", error);
        reply("❌ An error occurred while fetching the rank. Please try again.");
    }
});
//==========================================Anti Status============================================
cmd({
    pattern: "antistatus",
    alias: ["anti-status", "statusmention"],
    desc: "Delete status shares/mentions sent into the group",
    category: "group",
    react: "🚫",
    use: ".antistatus on/off",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isAdmins, isOwner, args, reply, groupSettings }) => {
    if (!isGroup) return reply("❌ Cette commande fonctionne uniquement dans un groupe.");
    if (!isAdmins && !isOwner) return reply("❌ Seuls les admins du groupe peuvent utiliser cette commande.");
    const option = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(option)) {
        return reply(`🚫 *ANTI-STATUS*\n\nStatut : ${groupSettings.antistatus === true ? '✅ ON' : '❌ OFF'}\n\nUtilisation :\n.antistatus on\n.antistatus off`);
    }
    groupSettings.antistatus = option === 'on';
    return reply(option === 'on'
        ? '🚫 *ANTI-STATUS ACTIVÉ*\n\nLes statuts partagés/mentionnés dans ce groupe seront supprimés automatiquement.\n\n⚠️ Le bot doit être admin.'
        : '✅ *ANTI-STATUS DÉSACTIVÉ*\n\nLes statuts partagés dans ce groupe ne seront plus supprimés.');
});

//===============================================Tag All======================================================
cmd({
    pattern: "tagall",
    alias: ["mentionall", "everyone"],
    desc: "Mention all members in the group line by line with a custom message.",
    category: "group",
    filename: __filename
}, 
async (conn, mek, m, { from, isGroup, participants, text, reply }) => {
    try {
        // Check if the command is used in a group
        if (!isGroup) return reply("⚠️ This command can only be used in a group!");

        // Get the custom message (if provided)
        let tagMessage = text || "Attention Pleace";

        // Get all members
        let members = participants.map(u => u.id);

        // Create mention message with the custom message at the top
        let message = `📢 *${tagMessage}* 🔥\n✨━━━━━━━━━━━━━━✨\n🚨 👥 📣 ⚡ 🛡️ 👑 🎯 🔥 💥 🌟\n✨━━━━━━━━━━━━━━✨\n\n`;
        message += members.map(m => `@${m.split('@')[0]}`).join('\n');

        // Send the message with mentions
        await conn.sendMessage(from, { text: message, mentions: members });

        console.log(`✅ Tagall command used in: ${from}`);
    } catch (e) {
        console.error("Tagall Error:", e);
        reply(`❌ Failed to tag all members. Error: ${e.message}`);
    }
});
//==========================================Mute===================================================
cmd({
    pattern: "mute",
    react: "🔖",
    desc: "close a group",
    category: "group",
    use: '.mute',
    filename: __filename
},
async(conn, mek, m,{from, prefix, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{
const l = console.log                   
if (!isGroup) return reply('This Command Only For Group')
if (!isBotAdmins) return reply('You Not A Bot Owner')
if (!isAdmins) return reply('You Are Not A Admin')
const G_MUTE = `*GROUP IS CLOSED BY SBG-MD BOT OWNER*`;
        await conn.groupSettingUpdate(mek.chat, 'announcement')
        await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }})
        return reply(G_MUTE);
} catch (e) {
reply('🛑 GROUP IS CLOSED MY BOT OWNER')
console.log(e)
}
})


  
cmd({
    pattern: "unmute",
    react: "🔖",
    desc: "open a group",
    category: "group",
    use: '.unmute',
    filename: __filename
},
async(conn, mek, m,{from, prefix, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{                   
if (!isGroup) return reply('This Command Only For Group')
if (!isBotAdmins) return reply('You Not A Bot Owner')
if (!isAdmins) return reply('You Are Not A Admin')
const G_UNMUTE = `*GROUP IS OPEN BY SBG-MD BOT OWNER*`;
        await conn.groupSettingUpdate(mek.chat, 'not_announcement')
        await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }, quoted: mek })
        return reply(G_UNMUTE);
} catch (e) {
reply('🛑 GROUP IS OPEN MY BOT OWNER')
console.log(e)
}
})


cmd({
    pattern: "promote",
    react: "🔖",
    desc: "promote admin to a member",
    category: "group",
    use: '.promote',
    filename: __filename
},
async(conn, mek, m,{from, prefix, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{                   
if (!isGroup) return reply('This Command Only For Group')
if (!isBotAdmins) return reply('You Not A Bot Owner')
if (!isAdmins) return reply('You Are Not A Admin')
                                  
let users = mek.mentionedJid ? mek.mentionedJid : mek.quoted ? mek.quoted.sender : q.replace(/[^0-9]/g, '')+'@s.whatsapp.net'
await conn.groupParticipantsUpdate(mek.chat, [users], 'promote')
await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }}) 
reply('*GROUP ADMIN PROMOTE BY RLIO-MD BOT OWNER*')
} catch (e) {
reply('*ERROR*')
console.log(e)
}
}) 


cmd({
    pattern: "demote",
    react: "🔖",
    desc: "demote admin to a member",
    category: "group",
    use: '.demote',
    filename: __filename
},
async(conn, mek, m,{from, prefix, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{                   
if (!isGroup) return reply('This Command Only For Group')
if (!isBotAdmins) return reply('You Not A Bot Owner')
if (!isAdmins) return reply('You Are Not A Admin')
                                  
let users = mek.mentionedJid ? mek.mentionedJid : mek.quoted ? mek.quoted.sender : q.replace(/[^0-9]/g, '')+'@s.whatsapp.net'
await conn.groupParticipantsUpdate(mek.chat, [users], 'demote')
await conn.sendMessage(from, { react: { text: `✅`, key: mek.key }})
reply('*GROUP ADMIN DEMOTE BY SBG-MD BOT OWNER*') 
} catch (e) {
reply('*ERROR*')
console.log(e)
}
})


cmd({
pattern: "del",
react: "❌",
alias: [","],
desc: "delete message",
category: "group",
use: '.del',
filename: __filename
},
async(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants,  isItzcp, groupAdmins, isBotAdmins, isAdmins, reply}) => {
if (!isOwner ||  !isAdmins) return;
try{
if (!m.quoted) return reply(mg.notextfordel);
const key = {
            remoteJid: m.chat,
            fromMe: false,
            id: m.quoted.id,
            participant: m.quoted.sender
        }
        await conn.sendMessage(m.chat, { delete: key })
} catch(e) {
console.log(e);
reply('Error!!')
} 
})

cmd({
    pattern: "setgoodbye",
    desc: "Set the goodbye message for the group.",
    category: "group",
    react: "👋",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        if (!isGroup) return reply('This command can only be used in a group.')
        if (!isBotAdmins) return reply('Bot must be an admin to use this command.')
        if (!isAdmins) return reply('You must be an admin to use this command.')

        const goodbye = q
        if (!goodbye) return reply('Please provide a goodbye message.')

        await conn.sendMessage(from, { image: { url: bot.ALIVE_IMG }, caption: goodbye })
        await reply('Goodbye message has been set.')
    } catch (e) {
        console.log(e)
        reply(`${e}`)
    }
})


cmd({
    pattern: "setwelcome",
    desc: "Set the welcome message for the group.",
    category: "group",
    react: "👋",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        if (!isGroup) return reply('This command can only be used in a group.')
        if (!isBotAdmins) return reply('Bot must be an admin to use this command.')
        if (!isAdmins) return reply('You must be an admin to use this command.')

        const welcome = q
        if (!welcome) return reply('Please provide a welcome message.')

        await conn.sendMessage(from, { image: { url: bot.ALIVE_IMG }, caption: welcome })
        await reply('Welcome message has been set.')
    } catch (e) {
        console.log(e)
        reply(`${e}`)
    }
})
