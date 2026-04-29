const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

let currentQR = "";

// Servidor Web Simples para o Render não "dormir"
app.get('/', (req, res) => {
    if (currentQR) {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; padding: 50px; background: #0a0e1a; color: white; min-height: 100vh;">
                <h1 style="color: #6366f1;">🤖 Finance Bot Cloud</h1>
                <p>Escaneie o QR Code abaixo para conectar:</p>
                <div style="background: white; padding: 20px; display: inline-block; border-radius: 10px; margin: 20px;">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" />
                </div>
                <p style="color: #888;">Abra o WhatsApp > Aparelhos Conectados > Conectar um aparelho</p>
                <script>setTimeout(() => location.reload(), 20000);</script>
            </div>
        `);
    } else {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; padding: 50px; background: #0a0e1a; color: white; min-height: 100vh;">
                <h1 style="color: #6366f1;">🚀 Finance Bot Cloud está ON!</h1>
                <p>Status: Aguardando QR Code ou já conectado.</p>
                <p style="color: #888;">Se você já escaneou, o bot está operando em segundo plano.</p>
            </div>
        `);
    }
});

app.listen(port, () => console.log(`Servidor de monitoramento rodando na porta ${port}`));

// Configuração Supabase (Copiada do seu App)
const supabaseUrl = 'https://ostmikofmcgxsdjznrcs.supabase.co';
const supabaseKey = 'sb_publishable_o7H6EPd2yKOF_iuQnSq1xg_KBgf1Iuv';
const supabase = createClient(supabaseUrl, supabaseKey);

// Token de Sincronização do Ricardo
const CLOUD_TOKEN = 'RICARDO-FINANCE-CLOUD-2026';

console.log('--- INICIALIZANDO FINANCE-BOT CLOUD ---');

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "cloud-bot-ricardo",
        dataPath: "./whatsapp_session_cloud"
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
    }
});

// Evento para exibir QR Code
client.on('qr', (qr) => {
    currentQR = qr;
    console.log('\n[QR CODE] Recebido. Acesse a URL do Render para escanear.');
});

client.on('ready', () => {
    currentQR = "";
    console.log('\n[STATUS] Bot de Nuvem CONECTADO e pronto!');
    console.log('Ouvindo mensagens do WhatsApp...');
});

client.on('message', async (msg) => {
    try {
        const contact = await msg.getContact();
        const body = msg.body;
        const phone = contact.number;
        const name = contact.pushname || contact.name || 'Desconhecido';

        console.log(`[ZAP] Mensagem de ${name} (${phone}): ${body}`);

        // Salva a mensagem no Supabase para o App processar depois
        const { error } = await supabase
            .from('mensagens_zap')
            .insert({
                sync_token: CLOUD_TOKEN,
                texto: body,
                remetente_nome: name,
                remetente_fone: phone,
                status: 'pendente',
                timestamp: new Date().toISOString()
            });

        if (error) {
            console.error('[SUPABASE] Erro ao salvar mensagem:', error);
        } else {
            console.log('[SUPABASE] Mensagem enviada para a nuvem com sucesso! O App no PC processará quando for aberto.');
        }

    } catch (err) {
        console.error('[ERRO] Falha ao processar mensagem:', err);
    }
});

client.initialize().catch(err => console.error('Erro ao inicializar:', err));
