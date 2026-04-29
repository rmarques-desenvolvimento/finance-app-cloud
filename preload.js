const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  login: (usuario, senha) => ipcRenderer.invoke('login', usuario, senha),
  
  checkUserExists: () => ipcRenderer.invoke('check-user-exists'),
  createUser: (usuario, senha, nome) => ipcRenderer.invoke('create-user', usuario, senha, nome),
  
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  getPessoas: () => ipcRenderer.invoke('get-pessoas'),
  addPessoa: (nome, foto, whatsapp) => ipcRenderer.invoke('add-pessoa', nome, foto, whatsapp),
  updatePessoa: (id, nome, foto, whatsapp) => ipcRenderer.invoke('update-pessoa', id, nome, foto, whatsapp),
  deletePessoa: (id) => ipcRenderer.invoke('delete-pessoa', id),
  
  getGastosPessoa: (pessoaId, ano, mes) => ipcRenderer.invoke('get-gastos-pessoa', pessoaId, ano, mes),
  getTotalGastosPessoa: (pessoaId, ano, mes) => ipcRenderer.invoke('get-total-gastos-pessoa', pessoaId, ano, mes),
  addGasto: (gasto) => ipcRenderer.invoke('add-gasto', gasto),
  updateGasto: (id, gasto) => ipcRenderer.invoke('update-gasto', id, gasto),
  getGastoPorId: (id) => ipcRenderer.invoke('get-gasto-por-id', id),
  deleteGasto: (id) => ipcRenderer.invoke('delete-gasto', id),
  marcarGastoPago: (id, paga) => ipcRenderer.invoke('marcar-gasto-pago', id, paga),
  
  getParcelasPessoa: (pessoaId, ano, mes) => ipcRenderer.invoke('get-parcelas-pessoa', pessoaId, ano, mes),
  marcarParcelaPaga: (id, paga) => ipcRenderer.invoke('marcar-parcela-paga', id, paga),
  deleteParcela: (id) => ipcRenderer.invoke('delete-parcela', id),
  
  getCartoes: () => ipcRenderer.invoke('get-cartoes'),
  addCartao: (cartao) => ipcRenderer.invoke('add-cartao', cartao),
  updateCartao: (id, cartao) => ipcRenderer.invoke('update-cartao', id, cartao),
  deleteCartao: (id) => ipcRenderer.invoke('delete-cartao', id),
  
  getEstabelecimentos: () => ipcRenderer.invoke('get-estabelecimentos'),
  addEstabelecimento: (cnpj, nome) => ipcRenderer.invoke('add-estabelecimento', cnpj, nome),
  updateEstabelecimento: (id, cnpj, nome) => ipcRenderer.invoke('update-estabelecimento', id, cnpj, nome),
  deleteEstabelecimento: (id) => ipcRenderer.invoke('delete-estabelecimento', id),
  
  getDespesasFixas: () => ipcRenderer.invoke('get-despesas-fixas'),
  addDespesaFixa: (despesa) => ipcRenderer.invoke('add-despesa-fixa', despesa),
  updateDespesaFixa: (id, despesa) => ipcRenderer.invoke('update-despesa-fixa', id, despesa),
  deleteDespesaFixa: (id) => ipcRenderer.invoke('delete-despesa-fixa', id),
  gerarDespesasFixas: (pessoaId, ano, mes) => ipcRenderer.invoke('gerar-despesas-fixas', pessoaId, ano, mes),
  gerarDespesasFixasSilencioso: (pessoaId, ano, mes) => ipcRenderer.invoke('gerar-despesas-fixas-silencioso', pessoaId, ano, mes),
  getMaxAnoPessoa: (pessoaId) => ipcRenderer.invoke('get-max-ano-pessoa', pessoaId),
  
  getAlertas: () => ipcRenderer.invoke('get-alertas'),
  addAlerta: (tipo, titulo, mensagem, dataVencimento) => ipcRenderer.invoke('add-alerta', tipo, titulo, mensagem, dataVencimento),
  marcarAlertaVisualizado: (id) => ipcRenderer.invoke('marcar-alerta-visualizado', id),
  
  salvarCupom: (pessoaId, cartaoId, imagemPath, textoOcr, total, data, itens, cnpj) => 
    ipcRenderer.invoke('salvar-cupom', pessoaId, cartaoId, imagemPath, textoOcr, total, data, itens, cnpj),
  getCupom: (id) => ipcRenderer.invoke('get-cupom', id),
  
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  copyFile: (sourcePath, destFolder, destName) => ipcRenderer.invoke('copy-file', sourcePath, destFolder, destName),
  saveBase64Image: (base64Data, destFolder, destName) => ipcRenderer.invoke('save-base64-image', base64Data, destFolder, destName),
  downloadImage: (url, destFolder, destName) => ipcRenderer.invoke('download-image', url, destFolder, destName),
  
  getMesesGastos: (pessoaId) => ipcRenderer.invoke('get-meses-gastos', pessoaId),
  getEntrada: (pessoaId, ano, mes) => ipcRenderer.invoke('get-entrada', pessoaId, ano, mes),
  setEntrada: (pessoaId, ano, mes, valor) => ipcRenderer.invoke('set-entrada', pessoaId, ano, mes, valor),
  getGastosPorCategoria: (pessoaId, ano, mes) => ipcRenderer.invoke('get-gastos-por-categoria', pessoaId, ano, mes),
  getGastosPorEstabelecimento: (pessoaId, ano, mes) => ipcRenderer.invoke('get-gastos-por-estabelecimento', pessoaId, ano, mes),
  getResumoMensal: (pessoaId, ano) => ipcRenderer.invoke('get-resumo-mensal', pessoaId, ano),
  ocrImage: (imagePath) => ipcRenderer.invoke('ocr-image', imagePath),
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  getAllGastosAnoPessoa: (pessoaId, ano) => ipcRenderer.invoke('get-all-gastos-ano-pessoa', pessoaId, ano),
  generatePDFAno: (data) => ipcRenderer.invoke('generate-pdf-ano', data),

  // Categorias
  getCategorias: () => ipcRenderer.invoke('get-categorias'),
  addCategoria: (nome) => ipcRenderer.invoke('add-categoria', nome),
  deleteCategoria: (id) => ipcRenderer.invoke('delete-categoria', id),

  // Meios de Pagamento
  getMeiosPagamento: () => ipcRenderer.invoke('get-meios-pagamento'),
  addMeioPagamento: (nome) => ipcRenderer.invoke('add-meio-pagamento', nome),
  deleteMeioPagamento: (id) => ipcRenderer.invoke('delete-meio-pagamento', id),

  updatePerfil: (id, nome, foto, whatsapp) => ipcRenderer.invoke('update-perfil', id, nome, foto, whatsapp),
  getUserById: (id) => ipcRenderer.invoke('get-user-by-id', id),
  getUserByIdPessoa: (id) => ipcRenderer.invoke('getUserByIdPessoa', id),
  sendWhatsAppAutomation: (filePath, phone, nome) => ipcRenderer.invoke('send-whatsapp-automation', filePath, phone, nome),
  
  // WhatsApp Service API
  getWaStatus: () => ipcRenderer.invoke('wa-get-status'),
  checkWaGroup: () => ipcRenderer.invoke('wa-check-group'),
  logoutWa: () => ipcRenderer.invoke('wa-logout'),
  onWaQr: (callback) => ipcRenderer.on('wa-qr', (event, qrBase64) => callback(qrBase64)),
  onWaAuth: (callback) => ipcRenderer.on('wa-auth', () => callback()),
  onWaReady: (callback) => ipcRenderer.on('wa-ready', () => callback()),
  onWaDisconnected: (callback) => ipcRenderer.on('wa-disconnected', (event, reason) => callback(reason)),
  onWaNewCupom: (callback) => ipcRenderer.on('wa-new-cupom', (event, fileName) => callback(fileName)),
  createWaGroup: (name, participants) => ipcRenderer.invoke('wa-create-group', name, participants),
  deleteWaGroup: (name) => ipcRenderer.invoke('wa-delete-group', name),
  
  // Sincronização Nuvem (Supabase)
  getCloudMessages: (userId) => ipcRenderer.invoke('get-cloud-messages', userId),
  markCloudMessageImported: (id) => ipcRenderer.invoke('mark-cloud-message-imported', id),
  activateCloudSync: (data) => ipcRenderer.invoke('activate-cloud-sync', data)
});

