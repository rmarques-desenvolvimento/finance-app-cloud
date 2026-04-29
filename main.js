const { app, BrowserWindow, ipcMain, dialog, Menu, protocol, net, shell } = require('electron');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app-file', privileges: { secure: true, standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const waModule = require('./whatsapp_service');
const waService = waModule.service;
const { createClient } = require('@supabase/supabase-js');

// Configuração Supabase (FinanceBot-Cloud)
const supabaseUrl = 'https://ostmikofmcgxsdjznrcs.supabase.co';
const supabaseKey = 'sb_publishable_o7H6EPd2yKOF_iuQnSq1xg_KBgf1Iuv';
const supabase = createClient(supabaseUrl, supabaseKey);

function logToFile(msg) {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `${timestamp} - ${msg}\n`);
}

// Injetar logger no serviço de WhatsApp logo no início
waModule.setLogger(logToFile);

let dbPath;
let db = null;

async function initDatabase() {
  try {
    logToFile('Iniciando Banco de Dados...');
    dbPath = path.join(app.getPath('userData'), 'database.db');
    logToFile(`Caminho do banco: ${dbPath}`);

    const SQL = await initSqlJs();
    logToFile('SQL.js carregado com sucesso.');
    
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (fs.existsSync(dbPath)) {
      logToFile('Lendo arquivo de banco existente...');
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      // Migrações de Estrutura
      try { db.run('ALTER TABLE gastos ADD COLUMN despesa_fixa_id INTEGER'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN status INTEGER DEFAULT 1'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN paga INTEGER DEFAULT 0'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN cupom_id INTEGER'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN estabelecimento_id INTEGER'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN quantidade REAL DEFAULT 1'); } catch(e) {}
      try { db.run('ALTER TABLE cupons ADD COLUMN cnpj TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN quantidade REAL DEFAULT 1'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN estabelecimento_id INTEGER'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN descricao_pdf TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN descricao_pdf TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE usuarios ADD COLUMN foto TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN pix_chave TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN pix_chave TEXT'); } catch(e) {}
      // Novos campos para Nome do Recebedor (PIX)
      try { db.run('ALTER TABLE gastos ADD COLUMN pix_nome TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN pix_nome TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE pessoas ADD COLUMN pix_chave TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE pessoas ADD COLUMN pix_nome TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE estabelecimentos ADD COLUMN pix_chave TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE estabelecimentos ADD COLUMN pix_nome TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE pessoas ADD COLUMN whatsapp TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN meio_pagamento_nome TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN meio_pagamento_nome TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE usuarios ADD COLUMN whatsapp TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE usuarios ADD COLUMN cloud_token TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE usuarios ADD COLUMN cloud_activated INTEGER DEFAULT 0'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN wa_message_id TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN foto TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN foto TEXT'); } catch(e) {}
      // Novos campos: Auditoria e Data de Pagamento
      try { db.run('ALTER TABLE gastos ADD COLUMN cadastrado_por TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE gastos ADD COLUMN data_pagamento DATE'); } catch(e) {}
      try { db.run('ALTER TABLE parcelas ADD COLUMN cadastrado_por TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE parcelas ADD COLUMN data_pagamento DATE'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN cadastrado_por TEXT'); } catch(e) {}
      try { db.run('ALTER TABLE despesas_fixas ADD COLUMN data_pagamento DATE'); } catch(e) {}
      
      try {
        db.run(`
          CREATE TABLE IF NOT EXISTS entradas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pessoa_id INTEGER NOT NULL,
            ano INTEGER NOT NULL,
            mes INTEGER NOT NULL,
            valor REAL NOT NULL DEFAULT 0,
            UNIQUE(pessoa_id, ano, mes)
          )
        `);
      } catch(e) {}
      
      // Criação da tabela de categorias caso não exista (Migração)
      try {
        db.run(`
          CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE
          )
        `);
        // Insere categorias padrão se estiver vazio
        const countStmt = db.prepare('SELECT COUNT(*) as count FROM categorias');
        if (countStmt.step() && countStmt.getAsObject().count === 0) {
          const defaultCats = ['Alimentação', 'Farmácia', 'Mercado', 'Lazer', 'Transporte', 'Saúde', 'Educação', 'Moradia', 'Outros', 'Eletrônicos'];
          defaultCats.forEach(cat => {
            db.run('INSERT INTO categorias (nome) VALUES (?)', [cat]);
          });
        }
        countStmt.free();
      } catch(e) {
        logToFile(`Erro na migração de categorias: ${e.message}`);
      }

      // Migração: Meios de Pagamento
      try {
        db.run(`
          CREATE TABLE IF NOT EXISTS meios_pagamento (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE
          )
        `);
        const countMP = db.prepare('SELECT COUNT(*) as count FROM meios_pagamento');
        if (countMP.step() && countMP.getAsObject().count === 0) {
          const defaultMPs = ['Dinheiro', 'Cartão', 'PIX'];
          defaultMPs.forEach(mp => {
            db.run('INSERT INTO meios_pagamento (nome) VALUES (?)', [mp]);
          });
        }
        countMP.free();
      } catch(e) {
        logToFile(`Erro na migração de Meios de Pagamento: ${e.message}`);
      }

      try {
        db.run(`
          CREATE TABLE IF NOT EXISTS wa_mensagens_pendentes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE,
            sender_phone TEXT,
            sender_name TEXT,
            pessoa_id INTEGER,
            person_name TEXT,
            body TEXT,
            step TEXT,
            data_json TEXT,
            wa_message_id TEXT,
            imagem TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch(e) { logToFile(`Erro ao criar wa_mensagens_pendentes: ${e.message}`); }

      // Criar diretório de uploads se não existir
      const uploadsDir = path.join(app.getPath('userData'), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
          logToFile(`Diretório de uploads criado em: ${uploadsDir}`);
      }
      saveDatabase();
    } else {
      logToFile('Criando novo banco de dados...');
      db = new SQL.Database();
      createTables();
      
      // Criar diretório de uploads
      const uploadsDir = path.join(app.getPath('userData'), 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    }
    logToFile('Banco de dados pronto.');
    return db;
  } catch (err) {
    logToFile(`ERRO NO BANCO: ${err.message}`);
    logToFile(err.stack);
    throw err;
  }
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      nome TEXT,
      foto TEXT,
      whatsapp TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migração: Adiciona coluna foto se não existir
  try {
    db.run('ALTER TABLE usuarios ADD COLUMN foto TEXT');
  } catch(e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS pessoas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      foto TEXT,
      whatsapp TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cartoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      banco TEXT,
      data_fechamento INTEGER,
      data_vencimento INTEGER,
      logo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS estabelecimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cnpj TEXT,
      nome TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      pix_chave TEXT,
      pix_nome TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS entradas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pessoa_id INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      valor REAL NOT NULL DEFAULT 0,
      UNIQUE(pessoa_id, ano, mes)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS cupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pessoa_id INTEGER,
      cartao_id INTEGER,
      imagem TEXT,
      texto_ocr TEXT,
      total REAL,
      data DATE,
      cnpj TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(pessoa_id) REFERENCES pessoas(id),
      FOREIGN KEY(cartao_id) REFERENCES cartoes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS itens_cupom (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cupom_id INTEGER,
      descricao TEXT,
      quantidade INTEGER,
      valor_unitario REAL,
      FOREIGN KEY(cupom_id) REFERENCES cupons(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pessoa_id INTEGER NOT NULL,
      cartao_id INTEGER,
      cupom_id INTEGER,
      estabelecimento_id INTEGER,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data DATE NOT NULL,
      categoria TEXT,
      observacao TEXT,
      parcela_atual INTEGER DEFAULT 1,
      total_parcelas INTEGER DEFAULT 1,
      is_parcelado INTEGER DEFAULT 0,
      despesa_fixa_id INTEGER,
      status INTEGER DEFAULT 1,
      paga INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cadastrado_por TEXT,
      data_pagamento DATE,
      FOREIGN KEY(pessoa_id) REFERENCES pessoas(id),
      FOREIGN KEY(cartao_id) REFERENCES cartoes(id),
      FOREIGN KEY(cupom_id) REFERENCES cupons(id),
      FOREIGN KEY(estabelecimento_id) REFERENCES estabelecimentos(id),
      FOREIGN KEY(despesa_fixa_id) REFERENCES despesas_fixas(id),
      foto TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS parcelas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gasto_id INTEGER NOT NULL,
      pessoa_id INTEGER NOT NULL,
      cartao_id INTEGER,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data DATE NOT NULL,
      numero_parcela INTEGER NOT NULL,
      paga INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cadastrado_por TEXT,
      data_pagamento DATE,
      FOREIGN KEY(gasto_id) REFERENCES gastos(id),
      FOREIGN KEY(pessoa_id) REFERENCES pessoas(id),
      FOREIGN KEY(cartao_id) REFERENCES cartoes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS despesas_fixas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pessoa_id INTEGER,
      nome TEXT NOT NULL,
      valor REAL NOT NULL,
      dia_vencimento INTEGER,
      categoria TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cadastrado_por TEXT,
      data_pagamento DATE,
      FOREIGN KEY(pessoa_id) REFERENCES pessoas(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      mensagem TEXT,
      data_vencimento DATE,
      visualizado INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wa_mensagens_pendentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE,
      sender_phone TEXT,
      sender_name TEXT,
      pessoa_id INTEGER,
      person_name TEXT,
      body TEXT,
      step TEXT,
      data_json TEXT,
      wa_message_id TEXT,
      imagem TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Mock Categorias Iniciais
  const initialCats = ['Alimentação', 'Farmácia', 'Combustível', 'Vestuário', 'Eletrônicos', 'Outros'];
  initialCats.forEach(cat => {
    db.run('INSERT OR IGNORE INTO categorias (nome) VALUES (?)', [cat]);
  });

  db.run(`INSERT OR IGNORE INTO usuarios (usuario, senha, nome) VALUES ('admin', 'admin', 'Ricardo')`);
  
  saveDatabase();
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'icons', 'wallet-icon.png'),
    show: false,
    frame: false,
    titleBarStyle: 'hidden'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
}

app.whenReady().then(async () => {
  // Registrar protocolo customizado para servir imagens do userData
  protocol.handle('app-file', async (request) => {
    let filePath = request.url.replace('app-file://', '');
    let decodedPath = decodeURIComponent(filePath);
    
    // Normaliza barras para o Windows
    decodedPath = decodedPath.replace(/\//g, path.sep);
    
    let fullPath;
    // Se for um caminho absoluto (ex: C:\...) ou UNC (\\...)
    if (decodedPath.match(/^[a-zA-Z]:[\\\/]/) || decodedPath.startsWith('\\\\')) {
      fullPath = decodedPath;
    } else {
      fullPath = path.join(app.getPath('userData'), decodedPath);
    }

    try {
      logToFile(`REQ PROTOCOLO: ${decodedPath} -> ${fullPath}`);
      if (!fs.existsSync(fullPath)) {
          logToFile(`ERRO: Arquivo não existe no disco: ${fullPath}`);
          return new Response('File Not Found', { status: 404 });
      }
      
      const fileUrl = pathToFileURL(fullPath).toString();
      return net.fetch(fileUrl);
    } catch (e) {
      logToFile(`ERRO PROTOCOLO: ${e.message}`);
      return new Response('Error: ' + e.message, { status: 500 });
    }
  });

  await initDatabase();
  createWindow();

  // Inicializa o motor do WhatsApp Web de fundo
  waService.onQrCallback = (qrStr) => {
    logToFile('QR Code recebido no processo principal. Repassando ao Renderer.');
    if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wa-qr', qrStr);
  };
  waService.onAuthCallback = () => {
    if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wa-auth');
  };
  waService.onReadyCallback = () => {
    if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wa-ready');
  };
  waService.onDisconnectedCallback = (reason) => {
    if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wa-disconnected', reason);
  };
  // O onMessageCallback principal está definido ao final do arquivo para incluir toda a lógica do bot.

  logToFile('>>> Disparando comando waService.init()...');
  waService.init(app.getPath('userData'));
});

app.on('window-all-closed', () => {
  saveDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('login', async (event, usuario, senha) => {
  try {
    logToFile(`Tentando login: ${usuario}`);
    const stmt = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND senha = ?');
    stmt.bind([usuario, senha]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (result) logToFile('Login bem-sucedido');
    else logToFile('Credenciais inválidas');
    return result;
  } catch (err) {
    logToFile(`ERRO LOGIN: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('get-entrada', async (event, pessoaId, ano, mes) => {
  const stmt = db.prepare('SELECT valor FROM entradas WHERE pessoa_id = ? AND ano = ? AND mes = ?');
  stmt.bind([pessoaId, parseInt(ano), parseInt(mes)]);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result ? result.valor : 0;
});

ipcMain.handle('set-entrada', async (event, pessoaId, ano, mes, valor) => {
  db.run(`
    INSERT INTO entradas (pessoa_id, ano, mes, valor)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(pessoa_id, ano, mes) DO UPDATE SET valor = ?
  `, [pessoaId, parseInt(ano), parseInt(mes), parseFloat(valor), parseFloat(valor)]);
  saveDatabase();
  return true;
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('get-cupom', async (event, id) => {
  const stmt = db.prepare('SELECT * FROM cupons WHERE id = ?');
  stmt.bind([id]);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
});

ipcMain.handle('get-pessoas', async () => {
  const stmt = db.prepare('SELECT * FROM pessoas ORDER BY nome');
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('add-pessoa', async (event, nome, foto, whatsapp) => {
  try {
    logToFile(`Adicionando pessoa: ${nome}, foto: ${foto}, zap: ${whatsapp}`);
    db.run('INSERT INTO pessoas (nome, foto, whatsapp) VALUES (?, ?, ?)', [nome, foto, whatsapp]);
    saveDatabase();
    const stmt = db.prepare('SELECT * FROM pessoas ORDER BY id DESC LIMIT 1');
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    logToFile(`Pessoa adicionada com id: ${result.id}`);
    return result;
  } catch (err) {
    logToFile(`ERRO ADD PESSOA: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('update-pessoa', async (event, id, nome, foto, whatsapp) => {
  if (foto) {
    db.run('UPDATE pessoas SET nome = ?, foto = ?, whatsapp = ? WHERE id = ?', [nome, foto, whatsapp, id]);
  } else {
    db.run('UPDATE pessoas SET nome = ?, whatsapp = ? WHERE id = ?', [nome, whatsapp, id]);
  }
  saveDatabase();
  return { success: true };
});

ipcMain.handle('delete-pessoa', async (event, id) => {
  db.run('DELETE FROM pessoas WHERE id = ?', [id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('get-gastos-pessoa', async (event, pessoaId, ano, mes) => {
  const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  const stmt = db.prepare(`
    SELECT g.*, g.pix_chave, e.nome as estabelecimento_nome, c.nome as cartao_nome, c.logo
    FROM gastos g
    LEFT JOIN estabelecimentos e ON g.estabelecimento_id = e.id
    LEFT JOIN cartoes c ON g.cartao_id = c.id
    WHERE g.pessoa_id = ? AND g.status = 1 AND g.is_parcelado = 0 AND g.data >= ? AND g.data <= ?
    ORDER BY g.data DESC
  `);
  stmt.bind([pessoaId, startDate, endDate]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('get-gasto-por-id', async (event, id) => {
  const stmt = db.prepare('SELECT * FROM gastos WHERE id = ?');
  stmt.bind([id]);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
});

ipcMain.handle('get-all-gastos-ano-pessoa', async (event, pessoaId, ano) => {
  const startDate = `${ano}-01-01`;
  const endDate = `${ano}-12-31`;
  
  const results = [];
  
  // Gastos diretos
  const stmt1 = db.prepare(`
    SELECT g.*, e.nome as estabelecimento_nome, c.nome as cartao_nome
    FROM gastos g
    LEFT JOIN estabelecimentos e ON g.estabelecimento_id = e.id
    LEFT JOIN cartoes c ON g.cartao_id = c.id
    WHERE g.pessoa_id = ? AND g.status = 1 AND g.is_parcelado = 0 AND g.data >= ? AND g.data <= ?
  `);
  stmt1.bind([pessoaId, startDate, endDate]);
  while (stmt1.step()) { 
    const item = stmt1.getAsObject();
    item.tipo_origem = 'direto';
    results.push(item);
  }
  stmt1.free();
  
  // Parcelas
  const stmt2 = db.prepare(`
    SELECT p.*, g.descricao, g.descricao_pdf as gasto_desc_pdf, g.observacao, g.pix_chave, g.pix_nome, e.nome as estabelecimento_nome, c.nome as cartao_nome, g.cadastrado_por
    FROM parcelas p
    JOIN gastos g ON p.gasto_id = g.id
    LEFT JOIN estabelecimentos e ON g.estabelecimento_id = e.id
    LEFT JOIN cartoes c ON p.cartao_id = c.id
    WHERE p.pessoa_id = ? AND p.data >= ? AND p.data <= ?
  `);
  stmt2.bind([pessoaId, startDate, endDate]);
  while (stmt2.step()) {
    const item = stmt2.getAsObject();
    item.tipo_origem = 'parcela';
    item.quantidade = 1; 
    item.descricao_pdf = item.gasto_desc_pdf; // Herda do gasto pai
    results.push(item);
  }
  stmt2.free();
  
  return results.sort((a, b) => new Date(a.data) - new Date(b.data));
});

ipcMain.handle('get-total-gastos-pessoa', async (event, pessoaId, ano, mes) => {
  const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  // 1. Gastos Reais (Ignorando pais de parcelamento para não somar o total duas vezes)
  const stmtG = db.prepare('SELECT SUM(valor) as total FROM gastos WHERE pessoa_id = ? AND status = 1 AND is_parcelado = 0 AND data >= ? AND data <= ?');
  stmtG.bind([pessoaId, startDate, endDate]);
  stmtG.step();
  const totalDirect = stmtG.getAsObject().total || 0;
  stmtG.free();

  // 2. Parcelas (Apenas não pagas - pois as pagas podem duplicar se o usuário as lançou como gasto?)
  // Na verdade, parcelas são lançadas à parte na tabela parcelas.
  const stmtP = db.prepare('SELECT SUM(valor) as total FROM parcelas WHERE pessoa_id = ? AND data >= ? AND data <= ? AND paga = 0');
  stmtP.bind([pessoaId, startDate, endDate]);
  stmtP.step();
  const totalParcelas = stmtP.getAsObject().total || 0;
  stmtP.free();

  // 3. Despesas Fixas (Apenas as que NÃO foram geradas ainda)
  const stmtF = db.prepare(`
    SELECT SUM(valor) as total FROM despesas_fixas 
    WHERE pessoa_id = ? AND active = 1 
    AND id NOT IN (
      SELECT despesa_fixa_id FROM gastos 
      WHERE pessoa_id = ? AND data >= ? AND data <= ? AND despesa_fixa_id IS NOT NULL
    )
  `);
  stmtF.bind([pessoaId, pessoaId, startDate, endDate]);
  stmtF.step();
  const totalFixasPrevistas = stmtF.getAsObject().total || 0;
  stmtF.free();

  return totalDirect + totalParcelas + totalFixasPrevistas;
});

ipcMain.handle('add-gasto', async (event, gasto) => {
  // Garante que não passamos 'undefined' para o bind do SQL.js (converte para null)
  const safePessoaId = gasto.pessoa_id ?? null;
  const safeCartaoId = gasto.cartao_id ?? null;
  const safeCupomId = gasto.cupom_id ?? null;
  let safeEstabId = gasto.estabelecimento_id ?? null;
  const safeEstabNome = gasto.estabelecimento_nome ?? null;
  const safeDesc = gasto.descricao ?? '';
  const safeVal = gasto.valor ?? 0;
  const safeData = gasto.data ?? new Date().toISOString().split('T')[0];
  const safeDescPdf = gasto.descricao_pdf || null;
  const safeObs = (gasto.observacoes || gasto.observacao || '').trim();
  const safeParcAtu = parseInt(gasto.parcela_atual) || 1;
  const safeParcTot = parseInt(gasto.total_parcelas) || 1;
  const safeIsParc = parseInt(gasto.is_parcelado) || 0;
  const safeFixaId = gasto.despesa_fixa_id || null;

  // Se informou um nome mas não ID (digitou novo), busca ou cria
  if (!safeEstabId && safeEstabNome) {
    const s = db.prepare('SELECT id FROM estabelecimentos WHERE LOWER(nome) = LOWER(?)');
    s.bind([safeEstabNome.trim()]);
    if (s.step()) {
      safeEstabId = s.getAsObject().id;
    } else {
      db.run('INSERT INTO estabelecimentos (nome) VALUES (?)', [safeEstabNome.trim()]);
      const s2 = db.prepare('SELECT last_insert_rowid() as id');
      s2.step();
      safeEstabId = s2.getAsObject().id;
      s2.free();
    }
    s.free();
  }

  // Se for parcelado, o valor base de cada parcela é o safeVal.
  // O valor total do registro pai deve considerar a QUANTIDADE.
  const safeQtd = parseInt(gasto.quantidade) || 1;
  const valorTotalParent = safeIsParc && safeParcTot > 1 ? (safeVal * safeParcTot) : safeVal;

  db.run(`
    INSERT INTO gastos (pessoa_id, cartao_id, cupom_id, estabelecimento_id, descricao, valor, data, observacao, parcela_atual, total_parcelas, is_parcelado, despesa_fixa_id, quantidade, descricao_pdf, pix_chave, pix_nome, cadastrado_por, data_pagamento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    safePessoaId, safeCartaoId, safeCupomId, safeEstabId, safeDesc, valorTotalParent, safeData, safeObs, safeParcAtu, safeParcTot, safeIsParc, safeFixaId, safeQtd, safeDescPdf, gasto.pix_chave || null, gasto.pix_nome || null, gasto.cadastrado_por || null, gasto.data_pagamento || safeData
  ]);
  saveDatabase();
  
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  stmt.step();
  const parentId = stmt.getAsObject().id;
  stmt.free();
  
  if (safeIsParc && safeParcTot > 1) {
    const valorParcela = safeVal; 
    
    // Parse da data base de forma segura (YYYY-MM-DD local)
    const [year, month, day] = safeData.split('-').map(Number);

    for (let i = 1; i <= safeParcTot; i++) {
        // Criamos a data no fuso local para evitar saltos de data
        const dataParc = new Date(year, month - 1 + (i - 1), day);
        
        // Formata YYYY-MM-DD sem usar toISOString (que usa UTC)
        const d_y = dataParc.getFullYear();
        const d_m = String(dataParc.getMonth() + 1).padStart(2, '0');
        const d_d = String(dataParc.getDate()).padStart(2, '0');
        const dataStr = `${d_y}-${d_m}-${d_d}`;
        
        db.run(`
          INSERT INTO parcelas (gasto_id, pessoa_id, cartao_id, descricao, valor, data, numero_parcela)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [parentId, safePessoaId, safeCartaoId, `${safeDesc} (${i}/${safeParcTot})`, valorParcela, dataStr, i]);
    }
    saveDatabase();
  }
  
  return { id: parentId };
});

ipcMain.handle('update-gasto', async (event, id, gasto) => {
  let safeEstabId = gasto.estabelecimento_id ?? null;
  const safeEstabNome = gasto.estabelecimento_nome ?? null;
  
  if (!safeEstabId && safeEstabNome) {
    const s = db.prepare('SELECT id FROM estabelecimentos WHERE LOWER(nome) = LOWER(?)');
    s.bind([safeEstabNome.trim()]);
    if (s.step()) {
      safeEstabId = s.getAsObject().id;
    } else {
      db.run('INSERT INTO estabelecimentos (nome) VALUES (?)', [safeEstabNome.trim()]);
      const s2 = db.prepare('SELECT last_insert_rowid() as id');
      s2.step();
      safeEstabId = s2.getAsObject().id;
      s2.free();
    }
    s.free();
  }

  const safeQtd = parseFloat(gasto.quantidade) || 1;
  const baseVal = parseFloat(gasto.valor) || 0;
  // Se o frontend já enviou o total (valor unitário * quantidade), usamos direto
  // Mas por segurança, garantimos que valorTotal seja o valor final salvo.
  const valorTotal = gasto.valor_unitario ? (gasto.valor_unitario * safeQtd) : gasto.valor;

  db.run(`
    UPDATE gastos SET 
      descricao = ?, valor = ?, data = ?, 
      observacao = ?, cartao_id = ?, estabelecimento_id = ?, quantidade = ?, descricao_pdf = ?, pix_chave = ?, pix_nome = ?,
      cadastrado_por = ?, data_pagamento = ?
    WHERE id = ?
  `, [
    gasto.descricao, valorTotal, gasto.data, 
    gasto.observacoes || gasto.observacao || '', gasto.cartao_id || null, safeEstabId, safeQtd, gasto.descricao_pdf || null, gasto.pix_chave || null, gasto.pix_nome || null,
    gasto.cadastrado_por || null, gasto.data_pagamento || gasto.data, id
  ]);
  
  // Se for parcelado, atualiza descrições e valores das parcelas não pagas
  if (gasto.is_parcelado && gasto.total_parcelas > 1) {
    db.run('UPDATE parcelas SET descricao = SUBSTR(?, 1, INSTR(?, "(" )-1) || "(" || numero_parcela || "/" || ? || ")", valor = ? WHERE gasto_id = ? AND paga = 0', 
          [`${gasto.descricao} (`, `${gasto.descricao} (`, gasto.total_parcelas, valorTotal, id]);
  }
  
  saveDatabase();
  return { success: true };
});

ipcMain.handle('delete-gasto', async (event, id) => {
  db.run('UPDATE gastos SET status = 0 WHERE id = ?', [id]);
  db.run('DELETE FROM parcelas WHERE gasto_id = ? AND paga = 0', [id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('marcar-gasto-pago', async (event, id, paga) => {
  db.run('UPDATE gastos SET paga = ? WHERE id = ?', [paga ? 1 : 0, id]);
  saveDatabase();
  return { success: true };
});



ipcMain.handle('delete-parcela', async (event, id) => {
  db.run('DELETE FROM parcelas WHERE id = ?', [id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('get-parcelas-pessoa', async (event, pessoaId, ano, mes) => {
  const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  const stmt = db.prepare(`
    SELECT p.*, g.descricao_pdf, g.observacao, g.pix_chave, g.pix_nome, c.nome as cartao_nome, c.logo
    FROM parcelas p
    JOIN gastos g ON p.gasto_id = g.id
    LEFT JOIN cartoes c ON p.cartao_id = c.id
    WHERE p.pessoa_id = ? AND p.data >= ? AND p.data <= ?
    ORDER BY p.data DESC
  `);
  stmt.bind([pessoaId, startDate, endDate]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('marcar-parcela-paga', async (event, id, paga) => {
  db.run('UPDATE parcelas SET paga = ? WHERE id = ?', [paga ? 1 : 0, id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('get-cartoes', async () => {
  const stmt = db.prepare('SELECT * FROM cartoes ORDER BY nome');
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('add-cartao', async (event, cartao) => {
  db.run(`
    INSERT INTO cartoes (nome, banco, data_fechamento, data_vencimento, logo)
    VALUES (?, ?, ?, ?, ?)
  `, [cartao.nome, cartao.banco, cartao.data_fechamento, cartao.data_vencimento, cartao.logo]);
  saveDatabase();
  
  const stmt = db.prepare('SELECT * FROM cartoes ORDER BY id DESC LIMIT 1');
  stmt.step();
  const result = stmt.getAsObject();
  stmt.free();
  return result;
});

ipcMain.handle('update-cartao', async (event, id, cartao) => {
  db.run(`
    UPDATE cartoes SET nome = ?, banco = ?, data_fechamento = ?, data_vencimento = ?, logo = ?
    WHERE id = ?
  `, [cartao.nome, cartao.banco, cartao.data_fechamento, cartao.data_vencimento, cartao.logo, id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('delete-cartao', async (event, id) => {
  const stmt = db.prepare('SELECT logo FROM cartoes WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const cartao = stmt.getAsObject();
    if (cartao.logo) {
      const logoPath = path.join(app.getPath('userData'), 'uploads', 'cartoes', cartao.logo);
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }
  }
  stmt.free();
  
  db.run('DELETE FROM cartoes WHERE id = ?', [id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('get-estabelecimentos', async () => {
  const stmt = db.prepare('SELECT * FROM estabelecimentos ORDER BY nome');
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('update-estabelecimento', async (event, id, cnpj, nome, data) => {
  db.run('UPDATE estabelecimentos SET cnpj = ?, nome = ?, pix_chave = ?, pix_nome = ? WHERE id = ?', [cnpj, nome, data?.pix_chave || null, data?.pix_nome || null, id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('add-estabelecimento', async (event, cnpj, nome, data) => {
  db.run('INSERT INTO estabelecimentos (cnpj, nome, pix_chave, pix_nome) VALUES (?, ?, ?, ?)', [cnpj, nome, data?.pix_chave || null, data?.pix_nome || null]);
  saveDatabase();
  const stmt = db.prepare('SELECT * FROM estabelecimentos ORDER BY id DESC LIMIT 1');
  stmt.step();
  const result = stmt.getAsObject();
  stmt.free();
  return result;
});

ipcMain.handle('delete-estabelecimento', async (event, id) => {
  db.run('DELETE FROM estabelecimentos WHERE id = ?', [id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('get-despesas-fixas', async () => {
  const stmt = db.prepare(`
    SELECT df.*, e.nome as estabelecimento_nome 
    FROM despesas_fixas df
    LEFT JOIN estabelecimentos e ON df.estabelecimento_id = e.id
    WHERE df.active = 1 
    ORDER BY df.nome
  `);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('add-despesa-fixa', async (event, data) => {
  let safeEstabId = data.estabelecimento_id ?? null;
  const safeEstabNome = data.estabelecimento_nome ?? null;
  
  if (!safeEstabId && safeEstabNome) {
    const s = db.prepare('SELECT id FROM estabelecimentos WHERE LOWER(nome) = LOWER(?)');
    s.bind([safeEstabNome.trim()]);
    if (s.step()) {
      safeEstabId = s.getAsObject().id;
    } else {
      db.run('INSERT INTO estabelecimentos (nome) VALUES (?)', [safeEstabNome.trim()]);
      const s2 = db.prepare('SELECT last_insert_rowid() as id');
      s2.step();
      safeEstabId = s2.getAsObject().id;
      s2.free();
    }
    s.free();
  }

  db.run(`
    INSERT INTO despesas_fixas (pessoa_id, nome, valor, dia_vencimento, quantidade, estabelecimento_id, descricao_pdf, pix_chave, pix_nome, cadastrado_por, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [data.pessoa_id, data.nome, data.valor, data.dia_vencimento, data.quantidade || 1, safeEstabId, data.descricao_pdf || null, data.pix_chave || null, data.pix_nome || null, data.cadastrado_por || null]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('update-despesa-fixa', async (event, id, data) => {
  let safeEstabId = data.estabelecimento_id ?? null;
  const safeEstabNome = data.estabelecimento_nome ?? null;
  
  if (!safeEstabId && safeEstabNome) {
    const s = db.prepare('SELECT id FROM estabelecimentos WHERE LOWER(nome) = LOWER(?)');
    s.bind([safeEstabNome.trim()]);
    if (s.step()) {
      safeEstabId = s.getAsObject().id;
    } else {
      db.run('INSERT INTO estabelecimentos (nome) VALUES (?)', [safeEstabNome.trim()]);
      const s2 = db.prepare('SELECT last_insert_rowid() as id');
      s2.step();
      safeEstabId = s2.getAsObject().id;
      s2.free();
    }
    s.free();
  }

  db.run(`
    UPDATE despesas_fixas SET pessoa_id = ?, nome = ?, valor = ?, dia_vencimento = ?, quantidade = ?, estabelecimento_id = ?, descricao_pdf = ?, pix_chave = ?, pix_nome = ?, cadastrado_por = ?
    WHERE id = ?
  `, [data.pessoa_id, data.nome, data.valor, data.dia_vencimento, data.quantidade || 1, safeEstabId, data.descricao_pdf || null, data.pix_chave || null, data.pix_nome || null, data.cadastrado_por || null, id]);

  // Sincroniza retroativamente os TEXTOS (correções de digitação) em todos os gastos vinculados
  // Note que NÃO atualizamos o valor, para preservar o histórico financeiro (conforme solicitado)
  db.run(`
    UPDATE gastos SET 
      descricao = ?, 
      descricao_pdf = ?,
      pix_chave = ?,
      pix_nome = ?,
      estabelecimento_id = ?
    WHERE despesa_fixa_id = ?
  `, [data.nome, data.descricao_pdf || null, data.pix_chave || null, data.pix_nome || null, safeEstabId, id]);

  saveDatabase();
  return { success: true };
});

ipcMain.handle('delete-despesa-fixa', async (event, id) => {
  db.run('UPDATE despesas_fixas SET active = 0 WHERE id = ?', [id]);
  
  // Exclui gastos futuros não pagos vinculados a esta despesa fixa
  // Usamos a data de hoje como referência para deletar tudo do mês atual para frente que não foi pago
  const today = new Date().toISOString().split('T')[0];
  db.run(`
    UPDATE gastos SET status = 0 
    WHERE despesa_fixa_id = ? 
    AND paga = 0 
    AND data >= ?
  `, [id, today]);
  
  saveDatabase();
  return { success: true };
});

ipcMain.handle('get-alertas', async () => {
  const stmt = db.prepare('SELECT * FROM alertas WHERE visualizado = 0 ORDER BY data_vencimento');
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('add-alerta', async (event, tipo, titulo, mensagem, dataVencimento) => {
  db.run(`
    INSERT INTO alertas (tipo, titulo, mensagem, data_vencimento)
    VALUES (?, ?, ?, ?)
  `, [tipo, titulo, mensagem, dataVencimento]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('marcar-alerta-visualizado', async (event, id) => {
  db.run('UPDATE alertas SET visualizado = 1 WHERE id = ?', [id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('salvar-cupom', async (event, pessoaId, cartaoId, imagemPath, textoOcr, total, data, itens, cnpj) => {
  try {
    db.run(`
      INSERT INTO cupons (pessoa_id, cartao_id, imagem, texto_ocr, total, data, cnpj)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [pessoaId, cartaoId, imagemPath, textoOcr, total, data, cnpj]);
    
    const stmt = db.prepare('SELECT id FROM cupons ORDER BY id DESC LIMIT 1');
    stmt.step();
    const cupom = stmt.getAsObject();
    stmt.free();
    
    for (const item of itens) {
      db.run(`
        INSERT INTO itens_cupom (cupom_id, descricao, quantidade, valor_unitario, valor_total)
        VALUES (?, ?, ?, ?, ?)
      `, [cupom.id, item.descricao, item.quantidade, item.valor_unitario, item.valor_total]);
    }
    
    saveDatabase();
    return cupom;
  } catch (err) {
    logToFile(`ERRO SALVAR CUPOM: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('select-file', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters || [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'gif', 'bmp'] }]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('copy-file', async (event, sourcePath, destFolder, destName) => {
  const dir = path.join(app.getPath('userData'), 'uploads', destFolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const destPath = path.join(dir, destName);
  fs.copyFileSync(sourcePath, destPath);
  return destName;
});

ipcMain.handle('save-base64-image', async (event, base64Data, destFolder, destName) => {
  const dir = path.join(app.getPath('userData'), 'uploads', destFolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const destPath = path.join(dir, destName);
  const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  fs.writeFileSync(destPath, buffer);
  return destName;
});

ipcMain.handle('download-image', async (event, url, destFolder, destName) => {
  const axios = require('axios');
  const dir = path.join(app.getPath('userData'), 'uploads', destFolder);
  
  logToFile(`Iniciando download-image URL=${url} to ${destFolder}/${destName}`);
  
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const destPath = path.join(dir, destName);
  try {
    const response = await axios({ 
      url, 
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    fs.writeFileSync(destPath, Buffer.from(response.data));
    logToFile(`Download sucess! Escrito em ${destPath}`);
    return destName;
  } catch (err) {
    logToFile(`ERRO no download-image: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('get-meses-gastos', async (event, pessoaId) => {
  const stmt = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', data) as mes FROM gastos 
    WHERE pessoa_id = ? ORDER BY mes DESC
  `);
  stmt.bind([pessoaId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject().mes);
  }
  stmt.free();
  return results;
});

ipcMain.handle('get-gastos-por-categoria', async (event, pessoaId, ano, mes) => {
  const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  const stmt = db.prepare(`
    SELECT categoria, SUM(valor) as total FROM (
      SELECT categoria, valor FROM gastos 
      WHERE pessoa_id = ? AND status = 1 AND is_parcelado = 0 AND data >= ? AND data <= ?
      UNION ALL
      SELECT g.categoria, p.valor FROM parcelas p
      JOIN gastos g ON p.gasto_id = g.id
      WHERE p.pessoa_id = ? AND p.data >= ? AND p.data <= ?
    )
    GROUP BY categoria
  `);
  stmt.bind([pessoaId, startDate, endDate, pessoaId, startDate, endDate]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('get-gastos-por-estabelecimento', async (event, pessoaId, ano, mes) => {
  const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  const stmt = db.prepare(`
    SELECT estabelecimento, SUM(valor) as total FROM (
      SELECT e.nome as estabelecimento, g.valor FROM gastos g
      LEFT JOIN estabelecimentos e ON g.estabelecimento_id = e.id
      WHERE g.pessoa_id = ? AND g.status = 1 AND g.is_parcelado = 0 AND g.data >= ? AND g.data <= ?
      UNION ALL
      SELECT e.nome as estabelecimento, p.valor FROM parcelas p
      JOIN gastos g ON p.gasto_id = g.id
      LEFT JOIN estabelecimentos e ON g.estabelecimento_id = e.id
      WHERE p.pessoa_id = ? AND p.data >= ? AND p.data <= ?
    )
    GROUP BY estabelecimento
    ORDER BY total DESC
    LIMIT 10
  `);
  stmt.bind([pessoaId, startDate, endDate, pessoaId, startDate, endDate]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('get-resumo-mensal', async (event, pessoaId, ano) => {
  // Antes de pegar o resumo, garante que as fixas do ano todo foram geradas "silenciosamente"
  await helper_gerarDespesasFixas(pessoaId, ano, 0); // 0 indica o ano todo

  const stmt = db.prepare(`
    SELECT 
      mes, 
      SUM(total) as total, 
      MIN(CAST(paga AS INTEGER)) as todos_pagos,
      MAX(CASE 
        WHEN paga = 0 AND data <= date('now', 'localtime') THEN 2
        WHEN paga = 0 AND data <= date('now', 'localtime', '+3 days') THEN 1
        ELSE 0 
      END) as alerta_status
    FROM (
      SELECT strftime('%m', data) as mes, valor as total, paga, data FROM gastos 
      WHERE pessoa_id = ? AND status = 1 AND is_parcelado = 0 AND strftime('%Y', data) = ?
      UNION ALL
      SELECT strftime('%m', data) as mes, valor as total, paga, data FROM parcelas 
      WHERE pessoa_id = ? AND strftime('%Y', data) = ?
    )
    GROUP BY mes ORDER BY mes
  `);
  stmt.bind([pessoaId, String(ano), pessoaId, String(ano)]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
});

ipcMain.handle('get-max-ano-pessoa', async (event, pessoaId) => {
  const stmt = db.prepare(`
    SELECT MAX(strftime('%Y', data)) as maxAno FROM (
      SELECT data FROM gastos WHERE pessoa_id = ?
      UNION ALL
      SELECT data FROM parcelas WHERE pessoa_id = ?
    )
  `);
  stmt.bind([pessoaId, pessoaId]);
  stmt.step();
  const res = stmt.getAsObject();
  stmt.free();
  return res.maxAno ? parseInt(res.maxAno) : new Date().getFullYear();
});

ipcMain.handle('gerar-despesas-fixas-silencioso', async (event, pessoaId, ano, mes) => {
  return await helper_gerarDespesasFixas(pessoaId, ano, mes);
});

ipcMain.handle('gerar-despesas-fixas', async (event, pessoaId, ano, mes) => {
  return await helper_gerarDespesasFixas(pessoaId, ano, mes);
});

async function helper_gerarDespesasFixas(pessoaId, ano, mes) {
  // Se mes for 0, gera para o ano inteiro
  if (mes === 0) {
    for (let m = 1; m <= 12; m++) {
      await helper_gerarDespesasFixas(pessoaId, ano, m);
    }
    return { success: true };
  }

  const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  // 1. Tenta taguear gastos existentes que batem pelo nome (limpeza de legado)
  db.run(`
    UPDATE gastos 
    SET despesa_fixa_id = (
      SELECT id FROM despesas_fixas 
      WHERE despesas_fixas.nome = gastos.descricao 
      AND despesas_fixas.pessoa_id = ? AND despesas_fixas.active = 1 
      LIMIT 1
    )
    WHERE despesa_fixa_id IS NULL 
    AND pessoa_id = ? AND data >= ? AND data <= ?
  `, [pessoaId, pessoaId, startDate, endDate]);

  const stmt = db.prepare(`
    SELECT * FROM despesas_fixas WHERE pessoa_id = ? AND active = 1
    AND id NOT IN (
      SELECT despesa_fixa_id FROM gastos 
      WHERE pessoa_id = ? AND data >= ? AND data <= ? AND despesa_fixa_id IS NOT NULL AND status = 1
    )
    AND nome NOT IN (
      SELECT descricao FROM gastos 
      WHERE pessoa_id = ? AND data >= ? AND data <= ? AND status = 1
    )
  `);
  stmt.bind([pessoaId, pessoaId, startDate, endDate, pessoaId, startDate, endDate]);
  
  const despesas = [];
  while (stmt.step()) {
    despesas.push(stmt.getAsObject());
  }
  stmt.free();
  
  for (const despesa of despesas) {
    const dataVencimento = `${ano}-${String(mes).padStart(2, '0')}-${String(despesa.dia_vencimento).padStart(2, '0')}`;
    
    const safeQtd = despesa.quantidade || 1;
    const valorParcela = despesa.valor * safeQtd;
    const safeObs = despesa.observacoes || despesa.observacao || '';

    db.run(`
      INSERT INTO gastos (pessoa_id, descricao, valor, data, categoria, total_parcelas, is_parcelado, despesa_fixa_id, quantidade, descricao_pdf, estabelecimento_id, observacao, pix_chave, pix_nome)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?)
    `, [pessoaId, despesa.nome, valorParcela, dataVencimento, despesa.categoria, despesa.id, safeQtd, despesa.descricao_pdf || null, despesa.estabelecimento_id || null, safeObs, despesa.pix_chave || null, despesa.pix_nome || null]);
  }
  
  saveDatabase();
  return { success: true };
}

ipcMain.handle('get-user-by-id', async (event, id) => {
  const stmt = db.prepare('SELECT * FROM usuarios WHERE id = ?');
  stmt.bind([id]);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
});

ipcMain.handle('update-perfil', async (event, id, nome, foto, whatsapp) => {
  db.run('UPDATE usuarios SET nome = ?, foto = ?, whatsapp = ? WHERE id = ?', [nome, foto, whatsapp || null, id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('check-user-exists', async () => {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM usuarios');
  stmt.step();
  const result = stmt.getAsObject();
  stmt.free();
  return result.count > 0;
});

ipcMain.handle('create-user', async (event, usuario, senha, nome) => {
  try {
    logToFile(`Tentando criar usuário: ${usuario}, ${nome}`);
    db.run('INSERT INTO usuarios (usuario, senha, nome) VALUES (?, ?, ?)', [usuario, senha, nome]);
    saveDatabase();
    logToFile('Usuário criado com sucesso.');
    return { success: true };
  } catch (err) {
    logToFile(`ERRO CRIAR USUARIO: ${err.message}`);
    if (err.message.includes('UNIQUE')) {
       return { success: false, reason: 'E-mail em uso' };
    }
    throw err;
  }
});

ipcMain.handle('ocr-image', async (event, imagePath) => {
  const Tesseract = require('tesseract.js');
  logToFile(`OCR iniciando: ${imagePath}`);
  try {
    const { data: { text } } = await Tesseract.recognize(imagePath, 'por', {
      logger: m => logToFile(`OCR: ${m.status} ${(m.progress * 100).toFixed(0)}%`)
    });
    logToFile(`OCR concluído, chars: ${text.length}`);
    return { success: true, text };
  } catch (err) {
    logToFile(`ERRO OCR: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('generate-pdf-ano', async (event, { html, fileName, silent }) => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  try {
    const data = await win.webContents.printToPDF({
      marginType: 'default',
      pageSize: 'A4',
      printBackground: true
    });
    
    const documentsPath = app.getPath('documents');
    const folderPath = path.join(documentsPath, 'Controle Financeiro');
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
    
    const filePath = path.join(folderPath, fileName);
    fs.writeFileSync(filePath, data);
    win.close();
    
    if (!silent) shell.openPath(filePath);
    return { success: true, path: filePath };
  } catch (err) {
    win.close();
    throw err;
  }
});

// --- CATEGORIAS ---
ipcMain.handle('get-categorias', async () => {
  const stmt = db.prepare('SELECT * FROM categorias ORDER BY nome ASC');
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
});

ipcMain.handle('add-categoria', async (event, nome) => {
  db.run('INSERT INTO categorias (nome) VALUES (?)', [nome]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('delete-categoria', async (event, id) => {
  db.run('DELETE FROM categorias WHERE id = ?', [id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('get-app-data-path', () => app.getPath('userData'));

ipcMain.handle('getUserByIdPessoa', async (event, id) => {
  const stmt = db.prepare('SELECT * FROM pessoas WHERE id = ?');
  stmt.bind([id]);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
});

ipcMain.handle('send-whatsapp-automation', async (event, filePath, phone, nome) => {
  logToFile(`Iniciando envio PDF via Node Zap para ${phone}. File: ${filePath}`);
  return await waService.sendPdf(filePath, phone, `Resumo Mensal - ${nome}`);
});

ipcMain.handle('get-meios-pagamento', async () => {
  const stmt = db.prepare('SELECT * FROM meios_pagamento ORDER BY nome ASC');
  const result = [];
  while (stmt.step()) result.push(stmt.getAsObject());
  stmt.free();
  return result;
});

ipcMain.handle('wa-delete-group', async (event, name) => {
  logToFile(`Solicitação de remoção de grupo: ${name}`);
  return await waService.deleteGroupByName(name);
});

ipcMain.handle('wa-create-group', async (event, name, participants) => {
  logToFile(`Solicitação de criação de grupo: ${name}. Participantes: ${participants.length}`);
  const result = await waService.createGroup(name, participants);
  
  if (result.success && result.gid) {
      logToFile(`[WHATSAPP-BOT] Enviando menu inicial automático para o novo grupo...`);
      
      // Limpar TODOS os estados antigos ao recriar o grupo
      waBotStates.clear();
      logToFile(`[WHATSAPP-BOT] Estados do bot resetados para todos os usuários.`);
      
      try {
          const chat = await waService.client.getChatById(result.gid._serialized);
          const pessoas = [];
          const stmt = db.prepare('SELECT id, nome FROM pessoas ORDER BY nome ASC');
          while (stmt.step()) pessoas.push(stmt.getAsObject());
          stmt.free();

          let menu = `👋 *Olá! O Grupo de Despesas está pronto!* \nEu sou o seu Assistente Financeiro Automático.\n\n*Para registrar um gasto, selecione a pessoa digitando o número correspondente:* \n`;
          pessoas.forEach((p, i) => {
              menu += `\n${i + 1}️⃣  *${p.nome}*`;
          });
          menu += `\n\n------------------------------\n📸 *DICA:* Você pode mandar a foto de um cupom a qualquer momento!\n📊 *Relatório:* Basta escolher a pessoa e digitar 1.\n🔙 *Cancelar:* Digite !cancelar para limpar.`;
          
          await chat.sendMessage(menu);
      } catch (err) {
          logToFile(`[WHATSAPP-BOT] Erro ao enviar menu inicial: ${err.message}`);
      }
  }
  return result;
});

// --- SINCRONIZAÇÃO NUVEM (SUPABASE MULTI-TENANT) ---

// Ativar sincronização e obter/gerar token
ipcMain.handle('activate-cloud-sync', async (event, { userData, userId }) => {
    try {
        const id = userId || 1;
        logToFile(`[CLOUD] Ativando sincronização para: ${userData.nome} (ID: ${id})`);
        
        // 1. Gera um token baseado no nome + whatsapp + timestamp
        const syncToken = Buffer.from(`${userData.nome}-${userData.whatsapp}-${Date.now()}`).toString('base64');

        // 2. Salva no banco local do cliente para o usuário específico
        db.run('UPDATE usuarios SET cloud_token = ?, cloud_activated = 1 WHERE id = ?', [syncToken, id]);
        saveDatabase();

        return { success: true, token: syncToken };
    } catch (err) {
        logToFile(`[CLOUD] Erro na ativação: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-cloud-messages', async (event, userId) => {
    try {
        const id = userId || 1;
        // Busca o token do usuário local específico
        const stmt = db.prepare('SELECT cloud_token FROM usuarios WHERE id = ?');
        stmt.bind([id]);
        const user = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();

        if (!user || !user.cloud_token) {
            return { success: false, error: 'Cloud não ativado' };
        }

        const { data, error } = await supabase
            .from('mensagens_zap')
            .select('*')
            .eq('status', 'pendente')
            .eq('sync_token', user.cloud_token) // FILTRO CRÍTICO: Cada cliente só vê o dele
            .order('timestamp', { ascending: true });
        
        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        logToFile(`[SUPABASE] Erro ao buscar mensagens: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mark-cloud-message-imported', async (event, id) => {
    try {
        const { error } = await supabase
            .from('mensagens_zap')
            .update({ status: 'importado' })
            .eq('id', id);
        
        if (error) throw error;
        return { success: true };
    } catch (err) {
        logToFile(`[SUPABASE] Erro ao atualizar status: ${err.message}`);
        return { success: false, error: err.message };
    }
});

// --- WHATSAPP BOT LOGIC ---
const waBotStates = new Map(); // key: phone, value: { step: string, data: object }
const waBotQueues = new Map(); // key: phone, value: Array de mensagens pendentes (offline)

async function processNextQueue(sender, chat) {
    const q = waBotQueues.get(sender);
    if (!q || q.length === 0) return;
    
    const msg = q.shift(); // Retira a primeira pendente da fila
    waBotQueues.set(sender, q);

    let info = `✅ *Status: Pendente ➔ Enviado!*\nRecuperando dados da fila offline... `;
    if (q.length > 0) info += `(Restam ${q.length} na fila).`;
    
    if (chat.isGroup) await chat.sendMessage(info);
    else await msg.reply(info);
    
    // Remove "pendente" para o bot processar a foto lisa sem re-enfileirar e entrar em loop
    msg.body = (msg.body || '').replace(/pendente/gi, '').trim(); 
    
    // Processa a mensagem como se fosse nova, iniciando a conversação normal
    await onMessageWhatsApp(msg, chat);
}

function savePendingMessageToDb(p) {
    db.run(`
        INSERT INTO wa_mensagens_pendentes (message_id, sender_phone, sender_name, pessoa_id, person_name, body, step, data_json, wa_message_id, imagem)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [p.message_id, p.sender_phone, p.sender_name, p.pessoa_id, p.person_name, p.body, p.step, p.data_json, p.wa_message_id, p.imagem]);
    saveDatabase();
}

waService.onMessageCallback = onMessageWhatsApp;

/** -----------------------------------------------------------
 * LÓGICA DE GERAÇÃO DE PDF VIA WHATSAPP (FORA DO CALLBACK)
 * ----------------------------------------------------------- */
async function processWhatsAppReport(actualSender, chatId, state, month) {
    logToFile(`[WHATSAPP-PDF] Iniciando geração para ${state.data.person_name}, mês ${month}`);
    const p = { id: state.data.person_id, nome: state.data.person_name };
    const y = new Date().getFullYear();
    const m = month;

    try {
        logToFile(`[WHATSAPP-PDF] Buscando dados no banco...`);
        // 1. Buscar Dados no SQLite
        const direct = [];
        const stmtG = db.prepare('SELECT g.*, e.nome as estabelecimento_nome FROM gastos g LEFT JOIN estabelecimentos e ON g.estabelecimento_id = e.id WHERE g.pessoa_id = ? AND g.status = 1 AND strftime("%Y", g.data) = ? AND strftime("%m", g.data) = ?');
        stmtG.bind([p.id, y.toString(), m.toString().padStart(2, '0')]);
        while (stmtG.step()) direct.push(stmtG.getAsObject());
        stmtG.free();

        const installments = [];
        const stmtP = db.prepare('SELECT p.*, g.descricao_pdf as g_descricao_pdf, e.nome as estabelecimento_nome, f.nome as desc_fixa FROM parcelas p LEFT JOIN gastos g ON p.gasto_id = g.id LEFT JOIN estabelecimentos e ON g.estabelecimento_id = e.id LEFT JOIN despesas_fixas f ON g.despesa_fixa_id = f.id WHERE p.pessoa_id = ? AND g.status = 1 AND p.paga = 0 AND strftime("%Y", p.data) = ? AND strftime("%m", p.data) = ?');
        stmtP.bind([p.id, y.toString(), m.toString().padStart(2, '0')]);
        while (stmtP.step()) installments.push(stmtP.getAsObject());
        stmtP.free();

        logToFile(`[WHATSAPP-PDF] Itens encontrados: Gastos=${direct.length}, Parcelas=${installments.length}`);
        
        let allItems = [];
        direct.forEach(g => {
            if (!g.is_parcelado) {
                allItems.push({
                    desc_pdf: g.descricao_pdf || g.estabelecimento_nome || '',
                    item: g.descricao,
                    data: g.data,
                    custo: g.valor,
                    qtd: g.quantidade || 1
                });
            }
        });
        installments.forEach(p => {
            allItems.push({
                desc_pdf: p.g_descricao_pdf || p.estabelecimento_nome || p.desc_fixa || '',
                item: p.descricao,
                data: p.data,
                custo: p.valor,
                qtd: 1
            });
        });
        allItems.sort((a,b) => new Date(a.data) - new Date(b.data));

        logToFile(`[WHATSAPP-PDF] Montando HTML...`);
        let totalGeral = 0;
        let rowsHtml = '';
        const monthNamesPDF = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
        const formatDate = (d) => d ? d.split('-').reverse().join('/') : '-';

        allItems.forEach(item => {
            const totalItem = item.custo; // O valor no banco já é o total pago
            const valorUnitario = item.qtd > 0 ? (item.custo / item.qtd) : item.custo;
            totalGeral += totalItem;
            rowsHtml += `<tr><td>${item.desc_pdf}</td><td>${item.item}</td><td style="text-align:center">${formatDate(item.data)}</td><td style="text-align:center;background:#622d8d!important;color:white!important;">R$</td><td style="background:#622d8d!important;color:white!important;text-align:right;">${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(valorUnitario)}</td><td style="text-align:center">${item.qtd}</td><td style="text-align:right;">R$</td><td style="text-align:right;">${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(totalItem)}</td></tr>`;
        });

        const htmlContent = `
            <!DOCTYPE html><html><head><meta charset="UTF-8"><style>
                body { font-family: sans-serif; padding: 20px; color: #333; background: #fff; }
                .top-header { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
                .top-header td { border: 1px solid #1a2a44; color: #1a2a44; font-weight: bold; font-size: 14px; padding: 6px 10px; background: #96afcf; text-align: center; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; }
                th { background: #1a2a44; color: #ffffff; padding: 8px; border: 1px solid #000; font-size: 9px; }
                td { border: 1px solid #1a2a44; padding: 6px; background: #96afcf; }
                tr:nth-child(even) td { background: #85a0c2; }
                .footer { width: 100%; border-collapse: collapse; margin-top: 2px; }
                .footer td { background: #1a2a44; color: #fff; padding: 8px; font-weight: 800; font-size: 14px; text-align: right; border: 1px solid #000; }
            </style></head><body>
                <table class="top-header"><tr>
                    <td style="background:#196c3a!important;color:#fff!important;width:10%">PESSOA</td><td style="width:40%">${p.nome.toUpperCase()}</td>
                    <td style="background:#196c3a!important;color:#fff!important;width:10%">MÊS</td><td style="width:15%">${monthNamesPDF[m-1]}</td>
                    <td style="background:#196c3a!important;color:#fff!important;width:10%">ANO</td><td style="width:15%">${y}</td>
                </tr></table>
                <table><thead><tr><th style="width:18%">DESCRIÇÃO</th><th style="width:24%">ÍTEM</th><th style="width:10%">DATA</th><th colspan="2" style="width:18%">VALOR UNIT.</th><th style="width:6%">QTD</th><th colspan="2" style="width:18%">TOTAL</th></tr></thead><tbody>${rowsHtml}</tbody></table>
                <table class="footer"><tr><td style="text-align:right;padding-right:15px;">R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(totalGeral)}</td></tr></table>
            </body></html>`;

        const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        const pdfData = await win.webContents.printToPDF({ marginType: 'default', pageSize: 'A4', printBackground: true });
        win.close();

        const monthFull = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][m-1];
        const fileName = `Financeiro_Zap_${p.nome}_${monthFull}_${y}.pdf`;
        const filePath = path.join(app.getPath('userData'), 'uploads', fileName);
        if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, pdfData);

        await waService.sendPdf(filePath, chatId, `📄 Relatório Financeiro: ${p.nome} - ${monthFull}/${y}`);
    } catch (err) {
        logToFile(`[WHATSAPP-PDF] ERRO CRÍTICO: ${err.message}`);
    }
}

// --- CALLBACK DE MENSAGENS COMPLETO ---
async function onMessageWhatsApp(msg, chat) {
  try {
  logToFile(`[WHATSAPP-DEBUG] Z1: CALLBACK INICIADO | type=${msg.type} | hasMedia=${msg.hasMedia} | fromMe=${msg.fromMe}`);
  const from = msg.author || msg.from;
  let phone = from.split('@')[0];
  let sender = null;

  if (msg.fromMe) {
    try {
        const stmt = db.prepare('SELECT id, nome FROM usuarios LIMIT 1');
        const admin = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        sender = admin || { id: 1, nome: 'Ricardo' };
    } catch (e) { sender = { id: 1, nome: 'Ricardo' }; }
  } else {
    if (phone.startsWith('55') && phone.length > 10) phone = phone.substring(2);
    const stmt = db.prepare('SELECT id, nome FROM pessoas WHERE whatsapp LIKE ? OR ? LIKE "%" || whatsapp || "%"');
    stmt.bind([`%${phone}%`, phone]);
    sender = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
  }

  const bodyRaw = (msg.body || "").trim();
  
  // FILTRO ANTI-ECO: Ignora apenas se for uma mensagem automática do bot (marcada com \u200B)
  // Se for uma mensagem do próprio usuário (Ricardo) sem a marca, permitimos para que ele possa usar o bot no próprio celular.
  if (msg.fromMe && bodyRaw.includes('\u200B')) {
      return;
  }

  // Limpa o corpo da mensagem para processamento (remove a marca invisível se houver)
  const body = bodyRaw.replace(/\u200B/g, '').trim();
  const bodyLower = body.toLowerCase();

  logToFile(`[WHATSAPP-DEBUG] B1: from=${from} | fromMe=${msg.fromMe} | body=${body}`);

  const groupName = chat.isGroup ? ((chat.name || '').toUpperCase().trim()) : '';
  const isTargetGroup = groupName.includes('CONTROLE') || groupName.includes('FINANCEIRO');

  if (!sender) {
    if (chat.isGroup && isTargetGroup) {
        // Se for o grupo de controle, permite mesmo que não esteja na tabela de pessoas
        sender = { id: 999, nome: 'Membro do Grupo' };
        logToFile(`[WHATSAPP-BOT] Permitida mensagem de membro do grupo (não cadastrado): ${phone}`);
    } else {
        if (!msg.fromMe) logToFile(`[WHATSAPP-BOT] Ignorada mensagem de remetente desconhecido: ${phone}`);
        return; 
    }
  }

  if (!chat.isGroup) {
      if (msg.fromMe) {
          const myId = waService.client?.info?.wid?._serialized;
          const msgTo = msg.to || '';
          if (myId && msgTo !== myId) {
              return;
          }
      }
  } else {
      if (!isTargetGroup) return;
  }

  // Normalização do Sender para Multi-Device (remove :1, :2 etc) - com optional chaining para evitar crash
  let rawSender = msg.fromMe 
    ? (waService.client?.info?.wid?.user || phone)
    : phone;
  const actualSender = rawSender.split(':')[0];

  const state = waBotStates.get(actualSender) || { step: 'IDLE', data: {} };
  
  const botReply = async (text) => {
    try {
      const markedText = text + '\u200B';
      if (chat.isGroup) {
        await chat.sendMessage(markedText);
      } else {
        await msg.reply(markedText);
      }
    } catch (e) {
      logToFile(`[WA-REPLY] ❌ ERRO: ${e.message}`);
    }
  };

  // --- PRIORIDADE MÁXIMA: PROCESSAMENTO DE MÍDIA (foto/cupom) ---
  // Usa msg.type como detecção primária pois msg.hasMedia pode ser falso para fotos próprias
  const isImage = msg.type === 'image' || 
                  msg.type === 'sticker' ||
                  (msg.type === 'document' && msg.filename && msg.filename.match(/\.(jpg|jpeg|png)$/i)) ||
                  (msg.hasMedia && msg.type === 'document');
  
  logToFile(`[WA-MEDIA-DEBUG] type=${msg.type} | hasMedia=${msg.hasMedia} | isImage=${isImage}`);

  if (isImage) {
    logToFile(`[WA-OCR] Iniciando processamento de imagem para ${actualSender}`);
    await botReply('📸 Foto recebida! Processando valor (OCR)...');
    
    const uploadsDir = path.join(app.getPath('userData'), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    let tempPath = path.join(uploadsDir, `wa_ocr_${Date.now()}.jpg`);


    try {
      const media = await msg.downloadMedia();
      if (!media) throw new Error("Falha no download da mídia");

      fs.writeFileSync(tempPath, Buffer.from(media.data, 'base64'));


      // Salvar como Pendente (Backup)
      try {
        db.run(`INSERT INTO wa_mensagens_pendentes (message_id, sender_phone, sender_name, body, step, imagem) VALUES (?, ?, ?, ?, ?, ?)`, 
              [msg.id.id, actualSender, sender.nome, '[FOTO]', 'PENDENTE', tempPath]);
        saveDatabase();
      } catch(e) { logToFile(`[WA-OCR] Erro ao salvar pendente: ${e.message}`); }

      // Timeout de 15 segundos para o OCR não travar o bot
      const ocrTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout OCR")), 15000));
      const Tesseract = require('tesseract.js');
      
      const ocrResult = await Promise.race([
        Tesseract.recognize(tempPath, 'por'),
        ocrTimeout
      ]);
      
      const { data: { text } } = ocrResult;
      logToFile(`[WA-OCR] Texto bruto reconhecido: ${text.substring(0, 300)}`);
      
      let detectedValue = null;

      // Estratégia 1: R$ com variações do símbolo (OCR frequentemente erra o $)
      const regexRS = /R[\$\§\S5]\s*(\d{1,4}[,.]\d{2})/gi;
      const matchesRS = [...text.matchAll(regexRS)];
      if (matchesRS.length > 0) {
        detectedValue = matchesRS[matchesRS.length - 1][1].replace(',', '.');
      }

      // Estratégia 2: Palavra TOTAL ou VALOR seguida de número
      if (!detectedValue) {
        const regexTotal = /(?:TOTAL|VALOR|CREDITO|DEBITO)[^\d]*(\d{1,4}[,.]\d{2})/gi;
        const matchesTotal = [...text.matchAll(regexTotal)];
        if (matchesTotal.length > 0) {
          detectedValue = matchesTotal[matchesTotal.length - 1][1].replace(',', '.');
        }
      }

      // Estratégia 3: Pega todos os números no formato de moeda e usa o maior
      if (!detectedValue) {
        const regexAny = /(\d{1,4}[,.]\d{2})/g;
        const allValues = [...text.matchAll(regexAny)]
          .map(m => parseFloat(m[1].replace(',', '.')))
          .filter(v => v > 0.5 && v < 50000); // filtra valores absurdos
        if (allValues.length > 0) {
          detectedValue = Math.max(...allValues).toFixed(2);
        }
      }

      logToFile(`[WA-OCR] Valor detectado: ${detectedValue}`);

      waBotStates.set(actualSender, {
        step: 'WAIT_VALUE_CONFIRM',
        data: {
          pessoa_id: state.data.person_id || sender.id, // Fallback para o próprio sender
          person_name: state.data.person_name || sender.nome,
          valor: detectedValue,
          imagem: tempPath,
          wa_message_id: msg.id.id
        }
      });

      if (detectedValue && parseFloat(detectedValue) > 0) {
        await botReply(`💰 Detectei o valor de *R$ ${detectedValue.replace('.', ',')}*. \n\nEstá correto? \n1️⃣ Digite *Sim* ou *1* para confirmar\n2️⃣ Ou digite o valor correto (ex: 15,50)`);
      } else {
        await botReply(`❓ Não consegui ler o valor automaticamente.\n\nPor favor, digite o valor total desta nota (ex: 15,90).`);
        waBotStates.set(actualSender, { 
            step: 'WAIT_VALUE_MANUAL', 
            data: { ...state.data, imagem: tempPath, wa_message_id: msg.id.id } 
        });
      }
    } catch (e) {
      logToFile(`[WA-OCR] ERRO: ${e.message}`);
      // Mesmo com erro, salva o estado para o usuário poder digitar o valor manualmente
      const savedImagePath = tempPath || null;
      waBotStates.set(actualSender, { 
          step: 'WAIT_VALUE_MANUAL', 
          data: { 
            pessoa_id: state.data.person_id || sender.id,
            person_name: state.data.person_name || sender.nome,
            imagem: savedImagePath
          } 
      });
      await botReply(`❌ Não consegui processar a imagem automaticamente (${e.message}).\n\n✏️ *Por favor, digite o valor total desta nota* (ex: 15,90) que continuamos o cadastro normalmente!`);
    }
    return;
  }


  // Fila Offline ("Pendente")
  if (body.toLowerCase().includes('pendente') && (msg.hasMedia || body.length > 5)) {
      const q = waBotQueues.get(actualSender) || [];
      if (!q.find(m => m.id.id === msg.id.id)) {
          q.push(msg);
          waBotQueues.set(actualSender, q);
      }
      
      if (state.step === 'IDLE') {
          await processNextQueue(actualSender, chat);
      } else {
          await botReply(`✅ Arquivo pendente adicionado na fila de processamento (Posição: ${q.length}).`);
      }
      return; 
  }

  // Comando de Cancelamento Global / Retorno ao Menu
  if (body === '0' || body.toLowerCase() === 'cancelar' || body.toLowerCase() === '!cancelar') {
    waBotStates.delete(actualSender);
    waBotQueues.delete(actualSender); // Limpa fila ao cancelar
    if (body === '0') {
      const messageOi = { body: 'Oi', from: actualSender, reply: botReply, fromMe: false };
      await onMessageWhatsApp(messageOi, chat);
    } else {
      await botReply('❌ Operação cancelada. Digite "Oi" ou mande uma foto para começar.');
    }
    return;
  }

  // Auto-recuperação do estado IDLE para quem viu o menu automático de criação do grupo
  if (state.step === 'IDLE') {
      if (/^[1-9]$/.test(body)) {
          const pessoasAll = [];
          const stmt = db.prepare('SELECT id, nome FROM pessoas ORDER BY nome ASC');
          while (stmt.step()) pessoasAll.push(stmt.getAsObject());
          stmt.free();
          state.step = 'SELECT_PERSON';
          state.data = { pessoas: pessoasAll };
          waBotStates.set(actualSender, state); // PERSISTE O ESTADO!!
          logToFile(`[WA-FLOW] Auto-transição IDLE -> SELECT_PERSON para ${actualSender}`);
      }
  }


  // Menu de Boas-vindas / Seleção de Pessoa
  if (body.toLowerCase() === '!menu' || body.toLowerCase() === 'oi' || body.toLowerCase() === 'olá' || body.toLowerCase() === 'ola') {
    logToFile(`[WHATSAPP-BOT] Menu disparado por ${sender.nome}`);
    const pessoas = [];
    const stmt = db.prepare('SELECT id, nome FROM pessoas ORDER BY nome ASC');
    while (stmt.step()) pessoas.push(stmt.getAsObject());
    stmt.free();

    if (pessoas.length === 0) {
        await botReply('❌ *Nenhuma pessoa cadastrada!*\n\nCadastre pelo menos uma pessoa no app para usar o bot.');
        waBotStates.set(actualSender, { step: 'IDLE', data: {} });
        return;
    }

    let menu = `👋 *Olá, ${sender.nome}!* \nEu sou o seu Assistente Financeiro. \n\n*Selecione uma pessoa digitando o número:* \n`;
    pessoas.forEach((p, i) => {
        menu += `\n${i + 1}️⃣  *${p.nome}*`;
    });
    menu += `\n\n------------------------------\n📸 *DICA:* Mande uma foto de cupom para cadastrar um gasto agora mesmo!\n❌ Digite *cancelar* para limpar o estado a qualquer momento.`;

    await botReply(menu);
    waBotStates.set(actualSender, { step: 'SELECT_PERSON', data: { pessoas } });
    logToFile(`[WHATSAPP-BOT] Menu enviado. ${pessoas.length} pessoa(s) encontrada(s).`);
    return;
  }

  // Fluxo de Seleção de Pessoa
  if (state.step === 'SELECT_PERSON') {
      logToFile(`[WA-FLOW] Processando seleção de pessoa. Body: "${body}"`);

      // Opção 0 volta ao menu
      if (body === '0') {
          logToFile(`[WA-FLOW] Usuário digitou 0, voltando ao menu.`);
          const messageOi = { body: 'Oi', from: actualSender, reply: botReply, fromMe: false };
          await onMessageWhatsApp(messageOi, chat);
          return;
      }

      const idx = parseInt(body) - 1;

      // Verifica se o índice é válido
      if (isNaN(idx) || idx < 0) {
          logToFile(`[WA-FLOW] Índice inválido: ${body}`);
          await botReply('❌ Número inválido. Digite o número da pessoa que deseja selecionar.');
          return;
      }

      const pessoas = state.data && state.data.pessoas;
      if (!pessoas || pessoas.length === 0) {
          logToFile(`[WA-FLOW] Lista de pessoas vazia!`);
          await botReply('❌ Nenhuma pessoa cadastrada. Digite "Oi" para ver a lista.');
          return;
      }

      const selecionada = pessoas[idx];
      if (!selecionada) {
          logToFile(`[WA-FLOW] Pessoa não encontrada. idx=${idx}, total=${pessoas.length}`);
          await botReply(`❌ Opção inválida. Escolha um número de 1 a ${pessoas.length} ou digite 0 para voltar.`);
          return;
      }

      logToFile(`[WA-FLOW] Pessoa selecionada: ${selecionada.nome} (id: ${selecionada.id})`);
      waBotStates.set(actualSender, { step: 'SELECT_ACTION', data: { person_id: selecionada.id, person_name: selecionada.nome } });
      await botReply(`👤 Você selecionou: *${selecionada.nome}*\n\nO que deseja fazer?\n\n1️⃣  *Gerar Relatório (PDF)*\n2️⃣  *Adicionar Gasto (Mande uma Foto)*\n0️⃣  *Voltar ao Menu*\n\nDigite *cancelar* para interromper.`);
      return;
  }


  // Fluxo de Seleção de Ação
  if (state.step === 'SELECT_ACTION') {
      // Opção 0 volta ao menu
      if (body === '0') {
          const messageOi = { body: 'Oi', from: actualSender, reply: botReply, fromMe: false };
          await onMessageWhatsApp(messageOi, chat);
          return;
      }
      if (body === '1') {
          await botReply(`📅 Para qual *mês* você deseja o relatório de *${state.data.person_name}*?\nDigite o número do mês (ex: 1 para Janeiro, 2 para Fevereiro...).`);
          waBotStates.set(actualSender, { step: 'WAIT_REPORT_MONTH', data: { ...state.data } });
      } else if (body === '2') {
          await botReply('📸 Ok! Pode enviar a foto do cupom agora.\n_Dica: Se quiser cancelar e voltar ao menu, digite 0._');
          waBotStates.set(actualSender, { step: 'IDLE', data: { person_id: state.data.person_id, person_name: state.data.person_name } }); // Volta pro IDLE mas guarda quem é
      } else {
          await botReply('❌ Opção inválida.\nDigite 1 para Relatório, 2 para Gasto ou 0 para voltar ao menu.');
      }
      return;
  }

  // Fluxo de Seleção de Mês para Relatório
  if (state.step === 'WAIT_REPORT_MONTH') {
      if (body === '0') {
          const messageOi = { body: 'Oi', from: actualSender, reply: botReply, fromMe: false };
          await onMessageWhatsApp(messageOi, chat);
          return;
      }

      const month = parseInt(body);
      if (!isNaN(month) && month >= 1 && month <= 12) {
          await botReply(`📊 Gerando relatório de *${state.data.person_name}* para o mês *${month}*...\n_Aguarde alguns segundos..._`);
          
          waBotStates.set(actualSender, { step: 'IDLE', data: {} });
          processWhatsAppReport(actualSender, chat.id._serialized, state, month);
      } else if (body !== '0') {
          // Apenas avisa se não for um comando válido e não for eco
          await botReply('❌ Mês inválido. Digite um número de 1 a 12 ou 0 para cancelar.');
      }
      return;
  }

  // Comandos de Cancelamento e Relatório...

  // Comandos de Cancelamento e Relatório...

  // Máquina de Estados (Respostas de Texto)
  switch (state.step) {
    case 'WAIT_VALUE_CONFIRM':
    case 'WAIT_VALUE_MANUAL':
      let value = null;
      // Corrigido bug: se body for 1, consideramos como 'Sim' (confirmação do valor), NÃO como R$ 1,00.
      if ((body.toLowerCase() === 'sim' || body === '1') && state.step === 'WAIT_VALUE_CONFIRM') {
        value = state.data.valor;
      } else {
        const checkVal = body.replace(',', '.').match(/\d+\.?\d*/);
        if (checkVal) value = checkVal[0];
      }

      if (value) {
        state.data.valor = value;
        state.step = 'WAIT_LOCAL'; // Agora vai para a escolha de Estabelecimento ao invés de Descrição Livre
        
        // Carrega o menu de locais (estabelecimentos)
        const estabs = [];
        const stmtE = db.prepare('SELECT id, nome FROM estabelecimentos ORDER BY nome ASC');
        while (stmtE.step()) estabs.push(stmtE.getAsObject());
        stmtE.free();
        
        state.data._locals = estabs;
        waBotStates.set(actualSender, state);

        let menuLocal = `✅ Valor: R$ ${value.replace('.', ',')}\n\n*Qual o Estabelecimento (Descrição da Compra)?*\n`;
        estabs.forEach((e, i) => { menuLocal += `\n${i + 1}. ${e.nome}`; });
        menuLocal += `\n${estabs.length + 1}. ➕ Outros (Digitar novo)`;
        menuLocal += `\n\n_Digite o número correspondente._`;
        await botReply(menuLocal);
      } else {
        await botReply('Por favor, digite um valor válido ou "cancelar".');
      }
      break;

    // WAIT_DESCRICAO foi removido pois a descrição agora é o próprio Estabelecimento (WAIT_LOCAL)

    case 'WAIT_LOCAL': {
      const estabs = state.data._locals || [];
      const idx = parseInt(body) - 1;
      
      if (body === (estabs.length + 1).toString()) {
        state.step = 'WAIT_LOCAL_MANUAL';
        waBotStates.set(actualSender, state);
        await botReply(`🏢 *Qual o nome do novo Estabelecimento?*`);
        return;
      }

      const estabSel = estabs[idx];
      if (!estabSel) {
        await botReply('❌ Opção inválida. Digite o número do local.');
        return;
      }

      state.data.local_nome = estabSel.nome;
      state.data.descricao_pdf_txt = estabSel.nome; // Define a descrição baseada no local
      
      state.step = 'WAIT_ITEM';
      waBotStates.set(actualSender, state);

      await botReply(`📁 Estabelecimento salvo: *${estabSel.nome}*\n\nE qual é o *Ítem* (produto/serviço comprado)?\n_(Ex: Feira da semana, Remédios, Gasolina comum)_`);
      break;
    }

    case 'WAIT_LOCAL_MANUAL': {
      state.data.local_nome = body;
      state.data.descricao_pdf_txt = body; // Define a descrição baseada no local
      state.step = 'WAIT_ITEM';
      waBotStates.set(actualSender, state);

      // Salva o novo estabelecimento no banco
      const stmtEE = db.prepare('SELECT id FROM estabelecimentos WHERE nome = ?');
      stmtEE.bind([body]);
      if (!stmtEE.step()) {
          db.run('INSERT INTO estabelecimentos (nome) VALUES (?)', [body]);
      }
      stmtEE.free();

      await botReply(`📁 Estabelecimento salvo: *${body}*\n\nE qual é o *Ítem* (produto/serviço comprado)?\n_(Ex: Feira da semana, Remédios, Gasolina comum)_`);
      break;
    }

    case 'WAIT_ITEM':
      state.data.item_txt = body; // Guarda o ítem (coluna de item)
      state.step = 'WAIT_PAYMENT';
      waBotStates.set(actualSender, state);

      {
        // Menu numerado de meios de pagamento
        const meios = [];
        const stmtM = db.prepare('SELECT id, nome FROM meios_pagamento ORDER BY nome ASC');
        while (stmtM.step()) meios.push(stmtM.getAsObject());
        stmtM.free();
        
        state.data._meios = meios;
        waBotStates.set(actualSender, state);

        let menuMeios = `🛍️ Ítem: *${body}*\n\n*Escolha o Meio de Pagamento:*\n`;
        meios.forEach((m, i) => { menuMeios += `\n${i + 1}. ${m.nome}`; });
        menuMeios += `\n\n_Digite o número correspondente._`;
        await botReply(menuMeios);
      }
      break;
    case 'WAIT_PAYMENT': {
      const meios = state.data._meios || [];
      const idx = parseInt(body) - 1;
      const meioSel = meios[idx];

      if (!meioSel) {
        await botReply('❌ Opção inválida. Digite o número do meio de pagamento.');
        return;
      }

      state.data.meio = meioSel.nome;
      state.data.meio_id = meioSel.id;

      // Se for Cartão, abre sub-menu de cartões
      if (meioSel.nome.toLowerCase().includes('cartão') || meioSel.nome.toLowerCase().includes('cartao')) {
        const cartoes = [];
        const stmtCart = db.prepare('SELECT id, nome FROM cartoes ORDER BY nome ASC');
        while (stmtCart.step()) cartoes.push(stmtCart.getAsObject());
        stmtCart.free();

        state.data._cartoes = cartoes;
        state.step = 'WAIT_CARD';
        waBotStates.set(actualSender, state);

        let menuCart = `💳 Pagamento: *Cartão*\n\n*Escolha o Cartão:*\n`;
        cartoes.forEach((c, i) => { menuCart += `\n${i + 1}. ${c.nome}`; });
        menuCart += `\n\n_Digite o número correspondente._`;
        await botReply(menuCart);
      } else {
        // Não é cartão, vai direto para data
        state.step = 'WAIT_MONTH';
        waBotStates.set(actualSender, state);
        const suggestedDate = new Date();
        await botReply(`📅 Pagamento: *${meioSel.nome}*\n\n🕒 *Qual o mês deste gasto?* \nEx: 05\n\n_Digite atual para o mês atual (${(suggestedDate.getMonth()+1).toString().padStart(2,'0')})_`);
      }
      break;
    }

    case 'WAIT_CARD': {
      const cartoes = state.data._cartoes || [];
      const cidx = parseInt(body) - 1;
      const cartaoSel = cartoes[cidx];

      if (!cartaoSel) {
        await botReply('❌ Opão inválida. Digite o número do cartão.');
        return;
      }

      state.data.cartao_id = cartaoSel.id;
      state.data.cartao_nome = cartaoSel.nome;
      state.step = 'WAIT_MONTH';
      waBotStates.set(actualSender, state);

      const suggestedDate2 = new Date();
      await botReply(`💳 Cartão: *${cartaoSel.nome}*\n\n🕒 *Qual o mês deste gasto?* \nEx: 05\n\n_Digite atual para o mês atual (${(suggestedDate2.getMonth()+1).toString().padStart(2,'0')})_`);
      break;
    }

    case 'WAIT_MONTH': {
      let mesVal = body;
      const now = new Date();
      if (mesVal.toLowerCase() === 'atual') {
          mesVal = (now.getMonth() + 1).toString().padStart(2, '0');
      } else {
          mesVal = mesVal.padStart(2, '0');
      }

      if (parseInt(mesVal) < 1 || parseInt(mesVal) > 12) {
          await botReply('❌ Mês inválido. Digite um número de 1 a 12 ou a palavra atual para o mês atual.');
          return;
      }

      state.data.mes_sel = mesVal;
      state.step = 'WAIT_YEAR';
      waBotStates.set(actualSender, state);

      await botReply(`🕒 *Qual o ano deste gasto?* \nEx: 2026\n\n_Digite atual para o ano atual (${now.getFullYear()})_`);
      break;
    }

    case 'WAIT_YEAR': {
      let anoVal = body;
      const now2 = new Date();
      if (anoVal.toLowerCase() === 'atual') {
          anoVal = now2.getFullYear().toString();
      }

      if (anoVal.length !== 4 || isNaN(parseInt(anoVal))) {
          await botReply('❌ Ano inválido. Digite o ano com 4 dígitos (ex: 2026) ou a palavra atual para o ano atual.');
          return;
      }

      const finalDate = `${anoVal}-${state.data.mes_sel}-10`;

      // Salvar no Banco
      try {
        const uploadsDir = path.join(app.getPath('userData'), 'uploads', 'gastos');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        
        let dbFileName = null;
        if (state.data.imagem && fs.existsSync(state.data.imagem)) {
            dbFileName = `wa_gasto_${Date.now()}.jpg`;
            fs.copyFileSync(state.data.imagem, path.join(uploadsDir, dbFileName));
        }

        // 1. Garantir que o estabelecimento existe e pegar o ID
        let estabId = null;
        if (state.data.local_nome) {
            // Tenta achar ID pelo nome
            const stmtE = db.prepare('SELECT id FROM estabelecimentos WHERE nome = ?');
            stmtE.bind([state.data.local_nome]);
            if (stmtE.step()) {
                estabId = stmtE.getAsObject().id;
            }
            stmtE.free();

            // Se não existe, cria agora
            if (!estabId) {
                db.run('INSERT INTO estabelecimentos (nome) VALUES (?)', [state.data.local_nome]);
                estabId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
            }
        }

        // 2. Calcular Data de Pagamento para Cartão (WhatsApp)
        let dataPagamento = finalDate;
        if (state.data.cartao_id) {
            try {
                const stmtCard = db.prepare('SELECT data_vencimento FROM cartoes WHERE id = ?');
                stmtCard.bind([state.data.cartao_id]);
                if (stmtCard.step()) {
                    const diaVenc = stmtCard.getAsObject().data_vencimento;
                    if (diaVenc) {
                        const [y, m, d] = finalDate.split('-').map(Number);
                        let mesPag = m; // Mês Seguinte ao uso
                        let anoPag = y;
                        if (mesPag > 11) { mesPag = 0; anoPag++; }
                        const dtPag = new Date(anoPag, mesPag, diaVenc);
                        dataPagamento = dtPag.toISOString().split('T')[0];
                    }
                }
                stmtCard.free();
            } catch (e) { logToFile(`[WA-BOT] Erro ao calc data pag: ${e.message}`); }
        }

        // 3. Unir Local e Item na Descrição (WhatsApp)
        const itemDesc = state.data.item_txt || 'Gasto WhatsApp';
        const localDesc = state.data.local_nome || '';
        const descricaoFinal = localDesc ? `${localDesc} - ${itemDesc}` : itemDesc;

        // 4. Realizar o INSERT final na tabela gastos
        db.run(`
          INSERT INTO gastos (
            pessoa_id, descricao, estabelecimento_id, valor, data,
            cartao_id, meio_pagamento_nome, wa_message_id, foto, descricao_pdf,
            cadastrado_por, data_pagamento
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          state.data.pessoa_id,
          descricaoFinal,
          estabId,
          parseFloat(state.data.valor),
          finalDate,
          state.data.cartao_id || null,
          state.data.cartao_nome || state.data.meio,
          state.data.wa_message_id,
          dbFileName,
          state.data.descricao_pdf_txt,
          sender.nome, // Auditoria
          dataPagamento // Data calculada
        ]);
        saveDatabase();

        // Marcar como Concluído no banco de pendentes
        if (state.data.wa_message_id) {
          markPendingMessageProcessed(state.data.wa_message_id);
        }

        await botReply(`🎉 Gasto de *R$ ${state.data.valor.replace('.', ',')}* salvo para o mês *${finalDate.split('-')[1]}/${finalDate.split('-')[0]}* com sucesso! ✅`);
        waBotStates.delete(actualSender);

        // Dispara o próximo da fila de pendentes se houver
        const q = waBotQueues.get(actualSender);
        if (q && q.length > 0) {
             await processNextQueue(actualSender, chat);
        }

      } catch (e) {
        logToFile(`[WA-ERR] Error saving: ${e.message}`);
        await botReply('❌ Erro ao salvar no banco de dados.');
      }
      break;
    }
  } // Fim do switch(state.step)
  } catch (globalErr) {
    logToFile(`[WA-FATAL] Erro não tratado em onMessageWhatsApp: ${globalErr.message}\n${globalErr.stack}`);
    try { await chat.sendMessage(`⚠️ O bot encontrou um erro interno. Tente novamente ou digite "cancelar".`); } catch(_) {}
  }
}; // Fim do onMessageWhatsApp


// Sincronização Inicial
async function syncWhatsAppHistory() {
  if (!waService.isReady) return;
  try {
    logToFile('[WHATSAPP-BOT] Iniciando sincronização de mensagens não lidas...');
    const chats = await waService.client.getChats();
    const group = chats.find(c => c.name === 'CONTROLE FINANCEIRO');
    if (!group) return;

    const messages = await group.fetchMessages({ limit: 50 });
    let disparouOffline = false;

    for (const m of messages) {
       const from = m.author || m.from;
       let phone = from.split('@')[0];
       if (phone.startsWith('55') && phone.length > 10) phone = phone.substring(2);
       
       const b = (m.body || '').toLowerCase();
       
       if (b.includes('pendente') && (m.hasMedia || b.length > 5)) {
          const stmt = db.prepare('SELECT id FROM gastos WHERE wa_message_id = ?');
          stmt.bind([m.id.id]);
          const exists = stmt.step();
          stmt.free();

          if (!exists) {
             let rawSyncSender = m.fromMe ? (waService.client.info.wid ? waService.client.info.wid.user : phone) : phone;
             const actualSender = rawSyncSender.split(':')[0];

             const q = waBotQueues.get(actualSender) || [];
             if (!q.find(mq => m.id.id === mq.id.id)) {
                q.push(m);
                waBotQueues.set(actualSender, q);
                disparouOffline = true;
                logToFile(`[SYNC] Gasto pendente enfileirado de ${actualSender}.`);
             }
          }
       }
    }
    
    if (disparouOffline) {
       for (const [sender, q] of waBotQueues.entries()) {
           const st = waBotStates.get(sender);
           if (q.length > 0 && (!st || st.step === 'IDLE')) {
               logToFile(`[SYNC] Disparando fila offline para ${sender}.`);
               await processNextQueue(sender, group);
           }
       }
    }
  } catch (e) {
    logToFile(`[SYNC] Erro: ${e.message}`);
  }
}

// Hook na inicialização do serviço
const originalOnReady = waService.onReadyCallback;
waService.onReadyCallback = () => {
  if (originalOnReady) originalOnReady();
  syncWhatsAppHistory();
  // Processa mensagens pendentes do banco quando app inicia
  processPendingMessagesFromDb();
};

ipcMain.handle('add-meio-pagamento', async (event, nome) => {
  db.run('INSERT INTO meios_pagamento (nome) VALUES (?)', [nome]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('delete-meio-pagamento', async (event, id) => {
  db.run('DELETE FROM meios_pagamento WHERE id = ?', [id]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('wa-get-status', () => waService.getStatus());
ipcMain.handle('wa-check-group', async () => await waService.hasControleGroup());
ipcMain.handle('wa-logout', async () => await waService.logout());

// -----------------------------------------------------------
// HANDLERS IPC PARA MENSAGENS PENDENTES (FRONTEND)
// -----------------------------------------------------------
ipcMain.handle('wa-get-pending-messages', async () => {
  return getPendingMessagesFromDb();
});

ipcMain.handle('wa-get-pending-count', async () => {
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM wa_mensagens_pendentes WHERE processado = 0');
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result.count;
  } catch(e) {
    return 0;
  }
});

ipcMain.handle('wa-mark-message-processed', async (event, messageId) => {
  return markPendingMessageProcessed(messageId);
});

ipcMain.handle('wa-process-all-pending', async () => {
  await processPendingMessagesFromDb();
  return { success: true };
});

ipcMain.handle('wa-delete-last-messages', async (event, chatId, count) => {
  if (!waService.isReady) {
    return { success: false, error: 'WhatsApp não conectado' };
  }
  return await waService.deleteLastMessages(chatId, count || 10);
});

// -----------------------------------------------------------
// TABELA DE MENSAGENS PENDENTES DO WHATSAPP
// Salva mensagens quando app offline está desligado
// -----------------------------------------------------------
try {
  db.run(`
    CREATE TABLE IF NOT EXISTS wa_mensagens_pendentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      sender_phone TEXT,
      sender_name TEXT,
      pessoa_id INTEGER,
      person_name TEXT,
      body TEXT,
      step TEXT DEFAULT 'PENDENTE',
      data_json TEXT,
      wa_message_id TEXT,
      imagem TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processado INTEGER DEFAULT 0,
      processado_em DATETIME
    )
  `);
} catch(e) {}

// Salvar mensagem pendente no banco
function savePendingMessageToDb(msgData) {
  try {
    const stmtCheck = db.prepare('SELECT id FROM wa_mensagens_pendentes WHERE message_id = ?');
    stmtCheck.bind([msgData.message_id]);
    if (stmtCheck.step()) {
      stmtCheck.free();
      return false; // Já existe
    }
    stmtCheck.free();

    db.run(`
      INSERT INTO wa_mensagens_pendentes (
        message_id, sender_phone, sender_name, pessoa_id, person_name, 
        body, step, data_json, wa_message_id, imagem
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      msgData.message_id,
      msgData.sender_phone,
      msgData.sender_name,
      msgData.pessoa_id || null,
      msgData.person_name,
      msgData.body,
      msgData.step || 'PENDENTE',
      msgData.data_json || null,
      msgData.wa_message_id || null,
      msgData.imagem || null
    ]);
    saveDatabase();
    logToFile(`[WA-PENDENTE] Mensagem ${msgData.message_id} salva como Pendente no banco.`);
    return true;
  } catch(e) {
    logToFile(`[WA-PENDENTE] ERRO ao salvar: ${e.message}`);
    return false;
  }
}

// Marcar mensagem como processada
function markPendingMessageProcessed(messageId) {
  try {
    db.run(`
      UPDATE wa_mensagens_pendentes 
      SET processado = 1, processado_em = CURRENT_TIMESTAMP
      WHERE message_id = ?
    `, [messageId]);
    saveDatabase();
    logToFile(`[WA-PENDENTE] Mensagem ${messageId} marcada como Concluído.`);
    return true;
  } catch(e) {
    logToFile(`[WA-PENDENTE] ERRO ao marcar processada: ${e.message}`);
    return false;
  }
}

// Obter todas mensagens pendentes do banco
function getPendingMessagesFromDb() {
  const results = [];
  try {
    const stmt = db.prepare(`
      SELECT * FROM wa_mensagens_pendentes 
      WHERE processado = 0 
      ORDER BY created_at ASC
    `);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
  } catch(e) {
    logToFile(`[WA-PENDENTE] ERRO ao buscar pendentes: ${e.message}`);
  }
  return results;
}

// Obter lista de pessoas para o bot
function getPessoasForBot() {
  const pessoas = [];
  try {
    const stmt = db.prepare('SELECT id, nome FROM pessoas ORDER BY nome ASC');
    while (stmt.step()) pessoas.push(stmt.getAsObject());
    stmt.free();
  } catch(e) {}
  return pessoas;
}

// Processar mensagens pendentes do banco ao iniciar
async function processPendingMessagesFromDb() {
  try {
    const pendentes = getPendingMessagesFromDb();
    if (pendentes.length === 0) {
      logToFile('[WA-PENDENTE] Nenhuma mensagem pendente para processar.');
      return;
    }

    logToFile(`[WA-PENDENTE] Encontradas ${pendentes.length} mensagens pendentes. Processando...`);

    for (const msg of pendentes) {
      try {
        logToFile(`[WA-PENDENTE] Processando: ${msg.message_id} - ${msg.body}`);

        // Recria o estado do bot
        const state = {
          step: msg.step || 'PENDENTE',
          data: msg.data_json ? JSON.parse(msg.data_json) : {}
        };

        // Se a mensagem tem imagem, marca como processada (já foi tratada)
        if (msg.imagem && fs.existsSync(msg.imagem)) {
          markPendingMessageProcessed(msg.message_id);
          continue;
        }

        // Para mensagens de texto, tenta processar conforme o step
        if (msg.step === 'PENDENTE' && msg.pessoa_id) {
          // Verifica se precisa selecionar pessoa ou já tem
          if (msg.body && /^[1-9]$/.test(msg.body)) {
            // Seleção de pessoa via número
            const pessoas = getPessoasForBot();
            const idx = parseInt(msg.body) - 1;
            if (pessoas[idx]) {
              state.step = 'SELECT_ACTION';
              state.data = { person_id: pessoas[idx].id, person_name: pessoas[idx].nome };
            }
          }
        }

        // Marca como processada após processar
        markPendingMessageProcessed(msg.message_id);

      } catch(e) {
        logToFile(`[WA-PENDENTE] ERRO ao processar ${msg.message_id}: ${e.message}`);
      }
    }

    logToFile('[WA-PENDENTE] Processamento de pendentes concluído.');
  } catch(e) {
    logToFile(`[WA-PENDENTE] ERRO geral: ${e.message}`);
  }
}

