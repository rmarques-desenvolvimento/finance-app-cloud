const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function checkStructure() {
    const dbPath = 'C:\\Users\\Ricardo\\AppData\\Roaming\\finance-app\\database.db';
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
    while(tables.step()) {
        const t = tables.getAsObject().name;
        console.log(`Table: ${t}`);
        const cols = db.prepare(`PRAGMA table_info(${t})`);
        while(cols.step()) {
            const c = cols.getAsObject();
            console.log(`  - ${c.name} (${c.type})`);
        }
        cols.free();
    }
}
checkStructure();
