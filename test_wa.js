const waModule = require('./whatsapp_service');
const waService = waModule.service;
waModule.setLogger(console.log);

console.log('--- TESTE DE INICIALIZAÇÃO WHATSAPP ---');
waService.onQrCallback = (qr) => {
    console.log('SUCESSO: QR Code gerado!');
    process.exit(0);
};

console.log('Chamando init...');
try {
    waService.init('./');
} catch (e) {
    console.error('ERRO FATAL NA CHAMADA INIT:', e);
}
console.log('Aguardando QR Code (30s)...');

setTimeout(() => {
    console.log('FALHA: Tempo esgotado sem QR Code.');
    process.exit(1);
}, 30000);
