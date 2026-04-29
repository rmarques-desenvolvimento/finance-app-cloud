const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Função de log compartilhada
let logger = console.log;
function setLogger(logFunc) { logger = logFunc; }
function setSupabaseClient(client) { this.supabase = client; }

class WhatsAppService {
    constructor() {
        this.client = null;
this.supabase = null;
        this.isReady = false;
        this.isAuthenticated = false;
        this.onQrCallback = null;
        this.onReadyCallback = null;
        this.onAuthCallback = null;
        this.onDisconnectedCallback = null;
        this.onMessageCallback = null;
        this.lastQr = null;
    }

    init(userDataPath) {
        if (this.client) return;

        // Pasta para salvar a sessão do WhatsApp (LocalAuth)
        // Usando a pasta de dados do app para persistência entre reinicializações
        const authPath = path.resolve(userDataPath, 'wa_session');
        logger(`[WHATSAPP] Sessão será salva em: ${authPath}`);

        // Configuração do Puppeteer usando o Chromium interno do whatsapp-web.js
        // Sem headless para que o antigo perfil de sessão seja sempre usado
        const puppeteerOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        };

        try {
            this.client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: authPath,
                    clientId: 'finance-app'
                }),
                puppeteer: puppeteerOptions
            });
            logger('[WHATSAPP] Client criado com LocalAuth. Sessão persistente ativada.');
        } catch (e) {
            logger(`[WHATSAPP] ERRO ao criar client: ${e.message}`);
            return;
        }

        this.client.on('qr', async (qr) => {
            logger('[WHATSAPP] QR Code recebido. Aguardando leitura do celular...');
            try {
                const qrImageBase64 = await qrcode.toDataURL(qr);
                this.lastQr = qrImageBase64;
                if (this.onQrCallback) this.onQrCallback(qrImageBase64);
            } catch (err) {
                logger(`[WHATSAPP] Erro ao gerar QR Code: ${err.message}`);
            }
        });

        this.client.on('authenticated', () => {
            logger('[WHATSAPP] Autenticado com sucesso! Sessão será salva.');
            this.isAuthenticated = true;
            this.lastQr = null; // Limpa o QR pois já está autenticado
            if (this.onAuthCallback) this.onAuthCallback();
        });

        this.client.on('ready', () => {
            logger('[WHATSAPP] Cliente PRONTO! Conectado ao WhatsApp.');
            this.isReady = true;
            this.lastQr = null;
            if (this.onReadyCallback) this.onReadyCallback();
        });

        this.client.on('disconnected', (reason) => {
            logger(`[WHATSAPP] Desconectado. Motivo: ${reason}`);
            this.isReady = false;
            this.isAuthenticated = false;
            this.client = null; // Reseta o client para permitir nova inicialização
            if (this.onDisconnectedCallback) this.onDisconnectedCallback(reason);
        });

        // Usar message_create para capturar tanto mensagens recebidas quanto enviadas pelo próprio usuário (espelhamento)
        this.client.on('message_create', async (msg) => {
            try {
                const chat = await msg.getChat();
                const isGroup = chat.isGroup;
                const groupName = isGroup ? (chat.name || '') : '';
                const upperGroupName = groupName.toUpperCase();

                // Process only target groups or direct messages
                if (isGroup && !upperGroupName.includes('CONTROLE') && !upperGroupName.includes('FINANCEIRO')) {
                    return; // Ignora outros grupos
                }

                const body = msg.body || '';
                logger(`[WHATSAPP-TRACER] Msg: fromMe=${msg.fromMe} | body="${body.substring(0,30)}" | grupo="${groupName}"`);

                // Filtra ecos automáticos do bot (identificados pelo caractere invisível \u200B)
                if (body.includes('\u200B')) { 
                    logger(`[WHATSAPP-TRACER] Eco do bot ignorado.`); 
                    return; 
                }

                // Encaminha para o main.js processar (OCR, estados, etc.)
                if (this.onMessageCallback) { await this.onMessageCallback(msg, chat); }

            } catch (err) {
                logger(`[WHATSAPP] Erro ao processar mensagem: ${err.message}`);
            }
        });



        logger('[WHATSAPP] Inicializando... Se houver sessão salva, reconectará automaticamente.');
        this.client.initialize().catch(e => {
            logger(`[WHATSAPP] Erro na inicialização: ${e.message}`);
        });
    }

    async logout() {
        if (this.client) {
            try {
                await this.client.logout();
            } catch(e) {
                logger(`[WHATSAPP] Erro no logout: ${e.message}`);
            }
            this.isReady = false;
            this.isAuthenticated = false;
            this.client = null;
            if (this.onDisconnectedCallback) this.onDisconnectedCallback('LOGOUT_USER');
        }
    }

    getStatus() {
        return {
            isReady: this.isReady,
            isAuthenticated: this.isAuthenticated,
            lastQr: this.lastQr
        };
    }

    async hasControleGroup() {
        if (!this.isReady) return false;
        
        // Cache override to prevent flapping due to whatsapp-web.js latency
        if (this.groupOverride !== undefined && this.groupOverrideExpires && Date.now() < this.groupOverrideExpires) {
            return this.groupOverride;
        }

        try {
            const chats = await this.client.getChats();
            const group = chats.find(c => c.isGroup && c.name === 'CONTROLE FINANCEIRO');
            return !!group;
        } catch (e) {
            return false;
        }
    }

    async sendPdf(filePath, dest, caption = 'Resumo Mensal') {
        if (!this.isReady) {
            throw new Error('WhatsApp não está conectado/pronto.');
        }
        try {
            let chatId = dest;
            if (!chatId.includes('@')) {
                let formattedPhone = dest.replace(/\D/g, '');
                if (formattedPhone.length === 10 || formattedPhone.length === 11) {
                    if (!formattedPhone.startsWith('55')) {
                        formattedPhone = '55' + formattedPhone;
                    }
                }
                chatId = formattedPhone + '@c.us';
            }
            
            const media = MessageMedia.fromFilePath(filePath);
            await this.client.sendMessage(chatId, media, { caption });
            logger(`[WHATSAPP] Arquivo ${path.basename(filePath)} enviado para ${chatId}`);
            return { success: true };
        } catch (error) {
            logger(`[WHATSAPP] Erro ao enviar PDF: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async createGroup(name, participants) {
        if (!this.isReady) {
            throw new Error('WhatsApp não está conectado/pronto.');
        }
        try {
            logger(`[WHATSAPP] Criando grupo: ${name} com ${participants.length} participantes.`);
            const contactIds = participants
                .filter(p => p && p.trim().length > 0)
                .map(p => {
                    let clean = p.replace(/\D/g, '');
                    if (clean.length === 10 || clean.length === 11) {
                        if (!clean.startsWith('55')) clean = '55' + clean;
                    }
                    return clean + '@c.us';
                })
                .filter(id => id.length > 5); // Garante que não é apenas '@c.us'

            const response = await this.client.createGroup(name, contactIds);
            logger(`[WHATSAPP] Grupo criado com sucesso: ${name}`);
            
            // Set override for 2 minutes to mask latency
            this.groupOverride = true;
            this.groupOverrideExpires = Date.now() + 120000;
            
            // Tenta definir as permissões do grupo para que todos possam enviar mensagens e promove participantes a admin
            try {
                const groupChat = await this.client.getChatById(response.gid._serialized);
                await groupChat.setMessagesAdminsOnly(false);
                
                // Promover todos os participantes a administradores para garantir acesso total
                await groupChat.promoteParticipants(contactIds);
                
                logger(`[WHATSAPP] Permissões do grupo ${name} definidas para TODOS e participantes promovidos.`);
            } catch (pe) {
                logger(`[WHATSAPP] Aviso: Não foi possível definir permissões de admin ou promover, mas o grupo foi criado.`);
            }

            return { success: true, gid: response.gid };
        } catch (error) {
            logger(`[WHATSAPP] Erro ao criar grupo: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async deleteGroupByName(name) {
        if (!this.isReady) {
            throw new Error('WhatsApp não está conectado/pronto.');
        }
        try {
            logger(`[WHATSAPP] Buscando grupo para remover: ${name}`);
            const chats = await this.client.getChats();
            const group = chats.find(c => c.isGroup && c.name === name);

            if (!group) {
                return { success: false, error: 'Grupo não encontrado.' };
            }

            // Para remover o grupo "de verdade", o ideal é remover os participantes antes de sair
            // Mas isso exige ser admin. Se não for, apenas saímos e deletamos a conversa localmente.
            try {
                // Tenta remover todos (opcional, depende de permissão)
                const participants = group.groupMetadata.participants;
                const botId = this.client.info.wid._serialized;
                const toRemove = participants
                    .filter(p => p.id._serialized !== botId)
                    .map(p => p.id._serialized);

                if (toRemove.length > 0) {
                    await group.removeParticipants(toRemove);
                }
            } catch (e) {
                logger(`[WHATSAPP] Não foi possível remover participantes (provavelmente sem admin). Sair direto.`);
            }

            await group.leave();
            await group.delete();

            logger(`[WHATSAPP] Grupo ${name} removido com sucesso.`);
            
            // Set override for 2 minutes to mask latency
            this.groupOverride = false;
            this.groupOverrideExpires = Date.now() + 120000;
            
            return { success: true };
        } catch (error) {
            logger(`[WHATSAPP] Erro ao remover grupo: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async deleteMessages(messageIds) {
        if (!this.isReady) {
            throw new Error('WhatsApp não está conectado/pronto.');
        }
        try {
            if (!Array.isArray(messageIds)) {
                messageIds = [messageIds];
            }
            for (const msgId of messageIds) {
                await this.client.pinMessage(msgId);
                const chat = await this.client.getChatById(msgId.chatId._serialized);
                // Deleta a mensagem
                await this.client.deleteMessage(msgId, { deleteOnlyForMe: true });
            }
            logger(`[WHATSAPP] ${messageIds.length} mensagem(ns) deletada(s).`);
            return { success: true };
        } catch (error) {
            logger(`[WHATSAPP] Erro ao deletar mensagem: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async deleteMessageById(messageId) {
        if (!this.isReady) {
            throw new Error('WhatsApp não está conectado/pronto.');
        }
        try {
            await this.client.deleteMessage(messageId, { deleteOnlyForMe: true });
            logger(`[WHATSAPP] Mensagem ${messageId} deletada.`);
            return { success: true };
        } catch (error) {
            logger(`[WHATSAPP] Erro ao deletar mensagem: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

module.exports = {
    service: new WhatsAppService(),
    setLogger
};
