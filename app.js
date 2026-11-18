(() => {
  "use strict";
  const STORAGE_KEY = "naseej-data-v1";
  const $ = (id) => document.getElementById(id);
  const svg = $("network");
  const NS = "http://www.w3.org/2000/svg";
  let data = loadData();
  let selectedId = null;
  let linking = false;
  let activeGroupFilter = "all";
  let toastTimer;

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"nodes":[],"edges":[]}');
      return { nodes: Array.isArray(saved.nodes) ? saved.nodes : [], edges: Array.isArray(saved.edges) ? saved.edges : [], groups: Array.isArray(saved.groups) ? saved.groups : [], designs: Array.isArray(saved.designs) ? saved.designs : [] };
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
    if (linking || (event.pointerType === "mouse" && event.button !== 0)) return;
    const group = event.target.closest && event.target.closest("g.node");
    if (!group) return;
    const node = data.nodes.find(item => item.id === group.dataset.nodeId);
    if (!node) return;
    activeDrag = {
      id: node.id, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      moved: false
    };
    try { svg.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
  });
  svg.addEventListener("pointermove", event => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const dx = event.clientX - activeDrag.startX, dy = event.clientY - activeDrag.startY;
    if (!activeDrag.moved && Math.hypot(dx,dy) < 5) return;
    activeDrag.moved = true;
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const node = data.nodes.find(item => item.id === activeDrag.id);
    if (!node) return;
    node.xRatio = Math.max(.07, Math.min(.93, (event.clientX - rect.left) / rect.width));
    node.yRatio = Math.max(.09, Math.min(.91, (event.clientY - rect.top) / rect.height));
    const x = node.xRatio * rect.width, y = node.yRatio * rect.height;
    const group = svg.querySelector('g.node[data-node-id="' + activeDrag.id + '"]');
    if (group) group.setAttribute("transform", "translate(" + x + " " + y + ")");
    const points = positions(), byId = new Map(points.map(p => [p.id,p]));
    svg.querySelectorAll("line.edge").forEach(line => {
      const a = byId.get(line.dataset.from), b = byId.get(line.dataset.to);
      if (a && b) {
        line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
      }
    });
    suppressNodeClickUntil = Date.now() + 500;
  });
  function finishDrag(event) {
    if (!activeDrag || (event && event.pointerId !== activeDrag.pointerId)) return;
    const moved = activeDrag.moved;
    activeDrag = null;
    if (moved) { save(); toast("تم حفظ مكان الفكرة"); }
  }
  svg.addEventListener("pointerup", finishDrag);
  svg.addEventListener("pointercancel", finishDrag);
  svg.addEventListener("lostpointercapture", finishDrag);


  // Stand design studio: parametric isometric model and local design library.
  let currentDesignId = null;
  let pendingReferenceImage = "";
  let standRotation = {x:0,y:0};
  function standValues() {
    const number = (id, fallback, min, max) => {
      const value = Number($(id).value);
      return Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
    };
    return {
      id: currentDesignId || uid(),
      name: $("designName").value.trim() || "تصميم بدون اسم",
      width: number("standWidth",90,20,200),
      height: number("standHeight",180,40,250),
      depth: number("standDepth",45,20,120),
      shelves: Math.round(number("shelfCount",3,1,6)),
      material: $("standMaterial").value,
      color: /^#[0-9a-fA-F]{6}$/.test($("standColor").value) ? $("standColor").value : "#c49a55",
      notes: $("standNotes").value.trim(),
      image: pendingReferenceImage,
      parts: JSON.parse(JSON.stringify(partSpecs))
    };
  }
  function shadeColor(hex, amount) {
    const n = parseInt(hex.slice(1),16);
    const r = Math.max(0,Math.min(255,(n>>16)+amount));
    const g = Math.max(0,Math.min(255,((n>>8)&255)+amount));
    const b = Math.max(0,Math.min(255,(n&255)+amount));
    return "#" + [r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");
  }
  function project3D(x,y,z,scale,baseY) {
    return [320 + (x-y)*scale*.78, baseY + (x+y)*scale*.34 - z*scale];
  }
  let explodedView = false;
  let selectedPartId = "base";
  let partSpecs = {};
  function standPartDefinitions(v) {
    const post = Math.max(2.2,Math.min(4,v.width*.035));
    const parts = [
      {id:"base",name:"القاعدة السفلية",material:"صاج أو قطاع معدني",notes:"قاعدة مستقلة قابلة للفك"},
      {id:"post-front-left",name:"القائم الأمامي الأيسر",material:"ماسورة مربعة",notes:"يركب في فتحة القاعدة"},
      {id:"post-front-right",name:"القائم الأمامي الأيمن",material:"ماسورة مربعة",notes:"يركب في فتحة القاعدة"},
      {id:"post-rear-left",name:"القائم الخلفي الأيسر",material:"ماسورة مربعة",notes:"يركب في فتحة القاعدة"},
      {id:"post-rear-right",name:"القائم الخلفي الأيمن",material:"ماسورة مربعة",notes:"يركب في فتحة القاعدة"},
      {id:"top-frame",name:"الإطار العلوي",material:"ماسورة معدنية",notes:"يربط القوائم من أعلى"},
      {id:"hanger-rail",name:"عارضة تعليق الملابس",material:"ماسورة أو قضيب",notes:"قابلة للاستبدال حسب العرض"}
    ];
    for(let i=0;i<v.shelves;i++)parts.push({id:"shelf-"+(i+1),name:"الرف رقم "+(i+1),material:"صاج أو خشب أو شبكة",notes:"رف منفصل قابل للفك والاستبدال"});
    return parts;
  }
  function renderStandModel() {
    const v=standValues(), svg=$("standPreview");
    $("previewName").textContent=v.name;
    const s=Math.min(1.65,300/Math.max(v.width,v.depth,v.height*.72));
    const baseY=445, points=(x,y,z)=>project3D(x,y,z,s,baseY).join(",");
    const groups=[];
    const post=Math.max(2.2,Math.min(4,v.width*.035));
    const defs=standPartDefinitions(v);
    const shade=(hex,amount)=>shadeColor(hex,amount);
    function makePart(id,draw,offset){
      const shapes=[];
      const poly=(pts,fill,stroke="#172638")=>shapes.push('<polygon points="'+pts.map(p=>points(...p)).join(" ")+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1.5" stroke-linejoin="round"/>');
      const box=(x,y,z,w,d,h,color)=>{
        const c1=[x,y,z],c2=[x+w,y,z],c3=[x+w,y+d,z],c4=[x,y+d,z];
        const t1=[x,y,z+h],t2=[x+w,y,z+h],t3=[x+w,y+d,z+h],t4=[x,y+d,z+h];
        poly([t1,t2,t3,t4],shade(color,25));poly([c1,c2,t2,t1],shade(color,-22));
        poly([c2,c3,t3,t2],shade(color,-42));poly([c4,c3,t3,t4],shade(color,-8));
      };
      draw(box);
      const chosen=selectedPartId===id;
      const dx=explodedView?offset[0]:0,dy=explodedView?offset[1]:0;
      groups.push('<g class="stand-part '+(chosen?"part-selected":"")+'" data-part-id="'+id+'" transform="translate('+dx+' '+dy+')" tabindex="0" role="button" aria-label="اختيار '+(defs.find(p=>p.id===id)?.name||id)+'">'+shapes.join("")+'</g>');
    }
    const metal=v.color,dark=v.material==="wood"?"#9a7047":v.material==="aluminum"?"#aeb9c5":metal;
    makePart("base",box=>box(0,0,0,v.width,v.depth,3,shade(metal,-12)),[0,65]);
    const postParts=[
      ["post-front-left",0,0,-55,0],["post-front-right",v.width-post,0,55,0],
      ["post-rear-left",0,v.depth-post,-55,20],["post-rear-right",v.width-post,v.depth-post,55,20]
    ];
    postParts.forEach(([id,x,y,dx,dy])=>makePart(id,box=>box(x,y,3,post,post,v.height-3,dark),[dx,dy]));
    makePart("top-frame",box=>box(0,0,v.height-5,v.width,v.depth,5,metal),[0,-75]);
    makePart("hanger-rail",box=>box(post,v.depth*.48,v.height-20,v.width-2*post,2.4,2.4,shade(metal,35)),[0,-112]);
    for(let i=0;i<v.shelves;i++){
      const id="shelf-"+(i+1),z=12+(v.height-28)*(i+1)/(v.shelves+1);
      makePart(id,box=>{box(post,post,z,v.width-2*post,v.depth-2*post,2.5,v.material==="wood"?"#a8794b":shade(metal,-8));box(post,post,z+2.5,v.width-2*post,1.4,1.8,shade(metal,18));},[0,(i%2===0?1:-1)*(32+22*i)]);
    }
    const label='<text x="320" y="500" fill="#9aa9bd" font-size="13" text-anchor="middle" direction="rtl">العرض '+v.width+' سم  •  الارتفاع '+v.height+' سم  •  العمق '+v.depth+' سم</text>';
    svg.innerHTML='<defs><linearGradient id="stageGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17283c"/><stop offset="1" stop-color="#0b1422"/></linearGradient></defs><rect width="640" height="520" rx="18" fill="url(#stageGlow)"/><ellipse cx="320" cy="448" rx="210" ry="34" fill="#020711" opacity=".35"/>'+groups.join("")+label;
    svg.style.transform="perspective(1000px) rotateX("+standRotation.x+"deg) rotateY("+standRotation.y+"deg)";
    svg.querySelectorAll(".stand-part").forEach(el=>{
      const choose=()=>{selectedPartId=el.dataset.partId;renderStandModel();renderPartsList();};
      el.addEventListener("click",e=>{e.stopPropagation();choose();});
      el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose();}});
    });
    $("explodeToggleBtn").textContent=explodedView?"إعادة تجميع القطع":"تفكيك القطع";
    renderPartsList();
    renderManufacturingSheet();
  }
  function renderPartsList(){
    const host=$("standPartsList");if(!host)return;
    host.replaceChildren();
    const defs=standPartDefinitions(standValues());
    defs.forEach(part=>{
      const spec=partSpecs[part.id]||{};
      const button=document.createElement("button");button.type="button";
      button.className="stand-part-choice"+(selectedPartId===part.id?" active":"");
      button.textContent=(spec.name||part.name);
      button.addEventListener("click",()=>{selectedPartId=part.id;renderStandModel();});
      host.appendChild(button);
    });
    const part=defs.find(p=>p.id===selectedPartId);
    $("partEditor").hidden=!part;
    if(!part)return;
    const spec=partSpecs[part.id]||{};
    $("selectedPartTitle").textContent="تعديل: "+(spec.name||part.name);
    $("partCustomName").value=spec.name||part.name;
    $("partCustomMaterial").value=spec.material||part.material;
    $("partCustomNotes").value=spec.notes||part.notes;
  }
  function saveSelectedPart(){
    const part=standPartDefinitions(standValues()).find(p=>p.id===selectedPartId);
    if(!part)return;
    partSpecs[selectedPartId]={
      name:$("partCustomName").value.trim()||part.name,
      material:$("partCustomMaterial").value.trim(),
      notes:$("partCustomNotes").value.trim()
    };
    if(currentDesignId){
      const index=data.designs.findIndex(d=>d.id===currentDesignId);
      if(index>=0)data.designs[index].parts=JSON.parse(JSON.stringify(partSpecs));
    }
    try{save();renderStandModel();toast("تم حفظ مواصفات القطعة");}
    catch(error){toast("تعذر حفظ التعديل في مساحة التخزين");}
  }
  function refreshSavedDesigns() {
    const select = $("savedDesigns"), chosen = select.value;
    select.replaceChildren();
    const first = document.createElement("option"); first.value=""; first.textContent="اختر تصميمًا محفوظًا"; select.append(first);
    data.designs.forEach(d=>{
      const o=document.createElement("option"); o.value=d.id; o.textContent=d.name+" — "+d.width+"×"+d.depth+" سم"; select.append(o);
    });
    if(data.designs.some(d=>d.id===chosen)) select.value=chosen;
  }
  function saveStandDesign() {
    const design=standValues();
    if(!design.name.trim()){toast("اكتب اسم التصميم أولًا");return;}
    const index=data.designs.findIndex(d=>d.id===design.id);
    if(index>=0)data.designs[index]=design; else data.designs.push(design);
    currentDesignId=design.id; design.parts=JSON.parse(JSON.stringify(partSpecs));
    try { save(); refreshSavedDesigns(); $("savedDesigns").value=design.id; toast("تم حفظ التصميم على هذا الجهاز"); }
    catch(error){toast("مساحة التخزين ممتلئة؛ جرّب صورة مرجعية أصغر");}
  }
  function loadStandDesign() {
    const d=data.designs.find(item=>item.id===$("savedDesigns").value);
    if(!d){toast("اختار تصميمًا محفوظًا الأول");return;}
    currentDesignId=d.id; partSpecs=d.parts||{}; selectedPartId="base";
    $("designName").value=d.name; $("standWidth").value=d.width; $("standHeight").value=d.height;
    $("standDepth").value=d.depth; $("shelfCount").value=d.shelves;
    $("standMaterial").value=d.material||"steel"; $("standColor").value=d.color||"#c49a55";
    $("standNotes").value=d.notes||""; pendingReferenceImage=d.image||"";
    $("referencePreview").hidden=!pendingReferenceImage;
    if(pendingReferenceImage)$("referencePreview").src=pendingReferenceImage;
    $("referenceImageBox").hidden=!pendingReferenceImage;
    if(pendingReferenceImage)$("savedReferenceImage").src=pendingReferenceImage;
    renderStandModel(); toast("تم فتح التصميم");
  }
  function resetStandDesign() {
    currentDesignId=null; pendingReferenceImage=""; partSpecs={}; selectedPartId="base"; explodedView=false;
    $("designName").value="استاند عرض ملابس"; $("standWidth").value=90;
    $("standHeight").value=180; $("standDepth").value=45; $("shelfCount").value=3;
    $("standMaterial").value="steel"; $("standColor").value="#c49a55"; $("standNotes").value="";
    $("standImage").value=""; $("referencePreview").hidden=true; $("referenceImageBox").hidden=true;
    $("savedDesigns").value=""; renderStandModel();
  }
  function exportStandOBJ() {
    const v=standValues(), output=["# Naseej separate-part stand model","o Naseej_Stand"];
    let vertexCount=0;
    function addPart(name,boxes){
      output.push("","o "+name);
      boxes.forEach(([x,y,z,w,d,h])=>{
        const verts=[[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z],[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]];
        verts.forEach(([vx,vy,vz])=>output.push("v "+vx.toFixed(3)+" "+vz.toFixed(3)+" "+vy.toFixed(3)));
        const n=vertexCount+1;
        [[1,2,3,4],[5,8,7,6],[1,5,6,2],[2,6,7,3],[3,7,8,4],[4,8,5,1]].forEach(face=>output.push("f "+face.map(i=>n+i-1).join(" ")));
        vertexCount+=8;
      });
    }
    const p=Math.max(2.2,Math.min(4,v.width*.035)), top=v.height-5;
    addPart("Base",[[0,0,0,v.width,v.depth,3]]);
    addPart("Post_Front_Left",[[0,0,3,p,p,v.height-3]]);
    addPart("Post_Front_Right",[[v.width-p,0,3,p,p,v.height-3]]);
    addPart("Post_Rear_Left",[[0,v.depth-p,3,p,p,v.height-3]]);
    addPart("Post_Rear_Right",[[v.width-p,v.depth-p,3,p,p,v.height-3]]);
    addPart("Top_Frame",[[0,0,top,v.width,p,5],[0,v.depth-p,top,v.width,p,5],[0,p,top,p,v.depth-2*p,5],[v.width-p,p,top,p,v.depth-2*p,5]]);
    addPart("Hanger_Rail",[[p,v.depth*.48,v.height-20,v.width-2*p,2.4,2.4]]);
    for(let i=0;i<v.shelves;i++){
      const z=12+(v.height-28)*(i+1)/(v.shelves+1);
      addPart("Shelf_"+(i+1),[[p,p,z,v.width-2*p,v.depth-2*p,2.5],[p,p,z+2.5,v.width-2*p,1.4,1.8]]);
    }
    const blob=new Blob([output.join("\\n")],{type:"model/obj"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=(v.name||"naseej-stand").replace(/[^\\p{L}\\p{N}_-]+/gu,"_")+".obj";
    a.click();URL.revokeObjectURL(url);
    toast("تم تصدير المجسم بأجزائه المنفصلة");
  }
  function downloadStandImage() {
    const svg=$("standPreview");
    const source=new XMLSerializer().serializeToString(svg);
    const blob=new Blob([source],{type:"image/svg+xml;charset=utf-8"});
    const url=URL.createObjectURL(blob), img=new Image();
    img.onload=()=>{
      const canvas=document.createElement("canvas"); canvas.width=1280; canvas.height=1040;
      const ctx=canvas.getContext("2d"); ctx.drawImage(img,0,0,1280,1040);
      URL.revokeObjectURL(url);
      const a=document.createElement("a"); a.download=(standValues().name||"naseej-stand")+".png";
      a.href=canvas.toDataURL("image/png"); a.click(); toast("تم تجهيز صورة التصميم");
    };
    img.onerror=()=>{URL.revokeObjectURL(url);toast("تعذر تجهيز الصورة");};
    img.src=url;
  }
  const fabricationCatalog = [
    {id:"fashion-rail",cat:"fashion",name:"استاند ملابس أرضي",icon:"👕",size:"عرض 900–1200 × عمق 450–600 × ارتفاع 1400–1800 مم",material:"حديد مربع أو دائري؛ دهان بودرة؛ وصلات قابلة للفك",detail:"حوامل تعليق مفردة أو مزدوجة، عجلات اختيارية، وقاعدة مانعة للانقلاب."},
    {id:"fashion-wall",cat:"fashion",name:"وحدة تعليق حائطية",icon:"🧥",size:"عرض الوحدة 900–1200؛ ارتفاع 2100–2400؛ عمق 500–600 مم",material:"قوائم معدنية + أذرع تعليق + رف علوي",detail:"نظام ثقوب أو مجاري يسمح بتغيير ارتفاع الأذرع والرفوف."},
    {id:"fashion-table",cat:"fashion",name:"ترابيزة عرض ملابس",icon:"🛍️",size:"ارتفاع 750–900؛ سطح 1200–1800 × 600–900 مم",material:"هيكل حديد + خشب أو MDF أو زجاج",detail:"درج أو رف سفلي، زوايا آمنة، وإمكانية التعشيق مع ترابيزات متداخلة."},
    {id:"fashion-gondola",cat:"fashion",name:"جزيرة عرض مزدوجة",icon:"▤",size:"وحدات عرض 900–1200؛ ارتفاع 1200–1600؛ رف 300–450 مم",material:"صاج مثني + قوائم + أرفف قابلة للضبط",detail:"تُستخدم في منتصف المحل ويمكن تغيير الخطافات والرفوف والواجهات."},
    {id:"fashion-shoes",cat:"fashion",name:"ستاند أحذية متعدد المستويات",icon:"👟",size:"عرض 600–1200؛ عمق 300–450؛ ارتفاع 1200–1800 مم",material:"حديد خفيف + أرفف صاج أو خشب",detail:"أرفف مائلة بحافة أمامية، أو أذرع فردية قابلة للتغيير."},
    {id:"fashion-cash",cat:"fashion",name:"كاونتر كاشير محل",icon:"▰",size:"ارتفاع 900–1050؛ عمق 600–750؛ الطول حسب الموقع",material:"هيكل حديد + خشب أو HPL أو أكريليك",detail:"مكان درج النقدية والكمبيوتر والأسلاك والتخزين وواجهة الهوية التجارية."},
    {id:"fashion-mirror",cat:"fashion",name:"مراية وبنش غرفة قياس",icon:"🪞",size:"بنش ارتفاع 430–480؛ عمق 350–450 مم؛ المراية حسب الحائط",material:"حديد مطلي + خشب مبطن + زجاج مرايا",detail:"خطافات شنط وملابس وحواف آمنة ومساحة حركة مناسبة."},
    {id:"fashion-display",cat:"fashion",name:"منصة مانيكان وواجهة عرض",icon:"◈",size:"منصة 300–600 ارتفاع؛ مقاس السطح حسب المشهد",material:"حديد + خشب + أكريليك + إضاءة LED",detail:"وحدات متدرجة قابلة للتجميع وتغيير ترتيبها في واجهة المحل."},
    {id:"retail-gondola",cat:"retail",name:"رفوف سوبر ماركت جزيرة",icon:"▥",size:"وحدة طول 900–1200؛ ارتفاع 1350–1800؛ عمق الرف 300–500 مم",material:"صاج مثني مطلي + قواعد وقوائم ودعامات",detail:"أرفف قابلة للتعديل، فواصل أسعار، نهايات عرض، مع حساب حمل كل رف."},
    {id:"retail-wall",cat:"retail",name:"رفوف حائط للمخازن والعرض",icon:"▤",size:"عرض الوحدة 900–1200؛ ارتفاع 1800–2400؛ عمق 300–600 مم",material:"قوائم مثقبة + أرفف صاج أو سلك",detail:"اختيار سمك القطاع وعدد الدعامات بناءً على الحمل الفعلي."},
    {id:"retail-checkout",cat:"retail",name:"كاونتر كاشير سير",icon:"🧾",size:"الارتفاع ومكان السير حسب خط التشغيل؛ يحدد من مخطط الموقع",material:"صاج + قطاعات حديد + سير ومكونات كهربائية",detail:"نحتاج تصميم منفصل للجزء الميكانيكي والكهرباء وحماية نقاط القرص."},
    {id:"retail-produce",cat:"retail",name:"ستاند خضار وفاكهة",icon:"🥬",size:"وحدات عرض 900–1500 عرض؛ عمق 600–900 مم",material:"حديد مجلفن أو مطلي + صناديق خشب أو بلاستيك",detail:"ميول مناسب وسهولة تنظيف وتصريف ومراعاة وزن الحمولة."},
    {id:"retail-bakery",cat:"retail",name:"فاترينة مخبوزات",icon:"🥐",size:"تُحدد حسب مساحة الخدمة والواجهة؛ عمق مرجعي 600–900 مم",material:"هيكل معدن + زجاج آمن + أرفف",detail:"الزجاج والتبريد والإضاءة ومتطلبات سلامة الغذاء تحتاج مواصفات المورد المختص."},
    {id:"cafe-counter",cat:"cafe",name:"كاونتر كافيه واستقبال",icon:"☕",size:"ارتفاع خدمة مرجعي 900–1050؛ عمق 600–750 مم",material:"هيكل حديد + خشب أو HPL أو رخام صناعي",detail:"تقسيم ماكينة القهوة والثلاجات والحوض والكاشير وتمرير الكابلات."},
    {id:"cafe-backbar",cat:"cafe",name:"وحدة خلفية للكافيه",icon:"☕",size:"عمق مرجعي 300–600؛ الارتفاع حسب الحائط والأجهزة",material:"حديد + أرفف خشب أو زجاج + إضاءة",detail:"أرفف أكواب وتخزين ومكان شاشة أو قائمة رقمية."},
    {id:"cafe-table",cat:"cafe",name:"قواعد ترابيزات ومقاعد",icon:"🪑",size:"ترابيزة طعام غالبًا 700–760 ارتفاع؛ البار 1050–1150 تقريبًا",material:"مواسير حديد أو قطاعات صاج مقصوص ليزر",detail:"قواعد ثابتة أو قابلة للفك، رجل مركزية أو أربع أرجل، واختبار الثبات."},
    {id:"cafe-partition",cat:"cafe",name:"فواصل جلسات وبارتشن",icon:"▥",size:"ارتفاع 900–1800؛ الطول حسب تقسيم المكان",material:"حديد + خشب أو زجاج أو شبك ممدد",detail:"قواعد ثابتة أو متحركة، أحواض زرع مدمجة، أو فواصل زخرفية."},
    {id:"kitchen-table",cat:"cafe",name:"ترابيزة تجهيز ستانلس",icon:"▱",size:"طول 1000–1800؛ عمق 600–700؛ ارتفاع 800–900 مم",material:"ستانلس 304 لأسطح ملامسة الطعام؛ سمك السطح حسب الحمل",detail:"رف سفلي، رجل قابلة للضبط، وظهر مرتفع عند التركيب بجوار الحائط."},
    {id:"kitchen-sink",cat:"cafe",name:"حوض غسيل ستانلس",icon:"🚰",size:"حوض مفرد أو مزدوج أو ثلاثي؛ مقاس الحوض حسب الأواني",material:"ستانلس مناسب للاستخدام الغذائي مع لحامات مصقولة",detail:"تحديد عدد الأحواض ومكان الصرف وحنفية الرش وحوض غسل الأيدي حسب الاشتراطات."},
    {id:"kitchen-shelf",cat:"cafe",name:"أرفف حائط ستانلس",icon:"▤",size:"عمق مرجعي 300–400؛ أطوال 600–2000 مم",material:"ستانلس 304 أو خامة معتمدة لبيئة الاستخدام",detail:"حواف مثنية وحوامل قوية وسهولة فك التنظيف."},
    {id:"kitchen-rack",cat:"cafe",name:"وحدة تخزين صواني وأواني",icon:"▥",size:"عرض 900–1500؛ عمق 450–600؛ ارتفاع 1600–1800 مم",material:"ستانلس أو حديد مطلي حسب منطقة الاستخدام",detail:"تباعد الأرفف حسب الصواني والأحمال، مع تثبيت ضد الانقلاب."},
    {id:"kitchen-hood",cat:"cafe",name:"حامل شفاط ومظلة مطبخ",icon:"♨",size:"حسب خط الطهي ومعدات الحرارة؛ لا يعتمد مقاس ثابت",material:"ستانلس وفلاتر دهون ومجرى سحب",detail:"التصميم النهائي والشفط ومكافحة الحريق بواسطة مختص تهوية وسلامة."},
    {id:"kitchen-trolley",cat:"cafe",name:"عربة خدمة أو صواني",icon:"▰",size:"عرض 500–700؛ عمق 800–1000؛ ارتفاع 850–1000 مم",material:"ستانلس أو حديد مطلي + عجلات صناعية",detail:"عجل بقفل، مقابض، حواف مانعة للسقوط، وحمولة معلومة."},
    {id:"mall-kiosk",cat:"mall",name:"كشك مول قابل للفك",icon:"🏬",size:"المساحة حسب عقد المول؛ وحدات نموذجية 2000–3000 مم",material:"هيكل حديد + ألواح ديكور + زجاج + كهرباء",detail:"تصميم وحدات تنفصل للنقل، واجهات قابلة للتغيير، وإخفاء التوصيلات."},
    {id:"mall-pop",cat:"mall",name:"ستاند موسمي متنقل",icon:"✳",size:"قاعدة 600–1200؛ ارتفاع 1400–2200 مم",material:"حديد خفيف + ألواح مطبوعة أو أكريليك",detail:"يتفك بسرعة ويُخزن مسطحًا مع عجلات أو قواعد قابلة للضبط."},
    {id:"mall-food",cat:"mall",name:"كاونتر فود كورت",icon:"🍔",size:"ارتفاع خدمة 900–1050؛ العمق يحدد من الأجهزة والممرات",material:"حديد + ستانلس + كسوة ديكور",detail:"فصل منطقة الطلب عن التسليم ومكان شاشة المنيو ومعدات الخدمة."},
    {id:"mall-bench",cat:"mall",name:"مقاعد انتظار عامة",icon:"🪑",size:"ارتفاع المقعد قرابة 430–470؛ العمق 400–500 مم",material:"حديد + خشب أو ألواح مدمجة",detail:"تصميم مقاوم للاستخدام الكثيف وسهل الصيانة والتنظيف."},
    {id:"metal-stair",cat:"metal",name:"سلالم ودرابزين معدني",icon:"↗",size:"حسب الارتفاع والفتحة والكود؛ لا يعتمد قبل الحساب",material:"قطاعات حديد أو استانلس",detail:"يلزم حساب إنشائي وتفاصيل تثبيت وارتفاعات ودرابزين وفق الكود."},
    {id:"metal-canopy",cat:"metal",name:"مظلات وبرجولات",icon:"⌂",size:"حسب البحر والرياح ونقاط التثبيت",material:"قطاعات حديد مجلفن أو مطلي",detail:"تصميم إنشائي وتصريف مياه وحماية ضد التآكل."},
    {id:"metal-rack",cat:"metal",name:"أرفف مخازن وأحمال",icon:"▦",size:"تحدد من وزن الوحدة والبحور وعدد المستويات",material:"قطاعات مشكلة باردة أو ساخنة حسب الحمل",detail:"يلزم بيان حمولة الرف والباكية والتثبيت الأرضي ومراجعة مهندس."},
    {id:"metal-cart",cat:"metal",name:"عربات نقل داخلية",icon:"▰",size:"حسب الصناديق والممرات؛ مقبض 850–1000 مم مرجعي",material:"حديد أو ستانلس + عجلات",detail:"تحديد الحمولة ومركز الثقل ونوع الأرضية والعجلات."},
    {id:"decor-screen",cat:"decor",name:"فواصل ديكور ليزر",icon:"✥",size:"ألواح نموذجية 600–1200 عرض؛ الارتفاع حسب الموقع",material:"صاج ليزر + إطار حديد + دهان بودرة",detail:"نقوش هندسية أو نباتية أو هوية خاصة، مع قواعد تثبيت مخفية."},
    {id:"decor-light",cat:"decor",name:"هياكل إضاءة ولافتات",icon:"✧",size:"حسب اللافتة والوزن ومكان التعليق",material:"حديد أو ألومنيوم + LED",detail:"توفير باب صيانة ومجرى كابلات ومصدر تغذية آمن."},
    {id:"decor-planter",cat:"decor",name:"أحواض زرع وفواصل",icon:"🌿",size:"أحواض 300–1200 طول؛ ارتفاع 400–900 مم مرجعي",material:"صاج مطلي أو ستانلس + بطانة عازلة",detail:"فتحات صرف وبطانة داخلية وحماية الأرضية من المياه."}
  ];
  const catalogLabels={fashion:"محلات الملابس",retail:"التجزئة والسوبر ماركت",cafe:"الكافيهات والمطاعم",mall:"المولات والأكشاك",metal:"مشغولات الحديد",decor:"الديكور والعناصر الخاصة"};
  function renderFabricationCatalog(){
    const host=$("catalogGrid");if(!host)return;
    host.replaceChildren();
    const query=$("catalogSearch").value.trim().toLowerCase();
    const category=$("catalogCategory").value;
    const items=fabricationCatalog.filter(item=>(category==="all"||item.cat===category)&&(!query||(item.name+" "+item.size+" "+item.material+" "+item.detail).toLowerCase().includes(query)));
    if(!items.length){const p=document.createElement("p");p.className="groups-empty";p.textContent="مفيش نتائج مطابقة للبحث.";host.append(p);return;}
    items.forEach(item=>{
      const card=document.createElement("article");card.className="catalog-card";
      const top=document.createElement("div");top.className="catalog-card-top";
      const icon=document.createElement("span");icon.className="catalog-icon";icon.textContent=item.icon;
      const category=document.createElement("span");category.className="catalog-category";category.textContent=catalogLabels[item.cat];
      top.append(icon,category);
      const title=document.createElement("h4");title.textContent=item.name;
      const size=document.createElement("p");size.innerHTML="<strong>مقاسات مرجعية:</strong> ";size.append(document.createTextNode(item.size));
      const material=document.createElement("p");material.innerHTML="<strong>الخامات:</strong> ";material.append(document.createTextNode(item.material));
      const detail=document.createElement("p");detail.textContent=item.detail;
      const button=document.createElement("button");button.type="button";button.className="button button-quiet";button.textContent="إضافة إلى مشروعات نسيج";
      button.addEventListener("click",()=>{
        const node={id:uid(),title:item.name,type:"project",description:"القسم: "+catalogLabels[item.cat]+"\\nالمقاسات المرجعية: "+item.size+"\\nالخامات: "+item.material+"\\nتفاصيل: "+item.detail+"\\n\\nملاحظة: المقاسات مبدئية وتحتاج مراجعة حسب الموقع والاستخدام."};
        data.nodes.push(node);selectedId=node.id;activeGroupFilter="all";save();render();toast("اتضافت بطاقة الشغل لخريطة نسيج");
      });
      card.append(top,title,size,material,detail,button);host.append(card);
    });
  }

  let latestCutRows = [];
  function renderManufacturingSheet(){
    const v=standValues(), w=v.width*10, h=v.height*10, d=v.depth*10, tube=30, clearW=Math.max(0,w-2*tube), clearD=Math.max(0,d-2*tube);
    const rows=[
      {name:"قوائم رأسية",qty:4,length:Math.max(0,h-30),material:"ماسورة مربعة 30×30 مم"},
      {name:"عارضتان علويتان أمامية وخلفية",qty:2,length:w,material:"ماسورة مربعة 30×30 مم"},
      {name:"عارضتان علويتان جانبيتان",qty:2,length:d,material:"ماسورة مربعة 30×30 مم"},
      {name:"عارضة تعليق الملابس",qty:1,length:clearW,material:"ماسورة/قضيب حسب الاختيار"}
    ];
    for(let i=0;i<v.shelves;i++) rows.push({name:"إطار الرف "+(i+1)+" — ضلع طويل",qty:2,length:clearW,material:"ماسورة 20×20 مم مبدئيًا"},{name:"إطار الرف "+(i+1)+" — ضلع جانبي",qty:2,length:clearD,material:"ماسورة 20×20 مم مبدئيًا"});
    latestCutRows=rows.map(r=>({...r,total:r.qty*r.length}));
    const tubeTotal=latestCutRows.reduce((sum,r)=>sum+r.total,0)/1000;
    const sheetArea=(w*d+v.shelves*clearW*clearD)/1000000;
    const waste=Math.max(0,Math.min(100,Number($("wastePercent")?.value)||0))/100;
    const tubePrice=Math.max(0,Number($("tubePrice")?.value)||0),sheetPrice=Math.max(0,Number($("sheetPrice")?.value)||0);
    const tubeCost=tubeTotal*(1+waste)*tubePrice, sheetCost=sheetArea*(1+waste)*sheetPrice;
    $("materialSummary").innerHTML='<div><strong>'+tubeTotal.toFixed(2)+' م</strong><span>إجمالي أطوال المواسير قبل الهالك</span></div><div><strong>'+sheetArea.toFixed(2)+' م²</strong><span>مساحة القاعدة والرفوف التقديرية</span></div><div><strong>'+Math.round(tubeCost+sheetCost).toLocaleString("ar-EG")+' ج</strong><span>تقدير خامات وفق الأسعار المدخلة</span></div>';
    $("cutListBody").innerHTML=latestCutRows.map(r=>'<tr><td>'+r.name+'</td><td>'+r.qty+'</td><td>'+r.length.toFixed(0)+' مم للقطعة</td><td>'+r.material+'</td></tr>').join('')+'<tr><td>قاعدة صاج</td><td>1</td><td>'+w.toFixed(0)+' × '+d.toFixed(0)+' مم</td><td>صاج — مساحة '+(w*d/1000000).toFixed(2)+' م²</td></tr>'+Array.from({length:v.shelves},(_,i)=>'<tr><td>لوح الرف '+(i+1)+'</td><td>1</td><td>'+clearW.toFixed(0)+' × '+clearD.toFixed(0)+' مم</td><td>خشب أو صاج — حسب الاختيار</td></tr>').join('');
    function drawing(id,view){
      const el=$(id), scale=Math.min(210/(view==="side"?d:w),170/h), width=(view==="side"?d:w)*scale,height=h*scale,x=(320-width)/2,y=218-height;
      const postW=Math.max(3,tube*scale), color=v.color;
      let shapes='<rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" fill="none" stroke="'+color+'" stroke-width="'+postW+'"/>';
      if(view==="front"||view==="side"){
        for(let i=0;i<v.shelves;i++){const yy=y+height*(1-(12+(v.height-28)*(i+1)/(v.shelves+1))/v.height);shapes+='<line x1="'+(x+postW)+'" y1="'+yy+'" x2="'+(x+width-postW)+'" y2="'+yy+'" stroke="#d5b477" stroke-width="4"/>';}
        if(view==="front")shapes+='<line x1="'+(x+postW)+'" y1="'+(y+height*0.11)+'" x2="'+(x+width-postW)+'" y2="'+(y+height*0.11)+'" stroke="#d5b477" stroke-width="5"/>';
      } else {shapes='<rect x="'+x+'" y="'+(y+height*.18)+'" width="'+width+'" height="'+(height*.65)+'" fill="none" stroke="'+color+'" stroke-width="5"/><line x1="'+x+'" y1="'+(y+height*.18)+'" x2="'+(x+width)+'" y2="'+(y+height*.18)+'" stroke="#d5b477" stroke-width="3"/>';}
      el.innerHTML='<rect width="320" height="260" rx="10" fill="#0b1523"/>'+shapes+'<text x="160" y="246" fill="#bac7d6" font-size="11" text-anchor="middle">'+(view==="front"?"العرض "+v.width+" سم × الارتفاع "+v.height+" سم":view==="side"?"العمق "+v.depth+" سم × الارتفاع "+v.height+" سم":"بصمة القاعدة "+v.width+" × "+v.depth+" سم")+'</text>';
    }
    drawing("frontDrawing","front");drawing("sideDrawing","side");drawing("topDrawing","top");
  }
  function exportCutList(){
    if(!latestCutRows.length)renderManufacturingSheet();
    const rows=[["القطعة","العدد","طول القطعة مم","إجمالي الطول مم","الخامة"],...latestCutRows.map(r=>[r.name,r.qty,r.length,r.total,r.material])];
    const csv="\\uFEFF"+rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(",")).join("\\r\\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="naseej-cut-list.csv";a.click();URL.revokeObjectURL(url);toast("تم تصدير جدول القص");
  }

  function setupDesignStudio() {
    $("catalogSearch").addEventListener("input",renderFabricationCatalog);
    $("catalogCategory").addEventListener("change",renderFabricationCatalog);
    renderFabricationCatalog();
    document.querySelectorAll(".main-tab").forEach(tab=>tab.addEventListener("click",()=>{
      document.querySelectorAll(".main-tab").forEach(t=>t.classList.toggle("active",t===tab));
      $("ideasView").hidden=tab.dataset.view!=="ideasView";
      $("designView").hidden=tab.dataset.view!=="designView";
      if(tab.dataset.view==="designView")renderStandModel();
    }));
    ["designName","standWidth","standHeight","standDepth","shelfCount","standMaterial","standColor"].forEach(id=>$(id).addEventListener("input",renderStandModel));
    $("standNotes").addEventListener("input",()=>{});
    $("saveDesignBtn").addEventListener("click",saveStandDesign);
    $("loadDesignBtn").addEventListener("click",loadStandDesign);
    $("newDesignBtn").addEventListener("click",resetStandDesign);
    $("downloadStandBtn").addEventListener("click",downloadStandImage);
    $("exportObjBtn").addEventListener("click",exportStandOBJ);
    $("resetViewBtn").addEventListener("click",()=>{standRotation={x:0,y:0};renderStandModel();});
    $("explodeToggleBtn").addEventListener("click",()=>{explodedView=!explodedView;renderStandModel();});
    $("savePartBtn").addEventListener("click",saveSelectedPart);
    ["tubePrice","sheetPrice","wastePercent"].forEach(id=>$(id).addEventListener("input",renderManufacturingSheet));
    $("exportCutListBtn").addEventListener("click",exportCutList);
    $("standImage").addEventListener("change",event=>{
      const file=event.target.files[0]; if(!file)return;
      if(!file.type.startsWith("image/")){toast("اختار ملف صورة");return;}
      const reader=new FileReader();
      reader.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const scale=Math.min(1,700/Math.max(img.width,img.height));
          const canvas=document.createElement("canvas"); canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale);
          canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
          pendingReferenceImage=canvas.toDataURL("image/jpeg",.68);
          $("referencePreview").src=pendingReferenceImage; $("referencePreview").hidden=false;
          $("savedReferenceImage").src=pendingReferenceImage; $("referenceImageBox").hidden=false;
          toast("تم إرفاق الصورة؛ احفظ التصميم للاحتفاظ بها");
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
    const stage=$("standStage");
    let drag=null;
    stage.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY,rx:standRotation.x,ry:standRotation.y};stage.setPointerCapture(e.pointerId);});
    stage.addEventListener("pointermove",e=>{
      if(!drag)return;
      standRotation.y=Math.max(-45,Math.min(45,drag.ry+(e.clientX-drag.x)*.35));
      standRotation.x=Math.max(-20,Math.min(20,drag.rx-(e.clientY-drag.y)*.2));
      $("standPreview").style.transform="perspective(1000px) rotateX("+standRotation.x+"deg) rotateY("+standRotation.y+"deg)";
    });
    const stop=()=>{drag=null;}; stage.addEventListener("pointerup",stop);stage.addEventListener("pointercancel",stop);
    refreshSavedDesigns(); renderStandModel();
  }

  function render() {
    svg.replaceChildren();
    renderGroupFilter();
    const allPoints = positions();
    const points = activeGroupFilter === "all" ? allPoints : allPoints.filter(p => p.groupId === activeGroupFilter);
    const byId = new Map(points.map(p => [p.id,p]));
    data.edges.forEach(edge => {
      const a = byId.get(edge.from), b = byId.get(edge.to);
      if (a && b) {
        const line = svgEl("line", {x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:"edge"});
        line.dataset.from = edge.from; line.dataset.to = edge.to;
        svg.appendChild(line);
      }
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
    $("emptyState").hidden = points.length > 0;
    const emptyTitle = $("emptyState").querySelector("h3");
    const emptyText = $("emptyState").querySelector("p");
    if (activeGroupFilter !== "all" && points.length === 0) {
      emptyTitle.textContent = "المجموعة دي لسه فاضية";
      emptyText.textContent = "أضف فكرة جديدة واختر المجموعة دي من خانة المجموعة.";
      $("emptyAddBtn").hidden = false;
    } else {
      emptyTitle.textContent = "ابدأ بنسج أفكارك";
      emptyText.textContent = "أضف أول فكرة أو مشروع، وبعدها اربطه بباقي العناصر.";
      $("emptyAddBtn").hidden = false;
    }
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
    const group = data.groups.find(g => g.id === node.groupId);
    const groupBadge = document.createElement("span");
    groupBadge.className = "group-pill";
    groupBadge.textContent = group ? "المجموعة: " + group.name : "بدون مجموعة";
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
    host.append(pill,groupBadge,title,desc,actions);
  }
  function actionButton(label, cls, fn) {
    const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; b.addEventListener("click",fn); return b;
  }
  function renderGroupFilter() {
    const select = $("groupFilter");
    const current = activeGroupFilter;
    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "all"; all.textContent = "عرض كل المجموعات";
    select.appendChild(all);
    data.groups.forEach(group => {
      const option = document.createElement("option");
      option.value = group.id;
      const count = data.nodes.filter(node => node.groupId === group.id).length;
      option.textContent = group.name + " (" + count + ")";
      select.appendChild(option);
    });
    if (current !== "all" && !data.groups.some(group => group.id === current)) activeGroupFilter = "all";
    select.value = activeGroupFilter;
  }
  function renderGroupOptions(selectedId = "") {
    const select = $("nodeGroup");
    select.replaceChildren();
    const none = document.createElement("option"); none.value = ""; none.textContent = "بدون مجموعة";
    select.appendChild(none);
    data.groups.forEach(group => {
      const option = document.createElement("option");
      option.value = group.id; option.textContent = group.name;
      select.appendChild(option);
    });
    select.value = selectedId || "";
  }
  function createGroup() {
    const name = prompt("اكتب اسم المجموعة الجديدة:");
    if (name === null) return;
    const clean = name.trim();
    if (!clean) { toast("اكتب اسمًا للمجموعة"); return; }
    if (data.groups.some(g => g.name.toLowerCase() === clean.toLowerCase())) {
      toast("المجموعة موجودة بالفعل"); return;
    }
    const group = {id:uid(),name:clean};
    data.groups.push(group); save(); renderGroupOptions(group.id);
    toast("تم إنشاء المجموعة؛ احفظ العنصر لإضافته إليها");
  }
  function renderGroupsManager() {
    const host = $("groupsList");
    host.replaceChildren();
    if (!data.groups.length) {
      const empty = document.createElement("p");
      empty.className = "groups-empty";
      empty.textContent = "لسه ما أنشأتش أي مجموعات. تقدر تنشئ مجموعة من نموذج إضافة فكرة.";
      host.appendChild(empty);
      return;
    }
    data.groups.forEach(group => {
      const count = data.nodes.filter(node => node.groupId === group.id).length;
      const row = document.createElement("div");
      row.className = "managed-group";
      const info = document.createElement("div");
      info.className = "managed-group-info";
      const name = document.createElement("strong");
      name.textContent = group.name;
      const total = document.createElement("span");
      total.textContent = count + " عنصر";
      info.append(name,total);
      const actions = document.createElement("div");
      actions.className = "managed-group-actions";
      actions.append(
        actionButton("تغيير الاسم","button button-quiet",() => renameGroup(group.id)),
        actionButton("حذف","button button-quiet group-delete",() => deleteGroup(group.id))
      );
      row.append(info,actions);
      host.appendChild(row);
    });
  }
  function openGroupsManager() {
    renderGroupsManager();
    $("groupsDialog").showModal();
  }
  function renameGroup(id) {
    const group = data.groups.find(item => item.id === id);
    if (!group) return;
    const name = prompt("اكتب الاسم الجديد للمجموعة:", group.name);
    if (name === null) return;
    const clean = name.trim();
    if (!clean) { toast("اسم المجموعة لا يمكن أن يكون فارغًا"); return; }
    if (data.groups.some(item => item.id !== id && item.name.toLowerCase() === clean.toLowerCase())) {
      toast("فيه مجموعة تانية بنفس الاسم"); return;
    }
    group.name = clean;
    save();
    render();
    renderGroupsManager();
    toast("تم تغيير اسم المجموعة");
  }
  function deleteGroup(id) {
    const group = data.groups.find(item => item.id === id);
    if (!group) return;
    const count = data.nodes.filter(node => node.groupId === id).length;
    const message = "هل تريد حذف مجموعة «" + group.name + "»؟\\n" +
      "سيتم الاحتفاظ بـ " + count + " عنصر ونقلها إلى «بدون مجموعة».";
    if (!confirm(message)) return;
    data.groups = data.groups.filter(item => item.id !== id);
    data.nodes.forEach(node => { if (node.groupId === id) node.groupId = null; });
    if (activeGroupFilter === id) activeGroupFilter = "all";
    save();
    render();
    renderGroupsManager();
    toast("تم حذف المجموعة مع الاحتفاظ بعناصرها");
  }

  function openDialog(node = null) {
    $("nodeForm").reset();
    $("nodeId").value = node ? node.id : "";
    $("nodeTitle").value = node ? node.title : "";
    $("nodeType").value = node ? node.type : "idea";
    $("nodeDescription").value = node ? node.description : "";
    renderGroupOptions(node ? node.groupId : (activeGroupFilter === "all" ? "" : activeGroupFilter));
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
    const values = {title,type:$("nodeType").value,description:$("nodeDescription").value.trim(),groupId:$("nodeGroup").value || null};
    if (id) Object.assign(data.nodes.find(n => n.id === id), values);
    else { const node = {id:uid(),...values}; data.nodes.push(node); selectedId = node.id; }
    save(); $("nodeDialog").close(); render(); toast(id ? "تم تحديث العنصر" : "تمت إضافة العنصر");
  });
  $("groupFilter").addEventListener("change", event => {
    activeGroupFilter = event.target.value;
    if (selectedId && activeGroupFilter !== "all") {
      const selectedNode = data.nodes.find(node => node.id === selectedId);
      if (!selectedNode || selectedNode.groupId !== activeGroupFilter) selectedId = null;
    }
    render();
  });
  $("addGroupBtn").addEventListener("click", createGroup);
  $("manageGroupsBtn").addEventListener("click", openGroupsManager);
  $("closeGroupsBtn").addEventListener("click", () => $("groupsDialog").close());
  $("doneGroupsBtn").addEventListener("click", () => $("groupsDialog").close());
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
      data = {nodes:parsed.nodes,edges:parsed.edges,groups:Array.isArray(parsed.groups) ? parsed.groups : [],designs:Array.isArray(parsed.designs) ? parsed.designs : []}; selectedId = null; linking = false; save(); render(); toast("تم استيراد البيانات");
    } catch { toast("ملف النسخة الاحتياطية غير صالح"); }
    event.target.value = "";
  });
  window.addEventListener("resize", render);
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(error => {
        console.warn("تعذر تفعيل وضع العمل دون إنترنت:", error);
      });
    });
  }
  setupDesignStudio();
  render();
})();