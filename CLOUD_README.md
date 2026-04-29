# ☁️ Finance Bot - Guia da Nuvem (Cloud Bot)

Este guia explica como colocar o seu robô de WhatsApp para funcionar 24 horas por dia, sem precisar que o seu computador esteja ligado.

## Como funciona?
1. O **Cloud Bot** roda em um servidor na internet (ex: Render, Railway ou um PC que nunca desliga).
2. Ele fica conectado ao seu WhatsApp e "escuta" todas as mensagens.
3. Quando alguém envia um gasto, o Cloud Bot salva essa mensagem no **Supabase**.
4. Quando você abre o seu **App Desktop (PC)**, ele verifica o Supabase e baixa automaticamente todos os gastos que o robô da nuvem recebeu enquanto você estava fora.

---

## 🛠️ Como configurar em um Servidor (Grátis)

Eu recomendo usar o **Render.com** ou **Railway.app** pois são fáceis.

### Passo 1: Preparar o Projeto
Certifique-se de que o arquivo `cloud_bot.js` e o `package.json` estão na mesma pasta.

### Passo 2: Instalar Dependências
No servidor, você precisará rodar:
```bash
npm install
```

### Passo 3: Rodar o Bot
Execute o comando:
```bash
npm run cloud-bot
```

### Passo 4: Conectar o WhatsApp
Na primeira vez que rodar, o servidor vai mostrar um **QR Code** (ou um link para ele). Escaneie com o seu celular (em Aparelhos Conectados) e pronto!

---

## 💻 Testando Localmente
Se você quiser testar agora mesmo no seu PC (antes de colocar na nuvem):
1. Feche o App Financeiro.
2. Abra o terminal na pasta do projeto.
3. Digite: `npm run cloud-bot`
4. Mande uma mensagem no Zap e veja se ele confirma o recebimento na tela preta do terminal.
5. Depois, abra o App e clique em "Sincronizar Nuvem".

---

## 📝 Notas Importantes
- O **Cloud Token** do Ricardo já está configurado como: `RICARDO-FINANCE-CLOUD-2026`.
- Este bot **não** faz OCR (leitura de fotos) na nuvem por ser um processo pesado. Ele salva o texto e a referência da mensagem para que o seu App Desktop faça o processamento completo quando for aberto.

---
*Dúvidas? Pergunte para o seu assistente Antigravity!*
