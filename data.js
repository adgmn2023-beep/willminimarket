(function () {
  "use strict";

  const CART_KEY = "wm_cart";
  const PRODUCT_BUCKET = "produtos";
  const EMPTY_SETTINGS = {
    id: null,
    name: "Will Minimarket",
    address: "Campo Grande, Rio de Janeiro - RJ",
    whatsapp: "(21) 96902-1990",
    isOpen: true,
    deliveryFee: 0,
    estimatedTime: "-"
  };

  function assertResult(result, action) {
    if (result.error) {
      console.error("Erro ao " + action + ":", result.error);
      throw result.error;
    }
    return result.data;
  }

  function escapeSvg(value) {
    return value.replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function placeholderImage(name, tone) {
    const label = escapeSvg((name || "Produto").split(" ").slice(0, 2).join(" "));
    const color = tone || "#dbe9da";
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300" viewBox="0 0 420 300">' +
      '<rect width="420" height="300" fill="' + color + '"/>' +
      '<circle cx="210" cy="116" r="55" fill="#ffffff" fill-opacity=".4"/>' +
      '<path d="M171 123h78l-8 47h-62z" fill="#1b4d1e" fill-opacity=".74"/>' +
      '<path d="M187 119a23 23 0 0 1 46 0" fill="none" stroke="#1b4d1e" stroke-width="7"/>' +
      '<text x="210" y="224" text-anchor="middle" fill="#1a1a1a" font-family="Arial" font-size="22" font-weight="700">' +
      label + "</text></svg>";
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function mapCategory(row) {
    return {
      id: row.id,
      name: row.nome,
      order: Number(row.ordem || 0),
      active: Boolean(row.ativo)
    };
  }

  function mapProduct(row) {
    const relation = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
    return {
      id: row.id,
      name: row.nome,
      description: row.descricao || "",
      price: Number(row.preco || 0),
      image: row.imagem_url || "",
      categoryId: row.categoria_id,
      category: relation ? mapCategory(relation) : null,
      available: Boolean(row.disponivel),
      order: Number(row.ordem || 0)
    };
  }

  function mapSettings(row) {
    if (!row) {
      return Object.assign({}, EMPTY_SETTINGS);
    }
    return {
      id: row.id,
      name: row.nome_loja,
      address: row.endereco,
      whatsapp: row.whatsapp,
      isOpen: row.status_loja !== "fechada",
      deliveryFee: Number(row.taxa_entrega || 0),
      estimatedTime: row.tempo_entrega || "-"
    };
  }

  function productPayload(product) {
    const payload = {
      nome: product.name.trim(),
      descricao: product.description.trim(),
      preco: Number(product.price),
      imagem_url: product.image ? product.image.trim() : null,
      categoria_id: product.categoryId,
      disponivel: Boolean(product.available)
    };
    if (Number.isFinite(Number(product.order))) {
      payload.ordem = Number(product.order);
    }
    return payload;
  }

  function categoryPayload(category) {
    return {
      nome: category.name.trim(),
      ordem: Number(category.order),
      ativo: Boolean(category.active)
    };
  }

  async function getCategories() {
    const result = await supabaseClient
      .from("categorias")
      .select("*")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    return assertResult(result, "carregar categorias").map(mapCategory);
  }

  async function getAdminCategories() {
    const result = await supabaseClient
      .from("categorias")
      .select("*")
      .order("ordem", { ascending: true });
    return assertResult(result, "carregar categorias").map(mapCategory);
  }

  async function getProducts() {
    const result = await supabaseClient
      .from("produtos")
      .select("*, categorias!inner(id, nome, ordem, ativo)")
      .eq("disponivel", true)
      .eq("categorias.ativo", true)
      .order("ordem", { ascending: true });
    return assertResult(result, "carregar produtos").map(mapProduct);
  }

  async function getAdminProducts() {
    const result = await supabaseClient
      .from("produtos")
      .select("*, categorias(id, nome, ordem, ativo)")
      .order("ordem", { ascending: true });
    return assertResult(result, "carregar produtos").map(mapProduct);
  }

  async function getSettings() {
    const result = await supabaseClient
      .from("configuracoes_loja")
      .select("*")
      .limit(1)
      .maybeSingle();
    return mapSettings(assertResult(result, "carregar configurações da loja"));
  }

  async function createProduct(product) {
    const result = await supabaseClient
      .from("produtos")
      .insert(productPayload(product))
      .select("*")
      .single();
    return assertResult(result, "criar produto");
  }

  async function updateProduct(id, product) {
    const result = await supabaseClient
      .from("produtos")
      .update(productPayload(product))
      .eq("id", id)
      .select("*")
      .single();
    return assertResult(result, "atualizar produto");
  }

  async function toggleProduct(id, available) {
    const result = await supabaseClient.from("produtos").update({ disponivel: available }).eq("id", id);
    assertResult(result, "alterar disponibilidade");
  }

  async function deleteProduct(id) {
    const result = await supabaseClient.from("produtos").delete().eq("id", id);
    assertResult(result, "excluir produto");
  }

  function storageFileName(name) {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  async function checkProductBucket() {
    const warning = "⚠️ Crie o bucket 'produtos' no Supabase Storage com acesso público";
    try {
      const result = await supabaseClient.storage.listBuckets();
      if (!result.error && result.data.some(function (bucket) { return bucket.name === PRODUCT_BUCKET && bucket.public; })) {
        return true;
      }
      console.warn(warning);
      return false;
    } catch (error) {
      console.warn(warning);
      return false;
    }
  }

  async function uploadProductImage(file) {
    const fileName = storageFileName(file.name) || "imagem";
    const path = "produtos/" + Date.now() + "_" + fileName;
    const result = await supabaseClient.storage.from(PRODUCT_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false
    });
    assertResult(result, "enviar imagem do produto");
    return {
      path: path,
      url: supabaseClient.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl
    };
  }

  function publicStoragePath(imageUrl) {
    const marker = "/storage/v1/object/public/" + PRODUCT_BUCKET + "/";
    const start = imageUrl ? imageUrl.indexOf(marker) : -1;
    if (start === -1) {
      return null;
    }
    return decodeURIComponent(imageUrl.slice(start + marker.length).split("?")[0]);
  }

  async function removeProductImage(imageUrl) {
    const path = publicStoragePath(imageUrl);
    if (!path) {
      return;
    }
    const result = await supabaseClient.storage.from(PRODUCT_BUCKET).remove([path]);
    assertResult(result, "remover imagem anterior do produto");
  }

  async function createCategory(category) {
    const result = await supabaseClient.from("categorias").insert(categoryPayload(category));
    assertResult(result, "criar categoria");
  }

  async function updateCategory(id, category) {
    const result = await supabaseClient.from("categorias").update(categoryPayload(category)).eq("id", id);
    assertResult(result, "atualizar categoria");
  }

  async function deleteCategory(id) {
    const productResult = await supabaseClient
      .from("produtos")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", id);
    assertResult(productResult, "verificar produtos da categoria");
    if (productResult.count > 0) {
      throw new Error("CATEGORY_HAS_PRODUCTS");
    }
    const result = await supabaseClient.from("categorias").delete().eq("id", id);
    assertResult(result, "excluir categoria");
  }

  async function saveSettings(settings) {
    const payload = {
      nome_loja: settings.name.trim(),
      endereco: settings.address.trim(),
      whatsapp: settings.whatsapp.trim(),
      status_loja: settings.isOpen ? "aberta" : "fechada",
      taxa_entrega: Number(settings.deliveryFee),
      tempo_entrega: settings.estimatedTime.trim()
    };
    const result = await supabaseClient.from("configuracoes_loja").update(payload).eq("id", settings.id);
    assertResult(result, "salvar configurações");
  }

  async function createOrder(order) {
    const result = await supabaseClient
      .from("pedidos")
      .insert({
        nome_cliente: order.nome_cliente,
        telefone: order.telefone,
        forma_entrega: order.forma_entrega,
        endereco: order.endereco,
        forma_pagamento: order.forma_pagamento,
        troco_para: order.troco_para,
        observacoes: order.observacoes,
        itens: order.itens,
        subtotal: order.subtotal,
        taxa_entrega: order.taxa_entrega,
        total: order.total
      })
      .select("id")
      .single();
    return assertResult(result, "salvar pedido");
  }

  async function markWebhookSent(id) {
    const result = await supabaseClient.from("pedidos").update({ webhook_enviado: true }).eq("id", id);
    assertResult(result, "registrar envio do webhook");
  }

  async function getOrders() {
    const result = await supabaseClient
      .from("pedidos")
      .select("*")
      .order("created_at", { ascending: false });
    return assertResult(result, "carregar pedidos");
  }

  async function updateOrderStatus(id, status) {
    const result = await supabaseClient.from("pedidos").update({ status: status }).eq("id", id);
    assertResult(result, "atualizar status do pedido");
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || {};
    } catch (error) {
      return {};
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function productImage(product) {
    return product.image || placeholderImage(product.name);
  }

  window.WMData = {
    checkProductBucket: checkProductBucket,
    createCategory: createCategory,
    createOrder: createOrder,
    createProduct: createProduct,
    deleteCategory: deleteCategory,
    deleteProduct: deleteProduct,
    formatMoney: formatMoney,
    getAdminCategories: getAdminCategories,
    getAdminProducts: getAdminProducts,
    getCart: getCart,
    getCategories: getCategories,
    getOrders: getOrders,
    getProducts: getProducts,
    getSettings: getSettings,
    markWebhookSent: markWebhookSent,
    placeholderImage: placeholderImage,
    productImage: productImage,
    removeProductImage: removeProductImage,
    saveCart: saveCart,
    saveSettings: saveSettings,
    toggleProduct: toggleProduct,
    updateCategory: updateCategory,
    updateOrderStatus: updateOrderStatus,
    updateProduct: updateProduct,
    uploadProductImage: uploadProductImage
  };
})();
