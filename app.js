(() => {
  "use strict";
  const STORAGE_KEY = "naseej-data-v1";
  const $ = (id) => document.getElementById(id);
  const svg = $("network");
  const NS = "http://www.w3.org/2000/svg";
  let data = loadData();
  let selectedId = null;
  let linking = false;
  let toastTimer;

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"nodes":[],"edges":[]}');
      return { nodes: Array.isArray(saved.nodes) ? saved.nodes : [], edges: Array.isArray(saved.edges) ? saved.edges : [] };
    } catch { return { nodes: [], edges: [] }; }
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  function uid() { return (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : "n-" + Date.now() + "-" + Math.random().toString(16).slice(2); }
  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function svgEl(name, attrs = {}) {
    const el = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    return el;
  }
  function positions() {
    const w = Math.max(svg.clientWidth, 320), h = Math.max(svg.clientHeight, 320);
    const cx = w / 2, cy = h / 2, radius = Math.max(75, Math.min(w, h) * .34);
    return data.nodes.map((node, i) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i / Math.max(data.nodes.length, 1));
      const xRatio = Number.isFinite(node.xRatio) ? node.xRatio : (cx + Math.cos(angle) * radius) / w;
      const yRatio = Number.isFinite(node.yRatio) ? node.yRatio : (cy + Math.sin(angle) * radius) / h;
      return { ...node, x: xRatio * w, y: yRatio * h };
    });
  }
  let activeDrag = null;
  let suppressNodeClickUntil = 0;
  svg.addEventListener("pointerdown", event => {
    if (linking || event.button !== 0) return;
    const group = event.target.closest && event.target.closest("g.node");
    if (!group) return;
    const node = data.nodes.find(item => item.id === group.dataset.nodeId);
    if (!node) return;
    activeDrag = { id: node.id, startX: event.clientX, startY: event.clientY, moved: false };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener("pointermove", event => {
    if (!activeDrag) return;
    const dx = event.clientX - activeDrag.startX, dy = event.clientY - activeDrag.startY;
    if (!activeDrag.moved && Math.hypot(dx,dy) < 5) return;
    activeDrag.moved = true;
    const rect = svg.getBoundingClientRect();
    const node = data.nodes.find(item => item.id === activeDrag.id);
    if (!node) return;
    node.xRatio = Math.max(.07, Math.min(.93, (event.clientX - rect.left) / rect.width));
    node.yRatio = Math.max(.09, Math.min(.91, (event.clientY - rect.top) / rect.height));
    suppressNodeClickUntil = Date.now() + 350;
    render();
  });
  function finishDrag() {
    if (!activeDrag) return;
    if (activeDrag.moved) { save(); toast("تم حفظ مكان الفكرة"); }
    activeDrag = null;
  }
  svg.addEventListener("pointerup", finishDrag);
  svg.addEventListener("pointercancel", finishDrag);

  function render() {
    svg.replaceChildren();
    const points = positions(), byId = new Map(points.map(p => [p.id,p]));
    data.edges.forEach(edge => {
      const a = byId.get(edge.from), b = byId.get(edge.to);
      if (a && b) svg.appendChild(svgEl("line", {x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:"edge"}));
    });
    points.forEach(node => {
      const g = svgEl("g", {class:"node " + (node.type === "project" ? "project" : "idea") + (node.id === selectedId ? " selected" : ""), transform:`translate(${node.x} ${node.y})`});
      g.appendChild(svgEl("circle", {r: node.id === selectedId ? 30 : 26}));
      const label = svgEl("text", {y:45});
      const title = node.title.length > 18 ? node.title.slice(0,17) + "…" : node.title;
      label.textContent = title; g.appendChild(label);
      g.dataset.nodeId = node.id;
      g.addEventListener("click", () => {
        if (Date.now() < suppressNodeClickUntil) return;
        if (linking && selectedId && selectedId !== node.id) { connect(selectedId,node.id); return; }
        selectedId = node.id; render();
      });
      svg.appendChild(g);
    });
    $("emptyState").hidden = data.nodes.length > 0;
    $("nodeCount").textContent = data.nodes.length;
    $("edgeCount").textContent = data.edges.length;
    renderDetails();
  }
  function renderDetails() {
    const node = data.nodes.find(n => n.id === selectedId);
    const host = $("detailsContent"); host.replaceChildren();
    const mobileOpen = !!node && window.matchMedia("(max-width: 850px)").matches;
    $("detailsPanel").classList.toggle("is-open", mobileOpen);
    document.body.classList.toggle("details-open", mobileOpen);
    if (!node) {
      host.className = "details-empty";
      host.innerHTML = '<div class="details-symbol">◇</div><h3>لا يوجد عنصر محدد</h3><p>اختر فكرة من الخريطة لعرض تفاصيلها وتعديلها.</p>';
      return;
    }
    host.className = "";
    const pill = document.createElement("span"); pill.className = "type-pill " + node.type; pill.textContent = node.type === "project" ? "مشروع" : "فكرة";
    const title = document.createElement("h3"); title.className = "detail-title"; title.textContent = node.title;
    const desc = document.createElement("p"); desc.className = "detail-description"; desc.textContent = node.description || "لا يوجد وصف مضاف حتى الآن.";
    const actions = document.createElement("div"); actions.className = "detail-actions";
    actions.append(
      actionButton("إغلاق","button button-quiet",() => { selectedId = null; linking = false; render(); }),
      actionButton("تعديل","button button-quiet",() => openDialog(node)),
      actionButton(linking ? "إلغاء الربط" : "ربط بعنصر","button button-quiet",() => {
        if (linking) { linking = false; selectedId = node.id; toast("تم إلغاء وضع الربط"); render(); }
        else { linking = true; selectedId = node.id; toast("اختر العنصر الآخر من الخريطة"); render(); }
      }),
      actionButton("حذف","button button-quiet",() => removeNode(node.id))
    );
    host.append(pill,title,desc,actions);
  }
  function actionButton(label, cls, fn) {
    const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; b.addEventListener("click",fn); return b;
  }
  function openDialog(node = null) {
    $("nodeForm").reset();
    $("nodeId").value = node ? node.id : "";
    $("nodeTitle").value = node ? node.title : "";
    $("nodeType").value = node ? node.type : "idea";
    $("nodeDescription").value = node ? node.description : "";
    $("dialogTitle").textContent = node ? "تعديل العنصر" : "إضافة فكرة";
    $("nodeDialog").showModal();
    $("nodeTitle").focus();
  }
  function removeNode(id) {
    const node = data.nodes.find(n => n.id === id);
    if (!node || !confirm("هل تريد حذف «" + node.title + "»؟")) return;
    data.nodes = data.nodes.filter(n => n.id !== id);
    data.edges = data.edges.filter(e => e.from !== id && e.to !== id);
    selectedId = null; linking = false; save(); render(); toast("تم حذف العنصر");
  }
  function connect(from,to) {
    if (data.edges.some(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))) {
      toast("العلاقة موجودة بالفعل"); linking = false; render(); return;
    }
    data.edges.push({id:uid(),from,to}); linking = false; selectedId = from;
    save(); render(); toast("تم ربط الفكرتين بنجاح");
  }
  $("nodeForm").addEventListener("submit", event => {
    event.preventDefault();
    const id = $("nodeId").value, title = $("nodeTitle").value.trim();
    if (!title) return;
    const values = {title,type:$("nodeType").value,description:$("nodeDescription").value.trim()};
    if (id) Object.assign(data.nodes.find(n => n.id === id), values);
    else { const node = {id:uid(),...values}; data.nodes.push(node); selectedId = node.id; }
    save(); $("nodeDialog").close(); render(); toast(id ? "تم تحديث العنصر" : "تمت إضافة العنصر");
  });
  $("addBtn").addEventListener("click", () => openDialog());
  $("emptyAddBtn").addEventListener("click", () => openDialog());
  $("cancelBtn").addEventListener("click", () => $("nodeDialog").close());
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "naseej-backup.json"; a.click(); URL.revokeObjectURL(url); toast("تم تجهيز النسخة الاحتياطية");
  });
  $("importInput").addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) throw new Error("invalid");
      data = {nodes:parsed.nodes,edges:parsed.edges}; selectedId = null; linking = false; save(); render(); toast("تم استيراد البيانات");
    } catch { toast("ملف النسخة الاحتياطية غير صالح"); }
    event.target.value = "";
  });
  window.addEventListener("resize", render);
  render();
})();