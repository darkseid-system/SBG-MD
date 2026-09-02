const { proto, downloadContentFromMessage, getContentType } = require('@whiskeysockets/baileys')
const fs = require('fs')

/* ================= MEDIA DOWNLOAD ================= */

const downloadMediaMessage = async (m, filename) => {
  if (m.type === 'viewOnceMessage') m.type = m.msg.type

  const save = async (stream, name) => {
    let buffer = Buffer.from([])
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
    fs.writeFileSync(name, buffer)
    return buffer
  }

  if (m.type === 'imageMessage')
    return save(await downloadContentFromMessage(m.msg, 'image'), `${filename || 'file'}.jpg`)

  if (m.type === 'videoMessage')
    return save(await downloadContentFromMessage(m.msg, 'video'), `${filename || 'file'}.mp4`)

  if (m.type === 'audioMessage')
    return save(await downloadContentFromMessage(m.msg, 'audio'), `${filename || 'file'}.mp3`)

  if (m.type === 'stickerMessage')
    return save(await downloadContentFromMessage(m.msg, 'sticker'), `${filename || 'file'}.webp`)

  if (m.type === 'documentMessage') {
    const ext = m.msg.fileName?.split('.').pop() || 'bin'
    return save(await downloadContentFromMessage(m.msg, 'document'), `${filename || 'file'}.${ext}`)
  }
}

/* ================= MESSAGE SERIALIZER ================= */

const sms = (conn, m, store) => {
  if (!m) return m
  const M = proto.WebMessageInfo

  /* ---------- BASIC INFO ---------- */
  if (m.key) {
    m.id = m.key.id
    m.chat = m.key.remoteJid
    m.fromMe = m.key.fromMe
    m.isGroup = m.chat.endsWith('@g.us')
    m.sender = m.fromMe
      ? conn.user.id.split(':')[0] + '@s.whatsapp.net'
      : m.isGroup
      ? m.key.participant
      : m.chat
  }

  /* ---------- MESSAGE CONTENT ---------- */
  if (m.message) {
    m.mtype = getContentType(m.message)
    m.msg =
      m.mtype === 'viewOnceMessage'
        ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)]
        : m.message[m.mtype]

    /* ---------- SAFE BODY ---------- */
    let rawBody =
      (m.mtype === 'conversation' && m.message.conversation) ||
      (m.mtype === 'imageMessage' && m.message.imageMessage?.caption) ||
      (m.mtype === 'videoMessage' && m.message.videoMessage?.caption) ||
      (m.mtype === 'extendedTextMessage' && m.message.extendedTextMessage?.text) ||
      (m.mtype === 'buttonsResponseMessage' && m.message.buttonsResponseMessage?.selectedButtonId) ||
      (m.mtype === 'listResponseMessage' && m.message.listResponseMessage?.singleSelectReply?.selectedRowId) ||
      (m.mtype === 'templateButtonReplyMessage' && m.message.templateButtonReplyMessage?.selectedId) ||
      ''

    m.body = typeof rawBody === 'string' ? rawBody : ''

    /* ---------- QUOTED ---------- */
    m.quoted = m.msg?.contextInfo?.quotedMessage || null
    m.mentionedJid = m.msg?.contextInfo?.mentionedJid || []

    if (m.quoted) {
      const type = getContentType(m.quoted)
      m.quoted = m.quoted[type]
      if (typeof m.quoted === 'string') m.quoted = { text: m.quoted }

      m.quoted.mtype = type
      m.quoted.id = m.msg.contextInfo.stanzaId
      m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
      m.quoted.sender = m.msg.contextInfo.participant
      m.quoted.fromMe = m.quoted.sender === (conn.user && conn.user.id)
      m.quoted.text =
        m.quoted.text ||
        m.quoted.caption ||
        m.quoted.conversation ||
        m.quoted.selectedDisplayText ||
        ''
    }
  }

  /* ---------- SAFE TEXT ---------- */
  m.text =
    typeof m.msg?.text === 'string'
      ? m.msg.text
      : typeof m.msg?.caption === 'string'
      ? m.msg.caption
      : typeof m.message?.conversation === 'string'
      ? m.message.conversation
      : typeof m.msg?.selectedDisplayText === 'string'
      ? m.msg.selectedDisplayText
      : typeof m.msg?.title === 'string'
      ? m.msg.title
      : ''

  /* ---------- HELPERS ---------- */
  m.reply = (text) => {
    if (!text || typeof text !== 'string') return
    return conn.sendMessage(m.chat, { text }, { quoted: m })
  }

  m.react = (emoji) =>
    conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } })

  m.copy = () => exports.sms(conn, M.fromObject(M.toObject(m)), store)

  m.copyNForward = (jid = m.chat, force = false, opts = {}) =>
    conn.copyNForward(jid, m, force, opts)

  if (m.msg?.url) m.download = () => conn.downloadMediaMessage(m.msg)

  return m
}

module.exports = { sms, downloadMediaMessage }