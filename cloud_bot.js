const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

let lastMsg = "Nenhuma mensagem recebida ainda";
let currentQR = "";
let botReady = false;

// ====================================================
// SERVIDOR WEB (mantém o Render acordado + exibe QR)
// ====================================================
app.get('/', (req, res) => {
    if (currentQR) {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; padding: 50px; background: #0a0e1a; color: white; min-height: 100vh;">
                <h1 style="color: #6366f1;">🤖 Finance Bot Cloud</h1>
                <p>Escaneie o QR Code abaixo para conectar:</p>
                <div style="background: white; padding: 20px; display: inline-block; border-radius: 10px; margin: 20px;">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" />
                </div>
                <p style="color: #888;">Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar um aparelho</p>
                <script>setTimeout(() => location.reload(), 20000);</script>
            </div>
        `);
    } else {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; padding: 50px; background: #0a0e1a; color: white; min-height: 100vh;">
                <h1 style="color: #${botReady ? '2ecc71' : 'e74c3c'};">${botReady ? '🟢' : '🔴'} Finance Bot Cloud</h1>
                <p>Status: ${botReady ? 'Robô Conectado e ouvindo mensagens.' : 'Aguardando conexão WhatsApp...'}</p>
                <p style="color: #888;">Última mensagem: <b>${lastMsg}</b></p>
                <hr style="border: 0; border-top: 1px solid #333; margin: 30px 0;">
                <p><a href="/status" style="color: #6366f1; text-decoration: none;">Ver Status JSON</a></p>
            </div>
        `);
    }
});

app.get('/status', (req, res) => {
    res.json({
        online: true,
        whatsapp_connected: botReady,
        has_qr: currentQR ? true : false,
        last_message: lastMsg,
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => console.log(`[SERVIDOR] Rodando na porta ${port}`));

// ====================================================
// SUPABASE
// ====================================================
const supabaseUrl = process.env.SUPABASE_URL || 'https://ostmikofmcgxsdjznrcs.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zdG1pa29mbWNneHNkanpucmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjE1NjQsImV4cCI6MjA5Mjc5NzU2NH0.m9spKtcueSz-VHZONAK-L02FfYWNSDvHjNFL4lWP8_U';
const supabase = createClient(supabaseUrl, supabaseKey);

const CLOUD_TOKEN = 'RICARDO-FINANCE-CLOUD-2026';

// ====================================================
// LOG REMOTO NO SUPABASE
// ====================================================
async function logCloud(level, mensagem, dados = {}) {
    console.log(`[${level}] ${mensagem}`);
    try {
        await supabase.from('logs_bot').insert({
            level,
            mensagem,
            dados,
            criado_em: new Date().toISOString()
        });
    } catch (e) {
        // Silencioso para não derrubar o bot por falha de log
    }
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
        await logCloud('ERROR', `Falha ao salvar no Supabase: ${error.message}`, { error, payload });
        return false;
    }

    await logCloud('INFO', `✅ Mensagem salva! ID: ${data?.[0]?.id}`, { texto, nome });
    return true;
}

// ====================================================
// WHATSAPP CLIENT
// ====================================================
const waBotStates = new Map();

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "cloud-bot-ricardo",
        dataPath: "./whatsapp_session_cloud"
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
    console.log('[QR] QR Code gerado. Escaneie em: ' + supabaseUrl.replace('https://', '').split('.')[0] + '.onrender.com');
    await logCloud('WARN', 'QR Code gerado - Bot desconectado, escaneamento necessário');
});

client.on('authenticated', async () => {
    console.log('[AUTH] Autenticado com sucesso!');
    await logCloud('INFO', 'Bot autenticado');
});

client.on('ready', async () => {
    currentQR = "";
    botReady = true;
    const info = client.info;
    console.log(`[PRONTO] Bot conectado como: ${info?.pushname} (${info?.wid?.user})`);
    await logCloud('SUCCESS', `Bot PRONTO! Número: ${info?.wid?.user}, Nome: ${info?.pushname}`);
});

client.on('disconnected', async (reason) => {
    botReady = false;
    console.log(`[DESCONECTADO] Motivo: ${reason}`);
    await logCloud('WARN', `Bot desconectado: ${reason}`);
});

// ====================================================
// PROCESSAMENTO DE MENSAGENS
// ====================================================
client.on('message_create', async (msg) => {
    try {
        // Ignora status e notificações
        if (msg.type === 'e2e_notification' || msg.type === 'notification_template') return;
        if (!msg.body && !msg.hasMedia) return;

        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const senderId = msg.fromMe ? (client.info?.wid?._serialized || 'me') : contact.id._serialized;
        const body = (msg.body || '').trim();
        const lowerBody = body.toLowerCase();

        // Log de depuração de toda mensagem recebida
        await logCloud('DEBUG', `Msg de ${contact.pushname || contact.number} no chat ${chat.isGroup ? chat.name : 'privado'}`, {
            body: body.substring(0, 100),
            fromMe: msg.fromMe,
            type: msg.type
        });

        // Ignora grupos que não são de controle financeiro
        if (chat.isGroup && !chat.name.toUpperCase().includes('CONTROLE')) {
            return;
        }

        // Ignora ecos do próprio bot (mensagens com zero-width space)
        if (body.includes('\u200B')) return;

        lastMsg = body || '[MÍDIA]';

        // ================================================
        // CAPTURA AUTOMÁTICA - Salva TUDO no Supabase
        // ================================================
        if (body.length > 0) {
            await salvarMensagem(
                body,
                contact.pushname || contact.number,
                contact.number
            );
        }

        // Captura fotos/mídias
        if (msg.hasMedia) {
            await salvarMensagem(
                `[MÍDIA] ${msg.type} enviada por ${contact.pushname || contact.number}`,
                contact.pushname || contact.number,
                contact.number,
                { tipo: 'midia', subtipo: msg.type }
            );
        }

        // ================================================
        // MÁQUINA DE ESTADOS - Menu Interativo
        // ================================================
        let state = waBotStates.get(senderId) || { step: 'IDLE', data: {} };

        // Cancelar
        if (lowerBody === 'cancelar' || lowerBody === '!cancelar') {
            waBotStates.delete(senderId);
            await msg.reply('❌ Operação cancelada. Digite "Oi" para começar de novo.');
            return;
        }

        // Menu inicial
        if (state.step === 'IDLE' && (lowerBody === 'oi' || lowerBody === 'menu' || lowerBody === 'olá')) {
            const { data: pessoas } = await supabase
                .from('cloud_pessoas')
                .select('*')
                .eq('sync_token', CLOUD_TOKEN);

            const listaPessoas = (pessoas && pessoas.length > 0) ? pessoas : [
                { pessoa_id: 1, nome: 'Cris' },
                { pessoa_id: 2, nome: 'Pai' },
                { pessoa_id: 3, nome: 'Ricardo' }
            ];

            let menu = `👋 *Assistente Financeiro Cloud*\n\nEscolha a pessoa:\n`;
            listaPessoas.forEach((p, i) => {
                menu += `\n${i + 1}️⃣  *${p.nome}*`;
            });
            menu += `\n\n_💡 Dica: mande uma foto de cupom a qualquer momento!_`;

            waBotStates.set(senderId, { step: 'SELECT_PERSON', data: { lista: listaPessoas } });
            await msg.reply('\u200B' + menu);
            return;
        }

        // Seleção de pessoa
        if (state.step === 'SELECT_PERSON') {
            const idx = parseInt(body) - 1;
            const selecionada = state.data.lista?.[idx];
            if (selecionada) {
                waBotStates.set(senderId, {
                    step: 'SELECT_ACTION',
                    data: { person_id: selecionada.pessoa_id, person_name: selecionada.nome }
                });
                await msg.reply('\u200B' + `👤 *${selecionada.nome}*\n\nO que deseja fazer?\n\n1️⃣  Adicionar Gasto\n2️⃣  Enviar Cupom\n0️⃣  Voltar`);
            } else {
                await msg.reply('\u200B' + '❌ Opção inválida. Escolha um número da lista.');
            }
            return;
        }

        // Seleção de ação
        if (state.step === 'SELECT_ACTION') {
            if (body === '0') {
                waBotStates.set(senderId, { step: 'IDLE', data: {} });
                await msg.reply('\u200B' + 'Voltando... Digite "Oi" para o menu.');
            } else if (body === '1') {
                waBotStates.set(senderId, { step: 'WAIT_VALUE', data: { ...state.data } });
                await msg.reply('\u200B' + '💰 *Qual o valor do gasto?*\n_(Ex: 25,50)_');
            } else if (body === '2') {
                waBotStates.set(senderId, { step: 'IDLE', data: {} });
                await msg.reply('\u200B' + '📸 Pode enviar a foto do cupom agora!');
            }
            return;
        }

        // Aguardando valor
        if (state.step === 'WAIT_VALUE') {
            const valor = body.replace(',', '.').replace(/[^\d.]/g, '');
            if (valor && !isNaN(parseFloat(valor))) {
                state.data.valor = valor;
                state.step = 'WAIT_DESC';
                waBotStates.set(senderId, state);
                await msg.reply('\u200B' + `✅ Valor: R$ ${valor}\n\n📝 *Descrição do gasto?*\n_(Ex: Mercado, Almoço)_`);
            } else {
                await msg.reply('\u200B' + '❌ Valor inválido. Use apenas números e vírgula.');
            }
            return;
        }

        // Aguardando descrição (confirma gasto)
        if (state.step === 'WAIT_DESC') {
            const descricao = body;
            state.data.descricao = descricao;
            waBotStates.delete(senderId);

            // Salva o gasto estruturado
            const textoGasto = `GASTO|${state.data.person_name}|R$${state.data.valor}|${descricao}`;
            const ok = await salvarMensagem(
                textoGasto,
                contact.pushname || contact.number,
                contact.number,
                { tipo: 'gasto', person_name: state.data.person_name, valor: state.data.valor, descricao }
            );

            if (ok) {
                await msg.reply('\u200B' + `🎉 Gasto de *R$ ${state.data.valor}* em *${descricao}* registrado para *${state.data.person_name}*! ✅`);
            } else {
                await msg.reply('\u200B' + '⚠️ Houve um problema ao salvar. Tente novamente mais tarde.');
            }
            return;
        }

    } catch (err) {
        console.error('[ERRO FATAL]', err);
        await logCloud('ERROR', `Erro fatal no processamento: ${err.message}`, { stack: err.stack });
    }
});

// ====================================================
// INICIALIZAR
// ====================================================
console.log('[INIT] Iniciando Finance Bot Cloud...');
client.initialize().catch(async (err) => {
    console.error('[INIT ERROR]', err);
    await logCloud('ERROR', `Falha ao inicializar: ${err.message}`);
});
