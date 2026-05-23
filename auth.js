(function () {
  "use strict";

  const SESSION_KEY = "wm_admin_session";

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY));
    } catch (error) {
      return null;
    }
  }

  function saveSession(access) {
    const session = {
      id: access.id,
      email: access.email,
      nome: access.nome
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async function login(email, password) {
    const result = await supabaseClient
      .from("acessos")
      .select("id, email, nome")
      .eq("email", email.trim())
      .eq("senha", password)
      .eq("ativo", true)
      .maybeSingle();

    if (result.error) {
      console.error("Falha ao consultar acesso administrativo:", result.error);
      return null;
    }

    return result.data ? saveSession(result.data) : null;
  }

  async function validateSession() {
    const session = getSession();
    if (!session || !session.id || !session.email) {
      return null;
    }

    const result = await supabaseClient
      .from("acessos")
      .select("id, email, nome")
      .eq("id", session.id)
      .eq("email", session.email)
      .eq("ativo", true)
      .maybeSingle();

    if (result.error || !result.data) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }

    return saveSession(result.data);
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = "login.html";
  }

  async function requireAuth() {
    const session = await validateSession();
    if (!session) {
      window.location.replace("login.html");
      return null;
    }
    return session;
  }

  window.WMAuth = {
    getSession: getSession,
    login: login,
    logout: logout,
    requireAuth: requireAuth,
    validateSession: validateSession
  };

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    (async function initializeLogin() {
      if (await validateSession()) {
        window.location.replace("admin.html");
        return;
      }

      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const submitButton = loginForm.querySelector('button[type="submit"]');
        const errorMessage = document.getElementById("login-error");
        const formData = new FormData(loginForm);
        errorMessage.classList.add("is-hidden");
        submitButton.disabled = true;
        submitButton.textContent = "Entrando...";

        try {
          if (await login(formData.get("email"), formData.get("password"))) {
            window.location.href = "admin.html";
            return;
          }
          errorMessage.textContent = "Usuário ou senha inválidos";
          errorMessage.classList.remove("is-hidden");
        } catch (error) {
          console.error("Falha ao realizar login:", error);
          errorMessage.textContent = "Usuário ou senha inválidos";
          errorMessage.classList.remove("is-hidden");
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = "Entrar";
        }
      });
    })();
  }
})();
