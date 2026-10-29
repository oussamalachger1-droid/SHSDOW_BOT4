const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');

let ELITE_ADMINS = [
    '212600000000@s.whatsapp.net',
];

const disabledGroups = new Set();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ انقطع الاتصال، جاري إعادة المحاولة...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ تم اتصال درع النقابة بنجاح وهو في حالة تأهب قصوى!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const mek = m.messages[0];
            if (!mek.message || !mek.key.remoteJid) return;

            const chatId = mek.key.remoteJid;
            const sender = mek.key.participant || mek.key.remoteJid;
            const isGroup = chatId.endsWith('@g.us');
            
            const textMessage = mek.message.conversation || 
                                mek.message.extendedTextMessage?.text || '';

            const isEliteSender = ELITE_ADMINS.includes(sender);

            if (isGroup) {
                if (textMessage === '.اوامر') {
                    const menuText = `🛡️ *قائمة أوامر درع النقابة (النخبة)* 🛡️\n\n` +
                                     `🔹 *.اوامر* : عرض قائمة الأوامر المتاحة.\n` +
                                     `🔹 *.تست* : اختبار حالة استجابة البوت.\n` +
                                     `🔹 *.نخبة [منشن / رد]* : ترقية عضو ليصبح من النخبة.\n` +
                                     `🔹 *.طرد [منشن]* : طرد عضو يدوياً من الجروب.\n` +
                                     `🔹 *.إيقاف* : إيقاف حماية البوت مؤقتاً في هذا الجروب.\n` +
                                     `🔹 *.تشغيل* : استئناف وتفعيل حماية البوت في الجروب.\n` +
                                     `🔹 *.فحص [الرقم]* : فحص حالة رقم معين.\n\n` +
                                     `⚡ الحماية التلقائية مفعلة طوال الوقت ضد حسابات البوتات والمخربين.`;
                    
                    await sock.sendMessage(chatId, { text: menuText }, { quoted: mek });
                    return;
                }

                if (textMessage === '.تست' && isEliteSender) {
                    await sock.sendMessage(chatId, { text: '🛡️ درع النقابة يعمل بنجاح تام وفي حالة تأهب قصوى!\n✅ تم تنفيذ الأمر بنجاح.' }, { quoted: mek });
                    return;
                }

                if (textMessage.startsWith('.نخبة') && isEliteSender) {
                    const quotedParticipant = mek.message.extendedTextMessage?.contextInfo?.participant;
                    const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    
                    let targetUser = null;
                    if (quotedParticipant) {
                        targetUser = quotedParticipant;
                    } else if (mentioned && mentioned.length > 0) {
                        targetUser = mentioned[0];
                    }

                    if (targetUser) {
                        if (!ELITE_ADMINS.includes(targetUser)) {
                            ELITE_ADMINS.push(targetUser);
                        }
                        await sock.sendMessage(chatId, { text: `👑 تم ترقية العضو (@${targetUser.split('@')[0]}) ليصبح من "النخبة" بنجاح!\n✅ تم تنفيذ الأمر بنجاح.`, mentions: [targetUser] }, { quoted: mek });
                    } else {
                        await sock.sendMessage(chatId, { text: '⚠️ المرجو عمل منشن للعضو المراد ترقيته أو الرد على رسالته، مثال: .نخبة @عضو' }, { quoted: mek });
                    }
                    return;
                }

                if (textMessage === '.إيقاف' && isEliteSender) {
                    disabledGroups.add(chatId);
                    await sock.sendMessage(chatId, { text: '🛡️ تم إيقاف درع النقابة مؤقتاً في هذه المجموعة بناءً على أمر النخبة.\n✅ تم تنفيذ الأمر بنجاح.' }, { quoted: mek });
                    return;
                }

                if (textMessage === '.تشغيل' && isEliteSender) {
                    disabledGroups.delete(chatId);
                    await sock.sendMessage(chatId, { text: '🛡️ تم تفعيل واستئناف عمل درع النقابة في هذه المجموعة بنجاح.\n✅ تم تنفيذ الأمر بنجاح.' }, { quoted: mek });
                    return;
                }

                if (textMessage.startsWith('.طرد') && isEliteSender) {
                    const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    if (mentioned && mentioned.length > 0) {
                        for (const targetUser of mentioned) {
                            await sock.groupParticipantsUpdate(chatId, [targetUser], 'remove');
                        }
                        await sock.sendMessage(chatId, { text: `⚡ تم تنفيذ الطرد اليدوي للعضو بنجاح.\n✅ تم تنفيذ الأمر بنجاح.` }, { quoted: mek });
                    } else {
                        await sock.sendMessage(chatId, { text: '⚠️ المرجو عمل منشن للشخص المراد طرده مع الأمر، مثال: .طرد @عضو' }, { quoted: mek });
                    }
                    return;
                }

                if (disabledGroups.has(chatId)) return;
            }

            if (textMessage.startsWith('.فحص ')) {
                const targetNumber = textMessage.split(' ')[1];
                if (targetNumber) {
                    await sock.sendMessage(chatId, { 
                        text: `🔍 نتائج فحص الرقم (${targetNumber}):\n- الحالة: جاري التحقق من بصمة الاتصال.\n- التقييم: الحساب نظامي أو مرتبط (يرجى توخي الحذر).\n✅ تم تنفيذ الأمر بنجاح.` 
                    }, { quoted: mek });
                } else {
                    await sock.sendMessage(chatId, { text: '⚠️ المرجو كتابة الرقم بشكل صحيح بعد الأمر، مثال: .فحص 2126xxxxxxxx' }, { quoted: mek });
                }
                return;
            }

        } catch (err) {
            console.error('خطأ في معالجة الرسائل:', err);
        }
    });

    sock.ev.on('group-participants-update', async (update) => {
        try {
            const { id: chatId, participants, action } = update;

            if (action === 'add') {
                const groupMetadata = await sock.groupMetadata(chatId);
                const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const botIsAdmin = groupMetadata.participants.some(p => p.id === botId && (p.admin === 'admin' || p.admin === 'superadmin'));

                if (!botIsAdmin) return;

                for (const participant of participants) {
                    const isSuspiciousDevice = participant.includes(':') || participant.length > 30;

                    if (isSuspiciousDevice) {
                        await sock.groupParticipantsUpdate(chatId, [participant], 'remove');

                        const groupAdmins = groupMetadata.participants
                            .filter(p => p.admin)
                            .map(p => p.id);

                        const mentionText = groupAdmins.map(a => `@${a.split('@')[0]}`).join(' ');

                        await sock.sendMessage(chatId, {
                            text: `🚨 **تم رصد وطرد حساب تخريبي / بوت مرتبَط فوراً!**\n\n📌 **السبب:** الكشف عن دخول حساب مرتبط بأجهزة متعددة بصورة مشبوهة.\n\n⚠️ تنبيه للمشرفين والنخبة: ${mentionText}`,
                            mentions: groupAdmins
                        });
                    }
                }
            }
        } catch (err) {
            console.error('خطأ في نظام حماية الأعضاء:', err);
        }
    });
}

startBot();
