"use strict";
(function(){
  const $=id=>document.getElementById(id);
  let parserPromise=null, importedRoot=null, sourceFile=null, selectedNode=null, treeNodes=[];
  const status=(message,state="")=>{const el=$("cadImportStatus");if(el){el.textContent=message;el.dataset.state=state;}};
  function flattenTriplets(value){
    if(!Array.isArray(value))return [];
    if(value.length&&Array.isArray(value[0]))return value.flatMap(v=>v.slice(0,3));
    return value;
  }
  function meshGeometry(source){
    const geometry=new THREE.BufferGeometry();
    const position=flattenTriplets(source.attributes&&source.attributes.position&&source.attributes.position.array);
    if(!position.length)throw new Error("ملف CAD لم يحتوِ على بيانات سطح قابلة للعرض.");
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(position,3));
    const normals=flattenTriplets(source.attributes&&source.attributes.normal&&source.attributes.normal.array);
    if(normals.length===position.length)geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
    const indices=flattenTriplets(source.index&&source.index.array);
    if(indices.length)geometry.setIndex(indices);
    else geometry.setIndex(Array.from({length:position.length/3},(_,i)=>i));
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return geometry;
  }
  function colorOf(mesh){
    const c=Array.isArray(mesh.color)?mesh.color:[.72,.76,.8];
    return new THREE.Color(Math.max(0,Math.min(1,c[0])),Math.max(0,Math.min(1,c[1])),Math.max(0,Math.min(1,c[2])));
  }
  function buildNode(node,meshes,parentPath=""){
    const group=new THREE.Group();
    group.name=String(node.name||"جزء بدون اسم");
    group.userData.cadNodeId="cad-"+treeNodes.length;
    const record={id:group.userData.cadNodeId,name:group.name,group,parentPath,children:[],meshCount:0};
    treeNodes.push(record);
    (node.meshes||[]).forEach(index=>{
      const source=meshes[index];if(!source)return;
      const geometry=meshGeometry(source);
      const material=new THREE.MeshStandardMaterial({color:colorOf(source),metalness:.38,roughness:.34,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,material);mesh.name=String(source.name||("Mesh "+index));mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.cadNodeId=record.id;
      group.add(mesh);record.meshCount++;
    });
    (node.children||[]).forEach(child=>{
      const built=buildNode(child,meshes,record.id);group.add(built.group);record.children.push(built.record);
    });
    record.parentPath=parentPath;
    return {group,record};
  }
  function renderTree(records,host,depth=0){
    records.forEach(record=>{
      const row=document.createElement("div");row.className="cad-tree-row";row.style.marginRight=(depth*8)+"px";
      const choose=document.createElement("button");choose.type="button";choose.className="cad-tree-node";choose.textContent=record.name+(record.meshCount?" · "+record.meshCount+" سطح":"");choose.title=record.name;
      choose.addEventListener("click",()=>{
        selectedNode=record.id;
        host.querySelectorAll(".cad-tree-node").forEach(el=>el.classList.remove("active"));
        choose.classList.add("active");
        if(importedRoot){const box=new THREE.Box3().setFromObject(record.group);if(!box.isEmpty()){const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());const api=window.Naseej3D;api.objectCenter.copy(center);api.maxDim=Math.max(size.x,size.y,size.z,80);api.renderView(api.lastState||{angle:35,pitch:24,zoom:1,panX:0,panY:0});}}
      });
      const toggle=document.createElement("button");toggle.type="button";toggle.className="cad-tree-toggle";toggle.textContent=record.group.visible?"إخفاء":"إظهار";toggle.setAttribute("aria-label","إظهار أو إخفاء "+record.name);
      toggle.addEventListener("click",()=>{record.group.visible=!record.group.visible;toggle.textContent=record.group.visible?"إخفاء":"إظهار";row.classList.toggle("cad-tree-muted",!record.group.visible);});
      row.append(choose,toggle);host.appendChild(row);
      if(record.children.length){const children=document.createElement("div");children.className="cad-tree-children";host.appendChild(children);renderTree(record.children,children,depth+1);}
    });
  }
  function formatMm(n){return Number.isFinite(n)?(Math.round(n*10)/10).toLocaleString("en-US")+" مم":"—";}
  async function importFile(file){
    if(!file)return;
    if(!window.Naseej3D||!window.Naseej3D.available){status("مرسم WebGL غير جاهز. افتح قسم الرسم ثلاثي الأبعاد وانتظر ظهور لوحة الرسم ثم أعد المحاولة.","error");return;}
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    const method=ext==="step"||ext==="stp"?"ReadStepFile":ext==="iges"||ext==="igs"?"ReadIgesFile":ext==="brep"?"ReadBrepFile":null;
    if(!method){status("امتداد الملف غير مدعوم. اختر STEP أو STP أو IGES أو IGS أو BREP.","error");return;}
    try{
      $("cadFitBtn").disabled=true;$("cadClearBtn").disabled=true;
      status("جاري تجهيز قارئ الهندسة وقراءة الملف: "+file.name+" …");
      if(!parserPromise){
        if(typeof window.occtimportjs!=="function")throw new Error("تعذر تحميل محرك استيراد CAD. تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.");
        parserPromise=window.occtimportjs();
      }
      const parser=await parserPromise;
      const bytes=new Uint8Array(await file.arrayBuffer());
      const result=parser[method](bytes,{linearUnit:"millimeter",linearDeflectionType:"bounding_box_ratio",linearDeflection:.08,angularDeflection:.35});
      if(!result||!result.success)throw new Error("محرك CAD لم يستطع قراءة هذا الملف. قد يكون الملف تالفًا أو بصيغة غير مدعومة.");
      if(!result.root||!Array.isArray(result.meshes))throw new Error("الملف قُرئ لكن بنية الأجزاء غير مكتملة.");
      if(importedRoot)window.Naseej3D.clearExternalModel();
      treeNodes=[];selectedNode=null;
      const built=buildNode(result.root,result.meshes);
      importedRoot=built.group;sourceFile=file;
      if(!window.Naseej3D.addExternalModel(importedRoot))throw new Error("تعذر إدخال المجسم إلى لوحة 3D.");
      const box=new THREE.Box3().setFromObject(importedRoot),size=box.getSize(new THREE.Vector3());
      const info=$("cadModelInfo");info.textContent="الملف: "+file.name+" | الصيغة: "+ext.toUpperCase()+" | الأبعاد التقريبية: "+formatMm(size.x)+" × "+formatMm(size.y)+" × "+formatMm(size.z)+" | عدد الأجزاء المسماة: "+treeNodes.length+" | عدد الأسطح: "+importedRoot.children.length;
      const tree=$("cadAssemblyTree");tree.replaceChildren();renderTree([built.record],tree);
      $("cadFitBtn").disabled=false;$("cadClearBtn").disabled=false;
      status("تم استيراد الملف وعرض هندسته الأصلية بنجاح. يمكنك فتح/إخفاء الأجزاء من شجرة التجميع.","success");
    }catch(error){console.error("CAD import failed",error);status("تعذر الاستيراد: "+(error&&error.message?error.message:String(error)),"error");}
  }
  function clear(){
    if(window.Naseej3D&&window.Naseej3D.clearExternalModel)window.Naseej3D.clearExternalModel();
    importedRoot=null;sourceFile=null;selectedNode=null;treeNodes=[];
    $("cadAssemblyTree").innerHTML='<span class="catalog-footnote">شجرة الأجزاء ستظهر هنا بعد الاستيراد.</span>';
    $("cadModelInfo").textContent="";$("cadFitBtn").disabled=true;$("cadClearBtn").disabled=true;
    status("تمت إزالة الملف المستورد.");
  }
  function init(){
    const input=$("cadImportInput");if(!input)return;
    input.addEventListener("change",event=>{const file=event.target.files&&event.target.files[0];importFile(file);event.target.value="";});
    $("cadClearBtn").addEventListener("click",clear);
    $("cadFitBtn").addEventListener("click",()=>{if(!importedRoot)return;const box=new THREE.Box3().setFromObject(importedRoot),size=box.getSize(new THREE.Vector3());window.Naseej3D.objectCenter.copy(box.getCenter(new THREE.Vector3()));window.Naseej3D.maxDim=Math.max(size.x,size.y,size.z,300);window.Naseej3D.renderView(window.Naseej3D.lastState||{angle:35,pitch:24,zoom:1,panX:0,panY:0});});
    const stage=document.querySelector(".model-stage");
    if(stage&&typeof MutationObserver!=="undefined"){const observer=new MutationObserver(()=>{if(window.Naseej3D&&window.Naseej3D.available){observer.disconnect();}});observer.observe(stage,{childList:true});}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();