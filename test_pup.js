const puppeteer = require('puppeteer');
const fs = require('fs');

async function test() {
    console.log('Iniciando teste de Puppeteer...');
    try {
        const path = require('path');
        const userDataPath = path.resolve(process.cwd(), 'test_wa_data');
        if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath);

        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                `--user-data-dir=${userDataPath}`
            ]
        });
        console.log('Sucesso: Navegador aberto!');
        await browser.close();
    } catch (e) {
        console.error('FALHA CRÍTICA:', e.message);
    }
}

test();
