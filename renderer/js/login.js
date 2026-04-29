/**
 * LOGIN.JS - Controle de Acesso e Registro
 */

let isRegistering = false;

const loginForm = document.getElementById('loginForm');
const title = document.getElementById('title');
const subtitle = document.getElementById('subtitle');
const submitBtn = document.getElementById('submitBtn');
const toggleAuth = document.getElementById('toggleAuth');
const toggleText = document.getElementById('toggleText');
const registerNameGroup = document.getElementById('registerNameGroup');
const errorMsg = document.getElementById('errorMessage');
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('senha');
const eyeIcon = document.getElementById('eyeIcon');

togglePassword.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    eyeIcon.classList.toggle('fa-eye');
    eyeIcon.classList.toggle('fa-eye-slash');
});

// Window controls
document.getElementById('minimizeBtn')?.addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('closeBtn')?.addEventListener('click', () => window.api.closeWindow());

toggleAuth.addEventListener('click', () => {
    isRegistering = !isRegistering;
    
    if (isRegistering) {
        title.textContent = 'Criar Conta';
        subtitle.textContent = 'Use seu e-mail para começar agora';
        submitBtn.textContent = 'Cadastrar';
        toggleText.textContent = 'Já possui uma conta?';
        toggleAuth.textContent = 'Fazer Login';
        registerNameGroup.style.display = 'block';
        document.getElementById('regNome').required = true;
    } else {
        title.textContent = 'Bem-vindo';
        subtitle.textContent = 'Faça login com seu e-mail cadastrado';
        submitBtn.textContent = 'Entrar';
        toggleText.textContent = 'Ainda não tem uma conta?';
        toggleAuth.textContent = 'Cadastre-se agora';
        registerNameGroup.style.display = 'none';
        document.getElementById('regNome').required = false;
    }
    errorMsg.style.display = 'none';
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading-spinner"></div>';

    const email = document.getElementById('usuario').value;
    const senha = document.getElementById('senha').value;
    const nome = document.getElementById('regNome')?.value;

    try {
        if (isRegistering) {
            const success = await window.api.createUser(email, senha, nome);
            if (success) {
                alert('Conta criada com sucesso! Faça login agora.');
                toggleAuth.click(); // Volta para login
            } else {
                showError('Este e-mail já está cadastrado ou houve um erro.');
            }
        } else {
            const user = await window.api.login(email, senha);
            if (user) {
                sessionStorage.setItem('userId', user.id);
                sessionStorage.setItem('userName', user.nome);
                window.location.href = 'dashboard.html';
            } else {
                showError('Acesso negado. E-mail ou senha incorretos.');
            }
        }
    } catch (err) {
        console.error(err);
        showError('Erro de conexão com o banco de dados.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isRegistering ? 'Cadastrar' : 'Entrar';
    }
});

function showError(msg) {
    errorMsg.innerHTML = `<strong>Erro!</strong> ${msg}`;
    errorMsg.style.display = 'flex';
}
