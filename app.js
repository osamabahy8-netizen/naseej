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
      return { nodes: Array.isArray(saved.nodes) ? saved.nodes : [], edges: Array.isArray(saved.edges) ? saved.edges : [], groups: Array.isArray(saved.groups) ? saved.groups : [], designs: Array.isArray(saved.designs) ? saved.designs : [], connectionLibrary: Array.isArray(saved.connectionLibrary) ? saved.connectionLibrary : [], modelProjects: Array.isArray(saved.modelProjects) ? saved.modelProjects : [], modelStudioInitialized: saved.modelStudioInitialized === true };
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
  let assemblySteps = [];
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
      parts: JSON.parse(JSON.stringify(partSpecs)),
      assemblySteps: JSON.parse(JSON.stringify(assemblySteps))
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
  function partDimensionDefaults(id,v){
    const post=Math.max(2.2,Math.min(4,v.width*.035))*10;
    const w=v.width*10,d=v.depth*10,h=v.height*10;
    if(id==="base")return {length:w,width:d,thickness:3};
    if(id.startsWith("post-"))return {length:h-30,width:post,depth:post};
    if(id==="top-frame")return {length:w,width:d,thickness:5};
    if(id==="hanger-rail")return {length:w-2*post,width:24,depth:24};
    if(id.startsWith("shelf-"))return {length:w-2*post,width:d-2*post,thickness:25};
    return {};
  }
  function getPartDimensions(id,v){
    const base=partDimensionDefaults(id,v),saved=partSpecs[id]?.dimensions||{};
    const result={};
    Object.keys(base).forEach(key=>{
      const n=Number(saved[key]);
      result[key]=Number.isFinite(n)&&n>0?Math.max(1,Math.min(3000,n)):base[key];
    });
    return result;
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
    const baseDim=getPartDimensions("base",v);
    makePart("base",box=>box(0,0,0,baseDim.length/10,baseDim.width/10,baseDim.thickness/10,shade(metal,-12)),[0,65]);
    const postParts=[
      ["post-front-left",0,0,-55,0],["post-front-right",v.width-post,0,55,0],
      ["post-rear-left",0,v.depth-post,-55,20],["post-rear-right",v.width-post,v.depth-post,55,20]
    ];
    postParts.forEach(([id,x,y,dx,dy])=>{
      const dim=getPartDimensions(id,v),pw=dim.width/10,pd=dim.depth/10;
      const px=id.endsWith("right")?v.width-pw:x,py=id.includes("rear")?v.depth-pd:y;
      makePart(id,box=>box(px,py,3,pw,pd,dim.length/10,dark),[dx,dy]);
    });
    const frameDim=getPartDimensions("top-frame",v);
    makePart("top-frame",box=>box(0,0,v.height-frameDim.thickness/10,frameDim.length/10,frameDim.width/10,frameDim.thickness/10,metal),[0,-75]);
    const railDim=getPartDimensions("hanger-rail",v);
    makePart("hanger-rail",box=>box(post,v.depth*.48,v.height-20,railDim.length/10,railDim.width/10,railDim.depth/10,shade(metal,35)),[0,-112]);
    for(let i=0;i<v.shelves;i++){
      const id="shelf-"+(i+1),z=12+(v.height-28)*(i+1)/(v.shelves+1);
      const shelfDim=getPartDimensions(id,v);
      makePart(id,box=>{box(post,post,z,shelfDim.length/10,shelfDim.width/10,shelfDim.thickness/10,v.material==="wood"?"#a8794b":shade(metal,-8));},[0,(i%2===0?1:-1)*(32+22*i)]);
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
    renderAssemblyGuide();
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
    const dims=getPartDimensions(part.id,standValues());
    $("partDimLength").value=Math.round(dims.length||0);
    $("partDimWidth").value=Math.round(dims.width||0);
    $("partDimThickness").value=Math.round(dims.thickness||dims.depth||0);
    $("partDimWidthLabel").textContent=part.id==="base"||part.id.startsWith("shelf-")?"العرض / العمق (مم)":"عرض القطاع (مم)";
    $("partDimThicknessLabel").textContent=part.id.startsWith("post-")||part.id==="hanger-rail"?"عمق القطاع (مم)":"السُمك (مم)";
    const joint=spec.joint||{};
    renderConnectionLibrary();
    renderJointPartnerOptions(part.id);
    $("partJointType").value=joint.type||"bolt";
    $("partJointQty").value=joint.quantity??2;
    $("partJointDiameter").value=joint.diameter??6;
    $("partJointLength").value=joint.length??20;
    $("partJointPosition").value=joint.position||"عند طرفي القطعة";
  }
  const jointTypeLabels={bolt:"مسمار وصامولة",screw:"برغي",insert:"جلبة ملولبة",slot:"تعشيق ولسان ومجرى",plate:"صفيحة تثبيت",weld:"لحام ثابت"};
  function renderConnectionLibrary(){
    const select=$("connectionLibrarySelect");if(!select)return;
    const chosen=select.value;select.replaceChildren();
    const first=document.createElement("option");first.value="";first.textContent="اختار وصلة محفوظة لإعادة استخدامها";select.appendChild(first);
    (data.connectionLibrary||[]).forEach(item=>{const option=document.createElement("option");option.value=item.id;option.textContent=item.name+" — "+(jointTypeLabels[item.joint.type]||item.joint.type);select.appendChild(option);});
    if((data.connectionLibrary||[]).some(item=>item.id===chosen))select.value=chosen;
  }
  function applyLibraryConnection(){
    const item=(data.connectionLibrary||[]).find(entry=>entry.id===$("connectionLibrarySelect").value);
    if(!item){toast("اختار وصلة من المكتبة الأول");return;}
    $("partJointType").value=item.joint.type||"bolt";$("partJointQty").value=item.joint.quantity??0;
    $("partJointDiameter").value=item.joint.diameter??0;$("partJointLength").value=item.joint.length??0;
    $("partJointPosition").value=item.joint.position||"";
    toast("تم تحميل بيانات الوصلة؛ احفظ مواصفات القطعة لتطبيقها");
  }
  function saveConnectionToLibrary(){
    const name=prompt("اسم الوصلة في المكتبة، مثال: تثبيت رف جانبي");if(name===null)return;
    const clean=name.trim();if(!clean){toast("اكتب اسمًا للوصلة");return;}
    if((data.connectionLibrary||[]).some(item=>item.name.toLowerCase()===clean.toLowerCase())){toast("اسم الوصلة موجود في المكتبة بالفعل");return;}
    const joint={type:$("partJointType").value,quantity:Math.max(0,Math.min(100,Number($("partJointQty").value)||0)),diameter:Math.max(0,Math.min(30,Number($("partJointDiameter").value)||0)),length:Math.max(0,Math.min(200,Number($("partJointLength").value)||0)),position:$("partJointPosition").value.trim().slice(0,120)};
    data.connectionLibrary=data.connectionLibrary||[];const item={id:uid(),name:clean,joint,createdAt:new Date().toISOString()};data.connectionLibrary.push(item);
    try{save();renderConnectionLibrary();$("connectionLibrarySelect").value=item.id;toast("اتحفظت الوصلة في المكتبة لإعادة استخدامها");}
    catch(error){data.connectionLibrary.pop();toast("تعذر حفظ الوصلة في مساحة التخزين");}
  }
  function renderJointPartnerOptions(currentId){
    const select=$("partJointPartner");if(!select)return;
    select.replaceChildren();
    const none=document.createElement("option");none.value="";none.textContent="غير محدد — وصلة عامة";select.appendChild(none);
    standPartDefinitions(standValues()).filter(part=>part.id!==currentId).forEach(part=>{
      const option=document.createElement("option");option.value=part.id;
      const spec=partSpecs[part.id]||{};option.textContent=spec.name||part.name;select.appendChild(option);
    });
    select.value=partSpecs[currentId]?.joint?.partnerId||"";
  }
  function saveSelectedPart(){
    const part=standPartDefinitions(standValues()).find(p=>p.id===selectedPartId);
    if(!part)return;
    partSpecs[selectedPartId]={
      name:$("partCustomName").value.trim()||part.name,
      material:$("partCustomMaterial").value.trim(),
      notes:$("partCustomNotes").value.trim(),
      joint:{
        type:$("partJointType").value,
        quantity:Math.max(0,Math.min(100,Number($("partJointQty").value)||0)),
        diameter:Math.max(0,Math.min(30,Number($("partJointDiameter").value)||0)),
        length:Math.max(0,Math.min(200,Number($("partJointLength").value)||0)),
        position:$("partJointPosition").value.trim().slice(0,120),
        partnerId:$("partJointPartner").value||null
      },
      dimensions:{
        length:Math.max(1,Math.min(3000,Number($("partDimLength").value)||partDimensionDefaults(part.id,standValues()).length)),
        width:Math.max(1,Math.min(3000,Number($("partDimWidth").value)||partDimensionDefaults(part.id,standValues()).width)),
        [part.id.startsWith("post-")||part.id==="hanger-rail"?"depth":part.id==="base"||part.id.startsWith("shelf-")?"width":"thickness"]:Math.max(1,Math.min(3000,Number($("partDimThickness").value)||partDimensionDefaults(part.id,standValues()).thickness||partDimensionDefaults(part.id,standValues()).depth))
      }
    };
    if(currentDesignId){
      const index=data.designs.findIndex(d=>d.id===currentDesignId);
      if(index>=0)data.designs[index].parts=JSON.parse(JSON.stringify(partSpecs));
    }
    try{save();renderStandModel();toast("تم حفظ مواصفات القطعة");}
    catch(error){toast("تعذر حفظ التعديل في مساحة التخزين");}
  }
  function createAssemblyDraft(){
    const defs=standPartDefinitions(standValues()),byId=new Map(defs.map(part=>[part.id,part]));
    const rank=id=>id==="base"?0:id.startsWith("post-")?1:id==="top-frame"?2:id==="hanger-rail"?3:id.startsWith("shelf-")?4:5;
    const seen=new Set(),steps=[];
    defs.forEach(part=>{
      const joint=partSpecs[part.id]?.joint||{},partnerId=joint.partnerId;
      if(!partnerId||!byId.has(partnerId)||!joint.type)return;
      const pair=[part.id,partnerId].sort().join("|");if(seen.has(pair))return;seen.add(pair);
      const partner=byId.get(partnerId),spec=partSpecs[part.id]||{};
      steps.push({id:uid(),partId:part.id,partnerId,partName:spec.name||part.name,partnerName:partSpecs[partnerId]?.name||partner.name,jointType:joint.type,quantity:Number(joint.quantity)||0,diameter:Number(joint.diameter)||0,length:Number(joint.length)||0,position:String(joint.position||""),note:""});
    });
    steps.sort((a,b)=>rank(a.partId)-rank(b.partId));assemblySteps=steps;renderAssemblyGuide();persistAssemblySteps();
    toast(steps.length?"اتولدت مسودة من الوصلات المحددة فقط":"مفيش وصلات مرتبطة بطرفين؛ حدّد القطعة المتصلة واحفظها الأول");
  }
  function renderAssemblyGuide(){
    const host=$("assemblyStepsList");if(!host)return;host.replaceChildren();
    if(!assemblySteps.length){const p=document.createElement("p");p.className="field-hint";p.textContent="لسه مفيش خطوات. احفظ وصلة وحدد القطعة المتصلة بها، وبعدها ولّد المسودة.";host.appendChild(p);return;}
    assemblySteps.forEach((step,index)=>{
      const card=document.createElement("div");card.className="assembly-step";
      const head=document.createElement("div");head.className="assembly-step-head";
      const title=document.createElement("strong");title.textContent="الخطوة "+(index+1)+" — "+step.partName+" مع "+step.partnerName;head.appendChild(title);
      const controls=document.createElement("div");controls.className="assembly-step-controls";
      [["↑","up"],["↓","down"],["حذف","remove"]].forEach(([label,action])=>{const b=document.createElement("button");b.type="button";b.className="button button-quiet";b.textContent=label;b.dataset.stepAction=action;b.dataset.stepId=step.id;b.disabled=(action==="up"&&index===0)||(action==="down"&&index===assemblySteps.length-1);controls.appendChild(b);});
      head.appendChild(controls);card.appendChild(head);
      const detail=document.createElement("p");detail.textContent=(jointTypeLabels[step.jointType]||step.jointType)+" — العدد: "+step.quantity+" — القطر: "+step.diameter+" مم — الطول: "+step.length+" مم — المكان: "+(step.position||"غير محدد");card.appendChild(detail);
      const label=document.createElement("label");label.textContent="ملاحظة تنفيذ للخطوة";const input=document.createElement("input");input.type="text";input.maxLength=180;input.value=step.note||"";input.dataset.stepNote=step.id;input.placeholder="مثال: راجع تطابق الفتحات قبل الربط";label.appendChild(input);card.appendChild(label);host.appendChild(card);
    });
  }
  function persistAssemblySteps(){if(currentDesignId){const saved=data.designs.find(d=>d.id===currentDesignId);if(saved)saved.assemblySteps=JSON.parse(JSON.stringify(assemblySteps));}save();}
  function handleAssemblyGuideClick(event){
    const button=event.target.closest("button[data-step-action]");if(!button)return;
    const index=assemblySteps.findIndex(step=>step.id===button.dataset.stepId);if(index<0)return;
    const action=button.dataset.stepAction;
    if(action==="remove")assemblySteps.splice(index,1);
    else{const target=action==="up"?index-1:index+1;if(target<0||target>=assemblySteps.length)return;[assemblySteps[index],assemblySteps[target]]=[assemblySteps[target],assemblySteps[index]];}
    renderAssemblyGuide();persistAssemblySteps();
  }
  function handleAssemblyNote(event){
    const input=event.target.closest("input[data-step-note]");if(!input)return;
    const step=assemblySteps.find(item=>item.id===input.dataset.stepNote);if(step){step.note=input.value;persistAssemblySteps();}
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
    currentDesignId=d.id; partSpecs=d.parts||{}; assemblySteps=Array.isArray(d.assemblySteps)?d.assemblySteps:[]; selectedPartId="base";
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
    currentDesignId=null; pendingReferenceImage=""; partSpecs={}; assemblySteps=[]; selectedPartId="base"; explodedView=false;
    $("designName").value="استاند عرض ملابس"; $("standWidth").value=90;
    $("standHeight").value=180; $("standDepth").value=45; $("shelfCount").value=3;
    $("standMaterial").value="steel"; $("standColor").value="#c49a55"; $("standNotes").value="";
    $("standImage").value=""; $("referencePreview").hidden=true; $("referenceImageBox").hidden=true;
    $("savedDesigns").value=""; renderStandModel();
  }
  function exportStandOBJ() {
    const v=standValues(), output=["# Naseej separate-part stand model","# Units: centimeters","o Naseej_Stand"];
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
    const mm=n=>n/10;
    const base=getPartDimensions("base",v), bx=mm(base.length), by=mm(base.width);
    const baseThickness=mm(base.thickness);
    addPart("Base",[[0,0,0,bx,by,baseThickness]]);
    ["post-front-left","post-front-right","post-rear-left","post-rear-right"].forEach((id)=>{
      const dim=getPartDimensions(id,v),pw=mm(dim.width),pd=mm(dim.depth),ph=mm(dim.length);
      const x=id.endsWith("right")?bx-pw:0,y=id.includes("rear")?by-pd:0;
      addPart(id.replace(/-/g,"_"),[[x,y,baseThickness,pw,pd,ph]]);
    });
    const frame=getPartDimensions("top-frame",v);
    addPart("Top_Frame",[[0,0,v.height-mm(frame.thickness),mm(frame.length),mm(frame.width),mm(frame.thickness)]]);
    const rail=getPartDimensions("hanger-rail",v);
    addPart("Hanger_Rail",[[mm(Math.max(0,base.width*0.05)),by*.48,v.height-20,mm(rail.length),mm(rail.width),mm(rail.depth)]]);
    for(let i=0;i<v.shelves;i++){
      const id="shelf-"+(i+1),dim=getPartDimensions(id,v);
      const z=12+(v.height-28)*(i+1)/(v.shelves+1);
      addPart("Shelf_"+(i+1),[[mm(30),mm(30),z,mm(dim.length),mm(dim.width),mm(dim.thickness)]]);
    }
    const blob=new Blob([output.join("\n")],{type:"model/obj"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=safeFileName(v.name)+".obj";document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
    toast("تم تصدير المجسم بأبعاد القطع المعدلة");
  }

  function safeFileName(value) {
    return (value || "naseej-design").replace(/[^\\p{L}\\p{N}_-]+/gu,"_").slice(0,80) || "naseej-design";
  }
  function downloadBlobFile(content,type,filename) {
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function exportDesignDataFile() {
    const design=standValues();
    design.parts=JSON.parse(JSON.stringify(partSpecs));
    design.assemblySteps=JSON.parse(JSON.stringify(assemblySteps));
    design.exportedAt=new Date().toISOString();
    design.connectionLibrary=JSON.parse(JSON.stringify(data.connectionLibrary||[]));
    design.format="naseej-design-v1";
    downloadBlobFile(JSON.stringify(design,null,2),"application/json;charset=utf-8",safeFileName(design.name)+".naseej.json");
    toast("تم حفظ ملف التصميم الأصلي");
  }
  function exportStandaloneDesignFile() {
    const v=standValues();
    renderManufacturingSheet();
    const svgSource=new XMLSerializer().serializeToString($("standPreview"));
    const parts=standPartDefinitions(v).map(part=>{
      const spec=partSpecs[part.id]||{},dimensions=getPartDimensions(part.id,v);
      const joint=spec.joint||{type:"bolt",quantity:2,diameter:6,length:20,position:"عند طرفي القطعة"};
      return {id:part.id,name:spec.name||part.name,material:spec.material||part.material,notes:spec.notes||part.notes,dimensions,joint,connectedPartName:joint.partnerId?(standPartDefinitions(v).find(p=>p.id===joint.partnerId)?.name||joint.partnerId):"غير محدد"};
    });
    const esc=value=>String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
    const partRows=parts.map(p=>"<tr><td>"+esc(p.name)+"</td><td>"+esc(p.material)+"</td><td>"+esc(Object.entries(p.dimensions).map(([key,value])=>key+": "+value+" مم").join(" — "))+"</td><td>"+esc(p.joint.type+" — عدد "+p.joint.quantity+" — قطر "+p.joint.diameter+" مم — طول "+p.joint.length+" مم — "+p.joint.position+" — متصلة بـ: "+p.connectedPartName)+"</td><td>"+esc(p.notes)+"</td></tr>").join("");
    const assemblyRows=(assemblySteps||[]).map((step,index)=>"<li><b>الخطوة "+(index+1)+": "+esc(step.partName)+" مع "+esc(step.partnerName)+"</b><br>"+esc((jointTypeLabels[step.jointType]||step.jointType)+" — العدد "+step.quantity+" — القطر "+step.diameter+" مم — الطول "+step.length+" مم — "+(step.position||"مكان غير محدد"))+(step.note?"<br>ملاحظة: "+esc(step.note):"")+"</li>").join("");
    const assemblySection="<section><h2>دليل التجميع — مسودة قابلة للمراجعة</h2>"+(assemblyRows?"<ol>"+assemblyRows+"</ol>":"<p>لا توجد خطوات تجميع محفوظة.</p>")+"<p class=\"note\">الخطوات مبنية على الوصلات التي تم ربط طرفيها داخل التصميم، وترتيبها قابل للتعديل. ليست تعليمات تنفيذ معتمدة.</p></section>";
    const cutRows=(latestCutRows||[]).map(row=>"<tr><td>"+esc(row.name)+"</td><td>"+esc(row.qty)+"</td><td>"+esc(row.length)+"</td><td>"+esc(row.total)+"</td><td>"+esc(row.material)+"</td></tr>").join("");
    const image=v.image?'<section><h2>الصورة المرجعية</h2><img class="reference" src="'+v.image+'" alt="الصورة المرجعية"></section>':"";
    const page=[
      "<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+esc(v.name)+" - تصميم مستقل من نسيج</title>",
      "<style>body{font-family:Arial,Tahoma,sans-serif;margin:0;background:#eef1f5;color:#182334;line-height:1.7}.wrap{max-width:1100px;margin:auto;padding:24px}.hero{background:#142235;color:#fff;padding:24px;border-radius:18px}.hero h1{margin:0 0 8px}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0}.meta div,section{background:#fff;border:1px solid #dce2e9;border-radius:14px;padding:16px}.model{background:#0b1523;border-radius:14px;padding:12px;overflow:auto}.model svg{display:block;width:100%;height:auto;max-height:680px}.reference{max-width:100%;max-height:420px;object-fit:contain}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #dce2e9;padding:9px;text-align:right;vertical-align:top}th{background:#edf1f6}h2{margin-top:0}.note{color:#586579;font-size:13px}.actions{margin:16px 0}@media print{body{background:#fff}.wrap{max-width:none;padding:0}.hero,section{break-inside:avoid}.actions{display:none}}</style></head><body><main class=\"wrap\">",
      "<header class=\"hero\"><h1>"+esc(v.name)+"</h1><div>ملف عرض مستقل صادر من نسيج</div><div class=\"note\">يمكن فتح هذا الملف مباشرة في متصفح الكمبيوتر أو الهاتف دون فتح موقع نسيج.</div></header>",
      "<div class=\"meta\"><div><b>العرض</b><br>"+esc(v.width)+" سم</div><div><b>الارتفاع</b><br>"+esc(v.height)+" سم</div><div><b>العمق</b><br>"+esc(v.depth)+" سم</div><div><b>عدد الرفوف</b><br>"+esc(v.shelves)+"</div><div><b>الخامة الرئيسية</b><br>"+esc(v.material)+"</div></div>",
      "<section><h2>المعاينة المجسمة</h2><div class=\"model\">"+svgSource+"</div></section>",
      "<section><h2>بيانات القطع وأبعادها المستقلة</h2><table><thead><tr><th>القطعة</th><th>الخامة / المقطع</th><th>الأبعاد (مم)</th><th>طريقة التثبيت</th><th>الملاحظات</th></tr></thead><tbody>"+partRows+"</tbody></table></section>",
      assemblySection,
      "<section><h2>جدول القص المبدئي</h2><table><thead><tr><th>القطعة</th><th>العدد</th><th>طول القطعة مم</th><th>الإجمالي مم</th><th>الخامة</th></tr></thead><tbody>"+cutRows+"</tbody></table></section>",
      "<section><h2>ملاحظات التصميم</h2><p>"+esc(v.notes||"لا توجد ملاحظات إضافية.")+"</p><p class=\"note\">هذا ملف عرض وحصر مبدئي، وليس اعتمادًا إنشائيًا أو أمر تصنيع نهائيًا. يجب مراجعة المقاسات والوصلات والسماكات والأحمال قبل التصنيع.</p></section>",
      image,
      "<div class=\"actions\"><button onclick=\"window.print()\">طباعة / حفظ PDF</button></div><p class=\"note\">تم إنشاء الملف بواسطة نسيج.</p></main></body></html>"
    ].join("");
    downloadBlobFile(page,"text/html;charset=utf-8",safeFileName(v.name)+".html");
    toast("تم تجهيز ملف العرض المستقل");
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
    {id:"decor-planter",cat:"decor",name:"أحواض زرع وفواصل",icon:"🌿",size:"أحواض 300–1200 طول؛ ارتفاع 400–900 مم مرجعي",material:"صاج مطلي أو ستانلس + بطانة عازلة",detail:"فتحات صرف وبطانة داخلية وحماية الأرضية من المياه."},
    {id:"toycar-rideon",cat:"toycar",name:"عربية أطفال كهربائية للركوب",icon:"🚗",size:"طول 800–1400؛ عرض 450–800؛ ارتفاع 400–700 مم مرجعي",material:"هيكل بلاستيك هندسي + شاسيه معدني اختياري + عجلات",detail:"تصميم مقعد وحزام مناسبين للعمر، محدد سرعة، مفتاح فصل وبطارية محمية؛ يلزم اختبار الثبات والفرامل والكهرباء."},
    {id:"toycar-rc",cat:"toycar",name:"عربية أطفال تحكم عن بعد",icon:"🏎️",size:"طول 180–400؛ عرض 120–250؛ ارتفاع 80–160 مم مرجعي",material:"شاسيه بلاستيك أو معدن خفيف + موتور + عجلات + بطارية",detail:"وحدات قابلة للفك: شاسيه، تعليق، عجلات، غطاء، وحدة تحكم؛ مع حماية التروس والبطارية."},
    {id:"toycar-pedal",cat:"toycar",name:"عربية أطفال بدواسات",icon:"🚙",size:"طول 700–1200؛ عرض 400–650 مم مرجعي",material:"شاسيه خفيف + دواسات + نقل حركة مغلق + عجلات",detail:"تصميم ميكانيكي بسيط مع تغطية السلسلة ونقاط الحركة وحواف مستديرة."},
    {id:"toycar-track",cat:"toycar",name:"مضمار ومرآب عربيات لعب",icon:"🛣️",size:"وحدات مضمار 300–1000 مم؛ يتغير حسب مساحة اللعب",material:"بلاستيك أو خشب + وصلات تعشيق",detail:"وحدات مستقيمة ومنحنيات ومنحدرات تتجمع وتتفك وتتوسع دون حواف حادة."},
    {id:"toyair-plane",cat:"toyair",name:"طائرة أطفال شراعية خفيفة",icon:"🛩️",size:"باع جناح 300–900 مم مرجعي حسب الوزن والخامة",material:"فوم خفيف أو بلاستيك مرن + أجزاء تقوية",detail:"نموذج تعليمي غير مزود بمحرك؛ نراجع مركز الثقل وحواف الجناح قبل التجربة."},
    {id:"toyair-rc",cat:"toyair",name:"طائرة أطفال تحكم عن بعد",icon:"✈️",size:"باع جناح 500–1200 مم كنطاق تصميم أولي",material:"فوم EPP/EPO + موتور ومروحة محمية + إلكترونيات",detail:"تصميم وحدات قابلة للاستبدال للجناح والذيل والهيكل؛ يلزم ضبط الوزن ومركز الثقل واختبارات طيران آمنة."},
    {id:"toyair-quad",cat:"toyair",name:"طائرة رباعية المراوح للأطفال",icon:"🚁",size:"فئة صغيرة بمراوح 2–3 بوصة؛ ارتفاع تشغيل تعليمي محدود",material:"إطار خفيف + 4 محركات بدون فرش + حواجز مراوح + متحكم",detail:"مشروع تطوير تدريجي: ثبات وتحكم يدوي، مستقبل 2.4 جيجاهرتز، بطارية محمية، وحواجز كاملة للمراوح؛ لا تُشغّل قرب الأشخاص."},
    {id:"toyair-quadguard",cat:"toyair",name:"هيكل وحواجز حماية للدرون",icon:"🛡️",size:"الأبعاد حسب قطر المروحة والمسافة بين المحركات",material:"بلاستيك مرن أو نايلون مطبوع ثلاثي الأبعاد",detail:"قطع منفصلة قابلة للاستبدال، تثبيت لا يلامس المروحة، وفحص الاتزان والاهتزاز."},
    {id:"toyair-launcher",cat:"toyair",name:"مجسم طائرة إطلاق يدوي تعليمي",icon:"🪂",size:"طول 250–500 مم مرجعي",material:"فوم خفيف أو كرتون هندسي",detail:"تصميم انزلاقي يدوي بسيط بلا محرك أو آلية قذف قوية، مع أطراف لينة."},
    {id:"toyprops-pistol",cat:"toyprops",name:"مسدس لعبة شكلي غير وظيفي",icon:"🧸",size:"الطول 150–250 مم مرجعي؛ حسب الفئة العمرية",material:"بلاستيك أو فوم لين بلون واضح غير واقعي",detail:"مجسم لعب آمن غير قابل للإطلاق ولا يحتوي على زناد تشغيلي أو أجزاء قذف؛ يجب أن يختلف شكله بوضوح عن السلاح الحقيقي."},
    {id:"toyprops-foam",cat:"toyprops",name:"مجسمات أدوات ومركبات فوم",icon:"🧩",size:"مقاسات متنوعة حسب اللعبة",material:"فوم لين أو بلاستيك مرن",detail:"أجزاء كبيرة غير قابلة للبلع، حواف مستديرة، وألوان واضحة؛ لا يتضمن مقذوفات أو آليات إطلاق."},
    {id:"toyprops-robot",cat:"toyprops",name:"روبوت لعبة قابل للفك والتركيب",icon:"🤖",size:"ارتفاع 150–400 مم مرجعي",material:"بلاستيك أو فوم + مفاصل آمنة",detail:"وحدات جسم وأذرع وأرجل قابلة للتبديل، مع منع الحواف الحادة والأجزاء الصغيرة حسب العمر."},
    {id:"water-pistol-manual",cat:"water",name:"مسدس مياه يدوي صغير",icon:"💦",size:"طول 120–220 مم؛ خزان 30–100 مل مرجعي",material:"بلاستيك آمن مناسب للعب + مانع تسرب",detail:"مضخة يدوية بسيطة لرش الماء فقط، مع ضغط منخفض وفوهة غير حادة وسهولة الفك والتنظيف."},
    {id:"water-blaster-tank",cat:"water",name:"مسدس مياه بخزان أكبر",icon:"🔫",size:"طول 250–450 مم؛ خزان 300–800 مل مرجعي",material:"بلاستيك متين + خزان قابل للفك + جوانات",detail:"خزان تعبئة قابل للفصل، غطاء محكم، وصمام تنفيس آمن يمنع تراكم الضغط."},
    {id:"water-blaster-electric",cat:"water",name:"مسدس مياه كهربائي",icon:"🔋",size:"طول 250–400 مم؛ خزان 200–500 مل مرجعي",material:"بلاستيك + مضخة مياه صغيرة + بطارية محمية",detail:"مضخة منخفضة الجهد ومجرى مياه معزول تمامًا عن حجرة البطارية، مع حماية من التسرب وفصل كهربائي آمن."},
    {id:"water-toy-squirters",cat:"water",name:"ألعاب رش مياه وأشكال صيفية",icon:"🐳",size:"أحجام متنوعة تناسب يد الطفل",material:"بلاستيك مرن أو سيليكون مناسب للعب",detail:"أشكال حيوانات وألعاب ضغط يدوي للمياه، سهلة التنظيف وخالية من الأجزاء الصغيرة القابلة للانفصال."},
    {id:"water-play-set",cat:"water",name:"طقم ألعاب مياه جماعي",icon:"🌊",size:"وحدات رش صغيرة وخراطيم قصيرة حسب مساحة اللعب",material:"بلاستيك مقاوم للماء + وصلات سريعة",detail:"وحدات قابلة للتجميع والفك، ضغط مياه منخفض، وصلات آمنة، وأرضية لعب غير زلقة."}
  ];
  const catalogLabels={fashion:"محلات الملابس",retail:"التجزئة والسوبر ماركت",cafe:"الكافيهات والمطاعم",mall:"المولات والأكشاك",metal:"مشغولات الحديد",decor:"الديكور والعناصر الخاصة",toycar:"عربيات ومركبات الأطفال",toyair:"الطائرات والدرون",toyprops:"ألعاب ومجسمات أطفال",water:"مسدسات وألعاب المياه"};
  function openMaterialSampleInModel(material){
    const materials={steel:{label:"مواسير الحديد",color:"#87919b"},aluminum:{label:"قطاعات الألومنيوم",color:"#c4cbd2"},wood:{label:"الخشب مع المعدن",color:"#a87945"}};
    const chosen=materials[material]||materials.steel;
    modelObjects=[
      {id:uid(),type:"box",label:chosen.label+" — قطاع مستطيل",x:-180,y:0,z:0,w:420,h:40,d:40,color:chosen.color,rx:0,ry:0,rz:0},
      {id:uid(),type:"box",label:chosen.label+" — لوح خامة",x:180,y:0,z:0,w:420,h:18,d:260,color:chosen.color,rx:0,ry:0,rz:0},
      {id:uid(),type:"box",label:chosen.label+" — عينة قطاع",x:0,y:100,z:0,w:300,h:30,d:30,color:chosen.color,rx:0,ry:0,rz:0}
    ];
    selectedModelObjectId=modelObjects[0].id;
    modelProjectName="معاينة خامة: "+chosen.label;
    window.activeModelProjectId=null;
    $("modelName").value=modelProjectName;
    $("modelCameraAngle").value=35;modelCameraAngle=35;
    const tab=document.querySelector('.main-tab[data-view="modelView"]');if(tab)tab.click();
    renderModelDrawing();renderModelObjectEditor();
    toast("فتحنا معاينة "+chosen.label+" في الرسم ثلاثي الأبعاد");
  }

  function renderCatalogCategoryLaunchers(){
    const host=$("catalogCategoryLaunchers");if(!host)return;
    host.replaceChildren();
    Object.entries(catalogLabels).forEach(([key,label])=>{
      const first=fabricationCatalog.find(item=>item.cat===key);if(!first)return;
      const btn=document.createElement("button");btn.type="button";btn.className="button button-quiet";
      btn.textContent="رسم قسم "+label+" 3D";
      btn.addEventListener("click",()=>openCatalogItemInModel(first));
      host.append(btn);
    });
  }

  function openCatalogItemInModel(item){
    const color=$("standColor")?.value||"#c49a55";
    const objects=[];
    const add=(label,x,y,z,w,h,d,partColor=color,type="box",rx=0,ry=0,rz=0)=>objects.push({id:uid(),type,label,x,y,z,w,h,d,color:partColor,rx,ry,rz});
    const dark="#263342",glass="#6e9eae",rubber="#20252b",metal="#aeb9c5",light="#f3d98a";
    if(item.id==="fashion-rail"){
      const width=1050,height=1600,depth=525,tube=30,plate=24,px=width/2-tube/2,pz=depth/2-tube/2;
      add("القاعدة",0,0,0,width,plate,depth);
      add("القائم الأمامي الأيسر",-px,plate,-pz,tube,height-plate,tube);add("القائم الأمامي الأيمن",px,plate,-pz,tube,height-plate,tube);
      add("القائم الخلفي الأيسر",-px,plate,pz,tube,height-plate,tube);add("القائم الخلفي الأيمن",px,plate,pz,tube,height-plate,tube);
      add("عارضة الإطار الأمامية",0,height-tube,-pz,width,tube,tube);add("عارضة الإطار الخلفية",0,height-tube,pz,width,tube,tube);
      add("عارضة الجانب الأيسر",-px,height-tube,0,tube,tube,depth);add("عارضة الجانب الأيمن",px,height-tube,0,tube,tube,depth);
      add("ماسورة تعليق الملابس",0,height-2*tube,0,width-2*tube,24,24,metal);
    }else if(item.id.startsWith("toycar-")&&item.id!=="toycar-track"){
      const ride=item.id==="toycar-rideon"||item.id==="toycar-pedal";
      const L=ride?1100:320,W=ride?620:190,H=ride?520:125;
      const wheel=ride?185:66, wheelW=ride?75:28, axleX=L*.31, axleZ=W*.43, baseY=wheel*.48;
      add("الشاسيه السفلي",0,baseY+35,0,L*.72,70,W*.58,dark);
      add("أرضية المقصورة",0,baseY+90,0,L*.58,28,W*.62,metal);
      add("غطاء الجسم السفلي",0,baseY+120,0,L*.86,ride?145:48,W*.88,color);
      add("غطاء المقدمة",L*.29,baseY+190,0,L*.28,ride?90:35,W*.82,color);
      add("المصد الأمامي",L*.47,baseY+95,0,ride?48:22,ride?58:28,W*.96,dark);
      add("المصد الخلفي",-L*.45,baseY+95,0,ride?42:20,W*.9,ride?48:24,dark);
      add("الكابينة", -L*.08,baseY+(ride?245:75),0,L*.40,ride?190:45,W*.66,color);
      add("السقف", -L*.08,baseY+(ride?435:113),0,L*.36,ride?28:12,W*.68,dark);
      add("الزجاج الأمامي",L*.08,baseY+(ride?300:90),0,L*.035,ride?125:27,W*.60,glass);
      add("الزجاج الخلفي",-L*.25,baseY+(ride?300:90),0,L*.03,ride?115:25,W*.58,glass);
      add("المقعد", -L*.12,baseY+(ride?160:105),0,L*.20,ride?85:24,W*.42,dark);
      if(ride)add("عجلة القيادة",L*.08,baseY+245,0,95,18,18,dark,"cylinder",90);
      [-1,1].forEach(side=>{
        [-1,1].forEach(front=>{
          const x=front*axleX,z=side*axleZ;
          add((front>0?"العجلة الأمامية ":"العجلة الخلفية ")+(side>0?"اليمنى":"اليسرى"),x,baseY-wheelW/2,z,wheel,wheelW,wheel,rubber,"cylinder",90);
          add("جنط العجلة",x,baseY-wheel/2,z+side*(wheelW*.52),wheel*.48,wheelW*.18,wheel*.48,metal,"cylinder",90);
        });
      });
      add("المصباح الأمامي الأيمن",L*.45,baseY+170,W*.31,ride?55:20,ride?38:12,ride?48:18,light);
      add("المصباح الأمامي الأيسر",L*.45,baseY+170,-W*.31,ride?55:20,ride?38:12,ride?48:18,light);
      add("المحور الأمامي",L*.31,baseY-wheel/2,0,28,28,W*.88,metal);
      add("المحور الخلفي",-L*.31,baseY-wheel/2,0,28,28,W*.88,metal);
    }else if(item.id==="toyair-plane"||item.id==="toyair-rc"){
      const L=item.id==="toyair-plane"?650:900,span=item.id==="toyair-plane"?780:1050;
      add("جسم الطائرة",0,110,0,L,72,74,"#e8e2d2");
      add("مقدمة الطائرة",L*.39,110,0,150,60,62,"#e8e2d2");
      add("الجناح الرئيسي",0,155,0,170,24,span,"#d7dce2");
      add("الجناح الخلفي", -L*.36,155,0,95,18,span*.34,"#d7dce2");
      add("الزعنفة الرأسية",-L*.36,205,0,105,110,20,"#d7dce2");
      add("قمرة القيادة",L*.04,190,0,L*.22,72,66,glass);
      add("المروحة — الشفرة الأولى",L*.49,112,0,22,18,220,metal,"box",0,0,0);
      add("المروحة — الشفرة الثانية",L*.49,112,0,220,18,22,metal,"box",0,0,0);
      add("قاعدة الهبوط الأمامية",L*.12,20,0,22,90,22,dark);
      add("قاعدة الهبوط الخلفية",-L*.27,20,0,22,90,22,dark);
    }else if(item.id==="toyair-launcher"){
      add("جسم الطائرة الانزلاقية",0,100,0,420,45,48,"#e8e2d2");
      add("الجناح الرئيسي",0,125,0,85,14,520,"#d7dce2");
      add("الجناح الخلفي",-155,135,0,55,12,180,"#d7dce2");
      add("الذيل الرأسي",-170,175,0,55,90,14,"#d7dce2");
      add("مقدمة مستديرة",205,100,0,65,38,42,"#e8e2d2");
    }else if(item.id.startsWith("toyair-quad")){
      const arm=220,span=580,guard=130;
      add("اللوح المركزي السفلي",0,80,0,220,28,180,dark);
      add("غطاء الإلكترونيات",0,110,0,180,45,145,color);
      add("ذراع أمامي أيمن",arm/2,80,arm/2,span/2,28,34,metal,"box",0,45,0);
      add("ذراع أمامي أيسر",arm/2,80,-arm/2,span/2,28,34,metal,"box",0,-45,0);
      add("ذراع خلفي أيمن",-arm/2,80,arm/2,span/2,28,34,metal,"box",0,-45,0);
      add("ذراع خلفي أيسر",-arm/2,80,-arm/2,span/2,28,34,metal,"box",0,45,0);
      [[arm,arm],[arm,-arm],[-arm,arm],[-arm,-arm]].forEach((p,i)=>{
        const [x,z]=p;
        add("محرك "+(i+1),x,105,z,62,42,62,dark,"cylinder");
        add("شفرة مروحة "+(i+1)+" أ",x,150,z,18,8,guard*1.7,metal);
        add("شفرة مروحة "+(i+1)+" ب",x,150,z,guard*1.7,8,18,metal);
        add("حاجز حماية "+(i+1)+" — أمامي",x,145,z-guard,guard*1.8,12,12,color);
        add("حاجز حماية "+(i+1)+" — خلفي",x,145,z+guard,guard*1.8,12,12,color);
        add("حاجز حماية "+(i+1)+" — يمين",x+guard,145,z,12,12,guard*2,color);
        add("حاجز حماية "+(i+1)+" — يسار",x-guard,145,z,12,12,guard*2,color);
      });
      add("وحدة البطارية",0,45,-35,125,35,95,"#394c62");
      add("قاعدة الهبوط",0,15,0,300,12,230,dark);
    }else if(item.cat==="fashion"||item.cat==="retail"||item.cat==="cafe"||item.cat==="mall"){
      const w=1100,d=520,h=900,t=32;
      const legs=(ww,dd,hh,th=35)=>{[-1,1].forEach(x=>[-1,1].forEach(z=>add("رجل هيكل",x*(ww/2-th/2),0,z*(dd/2-th/2),th,hh,th,dark)));};
      const shelf=(label,y,ww=w-70,dd=d-70,th=24,mat=color)=>add(label,0,y,0,ww,th,dd,mat);
      const frame=(ww,dd,hh,th=35)=>{legs(ww,dd,hh,th);add("عارضة أمامية",0,hh-th,dd/2-th/2,ww,th,th);add("عارضة خلفية",0,hh-th,-dd/2+th/2,ww,th,th);add("عارضة جانبية يمين",ww/2-th/2,hh-th,0,th,th,dd);add("عارضة جانبية يسار",-ww/2+th/2,hh-th,0,th,th,dd);};
      if(item.id==="fashion-wall"){
        add("لوح تثبيت حائطي",0,500,-25,1200,1000,35,color);
        for(let y of [180,430,680]){add("حامل رف أيمن",480,y,30,35,220,35,dark);add("حامل رف أيسر",-480,y,30,35,220,35,dark);shelf("رف حائطي",y+210,1050,300,28);}
        add("ماسورة تعليق",0,930,210,1050,28,28,metal);
      }else if(item.id==="fashion-table"||item.id==="cafe-table"||item.id==="kitchen-table"){
        const ww=item.id==="kitchen-table"?1400:1100,dd=item.id==="cafe-table"?700:650,hh=item.id==="kitchen-table"?900:760;
        frame(ww,dd,hh,item.id==="kitchen-table"?40:45);add("سطح الترابيزة",0,hh-35,0,ww,35,dd,item.id==="kitchen-table"?"#c7cdd1":color);
        if(item.id==="cafe-table")add("قاعدة عمود وسط",0,20,0,100,hh-55,100,dark);
      }else if(item.id==="fashion-gondola"||item.id==="retail-gondola"||item.id==="retail-wall"||item.id==="fashion-shoes"){
        const double=item.id==="fashion-gondola"||item.id==="retail-gondola",ww=double?1200:1000,dd=double?900:420;
        frame(ww,dd,1700,35);
        for(let y=250;y<1600;y+=300){shelf("رف عرض مستوى "+(Math.round(y/300)),y,ww-55,dd-55,28);if(double)shelf("رف خلفي مقابل",y,ww-55,dd-55,28);}
        if(item.id.includes("shoes"))for(let y=180;y<1500;y+=260)add("حامل ميل رف الأحذية",0,y,0,ww-80,16,dd-70,metal);
        add("عارضة تقوية خلفية",0,850,-dd/2+20,ww,30,30,dark);
      }else if(item.id.includes("cash")||item.id.includes("checkout")||item.id==="cafe-counter"||item.id==="mall-food"){
        const ww=item.id==="retail-checkout"?1700:1300,dd=item.id==="retail-checkout"?750:650,hh=950;
        add("قاعدة الكاونتر",0,20,0,ww,40,dd,dark);add("واجهة أمامية",0,40,dd/2-18,ww,hh-40,36,color);
        add("جانب يمين",ww/2-18,40,0,36,hh-40,dd,color);add("جانب يسار",-ww/2+18,40,0,36,hh-40,dd,color);
        add("سطح الكاونتر",0,hh,0,ww+35,35,dd+35,metal);
        for(let x of [-ww*.28,0,ww*.28]){add("درج تخزين",x,hh*.35,-dd*.18,ww*.22,115,dd*.42,dark);add("واجهة درج",x,hh*.35,dd*.04,ww*.22,110,18,metal);}
        add("رف خدمة داخلي",0,hh*.48,-dd*.28,ww*.86,25,dd*.3,color);
        if(item.id==="retail-checkout")add("سير الكاشير",ww*.27,hh+20,0,ww*.35,24,dd*.72,dark);
      }else if(item.id==="fashion-mirror"){
        add("إطار المرآة",0,650,0,650,1300,35,metal);add("سطح المرآة",0,650,22,590,1240,8,glass);
        add("مقعد البنش",0,230,260,700,55,300,color);legs(700,300,230,35);
      }else if(item.id==="fashion-display"){
        add("قاعدة منصة",0,30,0,850,60,650,color);add("عمود تثبيت المانيكان",0,60,0,45,850,45,metal);add("قرص تثبيت علوي",0,900,0,260,30,260,metal);
        add("لوح خلفية عرض",0,750,-300,850,1100,30,dark);
      }else if(item.id==="retail-produce"){
        frame(1150,650,1450,35);for(let y of [300,650,1000])add("صندوق عرض مائل",0,y,80,1050,210,480,color, "box", -12);
        add("حافة أمامية",0,250,320,1080,55,28,metal);
      }else if(item.id==="retail-bakery"){
        add("قاعدة الفاترينة",0,30,0,1300,60,650,dark);add("أرضية العرض",0,100,0,1260,22,610,metal);
        add("زجاج أمامي",0,430,300,1260,650,14,glass);add("زجاج خلفي",0,430,-300,1260,650,14,glass);
        add("زجاج جانبي أيمن",630,430,0,14,650,610,glass);add("زجاج جانبي أيسر",-630,430,0,14,650,610,glass);
        add("سقف الفاترينة",0,770,0,1300,28,650,metal);shelf("رف زجاجي أول",330,1150,520,16,glass);shelf("رف زجاجي ثان",550,1150,520,16,glass);
      }else if(item.id==="cafe-backbar"){
        add("ظهر الوحدة",0,550,-230,1400,1100,35,color);for(let x of [-480,0,480]){add("رف علوي",x,900,-90,420,30,260,metal);add("رف أوسط",x,620,-90,420,30,260,metal);add("وحدة تخزين سفلية",x,250,0,420,420,420,color);}
      }else if(item.id==="cafe-partition"||item.id==="mall-bench"){
        if(item.id==="cafe-partition"){frame(1200,80,1500,30);add("لوح فاصل",0,750,0,1120,1350,18,glass);add("كسوة سفلية",0,250,0,1120,500,28,color);}
        else{add("مقعد",0,430,0,1400,65,420,color);add("ظهر المقعد",0,760,-180,1400,600,55,color);legs(1400,420,430,45);for(let x of [-600,0,600])add("مسند ذراع",x,620,0,70,350,480,metal);}
      }else if(item.id==="kitchen-sink"){
        frame(1200,650,880,40);add("حوض الستانلس",0,860,0,600,190,420,metal);add("تجويف الحوض",0,880,0,520,12,340,dark);add("رقبة الخلاط",0,1030,-180,28,170,28,metal);add("صنبور",0,1110,-80,180,25,25,metal);
      }else if(item.id==="kitchen-shelf"||item.id==="kitchen-rack"){
        const mobile=item.id==="kitchen-rack";frame(mobile?900:1400,mobile?600:380,mobile?1700:950,32);
        for(let y=mobile?120:220;y<(mobile?1600:900);y+=(mobile?380:300))shelf("رف ستانلس",y,mobile?820:1320,mobile?540:340,22,metal);
        if(mobile)[[-1,-1],[-1,1],[1,-1],[1,1]].forEach(p=>add("عجلة حركة",p[0]*410,45,p[1]*260,85,85,85,rubber,"cylinder"));
      }else if(item.id==="kitchen-hood"){
        add("غطاء الشفاط",0,900,0,1500,180,750,metal);add("مدخنة",0,1250,-100,420,650,420,metal);add("حافة تجميع",0,790,0,1550,25,800,dark);
      }else if(item.id==="cafe-trolley"||item.id==="kitchen-trolley"){
        frame(850,550,900,30);for(let y of [250,550,850])shelf("صينية خدمة",y,800,500,25,metal);
        [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(p=>add("عجلة العربة",p[0]*380,35,p[1]*230,90,70,90,rubber,"cylinder"));
        add("مقبض دفع",0,920,-250,500,25,25,metal);
      }else if(item.id==="mall-kiosk"){
        add("أرضية الكشك",0,25,0,2200,50,1600,dark);frame(2200,1600,2300,55);
        add("سقف الكشك",0,2300,0,2300,90,1700,color);add("كاونتر أمامي",0,900,780,2000,900,70,color);
        add("واجهة زجاجية",0,1550,650,1800,700,18,glass);add("لافتة علوية",0,2150,0,1800,220,80,metal);
      }else if(item.id==="mall-pop"){
        frame(1000,650,1900,35);for(let y of [450,900,1350])shelf("رف عرض متنقل",y,950,600,25,color);
        [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(p=>add("عجلة قاعدة",p[0]*460,35,p[1]*280,100,80,100,rubber,"cylinder"));
        add("يافطة علوية",0,1800,0,1000,180,35,color);
      }else{
        frame(1100,520,900,35);shelf("سطح علوي");shelf("رف سفلي",250);
      }
    }else if(item.cat==="metal"){
      if(item.id==="metal-stair"){
        for(let i=0;i<10;i++){const y=i*175,x=i*260;add("درجة سلم "+(i+1),x,y,0,300,35,950,metal);}
        add("كمرة جانبية يمين",1150,700,0,2700,55,55,dark,"box",0,0,-33);add("كمرة جانبية يسار",1150,700,900,2700,55,55,dark,"box",0,0,-33);
        add("درابزين أيمن",1150,1150,0,2700,35,35,color);add("درابزين أيسر",1150,1150,900,2700,35,35,color);
      }else if(item.id==="metal-canopy"){
        frame(3000,1800,2600,90);for(let x of [-1400,1400])add("عمود مظلة",x,0,0,90,2600,90,dark);
        add("هيكل السقف",0,2650,0,3200,90,2000,metal);for(let z=-850;z<=850;z+=250)add("عارضة سقف",0,2580,z,3100,45,45,color);
      }else if(item.id==="metal-rack"){
        frame(1800,900,2400,70);for(let y of [450,950,1450,1950])shelf("رف تخزين أحمال",y,1700,820,55,metal);
        for(let x of [-820,820])for(let z of [-390,390])add("لوح قاعدة تثبيت",x,25,z,150,25,150,dark);
      }else if(item.id==="metal-cart"){
        frame(1000,650,950,35);for(let y of [220,520,820])shelf("صينية عربة نقل",y,950,600,30,metal);
        [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(p=>add("عجلة نقل",p[0]*450,45,p[1]*280,110,90,110,rubber,"cylinder"));
        add("مقبض دفع",0,1000,-280,600,30,30,metal);
      }
    }else if(item.cat==="decor"){
      if(item.id==="decor-screen"){
        add("إطار محيط",0,900,0,1200,1800,45,dark);add("لوح زخرفة ليزر",0,900,28,1120,1720,8,metal);
        for(let x of [-500,-250,0,250,500])add("قطاع زخرفي رأسي",x,900,50,12,1650,12,color);
        add("قاعدة تثبيت",0,35,0,1350,70,180,color);
      }else if(item.id==="decor-light"){
        frame(1000,300,500,35);add("إطار اللافتة",0,900,0,1800,650,45,metal);add("لوح الواجهة",0,900,28,1700,550,12,glass);
        add("حامل علوي",0,1250,0,1900,45,45,dark);add("علبة كهرباء",0,520,-100,350,180,200,dark);
      }else if(item.id==="decor-planter"){
        add("قاعدة الحوض",0,25,0,1000,50,500,metal);add("واجهة أمامية",0,300,240,1000,550,25,color);add("واجهة خلفية",0,300,-240,1000,550,25,color);
        add("جانب أيمن",488,300,0,25,550,500,color);add("جانب أيسر",-488,300,0,25,550,500,color);add("بطانة داخلية",0,310,0,930,480,430,dark);
      }
    }else if(item.id==="toycar-track"){
      add("قاعدة المضمار",0,35,0,1400,70,900,color);add("مسار مستقيم",0,80,0,1300,35,650,dark);
      add("حاجز جانبي أيمن",0,130,330,1300,100,35,light);add("حاجز جانبي أيسر",0,130,-330,1300,100,35,light);
      add("منحدر بداية",500,170,0,380,220,650,color,"box",0,0,-18);
    }else if(item.cat==="toyprops"){
      if(item.id==="toyprops-robot"){
        add("جذع الروبوت",0,430,0,190,260,130,color);add("رأس الروبوت",0,610,0,150,145,135,metal);
        for(let side of [-1,1]){add("ذراع",side*145,430,0,70,230,75,color);add("كف",side*145,300,0,90,80,90,metal);add("ساق",side*55,160,0,80,230,90,dark);add("قدم",side*55,35,45,125,55,180,metal);}
        add("لوحة صدر",0,460,72,110,90,12,glass);add("هوائي",0,700,0,18,90,18,metal);
      }else if(item.id==="toyprops-foam"){
        add("قاعدة مجموعة المجسمات",0,20,0,850,40,500,color);add("مجسم أداة أول",-250,140,0,150,220,120,"#e7b95c");add("مجسم مركبة",0,130,0,280,180,160,"#78a9c7");add("مجسم أداة ثان",270,140,0,150,220,120,"#86b78a");
      }else{
        add("جسم لعبة شكلي آمن",0,120,0,240,80,75,"#e9a4b2");add("مقبض لين",0,30,0,90,150,100,"#e9a4b2");add("قطعة زينة أمامية",130,130,0,35,45,45,light);
      }
    }else if(item.cat==="water"){
      add("جسم الخزان",0,120,0,300,170,140,"#6eaacb");
      add("مقبض علوي",0,235,0,180,35,110,color);
      add("مجرى مياه أمامي",185,145,0,180,45,45,metal);
      add("فوهة رش منخفضة الضغط",285,145,0,70,24,24,light);
      if(item.id!=="water-pistol-manual"){add("غطاء خزان",0,220,-65,95,28,95,dark);add("وحدة مضخة مغلقة",0,80,-45,125,80,85,dark);}
      if(item.id==="water-blaster-electric"){add("حجرة بطارية معزولة",0,55,65,150,70,90,dark);add("زر تشغيل",75,220,35,35,22,35,light);}
      if(item.id==="water-toy-squirters"){add("شكل لعبة أول",-220,80,0,140,130,130,"#7db7cf");add("شكل لعبة ثان",220,80,0,140,130,130,"#e9b76a");}
      if(item.id==="water-play-set"){add("قاعدة مجموعة اللعب",0,20,0,1000,40,700,color);for(let x of [-350,0,350])add("برج رش مياه",x,220,0,70,380,70,"#6eaacb");}
    }else{
      add("القاعدة الرئيسية",0,0,0,900,90,450,color);
      add("الجسم الرئيسي",0,90,0,900,720,450,color);
      add("لوح علوي",0,810,0,940,24,490,metal);
    }
    modelObjects=objects;
    selectedModelObjectId=objects[0]?.id||null;
    modelProjectName=item.name;
    window.activeModelProjectId=null;
    $("modelName").value=modelProjectName;
    $("modelCameraAngle").value=35;modelCameraAngle=35;
    const modelTab=document.querySelector('.main-tab[data-view="modelView"]');if(modelTab)modelTab.click();
    renderModelDrawing();renderModelObjectEditor();
    toast("فتحنا "+item.name+" كمكونات ثلاثية الأبعاد قابلة للتعديل");
  }

  document.querySelectorAll("[data-material-3d]").forEach(button=>{
    button.addEventListener("click",()=>openMaterialSampleInModel(button.dataset.material3d));
  });

  function renderFabricationCatalog(){
    renderCatalogCategoryLaunchers();
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
      card.append(top,title,size,material,detail);
      const actions=document.createElement("div");actions.className="catalog-card-actions";
      actions.style.display="flex";actions.style.flexWrap="wrap";actions.style.gap="8px";actions.style.marginTop="12px";
      const modelButton=document.createElement("button");modelButton.type="button";modelButton.className="button button-primary";modelButton.textContent="نقل المنتج إلى الرسم 3D";
      modelButton.setAttribute("aria-label","إضافة "+item.name+" إلى مرسم الرسم ثلاثي الأبعاد");
      modelButton.addEventListener("click",()=>openCatalogItemInModel(item));
      const button=document.createElement("button");button.type="button";button.className="button button-quiet";button.textContent="إضافة إلى مشروعات نسيج";
      button.addEventListener("click",()=>{
        const node={id:uid(),title:item.name,type:"project",description:"القسم: "+catalogLabels[item.cat]+"\nالمقاسات المرجعية: "+item.size+"\nالخامات: "+item.material+"\nتفاصيل: "+item.detail+"\n\nملاحظة: المقاسات مبدئية وتحتاج مراجعة حسب الموقع والاستخدام."};
        data.nodes.push(node);selectedId=node.id;activeGroupFilter="all";save();render();toast("اتضافت بطاقة الشغل لخريطة نسيج");
      });
      actions.append(modelButton,button);card.append(actions);host.append(card);
    });
  }

  let latestCutRows = [];
  function renderManufacturingSheet(){
    const v=standValues(), w=v.width*10, h=v.height*10, d=v.depth*10, tube=30, clearW=Math.max(0,w-2*tube), clearD=Math.max(0,d-2*tube);
    const baseDim=getPartDimensions("base",v), frameDim=getPartDimensions("top-frame",v), railDim=getPartDimensions("hanger-rail",v);
    const rows=[];
    ["post-front-left","post-front-right","post-rear-left","post-rear-right"].forEach((id,i)=>{
      const dim=getPartDimensions(id,v);
      rows.push({name:"القائم "+(i+1),qty:1,length:dim.length,material:"ماسورة "+dim.width+"×"+dim.depth+" مم"});
    });
    rows.push(
      {name:"عارضتان علويتان أمامية وخلفية",qty:2,length:frameDim.length,material:"قطاع الإطار — حسب المقطع المحدد"},
      {name:"عارضتان علويتان جانبيتان",qty:2,length:frameDim.width,material:"قطاع الإطار — حسب المقطع المحدد"},
      {name:"عارضة تعليق الملابس",qty:1,length:railDim.length,material:"قطاع "+railDim.width+"×"+railDim.depth+" مم"}
    );
    for(let i=0;i<v.shelves;i++){
      const dim=getPartDimensions("shelf-"+(i+1),v);
      rows.push({name:"إطار الرف "+(i+1)+" — ضلع طويل",qty:2,length:dim.length,material:"حسب مقطع الرف المحدد"},{name:"إطار الرف "+(i+1)+" — ضلع جانبي",qty:2,length:dim.width,material:"حسب مقطع الرف المحدد"});
    }
    latestCutRows=rows.map(r=>({...r,total:r.qty*r.length}));
    const tubeTotal=latestCutRows.reduce((sum,r)=>sum+r.total,0)/1000;
    const sheetArea=(baseDim.length*baseDim.width+Array.from({length:v.shelves},(_,i)=>{const dim=getPartDimensions("shelf-"+(i+1),v);return dim.length*dim.width;}).reduce((sum,n)=>sum+n,0))/1000000;
    const waste=Math.max(0,Math.min(100,Number($("wastePercent")?.value)||0))/100;
    const tubePrice=Math.max(0,Number($("tubePrice")?.value)||0),sheetPrice=Math.max(0,Number($("sheetPrice")?.value)||0);
    const tubeCost=tubeTotal*(1+waste)*tubePrice, sheetCost=sheetArea*(1+waste)*sheetPrice;
    $("materialSummary").innerHTML='<div><strong>'+tubeTotal.toFixed(2)+' م</strong><span>إجمالي أطوال المواسير قبل الهالك</span></div><div><strong>'+sheetArea.toFixed(2)+' م²</strong><span>مساحة القاعدة والرفوف التقديرية</span></div><div><strong>'+Math.round(tubeCost+sheetCost).toLocaleString("ar-EG")+' ج</strong><span>تقدير خامات وفق الأسعار المدخلة</span></div>';
    $("cutListBody").innerHTML=latestCutRows.map(r=>'<tr><td>'+r.name+'</td><td>'+r.qty+'</td><td>'+r.length.toFixed(0)+' مم للقطعة</td><td>'+r.material+'</td></tr>').join('')+'<tr><td>قاعدة صاج</td><td>1</td><td>'+baseDim.length.toFixed(0)+' × '+baseDim.width.toFixed(0)+' × '+baseDim.thickness.toFixed(1)+' مم</td><td>صاج — مساحة '+(baseDim.length*baseDim.width/1000000).toFixed(2)+' م²</td></tr>'+Array.from({length:v.shelves},(_,i)=>{const dim=getPartDimensions("shelf-"+(i+1),v);return '<tr><td>لوح الرف '+(i+1)+'</td><td>1</td><td>'+dim.length.toFixed(0)+' × '+dim.width.toFixed(0)+' × '+dim.thickness.toFixed(1)+' مم</td><td>خشب أو صاج — حسب الاختيار</td></tr>';}).join('');
    const jointRows=standPartDefinitions(v).map(part=>{const spec=partSpecs[part.id]||{},joint=spec.joint||{type:"bolt",quantity:2,diameter:6,length:20,position:"عند طرفي القطعة"};const types={bolt:"مسمار وصامولة",screw:"برغي",insert:"جلبة ملولبة",slot:"تعشيق",plate:"صفيحة تثبيت",weld:"لحام ثابت"};return {name:spec.name||part.name,type:types[joint.type]||joint.type,quantity:joint.quantity??2,diameter:joint.diameter??6,length:joint.length??20,position:joint.position||""};});
    const jointBody=$("jointListBody");
    if(jointBody)jointBody.innerHTML=jointRows.map(j=>'<tr><td>'+j.name+'</td><td>'+j.type+'</td><td>'+j.quantity+'</td><td>'+j.diameter+' مم</td><td>'+j.length+' مم</td><td>'+j.position+'</td></tr>').join('');
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
    const csv="\uFEFF"+rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="naseej-cut-list.csv";a.click();URL.revokeObjectURL(url);toast("تم تصدير جدول القص");
  }


  // Standalone 3D sketch workspace: parametric primitives in an isometric SVG view.
  let modelObjects = [];
  let selectedModelObjectId = null;
  let modelCameraAngle = 35;
  let modelZoom = 1;
  let modelExplodedView = false;
  let modelExplodeMoveMode = false;
  let modelExplodeOffsets = {};
  let modelAssemblyGuideOn = false;
  let modelAssemblyStep = 0;
  let modelProjectName = "تصميم جديد";
  let modelUndoStack = [];
  let modelRedoStack = [];
  const MODEL_HISTORY_LIMIT = 80;
  function modelHistoryState() {
    return JSON.stringify({objects:modelObjects,selectedId:selectedModelObjectId,explodeOffsets:modelExplodeOffsets,explodedView:modelExplodedView});
  }
  function modelHistoryPush() {
    const state=modelHistoryState();
    if(modelUndoStack[modelUndoStack.length-1]===state)return;
    modelUndoStack.push(state);
    if(modelUndoStack.length>MODEL_HISTORY_LIMIT)modelUndoStack.shift();
    modelRedoStack=[];
    updateModelHistoryButtons();
  }
  function updateModelHistoryButtons() {
    const undo=$("modelUndoBtn"),redo=$("modelRedoBtn");
    if(undo){undo.disabled=!modelUndoStack.length;undo.title=modelUndoStack.length?"تراجع عن آخر تعديل":"لا توجد خطوات للتراجع";}
    if(redo){redo.disabled=!modelRedoStack.length;redo.title=modelRedoStack.length?"إعادة آخر تعديل تم التراجع عنه":"لا توجد خطوات للإعادة";}
  }
  function restoreModelHistory(state) {
    const snapshot=JSON.parse(state);
    modelObjects=snapshot.objects||[];
    selectedModelObjectId=snapshot.selectedId||null;
    modelExplodeOffsets=snapshot.explodeOffsets||{};
    modelExplodedView=!!snapshot.explodedView;
    modelExplodeMoveMode=false;
    $("modelExplodeToggleBtn").textContent=modelExplodedView?"إرجاع التجميع":"عرض التفكيك";
    $("modelExplodeMoveBtn").disabled=!modelExplodedView;
    $("modelExplodeMoveBtn").textContent="تحريك القطع المفككة";
    renderModelDrawing();renderModelObjectEditor();save();
    updateModelHistoryButtons();
  }
  function undoModelAction() {
    if(!modelUndoStack.length)return;
    modelRedoStack.push(modelHistoryState());
    restoreModelHistory(modelUndoStack.pop());
    toast("تم التراجع عن آخر خطوة");
  }
  function redoModelAction() {
    if(!modelRedoStack.length)return;
    modelUndoStack.push(modelHistoryState());
    restoreModelHistory(modelRedoStack.pop());
    toast("تمت إعادة الخطوة");
  }
  function modelProjectSnapshot() {
    return {id:uid(),name:modelProjectName,objects:modelObjects.map(o=>({...o})),cameraAngle:modelCameraAngle,updatedAt:new Date().toISOString()};
  }
  function projectModelSave() {
    const name=$("modelName").value.trim()||"تصميم جديد";
    modelProjectName=name;
    const index=data.modelProjects.findIndex(p=>p.id===window.activeModelProjectId);
    if(index>=0) data.modelProjects[index]={...data.modelProjects[index],name,objects:modelObjects.map(o=>({...o})),cameraAngle:modelCameraAngle,updatedAt:new Date().toISOString()};
    else { const p=modelProjectSnapshot(); data.modelProjects.push(p); window.activeModelProjectId=p.id; }
    save(); renderModelProjectOptions(); toast("تم حفظ مشروع الرسم ثلاثي الأبعاد");
  }
  function renderModelProjectOptions() {
    const select=$("savedModelProjects"); if(!select)return;
    const current=select.value; select.innerHTML='<option value="">اختر مشروعًا محفوظًا</option>';
    data.modelProjects.forEach(p=>{const option=document.createElement("option");option.value=p.id;option.textContent=p.name;select.appendChild(option);});
    if(data.modelProjects.some(p=>p.id===current))select.value=current;
  }
  function modelProjectLoad() {
    const p=data.modelProjects.find(item=>item.id===$("savedModelProjects").value);
    if(!p){toast("اختار مشروع محفوظ الأول");return;}
    modelHistoryPush();modelObjects=Array.isArray(p.objects)?p.objects.map(o=>({...o})):[];modelProjectName=p.name||"تصميم جديد";modelCameraAngle=Number(p.cameraAngle)||35;window.activeModelProjectId=p.id;
    $("modelName").value=modelProjectName;$("modelCameraAngle").value=modelCameraAngle;selectedModelObjectId=null;renderModelDrawing();toast("تم فتح مشروع الرسم");
  }
  function modelProjectAddObject() {
    const type=$("modelPrimitive").value;
    const labels={box:"كتلة",plate:"لوح",beam:"عارضة",cylinder:"أسطوانة"};
    const object={id:uid(),type,label:labels[type]||"جسم جديد",x:0,y:0,z:0,w:type==="plate"?600:300,h:type==="plate"?20:300,d:type==="plate"?400:300,color:"#c49a55",rx:0,ry:0,rz:0};
    modelHistoryPush();modelObjects.push(object);selectedModelObjectId=object.id;renderModelDrawing();renderModelObjectEditor();toast("أضفنا جسم جديد للرسم");
  }
  const standModelLibrary = [
    {id:"single-rail",name:"استاند ملابس مفرد",category:"ملابس",description:"قاعدة وأربع قوائم علوية مع ماسورة تعليق",parts:[
      ["قاعدة سفلية",600,35,420,0,0,0,"صاج قاعدة","حديد",2],
      ["قائم يمين",30,1450,30,285,35,195,"ماسورة مربعة 3×3","حديد",1],
      ["قائم يسار",30,1450,30,-285,35,195,"ماسورة مربعة 3×3","حديد",1],
      ["عارضة تعليق",570,30,30,0,1435,195,"ماسورة تعليق","حديد",1]
    ]},
    {id:"double-rail",name:"استاند ملابس مزدوج",category:"ملابس",description:"صفا تعليق متوازيان مع قاعدة وأعمدة",parts:[
      ["قاعدة",850,35,520,0,0,0,"صاج قاعدة","حديد",2],
      ["قائم أمامي يمين",30,1450,30,400,35,-225,"ماسورة مربعة 3×3","حديد",1],
      ["قائم أمامي يسار",30,1450,30,-400,35,-225,"ماسورة مربعة 3×3","حديد",1],
      ["قائم خلفي يمين",30,1450,30,400,35,225,"ماسورة مربعة 3×3","حديد",1],
      ["قائم خلفي يسار",30,1450,30,-400,35,225,"ماسورة مربعة 3×3","حديد",1],
      ["عارضة أمامية",800,30,30,0,1435,-225,"ماسورة تعليق","حديد",1],
      ["عارضة خلفية",800,30,30,0,1435,225,"ماسورة تعليق","حديد",1]
    ]},
    {id:"four-way",name:"استاند أربع اتجاهات",category:"ملابس",description:"عمود مركزي وأربع أذرع عرض",parts:[
      ["قاعدة",420,35,420,0,0,0,"صاج قاعدة","حديد",1],
      ["عمود مركزي",40,1500,40,0,35,0,"ماسورة مربعة 4×4","حديد",1],
      ["ذراع أمامي",650,25,25,0,1450,-320,"ماسورة تعليق","حديد",1],
      ["ذراع خلفي",650,25,25,0,1450,320,"ماسورة تعليق","حديد",1],
      ["ذراع يمين",25,25,650,320,1450,0,"ماسورة تعليق","حديد",1],
      ["ذراع يسار",25,25,650,-320,1450,0,"ماسورة تعليق","حديد",1]
    ]},
    {id:"wall-rack",name:"استاند جداري",category:"ملابس",description:"لوح خلفي وحاملان وذراع تعليق",parts:[
      ["لوح خلفي",900,1200,35,0,600,0,"لوح تثبيت","حديد",1],
      ["حامل جانبي يمين",35,500,35,380,350,35,"قطاع مربع","حديد",1],
      ["حامل جانبي يسار",35,500,35,-380,350,35,"قطاع مربع","حديد",1],
      ["ماسورة تعليق",780,30,30,0,850,260,"ماسورة تعليق","حديد",1]
    ]},
    {id:"nesting-table",name:"طقم طاولات عرض متداخلة",category:"عرض",description:"ثلاث طاولات عرض بأحجام مختلفة",parts:[
      ["سطح الطاولة الكبيرة",900,35,600,0,900,0,"خشب أو صاج","خشب",1],
      ["قاعدة الطاولة الكبيرة",35,900,35,-400,0,-250,"قطاع مربع","حديد",1],
      ["قاعدة الطاولة الكبيرة",35,900,35,400,0,-250,"قطاع مربع","حديد",1],
      ["سطح الطاولة المتوسطة",700,35,500,0,650,0,"خشب أو صاج","خشب",1],
      ["قاعدة الطاولة المتوسطة",30,650,30,-300,0,-200,"قطاع مربع","حديد",1],
      ["قاعدة الطاولة المتوسطة",30,650,30,300,0,-200,"قطاع مربع","حديد",1],
      ["سطح الطاولة الصغيرة",500,35,400,0,400,0,"خشب أو صاج","خشب",1],
      ["قاعدة الطاولة الصغيرة",25,400,25,-220,0,-150,"قطاع مربع","حديد",1],
      ["قاعدة الطاولة الصغيرة",25,400,25,220,0,-150,"قطاع مربع","حديد",1]
    ]},
    {id:"shoe-rack",name:"استاند أحذية متعدد الأرفف",category:"أحذية",description:"قائمان جانبيان وأربعة أرفف",parts:[
      ["قائم يمين",30,1200,30,360,0,0,"ماسورة مربعة","حديد",1],
      ["قائم يسار",30,1200,30,-360,0,0,"ماسورة مربعة","حديد",1],
      ["رف سفلي",720,25,300,0,100,0,"صاج مثني","حديد",1],
      ["رف ثاني",720,25,300,0,400,0,"صاج مثني","حديد",1],
      ["رف ثالث",720,25,300,0,700,0,"صاج مثني","حديد",1],
      ["رف علوي",720,25,300,0,1000,0,"صاج مثني","حديد",1]
    ]},
    {id:"gondola",name:"وحدة عرض سوبر ماركت مزدوجة",category:"سوبر ماركت",description:"عمودان مركزيان وأرفف على الجانبين",parts:[
      ["عمود خلفي يمين",45,1800,45,420,0,0,"قائم مثقب","حديد",1],
      ["عمود خلفي يسار",45,1800,45,-420,0,0,"قائم مثقب","حديد",1],
      ["رف أمامي سفلي",800,35,420,0,180,-240,"رف صاج","حديد",1],
      ["رف أمامي أوسط",800,35,420,0,650,-240,"رف صاج","حديد",1],
      ["رف أمامي علوي",800,35,420,0,1120,-240,"رف صاج","حديد",1],
      ["رف خلفي سفلي",800,35,420,0,180,240,"رف صاج","حديد",1],
      ["رف خلفي أوسط",800,35,420,0,650,240,"رف صاج","حديد",1],
      ["رف خلفي علوي",800,35,420,0,1120,240,"رف صاج","حديد",1]
    ]},
    {id:"counter-display",name:"استاند عرض كاونتر متعدد الطبقات",category:"عرض",description:"قاعدة وثلاث طبقات عرض صغيرة",parts:[
      ["قاعدة",450,30,300,0,0,0,"صاج أو خشب","خشب",1],
      ["لوح خلفي",450,500,25,0,250,-130,"لوح خلفي","خشب",1],
      ["رف سفلي",420,25,180,0,100,-30,"رف عرض","خشب",1],
      ["رف أوسط",420,25,150,0,250,-55,"رف عرض","خشب",1],
      ["رف علوي",420,25,120,0,400,-80,"رف عرض","خشب",1]
    ]}

    ,{id:"bag-display",name:"استاند شنط متعدد الأذرع",category:"شنط",description:"قاعدة وعمود مركزي وأذرع تعليق للشنط",parts:[
      ["قاعدة ثقيلة",500,45,500,0,0,0,"صاج قاعدة","حديد",1],["عمود مركزي",40,1500,40,0,45,0,"ماسورة 4×4","حديد",1],
      ["ذراع تعليق علوي",650,30,30,0,1350,0,"ماسورة مستديرة","حديد",1],["ذراع جانبي يمين",30,30,450,260,1050,0,"ماسورة","حديد",1],["ذراع جانبي يسار",30,30,450,-260,1050,0,"ماسورة","حديد",1]
    ]},
    {id:"accessory-grid",name:"لوحة إكسسوارات بخطافات",category:"إكسسوارات",description:"لوحة مثقبة مع إطار وخطافات عرض",parts:[
      ["لوحة خلفية مثقبة",800,1100,20,0,550,0,"صاج مثقب","حديد",1],["قائم يمين",30,1150,30,415,0,0,"ماسورة مربعة","حديد",1],["قائم يسار",30,1150,30,-415,0,0,"ماسورة مربعة","حديد",1],["قاعدة",850,35,350,0,0,0,"صاج","حديد",1],
      ["خطاف عرض 1",180,12,12,-240,800,30,"سيخ دائري","حديد",1],["خطاف عرض 2",180,12,12,0,800,30,"سيخ دائري","حديد",1],["خطاف عرض 3",180,12,12,240,800,30,"سيخ دائري","حديد",1]
    ]},
    {id:"jewelry-display",name:"استاند مجوهرات وقلائد",category:"مجوهرات",description:"قاعدة وعمودان وحوامل عرض متدرجة",parts:[
      ["قاعدة",420,30,260,0,0,0,"قاعدة خشب","خشب",1],["عمود خلفي",25,500,25,0,30,-80,"قائم معدني","حديد",1],["عارضة تعليق",380,20,20,0,480,-80,"قضيب تعليق","حديد",1],["حامل حلقان",300,180,15,0,180,80,"لوح مثقب","أكريليك",1],["رف خواتم",350,25,100,0,80,40,"رف مبطن","خشب",1]
    ]},
    {id:"eyewear-display",name:"استاند نظارات متعدد المستويات",category:"نظارات",description:"قاعدة رأسية مع حوامل أفقية للنظارات",parts:[
      ["قاعدة",350,30,250,0,0,0,"قاعدة","خشب",1],["لوح خلفي",25,650,220,0,325,-80,"لوح حامل","أكريليك",1],["حامل نظارات سفلي",300,18,45,0,160,60,"حامل مبطن","أكريليك",1],["حامل نظارات أوسط",300,18,45,0,330,60,"حامل مبطن","أكريليك",1],["حامل نظارات علوي",300,18,45,0,500,60,"حامل مبطن","أكريليك",1]
    ]},
    {id:"cosmetics-display",name:"استاند مستحضرات تجميل",category:"تجميل",description:"وحدة عرض متدرجة بقاعدة ورفوف أمامية",parts:[
      ["قاعدة",600,35,350,0,0,0,"قاعدة","أكريليك",1],["ظهر الوحدة",600,700,25,0,350,-150,"لوح خلفي","أكريليك",1],["رف سفلي",560,25,130,0,120,-30,"رف شفاف","أكريليك",1],["رف أوسط",560,25,110,0,300,-60,"رف شفاف","أكريليك",1],["رف علوي",560,25,90,0,480,-90,"رف شفاف","أكريليك",1]
    ]},
    {id:"book-rack",name:"استاند كتب متعدد الأرفف",category:"كتب",description:"وحدة أرضية بأرفف مائلة وحاجز أمامي",parts:[
      ["قائم يمين",35,1400,35,380,0,0,"ماسورة مربعة","حديد",1],["قائم يسار",35,1400,35,-380,0,0,"ماسورة مربعة","حديد",1],["رف سفلي",760,30,280,0,180,0,"صاج مثني أو خشب","خشب",1],["رف أوسط",760,30,280,0,550,0,"صاج مثني أو خشب","خشب",1],["رف علوي",760,30,280,0,920,0,"صاج مثني أو خشب","خشب",1]
    ]},
    {id:"magazine-rack",name:"استاند مجلات جيوب أمامية",category:"مجلات",description:"لوح خلفي وجيوب عرض مائلة",parts:[
      ["لوح خلفي",650,1200,25,0,600,0,"لوح","خشب",1],["قائم يمين",25,1250,25,310,0,0,"قطاع","حديد",1],["قائم يسار",25,1250,25,-310,0,0,"قطاع","حديد",1],["جيب سفلي",600,180,90,0,150,70,"جيب صاج أو أكريليك","أكريليك",1],["جيب أوسط",600,180,90,0,420,70,"جيب صاج أو أكريليك","أكريليك",1],["جيب علوي",600,180,90,0,690,70,"جيب صاج أو أكريليك","أكريليك",1]
    ]},
    {id:"promo-sign",name:"استاند دعاية وبوستر",category:"دعاية",description:"قاعدة ثابتة وحامل لوحة إعلانية",parts:[
      ["قاعدة عريضة",450,35,350,0,0,0,"صاج قاعدة","حديد",1],["عمود حامل",30,1500,30,0,35,0,"ماسورة مربعة","حديد",1],["إطار اللوحة",600,850,25,0,1100,0,"إطار ألمنيوم","ألومنيوم",1],["لوح الإعلان",560,810,8,0,1100,18,"لوح طباعة","بلاستيك",1]
    ]},
    {id:"cafe-menu",name:"استاند منيو كافيه",category:"كافيهات",description:"حامل منيو مائل فوق قاعدة طاولة",parts:[
      ["قاعدة",300,25,240,0,0,0,"قاعدة","حديد",1],["عمود",25,420,25,0,25,0,"قضيب","حديد",1],["حامل المنيو",260,320,18,0,350,-35,"إطار منيو","خشب",1],["حاجز سفلي",260,18,25,0,210,0,"حاجز تثبيت","خشب",1]
    ]},
    {id:"restaurant-tray",name:"استاند صواني ومستلزمات مطعم",category:"مطاعم",description:"عربة صغيرة بأرفف وحواجز جانبية",parts:[
      ["قاعدة سفلية",650,35,450,0,0,0,"إطار","ستانلس ستيل",1],["قائم يمين",30,900,30,300,35,200,"ماسورة","ستانلس ستيل",1],["قائم يسار",30,900,30,-300,35,200,"ماسورة","ستانلس ستيل",1],["رف سفلي",600,25,400,0,180,0,"صاج","ستانلس ستيل",1],["رف علوي",600,25,400,0,620,0,"صاج","ستانلس ستيل",1],["مقبض دفع",500,25,25,0,850,200,"ماسورة","ستانلس ستيل",1]
    ]}

    ,{id:"rc-trainer-plane",name:"طائرة تدريب ريموت بجناح علوي",category:"طائرات لاسلكية",description:"طائرة تدريب بأجزاء إلكترونية منفصلة",parts:[
      ["جسم الطائرة",1050,95,105,0,0,0,"جسم فوم مقوى","فوم هندسي",1,"هيكل مركزي؛ يراجع مركز الثقل"],
      ["الجناح الأيسر",1150,28,190,-560,40,0,"جناح فوم مع عصب","فوم هندسي",1,"جناح حامل"],
      ["الجناح الأيمن",1150,28,190,560,40,0,"جناح فوم مع عصب","فوم هندسي",1,"جناح حامل مطابق"],
      ["ذيل أفقي",360,20,115,0,0,470,"مصعد","فوم هندسي",1,"سطح تحكم بمفصلة وسيرفو"],
      ["ذيل رأسي",25,230,125,0,0,465,"دفة اتجاه","فوم هندسي",1,"سطح توجيه"],
      ["محرك Brushless",55,55,55,0,0,-545,"محرك كهربائي","معدن",1,"تحدد KV والقدرة بعد حساب الوزن والمروحة"],
      ["مروحة أمامية",230,12,28,0,0,-605,"مروحة ثنائية الريشة","بلاستيك مقوى",1,"اختيار القطر والخطوة بتوافق المحرك"],
      ["منظم سرعة ESC",65,22,35,0,-25,-280,"Electronic Speed Controller","إلكترونيات",1,"تيار مناسب للمحرك والبطارية"],
      ["مستقبل ريموت",42,16,28,0,50,-80,"Receiver 2.4GHz","إلكترونيات",1,"بروتوكول وقنوات متوافقة"],
      ["بطارية",115,35,38,0,-5,160,"LiPo Pack","إلكترونيات",1,"الخلايا والسعة والتفريغ حسب الحساب"],
      ["سيرفو جناح",38,22,38,-360,15,10,"Servo","إلكترونيات",2,"سيرفو لكل جنيح"],
      ["سيرفو ذيل",38,22,38,0,15,350,"Servo","إلكترونيات",2,"للمصعد والدفة"]
    ]}
    ,{id:"rc-glider",name:"طائرة شراعية ريموت",category:"طائرات لاسلكية",description:"جناح طويل وجسم خفيف وتحكم كهربائي",parts:[
      ["جسم الطائرة",1250,75,80,0,0,0,"جسم خفيف","فوم هندسي",1,"هيكل مع تدعيم داخلي"],
      ["جناح أيسر طويل",1450,20,155,-710,20,0,"جناح طويل","فوم هندسي",1,"مقطع هوائي يحتاج مراجعة"],
      ["جناح أيمن طويل",1450,20,155,710,20,0,"جناح طويل","فوم هندسي",1,"مطابقة الجناح الأيسر"],
      ["ذيل أفقي",330,18,90,0,0,560,"مصعد","فوم هندسي",1,"سطح تحكم"],
      ["محرك مساعد",45,45,45,0,0,-610,"Brushless","معدن",1,"اختيار حسب وزن الطائرة"],
      ["مروحة قابلة للطي",180,10,20,0,0,-660,"مروحة","بلاستيك مقوى",1,"تحتاج محورًا متوافقًا"],
      ["ESC",55,18,30,0,-20,-300,"منظم سرعة","إلكترونيات",1,"مطابقة التيار"],
      ["مستقبل ريموت",38,14,25,0,40,-100,"Receiver 2.4GHz","إلكترونيات",1,"مطابقة جهاز الإرسال"],
      ["بطارية",95,28,32,0,-5,180,"LiPo","إلكترونيات",1,"تحديد مركز الثقل"],
      ["سيرفو تحكم",32,18,30,-80,10,400,"Servo","إلكترونيات",2,"لأسطح التحكم"]
    ]}
    ,{id:"rc-flying-wing",name:"طائرة جناح طائر ريموت",category:"طائرات لاسلكية",description:"جناح مدمج ومحرك خلفي وسيرفوهات",parts:[
      ["الجناح الرئيسي",1250,35,430,0,0,0,"جناح دلتا","فوم هندسي",1,"مراجعة الشكل الهوائي وزاوية الميل"],
      ["دعامة مركزية",220,45,90,0,0,0,"دعامة","فوم مقوى",1,"تقوية مركز الجناح"],
      ["محرك خلفي",55,55,55,0,0,245,"Brushless","معدن",1,"تثبيت ودفع خلفي"],
      ["مروحة دافعة",190,12,24,0,0,300,"مروحة","بلاستيك مقوى",1,"توافق المحرك والمروحة"],
      ["ESC",60,20,32,0,-15,110,"منظم سرعة","إلكترونيات",1,"مطابقة التيار"],
      ["مستقبل",40,15,28,0,35,-70,"Receiver 2.4GHz","إلكترونيات",1,"قنوات تحكم"],
      ["بطارية",115,32,38,0,-5,-120,"LiPo","إلكترونيات",1,"موضع ضبط مركز الثقل"],
      ["سيرفو elevon",35,20,35,-250,10,30,"Servo","إلكترونيات",2,"تحريك سطحي التحكم"],
      ["قضيب دفع",180,6,6,0,15,85,"وصلة تحكم","معدن",2,"يربط السيرفو بسطح التحكم"]
    ]}
    ,{id:"rc-quadcopter",name:"درون رباعي المراوح بمستشعرات",category:"طائرات لاسلكية",description:"إطار وأربع وحدات دفع ومتحكم ومستشعرات",parts:[
      ["لوح إطار علوي",180,5,180,0,0,0,"لوح إطار","فايبر كربون",1,"تثبيت الإلكترونيات"],
      ["لوح إطار سفلي",180,5,180,0,-35,0,"لوح إطار","فايبر كربون",1,"حامل البطارية"],
      ["ذراع أمامي أيسر",260,22,22,-150,-15,-150,"ذراع","فايبر كربون",1,"تثبيت محرك"],
      ["ذراع أمامي أيمن",260,22,22,150,-15,-150,"ذراع","فايبر كربون",1,"تثبيت محرك"],
      ["ذراع خلفي أيسر",260,22,22,-150,-15,150,"ذراع","فايبر كربون",1,"تثبيت محرك"],
      ["ذراع خلفي أيمن",260,22,22,150,-15,150,"ذراع","فايبر كربون",1,"تثبيت محرك"],
      ["محرك Brushless",45,38,45,-150,18,-150,"محرك","معدن",4,"أربع وحدات؛ اختيارها مع المراوح والوزن"],
      ["مراوح",125,5,18,-150,45,-150,"مروحة CW/CCW","بلاستيك مقوى",4,"مقاس واتجاه دوران متوافقان"],
      ["متحكم طيران F4",36,12,36,0,18,0,"Flight Controller + IMU","إلكترونيات",1,"جيروسكوب ومقياس تسارع"],
      ["ESC رباعي 4 في 1",40,10,40,0,-2,0,"4-in-1 ESC","إلكترونيات",1,"توافق تيار المحركات وعدد الخلايا"],
      ["مستقبل ريموت",28,10,20,0,30,45,"Receiver 2.4GHz","إلكترونيات",1,"بروتوكول متوافق"],
      ["بطارية",90,28,38,0,-55,0,"LiPo","إلكترونيات",1,"سعة وخلايا وتفريغ حسب الوزن"],
      ["مستشعر ضغط وارتفاع",18,8,18,0,32,-35,"Barometer","إلكترونيات",1,"لقياس الارتفاع"],
      ["مستشعر تدفق بصري",22,8,22,0,-45,55,"Optical Flow","إلكترونيات",1,"يرى الأرض أسفل الدرون"],
      ["مستشعر مسافة سفلي",18,10,18,0,-48,82,"ToF Rangefinder","إلكترونيات",1,"قياس مسافة لأسفل"],
      ["جرس تنبيه",12,10,12,0,28,65,"Buzzer","إلكترونيات",1,"تنبيه صوتي"]
    ]}
    ,{id:"rc-helicopter",name:"هليكوبتر لاسلكية",category:"طائرات لاسلكية",description:"جسم ودوار رئيسي ودوار ذيل ووحدات تحكم",parts:[
      ["جسم الهليكوبتر",420,110,105,0,0,0,"هيكل مركزي","بلاستيك هندسي",1,"حامل الحركة والإلكترونيات"],
      ["عمود الدوار",18,250,18,0,100,0,"عمود دوران","معدن",1,"عمود ومحامل"],
      ["ريشة دوار أولى",520,12,35,-250,245,0,"ريشة","مركب خفيف",1,"توازن مجموعة الدوار"],
      ["ريشة دوار ثانية",520,12,35,250,245,0,"ريشة","مركب خفيف",1,"توازن مجموعة الدوار"],
      ["ذراع ذيل",520,35,35,0,35,300,"ذراع","ألومنيوم",1,"حامل دوار الذيل"],
      ["محرك رئيسي",55,55,55,0,-15,-15,"Brushless","معدن",1,"مطابقة مجموعة نقل الحركة"],
      ["محرك ذيل",28,28,28,0,45,555,"محرك صغير","معدن",1,"دفع دوار الذيل"],
      ["دوار ذيل",120,8,20,0,55,590,"ريش ذيل","بلاستيك مقوى",1,"اتزان الاتجاه"],
      ["متحكم وجيروسكوب",40,14,40,0,65,0,"Flight Controller + Gyro","إلكترونيات",1,"استقرار وتحكم"],
      ["مستقبل ريموت",30,12,25,0,95,30,"Receiver 2.4GHz","إلكترونيات",1,"قنوات متوافقة"],
      ["ESC",55,18,30,0,-55,-60,"منظم سرعة","إلكترونيات",1,"مطابقة المحرك"],
      ["بطارية",100,30,35,0,-70,50,"LiPo","إلكترونيات",1,"مركز الثقل والسعة"],
      ["سيرفو تحكم",32,20,32,-65,35,15,"Servo","إلكترونيات",3,"تحريك آلية التحكم"]
    ]}
    ,{id:"rc-offroad-car",name:"سيارة ريموت دفع رباعي",category:"سيارات ريموت",description:"شاسيه وعجلات وتعليق ومحرك وناقل حركة",parts:[
      ["شاسيه",430,28,250,0,0,0,"قاعدة شاسيه","بلاستيك مقوى / ألومنيوم",1,"نقاط تثبيت التعليق والإلكترونيات"],
      ["بودي خارجي",420,105,235,0,95,0,"غطاء سيارة","بلاستيك مرن",1,"غطاء قابل للفك"],
      ["عجلة أمامية يسار",95,45,95,-190,30,-105,"إطار وجنط","مطاط ومعدن",1,"مجموعة توجيه"],
      ["عجلة أمامية يمين",95,45,95,190,30,-105,"إطار وجنط","مطاط ومعدن",1,"مجموعة توجيه"],
      ["عجلة خلفية يسار",95,45,95,-190,30,105,"إطار وجنط","مطاط ومعدن",1,"مجموعة دفع"],
      ["عجلة خلفية يمين",95,45,95,190,30,105,"إطار وجنط","مطاط ومعدن",1,"مجموعة دفع"],
      ["محرك كهربائي",55,45,55,0,42,75,"Brushless / Brushed","معدن",1,"اختيار حسب ESC ونسبة التخفيض"],
      ["علبة تروس ودفرنس",115,55,75,0,35,105,"Gearbox Differential","معدن وبلاستيك",1,"نسبة التروس وأعمدة الحركة"],
      ["ESC سيارة",65,25,45,70,48,0,"Electronic Speed Controller","إلكترونيات",1,"تيار مناسب للمحرك والبطارية"],
      ["مستقبل ريموت",35,18,28,120,50,0,"Receiver 2.4GHz","إلكترونيات",1,"مرتبط بجهاز الإرسال"],
      ["سيرفو توجيه",42,25,42,-80,45,-65,"Steering Servo","إلكترونيات",1,"عزم مناسب لحجم العجلات"],
      ["بطارية",115,28,42,0,38,-30,"LiPo / NiMH","إلكترونيات",1,"جهد وموصل وتفريغ مناسب"],
      ["مقص تعليق",110,14,22,-140,12,-105,"ذراع تعليق","بلاستيك هندسي",4,"أذرع تعليق"],
      ["مساعد زنبركي",75,16,16,-145,35,-105,"Shock Absorber","معدن",4,"مشوار مناسب للشاسيه"]
    ]}
    ,{id:"rc-drift-car",name:"سيارة ريموت دريفت",category:"سيارات ريموت",description:"شاسيه منخفض وتوجيه واسع ومحرك كهربائي",parts:[
      ["شاسيه منخفض",440,22,210,0,0,0,"شاسيه مسطح","ألومنيوم",1,"قاعدة منخفضة"],
      ["بودي سيارة",430,95,205,0,90,0,"هيكل خارجي","بلاستيك",1,"غطاء قابل للفك"],
      ["عجلات دريفت",82,38,82,-180,22,-90,"إطارات دريفت","مطاط صلب",2,"محور أمامي"],
      ["عجلات دريفت خلفية",82,38,82,180,22,90,"إطارات دريفت","بلاستيك / مطاط",2,"محور خلفي"],
      ["محرك",50,42,50,0,35,65,"محرك كهربائي","معدن",1,"توافق KV وESC"],
      ["ناقل حركة",100,42,65,0,35,90,"تروس ودفرنس","معدن",1,"نسبة تخفيض"],
      ["ESC",60,22,40,65,40,0,"منظم سرعة","إلكترونيات",1,"مطابقة المحرك والبطارية"],
      ["مستقبل",32,15,25,115,45,0,"Receiver 2.4GHz","إلكترونيات",1,"قنوات متوافقة"],
      ["سيرفو توجيه",40,22,38,-75,42,-55,"Steering Servo","إلكترونيات",1,"زاوية توجيه كبيرة"],
      ["بطارية",100,25,38,0,32,-35,"LiPo","إلكترونيات",1,"تثبيت آمن"]
    ]}
    ,{id:"rc-crawler",name:"سيارة ريموت صخرية زاحفة",category:"سيارات ريموت",description:"شاسيه مرتفع ومحاور دفع وتعليق مرن",parts:[
      ["قضبان شاسيه",390,28,35,0,0,-65,"شاسيه سلم","معدن",2,"قضبان طولية"],
      ["محور أمامي",130,42,75,0,45,-145,"محور ودفرنس","معدن",1,"نقل حركة للعجلات"],
      ["محور خلفي",130,42,75,0,45,145,"محور ودفرنس","معدن",1,"نقل حركة للعجلات"],
      ["عجلات صخرية",125,55,125,-155,55,-145,"إطار عميق","مطاط",2,"محور أمامي"],
      ["عجلات صخرية خلفية",125,55,125,155,55,145,"إطار عميق","مطاط",2,"محور خلفي"],
      ["محرك عزم",48,48,48,0,70,80,"محرك بطيء عالي العزم","معدن",1,"سرعة منخفضة وعزم أعلى"],
      ["ESC زاحف",60,22,40,65,70,0,"منظم سرعة","إلكترونيات",1,"فرملة وتحكم بطيء"],
      ["مستقبل",32,15,25,115,70,0,"Receiver 2.4GHz","إلكترونيات",1,"متوافق مع المرسل"],
      ["سيرفو توجيه",48,28,45,-75,65,-95,"سيرفو عزم","إلكترونيات",1,"عزم يحدد حسب وزن السيارة"],
      ["بطارية",100,28,40,0,55,-25,"LiPo","إلكترونيات",1,"تثبيت منخفض"],
      ["مساعد تعليق",85,18,18,-100,70,-130,"مساعد زنبركي","معدن",4,"مشوار تعليق طويل"]
    ]}
    ,{id:"rc-robot-car",name:"عربة روبوت بحساسات",category:"ألعاب إلكترونية",description:"محركان وعجلات ومتحكم وحساسات مسافة وتتبع خط",parts:[
      ["قاعدة روبوت",190,5,150,0,0,0,"شاسيه أكريليك","أكريليك",1,"لوح تثبيت"],
      ["محرك تروس يسار",55,35,32,-65,25,0,"DC Gear Motor","معدن",1,"سرعة وعزم حسب الوزن"],
      ["محرك تروس يمين",55,35,32,65,25,0,"DC Gear Motor","معدن",1,"محرك مستقل"],
      ["عجلة يسار",65,28,65,-65,15,-15,"عجلة مطاط","مطاط",1,"توافق محور المحرك"],
      ["عجلة يمين",65,28,65,65,15,-15,"عجلة مطاط","مطاط",1,"توافق محور المحرك"],
      ["عجلة اتزان حرة",28,22,28,0,12,65,"Caster","بلاستيك",1,"عجلة حرة"],
      ["لوحة متحكم",55,12,40,0,22,0,"Arduino / ESP32","إلكترونيات",1,"اختيار حسب المداخل والبرنامج"],
      ["درايفر محركات",35,10,30,0,12,-35,"Motor Driver","إلكترونيات",1,"تيار مناسب لتيار توقف المحرك"],
      ["حساس مسافة",28,18,18,0,38,-70,"Ultrasonic / ToF","إلكترونيات",1,"كشف العوائق"],
      ["حساس تتبع خط",50,10,18,0,5,-65,"IR Sensor Array","إلكترونيات",1,"أسفل مقدمة العربة"],
      ["بطارية",75,22,38,0,18,35,"Battery Pack","إلكترونيات",1,"جهد مناسب للوحة والمحركات"],
      ["مفتاح تشغيل",18,12,12,65,22,45,"Power Switch","إلكترونيات",1,"فصل التغذية"]
    ]}
    ,{id:"toy-excavator",name:"حفار ألعاب بذراع متحرك",category:"ألعاب ميكانيكية",description:"قاعدة مجنزرة وكابينة وذراع بمفاصل ومحركات",parts:[
      ["قاعدة سفلية",230,45,150,0,20,0,"شاسيه","بلاستيك هندسي",1,"حامل الجنزير"],
      ["جنزير يمين",250,55,38,0,15,95,"مجموعة جنزير","مطاط وبلاستيك",1,"مسار حركة"],
      ["جنزير يسار",250,55,38,0,15,-95,"مجموعة جنزير","مطاط وبلاستيك",1,"مسار حركة"],
      ["منصة دوارة",160,28,130,0,70,0,"حلقة دوران","بلاستيك",1,"دوران الجزء العلوي"],
      ["كابينة",100,110,95,0,145,0,"هيكل كابينة","بلاستيك",1,"غطاء خارجي"],
      ["ذراع رئيسي",45,190,45,0,245,-70,"ذراع مفصلي","بلاستيك مقوى",1,"مفصل رئيسي"],
      ["ذراع ثانوي",38,150,38,0,330,-160,"ذراع مفصلي","بلاستيك مقوى",1,"مفصل ثانوي"],
      ["جرافة",100,55,80,0,385,-235,"دلو حفار","بلاستيك",1,"طرف العمل"],
      ["محرك حركة",45,35,35,0,25,55,"Gear Motor","معدن",2,"محرك لكل جانب"],
      ["سيرفو ذراع",38,25,35,0,220,-35,"Servo","إلكترونيات",2,"تحريك المفاصل"],
      ["مستقبل ريموت",30,14,25,0,110,25,"Receiver 2.4GHz","إلكترونيات",1,"قنوات مستقلة"],
      ["بطارية",75,25,38,0,95,45,"Battery Pack","إلكترونيات",1,"جهد مناسب للمحركات"]
    ]}
    ,{id:"toy-train",name:"قطار ألعاب بعربات منفصلة",category:"ألعاب ميكانيكية",description:"قاطرة وعربات وعجلات ومحاور ووصلات جر",parts:[
      ["جسم القاطرة",260,90,90,0,70,0,"هيكل","بلاستيك",1,"غلاف خارجي"],
      ["قاعدة القاطرة",250,25,85,0,25,0,"شاسيه","بلاستيك",1,"حامل المحرك والمحاور"],
      ["محرك تروس",45,35,35,0,35,25,"Gear Motor","معدن",1,"سرعة مناسبة"],
      ["عجلات القاطرة",45,20,45,-85,15,35,"عجلة","بلاستيك",4,"محاور متوازية"],
      ["عربة قطار",180,55,80,330,35,0,"جسم عربة","بلاستيك",2,"وحدات منفصلة"],
      ["محور عربة",110,15,15,330,12,0,"محور","معدن",4,"ربط العجلات"],
      ["عجلات العربات",35,18,35,285,12,25,"عجلة","بلاستيك",8,"تثبت على المحاور"],
      ["وصلة جر",35,12,12,165,35,0,"خطاف ربط","بلاستيك",2,"وصلة مفصلية"]
    ]}
  ];
  function addStandModelTemplate() {
    const select=$("standModelTemplate"),template=standModelLibrary.find(item=>item.id===select.value);
    if(!template){toast("اختار موديل من المكتبة الأول");return;}
    const size=$("standModelSize").value,scale=size==="compact"?.82:size==="large"?1.18:1;
    const finish=$("standModelFinish").value;
    const materialOverride=$("standModelMaterial").value;
    const finishColors={black:"#252a31",white:"#e8e8e4",chrome:"#aeb8c2",gold:"#c49a55",wood:"#9b7047",clear:"#a9d5df"};
    const baseX=modelObjects.length?Math.max(...modelObjects.map(o=>o.x+o.w/2))+1000:0;
    const added=template.parts.map(part=>{
      const [label,w,h,d,x,y,z,profile,material,quantity,componentSpec]=part;
      const chosenMaterial=materialOverride==="original"?material:materialOverride;
      return {id:uid(),type:/عجلة|إطار|محرك|عمود دوران/.test(label)?"cylinder":"box",label,w:Math.max(8,Math.round(w*scale)),h:Math.max(8,Math.round(h*scale)),d:Math.max(8,Math.round(d*scale)),x:baseX+x*scale,y:y*scale,z:z*scale,color:finishColors[finish]||"#c49a55",rx:0,ry:0,rz:0,material:chosenMaterial,profile,componentSpec:componentSpec||"",thickness:chosenMaterial==="خشب"?18:chosenMaterial==="أكريليك"?5:1.5,quantity,cutLength:Math.max(w,h,d)*scale,holeSpec:"غير محدد — يراجع حسب التصميم",weldSpec:"يحدد بعد مراجعة طريقة التصنيع",jointSpec:"وصلة مقترحة للمراجعة قبل التنفيذ",finish};
    });
    const addAccessory=(label,w,h,d,x,y,z,profile,material,color=finishColors[finish])=>added.push({id:uid(),type:"box",label,w,h,d,x:baseX+x*scale,y:y*scale,z:z*scale,color,rx:0,ry:0,rz:0,material:materialOverride==="original"?material:materialOverride,profile,thickness:2,quantity:1,cutLength:Math.max(w,h,d)*scale,holeSpec:"يحدد بعد اختيار نظام التثبيت",weldSpec:"حسب طريقة الربط المختارة",jointSpec:"ملحق اختياري — يلزم مراجعة موضعه",finish}); 
    if($("standAddWheels").checked){
      const w=Math.max(55,Math.round(75*scale));
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz],n)=>{const o={id:uid(),type:"cylinder",label:"عجلة دوارة "+(n+1),w,h:35,d:w,x:baseX+sx*260*scale,y:0,z:sz*180*scale,color:"#343a40",rx:90,ry:0,rz:0,material:"مطاط ومعدن",profile:"عجلة كاستر — مقاس مبدئي",thickness:0,quantity:1,cutLength:75*scale,holeSpec:"قطر محور التثبيت يحدد حسب العجلة الفعلية",weldSpec:"لا تلحم جسم العجلة",jointSpec:"تثبيت بقاعدة مسامير مناسبة"};added.push(o);});
    }
    if($("standAddHooks").checked){
      for(let n=0;n<4;n++)addAccessory("خطاف إضافي "+(n+1),150,12,12,-220+n*145,850,45,"سيخ دائري مثني","حديد");
    }
    if($("standAddHolder").checked)addAccessory("حامل أكريليك أمامي",260,160,8,0,300,150,"جيب/حامل شفاف","أكريليك","#a9d5df");
    modelHistoryPush();modelObjects.push(...added);
    modelProjectName=template.name+" — "+(size==="compact"?"صغير":size==="large"?"كبير":"قياسي");
    $("modelName").value=modelProjectName;selectedModelObjectId=added[0].id;
    modelAssemblyGuideOn=false;$("modelAssemblyGuide").hidden=true;
    renderModelDrawing();renderModelObjectEditor();renderModelProjectOptions();renderModelCutList();renderManufacturingDrawings();save();
    toast("تم إدخال "+template.name+" مع خيارات المقاس والخامة والتشطيب والملحقات");
  }
  function duplicateModelObject() {
    const source=modelObjects.find(o=>o.id===selectedModelObjectId);if(!source)return;
    const copy={...source,id:uid(),label:source.label+" - نسخة",x:source.x+Math.max(100,source.w/2),z:source.z+Math.max(100,source.d/2)};
    modelHistoryPush();modelObjects.push(copy);selectedModelObjectId=copy.id;renderModelDrawing();renderModelObjectEditor();save();toast("تم نسخ القطعة");
  }
  function modelProjectDeleteObject() {
    modelHistoryPush();modelObjects=modelObjects.filter(o=>o.id!==selectedModelObjectId);selectedModelObjectId=null;renderModelDrawing();renderModelObjectEditor();toast("تم حذف الجسم");
  }
  function renderModelObjectEditor() {
    const object=modelObjects.find(o=>o.id===selectedModelObjectId), editor=$("modelObjectEditor");
    editor.hidden=!object;
    if(!object)return;
    $("modelSelectedTitle").textContent=object.label;
    $("modelObjectLabel").value=object.label;
    $("modelDimX").value=object.w;$("modelDimY").value=object.h;$("modelDimZ").value=object.d;
    $("modelPosX").value=object.x;$("modelPosY").value=object.y;$("modelPosZ").value=object.z;
    $("modelRotX").value=object.rx||0;$("modelRotY").value=object.ry||0;$("modelRotZ").value=object.rz||0;
    $("modelObjectColor").value=object.color||"#c49a55";
    $("modelPartMaterial").value=object.material||"حديد";
    $("modelPartProfile").value=object.profile||"";
    $("modelPartThickness").value=object.thickness??"";
    $("modelPartQuantity").value=object.quantity||1;
    $("modelPartCutLength").value=object.cutLength??Math.round(Math.max(object.w,object.h,object.d));
    $("modelHoleSpec").value=object.holeSpec||"";$("modelMountSpec").value=object.mountSpec||"";$("modelWeldSpec").value=object.weldSpec||"";$("modelJointSpec").value=object.jointSpec||"";if($("modelComponentSpec"))$("modelComponentSpec").value=object.componentSpec||"";
  }
  function renderModelCutList() {
    const host=$("modelCutList");if(!host)return;
    if(!modelObjects.length){host.textContent="لا توجد قطع في التصميم.";return;}
    const safeText=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const rows=modelObjects.map(o=>{
      const length=Math.round(o.cutLength??Math.max(o.w,o.h,o.d));
      const quantity=Math.max(1,Number(o.quantity)||1);
      return "<tr><td>"+safeText(o.label)+"</td><td>"+safeText(o.material||"حديد")+"</td><td>"+safeText(o.profile||"غير محدد")+"</td><td>"+(Number(o.thickness)||0)+"</td><td>"+length+"</td><td>"+quantity+"</td><td>"+(length*quantity)+"</td></tr>";
    }).join("");
    host.innerHTML="<div class='table-wrap'><table><thead><tr><th>القطعة</th><th>الخامة</th><th>القطاع</th><th>السمك مم</th><th>طول القص مم</th><th>العدد</th><th>إجمالي الطول مم</th></tr></thead><tbody>"+rows+"</tbody></table></div>";
  }
  function renderManufacturingDrawings() {
    const root=$("manufacturingDrawing");if(!root)return;
    root.replaceChildren();
    const addText=(parent,x,y,value,size=14,anchor="middle",weight="400",fill="#e8edf5")=>{
      const t=svgEl("text",{x,y,fill,"font-size":size,"text-anchor":anchor,"font-weight":weight});t.textContent=value;parent.appendChild(t);
    };
    const line=(parent,x1,y1,x2,y2,stroke="#9bb1c8",width=1,dash="")=>parent.appendChild(svgEl("line",{x1,y1,x2,y2,stroke,"stroke-width":width,...(dash?{"stroke-dasharray":dash}:{})}));
    const title=svgEl("text",{x:24,y:28,fill:"#ffd166","font-size":"18","font-weight":"700"});title.textContent="المساقط الهندسية الثلاثة — الأبعاد بالمليمتر";root.appendChild(title);
    if(!modelObjects.length){addText(root,450,360,"أضف قطعًا إلى المجسم لعرض المساقط",18);return;}
    const bounds=modelObjects.map(o=>{
      const pts=[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]].map(c=>transformModelVertex([o.x+c[0]*o.w/2,o.y+c[1]*o.h,o.z+c[2]*o.d/2],o));
      return {o,min:[0,1,2].map(k=>Math.min(...pts.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...pts.map(p=>p[k])))};
    });
    const views=[
      {title:"المسقط الأمامي (X × Y)",x:25,y:55,w:410,h:285,horizontal:0,vertical:1},
      {title:"المسقط الجانبي (Z × Y)",x:465,y:55,w:410,h:285,horizontal:2,vertical:1},
      {title:"المسقط العلوي (X × Z)",x:25,y:385,w:410,h:285,horizontal:0,vertical:2}
    ];
    views.forEach(v=>{
      const g=svgEl("g");root.appendChild(g);
      g.appendChild(svgEl("rect",{x:v.x,y:v.y,width:v.w,height:v.h,rx:8,fill:"#101d2c",stroke:"#53677d","stroke-width":"1.2"}));
      addText(g,v.x+14,v.y+24,v.title,15,"start","700");
      const hmin=Math.min(...bounds.map(b=>b.min[v.horizontal])),hmax=Math.max(...bounds.map(b=>b.max[v.horizontal]));
      const vmin=Math.min(...bounds.map(b=>b.min[v.vertical])),vmax=Math.max(...bounds.map(b=>b.max[v.vertical]));
      const pad=48,scale=Math.min((v.w-pad*2)/Math.max(1,hmax-hmin),(v.h-pad*2-28)/Math.max(1,vmax-vmin));
      const ox=v.x+(v.w-(hmax-hmin)*scale)/2,oy=v.y+v.h-43-(v.h-75-(vmax-vmin)*scale)/2;
      const mapPoint=p=>[ox+(p[v.horizontal]-hmin)*scale,oy-(p[v.vertical]-vmin)*scale];
      bounds.forEach((b,i)=>{
        const x=ox+(b.min[v.horizontal]-hmin)*scale,y=oy-(b.max[v.vertical]-vmin)*scale;
        const w=Math.max(3,(b.max[v.horizontal]-b.min[v.horizontal])*scale),h=Math.max(3,(b.max[v.vertical]-b.min[v.vertical])*scale);
        g.appendChild(svgEl("rect",{x,y,width:w,height:h,fill:b.o.color||"#c49a55","fill-opacity":".22",stroke:b.o.id===selectedModelObjectId?"#ffd166":"#9bb1c8","stroke-width":b.o.id===selectedModelObjectId?"2.5":"1.1"}));
        const cx=x+w/2,cy=y+h/2;
        g.appendChild(svgEl("circle",{cx,cy,r:10,fill:"#ffd166",stroke:"#182536","stroke-width":"1"}));addText(g,cx,cy+4,String(i+1),10,"middle","700","#172334");
        // Hole coordinates are explicit local offsets from the part centre: x,y,z,diameter; entries separated by semicolons.
        String(b.o.holeSpec||"").split(";").forEach(entry=>{
          const m=entry.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*$/);
          if(!m)return;
          const local=[Number(m[1]),Number(m[2]),Number(m[3]),Number(m[4])];
          const world=transformModelVertex([b.o.x+local[0],b.o.y+local[1],b.o.z+local[2]],b.o);
          const [hx,hy]=mapPoint(world),radius=Math.max(3,local[3]*scale/2);
          g.appendChild(svgEl("circle",{cx:hx,cy:hy,r:radius,fill:"none",stroke:"#ffcf66","stroke-width":"1.6"}));
          line(g,hx-5,hy,hx+5,hy,"#ffcf66",1);line(g,hx,hy-5,hx,hy+5,"#ffcf66",1);
        });
      });
      // Overall dimension lines with extension ticks.
      const dimY=v.y+v.h-30,dimX=v.x+v.w-18;
      line(g,ox,dimY,ox+(hmax-hmin)*scale,dimY,"#ffd166",1);
      line(g,ox,dimY-5,ox,dimY+5,"#ffd166",1);line(g,ox+(hmax-hmin)*scale,dimY-5,ox+(hmax-hmin)*scale,dimY+5,"#ffd166",1);
      addText(g,v.x+v.w/2,dimY-5,Math.round(hmax-hmin)+" مم",10,"middle","700","#ffd166");
      line(g,dimX,oy-(vmax-vmin)*scale,dimX,oy,"#ffd166",1);
      line(g,dimX-5,oy-(vmax-vmin)*scale,dimX+5,oy-(vmax-vmin)*scale,"#ffd166",1);line(g,dimX-5,oy,dimX+5,oy,"#ffd166",1);
      addText(g,dimX-5,oy-(vmax-vmin)*scale/2,Math.round(vmax-vmin)+" مم",9,"end","700","#ffd166");
      addText(g,v.x+12,v.y+v.h-8,"الثقوب المرسومة: إحداثيات صريحة فقط",9,"start","400","#aebed0");
    });
    const panel=svgEl("g");root.appendChild(panel);
    panel.appendChild(svgEl("rect",{x:465,y:385,width:410,height:285,rx:8,fill:"#101d2c",stroke:"#53677d","stroke-width":"1.2"}));
    addText(panel,480,410,"ترقيم القطع وربطها بالتجميعة",15,"start","700");
    const shown=modelObjects.slice(0,8),rowH=Math.min(25,215/Math.max(1,shown.length));
    shown.forEach((o,i)=>{
      const y=438+i*rowH;
      panel.appendChild(svgEl("circle",{cx:490,cy:y-4,r:10,fill:"#ffd166"}));addText(panel,490,y,String(i+1),10,"middle","700","#172334");
      addText(panel,510,y,o.label+" — "+Math.round(o.w)+"×"+Math.round(o.h)+"×"+Math.round(o.d)+" مم",10,"start");
      if(i<shown.length-1)line(panel,490,y+8,490,y+rowH-7,"#8da4bc",1,"3 3");
    });
    if(modelObjects.length>8)addText(panel,480,655,"وباقي القطع: "+(modelObjects.length-8)+" قطعة",11,"start");
    addText(panel,24,695,"لا تُرسم ثقوب تخمينية؛ صيغة الثقب: X,Y,Z,القطر مم — إزاحات من مركز القطعة، وافصل بين الثقوب بفاصلة منقوطة.",10,"start");
    const list=$("modelManufacturingList");if(!list)return;
    const safe=value=>String(value??"—").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    list.innerHTML="<div class='table-wrap'><table><thead><tr><th>رقم</th><th>القطعة</th><th>الثقوب ومراكزها</th><th>قاعدة المحرك / التثبيت</th><th>اللحامات</th><th>نوع الوصلة / مكان التركيب</th><th>المكونات</th></tr></thead><tbody>"+modelObjects.map((o,i)=>"<tr><td>"+(i+1)+"</td><td>"+safe(o.label)+"</td><td>"+safe(o.holeSpec||"غير محدد")+"</td><td>"+safe(o.mountSpec||"غير محدد — يلزم تحديد أبعاد القاعدة ونمط المسامير")+"</td><td>"+safe(o.weldSpec||"غير محدد")+"</td><td>"+safe(o.jointSpec||"غير محدد")+"</td><td>"+safe(o.componentSpec||"—")+"</td></tr>").join("")+"</tbody></table></div>";
  }

  function exportModelManufacturingReport() {
    if(!modelObjects.length){toast("لا توجد قطع لتصدير تقريرها");return;}
    const quote=value=>'"'+String(value??"").replace(/"/g,'""')+'"';
    const rows=[["رقم القطعة","اسم القطعة","العرض مم","الارتفاع مم","العمق مم","الخامة","القطاع","السمك مم","العدد","طول القص المقترح مم","الثقوب ومراكزها","اللحامات","نوع الوصلة","ملاحظة"]];
    modelObjects.forEach((o,i)=>rows.push([i+1,o.label,Math.round(o.w),Math.round(o.h),Math.round(o.d),o.material||"حديد",o.profile||"",o.thickness??"",o.quantity||1,o.cutLength??Math.round(Math.max(o.w,o.h,o.d)),o.holeSpec||"غير محدد",o.weldSpec||"غير محدد",o.jointSpec||"غير محدد",o.componentSpec||"","مراجعة هندسية مطلوبة قبل التصنيع"]));
    const csv="\uFEFF"+rows.map(row=>row.map(quote).join(",")).join("\r\n");
    downloadBlobFile(csv,"text/csv;charset=utf-8",(modelProjectName||"naseej")+"_تقرير_التصنيع.csv");
    toast("تم تجهيز تقرير التصنيع بصيغة CSV");
  }
  function transformModelVertex(point,o) {
    let [x,y,z]=point;
    x-=o.x;y-=o.y+(o.h/2);z-=o.z;
    const rx=(o.rx||0)*Math.PI/180,ry=(o.ry||0)*Math.PI/180,rz=(o.rz||0)*Math.PI/180;
    let ny=y*Math.cos(rx)-z*Math.sin(rx),nz=y*Math.sin(rx)+z*Math.cos(rx);y=ny;z=nz;
    let nx=x*Math.cos(ry)+z*Math.sin(ry);nz=-x*Math.sin(ry)+z*Math.cos(ry);x=nx;z=nz;
    nx=x*Math.cos(rz)-y*Math.sin(rz);ny=x*Math.sin(rz)+y*Math.cos(rz);x=nx;y=ny;
    return [x+o.x,y+o.y+(o.h/2),z+o.z];
  }
  function projectModelPoint(x,y,z,angle,scale,cx,cy) {
    const a=angle*Math.PI/180, rx=x*Math.cos(a)-z*Math.sin(a), rz=x*Math.sin(a)+z*Math.cos(a);
    return [cx+(rx-rz)*.62*scale,cy+(rx+rz)*.34*scale-y*.78*scale];
  }
  function renderModelDrawing() {
    const root=$("modelDrawing");if(!root)return;
    root.innerHTML="";
    const center=modelObjects.length?modelObjects.reduce((a,o)=>[a[0]+o.x/modelObjects.length,a[1]+(o.y+o.h/2)/modelObjects.length,a[2]+o.z/modelObjects.length],[0,0,0]):[0,0,0];
    const assemblyObjects=modelAssemblyGuideOn?modelObjects.slice(0,Math.max(1,Math.min(modelObjects.length,modelAssemblyStep+1))):modelObjects;
    const renderObjects=assemblyObjects.map((o,i)=>{if(!modelExplodedView)return o;let dx=o.x-center[0],dy=o.y+o.h/2-center[1],dz=o.z-center[2],len=Math.hypot(dx,dy,dz);if(len<1){dx=(i%3)-1;dy=Math.floor(i/3)%2?.6:0;dz=1;len=Math.hypot(dx,dy,dz);}const gap=Math.max(90,Math.min(260,Math.max(o.w,o.h,o.d)*.22)),extra=modelExplodeOffsets[o.id]||{x:0,y:0,z:0};return {...o,x:o.x+dx/len*gap+extra.x,y:o.y+dy/len*gap+extra.y,z:o.z+dz/len*gap+extra.z};});
    const corners=[];
    renderObjects.forEach(o=>{
      const x=o.x,y=o.y,z=o.z,w=o.w,h=o.h,d=o.d;
      [[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]].forEach(c=>{
        corners.push(transformModelVertex([x+c[0]*w/2,y+c[1]*h,z+c[2]*d/2],o));
      });
    });
    if(!corners.length)corners.push([-500,0,-300],[500,900,300]);
    const raw=corners.map(p=>projectModelPoint(p[0],p[1],p[2],modelCameraAngle,1,0,0));
    const minX=Math.min(...raw.map(p=>p[0])),maxX=Math.max(...raw.map(p=>p[0]));
    const minY=Math.min(...raw.map(p=>p[1])),maxY=Math.max(...raw.map(p=>p[1]));
    const spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
    const scale=Math.min(.8,500/spanX,420/spanY)*modelZoom;
    const cx=450-(minX+maxX)*scale/2,cy=315-(minY+maxY)*scale/2;
    const project=(x,y,z)=>projectModelPoint(x,y,z,modelCameraAngle,scale,cx,cy);
    const grid=document.createElementNS(NS,"g");
    for(let n=-8;n<=8;n++){
      const p1=project(n*500,0,-4000),p2=project(n*500,0,4000),p3=project(-4000,0,n*500),p4=project(4000,0,n*500);
      [[p1,p2],[p3,p4]].forEach(pair=>grid.appendChild(svgEl("line",{x1:pair[0][0],y1:pair[0][1],x2:pair[1][0],y2:pair[1][1],stroke:"#49627d","stroke-width":"1.2"})));
    }
    root.appendChild(grid);
    const axes=[{a:[0,0,0],b:[1500,0,0],c:"#e16d61",t:"X"},{a:[0,0,0],b:[0,1500,0],c:"#75bd86",t:"Y"},{a:[0,0,0],b:[0,0,1500],c:"#70aee5",t:"Z"}];
    axes.forEach(axis=>{const p=project(...axis.a),q=project(...axis.b);root.appendChild(svgEl("line",{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:axis.c,"stroke-width":"3"}));const t=svgEl("text",{x:q[0]+5,y:q[1]-5,fill:axis.c,"font-size":"14"});t.textContent=axis.t;root.appendChild(t);});
    if(modelExplodedView){
      renderObjects.forEach((o,i)=>{
        const original=modelObjects[i];
        const from=project(...transformModelVertex([original.x,original.y+original.h/2,original.z],original));
        const to=project(...transformModelVertex([o.x,o.y+o.h/2,o.z],o));
        root.appendChild(svgEl("line",{x1:from[0],y1:from[1],x2:to[0],y2:to[1],stroke:"#ffd166","stroke-width":"2","stroke-dasharray":"6 5","pointer-events":"none"}));
        root.appendChild(svgEl("circle",{cx:from[0],cy:from[1],r:"4",fill:"#ffd166","pointer-events":"none"}));
      });
    }
    if(modelExplodedView){const links=svgEl("g");renderObjects.forEach(o=>{const e=modelExplodeOffsets[o.id]||{x:0,y:0,z:0};const p0=project(o.x-e.x,o.y-e.y+o.h/2,o.z-e.z),p1=project(o.x,o.y+o.h/2,o.z);if(Math.hypot(p1[0]-p0[0],p1[1]-p0[1])>2)links.appendChild(svgEl("line",{x1:p0[0],y1:p0[1],x2:p1[0],y2:p1[1],stroke:"#ffd166","stroke-width":"2","stroke-dasharray":"6 5","pointer-events":"none"}));});root.appendChild(links);}
    const faces=[];
    renderObjects.forEach(o=>{
      const x=o.x,y=o.y,z=o.z,w=o.w,h=o.h,d=o.d;
      if(o.type==="cylinder"){
        const sides=24,bottom=[],top=[];
        for(let k=0;k<sides;k++){const a=2*Math.PI*k/sides;bottom.push([x+Math.cos(a)*w/2,y,z+Math.sin(a)*d/2]);top.push([x+Math.cos(a)*w/2,y+h,z+Math.sin(a)*d/2]);}
        faces.push({o,projected:top.map(p=>project(...transformModelVertex(p,o))),depth:y+h+x+z,shade:1});
        for(let k=0;k<sides;k++){const n=(k+1)%sides,quad=[bottom[k],bottom[n],top[n],top[k]];faces.push({o,projected:quad.map(p=>project(...transformModelVertex(p,o))),depth:quad.reduce((sum,p)=>sum+p[0]+p[2],0)/4,shade:.68+(k%4)*.07});}
      }else{
        const pts=[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2],[x-w/2,y+h,z-d/2],[x+w/2,y+h,z-d/2],[x+w/2,y+h,z+d/2],[x-w/2,y+h,z+d/2]];
        [{ids:[4,5,6,7],shade:1},{ids:[0,1,5,4],shade:.82},{ids:[1,2,6,5],shade:.94},{ids:[2,3,7,6],shade:.7},{ids:[3,0,4,7],shade:.88}].forEach(f=>{
          faces.push({o,projected:f.ids.map(k=>project(...transformModelVertex(pts[k],o))),depth:f.ids.reduce((sum,k)=>sum+pts[k][0]+pts[k][2],0)/4,shade:f.shade});
        });
      }
    });
    faces.sort((a,b)=>a.depth-b.depth);
    faces.forEach(f=>root.appendChild(svgEl("polygon",{points:f.projected.map(p=>p.join(",")).join(" "),fill:f.o.color,opacity:f.shade,stroke:(modelAssemblyGuideOn&&f.o.id===modelObjects[modelAssemblyStep]?.id)?"#ffd166":f.o.id===selectedModelObjectId?"#ffffff":"#09111d","stroke-width":(modelAssemblyGuideOn&&f.o.id===modelObjects[modelAssemblyStep]?.id)?"4":f.o.id===selectedModelObjectId?"2.5":"1","data-object-id":f.o.id,class:"model-object-face"})));
    // Mechanical detail overlays: motor shafts, gear meshes, axle centerlines and wheel hubs.
    const mechanical=svgEl("g",{"pointer-events":"none"});
    const ring=(x,y,z,rx,rz,color,width=2)=>{
      const pts=[];
      for(let k=0;k<=32;k++){const a=2*Math.PI*k/32;pts.push(project(x+Math.cos(a)*rx,y,z+Math.sin(a)*rz));}
      mechanical.appendChild(svgEl("polyline",{points:pts.map(p=>p.join(",")).join(" "),fill:"none",stroke:color,"stroke-width":String(width)}));
    };
    const line3=(a,b,color,width=2,dash)=>{
      const p=project(...a),q=project(...b);
      mechanical.appendChild(svgEl("line",{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:color,"stroke-width":String(width),...(dash?{"stroke-dasharray":dash}:{})}));
    };
    const gear=(x,y,z,r,color)=>{
      ring(x,y,z,r,r,color,2.4);
      ring(x,y+1,z,r*.58,r*.58,color,1.5);
      for(let k=0;k<12;k++){
        const a=2*Math.PI*k/12;
        line3([x+Math.cos(a)*r*.86,y,z+Math.sin(a)*r*.86],[x+Math.cos(a)*r*1.12,y,z+Math.sin(a)*r*1.12],color,2.4);
      }
      ring(x,y+2,z,Math.max(3,r*.17),Math.max(3,r*.17),color,2);
    };
    renderObjects.forEach(o=>{
      const name=(o.label+" "+(o.profile||"")).toLowerCase();
      const cx=o.x,cy=o.y+o.h/2,cz=o.z;
      if(/محرك|motor|brushless|gear motor/.test(name)){
        const r=Math.max(8,Math.min(o.w,o.d)*.38);
        ring(cx,o.y+o.h,cz,r,r,"#ffb36b",2.2);
        ring(cx,o.y+o.h*.78,cz,r*.88,r*.88,"#ffb36b",1.4);
        line3([cx,o.y+o.h,cz],[cx,o.y+o.h+Math.max(24,o.h*.7),cz],"#fff0c2",4);
        ring(cx,o.y+o.h+Math.max(24,o.h*.7),cz,Math.max(3,r*.16),Math.max(3,r*.16),"#fff0c2",2);
        line3([cx-r*.55,cy,cz],[cx+r*.55,cy,cz],"#f7d5a4",1.2);
      }
      if(/ترس|gear|دفرنس|علبة/.test(name)){
        const r=Math.max(12,Math.min(o.w,o.d)*.3);
        gear(cx-r*.48,cy+o.h*.12,cz,r,"#7dd3fc");
        gear(cx+r*.48,cy+o.h*.12,cz,r*.72,"#b6e3ff");
        line3([cx-r*1.2,cy+o.h*.12,cz],[cx+r*1.25,cy+o.h*.12,cz],"#d9e9f5",2,"5 4");
      }
      if(/محور|axle|عمود دوران|shaft/.test(name)){
        const len=Math.max(o.w,o.d)*.62;
        line3([cx-len/2,cy,cz],[cx+len/2,cy,cz],"#fff0c2",4);
        ring(cx-len/2,cy,cz,Math.max(4,o.h*.22),Math.max(4,o.h*.22),"#fff0c2",1.8);
        ring(cx+len/2,cy,cz,Math.max(4,o.h*.22),Math.max(4,o.h*.22),"#fff0c2",1.8);
      }
      if(/عجلة|إطار|wheel|tire/.test(name)){
        const r=Math.max(6,Math.min(o.w,o.d)*.23);
        ring(cx,cy,cz,r,r,"#d8e0e8",2);
        ring(cx,cy,cz,r*.42,r*.42,"#ffffff",2);
        line3([cx-r*.7,cy,cz],[cx+r*.7,cy,cz],"#d8e0e8",1.5);
      }
    });
    root.appendChild(mechanical);
    const selected=renderObjects.find(o=>o.id===selectedModelObjectId);
    const dimensions=svgEl("g");
    if(selected){
      const c={
        x1:transformModelVertex([selected.x-selected.w/2,selected.y,selected.z-selected.d/2],selected),
        x2:transformModelVertex([selected.x+selected.w/2,selected.y,selected.z-selected.d/2],selected),
        y1:transformModelVertex([selected.x+selected.w/2,selected.y,selected.z-selected.d/2],selected),
        y2:transformModelVertex([selected.x+selected.w/2,selected.y+selected.h,selected.z-selected.d/2],selected),
        z1:transformModelVertex([selected.x+selected.w/2,selected.y,selected.z-selected.d/2],selected),
        z2:transformModelVertex([selected.x+selected.w/2,selected.y,selected.z+selected.d/2],selected)
      };
      const dimensionLine=(a,b,label,dx=0,dy=0)=>{
        const p=project(...a),q=project(...b);
        dimensions.appendChild(svgEl("line",{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:"#ffd166","stroke-width":"2.2","stroke-dasharray":"5 3","pointer-events":"none"}));
        [p,q].forEach(v=>dimensions.appendChild(svgEl("circle",{cx:v[0],cy:v[1],r:"3",fill:"#ffd166","pointer-events":"none"})));
        const t=svgEl("text",{x:(p[0]+q[0])/2+dx,y:(p[1]+q[1])/2+dy,fill:"#ffe39a","font-size":"15","font-weight":"700","text-anchor":"middle","paint-order":"stroke","stroke":"#101b2b","stroke-width":"4","pointer-events":"none"});
        t.textContent=label;dimensions.appendChild(t);
      };
      dimensionLine(c.x1,c.x2,"العرض "+Math.round(selected.w)+" مم",0,17);
      dimensionLine(c.y1,c.y2,"الارتفاع "+Math.round(selected.h)+" مم",32,0);
      dimensionLine(c.z1,c.z2,"العمق "+Math.round(selected.d)+" مم",0,-12);
    }
    root.appendChild(dimensions);
    const labels=svgEl("g");
    renderObjects.forEach(o=>{const p=project(o.x,o.y+o.h+35,o.z),t=svgEl("text",{x:p[0],y:p[1],fill:"#e8edf5","font-size":"11","text-anchor":"middle","pointer-events":"none"});t.textContent=o.label;labels.appendChild(t);});
    root.appendChild(labels);
    // Technical callouts: identify mechanical/electronic components and point to their actual model positions.
    const technical=svgEl("g",{"pointer-events":"none"});
    const classify=o=>{
      const n=(o.label+" "+(o.profile||"")+" "+(o.componentSpec||"")).toLowerCase();
      if(/محرك|motor|brushless/.test(n))return ["محرك","motor"];
      if(/ترس|gear|دفرنس|علبة تروس/.test(n))return ["نقل الحركة","gear"];
      if(/محور|axle|عمود دوران/.test(n))return ["محور دوران","shaft"];
      if(/esc|منظم سرعة/.test(n))return ["منظم السرعة ESC","electronics"];
      if(/متحكم|flight controller|f4|imu|جيروسكوب/.test(n))return ["متحكم الطيران / IMU","electronics"];
      if(/بطارية|lipo|battery/.test(n))return ["البطارية","electronics"];
      if(/مستشعر|حساس|sensor|receiver|مستقبل|سيرفو|servo|بارومتر|optical flow|tof/.test(n))return ["إلكترونيات / حساس","electronics"];
      if(/مروحة|propeller/.test(n))return ["مروحة","prop"];
      return null;
    };
    const technicalParts=renderObjects.map(o=>({o,kind:classify(o)})).filter(v=>v.kind);
    const priority={motor:0,gear:1,shaft:2,electronics:3,prop:4};
    technicalParts.sort((a,b)=>priority[a.kind[1]]-priority[b.kind[1]]);
    technicalParts.slice(0,9).forEach((item,i)=>{
      const o=item.o,p=project(o.x,o.y+o.h/2,o.z);
      const laneY=42+i*29,laneX=660;
      technical.appendChild(svgEl("path",{d:"M "+p[0]+" "+p[1]+" L "+Math.min(625,p[0]+35)+" "+p[1]+" L "+(laneX-8)+" "+laneY,fill:"none",stroke:item.kind[1]==="motor"?"#ff9d5c":item.kind[1]==="gear"||item.kind[1]==="shaft"?"#7dd3fc":"#a7e0a0","stroke-width":"1.8"}));
      technical.appendChild(svgEl("circle",{cx:p[0],cy:p[1],r:item.kind[1]==="motor"?Math.max(12,Math.min(22,Math.max(o.w,o.d)*scale*.55)):7,fill:"none",stroke:item.kind[1]==="motor"?"#ff9d5c":item.kind[1]==="gear"||item.kind[1]==="shaft"?"#7dd3fc":"#a7e0a0","stroke-width":"2"}));
      technical.appendChild(svgEl("rect",{x:laneX-5,y:laneY-16,width:225,height:23,rx:5,fill:"#0a1422",stroke:"#60758d","stroke-width":"1"}));
      const t=svgEl("text",{x:laneX+5,y:laneY,fill:"#f4f7fb","font-size":"12","text-anchor":"start"});
      t.textContent=(i+1)+". "+item.kind[0]+" — "+o.label;
      technical.appendChild(t);
    });
    if(technicalParts.length){
      const legend=svgEl("text",{x:655,y:20,fill:"#ffd166","font-size":"13","font-weight":"700","text-anchor":"start"});
      legend.textContent="تحديد مواقع المكونات الفنية";
      technical.appendChild(legend);
    }
    if(technicalParts.length>9){
      const more=svgEl("text",{x:660,y:315,fill:"#b8c7d8","font-size":"11","text-anchor":"start"});
      more.textContent="وباقي المكونات موضحة في قائمة القطع وجدول المواصفات";
      technical.appendChild(more);
    }
    root.appendChild(technical);
    const summary=$("modelDimensionSummary");
    if(summary){
      const bounds=axis=>{const vals=[];modelObjects.forEach(o=>{const c=axis==="x"?[o.x-o.w/2,o.x+o.w/2]:axis==="y"?[o.y,o.y+o.h]:[o.z-o.d/2,o.z+o.d/2];vals.push(...c);});return vals.length?Math.round(Math.max(...vals)-Math.min(...vals)):0;};
      summary.textContent="إجمالي التصميم: عرض "+bounds("x")+" مم × ارتفاع "+bounds("y")+" مم × عمق "+bounds("z")+" مم  |  عدد القطع: "+modelObjects.length;
    }
    const list=$("modelObjectList");list.innerHTML="";
    modelObjects.forEach(o=>{const b=document.createElement("button");b.type="button";b.className="model-object-choice"+(o.id===selectedModelObjectId?" active":"");b.textContent=o.label;b.addEventListener("click",()=>{selectedModelObjectId=o.id;renderModelDrawing();renderModelObjectEditor();});list.appendChild(b);});
    $("modelPreviewName").textContent=modelProjectName;
    renderModelCutList();
    if(modelAssemblyGuideOn)renderModelAssemblyGuide();
    renderManufacturingDrawings();
  }
  function saveModelObjectEdits() {
    const o=modelObjects.find(item=>item.id===selectedModelObjectId);if(!o)return;
    const num=id=>Number($(id).value);
    const dims=[num("modelDimX"),num("modelDimY"),num("modelDimZ")],pos=[num("modelPosX"),num("modelPosY"),num("modelPosZ")];
    if(dims.some(v=>!Number.isFinite(v)||v<=0)||pos.some(v=>!Number.isFinite(v))){toast("راجع الأبعاد والمواقع المدخلة");return;}
    const rotations=["modelRotX","modelRotY","modelRotZ"].map(id=>Number($(id).value));
    if(rotations.some(v=>!Number.isFinite(v)||Math.abs(v)>360)){toast("زاوية الدوران لازم تكون بين -360 و360");return;}
    const thickness=Number($("modelPartThickness").value||0),quantity=Number($("modelPartQuantity").value||1),cutLength=Number($("modelPartCutLength").value||Math.max(...dims));
    if(!Number.isFinite(thickness)||thickness<0||!Number.isFinite(quantity)||quantity<1||!Number.isInteger(quantity)||!Number.isFinite(cutLength)||cutLength<0){toast("راجع السمك والعدد وطول القص");return;}
    modelHistoryPush();o.label=$("modelObjectLabel").value.trim()||"جسم";[o.w,o.h,o.d]=dims;[o.x,o.y,o.z]=pos;[o.rx,o.ry,o.rz]=rotations;o.color=$("modelObjectColor").value;
    o.material=$("modelPartMaterial").value;o.profile=$("modelPartProfile").value.trim();o.thickness=thickness;o.quantity=quantity;o.cutLength=cutLength;
    o.holeSpec=$("modelHoleSpec").value.trim();o.mountSpec=$("modelMountSpec").value.trim();o.weldSpec=$("modelWeldSpec").value.trim();o.jointSpec=$("modelJointSpec").value.trim();o.componentSpec=$("modelComponentSpec")?$("modelComponentSpec").value.trim():"";
    renderModelDrawing();renderModelObjectEditor();renderModelCutList();renderManufacturingDrawings();save();
  }
  function exportModelObj() {
    if(!modelObjects.length){toast("لوحة الرسم فاضية");return;}
    let out="# Naseej 3D sketch - dimensions in millimeters\n",offset=1;
    modelObjects.forEach(o=>{
      out+="o "+o.label.replace(/[^\w\u0600-\u06FF-]/g,"_")+"\n";
      const x=o.x,y=o.y,z=o.z,w=o.w,h=o.h,d=o.d;
      const addVertex=p=>{const transformed=transformModelVertex([x+p[0],y+p[1],z+p[2]],o);out+="v "+transformed.join(" ")+"\n";};
      if(o.type==="cylinder"){
        const sides=16,vertices=[];
        for(let k=0;k<sides;k++){const a=2*Math.PI*k/sides;vertices.push([Math.cos(a)*w/2,0,Math.sin(a)*d/2]);}
        for(let k=0;k<sides;k++){const a=2*Math.PI*k/sides;vertices.push([Math.cos(a)*w/2,h,Math.sin(a)*d/2]);}
        vertices.forEach(addVertex);
        out+="f "+Array.from({length:sides},(_,i)=>offset+i).reverse().join(" ")+"\n";
        out+="f "+Array.from({length:sides},(_,i)=>offset+sides+i).join(" ")+"\n";
        for(let k=0;k<sides;k++){const n=(k+1)%sides;out+="f "+[offset+k,offset+n,offset+sides+n,offset+sides+k].join(" ")+"\n";}
        offset+=sides*2;
      }else{
        const vertices=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2],[-w/2,h,-d/2],[w/2,h,-d/2],[w/2,h,d/2],[-w/2,h,d/2]];
        vertices.forEach(addVertex);
        [[1,2,3,4],[5,8,7,6],[1,5,6,2],[2,6,7,3],[3,7,8,4],[4,8,5,1]].forEach(f=>{out+="f "+f.map(i=>i+offset-1).join(" ")+"\n";});
        offset+=8;
      }
    });
    downloadBlobFile(out,"text/plain;charset=utf-8",(modelProjectName||"naseej-3d")+".obj");toast("تم تجهيز ملف OBJ");
  }
  function modelDrawingFitScale() {
    if(!modelObjects.length)return .8*modelZoom;
    const corners=[];
    modelObjects.forEach(o=>{
      const x=o.x,y=o.y,z=o.z,w=o.w,h=o.h,d=o.d;
      [[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]].forEach(c=>corners.push(transformModelVertex([x+c[0]*w/2,y+c[1]*h,z+c[2]*d/2],o)));
    });
    const projected=corners.map(p=>projectModelPoint(p[0],p[1],p[2],modelCameraAngle,1,0,0));
    const spanX=Math.max(1,Math.max(...projected.map(p=>p[0]))-Math.min(...projected.map(p=>p[0])));
    const spanY=Math.max(1,Math.max(...projected.map(p=>p[1]))-Math.min(...projected.map(p=>p[1])));
    return Math.min(.8,500/spanX,420/spanY)*modelZoom;
  }
  function renderModelAssemblyGuide(){
    const panel=$("modelAssemblyGuide");if(!panel)return;
    if(!modelObjects.length){panel.innerHTML="<p>أضف قطعًا إلى المجسم أولًا لبدء دليل التجميع.</p>";return;}
    const index=Math.max(0,Math.min(modelAssemblyStep,modelObjects.length-1)),part=modelObjects[index],safe=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\x27/g,"&#39;");
    panel.innerHTML="<div class=\"assembly-guide-head\"><strong>الخطوة "+(index+1)+" من "+modelObjects.length+": "+safe(part.label)+"</strong><span>"+(index===modelObjects.length-1?"آخر قطعة في القائمة":"تركيب القطعة الحالية")+"</span></div><p>الخامة: "+safe(part.material||"غير محددة")+" | الأبعاد: "+Math.round(part.w)+" × "+Math.round(part.h)+" × "+Math.round(part.d)+" مم</p><p>طريقة الوصلة: "+safe(part.jointSpec||"لم تُحدد بعد")+"</p><p>اللحام: "+safe(part.weldSpec||"لم يُحدد بعد")+"</p><div class=\"assembly-guide-actions\"><button type=\"button\" class=\"button button-quiet\" id=\"modelAssemblyPrevBtn\" "+(index===0?"disabled":"")+">الخطوة السابقة</button><button type=\"button\" class=\"button button-primary\" id=\"modelAssemblyNextBtn\" "+(index===modelObjects.length-1?"disabled":"")+">الخطوة التالية</button><button type=\"button\" class=\"button button-quiet\" id=\"modelAssemblyExitBtn\">عرض كل القطع</button></div><p class=\"catalog-footnote\">ترتيب الخطوات يتبع ترتيب القطع في قائمة الأجسام. راجع ترتيب التركيب الفعلي ونوع الوصلات قبل التنفيذ؛ النظام لا يستنتج تسلسلًا هندسيًا تلقائيًا.</p>";
    $("modelAssemblyPrevBtn").addEventListener("click",()=>{modelAssemblyStep=Math.max(0,modelAssemblyStep-1);selectedModelObjectId=modelObjects[modelAssemblyStep].id;renderModelDrawing();renderModelObjectEditor();});
    $("modelAssemblyNextBtn").addEventListener("click",()=>{modelAssemblyStep=Math.min(modelObjects.length-1,modelAssemblyStep+1);selectedModelObjectId=modelObjects[modelAssemblyStep].id;renderModelDrawing();renderModelObjectEditor();});
    $("modelAssemblyExitBtn").addEventListener("click",()=>{modelAssemblyGuideOn=false;panel.hidden=true;$("modelAssemblyStartBtn").textContent="بدء دليل التجميع";renderModelDrawing();});
  }
  function setupModelStudio() {
    let orbitStart=null,orbitMoved=false;
    const drawing=$("modelDrawing");
    const activePointers=new Map();
    let pinchStartDistance=0,pinchStartZoom=1;
    drawing.style.touchAction="none";
    const pointerDistance=()=>{
      const points=[...activePointers.values()];
      return points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
    };
    let partDrag=null;
    drawing.addEventListener("pointerdown",event=>{
      activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(drawing.setPointerCapture)drawing.setPointerCapture(event.pointerId);
      if(activePointers.size===2){
        partDrag=null;orbitStart=null;pinchStartDistance=Math.max(1,pointerDistance());pinchStartZoom=modelZoom;orbitMoved=true;
        event.preventDefault();return;
      }
      const face=event.target.closest&&event.target.closest("[data-object-id]");
      if(face&&modelExplodedView&&modelExplodeMoveMode){modelHistoryPush();const id=face.getAttribute("data-object-id");selectedModelObjectId=id;const extra=modelExplodeOffsets[id]||{x:0,y:0,z:0};partDrag={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:extra.x,originY:extra.y,originZ:extra.z,scale:modelDrawingFitScale(),angle:modelCameraAngle,viewOnly:true};orbitStart=null;orbitMoved=false;renderModelObjectEditor();event.preventDefault();return;}
      if(face&&!modelExplodedView){
        const object=modelObjects.find(o=>o.id===face.getAttribute("data-object-id"));
        if(object){
          modelHistoryPush();selectedModelObjectId=object.id;renderModelObjectEditor();
          partDrag={id:object.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:object.x,originZ:object.z,scale:modelDrawingFitScale(),angle:modelCameraAngle};
          orbitStart=null;orbitMoved=false;event.preventDefault();return;
        }
      }
      if(activePointers.size===1){partDrag=null;orbitStart={x:event.clientX,angle:modelCameraAngle};orbitMoved=false;}
    });
    drawing.addEventListener("pointermove",event=>{
      if(!activePointers.has(event.pointerId))return;
      activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(activePointers.size>=2){
        const distance=pointerDistance();
        if(pinchStartDistance>0){modelZoom=Math.max(.45,Math.min(3.5,pinchStartZoom*distance/pinchStartDistance));renderModelDrawing();}
        event.preventDefault();return;
      }
      if(partDrag&&partDrag.pointerId===event.pointerId&&partDrag.viewOnly){const rect=drawing.getBoundingClientRect(),dxScreen=(event.clientX-partDrag.startX)*900/rect.width,dyScreen=(event.clientY-partDrag.startY)*620/rect.height,u=dxScreen/(.62*partDrag.scale),v=dyScreen/(.34*partDrag.scale),angle=partDrag.angle*Math.PI/180;modelExplodeOffsets[partDrag.id]={x:partDrag.originX+Math.cos(angle)*u+Math.sin(angle)*v,y:partDrag.originY,z:partDrag.originZ-Math.sin(angle)*u+Math.cos(angle)*v};if(Math.abs(dxScreen)+Math.abs(dyScreen)>2)orbitMoved=true;renderModelDrawing();event.preventDefault();return;}
      if(partDrag&&partDrag.pointerId===event.pointerId){
        const object=modelObjects.find(o=>o.id===partDrag.id);if(!object)return;
        const rect=drawing.getBoundingClientRect();
        const dxScreen=(event.clientX-partDrag.startX)*900/rect.width;
        const dyScreen=(event.clientY-partDrag.startY)*620/rect.height;
        const u=dxScreen/(.62*partDrag.scale),v=dyScreen/(.34*partDrag.scale);
        const angle=partDrag.angle*Math.PI/180;
        object.x=partDrag.originX+Math.cos(angle)*u+Math.sin(angle)*v;
        object.z=partDrag.originZ-Math.sin(angle)*u+Math.cos(angle)*v;
        if(Math.abs(dxScreen)+Math.abs(dyScreen)>2)orbitMoved=true;
        $("modelPosX").value=Math.round(object.x);$("modelPosZ").value=Math.round(object.z);
        renderModelDrawing();event.preventDefault();return;
      }
      if(!orbitStart)return;
      const delta=event.clientX-orbitStart.x;
      if(Math.abs(delta)>3)orbitMoved=true;
      if(orbitMoved){modelCameraAngle=(orbitStart.angle+delta*.55+360)%360;$("modelCameraAngle").value=Math.round(modelCameraAngle);renderModelDrawing();}
    });
    const endOrbit=event=>{
      if(event&&partDrag&&partDrag.pointerId===event.pointerId){
        if(orbitMoved&&!partDrag.viewOnly){save();renderModelObjectEditor();renderManufacturingDrawings();}
        partDrag=null;
      }
      if(event)activePointers.delete(event.pointerId);
      if(activePointers.size<2)pinchStartDistance=0;
      if(activePointers.size===0)orbitStart=null;
      else if(activePointers.size===1){const p=[...activePointers.values()][0];orbitStart={x:p.x,angle:modelCameraAngle};}
    };
    drawing.addEventListener("pointerup",endOrbit);
    drawing.addEventListener("pointercancel",endOrbit);
    let touchPinchStart=0,touchZoomStart=1;
    drawing.addEventListener("touchstart",event=>{
      if(event.touches.length===2){
        touchPinchStart=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);
        touchZoomStart=modelZoom;orbitStart=null;orbitMoved=true;event.preventDefault();
      }
    },{passive:false});
    drawing.addEventListener("touchmove",event=>{
      if(event.touches.length!==2||!touchPinchStart)return;
      const distance=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);
      modelZoom=Math.max(.35,Math.min(4.5,touchZoomStart*distance/touchPinchStart));
      renderModelDrawing();event.preventDefault();
    },{passive:false});
    const endTouchPinch=()=>{touchPinchStart=0;};
    drawing.addEventListener("touchend",endTouchPinch,{passive:true});
    drawing.addEventListener("touchcancel",endTouchPinch,{passive:true});
    drawing.addEventListener("wheel",event=>{
      event.preventDefault();
      modelZoom=Math.max(.45,Math.min(3.5,modelZoom*(event.deltaY<0?1.12:.89)));
      renderModelDrawing();
    },{passive:false});
    drawing.addEventListener("dblclick",()=>{modelZoom=1;renderModelDrawing();});
    drawing.addEventListener("click",event=>{
      if(orbitMoved){orbitMoved=false;return;}
      const face=event.target.closest&&event.target.closest("[data-object-id]");
      if(!face)return;
      selectedModelObjectId=face.getAttribute("data-object-id");renderModelDrawing();renderModelObjectEditor();
    });
    document.querySelectorAll("[data-model-zoom]").forEach(button=>button.addEventListener("click",()=>{
      const action=button.dataset.modelZoom;
      modelZoom=action==="in"?Math.min(4.5,modelZoom*1.25):action==="out"?Math.max(.35,modelZoom/1.25):1;
      renderModelDrawing();
    }));
    $("modelUndoBtn").addEventListener("click",undoModelAction);
    $("modelRedoBtn").addEventListener("click",redoModelAction);
    updateModelHistoryButtons();
    $("modelExplodeToggleBtn").addEventListener("click",()=>{modelHistoryPush();modelExplodedView=!modelExplodedView;$("modelExplodeToggleBtn").textContent=modelExplodedView?"إرجاع التجميع":"عرض التفكيك";$("modelExplodeMoveBtn").disabled=!modelExplodedView;if(!modelExplodedView){modelExplodeMoveMode=false;modelExplodeOffsets={};$("modelExplodeMoveBtn").textContent="تحريك القطع المفككة";$("modelExplodeHint").textContent="التفكيك بصري مؤقت ولا يغيّر إحداثيات القطع الأصلية أو ملف المشروع.";}renderModelDrawing();});
    $("modelAssemblyStartBtn").addEventListener("click",()=>{if(!modelObjects.length){toast("أضف قطعًا أولًا");return;}modelAssemblyGuideOn=true;modelAssemblyStep=0;modelExplodedView=false;modelExplodeMoveMode=false;modelExplodeOffsets={};$("modelExplodeToggleBtn").textContent="عرض التفكيك";$("modelExplodeMoveBtn").disabled=true;$("modelAssemblyGuide").hidden=false;$("modelAssemblyStartBtn").textContent="دليل التجميع نشط";selectedModelObjectId=modelObjects[0].id;renderModelAssemblyGuide();renderModelDrawing();renderModelObjectEditor();});
    $("modelExplodeMoveBtn").addEventListener("click",()=>{if(!modelExplodedView)return;modelExplodeMoveMode=!modelExplodeMoveMode;$("modelExplodeMoveBtn").textContent=modelExplodeMoveMode?"إيقاف تحريك القطع":"تحريك القطع المفككة";$("modelExplodeHint").textContent=modelExplodeMoveMode?"اسحب أي قطعة بإصبعك أو بالماوس لتعديل مكانها في عرض التفكيك فقط.":"حرّك القطع المفككة يدويًا؛ التصميم الأصلي لا يتغير.";});
    $("exportModelManufacturingBtn").addEventListener("click",exportModelManufacturingReport);
    $("addStandModelTemplateBtn").addEventListener("click",addStandModelTemplate);
    $("addModelObjectBtn").addEventListener("click",modelProjectAddObject);
    $("saveModelObjectBtn").addEventListener("click",saveModelObjectEdits);
    $("deleteModelObjectBtn").addEventListener("click",modelProjectDeleteObject);
    $("duplicateModelObjectBtn").addEventListener("click",duplicateModelObject);
    $("modelCameraAngle").addEventListener("input",e=>{modelCameraAngle=Number(e.target.value);renderModelDrawing();});
    $("resetModelCameraBtn").addEventListener("click",()=>{$("modelCameraAngle").value=35;modelCameraAngle=35;modelZoom=1;renderModelDrawing();});
    $("saveModelProjectBtn").addEventListener("click",projectModelSave);
    $("loadModelProjectBtn").addEventListener("click",modelProjectLoad);
    $("exportModelObjBtn").addEventListener("click",exportModelObj);
    $("clearModelBtn").addEventListener("click",()=>{if(!confirm("تمسح كل الأجسام من لوحة الرسم؟"))return;modelHistoryPush();modelObjects=[];selectedModelObjectId=null;modelExplodedView=false;modelExplodeMoveMode=false;modelExplodeOffsets={};$("modelExplodeMoveBtn").disabled=true;$("modelExplodeToggleBtn").textContent="عرض التفكيك";renderModelDrawing();renderModelObjectEditor();});
    if(!data.modelStudioInitialized){
      modelObjects=[{id:uid(),type:"box",label:"مجسم تجريبي",x:0,y:0,z:0,w:600,h:300,d:400,color:"#c49a55",rx:0,ry:0,rz:0}];
      selectedModelObjectId=modelObjects[0].id;
      data.modelStudioInitialized=true;
      save();
    }
    renderModelProjectOptions();renderModelDrawing();renderModelObjectEditor();renderManufacturingDrawings();
  }

  function setupDesignStudio() {
    $("catalogSearch").addEventListener("input",renderFabricationCatalog);
    $("catalogCategory").addEventListener("change",renderFabricationCatalog);
    renderFabricationCatalog();
    document.querySelectorAll(".main-tab").forEach(tab=>tab.addEventListener("click",()=>{
      document.querySelectorAll(".main-tab").forEach(t=>t.classList.toggle("active",t===tab));
      $("ideasView").hidden=tab.dataset.view!=="ideasView";
      $("designView").hidden=tab.dataset.view!=="designView";
      $("modelView").hidden=tab.dataset.view!=="modelView";
      if(tab.dataset.view==="designView")renderStandModel();
      if(tab.dataset.view==="modelView")renderModelDrawing();
    }));
    ["designName","standWidth","standHeight","standDepth","shelfCount","standMaterial","standColor"].forEach(id=>$(id).addEventListener("input",renderStandModel));
    $("standNotes").addEventListener("input",()=>{});
    $("saveDesignBtn").addEventListener("click",saveStandDesign);
    $("loadDesignBtn").addEventListener("click",loadStandDesign);
    $("newDesignBtn").addEventListener("click",resetStandDesign);
    $("downloadStandBtn").addEventListener("click",downloadStandImage);
    $("exportObjBtn").addEventListener("click",exportStandOBJ);
    $("exportDesignFileBtn").addEventListener("click",exportStandaloneDesignFile);
    $("exportDesignDataBtn").addEventListener("click",exportDesignDataFile);
    $("resetViewBtn").addEventListener("click",()=>{standRotation={x:0,y:0};renderStandModel();});
    $("explodeToggleBtn").addEventListener("click",()=>{explodedView=!explodedView;renderStandModel();});
    $("savePartBtn").addEventListener("click",saveSelectedPart);
    $("generateAssemblyDraftBtn").addEventListener("click",createAssemblyDraft);
    $("assemblyStepsList").addEventListener("click",handleAssemblyGuideClick);
    $("assemblyStepsList").addEventListener("change",handleAssemblyNote);
    $("saveConnectionLibraryBtn").addEventListener("click",saveConnectionToLibrary);
    $("applyConnectionLibraryBtn").addEventListener("click",applyLibraryConnection);
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
    const message = "هل تريد حذف مجموعة «" + group.name + "»؟\n" +
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
      data = {nodes:parsed.nodes,edges:parsed.edges,groups:Array.isArray(parsed.groups) ? parsed.groups : [],designs:Array.isArray(parsed.designs) ? parsed.designs : [],connectionLibrary:Array.isArray(parsed.connectionLibrary) ? parsed.connectionLibrary : [],modelProjects:Array.isArray(parsed.modelProjects) ? parsed.modelProjects : []}; selectedId = null; linking = false; save(); render(); toast("تم استيراد البيانات");
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
  setupModelStudio();
  render();
})();