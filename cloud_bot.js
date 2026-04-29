/**
 * Finance Bot Cloud - Versão com Sessão Persistente no Supabase
 * A sessão WhatsApp é salva no Supabase Storage e sobrevive
 * a qualquer reinicialização do Render.
 */

const { Client, RemoteAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

let lastMsg = "Nenhuma mensagem recebida ainda";
let currentQR = "";
let botReady = false;

// ====================================================
// SUPABASE
// ====================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ostmikofmcgxsdjznrcs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zdG1pa29mbWNneHNkanpucmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjE1NjQsImV4cCI6MjA5Mjc5NzU2NH0.m9spKtcueSz-VHZONAK-L02FfYWNSDvHjNFL4lWP8_U';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CLOUD_TOKEN = 'RICARDO-FINANCE-CLOUD-2026';
const BUCKET = 'whatsapp-sessions';
const SESSION_ID = 'cloud-bot-ricardo';

// ====================================================
// LOG REMOTO
// ====================================================
async function logCloud(level, mensagem, dados = {}) {
    console.log(`[${level}] ${mensagem}`);
    try {
        await supabase.from('logs_bot').insert({ level, mensagem, dados, criado_em: new Date().toISOString() });
    } catch (_) {}
}

// ====================================================
// SALVAR MENSAGEM NO SUPABASE
// ====================================================
async function salvarMensagem(texto, nome, fone, extras = {}) {
    const payload = {
        sync_token: CLOUD_TOKEN,
        texto,
        remetente_nome: nome || fone,
        remetente_fone: fone,
        status: 'pendente',
        timestamp: new Date().toISOString(),
        ...extras
    };
    const { data, error } = await supabase.from('mensagens_zap').insert(payload).select();
    if (error) {
        await logCloud('ERROR', `Falha ao salvar: ${error.message}`, { error, payload });
        return false;
    }
    await logCloud('INFO', `Mensagem salva! ID: ${data?.[0]?.id}`, { texto });
    return true;
}

// ====================================================
// SUPABASE STORE PARA RemoteAuth
// Persiste a sessão WhatsApp no Supabase Storage
// ====================================================
class SupabaseStore {
    constructor() {}

    async sessionExists({ session }) {
        try {
            const { data, error } = await supabase.storage
                .from(BUCKET)
                .list('', { search: `${session}.zip` });
            if (error || !data) return false;
            const exists = data.some(f => f.name === `${session}.zip`);
            console.log(`[SESSION] Sessão "${session}" ${exists ? 'encontrada' : 'não encontrada'} no Supabase Storage.`);
            return exists;
        } catch (e) {
            console.error('[SESSION] Erro ao verificar sessão:', e);
            return false;
        }
    }

    async save({ session }) {
        try {
            const zipPath = `./${session}.zip`;
            if (!fs.existsSync(zipPath)) {
                console.warn(`[SESSION] Arquivo ${zipPath} não encontrado para salvar.`);
                return;
            }
            const fileBuffer = fs.readFileSync(zipPath);
            const { error } = await supabase.storage
                .from(BUCKET)
                .upload(`${session}.zip`, fileBuffer, {
                    upsert: true,
                    contentType: 'application/zip'
                });
            if (error) throw error;
            console.log(`[SESSION] Sessão "${session}" salva no Supabase Storage com sucesso! (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
            await logCloud('INFO', `Sessão salva no Storage: ${(fileBuffer.length / 1024).toFixed(1)} KB`);
        } catch (e) {
            console.error('[SESSION] Erro ao salvar sessão:', e);
            await logCloud('ERROR', `Erro ao salvar sessão: ${e.message}`);
        }
    }

    async extract({ session, path: destPath }) {
        try {
            const { data, error } = await supabase.storage
                .from(BUCKET)
                .download(`${session}.zip`);
            if (error) throw error;
            const buffer = Buffer.from(await data.arrayBuffer());
            fs.writeFileSync(destPath, buffer);
            console.log(`[SESSION] Sessão "${session}" extraída do Supabase Storage. (${(buffer.length / 1024).toFixed(1)} KB)`);
            await logCloud('INFO', `Sessão restaurada do Storage: ${(buffer.length / 1024).toFixed(1)} KB`);
        } catch (e) {
            console.error('[SESSION] Erro ao extrair sessão:', e);
            await logCloud('ERROR', `Erro ao extrair sessão: ${e.message}`);
            throw e;
        }
    }

    async delete({ session }) {
        try {
            await supabase.storage.from(BUCKET).remove([`${session}.zip`]);
            console.log(`[SESSION] Sessão "${session}" removida do Supabase Storage.`);
        } catch (e) {
            console.error('[SESSION] Erro ao deletar sessão:', e);
        }
    }
}

// ====================================================
// SERVIDOR WEB (mantém o Render acordado + mostra QR)
// ====================================================
app.get('/', (req, res) => {
    if (currentQR) {
        res.send(`<!DOCTYPE html>
<html><head>
    <meta charset="utf-8">
    <title>Finance Bot - Conectar WhatsApp</title>
    <meta http-equiv="refresh" content="20">
    <style>
        body { background: #0a0e1a; color: white; font-family: sans-serif; text-align: center; padding: 50px; }
        h1 { color: #6366f1; } img { border-radius: 10px; padding: 20px; background: white; }
        p { color: #888; }
    </style>
</head><body>
    <h1>🤖 Finance Bot Cloud</h1>
    <p>Escaneie o QR Code abaixo para conectar:</p>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" />
    <p>Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar um aparelho</p>
    <p style="color:#e74c3c; font-size:0.8rem;">Esta página atualiza automaticamente a cada 20 segundos.</p>
</body></html>`);
    } else {
        const cor = botReady ? '#2ecc71' : '#e74c3c';
        const emoji = botReady ? '🟢' : '🔴';
        res.send(`<!DOCTYPE html>
<html><head>
    <meta charset="utf-8">
    <title>Finance Bot - Status</title>
    <style>
        body { background: #0a0e1a; color: white; font-family: sans-serif; text-align: center; padding: 50px; }
        h1 { color: ${cor}; }
    </style>
</head><body>
    <h1>${emoji} Finance Bot Cloud</h1>
    <p>Status: <b>${botReady ? 'CONECTADO e ouvindo mensagens' : 'Aguardando sessão...'}</b></p>
    <p style="color:#888;">Última mensagem: <b>${lastMsg}</b></p>
    <p><a href="/status" style="color:#6366f1;">Ver status JSON</a></p>
</body></html>`);
    }
});

app.get('/status', (req, res) => {
    res.json({
        online: true,
        whatsapp_connected: botReady,
        has_qr: !!currentQR,
        last_message: lastMsg,
        session_storage: 'supabase',
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => console.log(`[SERVIDOR] Rodando na porta ${port}`));

// ====================================================
// WHATSAPP CLIENT COM SESSÃO PERSISTENTE
// ====================================================
const store = new SupabaseStore();
const waBotStates = new Map();

const client = new Client({
    authStrategy: new RemoteAuth({
        clientId: SESSION_ID,
        dataPath: './whatsapp_session_cloud',
        store: store,
        backupSyncIntervalMs: 5 * 60 * 1000 // Salva sessão a cada 5 minutos
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--single-process'
        ]
    }
});

client.on('qr', async (qr) => {
    currentQR = qr;
    botReady = false;
    console.log('[QR] Novo QR Code gerado. Acesse a URL do Render para escanear.');
    // Salva o QR no Supabase para a página local buscar e exibir
    await logCloud('WARN', 'QR Code gerado - escaneamento necessário', { qr });
});

client.on('authenticated', async () => {
    console.log('[AUTH] Autenticado com sucesso!');
    await logCloud('INFO', 'Autenticado com sucesso');
});

client.on('remote_session_saved', async () => {
    console.log('[SESSION] Sessão salva remotamente no Supabase!');
    await logCloud('SUCCESS', 'Sessão salva no Supabase Storage');
});

client.on('ready', async () => {
    currentQR = "";
    botReady = true;
    const info = client.info;
    console.log(`[PRONTO] Bot conectado: ${info?.pushname} (${info?.wid?.user})`);
    await logCloud('SUCCESS', `Bot PRONTO! Número: ${info?.wid?.user}, Nome: ${info?.pushname}`);
});

client.on('disconnected', async (reason) => {
    botReady = false;
    console.log(`[DESCONECTADO] ${reason}`);
    await logCloud('WARN', `Bot desconectado: ${reason}`);
});

// ====================================================
// PROCESSAMENTO DE MENSAGENS
// ====================================================
client.on('message_create', async (msg) => {
    try {
        if (msg.type === 'e2e_notification' || msg.type === 'notification_template') return;
        if (!msg.body && !msg.hasMedia) return;

        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const senderId = msg.fromMe ? (client.info?.wid?._serialized || 'me') : contact.id._serialized;
        const body = (msg.body || '').trim();
        const lowerBody = body.toLowerCase();

        await logCloud('DEBUG', `Msg de ${contact.pushname || contact.number}`, {
            body: body.substring(0, 100),
            fromMe: msg.fromMe,
            isGroup: chat.isGroup,
            chat: chat.isGroup ? chat.name : 'privado'
        });

        // Ignora grupos que não são de controle
        if (chat.isGroup && !chat.name.toUpperCase().includes('CONTROLE')) return;
        // Ignora ecos do bot
        if (body.includes('\u200B')) return;

        lastMsg = body || '[MÍDIA]';

        // Salva TODA mensagem recebida automaticamente
        if (body.length > 0) {
            await salvarMensagem(body, contact.pushname || contact.number, contact.number);
        }
        if (msg.hasMedia && !body) {
            await salvarMensagem(`[MÍDIA: ${msg.type}]`, contact.pushname || contact.number, contact.number);
        }

        // === MÁQUINA DE ESTADOS - Menu Interativo ===
        let state = waBotStates.get(senderId) || { step: 'IDLE', data: {} };

        if (lowerBody === 'cancelar' || lowerBody === '!cancelar') {
            waBotStates.delete(senderId);
            await msg.reply('❌ Operação cancelada. Digite "Oi" para o menu.');
            return;
        }

        if (state.step === 'IDLE' && (lowerBody === 'oi' || lowerBody === 'menu' || lowerBody === 'olá')) {
            const { data: pessoas } = await supabase.from('cloud_pessoas').select('*').eq('sync_token', CLOUD_TOKEN);
            const listaPessoas = (pessoas && pessoas.length > 0) ? pessoas : [
                { pessoa_id: 1, nome: 'Cris' },
                { pessoa_id: 2, nome: 'Pai' },
                { pessoa_id: 3, nome: 'Ricardo' }
            ];
            let menu = `👋 *Assistente Financeiro Cloud*\n\nEscolha a pessoa:\n`;
            listaPessoas.forEach((p, i) => { menu += `\n${i + 1}️⃣  *${p.nome}*`; });
            menu += `\n\n_💡 Dica: mande uma foto de cupom a qualquer momento!_`;
            waBotStates.set(senderId, { step: 'SELECT_PERSON', data: { lista: listaPessoas } });
            await msg.reply('\u200B' + menu);
            return;
        }

        if (state.step === 'SELECT_PERSON') {
            const idx = parseInt(body) - 1;
            const selecionada = state.data.lista?.[idx];
            if (selecionada) {
                waBotStates.set(senderId, { step: 'SELECT_ACTION', data: { person_id: selecionada.pessoa_id, person_name: selecionada.nome } });
                await msg.reply('\u200B' + `👤 *${selecionada.nome}*\n\nO que deseja fazer?\n\n1️⃣  Adicionar Gasto\n2️⃣  Enviar Cupom\n0️⃣  Voltar`);
            } else {
                await msg.reply('\u200B' + '❌ Opção inválida. Escolha um número da lista.');
            }
            return;
        }

        if (state.step === 'SELECT_ACTION') {
            if (body === '0') { waBotStates.set(senderId, { step: 'IDLE', data: {} }); await msg.reply('\u200B' + 'Digite "Oi" para o menu.'); }
            else if (body === '1') { waBotStates.set(senderId, { step: 'WAIT_VALUE', data: { ...state.data } }); await msg.reply('\u200B' + '💰 *Qual o valor do gasto?*\n_(Ex: 25,50)_'); }
            else if (body === '2') { waBotStates.set(senderId, { step: 'IDLE', data: {} }); await msg.reply('\u200B' + '📸 Pode enviar a foto do cupom!'); }
            return;
        }

        if (state.step === 'WAIT_VALUE') {
            const valor = body.replace(',', '.').replace(/[^\d.]/g, '');
            if (valor && !isNaN(parseFloat(valor))) {
                state.data.valor = valor; state.step = 'WAIT_DESC';
                waBotStates.set(senderId, state);
                await msg.reply('\u200B' + `✅ Valor: R$ ${valor}\n\n📝 *Descrição do gasto?*\n_(Ex: Mercado, Almoço)_`);
            } else {
                await msg.reply('\u200B' + '❌ Valor inválido. Use números e vírgula.');
            }
            return;
        }

        if (state.step === 'WAIT_DESC') {
            const descricao = body;
            waBotStates.delete(senderId);
            const ok = await salvarMensagem(
                `GASTO|${state.data.person_name}|R$${state.data.valor}|${descricao}`,
                contact.pushname || contact.number,
                contact.number,
                { tipo: 'gasto', person_name: state.data.person_name, valor: state.data.valor, descricao }
            );
            if (ok) {
                await msg.reply('\u200B' + `🎉 *R$ ${state.data.valor}* em *${descricao}* registrado para *${state.data.person_name}*! ✅`);
            } else {
                await msg.reply('\u200B' + '⚠️ Problema ao salvar. Tente novamente.');
            }
            return;
        }

    } catch (err) {
        console.error('[ERRO FATAL]', err);
        await logCloud('ERROR', `Erro fatal: ${err.message}`, { stack: err.stack });
    }
});

// ====================================================
// INICIALIZAR
// ====================================================
console.log('[INIT] Iniciando Finance Bot Cloud com sessão persistente no Supabase...');
client.initialize().catch(async (err) => {
    console.error('[INIT ERROR]', err);
    await logCloud('ERROR', `Falha ao inicializar: ${err.message}`);
});
