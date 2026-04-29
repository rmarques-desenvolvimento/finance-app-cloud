const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = 'C:/Users/Ricardo/AppData/Roaming/finance-app/database.db';
const data = fs.readFileSync(dbPath);

initSqlJs().then(SQL => {
    const db = new SQL.Database(data);
    
    const printTable = (title, sql) => {
        console.log(`--- ${title} ---`);
        const res = db.exec(sql);
        if (res.length === 0) {
            console.log('[]');
        } else {
            res[0].values.forEach(row => {
                const obj = {};
                res[0].columns.forEach((col, i) => obj[col] = row[i]);
                console.log(JSON.stringify(obj));
            });
        }
    };

    printTable('GASTOS ATIVOS MERCADO PAGO (QUALQUER DATA)', 'SELECT g.*, c.nome as cartao_nome FROM gastos g JOIN cartoes c ON g.cartao_id = c.id WHERE g.status = 1 AND (c.nome LIKE "%Mercado%" OR c.nome LIKE "%Pago%")');
    printTable('PARCELAS ATIVAS MERCADO PAGO (QUALQUER DATA)', 'SELECT p.*, c.nome as cartao_nome FROM parcelas p JOIN cartoes c ON p.cartao_id = c.id WHERE (c.nome LIKE "%Mercado%" OR c.nome LIKE "%Pago%")');
});
