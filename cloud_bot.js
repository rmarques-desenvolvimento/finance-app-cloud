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

// Configuração Supabase
const supabaseUrl = 'https://ostmikofmcgxsdjznrcs.supabase.co';
const supabaseKey = 'sb_publishable_o7H6EPd2yKOF_iuQnSq1xg_KBgf1Iuv';
const supabase = createClient(supabaseUrl, supabaseKey);

const CLOUD_TOKEN = 'RICARDO-FINANCE-CLOUD-2026';

// Memória temporária de estados (qual menu o usuário está)
const waBotStates = new Map();

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "cloud-bot-ricardo",
        dataPath: "./whatsapp_session_cloud"
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
    }
});

client.on('qr', (qr) => {
    currentQR = qr;
    console.log('[QR CODE] Recebido.');
});

client.on('ready', () => {
    currentQR = "";
    console.log('[STATUS] Bot de Nuvem CONECTADO!');
});

client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const senderId = contact.id._serialized;
        const body = msg.body.trim();
        const lowerBody = body.toLowerCase();

        // Ignora mensagens de outros grupos que não sejam do controle
        if (chat.isGroup && !chat.name.toUpperCase().includes('CONTROLE')) return;

        console.log(`[ZAP] Mensagem de ${contact.pushname}: ${body}`);

        let state = waBotStates.get(senderId) || { step: 'IDLE', data: {} };

        // Comando de Cancelar
        if (lowerBody === 'cancelar' || lowerBody === '!cancelar') {
            waBotStates.delete(senderId);
            await msg.reply('❌ Operação cancelada. Digite "Oi" para começar de novo.');
            return;
        }

        // --- MÁQUINA DE ESTADOS (INTELIGÊNCIA DO BOT) ---
        
        // 1. Menu Inicial
        if (state.step === 'IDLE' && (lowerBody === 'oi' || lowerBody === 'menu' || lowerBody === 'olá')) {
            // Busca pessoas no Supabase
            const { data: pessoas } = await supabase.from('cloud_pessoas').select('*').eq('sync_token', CLOUD_TOKEN);
            
            let menu = "👋 *Olá! Eu sou o seu Assistente Financeiro Cloud.*\n\nEscolha a pessoa digitando o número:\n";
            
            // Se não tiver pessoas no cloud ainda, usa as padrão do Ricardo
            const listaPessoas = (pessoas && pessoas.length > 0) ? pessoas : [
                { pessoa_id: 1, nome: 'Cris' },
                { pessoa_id: 2, nome: 'Pai' },
                { pessoa_id: 3, nome: 'Ricardo' }
            ];

            listaPessoas.forEach((p, i) => {
                menu += `\n${i + 1}️⃣  *${p.nome}*`;
            });

            menu += "\n\n_Ou mande uma foto de cupom a qualquer momento._";
            
            waBotStates.set(senderId, { step: 'SELECT_PERSON', data: { lista: listaPessoas } });
            await msg.reply(menu);
            return;
        }

        // 2. Seleção de Pessoa
        if (state.step === 'SELECT_PERSON') {
            const idx = parseInt(body) - 1;
            const selecionada = state.data.lista[idx];

            if (selecionada) {
                waBotStates.set(senderId, { 
                    step: 'SELECT_ACTION', 
                    data: { person_id: selecionada.pessoa_id, person_name: selecionada.nome } 
                });
                await msg.reply(`👤 Selecionado: *${selecionada.nome}*\n\nO que deseja fazer?\n\n1️⃣  *Adicionar Gasto (Texto)*\n2️⃣  *Mandar Foto de Cupom*\n0️⃣  *Voltar*`);
            } else {
                await msg.reply('❌ Opção inválida. Escolha um número da lista ou digite "cancelar".');
            }
            return;
        }

        // 3. Seleção de Ação
        if (state.step === 'SELECT_ACTION') {
            if (body === '0') {
                waBotStates.set(senderId, { step: 'IDLE', data: {} });
                await msg.reply('Voltando... Digite "Oi" para o menu.');
                return;
            }
            if (body === '1') {
                waBotStates.set(senderId, { step: 'WAIT_VALUE', data: { ...state.data } });
                await msg.reply('💰 *Qual o valor do gasto?*\n_(Ex: 25,50)_');
            } else if (body === '2') {
                waBotStates.set(senderId, { step: 'IDLE', data: { ...state.data } });
                await msg.reply('📸 Pode enviar a foto do cupom agora!');
            }
            return;
        }

        // 4. Aguardando Valor
        if (state.step === 'WAIT_VALUE') {
            const valor = body.replace(',', '.').replace(/[^\d.]/g, '');
            if (valor && !isNaN(parseFloat(valor))) {
                state.data.valor = valor;
                state.step = 'WAIT_DESC';
                waBotStates.set(senderId, state);
                await msg.reply(`✅ Valor: R$ ${valor}\n\n📝 *Qual a descrição do gasto?*\n_(Ex: Mercado, Almoço, Gasolina)_`);
            } else {
                await msg.reply('❌ Valor inválido. Digite apenas números e vírgula.');
            }
            return;
        }

        // 5. Aguardando Descrição
        if (state.step === 'WAIT_DESC') {
            state.data.descricao = body;
            state.step = 'IDLE'; // Finaliza e salva
            waBotStates.delete(senderId);

            // SALVA NO SUPABASE PARA O APP NO PC LER
            await supabase.from('mensagens_zap').insert({
                sync_token: CLOUD_TOKEN,
                texto: `${state.data.person_name}: Gasto de R$ ${state.data.valor} - ${body}`,
                remetente_nome: contact.pushname,
                remetente_fone: contact.number,
                status: 'pendente',
                timestamp: new Date().toISOString()
            });

            await msg.reply(`🎉 Gasto de *R$ ${state.data.valor}* em *${body}* salvo para *${state.data.person_name}* com sucesso! ✅`);
            return;
        }

        // Trata fotos de cupom (Se enviar foto sem estar em menu)
        if (msg.hasMedia) {
            await supabase.from('mensagens_zap').insert({
                sync_token: CLOUD_TOKEN,
                texto: `[FOTO DE CUPOM] Enviada por ${contact.pushname}`,
                remetente_nome: contact.pushname,
                remetente_fone: contact.number,
                status: 'pendente',
                timestamp: new Date().toISOString()
            });
            await msg.reply('📸 Cupom recebido! Vou processar o OCR quando você abrir o aplicativo no computador.');
            return;
        }

    } catch (err) {
        console.error('[ERRO]', err);
    }
});

client.initialize().catch(err => console.error('Erro ao inicializar:', err));
