const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function fixDB() {
    const appData = path.join(process.env.APPDATA, 'finance-app');
    const dbPath = path.join(appData, 'database.db');
    const uploadsDir = path.join(appData, 'uploads', 'cartoes');
    
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    
    const sql = await require('sql.js')();
    const db = new sql.Database(fs.readFileSync(dbPath));
    
    // Find missing logos
    const result = db.exec("SELECT id, banco FROM cartoes WHERE logo IS NULL");
    if (!result.length) { console.log('Nenhum cartão nulo'); return; }
    
    let modified = false;
    const rows = result[0].values;
    
    const bankDomains = {
        'nubank': 'nubank.com.br',
        'bradesco': 'bradesco.com.br',
        'itau': 'itau.com.br',
        'santander': 'santander.com.br',
        'caixa': 'caixa.gov.br',
        'banco do brasil': 'bb.com.br',
        'inter': 'bancointer.com.br',
        'neon': 'neon.com.br',
        'c6': 'c6bank.com.br',
        'pagbank': 'pagbank.com.br',
        'picpay': 'picpay.com',
        'xp': 'xpi.com.br'
    };

    for (const [id, banco] of rows) {
        if (!banco) continue;
        const val = banco.trim().toLowerCase();
        if (val.length <= 2) continue;
        
        try {
            const domain = bankDomains[val] || `${val.replace(/\s+/g, '')}.com.br`;
            const url = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`;
            
            console.log('Baixando de:', url);
            const response = await axios({ 
                url, 
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            
            const filename = `logo_fixed_${Date.now()}_${val.replace(/\s+/g, '_')}.png`;
            fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(response.data));
            
            db.run("UPDATE cartoes SET logo = ? WHERE id = ?", [filename, id]);
            modified = true;
            console.log('Fixed logo for', banco);
        } catch (e) {
            console.error('Failed for', banco, e.message);
        }
    }
    
    if (modified) {
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
        console.log('Database saved successfully.');
    }
}

fixDB().catch(console.error);
