FROM ghcr.io/puppeteer/puppeteer:latest

# Instalar dependências necessárias para o Chrome rodar no Linux (Render)
USER root
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (incluindo as de produção)
RUN npm install

# Copiar o restante do código
COPY . .

# Comando para rodar o bot
CMD ["node", "cloud_bot.js"]
