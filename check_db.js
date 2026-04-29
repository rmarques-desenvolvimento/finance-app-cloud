const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('e:/Ricardo/Documents/Projetos/Python/Controle_Financeiro/finance-app/database.sqlite');
db.all('SELECT * FROM cartoes', (err, rows) => {
    if (err) console.error(err);
    console.log('CARTOES:', JSON.stringify(rows));
    db.all('SELECT * FROM gastos g JOIN pessoas p ON g.pessoa_id = p.id WHERE strftime("%m", g.data) = "04" AND strftime("%Y", g.data) = "2026"', (err2, rows2) => {
        if (err2) console.error(err2);
        console.log('GASTOS:', JSON.stringify(rows2));
        db.all('SELECT * FROM parcelas p JOIN gastos g ON p.gasto_id = g.id WHERE p.mes = 4 AND p.ano = 2026', (err3, rows3) => {
            if (err3) console.error(err3);
            console.log('PARCELAS:', JSON.stringify(rows3));
            db.close();
        });
    });
});
