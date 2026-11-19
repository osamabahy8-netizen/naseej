"use strict";
(function(){
  const $=id=>document.getElementById(id);
  const DB_NAME="naseej-cad-projects",DB_VERSION=1,STORE="projects";
  let parserPromise=null,importedRoot=null,sourceFile=null,selectedNode=null,treeNodes=[],activeProject=null,explodeAmount=0;
  const status=(message,state="")=>{const el=$("cadImportStatus");if(el){el.textContent=message;el.dataset.state=state;}};
  const dbOpen=()=>new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("هذا المتصفح لا يدعم قاعدة بيانات الملفات المحلية."));return;}
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("تعذر فتح قاعدة بيانات المشروعات."));
  });
  async function dbPut(record){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(record);tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>{db.close();reject(tx.error);};});}
  async function dbGetAll(){const db=await dbOpen();return new Promise((resolve,reject)=>{const req=db.transaction(STORE,"readonly").objectStore(STORE).getAll();req.onsuccess=()=>{db.close();resolve(req.result||[]);};req.onerror=()=>{db.close();reject(req.error);};});}
  async function dbGet(id){const db=await dbOpen();return new Promise((resolve,reject)=>{const req=db.transaction(STORE,"readonly").objectStore(STORE).get(id);req.onsuccess=()=>{db.close();resolve(req.result||null);};req.onerror=()=>{db.close();reject(req.error);};});}
  function uid(){return "cad-"+Date.now()+"-"+Math.random().toString(36).slice(2,9);}
  function flattenTriplets(value){if(!Array.isArray(value))return [];if(value.length&&Array.isArray(value[0]))return value.flatMap(v=>v.slice(0,3));return value;}
  function meshGeometry(source){
    const geometry=new THREE.BufferGeometry(),position=flattenTriplets(source.attributes&&source.attributes.position&&source.attributes.position.array);
    if(!position.length)throw new Error("ملف CAD لم يحتوِ على بيانات سطح قابلة للعرض.");
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(position,3));
    const normals=flattenTriplets(source.attributes&&source.attributes.normal&&source.attributes.normal.array);
    if(normals.length===position.length)geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
    const indices=flattenTriplets(source.index&&source.index.array);
    geometry.setIndex(indices.length?indices:Array.from({length:position.length/3},(_,i)=>i));
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
  }
  function colorOf(mesh){const c=Array.isArray(mesh.color)?mesh.color:[.72,.76,.8];return new THREE.Color(...c.map(v=>Math.max(0,Math.min(1,v))));}
  function buildNode(node,meshes,parentPath=""){
    const group=new THREE.Group();group.name=String(node.name||"جزء بدون اسم");group.userData.cadNodeId="cad-"+treeNodes.length;
    const record={id:group.userData.cadNodeId,name:group.name,group,parentPath,children:[],meshCount:0};
    treeNodes.push(record);
    (node.meshes||[]).forEach(index=>{const source=meshes[index];if(!source)return;const geometry=meshGeometry(source),material=new THREE.MeshStandardMaterial({color:colorOf(source),metalness:.38,roughness:.34,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.name=String(source.name||("Mesh "+index));mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.cadNodeId=record.id;group.add(mesh);record.meshCount++;});
    (node.children||[]).forEach(child=>{const built=buildNode(child,meshes,record.id);group.add(built.group);record.children.push(built.record);});
    return {group,record};
  }
  function mm(n){return Number.isFinite(n)?(Math.round(n*100)/100).toLocaleString("en-US")+" مم":"—";}
  function boxFor(object){object.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(object);}
  function dimensions(object){const box=boxFor(object),size=box.getSize(new THREE.Vector3());return {x:size.x,y:size.y,z:size.z,center:box.getCenter(new THREE.Vector3())};}
  function setMeasure(record){
    const d=dimensions(record.group),el=$("cadSelectedMeasure");
    el.textContent=record.name+" — العرض X: "+mm(d.x)+" | الارتفاع Y: "+mm(d.y)+" | العمق Z: "+mm(d.z)+" | مركز الجزء: "+mm(d.center.x)+", "+mm(d.center.y)+", "+mm(d.center.z);
  }
  function selectRecord(record,button,host){
    selectedNode=record.id;host.querySelectorAll(".cad-tree-node").forEach(el=>el.classList.remove("active"));button.classList.add("active");setMeasure(record);
    const d=dimensions(record.group),api=window.Naseej3D;api.objectCenter.copy(d.center);api.maxDim=Math.max(d.x,d.y,d.z,80);api.renderView(api.lastState||{angle:35,pitch:24,zoom:1,panX:0,panY:0});
  }
  function renderTree(records,host,depth=0){
    records.forEach(record=>{
      const row=document.createElement("div");row.className="cad-tree-row";row.style.marginRight=(depth*8)+"px";
      const choose=document.createElement("button");choose.type="button";choose.className="cad-tree-node";choose.textContent=record.name+(record.meshCount?" · "+record.meshCount+" سطح":"");choose.title=record.name;
      choose.addEventListener("click",()=>selectRecord(record,choose,host));
      const toggle=document.createElement("button");toggle.type="button";toggle.className="cad-tree-toggle";toggle.textContent=record.group.visible?"إخفاء":"إظهار";
      toggle.addEventListener("click",()=>{record.group.visible=!record.group.visible;toggle.textContent=record.group.visible?"إخفاء":"إظهار";row.classList.toggle("cad-tree-muted",!record.group.visible);});
      row.append(choose,toggle);host.appendChild(row);
      if(record.children.length){const children=document.createElement("div");children.className="cad-tree-children";host.appendChild(children);renderTree(record.children,children,depth+1);}
    });
  }
  function setActionState(on){["cadFitBtn","cadSaveProjectBtn","cadDownloadSourceBtn","cadExportBomBtn","cadExportProjectBtn","cadClearBtn","cadExplodeRange","cadResetExplodeBtn"].forEach(id=>{const el=$(id);if(el)el.disabled=!on;});}
  function applyExplode(amount){
    if(!importedRoot)return;explodeAmount=Math.max(0,Math.min(100,Number(amount)||0));
    const rootBox=boxFor(importedRoot),center=rootBox.getCenter(new THREE.Vector3());
    const maxGap=Math.max(rootBox.getSize(new THREE.Vector3()).length()*.34,80)*explodeAmount/100;
    const spread=(record,depth)=>{
      record.group.position.set(0,0,0);
      const b=boxFor(record.group),c=b.getCenter(new THREE.Vector3()),v=c.sub(center);
      if(v.length()<.001)v.set((depth%3)-1,depth%2?.5:0,1);
      v.normalize().multiplyScalar(maxGap*(depth===0?1:Math.min(.28,depth*.08)));
      record.group.position.copy(v);
      record.children.forEach(child=>spread(child,depth+1));
    };
    treeNodes.filter(r=>!r.parentPath).forEach(r=>spread(r,0));
    const value=$("cadExplodeValue");if(value)value.textContent=explodeAmount+"%";
    if(window.Naseej3D&&window.Naseej3D.renderView)window.Naseej3D.renderView(window.Naseej3D.lastState||{angle:35,pitch:24,zoom:1,panX:0,panY:0});
    if(selectedNode){const record=treeNodes.find(r=>r.id===selectedNode);if(record)setMeasure(record);}
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function safeName(name){return String(name||"naseej-cad-project").replace(/[\\/:*?"<>|]+/g,"-").slice(0,90);}
  function collectBOM(){
    return treeNodes.map((r,index)=>{const d=dimensions(r.group);return {number:index+1,name:r.name,parent:r.parentPath||"الجذر",meshCount:r.meshCount,children:r.children.length,width:d.x,height:d.y,depth:d.z};});
  }
  function exportBOM(){
    const rows=collectBOM(),head=["رقم","اسم الجزء","التجميعة الأم","عدد الأسطح","عدد التجميعات الفرعية","العرض مم","الارتفاع مم","العمق مم"];
    const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    const csv="\uFEFF"+[head,...rows.map(r=>[r.number,r.name,r.parent,r.meshCount,r.children,r.width.toFixed(2),r.height.toFixed(2),r.depth.toFixed(2)])].map(row=>row.map(quote).join(",")).join("\r\n");
    downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),safeName(activeProject&&activeProject.name)+ "-BOM.csv");
  }
  function projectData(){
    const rows=collectBOM(),d=importedRoot?dimensions(importedRoot):{x:0,y:0,z:0};
    return {format:"NaseejCADProject",version:1,project:{id:activeProject&&activeProject.id,name:activeProject&&activeProject.name,sourceFile:sourceFile&&sourceFile.name,sourceFormat:sourceFile&&sourceFile.name.split(".").pop().toUpperCase(),savedAt:new Date().toISOString(),units:"mm",dimensions:{width:d.x,height:d.y,depth:d.z},parts:rows,assemblyTree:serializeTree(treeNodes),explodePercent:explodeAmount},note:"ملف بيانات المشروع لا يحتوي على هندسة CAD الثنائية؛ استخدم تنزيل ملف CAD الأصلي لحفظ المصدر الهندسي."};
  }
  function serializeTree(records){return records.map(r=>({name:r.name,meshCount:r.meshCount,children:serializeTree(r.children)}));}
  function exportProject(){downloadBlob(new Blob([JSON.stringify(projectData(),null,2)],{type:"application/json"}),safeName(activeProject&&activeProject.name)+".naseej.json");}
  function downloadSource(){if(!sourceFile)return;downloadBlob(sourceFile,safeName(sourceFile.name));}
  async function saveProject(){
    if(!sourceFile||!importedRoot)return;
    const name=prompt("اسم مشروع نسيج:",activeProject&&activeProject.name||sourceFile.name.replace(/\.[^.]+$/,""));
    if(name===null)return;
    const clean=name.trim();if(!clean){status("اكتب اسمًا للمشروع قبل الحفظ.","error");return;}
    const id=activeProject&&activeProject.id||uid(),record={id,name:clean,fileName:sourceFile.name,fileType:sourceFile.name.split(".").pop().toLowerCase(),blob:sourceFile,lastModified:sourceFile.lastModified,size:sourceFile.size,savedAt:new Date().toISOString(),project:projectData()};
    try{await dbPut(record);activeProject={id,name:clean};status("تم حفظ المشروع وملف CAD الأصلي محليًا على هذا الجهاز. يمكنك إغلاق الصفحة والعودة إليه لاحقًا.","success");}
    catch(error){status("تعذر حفظ المشروع: "+(error.message||error)+" — قد تكون مساحة الجهاز غير كافية.","error");}
  }
  async function restoreProject(record){
    if(!record||!record.blob)return;
    const file=new File([record.blob],record.fileName||"restored.step",{type:record.blob.type||"application/octet-stream",lastModified:record.lastModified||Date.now()});
    await importFile(file,{restoring:true,projectRecord:record});
  }
  async function importFile(file,options={}){
    if(!file)return;
    if(!window.Naseej3D||!window.Naseej3D.available){status("مرسم WebGL غير جاهز. افتح قسم الرسم ثلاثي الأبعاد وانتظر ظهور لوحة الرسم ثم أعد المحاولة.","error");return;}
    const ext=(file.name.split(".").pop()||"").toLowerCase(),method=ext==="step"||ext==="stp"?"ReadStepFile":ext==="iges"||ext==="igs"?"ReadIgesFile":ext==="brep"?"ReadBrepFile":null;
    if(!method){status("امتداد الملف غير مدعوم. اختر STEP أو STP أو IGES أو IGS أو BREP.","error");return;}
    try{
      setActionState(false);status((options.restoring?"جاري استعادة المشروع: ":"جاري قراءة ملف CAD: ")+file.name+" …");
      if(!parserPromise){if(typeof window.occtimportjs!=="function")throw new Error("تعذر تحميل محرك استيراد CAD. تحقق من اتصال الإنترنت.");parserPromise=window.occtimportjs();}
      const parser=await parserPromise,bytes=new Uint8Array(await file.arrayBuffer());
      const result=parser[method](bytes,{linearUnit:"millimeter",linearDeflectionType:"bounding_box_ratio",linearDeflection:.08,angularDeflection:.35});
      if(!result||!result.success||!result.root||!Array.isArray(result.meshes))throw new Error("تعذر قراءة بنية الملف الهندسية. تحقق من سلامة الملف وصيغته.");
      if(importedRoot)window.Naseej3D.clearExternalModel();
      treeNodes=[];selectedNode=null;const built=buildNode(result.root,result.meshes);importedRoot=built.group;sourceFile=file;
      if(!window.Naseej3D.addExternalModel(importedRoot))throw new Error("تعذر إدخال المجسم إلى لوحة 3D.");
      activeProject=options.projectRecord?{id:options.projectRecord.id,name:options.projectRecord.name}:null;
      const d=dimensions(importedRoot),info=$("cadModelInfo");
      info.textContent="الملف: "+file.name+" | الأبعاد الكلية: "+mm(d.x)+" × "+mm(d.y)+" × "+mm(d.z)+" | عدد الأجزاء: "+treeNodes.length+" | الوحدات المعروضة: مم";
      const tree=$("cadAssemblyTree");tree.replaceChildren();renderTree([built.record],tree);
      setActionState(true);$("cadExplodeRange").value="0";applyExplode(0);
      if(options.restoring&&options.projectRecord&&options.projectRecord.project&&Number(options.projectRecord.project.explodePercent)>0){$("cadExplodeRange").value=options.projectRecord.project.explodePercent;applyExplode(options.projectRecord.project.explodePercent);}
      status(options.restoring?"تمت استعادة المشروع من ذاكرة هذا الجهاز.":"تم استيراد الملف. احفظه كمشروع للاحتفاظ بنسخة محلية دائمة.","success");
    }catch(error){console.error("CAD project operation failed",error);status("تعذر إكمال العملية: "+(error&&error.message?error.message:String(error)),"error");}
  }
  function clear(){
    if(window.Naseej3D&&window.Naseej3D.clearExternalModel)window.Naseej3D.clearExternalModel();
    importedRoot=null;sourceFile=null;selectedNode=null;treeNodes=[];activeProject=null;explodeAmount=0;
    $("cadAssemblyTree").innerHTML='<span class="catalog-footnote">شجرة الأجزاء ستظهر هنا بعد الاستيراد.</span>';$("cadModelInfo").textContent="";$("cadSelectedMeasure").textContent="اختر جزءًا من الشجرة لعرض أبعاده.";
    $("cadExplodeRange").value="0";$("cadExplodeValue").textContent="0%";setActionState(false);status("تمت إزالة الملف من المشهد. النسخة المحفوظة في المشروعات المحلية لم تُحذف.");
  }
  async function offerRestore(){
    try{const records=await dbGetAll();if(!records.length)return;
      records.sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
      const latest=records[0],choice=confirm("يوجد مشروع CAD محفوظ باسم «"+latest.name+"». هل تريد استعادته الآن؟");
      if(choice)await restoreProject(latest);
      else status("يوجد "+records.length+" مشروع CAD محفوظ محليًا. استورد ملفًا أو استعد المشروع لاحقًا من هذه الصفحة.");
    }catch(error){status("تعذر فحص المشروعات المحفوظة: "+(error.message||error),"error");}
  }
  function init(){
    const input=$("cadImportInput");if(!input)return;
    input.addEventListener("change",event=>{const file=event.target.files&&event.target.files[0];importFile(file);event.target.value="";});
    $("cadClearBtn").addEventListener("click",clear);$("cadSaveProjectBtn").addEventListener("click",saveProject);
    $("cadDownloadSourceBtn").addEventListener("click",downloadSource);$("cadExportBomBtn").addEventListener("click",exportBOM);$("cadExportProjectBtn").addEventListener("click",exportProject);
    $("cadFitBtn").addEventListener("click",()=>{if(!importedRoot)return;const d=dimensions(importedRoot),api=window.Naseej3D;api.objectCenter.copy(d.center);api.maxDim=Math.max(d.x,d.y,d.z,300);api.renderView(api.lastState||{angle:35,pitch:24,zoom:1,panX:0,panY:0});});
    $("cadExplodeRange").addEventListener("input",event=>applyExplode(event.target.value));
    $("cadResetExplodeBtn").addEventListener("click",()=>{$("cadExplodeRange").value="0";applyExplode(0);});
    const wait=()=>{if(window.Naseej3D&&window.Naseej3D.available){offerRestore();return;}setTimeout(wait,350);};setTimeout(wait,350);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();