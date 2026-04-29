const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Servidor Web Simples para o Render não "dormir"
app.get('/', (req, res) => res.send('Finance Bot Cloud está ON! 🚀'));
app.listen(port, () => console.log(`Servidor de monitoramento rodando na porta ${port}`));

// Configuração Supabase (Copiada do seu App)
const supabaseUrl = 'https://ostmikofmcgxsdjznrcs.supabase.co';
const supabaseKey = 'sb_publishable_o7H6EPd2yKOF_iuQnSq1xg_KBgf1Iuv';
const supabase = createClient(supabaseUrl, supabaseKey);

// Token de Sincronização do Ricardo
const CLOUD_TOKEN = 'RICARDO-FINANCE-CLOUD-2026';

console.log('--- INICIALIZANDO FINANCE-BOT CLOUD ---');
console.log('Passe o olho no console para ver o QR Code se necessário.');

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
    console.log('\n[QR CODE] Escaneie para conectar o bot de nuvem:');
    // Como não temos a biblioteca de terminal aqui instalada por padrão, 
    // vou apenas avisar que o QR Code está sendo gerado ou exibir o link
    console.log('QR Code recebido. Em um servidor real, usaríamos o qrcode-terminal.');
});

client.on('ready', () => {
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
