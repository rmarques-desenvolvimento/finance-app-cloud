# Finance App - Instruções para Agentes

## Visão Geral
Aplicativo desktop Electron.js para controle financeiro pessoal com integração WhatsApp e OCR de cupons fiscais.

**Stack:**
- Electron 33.2.1 (desktop framework)
- sql.js 1.14.1 (SQLite in-memory)
- whatsapp-web.js 1.34.6 (automação WhatsApp)
- tesseract.js 5.0.4 (OCR)
- Chart.js (gráficos via CDN)
- Font Awesome 6.5.1 (ícones via CDN)

## Comandos

```bash
npm run dev    # Executar em modo desenvolvimento
npm run build  # Compilar portable .exe (saída em dist/)
```

## Estrutura do Projeto

```
finance-app/
├── main.js              # Processo principal Electron (~1700 linhas)
├── preload.js           # Context bridge IPC
├── whatsapp_service.js # Serviço WhatsApp Web
├── renderer/
│   ├── dashboard.html  # Interface principal
│   ├── login.html       # Tela de login
│   ├── js/
│   │   ├── dashboard.js # Lógica UI completa (~3400 linhas)
│   │   ├── cards.js     # Gestão cartões
│   │   ├── expenses.js  # Gestão despesas
│   │   └── people.js   # Gestão pessoas
│   └── css/
│       ├── style.css   # Design system (~2050 linhas)
│       └── login.css  # Estilos login
├── uploads/             # Arquivos uploadados
│   ├── cartoes/
│   ├── cupons/
│   └── pessoas/
├── whatsapp_session/   # Sessão WhatsApp persistente
├── por.traineddata     # Dados OCR português
└── dist/               # Builds compilados
```

## Banco de Dados (sql.js)

**Tabelas principais:**
- `usuarios` - usuários admin
- `pessoas` - cadastro de pessoas/finanças
- `gastos` - despesas registradas
- `parcelas` - compras parceladas
- `despesas_fixas` - recorrências mensais
- `cartoes` - cartões de crédito
- `estabelecimentos` - comércios
- `cupons` - cupons fiscais OCR
- `itens_cupom` - itens do cupom
- `entradas` - receitas mensais
- `categorias` - categorias de gastos
- `meios_pagamento` - dinheiro, cartão, PIX
- `alertas` - sistema de notificações

## Fluxo IPC

```
Renderer (UI)
    ↓ ipcRenderer.invoke
Preload.js (contextBridge)
    ↓ ipcMain.handle
Main.js (backend + SQL)
```

**Para adicionar novo método API:**
1. Adicionar em `preload.js` → `contextBridge`
2. Adicionar handler em `main.js` → `ipcMain.handle`
3. Chamar no frontend via `window.api.metodo()`

## Funcionalidades Principais

### Integração WhatsApp
- Bot menu interativo
- Envio automático de relatórios PDF
- Criação de grupos por pessoa
- OCR de cupons via imagem

### OCR de Cupons
- Usa tesseract.js com dados `por.traineddata`
- Armazena cupons em `uploads/cupons/`
- Itens extraídos em `itens_cupom`

### QR Code PIX
- Geração em massa via `qrcode` library
- Suporte a chave PIX e nome recebedor

## Sistema de Design

```css
:root {
  --bg-primary: #0a0e1a;
  --accent-primary: #6366f1;
  --text-primary: #f1f5f9;
}
```

- Tema dark
- Cartões usam `.person-card` com barra gradiente `::before`
- Fontes: Plus Jakarta Sans, Roboto Mono (Google Fonts)

## Tarefas Comuns

### Adicionar novo modal
```javascript
showModal(titulo, conteudoHTML)
```

### Renderizar card de pessoa
```javascript
renderPersonCard(pessoa) // em dashboard.js
```

### Testar alterações
```bash
npm run dev    # desenvolvimento
npm run build  # produção (só após testar)
```

## Saída de Build

- `dist/finance-app 1.0.0.exe` (portable Windows)
- Ícone: `assets/icons/wallet-icon.png`

## Limitações e Melhorias Futuras

- dashboard.js (~3400 linhas) precisa ser modularizado
- Sem testes automatizados
- Sem linting (ESLint)
- Sem TypeScript
- Sem criptografia para dados sensíveis