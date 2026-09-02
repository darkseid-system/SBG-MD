const fs = require('fs');
if (fs.existsSync('bot.env')) require('dotenv').config({ path: './bot.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
BOT_URL: process.env.BOT_URL || "https://raw.githubusercontent.com/DarkseidMDofficial/SBG-MD-DATA/refs/heads/main/datafile.json",
AUTO_SITE: process.env.AUTO_SITE || "https://arslan-apis.vercel.app",
BAND_URL: process.env.BAND_URL || "https://raw.githubusercontent.com/DarkseidMDofficial/SBG-MD-DATA/refs/heads/main/bandusers.json",
REPO_LINK: process.env.REPO_LINK || "https://github.com/darkseid-system/SBG-MD",
BOT_IMAGE: process.env.BOT_IMAGE || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
REPO_NAME: process.env.REPO_NAME || "SBG-MD",
BOT_NAME: process.env.BOT_NAME || "SBG-MD",
DESCRIPTION: process.env.DESCRIPTION || "NEXT-GENERATION WHATSAPP BOT — POWERED BY DARKSEID SYSTEM",
OWNER_NUMBER: process.env.OWNER_NUMBER || "923392616263",
OWNER_NAME: process.env.OWNER_NAME || "Darkseid DeV",
ST_SAVE: process.env.ST_SAVE || "SBG-MD-STATUS-SERVER",
BIO_TEXT: process.env.BIO_TEXT || "SBG-MD-BY-DARKSEID-DEV",
AUTO_STATUS_MSG: process.env.AUTO_STATUS_MSG || "*`STATUS SEEN BY SBG-MD`* _*POWERD BY*_ *Darkseid DeV Whtsapp Bot*",
FOOTER: process.env.FOOTER || "SBG-MD",
COPYRIGHT: process.env.COPYRIGHT || "*㋛ SBG-MD BY DARKSEID DEV*",
VERSION: process.env.VERSION || "9.0.0",
NEWSLETTER: process.env.NEWSLETTER || "120363348739987203@newsletter",
WA_CHANNEL: process.env.WA_CHANNEL || "https://whatsapp.com/channel/0029VarfjW04tRrmwfb8x306",
INSTA: process.env.INSTA || "https://github.com/darkseid-system/SBG-MD",
ALIVE_IMG: process.env.ALIVE_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
OWNER_IMG: process.env.OWNER_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
CONVERT_IMG: process.env.CONVERT_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
AI_IMG: process.env.AI_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
SEARCH_IMG: process.env.SEARCH_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
DOWNLOAD_IMG: process.env.DOWNLOAD_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
MAIN_IMG: process.env.MAIN_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
GROUP_IMG: process.env.GROUP_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
FUN_IMG: process.env.FUN_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
TOOLS_IMG: process.env.TOOLS_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
OTHER_IMG: process.env.OTHER_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
MOVIE_IMG: process.env.MOVIE_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
NEWS_IMG: process.env.NEWS_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg",
PP_IMG: process.env.PP_IMG || "https://i.ibb.co/spyR3qdd/SBG-MD.jpg"
};
