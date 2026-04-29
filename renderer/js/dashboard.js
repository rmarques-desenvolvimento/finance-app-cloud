/**
 * DASHBOARD.JS - Lógica do Sistema de Controle Financeiro
 * Versão Refatorada para o novo Layout
 */

let currentPessoa = null;
let currentAno = new Date().getFullYear();
let currentMes = new Date().getMonth() + 1;
let currentUserProfile = null;
let categoriasChart = null;
let estabelecimentoChart = null;
let mensalChart = null;
let currentUnifiedList = [];
let currentTotalMes = 0; // guarda o total do mês para recalcular sub-total
let adminSelectedAno = new Date().getFullYear();
let adminSelectedMes = new Date().getMonth() + 1;
const disponiveisAnos = [2026, 2027]; // Anos permitidos no sistema

// Função global para formatar WhatsApp (11) 99999-9999
function formatWhatsApp(v) {
    if (!v) return "";
    v = v.replace(/\D/g, "");
    if (v.length > 11) v = v.substring(0, 11);
    if (v.length > 10) return "(" + v.substring(0, 2) + ") " + v.substring(2, 7) + "-" + v.substring(7, 11);
    if (v.length > 6) return "(" + v.substring(0, 2) + ") " + v.substring(2, 6) + "-" + v.substring(6, 10);
    if (v.length > 2) return "(" + v.substring(0, 2) + ") " + v.substring(2);
    if (v.length > 0) return "(" + v;
    return v;
}

// Retorna o HTML do ícone baseado no meio de pagamento
function getPaymentIcon(item) {
    const raw = item.raw || {};
    
    // Se for cartão
    if (raw.cartao_id || raw.cartao_nome) {
        if (raw.logo) {
            return `<img src="app-file://uploads/cartoes/${raw.logo}" title="${raw.cartao_nome || 'Cartão'}" onerror="this.outerHTML='<i class=\'fas fa-credit-card\' title=\'Cartão\'></i>'">`;
        }
        return `<i class="fas fa-credit-card" title="${raw.cartao_nome || 'Cartão'}"></i>`;
    }
    
    // Se for PIX
    if (raw.pix_chave) {
        return `<i class="fas fa-mobile-alt" title="PIX" style="color: var(--accent-primary);"></i>`;
    }
    
    // Padrão: Dinheiro
    return `<i class="fas fa-money-bill-wave" title="Dinheiro" style="color: #2ecc71;"></i>`;
}

// Atualiza o Sub-total na UI: Entrada - Total
function atualizarSubTotal(entradaAportada, totalOverride) {
    const total = totalOverride !== undefined ? totalOverride : currentTotalMes;
    const subTotal = entradaAportada - total;
    const subTotalEl = document.getElementById('subTotalValor');
    if (!subTotalEl) return;
    subTotalEl.value = formatCurrency(subTotal);
    
    if (subTotal < 0) {
        subTotalEl.style.color = 'var(--accent-danger)'; // Vermelho para saldo negativo
    } else {
        subTotalEl.style.color = entradaAportada > 0 ? '#AAFF00' : 'var(--accent-warning)';
    }
    
    if (totalOverride !== undefined) currentTotalMes = totalOverride;
}


// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // Configura nome do usuário
    const userName = sessionStorage.getItem('userName') || 'Usuário';
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = userName;

    // Ações em massa
    const selectAllPaga = document.getElementById('selectAllPaga');
    if (selectAllPaga) {
        selectAllPaga.addEventListener('change', async (e) => {
            if (!currentPessoa || currentUnifiedList.length === 0) return;
            const isChecked = e.target.checked;
            
            // Desabilita para evitar cliques múltiplos durante o processo
            selectAllPaga.disabled = true;
            for (const item of currentUnifiedList) {
                if (item.tipo === 'parcela') await window.api.marcarParcelaPaga(item.id, isChecked);
                else await window.api.marcarGastoPago(item.id, isChecked);
            }
            selectAllPaga.disabled = false;
            loadGastos();
        });
    }

    // Carrega dados iniciais
    await loadMyProfile();
    await loadPessoas();
    await loadAlertas();
    
    // Configura listeners
    setupEventListeners();
    setupNavigation();

    // Inicia verificação do WhatsApp e Sincronização Cloud
    checkWaStatus();
    setInterval(checkWaStatus, 60000);

    // Sincronização automática com a Nuvem (Supabase) ao entrar no App
    setTimeout(syncCloudData, 1500); 
});

function normalizePhone(phone) {
    if (!phone) return "";
    return phone.replace(/\D/g, "");
}

function setupEventListeners() {
    // Botões de Janela
    document.getElementById('minimizeBtn')?.addEventListener('click', () => window.api.minimizeWindow());
    document.getElementById('closeBtn')?.addEventListener('click', () => window.api.closeWindow());
    
    // Dashboard actions
    document.getElementById('addPessoaBtn')?.addEventListener('click', () => showModalPessoa());
    
    // Pessoa View actions
    document.getElementById('backToDashboard')?.addEventListener('click', showDashboard);
    document.getElementById('closePessoaView')?.addEventListener('click', showDashboard);
    document.getElementById('addGastoBtn')?.addEventListener('click', () => showModalGasto());
    
    // Listener para o botão de WhatsApp no topo
    document.getElementById('whatsappStatusBtn')?.addEventListener('click', () => {
        const setupNavItem = document.querySelector('.nav-item[data-view="setup"]');
        if (setupNavItem) setupNavItem.click();
        setTimeout(() => showWaModal(), 200);
    });

    document.getElementById('syncFixasBtn')?.addEventListener('click', async () => {
        if (!currentPessoa) return;
        const btn = document.getElementById('syncFixasBtn');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        await window.api.gerarDespesasFixas(currentPessoa.id, currentAno, currentMes);
        await loadGastos();
        btn.innerHTML = orig;
    });
    document.getElementById('scanCupomBtn')?.addEventListener('click', scanCupom);
    document.getElementById('btnExportarPDF')?.addEventListener('click', () => exportYearlyPDF());
    
    // Filtros de Ano e Mês
    document.getElementById('yearSelect')?.addEventListener('change', (e) => {
        currentAno = parseInt(e.target.value);
        loadGastos();
    });
    document.getElementById('monthSelect')?.addEventListener('change', (e) => {
        currentMes = parseInt(e.target.value);
        loadGastos();
    });

    // Outras Views
    document.getElementById('addCartaoBtn')?.addEventListener('click', () => showModalCartao());
    document.getElementById('addDespesaBtn')?.addEventListener('click', () => showModalDespesaFixa());
    document.getElementById('addEstabelecimentoBtn')?.addEventListener('click', () => showModalEstabelecimento());
    
    // Meu Perfil
    document.getElementById('userProfileBtn')?.addEventListener('click', () => showModalPerfil());
    
    // Modal
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    // Modal close on backdrop click (robust against text selection)
    let clickStartedOnBackdrop = false;
    window.addEventListener('mousedown', (e) => {
        clickStartedOnBackdrop = (e.target == document.getElementById('modalContainer'));
    });
    window.addEventListener('mouseup', (e) => {
        if (clickStartedOnBackdrop && e.target == document.getElementById('modalContainer')) {
            closeModal();
        }
    });

    // Alert Dismiss (Delegated)
    document.getElementById('alertsContainer')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.dismiss-alert');
        if (btn) {
            const id = btn.dataset.id;
            await window.api.marcarAlertaVisualizado(id);
            loadAlertas();
        }
    });

    // Entrada Input events
    const entradaInput = document.getElementById('entradaValorInput');
    if (entradaInput) {
        // Formata mask conforme digita — com prefixo R$
        entradaInput.addEventListener('input', function() {
            let val = this.value.replace(/\D/g, '');
            if (val === '') { this.value = ''; return; }
            const num = (parseFloat(val) / 100).toFixed(2);
            const formatted = num.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            this.value = 'R$ ' + formatted;
        });

        // Salva backend no blur
        entradaInput.addEventListener('blur', async (e) => {
            if (!currentPessoa) return;
            // Remove R$, pontos de milhar e troca vírgula por ponto para parsear
            const rawVal = e.target.value.replace(/[^\d,]/g, '').replace(',', '.');
            const floatVal = parseFloat(rawVal) || 0;

            // Reaplica formatação com prefixo R$
            e.target.value = floatVal === 0 ? '' : 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(floatVal);

            await window.api.setEntrada(currentPessoa.id, currentAno, currentMes, floatVal);
            // Recalcula o sub-total imediatamente após salvar
            atualizarSubTotal(floatVal);
        });

        entradaInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.target.blur();
        });
    }

    // Bulk PIX Payment (Versão Blindada)
    document.getElementById('payBulkPixBtn')?.addEventListener('click', () => {
        const selectedItems = [];
        const checkedBoxes = document.querySelectorAll('.expense-item:not(.paga) .toggle-paga:checked');
        
        checkedBoxes.forEach(cb => {
            selectedItems.push({
                id: cb.dataset.id,
                tipo: cb.dataset.tipo,
                valor: parseFloat(cb.dataset.valor) || 0,
                pix_chave: cb.dataset.pix,
                pix_nome: cb.dataset.pixnome,
                descricao: cb.dataset.desc || 'Pagamento'
            });
        });

        if (selectedItems.length === 0) return;

        const total = selectedItems.reduce((acc, i) => acc + i.valor, 0);
        const description = selectedItems.length === 1 ? selectedItems[0].descricao : `Pagamento Massa (${selectedItems.length} itens)`;
        const chave = selectedItems.find(i => i.pix_chave)?.pix_chave || ''; 
        const pixNome = selectedItems.find(i => i.pix_nome)?.pix_nome || ''; 

        if (!chave) {
            alert('Nenhum dos itens selecionados possui uma chave PIX cadastrada.');
            return;
        }

        showPixQRCode({
            chave,
            pix_nome: pixNome,
            valor: total,
            item: description,
            bulkIds: selectedItems.map(i => ({ id: i.id, tipo: i.tipo }))
        });
    });
}

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const view = e.currentTarget.dataset.view;
            
            // UI Update
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById('pageTitle').textContent = e.currentTarget.querySelector('span').textContent;
            
            hideAllViews();
            
            // Restaura padding padrão para outras views
            const contentArea = document.getElementById('contentArea');
            if (contentArea) {
                contentArea.style.padding = '1.75rem';
                contentArea.style.overflow = 'auto';
            }
            
            const viewEl = document.getElementById(`${view}View`);
            if (viewEl) viewEl.style.display = 'block';

            // Data Loading
            switch (view) {
                case 'dashboard': await loadPessoas(); break;
                case 'cartoes': await loadCartoes(); break;
                case 'despesas': await loadDespesasFixas(); break;
                case 'estabelecimentos': await loadEstabelecimentos(); break;
                case 'setup': await loadSetup(); break;
            }
        });
    });
}

function hideAllViews() {
    const views = ['dashboardView', 'pessoaView', 'cartoesView', 'despesasView', 'estabelecimentosView', 'setupView'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = 'none';
    });
}

function showDashboard() {
    hideAllViews();
    // Restaura o padding original do dashboard
    const contentArea = document.getElementById('contentArea');
    if (contentArea) {
        contentArea.style.padding = '1.75rem';
        contentArea.style.overflow = 'auto';
    }

    document.getElementById('dashboardView').style.display = 'block';
    document.getElementById('pageTitle').textContent = 'Dashboard';
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector('[data-view="dashboard"]')?.classList.add('active');
    loadPessoas();
}

// MEU PERFIL (ADMIN)
async function loadMyProfile() {
    try {
        const userId = sessionStorage.getItem('userId') || 1;
        console.log('[PERFIL] Carregando perfil para o ID:', userId);
        const user = await window.api.getUserById(parseInt(userId));
        
        if (user) {
            currentUserProfile = user;
            const label = document.getElementById('userNameLabel');
            if (label) label.textContent = user.nome || 'Usuário';
            
            const avatar = document.getElementById('userAvatar');
            if (avatar) {
                if (user.foto) {
                    avatar.innerHTML = `<img src="app-file://uploads/perfil/${user.foto}" style="width:100%; height:100%; object-fit:cover; display:block; border-radius:50%;">`;
                } else {
                    avatar.innerHTML = `<i class="fas fa-user-circle"></i>`;
                }
            }
        } else {
            console.warn('[PERFIL] Nenhum usuário encontrado para o ID:', userId);
        }
    } catch (err) {
        console.error('[PERFIL] Erro ao carregar perfil:', err);
    }
}

async function showModalPerfil() {
    const userId = sessionStorage.getItem('userId') || 1;
    
    // Se não tiver o perfil em memória, tenta carregar agora
    if (!currentUserProfile) {
        showLoading('Carregando seu perfil...');
        await loadMyProfile();
        hideLoading();
    }
    
    if (!currentUserProfile) {
        Swal.fire('Erro', 'Não foi possível carregar os dados do seu usuário (ID: ' + userId + ').', 'error');
        return;
    }
    
    showModal('Meu Perfil', `
        <form id="perfilForm">
            <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 2rem;">
                <div class="user-avatar" id="editUserAvatar" style="width: 100px; height: 100px; font-size: 3rem; margin-bottom: 1rem; cursor: pointer; background: var(--primary-gradient); color: white; display:flex; align-items:center; justify-content:center; border-radius:50%; overflow:hidden;" title="Clique para trocar foto">
                     ${currentUserProfile.foto ? `<img src="app-file://uploads/perfil/${currentUserProfile.foto}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-camera"></i>`}
                </div>
                <span style="font-size: 0.8rem; color: var(--text-muted);">Clique na foto para escolher uma nova</span>
            </div>
            
            <div class="form-row" style="display: flex; gap: 1rem;">
                <div class="form-group" style="flex: 1;">
                    <label>Meu Nome Completo</label>
                    <input type="text" id="pNome" class="form-control" value="${currentUserProfile.nome || ''}" required placeholder="Seu nome aqui...">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Seu WhatsApp</label>
                    <input type="text" id="pWhatsApp" class="form-control" value="${currentUserProfile.whatsapp || ''}" placeholder="(11) 99999-9999">
                </div>
            </div>

            <div class="modal-actions" style="display: flex; gap: 0.75rem; align-items: center;">
                <button type="button" class="btn btn-secondary" id="adminDataBtn" style="margin-right: auto; background: rgba(99, 102, 241, 0.1); border: 1px solid var(--accent-primary); color: var(--accent-primary);">
                    <i class="fas fa-shield-alt"></i> Dados do Administrador
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="savePerfilBtn">Salvar Perfil</button>
            </div>
        </form>
    `);

    // Botão Dados do Administrador
    document.getElementById('adminDataBtn').onclick = async () => {
        const btn = document.getElementById('adminDataBtn');
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
        
        try {
            await handleOpenAdminView();
        } catch (err) {
            console.error(err);
            alert("Erro ao carregar dados administrativos: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    };

    let novaFotoPath = null;
    document.getElementById('editUserAvatar').onclick = async () => {
        const file = await window.api.selectFile({
            filters: [{ name: 'Imagens', extensions: ['jpg', 'png', 'jpeg'] }]
        });
        if (file) {
            novaFotoPath = file;
            document.getElementById('editUserAvatar').innerHTML = `<img src="app-file://${file}" style="width:100%; height:100%; object-fit:cover; border-radius: 50%;">`;
        }
    };

    document.getElementById('perfilForm').onsubmit = async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('savePerfilBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const nome = document.getElementById('pNome').value;
            const whatsapp = document.getElementById('pWhatsApp').value;
            let fotoNome = currentUserProfile.foto;

            if (novaFotoPath) {
                const ext = novaFotoPath.split('.').pop();
                const novoNome = `perfil_${Date.now()}.${ext}`;
                await window.api.copyFile(novaFotoPath, 'perfil', novoNome);
                fotoNome = novoNome;
            }

            await window.api.updatePerfil(currentUserProfile.id, nome, fotoNome, whatsapp.replace(/\D/g, ''));
            saveBtn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
            
            setTimeout(async () => {
                closeModal();
                await loadMyProfile();
            }, 800);
        } catch (err) {
            alert("Erro ao salvar perfil: " + err.message);
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Salvar Perfil';
        }
    };

    // Máscara de Telefone (11)99999-9999
    const waInput = document.getElementById('pWhatsApp');
    const applyMask = (v) => {
        v = v.replace(/\D/g, "");
        if (v.length > 11) v = v.substring(0, 11);
        if (v.length > 10) {
            return "(" + v.substring(0, 2) + ") " + v.substring(2, 7) + "-" + v.substring(7, 11);
        } else if (v.length > 6) {
            return "(" + v.substring(0, 2) + ") " + v.substring(2, 6) + "-" + v.substring(6, 10);
        } else if (v.length > 2) {
            return "(" + v.substring(0, 2) + ") " + v.substring(2);
        } else if (v.length > 0) {
            return "(" + v;
        }
        return v;
    };
    
    if (waInput.value) waInput.value = applyMask(waInput.value);

    waInput.addEventListener('input', (e) => {
        e.target.value = applyMask(e.target.value);
    });
}

/**
 * Coleta e consolida dados de todas as pessoas para abrir a visão administrativa
 */
async function handleOpenAdminView() {
    const pessoas = await window.api.getPessoas();
    const allExpenses = [];
    const summaryData = {}; // { 'Meio Pagto': { 'Pessoa': total } }
    const peopleNames = pessoas.map(p => p.nome);

    for (const p of pessoas) {
        // Busca gastos e parcelas do mês
        const gastos = await window.api.getGastosPessoa(p.id, currentAno, currentMes);
        const parcelas = await window.api.getParcelasPessoa(p.id, currentAno, currentMes);
        
        const combined = [
            ...gastos.map(g => ({ ...g, type: 'gasto', personName: p.nome })),
            ...parcelas.map(parc => ({ ...parc, type: 'parcela', personName: p.nome }))
        ];

        for (const exp of combined) {
            allExpenses.push(exp);
            
            const method = getPaymentName(exp);
            if (!summaryData[method]) summaryData[method] = {};
            if (!summaryData[method][p.nome]) summaryData[method][p.nome] = 0;
            summaryData[method][p.nome] += exp.valor;
        }
    }

    // Fecha o modal de perfil antes de abrir o de detalhes admin
    closeModal();
    
    // Pequeno delay para a animação de fechar/abrir fluir melhor
    setTimeout(() => {
        openAdminDetails(allExpenses, summaryData, peopleNames);
    }, 300);
}


/** -----------------------------------------------------------
 * PESSOAS
 * ----------------------------------------------------------- */

function createYearlyTable(data, ano, pessoaId = null) {
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    // Mapeia os dados recebidos (meses em formato '01', '02', etc)
    const valuesMap = {};
    const statusMap = {};
    const alertMap = {};
    data.forEach(d => {
        valuesMap[parseInt(d.mes)] = d.total;
        statusMap[parseInt(d.mes)] = d.todos_pagos;
        alertMap[parseInt(d.mes)] = d.alerta_status || 0;
    });
    
    let html = `
        <table class="yearly-table">
            <thead>
                <tr>
                    <th colspan="4">Dados do ano de ${ano}</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    months.forEach((m, i) => {
        const monthIndex = i + 1;
        const value = valuesMap[monthIndex];
        const todosPagos = statusMap[monthIndex];
        const alertStatus = alertMap[monthIndex];
        
        let displaySymbol = '<span style="color:var(--text-muted)">-</span>';
        let displayValue = '<span style="color:var(--text-muted)">-</span>';
        
        if (value) {
            displaySymbol = 'R$';
            displayValue = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
        }
        
        // Determina a classe da linha baseada nos alertas
        let rowClass = 'yearly-row';
        if (value > 0 && todosPagos === 1) {
            rowClass += ' row-paid';
        } else if (alertStatus === 2) {
            rowClass += ' dash-row-vencido';
        } else if (alertStatus === 1) {
            rowClass += ' dash-row-vencendo';
        }
        
        html += `
            <tr class="${rowClass}" data-month="${monthIndex}" style="cursor:pointer;" title="Ver detalhes de ${m}">
                <td class="month-col">${m}</td>
                <td class="symbol-col">${displaySymbol}</td>
                <td class="value-col">${displayValue}</td>
                <td style="text-align:right; width:85px; white-space:nowrap;">
                    <button class="btn-pdf-table" onclick="event.stopPropagation(); exportYearlyPDF(${pessoaId}, ${monthIndex}, ${ano}, this)" title="Gerar PDF de ${m}" style="display: inline-block; padding: 2px;">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    <button class="btn-whatsapp-table" onclick="event.stopPropagation(); sendPDFWhatsApp(${pessoaId}, ${monthIndex}, ${ano}, this)" title="Enviar via WhatsApp" style="display: inline-block; padding: 2px; color: #25D366; background:transparent; border:none; cursor:pointer; font-size:1.1rem;">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    return html;
}

// Retorna o nome amigável do meio de pagamento
function getPaymentName(item) {
    const raw = item.raw || item;
    if (raw.cartao_nome) {
        const cn = raw.cartao_nome.toLowerCase();
        if (cn === 'mercado pago' || cn === 'mercadopago') return 'Mercado Pago';
        return raw.cartao_nome;
    }
    if (raw.pix_chave) return "PIX";
    return "Dinheiro/Outros";
}

async function loadPessoas() {
    const grid = document.getElementById('peopleGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading-spinner"></div>';
    const pessoas = await window.api.getPessoas();
    grid.innerHTML = '';
    
    if (pessoas.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Nenhuma pessoa cadastrada.</p></div>';
        return;
    }

    for (const pessoa of pessoas) {
        const total = await window.api.getTotalGastosPessoa(pessoa.id, currentAno, currentMes);
        const yearlyData = await window.api.getResumoMensal(pessoa.id, currentAno);
        
        const card = document.createElement('div');
        card.className = 'person-card';
        card.innerHTML = `
            <div class="person-card-actions">
                <button class="btn-icon edit-pessoa" data-id="${pessoa.id}"><i class="fas fa-pen"></i></button>
                <button class="btn-icon delete-pessoa" data-id="${pessoa.id}"><i class="fas fa-trash"></i></button>
            </div>
            <img src="${pessoa.foto ? `app-file://uploads/pessoas/${pessoa.foto}` : '../../assets/icons/default-avatar.png'}" 
                 class="person-card-photo" onerror="this.src='../../assets/icons/default-avatar.png'">
            <div class="person-card-name">${pessoa.nome}</div>
            <div class="person-card-label">Gastos deste mês</div>
            <div class="person-card-total">${formatCurrency(total)}</div>
            <div class="person-card-yearly">${createYearlyTable(yearlyData, currentAno, pessoa.id)}</div>
        `;
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.person-card-actions') && !e.target.closest('.person-card-yearly')) openPessoa(pessoa);
        });

        // Clique nas linhas da tabela anual
        card.querySelectorAll('.yearly-row').forEach(row => {
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                const m = parseInt(row.getAttribute('data-month'));
                openPessoa(pessoa, m, currentAno);
            });
        });

        // Eventos de edição/exclusão
        card.querySelector('.edit-pessoa').addEventListener('click', (e) => {
            e.stopPropagation();
            showModalPessoa(pessoa);
        });
        card.querySelector('.delete-pessoa').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Excluir todos os dados de ${pessoa.nome}?`)) {
                await window.api.deletePessoa(pessoa.id);
                loadPessoas();
            }
        });

        grid.appendChild(card);
    }

    // Carrega/Atualiza o card do Administrador no final do grid
    await refreshAdminCard();
}

async function refreshAdminCard() {
    const card = document.getElementById('adminCard');
    if (card) {
        card.remove();
    }
    return;
}

function renderAdminCard(card, summaryData, peopleNames, allExpenses) {
    // Total geral
    let totalGeral = 0;
    Object.values(summaryData).forEach(personMap => {
        Object.values(personMap).forEach(val => totalGeral += val);
    });

    // Totais por pessoa
    const personTotals = {};
    peopleNames.forEach(name => personTotals[name] = 0);
    Object.entries(summaryData).forEach(([method, persons]) => {
        Object.entries(persons).forEach(([name, val]) => {
            personTotals[name] = (personTotals[name] || 0) + val;
        });
    });

    // Ordena métodos de pagamento
    const paymentOrder = { 'nubank': 1, 'mercado pago': 2, 'mercadopago': 2, 'pix': 3, 'dinheiro/outros': 4 };
    const paymentMethods = Object.keys(summaryData).sort((a, b) => {
        const rankA = paymentOrder[a.toLowerCase()] || 50;
        const rankB = paymentOrder[b.toLowerCase()] || 50;
        if (rankA !== rankB) return rankA - rankB;
        return a.localeCompare(b, 'pt-BR');
    });

    // Monta tabela sumário
    let tableHtml = '<table class="yearly-table admin-summary-table"><thead><tr><th>Formação de Pagamento</th>';
    peopleNames.forEach(name => { tableHtml += `<th>${name.toUpperCase()}</th>`; });
    tableHtml += '<th>SUBTOTAL</th></tr></thead><tbody>';

    paymentMethods.forEach(method => {
        let methodTotal = 0;
        tableHtml += `<tr><td class="month-col">${method}</td>`;
        peopleNames.forEach(name => {
            const val = summaryData[method][name] || 0;
            methodTotal += val;
            tableHtml += `<td class="value-col"><div>${val > 0 ? formatCurrencyExcel(val) : '<span style="color:var(--text-muted)">-</span>'}</div></td>`;
        });
        tableHtml += `<td class="value-col subtotal-col"><div>${formatCurrencyExcel(methodTotal)}</div></td></tr>`;
    });

    // Linha de totais
    tableHtml += '<tr class="total-row"><td class="month-col"><strong>TOTAL GERAL</strong></td>';
    peopleNames.forEach(name => {
        tableHtml += `<td class="value-col"><div>${formatCurrencyExcel(personTotals[name] || 0)}</div></td>`;
    });
    tableHtml += `<td class="value-col"><div>${formatCurrencyExcel(totalGeral)}</div></td></tr></tbody></table>`;

    // Opções de Meses e Anos
    const monthsNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthOptions = monthsNames.map((m, i) => `<option value="${i+1}" ${adminSelectedMes === i+1 ? 'selected' : ''}>${m}</option>`).join('');
    
    let yearOptions = disponiveisAnos.map(y => `<option value="${y}" ${adminSelectedAno === y ? 'selected' : ''}>${y}</option>`).join('');

    // Avatar: foto do Admin ou ícone
    let avatarHtml;
    if (currentUserProfile?.foto) {
        avatarHtml = `<img src="app-file://uploads/perfil/${currentUserProfile.foto}" style="width:68px;height:68px;border-radius:50%;object-fit:cover;border:2px solid rgba(99,102,241,0.5);margin-bottom:1rem;" onerror="this.style.display='none'">`;
    } else {
        avatarHtml = `<div style="width:68px;height:68px;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;font-size:2rem;margin-bottom:1rem;border:2px solid rgba(99,102,241,0.5);"><i class="fas fa-user-shield" style="color:white;"></i></div>`;
    }

    card.innerHTML = `
        <div class="admin-card-actions">
            <i class="fas fa-shield-alt" style="color:var(--accent-primary);font-size:1.2rem;"></i>
        </div>
        ${avatarHtml}
        <div class="person-card-name" style="color:var(--accent-tertiary);">Ricardo</div>
        
        <!-- Filtros de Ano/Mês -->
        <div class="admin-date-selector" style="display:flex; gap:8px; margin-bottom:1.25rem; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-size:0.55rem; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; padding-left:2px;">ANO</span>
                <select class="form-control admin-year-select" style="width:85px; height:45px; font-size:0.95rem; padding:0 8px; border-radius:6px; background:rgba(0,0,0,0.2);">${yearOptions}</select>
            </div>
            <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-size:0.55rem; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; padding-left:2px;">MÊS</span>
                <select class="form-control admin-month-select" style="width:120px; height:45px; font-size:0.95rem; padding:0 8px; border-radius:6px; background:rgba(0,0,0,0.2);">${monthOptions}</select>
            </div>
        </div>

        <div class="person-card-label" style="font-size:0.75rem;">Total Consolidado — ${adminSelectedMes}/${adminSelectedAno}</div>
        <div class="person-card-total" style="background:var(--gradient-cool);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-size:1.6rem;font-weight:800;margin-bottom:1.5rem;">${formatCurrency(totalGeral)}</div>
        <div class="person-card-yearly">${tableHtml}</div>
    `;

    // Listeners dos seletores
    card.querySelector('.admin-year-select').addEventListener('change', (e) => {
        adminSelectedAno = parseInt(e.target.value);
        refreshAdminCard();
    });
    card.querySelector('.admin-month-select').addEventListener('change', (e) => {
        adminSelectedMes = parseInt(e.target.value);
        refreshAdminCard();
    });

    card.onclick = (e) => {
        // Não abre modal se clicar na tabela de resumo ou nos seletores
        if (!e.target.closest('.admin-summary-table') && !e.target.closest('.admin-date-selector')) {
            openAdminDetails(allExpenses, summaryData, peopleNames);
        }
    };
}

async function openAdminDetails(allExpenses, summaryData, peopleNames) {
    // Busca cartões para pegar as logos
    const cartoes = await window.api.getCartoes();
    const cartaoLogos = {};
    cartoes.forEach(c => cartaoLogos[c.nome.toLowerCase()] = c.logo);

    // Totais
    let totalGeral = 0;
    const personTotals = {};
    peopleNames.forEach(name => personTotals[name] = 0);
    Object.entries(summaryData).forEach(([method, persons]) => {
        Object.entries(persons).forEach(([name, val]) => {
            totalGeral += val;
            personTotals[name] = (personTotals[name] || 0) + val;
        });
    });

    // Ordem dos métodos de pagamento
    const paymentOrder = { 'nubank': 1, 'mercado pago': 2, 'mercadopago': 2, 'pix': 3, 'dinheiro/outros': 4 };

    // Agrupa despesas por método → pessoa
    const grouped = {};
    allExpenses.forEach(exp => {
        const pay = getPaymentName(exp);
        if (!grouped[pay]) grouped[pay] = {};
        if (!grouped[pay][exp.personName]) grouped[pay][exp.personName] = [];
        grouped[pay][exp.personName].push(exp);
    });

    const sortedPeople = [...peopleNames].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Cabeçalho — resumo de totais moderno
    let html = `<div class="admin-details-view">
        <div class="admin-details-summary">
            <div class="summary-stat highlight">
                <div class="stat-label">TOTAL GERAL</div>
                <div class="stat-value">${formatCurrency(totalGeral)}</div>
            </div>
            ${sortedPeople.map(name => `
                <div class="summary-stat">
                    <div class="stat-label">${name}</div>
                    <div class="stat-value">${formatCurrency(personTotals[name] || 0)}</div>
                </div>
            `).join('')}
        </div>
        <div>`;

    if (allExpenses.length === 0) {
        html += '<p style="text-align:center;padding:4rem;color:var(--text-muted);background:rgba(0,0,0,0.2);border-radius:12px;">Nenhum gasto neste período.</p>';
    } else {
        const sortedMethods = Object.keys(grouped).sort((a, b) => {
            const ra = paymentOrder[a.toLowerCase()] || 50;
            const rb = paymentOrder[b.toLowerCase()] || 50;
            if (ra !== rb) return ra - rb;
            return a.localeCompare(b, 'pt-BR');
        });

        sortedMethods.forEach(method => {
            const personsMap = grouped[method];
            let methodTotal = 0;
            Object.values(personsMap).forEach(arr => arr.forEach(e => methodTotal += e.valor));

            // Determina visual do cabeçalho (Logo ou Ícone)
            const ml = method.toLowerCase();
            const logoFile = cartaoLogos[ml];
            let visualHtml = '';

            if (logoFile) {
                visualHtml = `<div class="method-visual"><img src="app-file://uploads/cartoes/${logoFile}" class="logo-img" onerror="this.outerHTML='<i class=\'fas fa-credit-card\'></i>'"></div>`;
            } else {
                let iconClass = 'fas fa-credit-card';
                let iconColor = 'var(--accent-primary)';
                if (ml === 'pix') { iconClass = 'fas fa-mobile-alt'; iconColor = '#10b981'; }
                else if (ml.includes('dinheiro')) { iconClass = 'fas fa-money-bill-wave'; iconColor = '#f59e0b'; }
                visualHtml = `<div class="method-visual"><i class="${iconClass}" style="color:${iconColor};"></i></div>`;
            }

            html += `<div class="admin-details-section">
                <div class="admin-details-section-header">
                    ${visualHtml}
                    <span class="method-name">${method}</span>
                    <span class="section-total">${formatCurrency(methodTotal)}</span>
                </div>`;

            Object.keys(personsMap).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(personName => {
                const expenses = personsMap[personName].slice().sort((a, b) => new Date(a.data) - new Date(b.data));
                const personTotal = expenses.reduce((s, e) => s + e.valor, 0);

                html += `<div class="admin-details-subsection">
                    <div class="admin-details-person-header">
                        <span class="person-name">${personName}</span>
                        <span class="person-total">${formatCurrency(personTotal)}</span>
                    </div>
                    <table class="admin-expense-table">
                        <tbody>`;
                
                expenses.forEach(item => {
                    html += `<tr>
                        <td class="expense-desc">
                            ${item.descricao}
                            ${item.is_parcelado ? ' <span class="parcela-badge"><i class="fas fa-calendar-alt"></i></span>' : ''}
                        </td>
                        <td class="expense-date" style="white-space:nowrap;">${formatDate(item.data)}</td>
                        <td class="expense-value" style="font-weight:700;">${formatCurrency(item.valor)}</td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="btn-icon admin-edit-expense" 
                                data-id="${item.id}" 
                                data-type="${item.type}" 
                                data-gasto-id="${item.gasto_id || ''}"
                                data-pessoa-id="${item.pessoa_id}"
                                title="Editar">
                                <i class="fas fa-edit" style="font-size:0.9rem;"></i>
                            </button>
                            <button class="btn-icon admin-delete-expense" 
                                data-id="${item.id}" 
                                data-type="${item.type}" 
                                data-gasto-id="${item.gasto_id || ''}"
                                title="Excluir">
                                <i class="fas fa-trash" style="font-size:0.9rem;"></i>
                            </button>
                        </td>
                    </tr>`;
                });
                
                html += `</tbody></table></div>`;
            });

            html += '</div>'; // section (admin-details-section)
        });
    }

    html += `</div>
        <div class="modal-actions" style="margin-top:1rem;display:flex;justify-content:center;">
            <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
        </div>
    </div>`;

    showModal(`Detalhamento Consolidado — ${adminSelectedMes}/${adminSelectedAno}`, html, 'xl');

    // Adiciona Listeners no Modal do Administrador (Pós-renderização)
    const modalBody = document.getElementById('modalBody');
    
    // Listeners de Edição no Admin
    modalBody.querySelectorAll('.admin-edit-expense').forEach(btn => {
        btn.onclick = async () => {
            const id = btn.dataset.id;
            const type = btn.dataset.type;
            const personId = btn.dataset.pessoaId;
            const gastoId = btn.dataset.gastoId;

            // Define a pessoa atual para o modal funcionar
            const pessoas = await window.api.getPessoas();
            const pessoa = pessoas.find(p => p.id == personId);
            if (pessoa) currentPessoa = pessoa;

            if (type === 'parcela') {
                const parent = await window.api.getGastoPorId(gastoId);
                if (parent) showModalGasto(parent);
            } else {
                const gasto = allExpenses.find(e => e.id == id && e.type === 'direto');
                if (gasto) showModalGasto(gasto);
            }
        };
    });

    // Listeners de Exclusão no Admin
    modalBody.querySelectorAll('.admin-delete-expense').forEach(btn => {
        btn.onclick = async () => {
            const id = btn.dataset.id;
            const type = btn.dataset.type;
            const gastoId = btn.dataset.gastoId;

            const targetId = type === 'parcela' ? gastoId : id;
            let msg = type === 'parcela' ? 'Deseja excluir TODO o parcelamento desta compra?' : 'Deseja excluir este gasto?';
            
            if (confirm(msg)) {
                await window.api.deleteGasto(targetId);
                closeModal();
                refreshAdminCard(); // Recarrega o card do admin
                if (currentPessoa && currentPessoa.id == btn.dataset.pessoaId) loadGastos(); // Recarrega lista se for a pessoa aberta
            }
        };
    });
}

async function openPessoa(pessoa, mesManual = null, anoManual = null) {
    currentPessoa = pessoa;
    if (mesManual !== null) currentMes = mesManual;
    if (anoManual !== null) currentAno = anoManual;
    hideAllViews();
    
    // Removemos o padding da content-area para o header colar no topo perfeitamente
    const contentArea = document.getElementById('contentArea');
    if (contentArea) {
        contentArea.style.padding = '0';
        contentArea.style.overflow = 'hidden';
    }

    document.getElementById('pessoaView').style.display = 'flex';
    document.getElementById('pessoaView').style.flexDirection = 'column';
    document.getElementById('pessoaView').style.height = 'calc(100vh - 56px)';
    document.getElementById('pessoaView').style.overflow = 'hidden';
    document.getElementById('pessoaNome').textContent = pessoa.nome;
    document.getElementById('pageTitle').textContent = `Finanças: ${pessoa.nome}`;
    
    const fotoEl = document.getElementById('pessoaFoto');
    if (fotoEl) fotoEl.src = pessoa.foto ? `app-file://uploads/pessoas/${pessoa.foto}` : '../../assets/icons/default-avatar.png';
    
    // Configura selectors de Ano e Mês separados
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    if (yearSelect && monthSelect) {
        // Busca o maior ano com dados para esta pessoa
        yearSelect.innerHTML = '';
        disponiveisAnos.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            if (y === currentAno) opt.selected = true;
            yearSelect.appendChild(opt);
        });

        // Gera Meses
        monthSelect.innerHTML = '';
        const monthNames = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        monthNames.forEach((name, idx) => {
            const opt = document.createElement('option');
            opt.value = idx + 1;
            opt.textContent = name;
            if (idx + 1 === currentMes) opt.selected = true;
            monthSelect.appendChild(opt);
        });
    }

    // Carrega os dados automaticamente
    await loadGastos();
}

/** -----------------------------------------------------------
 * GASTOS E PARCELAS
 * ----------------------------------------------------------- */

async function loadGastos() {
    if (!currentPessoa) return;
    
    // Auto-gera despesas fixas silenciosamente se necessário
    try {
        await window.api.gerarDespesasFixasSilencioso(currentPessoa.id, currentAno, currentMes);
    } catch(e) { console.error("Erro no auto-gerar", e); }
    
    const gastosList = document.getElementById('gastosList');
    if (!gastosList) return;

    // 1. Load Gastos Diretos (Apenas os que NÃO são parcelados para evitar duplicidade)
    const gastos = await window.api.getGastosPessoa(currentPessoa.id, currentAno, currentMes);
    // 2. Load Parcelas deste mês
    const parcelas = await window.api.getParcelasPessoa(currentPessoa.id, currentAno, currentMes);
    
    // Unificamos as listas para exibição
    let unifiedList = [];
    
    // Adicionamos gastos diretos (is_parcelado == 0)
    gastos.forEach(g => {
        if (!g.is_parcelado) {
            unifiedList.push({
                id: g.id,
                tipo: 'direto',
                descricao: g.descricao,
                valor: g.valor,
                data: g.data,
                paga: g.paga,
                meta: g.estabelecimento_nome || 'Local não informado',
                raw: g
            });
        }
    });
    
    // Adicionamos as parcelas
    parcelas.forEach(p => {
        unifiedList.push({
            id: p.id,
            gasto_id: p.gasto_id,
            tipo: 'parcela',
            descricao: p.descricao,
            valor: p.valor,
            data: p.data,
            paga: p.paga,
            meta: (p.cartao_nome || 'Cartão') + ` • Parcela ${p.numero_parcela}`,
            raw: p
        });
    });
    
    // Ordenar: Primeiro os NÃO pagos, depois os pagos. Dentro de cada grupo, pela data (mais recente primeiro)
    unifiedList.sort((a, b) => {
        if (a.paga !== b.paga) {
            return a.paga - b.paga; // 0 (não pago) vem antes de 1 (pago)
        }
        return new Date(b.data) - new Date(a.data);
    });
    
    // Guardamos a lista unificada globalmente para uso em outras funções (como bulk actions)
    currentUnifiedList = unifiedList;

    // Limpamos a lista visual antes de renderizar
    gastosList.innerHTML = '';

    // Sincroniza o checkbox de "Marcar Todos"
    const selectAll = document.getElementById('selectAllPaga');
    if (selectAll) {
        const allPaid = unifiedList.length > 0 && unifiedList.every(i => i.paga);
        selectAll.checked = allPaid;
        document.getElementById('bulkActionsContainer').style.display = unifiedList.length > 0 ? 'flex' : 'none';
    }
    
    gastosList.innerHTML = '';

    if (unifiedList.length === 0) {
        gastosList.innerHTML = '<div class="empty-state"><p>Nenhum gasto ou parcela para este mês.</p></div>';
    } else {
        unifiedList.forEach(item => {
            const el = document.createElement('div');
            
            // Lógica de Vencimento
            let statusClass = '';
            if (item.paga) {
                statusClass = 'paga';
            } else {
                const todayStr = new Date().toISOString().split('T')[0];
                const itemDateStr = item.data; // Formato YYYY-MM-DD
                
                if (itemDateStr <= todayStr) {
                    statusClass = 'vencido';
                } else {
                    // Verifica se está dentro de 3 dias
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const itemDate = new Date(itemDateStr.split('-')[0], itemDateStr.split('-')[1]-1, itemDateStr.split('-')[2]);
                    const diffDays = Math.ceil((itemDate - today) / (1000 * 60 * 60 * 24));
                    if (diffDays <= 3) statusClass = 'vencendo';
                }
            }

            el.className = `expense-item ${statusClass}`;
            el.innerHTML = `
                <div class="expense-status-check">
                    <input type="checkbox" class="toggle-paga" 
                        data-id="${item.id}" 
                        data-tipo="${item.tipo}" 
                        data-valor="${item.valor}" 
                        data-pix="${item.raw?.pix_chave || ''}"
                        data-pixnome="${item.raw?.pix_nome || ''}"
                        data-desc="${item.descricao}"
                        ${item.paga ? 'checked' : ''} title="Marcar como Pago">
                </div>
                <div class="expense-info">
                    <div class="expense-desc">
                        ${item.tipo === 'parcela' ? '<i class="fas fa-calendar-check" style="font-size: 0.7rem; color: var(--accent-secondary); margin-right: 5px;"></i>' : ''}
                        <div style="font-size: 1rem;">
                            <span style="font-weight: 700;">${(item.raw?.estabelecimento_nome || item.raw?.descricao_pdf || '').split(' - ')[0]} - </span>
                            ${item.descricao.includes(' - ') && (item.descricao.startsWith(item.raw?.estabelecimento_nome) || item.descricao.startsWith(item.raw?.descricao_pdf)) ? item.descricao.split(' - ').slice(1).join(' - ') : item.descricao} 
                            ${item.raw?.quantidade > 1 ? `<span style="color:var(--text-muted); font-size:0.75rem;">(x${item.raw.count || item.raw.quantidade || 1})</span>` : ''}
                        </div>
                    </div>
                    <div class="expense-meta">
                        ${item.meta} • ${formatDate(item.data)}
                    </div>
                    ${item.raw?.observacao ? `
                        <div style="font-size: 0.8rem; color: var(--accent-secondary); font-style: italic; margin-top: 4px; width: 100%;">
                            <i class="fas fa-comment-dots" style="font-size: 0.7rem; margin-right: 4px; opacity: 0.7;"></i>
                            ${item.raw.observacao}
                        </div>
                    ` : ''}
                </div>
                <div class="expense-informant" title="Cadastrado por: ${item.raw?.cadastrado_por || 'Sistema'}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; border-left: 1px solid var(--border-color); background: rgba(255, 255, 255, 0.01);">
                    <span style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Informante</span>
                    <span style="font-size: 0.85rem; font-weight: 700; color: var(--accent-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;">
                        <i class="fas fa-user-pen" style="font-size: 0.7rem; margin-right: 3px;"></i>
                        ${item.raw?.cadastrado_por || 'Sistema'}
                    </span>
                </div>
                <div class="expense-card-icon">
                    ${getPaymentIcon(item)}
                </div>
                <div class="expense-value currency-excel">${formatCurrencyExcel(item.valor)}</div>
                <div class="expense-actions">
                    ${item.raw?.pix_chave ? `<button class="btn-icon pay-pix" data-id="${item.id}" title="Pagar com PIX"><i class="fas fa-qrcode" style="color:var(--accent-primary); font-size: 1.1rem;"></i></button>` : ''}
                    ${item.raw?.cupom_id ? `<button class="btn-icon view-cupom" data-id="${item.raw.cupom_id}" title="Ver Comprovante"><i class="fas fa-receipt" style="color:var(--accent-secondary);"></i></button>` : ''}
                    ${item.raw?.foto ? `<button class="btn-icon view-foto" data-foto="${item.raw.foto}" title="Ver Foto"><i class="fas fa-camera" style="color:var(--accent-primary);"></i></button>` : ''}
                    <button class="btn-icon edit-item" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-item" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            `;
            
            // Toggle Pago (Marcação imediata)
            const check = el.querySelector('.toggle-paga');
            check.addEventListener('change', async (e) => {
                const isChecked = e.target.checked;
                
                // Marca no banco de dados imediatamente
                if (item.tipo === 'parcela') {
                    await window.api.marcarParcelaPaga(item.id, isChecked);
                } else {
                    await window.api.marcarGastoPago(item.id, isChecked);
                }

                // Se houver checkbox selecionado, atualiza a barra de PIX em massa para conveniência
                updateBulkSelection();
                
                // Recarrega a lista para mostrar a nova cor (verde) e atualizar totais
                loadGastos();
            });

            // Função interna para atualizar a barra de soma (Versão Aprimorada)
            function updateBulkSelection() {
                const checkedBoxes = document.querySelectorAll('.expense-item:not(.paga) .toggle-paga:checked');
                let total = 0;
                let count = 0;

                checkedBoxes.forEach(cb => {
                    const val = parseFloat(cb.dataset.valor) || 0;
                    total += val;
                    count++;
                });

                const bulkContainer = document.getElementById('selectedCountContainer');
                if (count > 0) {
                    bulkContainer.style.display = 'flex';
                    document.getElementById('selectedTotal').textContent = formatCurrency(total);
                    document.getElementById('selectedCount').textContent = count;
                } else {
                    bulkContainer.style.display = 'none';
                }
            }

            // Botão PIX Rápido
            if (item.raw?.pix_chave) {
                el.querySelector('.pay-pix').addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Mock de um objeto que o showPixQRCode entende
                    // Criamos um modal temporário invisível se necessário para ler os dados
                    // Mas facilitaremos passando os dados diretamente para uma versão melhorada
                    showPixQRCode({
                        chave: item.raw.pix_chave,
                        pix_nome: item.raw.pix_nome,
                        valor: item.valor,
                        item: item.descricao
                    });
                });
            }

            // Edição
            el.querySelector('.edit-item').addEventListener('click', async () => {
                if (item.tipo === 'parcela') {
                    // Busca o gasto original pelo ID
                    const parent = await window.api.getGastoPorId(item.gasto_id);
                    if (parent) showModalGasto(parent);
                    else alert("Gasto original não encontrado.");
                } else {
                    showModalGasto(item.raw);
                }
            });

            if (item.raw?.cupom_id) {
                el.querySelector('.view-cupom').addEventListener('click', (e) => {
                    e.stopPropagation();
                    showCupom(item.raw.cupom_id);
                });
            }

            if (item.raw?.foto) {
                el.querySelector('.view-foto').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const foto = e.currentTarget.dataset.foto;
                    showFotoGasto(foto);
                });
            }

            // Exclusão
            const deleteBtn = el.querySelector('.delete-item');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    const targetId = item.tipo === 'parcela' ? item.gasto_id : item.id;
                    let msg = item.tipo === 'parcela' ? 'Deseja excluir TODO o parcelamento desta compra?' : 'Deseja excluir este gasto?';
                    
                    if (item.raw?.despesa_fixa_id) {
                        msg = 'Este gasto é uma DESPESA FIXA automática. Se você deletar, ele poderá ser gerado novamente ao recarregar as fixas do mês. Deseja mesmo excluir deste mês?';
                    }
                    
                    if (confirm(msg)) {
                        await window.api.deleteGasto(targetId);
                        loadGastos();
                    }
                });
            }
            
            gastosList.appendChild(el);
        });
    }

    const totalCompleto = await window.api.getTotalGastosPessoa(currentPessoa.id, currentAno, currentMes);
    document.getElementById('totalMes').innerHTML = formatCurrency(totalCompleto);
    
    // Carrega o Input de Entrada
    const entradaAportada = await window.api.getEntrada(currentPessoa.id, currentAno, currentMes) || 0;
    document.getElementById('entradaValorInput').value = entradaAportada > 0
        ? 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(entradaAportada)
        : '';

    // Sub-total = Total - Entrada (quanto falta após o adiantamento)
    atualizarSubTotal(entradaAportada, totalCompleto);

    if (typeof loadCharts === 'function') await loadCharts();
}

/** -----------------------------------------------------------
 * CARTÕES
 * ----------------------------------------------------------- */

async function loadCartoes() {
    const grid = document.getElementById('cartoesGrid');
    if (!grid) return;
    
    const cartoes = await window.api.getCartoes();
    grid.innerHTML = '';
    
    if (cartoes.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-credit-card"></i><p>Nenhum cartão cadastrado.</p></div>';
        return;
    }

    cartoes.forEach(c => {
        const card = document.createElement('div');
        card.className = 'cartao-card';
        card.innerHTML = `
            <div class="cartao-card-actions">
                <button class="btn-icon edit-cartao" data-id="${c.id}"><i class="fas fa-pen"></i></button>
                <button class="btn-icon delete-cartao" data-id="${c.id}"><i class="fas fa-trash"></i></button>
            </div>
            <div style="margin-bottom: 0.5rem; color: var(--text-primary); font-size: 1.2rem;">
                <i class="fas fa-credit-card"></i>
            </div>
            <div class="cartao-card-body">
                <div class="cartao-card-info">
                    <div class="cartao-card-nome">${c.nome}</div>
                    <div class="cartao-card-banco">${c.banco || 'Banco não informado'}</div>
                </div>
                <div class="cartao-card-logo-box">
                    ${c.logo ? `<img src="app-file://uploads/cartoes/${c.logo}" onerror="this.outerHTML='<i class=\\'fas fa-university\\' style=\\'color:var(--text-muted); font-size:1.5rem;\\'></i>'">` : '<i class="fas fa-university" style="color:var(--text-muted); font-size:1.5rem;"></i>'}
                </div>
            </div>
            <div class="cartao-card-datas">
                <div><i class="far fa-calendar"></i> Fechamento: ${c.data_fechamento}</div>
                <div><i class="far fa-calendar-check"></i> Vencimento: ${c.data_vencimento}</div>
            </div>
        `;
        
        card.querySelector('.edit-cartao').addEventListener('click', () => showModalCartao(c));
        card.querySelector('.delete-cartao').addEventListener('click', async () => {
            if (confirm('Excluir este cartão?')) {
                await window.api.deleteCartao(c.id);
                loadCartoes();
            }
        });
        
        grid.appendChild(card);
    });
}

/** -----------------------------------------------------------
 * DESPESAS FIXAS
 * ----------------------------------------------------------- */

async function loadDespesasFixas() {
    const list = document.getElementById('despesasList');
    if (!list) return;
    
    const despesas = await window.api.getDespesasFixas();
    list.innerHTML = '';
    
    if (despesas.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Nenhuma despesa fixa cadastrada.</p></div>';
        return;
    }

    despesas.forEach(d => {
        const item = document.createElement('div');
        item.className = 'expense-item no-card';
        item.innerHTML = `
            <div class="expense-status-check">
                <i class="fas fa-thumbtack" style="opacity: 0.2;"></i>
            </div>
            <div class="expense-info">
                <div class="expense-desc">
                    ${d.descricao_pdf ? (d.descricao_pdf + ' - ' + d.nome) : d.nome}
                    ${d.pix_chave ? '<i class="fas fa-qrcode" style="color:var(--accent-primary); font-size: 0.85rem; margin-left: 8px;" title="PIX Automático Configurado"></i>' : ''}
                </div>
                <div class="expense-meta">Vence dia ${d.dia_vencimento} • ${d.categoria || 'Fixa'} • Qtd: ${d.quantidade || 1}</div>
            </div>
            <div class="expense-value currency-excel">${formatCurrencyExcel(d.valor * (d.quantidade || 1))}</div>
            <div class="expense-actions">
                <button class="btn-icon edit-despesa" data-id="${d.id}"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete-despesa" data-id="${d.id}"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        item.querySelector('.edit-despesa').addEventListener('click', () => showModalDespesaFixa(d));
        item.querySelector('.delete-despesa').addEventListener('click', async () => {
            if (confirm('Desativar esta despesa fixa?')) {
                await window.api.deleteDespesaFixa(d.id);
                loadDespesasFixas();
            }
        });
        
        list.appendChild(item);
    });
}

/** -----------------------------------------------------------
 * ESTABELECIMENTOS
 * ----------------------------------------------------------- */

async function exportYearlyPDF(pessoaId = null, mesConsulta = null, anoConsulta = null, btnElement = null, isSilent = false) {
    if (pessoaId) {
        const pessoas = await window.api.getPessoas();
        currentPessoa = pessoas.find(p => p.id === parseInt(pessoaId));
    }

    if (!currentPessoa) {
        alert('Selecione uma pessoa primeiro.');
        return;
    }

    const m = mesConsulta !== null ? mesConsulta : currentMes;
    const y = anoConsulta !== null ? anoConsulta : currentAno;

    const btn = btnElement || document.querySelector('.btn-pdf-table');
    
    const originalContent = btn ? btn.innerHTML : '<i class="fas fa-file-pdf"></i>';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const direct = await window.api.getGastosPessoa(currentPessoa.id, y, m);
        const installments = await window.api.getParcelasPessoa(currentPessoa.id, y, m);
        
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
            if (p.paga === 0) { // Filtra apenas o que não foi pago, para bater com o sumário
                allItems.push({
                    desc_pdf: p.descricao_pdf || p.estabelecimento_nome || '',
                    item: p.descricao,
                    data: p.data,
                    custo: p.valor,
                    qtd: 1
                });
            }
        });
        
        allItems.sort((a,b) => new Date(a.data) - new Date(b.data));

        const monthNamesPDF = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
        const p = currentPessoa;
        let totalGeral = 0;
        let rowsHtml = '';

        allItems.forEach(item => {
            const totalItem = item.custo; 
            const qtd = item.qtd || 1;
            const valorUnitario = totalItem / qtd;
            
            totalGeral += totalItem;

            rowsHtml += `
                <tr>
                    <td>${item.desc_pdf}</td>
                    <td>${item.item}</td>
                    <td style="text-align:center">${formatDate(item.data)}</td>
                    <td class="custo-col" style="border-right:none; text-align:center; width:30px">R$</td>
                    <td class="custo-col" style="border-left:none">${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(valorUnitario)}</td>
                    <td style="text-align:center">${qtd}</td>
                    <td style="border-right:none; text-align:right; width:30px">R$</td>
                    <td style="border-left:none; text-align:right">${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(totalItem)}</td>
                </tr>
            `;
        });

        // Adiciona linhas vazias para manter o estilo da imagem se tiver poucos itens
        if (allItems.length < 15) {
            for (let i = 0; i < (15 - allItems.length); i++) {
                rowsHtml += '<tr><td>&nbsp;</td><td></td><td></td><td class="custo-col" style="border-right:none"></td><td class="custo-col" style="border-left:none"></td><td></td><td style="border-right:none"></td><td style="border-left:none"></td></tr>';
            }
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; background: #fff; }
                    
                    .top-header { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
                    .top-header td { border: 1px solid #1a2a44; color: #1a2a44; font-weight: bold; font-size: 14px; padding: 6px 10px; background: #96afcf; text-align: center; }
                    .header-label { background: #174a2b !important; color: #ffffff !important; width: 80px; text-transform: uppercase; }
                    .header-value { background: #96afcf !important; min-width: 150px; }

                    table { width: 100%; border-collapse: collapse; margin-top: 0; font-size: 10px; table-layout: fixed; }
                    th { background: #1a2a44; color: #ffffff; text-align: left; padding: 8px; border: 1px solid #000; font-weight: 600; text-transform: uppercase; font-size: 9px; }
                    td { border: 1px solid #1a2a44; padding: 6px; background: #96afcf; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    tr:nth-child(even) td { background: #85a0c2; }
                    
                    .custo-col { background: #622d8d !important; color: white !important; font-weight: bold; text-align: right; }
                    
                    .footer-table { width: 100%; border-collapse: collapse; margin-top: 2px; }
                    .footer-table td { background: #1a2a44; color: #fff; padding: 8px; font-weight: 800; font-size: 14px; text-align: right; border: 1px solid #000; }
                </style>
            </head>
            <body>
                <table class="top-header">
                    <tr>
                        <td class="header-label" style="width: 10%; background-color: #196c3a !important; color: #ffffff !important;">PESSOA</td>
                        <td class="header-value" style="width: 40%">${p.nome.toUpperCase()}</td>
                        <td class="header-label" style="width: 10%; background-color: #196c3a !important; color: #ffffff !important;">MÊS</td>
                        <td class="header-value" style="width: 15%">${monthNamesPDF[m-1]}</td>
                        <td class="header-label" style="width: 10%; background-color: #196c3a !important; color: #ffffff !important;">ANO</td>
                        <td class="header-value" style="width: 15%">${y}</td>
                    </tr>
                </table>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 18%;">DESCRIÇÃO</th>
                            <th style="width: 24%;">ÍTEM</th>
                            <th style="width: 10%; text-align:center">DATA</th>
                            <th style="width: 4%; text-align:center; border-right:none"></th>
                            <th style="width: 14%; text-align:right; border-left:none">VALOR UNIT.</th>
                            <th style="width: 6%; text-align:center">QTD</th>
                            <th style="width: 4%; text-align:right; border-right:none"></th>
                            <th style="width: 14%; text-align:right; border-left:none">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
                
                <table class="footer-table">
                    <tr>
                        <td style="text-align: right; padding-right: 15px;">
                            <span style="padding-right: 8px;">R$</span> 
                            ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(totalGeral)}
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        const monthNamesFull = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const fileName = `Financeiro_${p.nome}_${monthNamesFull[m-1]}_${y}.pdf`;
        return await window.api.generatePDFAno({ html, fileName, silent: isSilent });
    } catch (err) {
        console.error(err);
        alert('Erro ao gerar PDF: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}
async function loadEstabelecimentos() {
    const list = document.getElementById('estabelecimentosList');
    if (!list) return;
    
    const estabs = await window.api.getEstabelecimentos();
    list.innerHTML = '';
    
    if (estabs.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Nenhum estabelecimento cadastrado.</p></div>';
        return;
    }

    estabs.forEach(e => {
        const item = document.createElement('div');
        item.className = 'expense-item';
        item.innerHTML = `
            <div class="expense-status-check">
                <i class="fas fa-store" style="opacity: 0.2;"></i>
            </div>
            <div class="expense-info">
                <div class="expense-desc">${e.nome}</div>
                <div class="expense-meta">${e.cnpj || 'Sem CNPJ'}</div>
            </div>
            <div class="expense-value"></div>
            <div class="expense-actions">
                <button class="btn-icon edit-estabelecimento" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete-estabelecimento" data-id="${e.id}" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        item.querySelector('.edit-estabelecimento').addEventListener('click', (ev) => {
            ev.stopPropagation();
            showModalEstabelecimento(e);
        });

        item.querySelector('.delete-estabelecimento').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (confirm('Excluir este estabelecimento?')) {
                await window.api.deleteEstabelecimento(e.id);
                loadEstabelecimentos();
            }
        });

        item.querySelector('.expense-info').addEventListener('click', () => showModalEstabelecimento(e));
        item.style.cursor = 'pointer';
        
        list.appendChild(item);
    });
}

/** -----------------------------------------------------------
 * GRÁFICOS E RELATÓRIOS
 * ----------------------------------------------------------- */

async function loadCharts() {
    if (!currentPessoa) return;

    const categoriaData = await window.api.getGastosPorCategoria(currentPessoa.id, currentAno, currentMes);
    const estData = await window.api.getGastosPorEstabelecimento(currentPessoa.id, currentAno, currentMes);

    const chartColors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#fb7185', '#a78bfa'];

    // Categoria Chart
    const ctxCat = document.getElementById('categoriaChart')?.getContext('2d');
    if (ctxCat) {
        if (categoriasChart) categoriasChart.destroy();
        categoriasChart = new Chart(ctxCat, {
            type: 'doughnut',
            data: {
                labels: categoriaData.map(c => c.categoria || 'Outros'),
                datasets: [{
                    data: categoriaData.map(c => c.total),
                    backgroundColor: chartColors,
                    borderWidth: 0,
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } } }
                }
            }
        });
    }

    // Estabelecimento Chart
    const ctxEst = document.getElementById('estabelecimentoChart')?.getContext('2d');
    if (ctxEst) {
        if (estabelecimentoChart) estabelecimentoChart.destroy();
        estabelecimentoChart = new Chart(ctxEst, {
            type: 'bar',
            data: {
                labels: estData.map(e => e.estabelecimento || 'N/A'),
                datasets: [{
                    label: 'Gastos',
                    data: estData.map(e => e.total),
                    backgroundColor: '#6366f1',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }
}

/** -----------------------------------------------------------
 * ALERTAS
 * ----------------------------------------------------------- */

async function loadAlertas() {
    const alertas = await window.api.getAlertas();
    const countEl = document.getElementById('alertCount');
    const container = document.getElementById('alertsContainer');
    
    if (alertas.length > 0) {
        if (countEl) {
            countEl.textContent = alertas.length;
            countEl.style.display = 'flex';
        }
        
        if (container) {
            container.style.display = 'block';
            container.innerHTML = '';
            alertas.forEach(a => {
                const item = document.createElement('div');
                item.className = `alert-item ${a.tipo === 'vencimento' ? 'warning' : 'info'}`;
                item.innerHTML = `
                    <i class="fas ${a.tipo === 'vencimento' ? 'fa-exclamation-triangle' : 'fa-bell'}"></i>
                    <div style="flex: 1">
                        <strong>${a.titulo}</strong>
                        <p>${a.mensagem}</p>
                    </div>
                    <button class="btn-icon dismiss-alert" data-id="${a.id}"><i class="fas fa-check"></i></button>
                `;
                container.appendChild(item);
            });
        }
    } else {
        if (countEl) countEl.style.display = 'none';
        if (container) container.style.display = 'none';
    }
}
/** -----------------------------------------------------------
 * MODAIS E AUXILIARES
 * ----------------------------------------------------------- */

function showModal(title, contentHtml, size = 'default') {
    const modal = document.getElementById('modalContainer');
    const modalContent = modal.querySelector('.modal-content');
    
    // Reset sizes
    modalContent.classList.remove('modal-lg', 'modal-xl');
    if (size === 'lg') modalContent.classList.add('modal-lg');
    if (size === 'xl') modalContent.classList.add('modal-xl');

    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = contentHtml;
    modal.classList.add('show');
    document.body.classList.add('modal-open');

    // Auto-focus no primeiro input
    setTimeout(() => {
        const firstInput = document.getElementById('modalBody').querySelector('input, select');
        if (firstInput) {
            firstInput.focus();
            if (firstInput.tagName === 'INPUT') firstInput.select();
        }
    }, 150);
}

function closeModal() {
    document.getElementById('modalContainer').classList.remove('show');
    document.body.classList.remove('modal-open');
}

// Modal Pessoa
function showModalPessoa(pessoa = null) {
    showModal(pessoa ? 'Editar Perfil' : 'Novo Perfil', `
        <form id="pessoaForm">
            <div class="form-group">
                <label>Nome Completo</label>
                <input type="text" id="pNome" class="form-control" value="${pessoa ? pessoa.nome : ''}" required>
            </div>
            <div class="form-group">
                <label>WhatsApp (Ex: 11999999999)</label>
                <input type="tel" id="pZap" class="form-control" value="${pessoa ? (pessoa.whatsapp || '') : ''}" placeholder="(11) 99999-9999">
            </div>
            <div class="form-group">
                <label>Foto de Perfil</label>
                <div class="file-input-wrapper">
                    <input type="file" id="pFoto" accept="image/*">
                    <div class="file-input-display" id="pFotoDisp">
                        ${pessoa?.foto ? `<img src="app-file://uploads/pessoas/${pessoa.foto}">` : '<span>Clique para selecionar imagem</span>'}
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
        </form>
    `);

    const input = document.getElementById('pFoto');
    const disp = document.getElementById('pFotoDisp');
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => disp.innerHTML = `<img src="${ev.target.result}">`;
            reader.readAsDataURL(file);
        }
    });

    const fZap = document.getElementById('pZap');
    const applyMask = (v) => {
        v = v.replace(/\D/g, "");
        if (v.length > 11) v = v.substring(0, 11);
        if (v.length > 10) return "(" + v.substring(0, 2) + ")" + v.substring(2, 7) + "-" + v.substring(7, 11);
        if (v.length > 6) return "(" + v.substring(0, 2) + ")" + v.substring(2, 6) + "-" + v.substring(6, 10);
        if (v.length > 2) return "(" + v.substring(0, 2) + ")" + v.substring(2);
        if (v.length > 0) return "(" + v;
        return v;
    };

    if (fZap) {
        if (fZap.value) fZap.value = applyMask(fZap.value);
        fZap.addEventListener('input', (e) => {
            e.target.value = applyMask(e.target.value);
        });
    }

    document.getElementById('pessoaForm').onsubmit = async (e) => {
        e.preventDefault();
        const nome = document.getElementById('pNome').value;
        let foto = pessoa ? pessoa.foto : null;
        
        if (input.files.length > 0) {
            const file = input.files[0];
            foto = `p_${Date.now()}.${file.name.split('.').pop()}`;
            await window.api.saveBase64Image(await fileToBase64(file), 'pessoas', foto);
        }

        const whatsapp = document.getElementById('pZap').value.replace(/\D/g, '');
        
        if (pessoa) await window.api.updatePessoa(pessoa.id, nome, foto, whatsapp);
        else await window.api.addPessoa(nome, foto, whatsapp);
        
        closeModal();
        loadPessoas();
    };
}

// Modal Gasto
async function showModalGasto(gasto = null) {
    if (!currentPessoa) {
        alert("Selecione uma pessoa primeiro.");
        return;
    }

    try {
        const cartoes = await window.api.getCartoes();
        const estabs = await window.api.getEstabelecimentos();
        const meios = await window.api.getMeiosPagamento();

        const mpOptions = meios.map(m => {
            let selected = false;
            if (gasto) {
                if (gasto.meio_pagamento_nome === m.nome) selected = true;
                else if (!gasto.meio_pagamento_nome) {
                    const lowName = m.nome.toLowerCase();
                    if (lowName === 'cartão' && gasto.cartao_id) selected = true;
                    else if (lowName === 'pix' && gasto.pix_chave) selected = true;
                    else if (lowName === 'dinheiro' && !gasto.cartao_id && !gasto.pix_chave && lowName === 'dinheiro') selected = true;
                }
            } else if (m.nome.toLowerCase() === 'dinheiro') {
                selected = true;
            }
            return `<option value="${m.nome}" ${selected ? 'selected' : ''}>${m.nome}</option>`;
        }).join('') || '<option value="Dinheiro">Dinheiro</option>';

        let defaultDate;
        if (gasto) {
            defaultDate = gasto.data;
        } else {
            // Sempre começa com a data de hoje, conforme pedido pelo usuário
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            defaultDate = `${yyyy}-${mm}-${dd}`;
        }

        // Auditoria: Nome do Usuário Logado
        const nomeUsuarioLogado = window.currentUserProfile?.nome || 'Ricardo';
        const cadastradoPor = gasto?.cadastrado_por || nomeUsuarioLogado;

        showModal(gasto ? 'Editar Gasto' : 'Novo Gasto', `
            <style>
                #gastoForm .form-group { margin-bottom: 0.8rem; flex: 1; min-width: 200px; }
                #gastoForm .form-row { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 0.2rem; align-items: flex-start; }
                #gastoForm label { font-size: 0.75rem; margin-bottom: 0.3rem; font-weight: 600; color: var(--text-secondary); display: block; }
                #gastoForm input, #gastoForm select { padding: 0.6rem; height: auto; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; width: 100%; }
                #gastoForm input:focus, #gastoForm select:focus { border-color: var(--accent-primary); outline: none; background: rgba(255,255,255,0.1); }
                #gTotalPreview { margin-bottom: 0.5rem !important; }
            </style>
            <form id="gastoForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>Pessoa Responsável</label>
                        <input type="text" class="form-control" value="${currentPessoa.nome}" disabled>
                    </div>
                    <div class="form-group">
                        <label>Cadastrado por</label>
                        <input type="text" id="gCadastradoPor" class="form-control" value="${cadastradoPor}" readonly style="background: rgba(255,255,255,0.02); cursor: not-allowed; opacity: 0.8;">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Estabelecimento</label>
                        <select id="gEstabSelect" class="form-control" onchange="toggleEstabManual()">
                            <option value="">Selecione...</option>
                            ${estabs.map(e => `<option value="${e.nome}" ${gasto?.estabelecimento_nome === e.nome ? 'selected' : ''}>${e.nome}</option>`).join('')}
                            <option value="OUTROS">➕ Outros (Digitar novo...)</option>
                        </select>
                        <input type="text" id="gEstabManual" class="form-control" placeholder="Digite o nome do local..." style="display:none; margin-top: 5px;">
                    </div>
                    <div class="form-group">
                        <label>Ítem / Nome da Conta (O que comprou?)</label>
                        <input type="text" id="gDesc" class="form-control" value="${gasto ? gasto.descricao : ''}" placeholder="Ex: Aluguel, Banho, Óculos..." required>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Valor Unitário</label>
                        <input type="number" id="gValor" class="form-control" step="0.01" value="${gasto ? (gasto.valor / (gasto.quantidade || 1)) : ''}" placeholder="0.00" required
                            oninput="updateGastoTotal()">
                    </div>
                    <div class="form-group">
                        <label>Quantidade</label>
                        <input type="number" id="gQtd" class="form-control" min="1" value="${gasto ? (gasto.quantidade || 1) : 1}" required
                            oninput="updateGastoTotal()">
                    </div>
                </div>

                <div id="gTotalPreview" style="margin-bottom: 1.5rem; font-weight: 700; color: var(--accent-success); display: flex; justify-content: flex-end; gap: 5px; font-size: 1.1rem;">
                    <span>Total:</span>
                    <span id="gTotalVal">${gasto ? formatCurrency(gasto.valor) : 'R$ 0,00'}</span>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Data da Compra</label>
                        <input type="date" id="gData" class="form-control" value="${defaultDate}" required onchange="calculatePaymentDate()">
                    </div>
                    <div class="form-group">
                        <label>Data para Pagamento</label>
                        <input type="date" id="gDataPagamento" class="form-control" value="${gasto?.data_pagamento || defaultDate}" required>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Meio de Pagamento</label>
                        <select id="gPaymentMethod" class="form-control">${mpOptions}</select>
                    </div>
                    <div class="form-group" id="cartaoWrapper" style="display: ${(gasto?.cartao_id || gasto?.meio_pagamento_nome?.toLowerCase() === 'cartão') ? 'block' : 'none'}">
                        <label>Cartão</label>
                        <select id="gCartao" class="form-control" onchange="calculatePaymentDate()">
                            <option value="">Selecione o cartão...</option>
                            ${cartoes.map(c => `<option value="${c.id}" data-vencimento="${c.data_vencimento}" ${gasto?.cartao_id == c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="form-row" id="pixRow" style="display: ${(gasto?.pix_chave || gasto?.meio_pagamento_nome?.toLowerCase() === 'pix') ? 'flex' : 'none'}">
                    <div class="form-group">
                        <label>Chave PIX</label>
                        <div style="display: flex; gap: 5px;">
                            <input type="text" id="gPix" class="form-control" value="${gasto?.pix_chave || ''}" placeholder="Chave (CPF, Email...)">
                            <button type="button" class="btn btn-primary btn-sm" onclick="showPixQRCode()" title="Gerar QR Code">
                                <i class="fas fa-qrcode"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Nome Recebedor (PIX)</label>
                        <input type="text" id="gPixNome" class="form-control" value="${gasto?.pix_nome || ''}" placeholder="Nome Oficial">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Descrição Complementar / OBS</label>
                        <input type="text" id="gObs" class="form-control" value="${gasto ? (gasto.observacoes || '') : ''}" placeholder="Notas adicionais...">
                    </div>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary" id="saveGastoBtn">Salvar</button>
                </div>
            </form>
        `);

        // Funções auxiliares injetadas no escopo do modal
        window.updateGastoTotal = () => {
            const v = parseFloat(document.getElementById('gValor').value) || 0;
            const q = parseFloat(document.getElementById('gQtd').value) || 1;
            document.getElementById('gTotalVal').textContent = formatCurrency(v * q);
        };

        window.toggleEstabManual = () => {
            const sel = document.getElementById('gEstabSelect');
            const manual = document.getElementById('gEstabManual');
            if (sel.value === 'OUTROS') {
                manual.style.display = 'block';
                manual.focus();
            } else {
                manual.style.display = 'none';
            }
        };

        window.calculatePaymentDate = () => {
            const dataCompraStr = document.getElementById('gData').value;
            const meioPagamento = document.getElementById('gPaymentMethod').value.toLowerCase();
            const gDataPagamento = document.getElementById('gDataPagamento');

            if (!dataCompraStr) return;

            if (meioPagamento === 'cartão') {
                const selectCartao = document.getElementById('gCartao');
                const option = selectCartao.options[selectCartao.selectedIndex];
                const diaVenc = parseInt(option?.getAttribute('data-vencimento'));

                if (diaVenc) {
                    const dataCompra = new Date(dataCompraStr + 'T12:00:00');
                    let mesPag = dataCompra.getMonth() + 1; // Próximo mês
                    let anoPag = dataCompra.getFullYear();

                    if (mesPag > 11) {
                        mesPag = 0;
                        anoPag++;
                    }

                    // Criar data de pagamento com o dia de vencimento do cartão
                    const dataPag = new Date(anoPag, mesPag, diaVenc);
                    gDataPagamento.value = dataPag.toISOString().split('T')[0];
                } else {
                    gDataPagamento.value = dataCompraStr;
                }
            } else {
                gDataPagamento.value = dataCompraStr;
            }
        };

        const payMethod = document.getElementById('gPaymentMethod');
        const cWrap = document.getElementById('cartaoWrapper');
        const pixRow = document.getElementById('pixRow');

        payMethod.addEventListener('change', (e) => {
            const val = e.target.value.toLowerCase();
            cWrap.style.display = val === 'cartão' ? 'block' : 'none';
            pixRow.style.display = val === 'pix' ? 'flex' : 'none';
            calculatePaymentDate();
        });

        // Focar no Estabelecimento ao abrir
        setTimeout(() => document.getElementById('gEstabSelect')?.focus(), 150);

        document.getElementById('gastoForm').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('saveGastoBtn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            submitBtn.disabled = true;

            try {
                const numericValor = parseFloat(document.getElementById('gValor').value) || 0;
                const safeQtd = parseFloat(document.getElementById('gQtd').value) || 1;
                const mpNome = payMethod.value;
                const lowMP = mpNome.toLowerCase();

                // Lógica de Estabelecimento (Select + Manual)
                const estabSelect = document.getElementById('gEstabSelect').value;
                const estabManual = document.getElementById('gEstabManual').value.trim();
                const estabFinal = (estabSelect === 'OUTROS') ? estabManual : estabSelect;

                // Unir Estabelecimento ao Ítem apenas se necessário, mas manter campos limpos no banco
                const item = document.getElementById('gDesc').value.trim();
                
                const data = {
                    pessoa_id: currentPessoa.id,
                    data: document.getElementById('gData').value,
                    data_pagamento: document.getElementById('gDataPagamento').value,
                    cadastrado_por: document.getElementById('gCadastradoPor').value,
                    descricao: item,
                    descricao_pdf: estabFinal || null,
                    valor: numericValor * safeQtd,
                    paga: gasto ? gasto.paga : 0,
                    cartao_id: lowMP === 'cartão' ? document.getElementById('gCartao').value : null,
                    pix_chave: lowMP === 'pix' ? document.getElementById('gPix').value : null,
                    pix_nome: lowMP === 'pix' ? document.getElementById('gPixNome').value.trim() : null,
                    meio_pagamento_nome: mpNome,
                    estabelecimento_id: null,
                    estabelecimento_nome: estabFinal || null,
                    quantidade: safeQtd,
                    observacoes: document.getElementById('gObs').value || ''
                };

                if (gasto) await window.api.updateGasto(gasto.id, data);
                else await window.api.addGasto(data);

                submitBtn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
                setTimeout(() => {
                    closeModal();
                    loadGastos();
                }, 800);
            } catch (err) {
                console.error("Erro ao salvar:", err);
                alert("Erro ao salvar: " + err.message);
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        };

    } catch (err) {
        console.error("Erro ao abrir modal de gasto:", err);
        alert("Erro ao abrir formulário: " + err.message);
    }
}


// Modal Cartão
function showModalCartao(cartao = null) {
    showModal(cartao ? 'Editar Cartão' : 'Novo Cartão', `
        <form id="cartaoForm">
            <div class="form-group">
                <label>Nome do Cartão (ex: Nubank Black)</label>
                <input type="text" id="cNome" class="form-control" value="${cartao ? cartao.nome : ''}" required>
            </div>
            <div class="form-row">
                <div class="form-group" style="flex: 2">
                    <label>Banco</label>
                    <input type="text" id="cBanco" class="form-control" value="${cartao ? cartao.banco : ''}" placeholder="Ex: Nubank, Inter, Bradesco">
                </div>
                <div class="form-group" style="flex: 1">
                    <label>Logo</label>
                    <div id="logoPreview" class="logo-preview-box">
                        ${cartao?.logo ? `<img src="app-file://uploads/cartoes/${cartao.logo}" onerror="this.outerHTML='<i class=\\'fas fa-university\\'></i>'">` : '<i class="fas fa-university"></i>'}
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Fechamento (Dia)</label>
                    <input type="number" id="cFech" class="form-control" min="1" max="31" value="${cartao ? cartao.data_fechamento : ''}" required>
                </div>
                <div class="form-group">
                    <label>Vencimento (Dia)</label>
                    <input type="number" id="cVenc" class="form-control" min="1" max="31" value="${cartao ? cartao.data_vencimento : ''}" required>
                </div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
        </form>
    `);

    const bInput = document.getElementById('cBanco');
    const lPrev = document.getElementById('logoPreview');
    const bancoVal = cartao?.banco || '';
    let fetchedUrl = null;

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

    const fetchLogo = (bancoNome) => {
        const val = bancoNome.trim().toLowerCase();
        if (val.length > 2) {
            const domain = bankDomains[val] || `${val.replace(/\s+/g, '')}.com`;
            const tempUrl = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`;
            
            lPrev.innerHTML = '<div class="loading-spinner" style="width: 24px; height: 24px; border-width: 2px; margin: auto;"></div>';
            
            const img = new Image();
            img.onload = () => {
                lPrev.innerHTML = '';
                img.style.display = 'block';
                lPrev.appendChild(img);
                fetchedUrl = tempUrl;
            };
            img.onerror = () => {
                lPrev.innerHTML = '<i class="fas fa-university"></i>';
                fetchedUrl = null;
            };
            img.src = tempUrl;
        } else {
            lPrev.innerHTML = '<i class="fas fa-university"></i>';
            fetchedUrl = null;
        }
    };

    bInput.addEventListener('input', debounce((e) => fetchLogo(e.target.value), 600));
    
    // Auto-busca o logo se o campo já estiver preenchido (edição)
    if (bancoVal && !cartao?.logo) {
        fetchLogo(bancoVal);
    }

    document.getElementById('cartaoForm').onsubmit = async (e) => {
        e.preventDefault();
        const nome = document.getElementById('cNome').value;
        const banco = document.getElementById('cBanco').value;
        let logo = cartao ? cartao.logo : null;

        if (fetchedUrl) {
            try {
                const filename = `logo_${Date.now()}_${banco.toLowerCase().replace(/\s+/g, '_')}.png`;
                const saved = await window.api.downloadImage(fetchedUrl, 'cartoes', filename);
                if (saved) logo = filename;
            } catch (err) { console.error("Falha ao salvar logo real", err); }
        }

        const data = {
            nome, banco, logo,
            data_fechamento: parseInt(document.getElementById('cFech').value),
            data_vencimento: parseInt(document.getElementById('cVenc').value)
        };

        if (cartao) await window.api.updateCartao(cartao.id, data);
        else await window.api.addCartao(data);

        closeModal();
        loadCartoes();
    };
}

// Auxiliar debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Modal Despesa Fixa
async function showModalDespesaFixa(despesa = null) {
    const pessoas = await window.api.getPessoas();
    const estabs = await window.api.getEstabelecimentos();

    // Auditoria: Nome do Usuário Logado
    const nomeUsuarioLogado = window.currentUserProfile?.nome || 'Ricardo';
    const cadastradoPor = despesa?.cadastrado_por || nomeUsuarioLogado;

    showModal(despesa ? 'Editar Despesa Fixa' : 'Cadastrar Despesa Fixa', `
        <style>
            #fixedForm .form-group { margin-bottom: 0.8rem; flex: 1; min-width: 200px; }
            #fixedForm .form-row { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 0.2rem; align-items: flex-start; }
            #fixedForm label { font-size: 0.75rem; margin-bottom: 0.3rem; font-weight: 600; color: var(--text-secondary); display: block; }
            #fixedForm input, #fixedForm select { padding: 0.6rem; height: auto; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; width: 100%; }
            #fixedForm input:focus, #fixedForm select:focus { border-color: var(--accent-primary); outline: none; background: rgba(255,255,255,0.1); }
            #fTotalPreview { margin-bottom: 0.5rem !important; }
        </style>

        <form id="fixedForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Pessoa Responsável</label>
                    <select id="fPessoa" class="form-control" required>
                        ${pessoas.map(p => `<option value="${p.id}" ${despesa?.pessoa_id == p.id ? 'selected' : ''}>${p.nome}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Cadastrado por</label>
                    <input type="text" id="fCadastradoPor" class="form-control" value="${cadastradoPor}" readonly style="background: rgba(255,255,255,0.02); cursor: not-allowed; opacity: 0.8;">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Estabelecimento</label>
                    <select id="fEstabSelect" class="form-control" onchange="toggleFEstabManual()">
                        <option value="">Selecione...</option>
                        ${estabs.map(e => `<option value="${e.nome}" ${despesa?.estabelecimento_nome === e.nome ? 'selected' : ''}>${e.nome}</option>`).join('')}
                        <option value="OUTROS">➕ Outros (Digitar novo...)</option>
                    </select>
                    <input type="text" id="fEstabManual" class="form-control" placeholder="Digite o nome do local..." style="display:none; margin-top: 5px;">
                </div>
                <div class="form-group">
                    <label>Dia Vencimento</label>
                    <input type="number" id="fDia" class="form-control" min="1" max="31" value="${despesa?.dia_vencimento || ''}" placeholder="1-31" required>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Ítem / Nome da Conta</label>
                    <input type="text" id="fNome" class="form-control" value="${despesa?.nome || ''}" placeholder="Ex: Aluguel, Internet, Luz..." required>
                </div>
                <div class="form-group">
                    <label>Descrição Complementar (PDF)</label>
                    <input type="text" id="fDescPdf" class="form-control" value="${despesa?.descricao_pdf || ''}" placeholder="Ex: Referente ao mês atual...">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Valor Unitário</label>
                    <input type="number" id="fVal" class="form-control" step="0.01" value="${despesa?.valor || ''}" placeholder="0.00" required oninput="updateFTotal()">
                </div>
                <div class="form-group">
                    <label>Quantidade</label>
                    <input type="number" id="fQtd" class="form-control" min="1" value="${despesa?.quantidade || 1}" required oninput="updateFTotal()">
                </div>
            </div>

            <div id="fTotalPreview" style="margin-bottom: 1.5rem; font-weight: 700; color: var(--accent-success); display: flex; justify-content: flex-end; gap: 5px; font-size: 1.1rem;">
                <span>Total:</span>
                <span id="fTotalVal">${despesa ? formatCurrency(despesa.valor * (despesa.quantidade || 1)) : 'R$ 0,00'}</span>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Chave PIX (Bradesco)</label>
                    <input type="text" id="fPixChave" class="form-control" value="${despesa?.pix_chave || ''}" placeholder="Chave PIX">
                </div>
                <div class="form-group">
                    <label>Nome do Recebedor</label>
                    <input type="text" id="fPixNome" class="form-control" value="${despesa?.pix_nome || ''}" placeholder="Nome exato da conta">
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Salvar Despesa</button>
            </div>
        </form>
    `);

    // Injeta funções no escopo global para o formulário
    window.updateFTotal = () => {
        const v = parseFloat(document.getElementById('fVal').value) || 0;
        const q = parseInt(document.getElementById('fQtd').value) || 1;
        document.getElementById('fTotalVal').textContent = formatCurrency(v * q);
    };

    window.toggleFEstabManual = () => {
        const sel = document.getElementById('fEstabSelect');
        const manual = document.getElementById('fEstabManual');
        if (sel.value === 'OUTROS') {
            manual.style.display = 'block';
            manual.focus();
        } else {
            manual.style.display = 'none';
        }
    };

    // Trigger inicial se for edição com estabelecimento manual (improvável mas por segurança)
    if (despesa?.estabelecimento_nome && !estabs.some(e => e.nome === despesa.estabelecimento_nome)) {
        document.getElementById('fEstabSelect').value = 'OUTROS';
        document.getElementById('fEstabManual').value = despesa.estabelecimento_nome;
        window.toggleFEstabManual();
    }

    document.getElementById('fixedForm').onsubmit = async (e) => {
        e.preventDefault();

        let estabNome = document.getElementById('fEstabSelect').value;
        if (estabNome === 'OUTROS') {
            estabNome = document.getElementById('fEstabManual').value.trim();
        }

        const data = {
            pessoa_id: parseInt(document.getElementById('fPessoa').value),
            descricao_pdf: document.getElementById('fDescPdf').value,
            nome: document.getElementById('fNome').value,
            valor: parseFloat(document.getElementById('fVal').value),
            dia_vencimento: parseInt(document.getElementById('fDia').value),
            quantidade: parseInt(document.getElementById('fQtd').value) || 1,
            estabelecimento_nome: estabNome || null,
            pix_chave: document.getElementById('fPixChave').value || null,
            pix_nome: document.getElementById('fPixNome').value || null,
            cadastrado_por: document.getElementById('fCadastradoPor').value,
            categoria: 'Fixa'
        };

        if (despesa) await window.api.updateDespesaFixa(despesa.id, data);
        else await window.api.addDespesaFixa(data);
        
        closeModal();
        loadDespesasFixas();
    };
}

// Modal Estabelecimento
function showModalEstabelecimento(estab = null) {
    showModal(estab ? 'Editar Estabelecimento' : 'Novo Estabelecimento', `
        <form id="estForm">
            <div class="form-group">
                <label>Nome do Estabelecimento</label>
                <input type="text" id="eNome" class="form-control" value="${estab?.nome || ''}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>CNPJ (Opcional)</label>
                    <input type="text" id="eCnpj" class="form-control" value="${estab?.cnpj || ''}" placeholder="00.000.000/0001-00">
                </div>
                <div class="form-group">
                    <label>Chave PIX (Opcional)</label>
                    <input type="text" id="ePixChave" class="form-control" value="${estab?.pix_chave || ''}" placeholder="Chave do estabelecimento">
                </div>
            </div>
            <div class="form-group">
                <label>Nome do Recebedor PIX (Opcional)</label>
                <input type="text" id="ePixNome" class="form-control" value="${estab?.pix_nome || ''}" placeholder="Nome exato associado à conta bancária">
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${estab ? 'Salvar' : 'Cadastrar'}</button>
            </div>
        </form>
    `);

    // Máscara de CNPJ em tempo real (após injetar no DOM)
    const cnpjInput = document.getElementById('eCnpj');
    if (cnpjInput) {
        // Aplica logo de cara se já tiver valor (edição)
        aplicarMascaraCnpj(cnpjInput);
        
        cnpjInput.addEventListener('input', (e) => {
            aplicarMascaraCnpj(e.target);
        });
    }

    document.getElementById('estForm').onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const nome = document.getElementById('eNome').value;
            const cnpj = document.getElementById('eCnpj').value;
            const pix_chave = document.getElementById('ePixChave')?.value || null;
            const pix_nome = document.getElementById('ePixNome')?.value || null;

            if (estab) await window.api.updateEstabelecimento(estab.id, cnpj, nome, { pix_chave, pix_nome });
            else await window.api.addEstabelecimento(cnpj, nome, { pix_chave, pix_nome });
            
            closeModal();
            loadEstabelecimentos();
        } catch (err) {
            alert("Erro ao salvar estabelecimento: " + err.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    };
}

/** -----------------------------------------------------------
 * VISUALIZAR CUPOM
 * ----------------------------------------------------------- */
async function showCupom(cupomId) {
    const cupom = await window.api.getCupom(cupomId);
    if (!cupom || !cupom.imagem) {
        alert('Imagem do comprovante não encontrada.');
        return;
    }

    const imgUrl = `app-file://uploads/comprovantes/${cupom.imagem}`;
    
    showModal('Análise do Comprovante', `
        <div style="text-align:center;">
            <div style="margin-bottom:1rem; padding:1rem; background:rgba(0,0,0,0.2); border-radius:12px; font-size:0.85rem; text-align:left;">
                <p><strong>📦 Estabelecimento:</strong> ${cupom.cnpj ? `CNPJ ${cupom.cnpj}` : 'Não informado'}</p>
                <p><strong>📅 Data da Nota:</strong> ${formatDate(cupom.data)}</p>
                <p><strong>💰 Valor Total:</strong> ${formatCurrency(cupom.total)}</p>
            </div>
            <div style="max-height:60vh; overflow-y:auto; border-radius:12px; border: 1px solid var(--border-color);">
                <img src="${imgUrl}" style="width:100%; height:auto; display:block;" onerror="this.outerHTML='<p style=\'padding:2rem;\'>Erro ao carregar imagem. Verifique se o arquivo existe em <code>uploads/comprovantes</code>.</p>'">
            </div>
            <div class="modal-actions" style="margin-top:1.5rem;">
                <button type="button" class="btn btn-primary" onclick="closeModal()">Fechar</button>
            </div>
        </div>
    `);
}

async function showFotoGasto(foto) {
    const imgUrl = `app-file://uploads/gastos/${foto}`;
    showModal('Visualizar Gasto (WhatsApp)', `
        <div style="text-align:center;">
            <div style="max-height:75vh; overflow-y:auto; border-radius:12px; border: 1px solid var(--border-color);">
                <img src="${imgUrl}" style="width:100%; height:auto; display:block;" onerror="this.outerHTML='<p style=\'padding:2rem;\'>Erro ao carregar imagem. Verifique se o arquivo existe em <code>uploads/gastos</code>.</p>'">
            </div>
            <div class="modal-actions" style="margin-top:1.5rem;">
                <button type="button" class="btn btn-primary" onclick="closeModal()">Fechar</button>
            </div>
        </div>
    `);
}

// Helper para máscara
function aplicarMascaraCnpj(el) {
    let val = el.value.replace(/\D/g, '');
    if (val.length > 14) val = val.substring(0, 14);
    
    let formatted = val;
    if (val.length > 2) formatted = val.substring(0, 2) + '.' + val.substring(2);
    if (val.length > 5) formatted = formatted.substring(0, 6) + '.' + formatted.substring(6);
    if (val.length > 8) formatted = formatted.substring(0, 10) + '/' + formatted.substring(10);
    if (val.length > 12) formatted = formatted.substring(0, 15) + '-' + formatted.substring(15);
    
    el.value = formatted;
}

// Geração de Despesas Fixas
async function gerarDespesasFixas() {
    if (!currentPessoa) return;
    if (confirm(`Gerar todas as despesas fixas para o mês ${currentMes}/${currentAno}?`)) {
        await window.api.gerarDespesasFixas(currentPessoa.id, currentAno, currentMes);
        loadGastos();
    }
}

/** -----------------------------------------------------------
 * OCR E SCAN DE CUPOM
 * ----------------------------------------------------------- */

async function scanCupom() {
    showModal('Escanear Comprovante', `
        <div id="scanBox">
            <div class="file-input-wrapper">
                <input type="file" id="cupImg" accept="image/*">
                <div class="file-input-display" id="cupDisp">
                    <i class="fas fa-receipt" style="font-size:2rem; color:var(--text-muted); margin-bottom:0.5rem;"></i>
                    <span>Clique ou arraste o comprovante aqui</span>
                </div>
            </div>
            <div id="scanStatus" style="display:none; text-align:center; margin-top:1rem;">
                <div class="loading-spinner"></div> <span id="statusTxt">Lendo comprovante...</span>
            </div>
            <div id="scanResults" style="display:none; margin-top:1rem;">
                <div class="form-group">
                    <label>Estabelecimento</label>
                    <div style="display:flex; gap:0.5rem;">
                        <select id="sEstab" class="form-control" style="flex:1">
                            <option value="">Selecione o estabelecimento...</option>
                        </select>
                        <button type="button" class="btn btn-secondary" onclick="showModalEstabelecimento()" title="Novo Estabelecimento">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex:1">
                        <label>Data</label>
                        <input type="date" id="sData" class="form-control">
                    </div>
                    <div class="form-group" style="flex:2">
                        <label>Total Pago (R$)</label>
                        <input type="number" id="sTotal" class="form-control" step="0.01" placeholder="0,00">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex:1">
                        <label>Forma de Pagamento</label>
                        <select id="sFormaPag" class="form-control">
                            <option value="dinheiro">💵 Dinheiro</option>
                            <option value="credito">💳 Cartão de Crédito</option>
                            <option value="debito">💳 Cartão de Débito</option>
                            <option value="pix">📱 PIX</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex:1" id="cartaoSelectWrapper">
                        <label>Cartão</label>
                        <select id="sCartao" class="form-control"><option value="">Selecione...</option></select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Categoria</label>
                    <select id="sCat" class="form-control">
                        <!-- Categorias dinâmicas -->
                    </select>
                </div>
                <div id="comprovanteSalvo" style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">
                    <i class="fas fa-check-circle" style="color:#22c55e;"></i> Comprovante salvo para análise futura
                </div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="button" class="btn btn-primary" id="saveScan" style="display:none">
                    <i class="fas fa-save"></i> Registrar Gasto
                </button>
            </div>
        </div>
    `);

    const input = document.getElementById('cupImg');
    const disp = document.getElementById('cupDisp');
    const status = document.getElementById('scanStatus');
    const results = document.getElementById('scanResults');
    const btnSave = document.getElementById('saveScan');
    
    // Data padrão = hoje
    document.getElementById('sData').value = new Date().toISOString().split('T')[0];

    // 1. Popula Estabelecimentos
    const estabelecimentos = await window.api.getEstabelecimentos();
    const sEstab = document.getElementById('sEstab');
    estabelecimentos.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        // Salva o CNPJ formatado no dataset para o OCR buscar depois
        const cleanCnpj = (e.cnpj || '').replace(/\D/g, ''); 
        opt.dataset.cnpj = cleanCnpj;
        opt.textContent = e.nome + (e.cnpj ? ` (${e.cnpj})` : '');
        sEstab.appendChild(opt);
    });

    // 2. Popula cartoes disponíveis
    const cartoes = await window.api.getCartoes();
    const sCartao = document.getElementById('sCartao');
    cartoes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.nome;
        sCartao.appendChild(opt);
    });

    // 3. Popula Categorias
    const catsS = await window.api.getCategorias();
    const sCat = document.getElementById('sCat');
    catsS.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.nome; opt.textContent = c.nome;
        sCat.appendChild(opt);
    });

    // Mostra/oculta seletor de cartão conforme forma de pagamento
    const sFormaPag = document.getElementById('sFormaPag');
    const cartaoWrapper = document.getElementById('cartaoSelectWrapper');
    sFormaPag.onchange = () => {
        const showCard = sFormaPag.value.includes('credito') || sFormaPag.value.includes('debito');
        cartaoWrapper.style.display = showCard ? '' : 'none';
    };
    // Inicia oculto (default = dinheiro)
    cartaoWrapper.style.display = 'none';
    sFormaPag.value = 'dinheiro';

    let comprovanteFilename = null;

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Preview da imagem selecionada
        const reader = new FileReader();
        reader.onload = (rev) => {
            disp.innerHTML = `<img src="${rev.target.result}" style="max-height:150px; border-radius:8px; box-shadow: var(--shadow-sm);">`;
        };
        reader.readAsDataURL(file);
        status.style.display = 'block';
        document.getElementById('statusTxt').textContent = 'Salvando comprovante...';
        results.style.display = 'none';
        btnSave.style.display = 'none';

        try {
            // 1. Salva a imagem permanentemente como comprovante
            const base64 = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsDataURL(file);
            });
            
            const ext = file.name.split('.').pop() || 'png';
            comprovanteFilename = `comprovante_${Date.now()}.${ext}`;
            await window.api.saveBase64Image(base64, 'comprovantes', comprovanteFilename);

            // 2. Salva também em tmp para o OCR ler
            const tmpName = `ocr_tmp_${Date.now()}.${ext}`;
            await window.api.saveBase64Image(base64, 'ocr_tmp', tmpName);
            
            document.getElementById('statusTxt').textContent = 'Lendo valores com OCR...';
            
            // 3. Executa OCR no processo principal
            const appDataPath = await window.api.getAppDataPath();
            const fullPath = `${appDataPath}\\uploads\\ocr_tmp\\${tmpName}`;
            const ocrResult = await window.api.ocrImage(fullPath);
            
            if (!ocrResult.success) throw new Error(ocrResult.error);

            // 4. Extrai TOTAL real pago, CNPJ e forma de pagamento
            const parsed = extrairDadosCupom(ocrResult.text);
            
            if (parsed.total !== null) document.getElementById('sTotal').value = parsed.total.toFixed(2);
            if (parsed.dataEmissao) document.getElementById('sData').value = parsed.dataEmissao;
            
            // Auto-seleciona estabelecimento por CNPJ
            if (parsed.cnpj) {
                const detectedCnpj = parsed.cnpj.replace(/\D/g, '');
                for (let i = 0; i < sEstab.options.length; i++) {
                    if (sEstab.options[i].dataset.cnpj === detectedCnpj) {
                        sEstab.selectedIndex = i;
                        break;
                    }
                }
            }

            if (parsed.formaPagamento) {
                // Tenta selecionar a forma de pagamento detectada
                const fp = document.getElementById('sFormaPag');
                const val = parsed.formaPagamento;
                if (val.includes('cred')) { fp.value = 'credito'; cartaoWrapper.style.display = ''; }
                else if (val.includes('deb')) { fp.value = 'debito'; cartaoWrapper.style.display = ''; }
                else if (val.includes('pix')) fp.value = 'pix';
                else fp.value = 'dinheiro';
            }

            status.style.display = 'none';
            results.style.display = 'block';
            btnSave.style.display = 'block';

        } catch (err) {
            console.error(err);
            status.style.display = 'none';
            // Mesmo com erro no OCR, o comprovante foi salvo — permite preenchimento manual
            results.style.display = 'block';
            btnSave.style.display = 'block';
            document.getElementById('statusTxt').textContent = 'OCR falhou — preencha manualmente.';
        }
    };

    btnSave.onclick = async () => {
        const submitBtn = document.getElementById('saveScan');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const estabId = parseInt(sEstab.value) || null;
            const estabNome = sEstab.selectedIndex > 0 ? sEstab.options[sEstab.selectedIndex].text.split(' (')[0] : 'Compra (comprovante)';
            
            // Parser simples para input type="number" (já vem com ponto decimal)
            let rawTotal = document.getElementById('sTotal').value;
            let numericTotal = parseFloat(rawTotal);
            
            const data = document.getElementById('sData').value;
            const categoria = document.getElementById('sCat').value;
            const formaPag = document.getElementById('sFormaPag').value;
            const cartaoId = (formaPag === 'credito' || formaPag === 'debito')
                ? (parseInt(document.getElementById('sCartao').value) || null)
                : null;

            if (isNaN(numericTotal) || numericTotal <= 0) { throw new Error('Informe o valor total.'); }
            if (!data) { throw new Error('Informe a data.'); }

            // Extrai o CNPJ da descrição do select se existir
            let selectedCnpj = null;
            if (sEstab.selectedIndex > 0) {
                const match = sEstab.options[sEstab.selectedIndex].text.match(/\(([^)]+)\)/);
                if (match) selectedCnpj = match[1].replace(/\D/g, '');
            }

            // 1. Salva o cupom no banco e pega o ID dele
            const cupom = await window.api.salvarCupom(
                currentPessoa.id, cartaoId,
                comprovanteFilename || null,
                '', numericTotal, data, [], selectedCnpj
            );

            // 2. Registra como gasto vinculado ao estabelecimento, cartão E CUPOM
            await window.api.addGasto({
                pessoa_id: currentPessoa.id,
                cartao_id: cartaoId,
                cupom_id: cupom?.id || null, // Vínculo crucial!
                estabelecimento_id: estabId,
                descricao: estabNome, 
                valor: numericTotal, data, categoria,
                observacao: formaPag,
                total_parcelas: 1, is_parcelado: 0
            });

            closeModal();
            
            // Notifica o usuário sobre onde o gasto foi parar (pode ser em outro mês se a nota for antiga)
            const dateParts = data.split('-');
            const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            const savedMonth = monthNames[parseInt(dateParts[1]) - 1];
            
            alert(`Gasto registrado com sucesso em ${dateParts[2]}/${dateParts[1]}/${dateParts[0]}!\nEle aparecerá na visualização de ${savedMonth}/${dateParts[0]}.`);
            
            // Se for o mês atual, recarrega a lista
            if (parseInt(dateParts[0]) === currentAno && parseInt(dateParts[1]) === currentMes) {
                loadGastos();
            }
        } catch (err) {
            alert("Erro ao salvar: " + err.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Gasto';
        }
    };
}

function extrairDadosCupom(text) {
    let total = null;
    let cnpj = null;
    let formaPagamento = null;

    // Prioridade de detecção do total:
    // 1. "VALOR PAGO" (real pago, após desconto) — maior prioridade
    // 2. "VALOR TOTAL" ou "TOTAL A PAGAR"
    // 3. "SUBTOTAL" apenas como último recurso
    const totalPatterns = [
        // VALOR PAGO — linhas como "Cartao Credito ... 199,55" ou "VALOR PAGO ... 199,55"
        /valor\s*pago[\s:R$]*(\d+[.,]\d{2})/i,
        // Linha de pagamento: "Cartao Credito/Debito ... V" + número
        /cart[aã]o\s*(cr[eé]d(?:ito)?|d[eé]b(?:ito)?)[^\n]*?(\d+[.,]\d{2})/i,
        // Total a pagar / valor total
        /total\s*a\s*pagar[\s:R$]*(\d+[.,]\d{2})/i,
        /valor\s*total\s*r[s$\s]*(\d+[.,]\d{2})/i,
        /valor\s*total[\s:R$]*(\d+[.,]\d{2})/i,
        // Total genérico
        /\btotal\b[\s:R$]*(\d+[.,]\d{2})/i
        // SUBTOTAL — não usado; geralmente é antes de desconto
    ];

    for (const pat of totalPatterns) {
        const m = text.match(pat);
        if (m) {
            // Grupos com 2 captures (cartao pattern) — pega o último grupo
            const rawVal = m[m.length - 1];
            const v = parseFloat(rawVal.replace(',', '.'));
            if (v > 0 && v < 100000) { total = v; break; }
        }
    }

    if (/cart[aã]o\s*cr[eé]d/i.test(text)) formaPagamento = 'credito';
    else if (/cart[aã]o\s*d[eé]b/i.test(text)) formaPagamento = 'debito';
    else if (/\bpix\b/i.test(text)) formaPagamento = 'pix';
    else if (/\bdinheiro\b/i.test(text)) formaPagamento = 'dinheiro';

    // CNPJ aparece sempre no CABEÇALHO do cupom (primeiras linhas)
    const allLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const headerLines = allLines.slice(0, 25).join('\n');  // primeiras 25 linhas (cobre logo + nome + CNPJ)
    const footerLines = allLines.slice(-15).join('\n');     // últimas 15 linhas

    // Busca CNPJ apenas no cabeçalho
    const cnpjComLabel = headerLines.match(/cnpj\s*[:.\/]?\s*(\d{2}\.?\s?\d{3}\.?\s?\d{3}\s?[\/\\]?\s?\d{4}\s?-?\s?\d{2})/i);
    if (cnpjComLabel) {
        cnpj = cnpjComLabel[1].replace(/\s/g, '');
    } else {
        // Formato completo com pontos e barra no cabeçalho: XX.XXX.XXX/XXXX-XX
        const cnpjFormatado = headerLines.match(/\d{2}\.\d{3}\.\d{3}[\/\\]\d{4}-\d{2}/);
        if (cnpjFormatado) {
            cnpj = cnpjFormatado[0];
        } else {
            // Último recurso: 14 dígitos no cabeçalho (menos confiável)
            const cnpjBruto = headerLines.match(/\b\d{14}\b/);
            if (cnpjBruto) cnpj = cnpjBruto[0];
        }
    }

    // Data de emissão aparece no RODAPÉ do cupom (últimas linhas)
    // Formatos: DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD
    let dataEmissao = null;
    const datePatterns = [
        { re: /(\d{2})\/(\d{2})\/(\d{4})/, fmt: 'dmy4' },
        { re: /(\d{2})\/(\d{2})\/(\d{2})/,  fmt: 'dmy2' },
        { re: /(\d{4})-(\d{2})-(\d{2})/,   fmt: 'ymd'  }
    ];
    for (const { re, fmt } of datePatterns) {
        const m = footerLines.match(re);
        if (m) {
            if (fmt === 'ymd')  dataEmissao = `${m[1]}-${m[2]}-${m[3]}`;
            else if (fmt === 'dmy4') dataEmissao = `${m[3]}-${m[2]}-${m[1]}`;
            else dataEmissao = `20${m[3]}-${m[2]}-${m[1]}`;
            break;
        }
    }

    return { total, cnpj, formaPagamento, dataEmissao };
}




/** -----------------------------------------------------------
 * UTILS
 * ----------------------------------------------------------- */

function formatCurrency(v) {
    const value = v || 0;
    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    return `R$ ${formatted}`;
}

function formatCurrencyExcel(v) {
    const value = v || 0;
    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    return `<span>R$</span><span>${formatted}</span>`;
}

function formatDate(d) {
    if (!d) return '';
    // Evita o problema de Timezone/UTC ao converter YYYY-MM-DD para Date padrão
    const parts = d.split('-');
    if (parts.length === 3) {
        // Retorna diretamente formatado como DD/MM/YYYY
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR');
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/** -----------------------------------------------------------
 * VISUALIZAR CUPOM
 * ----------------------------------------------------------- */
async function showCupom(cupomId) {
    const cupom = await window.api.getCupom(cupomId);
    if (!cupom || !cupom.imagem) {
        alert('Imagem do comprovante não encontrada.');
        return;
    }

    const imgUrl = `app-file://uploads/comprovantes/${cupom.imagem}`;
    // Formata o CNPJ se ele existir (remove não números e aplica máscara)
    const rawCnpj = cupom.cnpj ? cupom.cnpj.replace(/\D/g, '') : null;
    const formattedCnpj = rawCnpj ? rawCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : 'Não informado';
    
    showModal('Análise do Comprovante', `
        <div style="text-align:center;">
            <div style="margin-bottom:1rem; padding:1rem; background:rgba(0,0,0,0.2); border-radius:12px; font-size:0.85rem; text-align:left;">
                <p><strong>📦 Estabelecimento:</strong> ${formattedCnpj !== 'Não informado' ? `CNPJ ${formattedCnpj}` : 'Não informado'}</p>
                <p><strong>📅 Data da Nota:</strong> ${formatDate(cupom.data)}</p>
                <p><strong>💰 Valor Total:</strong> ${formatCurrency(cupom.total)}</p>
            </div>
            <div style="max-height:60vh; overflow-y:auto; border-radius:12px; border: 1px solid var(--border-color);">
                <img src="${imgUrl}" style="width:100%; height:auto; display:block;" onerror="this.outerHTML='<p style=\'padding:2rem;\'>Erro ao carregar imagem. Verifique se o arquivo existe em <code>uploads/comprovantes</code>.</p>'">
            </div>
            <div class="modal-actions" style="margin-top:1.5rem;">
                <button type="button" class="btn btn-primary" onclick="closeModal()">Fechar</button>
            </div>
        </div>
    `);
}

/** -----------------------------------------------------------
 * SETUP / CONFIGURAÇÕES
 * ----------------------------------------------------------- */
async function loadSetup() {
    const content = document.getElementById('setupContent');
    content.innerHTML = `
        <div class="setup-grid">

            
            <div class="setup-card">
                <div class="setup-card-header">
                    <i class="fas fa-credit-card"></i>
                    <h3>Meios de Pagamento</h3>
                </div>
                <p>Gerencie as formas de pagamento disponíveis (Ex: Dinheiro, PIX, Cartão).</p>
                <div id="meiosPagamentoList" class="setup-list">
                    <div class="loading-spinner"></div>
                </div>
                <div class="setup-actions">
                    <button class="btn btn-primary" onclick="showModalMeioPagamento()">
                        <i class="fas fa-plus"></i> Novo Meio
                    </button>
                </div>
            </div>

            <div class="setup-card">
                <div class="setup-card-header">
                    <i class="fab fa-whatsapp" style="color:#25D366;"></i>
                    <h3>Integração WhatsApp</h3>
                </div>
                <p>Conecte o sistema ao seu WhatsApp para envio de resumos e monitoramento inteligente de cupons.</p>
                <div id="waStatusContainer" style="margin-top:1rem; text-align:center; display: flex; flex-direction:column; gap:0.5rem; align-items:center;">
                    <div id="waConnectionStatus" style="font-size: 0.9rem; font-weight: bold; margin-bottom: 5px;">
                        <i class="fas fa-lock"></i> Aguardando Ativação da Nuvem...
                    </div>
                    <p id="cloudRequirementMsg" style="font-size: 0.75rem; color: #e74c3c; margin-bottom: 10px;">
                        Ative a "Sincronização em Nuvem" ao lado para liberar o WhatsApp.
                    </p>
                    <button class="btn btn-primary btn-sm" onclick="showWaModal()" id="btnWaConnect" style="display:none; width:100%;">
                        <i class="fas fa-qrcode"></i> Conectar WhatsApp
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="disconnectWa()" id="btnWaDisconnect" style="display:none; width:100%; border-color:#e74c3c; color:#e74c3c;">
                        <i class="fas fa-sign-out-alt"></i> Desconectar Conta
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="showCreateGroupModal()" id="btnCreateGroup" style="display:none; width:100%; background: #25d366; border: none; margin-top: 0.5rem; color: white;">
                        <i class="fas fa-users"></i> Criar Grupo Controle
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="handleDeleteGroup()" id="btnDeleteGroup" style="display:none; width:100%; margin-top: 0.5rem; background: #e74c3c; border: none; color: white;">
                        <i class="fas fa-trash-alt"></i> Remover Grupo Controle
                    </button>
                </div>
            </div>

            <div class="setup-card" id="cloudSyncCard">
                <div class="setup-card-header">
                    <i class="fas fa-cloud-upload-alt" style="color:#6366f1;"></i>
                    <h3>Sincronização em Nuvem</h3>
                </div>
                <p>Mantenha seus dados seguros e receba cupons mesmo com o computador desligado.</p>
                <div id="cloudStatusContainer" style="margin-top:1rem; text-align:center;">
                    <div id="cloudStatusBadge" class="status-badge" style="margin-bottom: 1rem; display: inline-block;">
                        <i class="fas fa-circle-notch fa-spin"></i> Verificando...
                    </div>
                    <div id="cloudSyncActions">
                        <button class="btn btn-primary" onclick="activateCloudSyncUI()" id="btnActivateCloud" style="display:none; width: 100%;">
                            <i class="fas fa-bolt"></i> Ativar Agora
                        </button>
                        <p id="cloudTokenInfo" style="font-size: 0.75rem; color: #888; margin-top: 0.5rem; display: none; word-break: break-all;"></p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Verifica status da nuvem
    checkCloudStatus();



    // Carrega meios de pagamento
    loadMeiosPagamento();

    // Carrega Status do Whatsapp
    checkWaStatus();
}

async function checkWaStatus() {
    const statusBox = document.getElementById('waConnectionStatus');
    const connectBtn = document.getElementById('btnWaConnect');
    const disconnectBtn = document.getElementById('btnWaDisconnect');
    const globalIcon = document.getElementById('whatsappStatusIcon');
    
    try {
        const userId = sessionStorage.getItem('userId') || 1;
        const admin = await window.api.getUserById(userId);
        const isCloudActive = admin && admin.cloud_activated;

        const wa = await window.api.getWaStatus();
        
        // Atualiza ícone global do topo (Sempre deve rodar)
        if (globalIcon) {
            globalIcon.style.color = wa.isReady ? '#25d366' : '#e74c3c';
            globalIcon.title = wa.isReady ? 'WhatsApp Conectado' : 'WhatsApp Desconectado';
        }

        // Se o statusBox não existir (não estamos no setup), encerramos aqui de forma segura
        if (statusBox) {
            if (!isCloudActive) {
                statusBox.innerHTML = '<i class="fas fa-lock"></i> Bloqueado (Ative a Nuvem)';
                statusBox.className = 'status-text text-danger';
                if (connectBtn) connectBtn.style.display = 'none';
                if (disconnectBtn) disconnectBtn.style.display = 'none';
                return; // Para aqui se não houver nuvem
            }

            if (wa.isReady) {
            statusBox.innerHTML = '<span style="color:#25d366;"><i class="fas fa-check-circle"></i> Conectado e Pronto</span>';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-block';
            
            const groupCreated = await window.api.checkWaGroup();
            if (groupCreated) {
                if (document.getElementById('btnCreateGroup')) document.getElementById('btnCreateGroup').style.display = 'none';
                if (document.getElementById('btnDeleteGroup')) document.getElementById('btnDeleteGroup').style.display = 'inline-block';
            } else {
                if (document.getElementById('btnCreateGroup')) document.getElementById('btnCreateGroup').style.display = 'inline-block';
                if (document.getElementById('btnDeleteGroup')) document.getElementById('btnDeleteGroup').style.display = 'none';
            }
        } else if (wa.isAuthenticated) {
            statusBox.innerHTML = '<span style="color:#f39c12;"><i class="fas fa-circle-notch fa-spin"></i> Autenticado... Inicializando Motor</span>';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'none';
            if (document.getElementById('btnCreateGroup')) document.getElementById('btnCreateGroup').style.display = 'none';
            if (document.getElementById('btnDeleteGroup')) document.getElementById('btnDeleteGroup').style.display = 'none';
        } else {
            statusBox.innerHTML = '<span style="color:#e74c3c;"><i class="fas fa-times-circle"></i> Não Conectado</span>';
            connectBtn.style.display = 'inline-block';
            disconnectBtn.style.display = 'none';
            if (document.getElementById('btnCreateGroup')) document.getElementById('btnCreateGroup').style.display = 'none';
            if (document.getElementById('btnDeleteGroup')) document.getElementById('btnDeleteGroup').style.display = 'none';
        }
    }
} catch(e) {
        console.error(e);
    }
}

let waTimer = null;
async function showWaModal() {
    const status = await window.api.getWaStatus();
    
    showModal('Vincular WhatsApp', `
        <div style="text-align:center; padding: 1rem;">
            <p style="margin-bottom: 0.5rem; color: var(--text-secondary);" id="waModalText">
                Aguarde... Solicitando QR Code oficial.<br>
                Abra o WhatsApp no seu celular, vá em <strong>Aparelhos Conectados</strong>.
            </p>
            <div id="waCountdown" style="font-weight: bold; color: var(--accent-primary); margin-bottom: 1rem; font-size: 1.1rem; display: ${status.lastQr ? 'none' : 'block'};">
                Iniciando motor em 60s...
            </div>
            <div id="qrCodeContainer" style="margin: 0 auto; background: white; padding: 15px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.5); min-height: 250px; min-width: 250px;">
                ${status.lastQr ? `<img src="${status.lastQr}" style="display: block; width: 250px; height: 250px;">` : '<div class="loading-spinner" style="margin-top:100px;"></div>'}
            </div>
            
            <div class="modal-actions" style="margin-top:1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar/Fechar</button>
            </div>
        </div>
    `);

    if (waTimer) clearInterval(waTimer);
    if (!status.lastQr) {
        let attempt = 1;
        let timeLeft = 15;
        const countdownEl = document.getElementById('waCountdown');
        
        const updateText = () => {
            if (countdownEl) {
                countdownEl.innerHTML = `<span style="color:var(--accent-primary); font-weight:700;">Tentativa ${attempt} de 3</span><br><span style="font-size: 0.9rem; font-weight: normal; color: var(--text-muted);">Aguarde a liberação: ${timeLeft}s...</span>`;
            }
        };

        updateText();

        waTimer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                if (attempt < 3) {
                    attempt++;
                    timeLeft = 15;
                    updateText();
                } else {
                    clearInterval(waTimer);
                    if (countdownEl) {
                        countdownEl.style.color = "#e74c3c";
                        countdownEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Não foi possível conectar.<br><span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">O navegador demorou demais ou houve um bloqueio. Tente novamente.</span>';
                    }
                    const qrDiv = document.getElementById('qrCodeContainer');
                    if (qrDiv) qrDiv.innerHTML = '<i class="fas fa-plug" style="font-size: 3rem; color: var(--text-muted); margin-top: 80px;"></i>';
                }
            } else {
                updateText();
            }
        }, 1000);
    }
}

async function disconnectWa() {
    if(confirm('Tem certeza que deseja desvincular o WhatsApp do Controle Financeiro? Você precisará ler um novo QR Code para reconectar depois.')) {
        document.getElementById('waConnectionStatus').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Desconectando...';
        await window.api.logoutWa();
        setTimeout(checkWaStatus, 2000);
    }
}

// Ouvintes de Eventos Globais do WhatsApp
window.api.onWaQr((qrBase64) => {
    if (waTimer) clearInterval(waTimer);
    const countdownEl = document.getElementById('waCountdown');
    if (countdownEl) countdownEl.style.display = 'none';
    const textEl = document.getElementById('waModalText');
    if (textEl) textEl.innerHTML = '<strong>QR Code pronto!</strong> Escaneie agora para conectar:';

    const qrDiv = document.getElementById('qrCodeContainer');
    if (qrDiv) {
        qrDiv.innerHTML = `<img src="${qrBase64}" style="display: block; width: 250px; height: 250px;">`;
    }
});


window.api.onWaAuth(() => {
    const qrDiv = document.getElementById('qrCodeContainer');
    if (qrDiv) {
        qrDiv.innerHTML = '<h3 style="color:#25d366; margin-top:100px;"><i class="fas fa-check-circle"></i> Autenticado! Iniciando sistema...</h3>';
    }
    checkWaStatus();
});

window.api.onWaReady(() => {
    closeModal();
    checkWaStatus();
    // Você não precisa mais do "Robô" físico :)
});

window.api.onWaDisconnected((reason) => {
    console.log('WA desconectado', reason);
    checkWaStatus();
});

window.api.onWaNewCupom((fileName) => {
    alert('📥 Novo cupom físico identificado e recebido pelo WhatsApp!');
    // Recarrega algo se necessário
});




// Gerador de QR Code Pix (VERSÃO BLINDADA)
function showPixQRCode(directData = null) {
    let chaveRaw = (directData ? directData.chave : document.getElementById('gPix')?.value) || '';
    let pixNomeRaw = (directData ? directData.pix_nome : document.getElementById('gPixNome')?.value) || '';
    const valor = directData ? directData.valor : (parseFloat(document.getElementById('gValor')?.value?.replace(',', '.')) || 0);
    const itemRaw = (directData ? directData.item : (document.getElementById('gDesc')?.value || 'CONTROLE')) || 'CONTROLE';

    // Limpeza da Chave PIX: Apenas remove espaços em branco das pontas.
    let chave = chaveRaw.replace(/\s/g, '');

    if (!chave) {
        alert('Por favor, digite a chave PIX primeiro.');
        return;
    }

    // Assistente EMV: Garante o tamanho exato de cada pedaço do código
    function emv(id, value) {
        const idStr = id.toString().padStart(2, '0');
        const lenStr = value.length.toString().padStart(2, '0');
        return idStr + lenStr + value;
    }

    // Montador de Pix Oficial (Versão Bradesco/Strict)
    function generatePixPayload(key, amount, description, pixNomeStr) {
        let p = '';
        p += emv(0, '01'); // PFI
        p += emv(1, '11'); // Static
        
        // Classificação e Limpeza da Chave
        let finalKey = key.trim();
        
        // Verifica se é E-mail ou Chave Aleatória (EVP)
        if (!finalKey.includes('@') && !/^[0-9a-f\-]{36}$/i.test(finalKey)) {
            // Se não é e-mail nem EVP, deve ser CPF, CNPJ ou Celular.
            // BACEN exige que essas chaves contenham APENAS números no payload.
            const digitos = finalKey.replace(/\D/g, '');
            
            if (digitos.length === 14) {
                // CNPJ puro
                finalKey = digitos;
            } else if (digitos.length === 11) {
                // Pode ser CPF ou Celular Com DDD
                const temSinalFone = /[\(\)\s\+]/.test(finalKey);
                const temPontoCpf = finalKey.includes('.');
                if (temPontoCpf) {
                    finalKey = digitos; // CPF
                } else if (temSinalFone || digitos[2] === '9') {
                    finalKey = '+55' + digitos; // Celular (BACEN exige +55 no inicio)
                } else {
                    finalKey = digitos; // CPF sem formatação
                }
            } else if (digitos.length === 10) {
                finalKey = '+55' + digitos; // Celular sem o 9
            } else if (digitos.length === 13 && digitos.startsWith('55')) {
                finalKey = '+' + digitos; // Já tem 55, só põe o +
            } else {
                finalKey = digitos; // Outro tamanho esquisito
            }
        }

        const mai = emv(0, 'br.gov.bcb.pix') + emv(1, finalKey);
        p += emv(26, mai);
        
        p += emv(52, '0000'); // MCC
        p += emv(53, '986'); // BRL
        
        // Formatação de valor: Se for inteiro, manda sem ponto decimal (Melhor para Bradesco)
        if (amount > 0) {
            const amtStr = amount % 1 === 0 ? amount.toString() : amount.toFixed(2);
            p += emv(54, amtStr);
        }

        p += emv(58, 'BR'); // Country
        
        // Extração tática de nome: Bradesco falha se houver mais caracteres especiais ou acentos invisíveis
        let finalName = '';
        if (pixNomeStr) {
            finalName = pixNomeStr.normalize("NFD").replace(/[^a-zA-Z0-9 ]/g, "").toUpperCase().trim();
        } else {
            // Fallback para a primeira palavra da descrição (como feito previamente)
            finalName = description.split(' ')[0].split('-')[0].normalize("NFD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        }
        
        p += emv(59, finalName.substring(0, 25) || 'CONTROLE'); 
        
        p += emv(60, 'SAOPAULO'); // Cidade Sem Espaços
        
        // Bradesco recusa estático se não tiver a TAG 62 (TXID). O padrão BACEN diz que se não há TXID, usa ***
        p += emv(62, emv(5, '***')); 
        
        p += '6304';

        // Cálculo do Checksum de Segurança (CRC16 CCITT)
        function getCRC16(data) {
            let crc = 0xFFFF;
            for (let i = 0; i < data.length; i++) {
                crc ^= data.charCodeAt(i) << 8;
                for (let j = 0; j < 8; j++) {
                    if ((crc & 0x8000) !== 0) {
                        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                    } else {
                        crc = (crc << 1) & 0xFFFF;
                    }
                }
            }
            return crc.toString(16).toUpperCase().padStart(4, '0');
        }

        return p + getCRC16(p);
    }

    const pixCode = generatePixPayload(chave, valor, itemRaw, pixNomeRaw);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode)}`;

    const modal = document.getElementById('modalContainer');
    const modalContent = modal.querySelector('.modal-content');
    modalContent.classList.remove('modal-lg', 'modal-xl');
    modalContent.classList.add('modal-lg');

    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');

    titleEl.textContent = 'Pagar com PIX Oficial';
    bodyEl.innerHTML = `
        <div style="text-align: center; padding: 1rem;">
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">Escaneie agora com o app do seu banco:</p>
            <div style="background: white; padding: 15px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                <img src="${qrUrl}" style="display: block; width: 250px; height: 250px;">
            </div>
            <div style="margin-top: 1.5rem; text-align: left; background: var(--bg-elevated); padding: 1rem; border-radius: 8px;">
                <p style="font-size: 0.8rem; color: var(--text-muted); word-break: break-all; margin-bottom: 10px; font-family: monospace; border: 1px dashed #555; padding: 5px;">
                    ${pixCode}
                </p>
                <p><strong>Favorecido:</strong> ${pixNomeRaw || itemRaw}</p>
                <p><strong>Valor:</strong> ${formatCurrency(valor)}</p>
                <p><strong>Chave:</strong> ${chave}</p>
            </div>
            <div style="margin-top: 1rem;">
                <button class="btn btn-secondary btn-sm" id="copyPixBtn" style="width: 100%;">
                    <i class="fas fa-copy"></i> Copiar Código Pix (Copia e Cola)
                </button>
            </div>
            <div class="modal-actions" style="margin-top:1.5rem;">
                <button type="button" class="btn btn-primary" id="confirmPixPaidBtn">Já paguei / Fechar</button>
            </div>
        </div>
    `;
    modal.classList.add('show');

    // Botão de Copiar Pix
    document.getElementById('copyPixBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(pixCode);
        const btn = document.getElementById('copyPixBtn');
        const oldText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
        setTimeout(() => btn.innerHTML = oldText, 2000);
    });

    // Botão de confirmação de pagamento para dar baixa automática
    document.getElementById('confirmPixPaidBtn')?.addEventListener('click', async () => {
        if (directData?.bulkIds) {
            const btn = document.getElementById('confirmPixPaidBtn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
            btn.disabled = true;

            for (const itemBulk of directData.bulkIds) {
                if (itemBulk.tipo === 'parcela') await window.api.marcarParcelaPaga(itemBulk.id, true);
                else await window.api.marcarGastoPago(itemBulk.id, true);
            }
        } else if (directData?.id) {
             // Se for pagamento individual da lista, também damos baixa automática
             const targetId = directData.id;
             if (directData.tipo === 'parcela') await window.api.marcarParcelaPaga(targetId, true);
             else await window.api.marcarGastoPago(targetId, true);
        }

        modal.classList.remove('show');
        document.body.classList.remove('modal-open');
        loadGastos();
    });
}

async function sendPDFWhatsApp(pessoaId, mes, ano, btn) {
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const p = await window.api.getUserByIdPessoa(pessoaId);
        if (!p || !p.whatsapp) {
            alert('Esta pessoa não possui WhatsApp cadastrado. Edite o perfil primeiro.');
            btn.disabled = false;
            btn.innerHTML = originalContent;
            return;
        }

        // 1. Gera o PDF chamando a mesma lógica do exportYearlyPDF
        // Mas precisamos que ela retorne o caminho do arquivo
        const res = await exportYearlyPDF(pessoaId, mes, ano, btn, true); 
        
        if (res && res.success) {
            btn.innerHTML = '<i class="fas fa-robot"></i>';
            // 2. Chama a automação Python
            const zapRes = await window.api.sendWhatsAppAutomation(res.path, p.whatsapp, p.nome);
            if (!zapRes.success) {
                alert('Erro na automação: ' + zapRes.error);
            }
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao processar: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

window.showWaModal = showWaModal;
window.disconnectWa = disconnectWa;
window.closeModal = closeModal;
window.exportYearlyPDF = exportYearlyPDF;
window.loadSetup = loadSetup;
window.showModalCategoria = showModalCategoria;
window.showPixQRCode = showPixQRCode;
window.sendPDFWhatsApp = sendPDFWhatsApp;
window.showModalMeioPagamento = showModalMeioPagamento;
window.showCreateGroupModal = showCreateGroupModal;
window.handleDeleteGroup = handleDeleteGroup;

async function handleDeleteGroup() {
    if (confirm('Deseja realmente REMOVER o grupo "CONTROLE FINANCEIRO" do seu WhatsApp? Isso fará com que você saia do grupo e a conversa seja excluída.')) {
        const btn = document.getElementById('btnDeleteGroup');
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Removendo...';

        try {
            const res = await window.api.deleteWaGroup('CONTROLE FINANCEIRO');
            if (res.success) {
                document.getElementById('btnCreateGroup').style.display = 'inline-block';
                document.getElementById('btnDeleteGroup').style.display = 'none';
                setTimeout(checkWaStatus, 3000);
                alert('Grupo removido com sucesso!');
            } else {
                alert('Aviso: ' + res.error);
            }
        } catch (err) {
            alert('Erro ao remover: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    }
}

async function showCreateGroupModal() {
    const pessoas = await window.api.getPessoas();
    const comZap = pessoas.filter(p => p.whatsapp && p.whatsapp.trim() !== '');

    if (comZap.length === 0) {
        alert('Não há ninguém com WhatsApp cadastrado para criar um grupo.');
        return;
    }

    let listHtml = comZap.map(p => `
        <div style="display:flex; align-items:center; gap: 10px; padding: 10px; background: rgba(255,255,255,0.05); margin-bottom:5px; border-radius:8px;">
            <img src="${p.foto ? `app-file://uploads/pessoas/${p.foto}` : '../../assets/icons/default-avatar.png'}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:0.9rem;">${p.nome}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${formatWhatsApp(p.whatsapp)}</div>
            </div>
            <i class="fas fa-check-circle" style="color:var(--accent-success);"></i>
        </div>
    `).join('');

    showModal('Criar Grupo Controle Financeiro', `
        <div style="padding: 1rem;">
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                O sistema criará o grupo <strong>CONTROLE FINANCEIRO</strong> e adicionará automaticamente as seguintes pessoas:
            </p>
            <div style="max-height: 250px; overflow-y: auto; margin-bottom: 1.5rem;">
                ${listHtml}
            </div>
            <p style="font-size: 0.8rem; color: var(--accent-warning); margin-bottom: 1.5rem;">
                <i class="fas fa-info-circle"></i> Atenção: O seu contato será o administrador do grupo. É necessário que o celular esteja conectado.
            </p>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-primary" id="btnConfirmGroupCreate">
                   <i class="fab fa-whatsapp"></i> Criar Grupo Agora
                </button>
            </div>
        </div>
    `);

    document.getElementById('btnConfirmGroupCreate').onclick = async () => {
        const btn = document.getElementById('btnConfirmGroupCreate');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';

        try {
            const participantes = comZap.map(p => p.whatsapp);
            const res = await window.api.createWaGroup('CONTROLE FINANCEIRO', participantes);
            
            if (res.success) {
                document.getElementById('btnCreateGroup').style.display = 'none';
                document.getElementById('btnDeleteGroup').style.display = 'inline-block';
                setTimeout(checkWaStatus, 3000);
                alert('Grupo "CONTROLE FINANCEIRO" criado com sucesso no seu WhatsApp!');
                closeModal();
            } else {
                throw new Error(res.error);
            }
        } catch (err) {
            alert('Falha ao criar grupo: ' + err.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="fab fa-whatsapp"></i> Criar Grupo Agora';
        }
    };
}

async function loadMeiosPagamento() {
    const list = document.getElementById('meiosPagamentoList');
    if (!list) return;

    try {
        const mps = await window.api.getMeiosPagamento();
        
        if (mps.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1rem;">Nenhum meio cadastrado.</p>';
            return;
        }

        list.innerHTML = mps.map(m => `
            <div class="setup-list-item">
                <span>${m.nome}</span>
                <button class="btn-icon delete-mp" data-id="${m.id}" title="Excluir">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');

        list.querySelectorAll('.delete-mp').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm(`Deseja excluir o meio de pagamento "${btn.parentElement.querySelector('span').textContent}"?`)) {
                    await window.api.deleteMeioPagamento(btn.dataset.id);
                    loadMeiosPagamento();
                }
            });
        });
    } catch (e) {
        list.innerHTML = '<p style="color:#e74c3c;">Erro ao carregar meios.</p>';
    }
}

function showModalMeioPagamento() {
    showModal('Novo Meio de Pagamento', `
        <form id="mpForm">
            <div class="form-group">
                <label>Nome do Meio (Ex: Vale Refeição, Boleto...)</label>
                <input type="text" id="mpNome" class="form-control" placeholder="Ex: Dinheiro, PIX..." required autofocus>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
        </form>
    `);

    document.getElementById('mpForm').onsubmit = async (e) => {
        e.preventDefault();
        const nome = document.getElementById('mpNome').value.trim();
        if (!nome) return;
        try {
            await window.api.addMeioPagamento(nome);
            closeModal();
            loadMeiosPagamento();
        } catch (err) {
            alert('Erro ao salvar: o nome pode já existir.');
        }
    };
}
async function syncCloudData() {
    try {
        const userId = sessionStorage.getItem('userId') || 1;
        console.log('[CLOUD] Verificando novos dados na nuvem para o usuário:', userId);
        const res = await window.api.getCloudMessages(userId);
        
        if (!res.success || !res.data || res.data.length === 0) {
            return; // Nada para sincronizar
        }

        const mensagens = res.data;
        const pessoas = await window.api.getPessoas();

        // 1. Cruzamento de dados: Associar cada mensagem a uma pessoa pelo telefone
        let tableRows = mensagens.map(m => {
            const mPhone = normalizePhone(m.wa_id);
            // Procura pessoa que tenha o mesmo final do número (últimos 8 dígitos para ser seguro com DDI/DDD)
            const pessoa = pessoas.find(p => {
                const pPhone = normalizePhone(p.whatsapp);
                return pPhone && pPhone.endsWith(mPhone.substring(mPhone.length - 8));
            });

            const nomePessoa = pessoa ? pessoa.nome : `<span style="color:var(--accent-warning);">Desconhecido (${m.wa_id})</span>`;
            const pId = pessoa ? pessoa.id : null;

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 12px; font-size: 0.85rem;">
                        <div style="font-weight: 700; color: var(--accent-primary);">${nomePessoa}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${new Date(m.timestamp).toLocaleString()}</div>
                    </td>
                    <td style="padding: 12px; font-size: 0.85rem; color: var(--text-primary);">
                        ${m.corpo || (m.tipo === 'image' ? '📸 Cupom Fiscal' : '---')}
                    </td>
                    <td style="padding: 12px; text-align: right;">
                        <button class="btn btn-primary" onclick="importCloudMessage('${m.id}', '${m.corpo.replace(/'/g, "\\'")}', ${pId})" style="padding: 6px 12px; font-size: 0.75rem;">
                            Carregar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // 2. Mostrar o Modal de Carga de Dados (Só aparece se tiver algo novo)
        showModal('Novos Dados do WhatsApp Detectados', `
            <div style="padding: 0.5rem;">
                <p style="font-size: 0.9rem; color: var(--text-primary); margin-bottom: 1rem; font-weight: 600;">
                    <i class="fas fa-cloud-download-alt" style="margin-right: 8px; color: var(--accent-primary);"></i>
                    Encontramos ${mensagens.length} despesas enviadas pelo WhatsApp enquanto você estava fora.
                </p>
                <div style="max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: rgba(255,255,255,0.03); position: sticky; top: 0;">
                            <tr>
                                <th style="text-align: left; padding: 12px; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted);">Pessoa / Data</th>
                                <th style="text-align: left; padding: 12px; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted);">Mensagem</th>
                                <th style="text-align: right; padding: 12px; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted);">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                <div class="modal-actions" style="margin-top: 1.5rem; justify-content: center;">
                    <button class="btn btn-secondary" onclick="closeModal()" style="width: 200px;">Verificar depois</button>
                </div>
            </div>
        `);
    } catch (err) {
        console.error('[CLOUD] Erro na sincronização automática:', err);
    }
}

async function importCloudMessage(cloudId, corpo, pessoaId) {
    // 1. Se identificamos a pessoa, trocamos a visualização para ela antes de abrir o modal
    if (pessoaId) {
        const pessoas = await window.api.getPessoas();
        const p = pessoas.find(x => x.id == pessoaId);
        if (p) {
            // Simula o clique na pessoa para abrir a vista dela
            window.openPessoa(p);
        }
    } else {
        alert('Esta mensagem veio de um número não cadastrado. Selecione uma pessoa manualmente primeiro.');
        return;
    }

    // Tenta extrair um valor numérico do corpo
    let valorSugerido = '';
    const match = corpo.match(/(\d+[\.,]\d{2})|(\d+)/);
    if (match) {
        valorSugerido = match[0].replace(',', '.');
    }

    // 2. Abre o modal de Novo Gasto
    closeModal();
    // Pequeno delay para garantir que a pessoa foi selecionada
    setTimeout(() => {
        showModalGasto();
        
        setTimeout(() => {
            const descInput = document.getElementById('gDesc');
            const valorInput = document.getElementById('gValor');
            
            if (descInput) descInput.value = corpo;
            if (valorInput && valorSugerido) {
                valorInput.value = valorSugerido;
                valorInput.dispatchEvent(new Event('input'));
            }
            
            const form = document.getElementById('gastoForm');
            if (form) {
                form.onsubmit = async (e) => {
                    const markRes = await window.api.markCloudMessageImported(cloudId);
                    if (markRes.success) {
                        console.log('Mensagem processada na nuvem.');
                        // Opcional: Verificar se há mais mensagens e reabrir o modal de sincronização
                        setTimeout(syncCloudData, 1000);
                    }
                };
            }
        }, 200);
    }, 300);
}

window.importCloudMessage = importCloudMessage;
window.activateCloudSyncUI = activateCloudSyncUI;
window.checkCloudStatus = checkCloudStatus;

// --- FUNÇÕES DE SINCRONIZAÇÃO EM NUVEM (TENANT AUTO-ACTIVATION) ---

async function checkCloudStatus() {
    try {
        const userId = sessionStorage.getItem('userId') || 1;
        const admin = await window.api.getUserById(userId);
        const badge = document.getElementById('cloudStatusBadge');
        const btn = document.getElementById('btnActivateCloud');
        const tokenInfo = document.getElementById('cloudTokenInfo');
        
        // Elementos do WhatsApp que dependem da nuvem
        const btnWaConnect = document.getElementById('btnWaConnect');
        const waReqMsg = document.getElementById('cloudRequirementMsg');
        const waStatusText = document.getElementById('waConnectionStatus');

        if (admin && admin.cloud_activated) {
            badge.innerHTML = '<i class="fas fa-check-circle"></i> Sincronização Ativa';
            badge.style.background = 'rgba(37, 211, 102, 0.2)';
            badge.style.color = '#25d366';
            btn.style.display = 'none';
            tokenInfo.style.display = 'block';
            const token = admin.cloud_token || 'Gerando...';
            tokenInfo.innerText = `ID: ${token.substring(0, 15)}...`;

            // Libera o WhatsApp
            if (waReqMsg) waReqMsg.style.display = 'none';
            // Chama a função original de status do WA que já existe no dashboard.js
            if (typeof window.updateWaStatusUI === 'function') window.updateWaStatusUI();
            else checkWaStatus(); 
        } else {
            badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Não Ativada';
            badge.style.background = 'rgba(231, 76, 60, 0.2)';
            badge.style.color = '#e74c3c';
            btn.style.display = 'block';
            tokenInfo.style.display = 'none';

            // Bloqueia o WhatsApp
            if (btnWaConnect) btnWaConnect.style.display = 'none';
            if (waReqMsg) waReqMsg.style.display = 'block';
            if (waStatusText) waStatusText.innerHTML = '<i class="fas fa-lock"></i> Bloqueado (Ative a Nuvem)';
        }
    } catch (err) {
        console.error('Erro ao verificar status da nuvem:', err);
    }
}

async function activateCloudSyncUI() {
    try {
        const userId = sessionStorage.getItem('userId') || 1;
        const admin = await window.api.getUserById(userId);
        
        console.log('[CLOUD-DEBUG] Perfil carregado:', admin);

        if (!admin || !admin.nome || admin.nome.toLowerCase() === 'administrador' || admin.nome.toLowerCase() === 'ricardo' || !admin.whatsapp) {
            Swal.fire({
                title: 'Perfil Incompleto',
                html: `Por favor, complete seu <b>Nome Real</b> e <b>WhatsApp</b> no seu perfil antes de ativar a nuvem.<br><br><small style="color:#888;">(Seu nome atual: ${admin ? admin.nome : 'Nenhum'})</small>`,
                icon: 'warning',
                confirmButtonText: 'Ir para Perfil'
            }).then(() => {
                showModalPerfil();
            });
            return;
        }

        const result = await Swal.fire({
            title: 'Ativar Nuvem?',
            text: `Usaremos seu nome (${admin.nome}) e WhatsApp (${formatWhatsApp(admin.whatsapp)}) para configurar a sincronização automática.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sim, Ativar!',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            showLoading('Configurando sua nuvem segura...');
            
            const response = await window.api.activateCloudSync({
                userData: {
                    nome: admin.nome,
                    whatsapp: admin.whatsapp
                },
                userId: userId
            });

            hideLoading();

            if (response.success) {
                await Swal.fire('Sucesso!', 'Sincronização em nuvem ativada! Agora você pode conectar seu WhatsApp.', 'success');
                checkCloudStatus();
            } else {
                Swal.fire('Erro', 'Não foi possível ativar a nuvem: ' + response.error, 'error');
            }
        }
    } catch (err) {
        hideLoading();
        Swal.fire('Erro', 'Ocorreu um erro inesperado: ' + err.message, 'error');
    }
}

// Funções Utilitárias de Carregamento (SweetAlert2)
function showLoading(msg = 'Carregando...') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: msg,
            allowOutsideClick: false,
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            didOpen: () => {
                Swal.showLoading();
            }
        });
    } else {
        console.log('Loading: ' + msg);
    }
}

function hideLoading() {
    if (typeof Swal !== 'undefined') {
        Swal.close();
    }
}

// Exposição global das funções necessárias para o HTML
window.activateCloudSyncUI = activateCloudSyncUI;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
