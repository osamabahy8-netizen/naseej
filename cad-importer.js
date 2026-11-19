"use strict";
(function(){
  const $=id=>document.getElementById(id);
  const DB_NAME="naseej-cad-projects",DB_VERSION=1,STORE="projects";
  let parserPromise=null,importedRoot=null,sourceFile=null,selectedNode=null,treeNodes=[],activeProject=null,explodeAmount=0,assemblyCenter=null,assemblySize=null,selectedMeshes=[],measureMode=false,measurePoints=[],measureObjects=[];
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
  function setHighlight(meshes){
    selectedMeshes.forEach(mesh=>{if(!mesh.material)return;const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];mats.forEach(mat=>{if(mat.emissive){mat.emissive.set(0x000000);mat.emissiveIntensity=0;}});});
    selectedMeshes=meshes||[];
    selectedMeshes.forEach(mesh=>{if(!mesh.material)return;const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];mats.forEach(mat=>{if(mat.emissive){mat.emissive.set(0x174d70);mat.emissiveIntensity=.8;}});});
  }
  function setMeasure(record){
    const d=dimensions(record.group),el=$("cadSelectedMeasure");
    el.textContent=record.name+" — العرض X: "+mm(d.x)+" | الارتفاع Y: "+mm(d.y)+" | العمق Z: "+mm(d.z)+" | مركز الجزء: "+mm(d.center.x)+", "+mm(d.center.y)+", "+mm(d.center.z);
  }
  function selectRecord(record,button,host){
    selectedNode=record.id;const chosen=[];record.group.traverse(node=>{if(node.isMesh)chosen.push(node);});setHighlight(chosen);host.querySelectorAll(".cad-tree-node").forEach(el=>el.classList.remove("active"));button.classList.add("active");setMeasure(record);
    const d=dimensions(record.group),api=window.Naseej3D;api.objectCenter.copy(d.center);api.maxDim=Math.max(d.x,d.y,d.z,80);api.renderView(api.lastState||{angle:35,pitch:24,zoom:1,panX:0,panY:0});
  }
  function renderTree(records,host,depth=0){
    records.forEach(record=>{
      const row=document.createElement("div");row.className="cad-tree-row";row.style.marginRight=(depth*8)+"px";
      const choose=document.createElement("button");choose.type="button";choose.className="cad-tree-node";choose.textContent=record.name+(record.meshCount?" · "+record.meshCount+" مجسم":"");choose.title=record.name;
      choose.addEventListener("click",()=>selectRecord(record,choose,host));
      const toggle=document.createElement("button");toggle.type="button";toggle.className="cad-tree-toggle";toggle.textContent=record.group.visible?"إخفاء":"إظهار";
      toggle.addEventListener("click",()=>{record.group.visible=!record.group.visible;toggle.textContent=record.group.visible?"إخفاء":"إظهار";row.classList.toggle("cad-tree-muted",!record.group.visible);});
      row.append(choose,toggle);host.appendChild(row);
      if(record.children.length){const children=document.createElement("div");children.className="cad-tree-children";host.appendChild(children);renderTree(record.children,children,depth+1);}
    });
  }
  function setActionState(on){["cadFitBtn","cadSaveProjectBtn","cadDownloadSourceBtn","cadExportBomBtn","cadExportProjectBtn","cadExportObjBtn","cadExportGlbBtn","cadMeasureModeBtn","cadClearMeasureBtn","cadClearBtn","cadExplodeRange","cadResetExplodeBtn"].forEach(id=>{const el=$(id);if(el)el.disabled=!on;});}
  function applyExplode(amount){
    if(!importedRoot)return;explodeAmount=Math.max(0,Math.min(100,Number(amount)||0));
    const rootBox=boxFor(importedRoot),center=assemblyCenter||rootBox.getCenter(new THREE.Vector3());
    const maxGap=Math.max((assemblySize||rootBox.getSize(new THREE.Vector3())).length()*.34,80)*explodeAmount/100;
    treeNodes.forEach(record=>record.group.position.set(0,0,0));
    treeNodes.filter(r=>r.parentPath).forEach(record=>{
      const v=(record.baseCenter||center.clone()).clone().sub(center);
      if(v.length()<.001)v.set((treeNodes.indexOf(record)%3)-1,treeNodes.indexOf(record)%2?.5:0,1);
      let depth=1,parent=record.parentPath;while(parent){const ancestor=treeNodes.find(item=>item.id===parent);if(!ancestor)break;depth++;parent=ancestor.parentPath;}
      v.normalize().multiplyScalar(maxGap*Math.max(.12,1-Math.min(depth*.12,.72)));
      record.group.position.copy(v);
    });
    const value=$("cadExplodeValue");if(value)value.textContent=explodeAmount+"%";
    if(window.Naseej3D&&window.Naseej3D.renderView)window.Naseej3D.renderView(window.Naseej3D.lastState||{angle:35,pitch:24,zoom:1,panX:0,panY:0});
    if(selectedNode){const record=treeNodes.find(r=>r.id===selectedNode);if(record)setMeasure(record);}
  }
  function exportOBJ(){
    if(!importedRoot)return;
    importedRoot.updateMatrixWorld(true);
    let output="# Naseej CAD export - millimeters\\n",vertexOffset=1;
    importedRoot.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.visible)return;
      const geometry=mesh.geometry,index=geometry.index,position=geometry.attributes.position;
      if(!position)return;
      output+="o "+String(mesh.name||"CAD_Part").replace(/[^\\w.-]+/g,"_")+"\\n";
      const matrix=mesh.matrixWorld;
      for(let i=0;i<position.count;i++){const v=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix);output+="v "+v.x.toFixed(5)+" "+v.y.toFixed(5)+" "+v.z.toFixed(5)+"\\n";}
      if(index){for(let i=0;i<index.count;i+=3)output+="f "+(vertexOffset+index.getX(i))+" "+(vertexOffset+index.getX(i+1))+" "+(vertexOffset+index.getX(i+2))+"\\n";}
      else{for(let i=0;i<position.count;i+=3)output+="f "+(vertexOffset+i)+" "+(vertexOffset+i+1)+" "+(vertexOffset+i+2)+"\\n";}
      vertexOffset+=position.count;
    });
    downloadBlob(new Blob([output],{type:"text/plain;charset=utf-8"}),safeName(activeProject&&activeProject.name)+".obj");
  }
  function exportGLB(){
    if(!importedRoot)return;
    importedRoot.updateMatrixWorld(true);
    const chunks=[],views=[],accessors=[],materials=[],meshes=[],nodes=[];
    let byteOffset=0;
    const append=(typed,target)=>{
      const pad=(4-byteOffset%4)%4;if(pad){chunks.push(new Uint8Array(pad));byteOffset+=pad;}
      const bytes=new Uint8Array(typed.buffer,typed.byteOffset,typed.byteLength),offset=byteOffset;
      chunks.push(new Uint8Array(bytes));byteOffset+=bytes.byteLength;
      const view={buffer:0,byteOffset:offset,byteLength:bytes.byteLength};if(target)view.target=target;
      views.push(view);return views.length-1;
    };
    const addAccessor=(view,componentType,type,count,min,max)=>{
      const item={bufferView:view,componentType,type,count};if(min)item.min=min;if(max)item.max=max;
      accessors.push(item);return accessors.length-1;
    };
    importedRoot.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.visible)return;
      const source=mesh.geometry,position=source.attributes.position;if(!position)return;
      const world=mesh.matrixWorld,normalMatrix=new THREE.Matrix3().getNormalMatrix(world);
      const positions=[],normals=[],bounds=new THREE.Box3();
      for(let i=0;i<position.count;i++){
        const v=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(world);
        positions.push(v.x,v.y,v.z);bounds.expandByPoint(v);
      }
      const normal=source.attributes.normal;
      if(normal){for(let i=0;i<normal.count;i++){const n=new THREE.Vector3().fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();normals.push(n.x,n.y,n.z);}}
      else{const temp=source.clone();temp.computeVertexNormals();const nAttr=temp.attributes.normal;for(let i=0;i<nAttr.count;i++){const n=new THREE.Vector3().fromBufferAttribute(nAttr,i).applyMatrix3(normalMatrix).normalize();normals.push(n.x,n.y,n.z);}temp.dispose();}
      const indices=source.index?Array.from(source.index.array):Array.from({length:position.count},(_,i)=>i);
      const pView=append(new Float32Array(positions),34962),nView=append(new Float32Array(normals),34962),iView=append(new Uint32Array(indices),34963);
      const min=bounds.min.toArray(),max=bounds.max.toArray();
      const pAcc=addAccessor(pView,5126,"VEC3",position.count,min,max),nAcc=addAccessor(nView,5126,"VEC3",position.count),iAcc=addAccessor(iView,5125,"SCALAR",indices.length);
      const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
      const color=material&&material.color?material.color:new THREE.Color(.72,.76,.8);
      const matIndex=materials.length;
      materials.push({name:(material&&material.name)||"CAD Material",pbrMetallicRoughness:{baseColorFactor:[color.r,color.g,color.b,1],metallicFactor:material&&Number.isFinite(material.metalness)?material.metalness:.25,roughnessFactor:material&&Number.isFinite(material.roughness)?material.roughness:.45},doubleSided:true});
      meshes.push({name:mesh.name||"CAD Part",primitives:[{attributes:{POSITION:pAcc,NORMAL:nAcc},indices:iAcc,material:matIndex,mode:4}]});
      nodes.push({name:mesh.name||"CAD Part",mesh:meshes.length-1});
    });
    if(!meshes.length){status("لا توجد أسطح ظاهرة لتصديرها.","error");return;}
    const binaryLength=byteOffset,padBin=(4-binaryLength%4)%4;if(padBin){chunks.push(new Uint8Array(padBin));byteOffset+=padBin;}
    const binary=new Uint8Array(byteOffset);let cursor=0;chunks.forEach(chunk=>{binary.set(chunk,cursor);cursor+=chunk.length;});
    const gltf={asset:{version:"2.0",generator:"Naseej CAD Exporter"},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,accessors,bufferViews:views,buffers:[{byteLength:binaryLength}]};
    let jsonBytes=new TextEncoder().encode(JSON.stringify(gltf));const jsonPad=(4-jsonBytes.length%4)%4;if(jsonPad){const padded=new Uint8Array(jsonBytes.length+jsonPad);padded.fill(0x20);padded.set(jsonBytes);jsonBytes=padded;}
    const total=12+8+jsonBytes.length+8+binary.length,glb=new ArrayBuffer(total),dv=new DataView(glb);
    dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);
    dv.setUint32(12,jsonBytes.length,true);dv.setUint32(16,0x4e4f534a,true);new Uint8Array(glb,20,jsonBytes.length).set(jsonBytes);
    const binHeader=20+jsonBytes.length;dv.setUint32(binHeader,binary.length,true);dv.setUint32(binHeader+4,0x004e4942,true);new Uint8Array(glb,binHeader+8,binary.length).set(binary);
    downloadBlob(new Blob([glb],{type:"model/gltf-binary"}),safeName(activeProject&&activeProject.name)+".glb");
  }
  function clearMeasure(){
    measureObjects.forEach(object=>{if(object.parent)object.parent.remove(object);object.geometry&&object.geometry.dispose();if(object.material)object.material.dispose();});
    measureObjects=[];measurePoints=[];
    $("cadSelectedMeasure").textContent="اختر جزءًا من الشجرة لعرض أبعاده.";
    $("cadClearMeasureBtn").disabled=!importedRoot;
  }
  function showDistance(a,b){
    clearMeasure();
    const geometry=new THREE.BufferGeometry().setFromPoints([a,b]),line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xffc56e,depthTest:false}));
    line.renderOrder=999;window.Naseej3D.scene.add(line);measureObjects.push(line);
    [a,b].forEach(point=>{const marker=new THREE.Mesh(new THREE.SphereGeometry(Math.max((assemblySize||new THREE.Vector3(100,100,100)).length()*.008,2),12,8),new THREE.MeshBasicMaterial({color:0xffc56e,depthTest:false}));marker.position.copy(point);marker.renderOrder=1000;window.Naseej3D.scene.add(marker);measureObjects.push(marker);});
    const distance=a.distanceTo(b);
    $("cadSelectedMeasure").textContent="قياس المسافة بين النقطتين: "+mm(distance)+" | ΔX: "+mm(Math.abs(a.x-b.x))+" | ΔY: "+mm(Math.abs(a.y-b.y))+" | ΔZ: "+mm(Math.abs(a.z-b.z));
    if(window.Naseej3D.lastState)window.Naseej3D.renderView(window.Naseej3D.lastState);
  }
  function pickExternal(event,canvas){
    const api=window.Naseej3D;if(!api||!api.camera||!api.raycaster||!api.externalMeshes.length)return null;
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    api.pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
    api.raycaster.setFromCamera(api.pointer,api.camera);
    return api.raycaster.intersectObjects(api.externalMeshes,false)[0]||null;
  }
  function activateCanvasPicking(){
    const drawing=$("modelDrawing");if(!drawing||drawing.dataset.cadPicking==="true")return;
    drawing.dataset.cadPicking="true";
    let start=null,moved=false;
    drawing.addEventListener("pointerdown",event=>{start={x:event.clientX,y:event.clientY,id:event.pointerId};moved=false;},true);
    drawing.addEventListener("pointermove",event=>{if(start&&start.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>7)moved=true;},true);
    drawing.addEventListener("pointerup",event=>{
      if(!start||start.id!==event.pointerId)return;
      const wasMoved=moved;start=null;if(wasMoved||!importedRoot)return;
      const hit=pickExternal(event,drawing);if(!hit)return;
      if(measureMode){
        measurePoints.push(hit.point.clone());
        if(measurePoints.length===1){$("cadSelectedMeasure").textContent="تم تحديد النقطة الأولى. المس النقطة الثانية على المجسم.";}
        if(measurePoints.length===2){showDistance(measurePoints[0],measurePoints[1]);measureMode=false;$("cadMeasureModeBtn").textContent="قياس بين نقطتين";}
        return;
      }
      const id=hit.object.userData.cadNodeId,record=treeNodes.find(item=>item.id===id);if(!record)return;
      selectedNode=id;setHighlight([hit.object]);setMeasure(record);
      $("cadAssemblyTree").querySelectorAll(".cad-tree-node").forEach(button=>button.classList.toggle("active",button.title===record.name));
    },true);
    drawing.addEventListener("pointercancel",()=>{start=null;moved=false;},true);
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function safeName(name){return String(name||"naseej-cad-project").replace(/[\\/:*?"<>|]+/g,"-").slice(0,90);}
  function collectBOM(){
    return treeNodes.map((r,index)=>{const d=dimensions(r.group);return {number:index+1,name:r.name,parent:(treeNodes.find(p=>p.id===r.parentPath)?.name)||"الجذر",meshCount:r.meshCount,children:r.children.length,width:d.x,height:d.y,depth:d.z};});
  }
  function exportBOM(){
    const rows=collectBOM(),head=["رقم","اسم الجزء","التجميعة الأم","عدد المجسمات","عدد التجميعات الفرعية","العرض مم","الارتفاع مم","العمق مم"];
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
    const id=activeProject&&activeProject.id||uid(),details=projectData();details.project.id=id;details.project.name=clean;const record={id,name:clean,fileName:sourceFile.name,fileType:sourceFile.name.split(".").pop().toLowerCase(),blob:sourceFile,lastModified:sourceFile.lastModified,size:sourceFile.size,savedAt:new Date().toISOString(),project:details};
    try{await dbPut(record);activeProject={id,name:clean};status("تم حفظ المشروع وملف CAD الأصلي محليًا على هذا الجهاز. يمكنك إغلاق الصفحة والعودة إليه لاحقًا.","success");await refreshProjectList();}
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
      treeNodes=[];selectedNode=null;const built=buildNode(result.root,result.meshes);importedRoot=built.group;sourceFile=file;clearMeasure();setHighlight([]);const originalBounds=boxFor(importedRoot);assemblyCenter=originalBounds.getCenter(new THREE.Vector3());assemblySize=originalBounds.getSize(new THREE.Vector3());treeNodes.forEach(record=>{record.baseCenter=boxFor(record.group).getCenter(new THREE.Vector3());});
      if(!window.Naseej3D.addExternalModel(importedRoot))throw new Error("تعذر إدخال المجسم إلى لوحة 3D.");
      activeProject=options.projectRecord?{id:options.projectRecord.id,name:options.projectRecord.name}:null;
      const d=dimensions(importedRoot),info=$("cadModelInfo");
      info.textContent="الملف: "+file.name+" | الأبعاد الكلية: "+mm(d.x)+" × "+mm(d.y)+" × "+mm(d.z)+" | عدد الأجزاء: "+treeNodes.length+" | الوحدات المعروضة: مم";
      const tree=$("cadAssemblyTree");tree.replaceChildren();renderTree([built.record],tree);
      setActionState(true);$("cadExplodeRange").value="0";applyExplode(0);activateCanvasPicking();
      if(options.restoring&&options.projectRecord&&options.projectRecord.project&&Number(options.projectRecord.project.explodePercent)>0){$("cadExplodeRange").value=options.projectRecord.project.explodePercent;applyExplode(options.projectRecord.project.explodePercent);}
      status(options.restoring?"تمت استعادة المشروع من ذاكرة هذا الجهاز.":"تم استيراد الملف. احفظه كمشروع للاحتفاظ بنسخة محلية دائمة.","success");
    }catch(error){console.error("CAD project operation failed",error);status("تعذر إكمال العملية: "+(error&&error.message?error.message:String(error)),"error");}
  }
  function clear(){
    if(window.Naseej3D&&window.Naseej3D.clearExternalModel)window.Naseej3D.clearExternalModel();
    importedRoot=null;sourceFile=null;selectedNode=null;treeNodes=[];activeProject=null;explodeAmount=0;assemblyCenter=null;assemblySize=null;
    $("cadAssemblyTree").innerHTML='<span class="catalog-footnote">شجرة الأجزاء ستظهر هنا بعد الاستيراد.</span>';$("cadModelInfo").textContent="";$("cadSelectedMeasure").textContent="اختر جزءًا من الشجرة لعرض أبعاده.";
    $("cadExplodeRange").value="0";$("cadExplodeValue").textContent="0%";setActionState(false);status("تمت إزالة الملف من المشهد. النسخة المحفوظة في المشروعات المحلية لم تُحذف.");
  }
  async function refreshProjectList(){
    const select=$("cadSavedProjects");if(!select)return [];
    const records=await dbGetAll();records.sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
    select.replaceChildren();
    if(!records.length){const option=document.createElement("option");option.value="";option.textContent="لا توجد مشروعات محفوظة";select.appendChild(option);}
    records.forEach(record=>{const option=document.createElement("option");option.value=record.id;option.textContent=record.name+" — "+record.fileName;select.appendChild(option);});
    $("cadRestoreProjectBtn").disabled=!records.length;
    return records;
  }
  async function restoreSelectedProject(){
    const id=$("cadSavedProjects").value;if(!id)return;
    try{const record=await dbGet(id);if(!record){status("لم نعثر على المشروع المحدد.","error");return;}await restoreProject(record);}
    catch(error){status("تعذرت استعادة المشروع: "+(error.message||error),"error");}
  }
  async function offerRestore(){
    try{
      const records=await refreshProjectList();if(!records.length)return;
      const latest=records[0],choice=confirm("يوجد "+records.length+" مشروع CAD محفوظ. هل تريد استعادة أحدث مشروع: «"+latest.name+"»؟ يمكنك اختيار أي مشروع آخر من القائمة.");
      if(choice)await restoreProject(latest);
      else status("تم العثور على "+records.length+" مشروع CAD محفوظ. اختر المشروع المطلوب من القائمة.");
    }catch(error){status("تعذر فحص المشروعات المحفوظة: "+(error.message||error),"error");}
  }
  function init(){
    const input=$("cadImportInput");if(!input)return;
    input.addEventListener("change",event=>{const file=event.target.files&&event.target.files[0];importFile(file);event.target.value="";});
    $("cadClearBtn").addEventListener("click",clear);$("cadSaveProjectBtn").addEventListener("click",saveProject);$("cadRestoreProjectBtn").addEventListener("click",restoreSelectedProject);
    $("cadDownloadSourceBtn").addEventListener("click",downloadSource);$("cadExportObjBtn").addEventListener("click",exportOBJ);$("cadExportGlbBtn").addEventListener("click",exportGLB);$("cadMeasureModeBtn").addEventListener("click",()=>{measureMode=!measureMode;measurePoints=[];$("cadMeasureModeBtn").textContent=measureMode?"إلغاء وضع القياس":"قياس بين نقطتين";$("cadSelectedMeasure").textContent=measureMode?"المس النقطة الأولى على المجسم ثم النقطة الثانية.":"تم إيقاف وضع القياس."});$("cadClearMeasureBtn").addEventListener("click",clearMeasure);$("cadExportBomBtn").addEventListener("click",exportBOM);$("cadExportProjectBtn").addEventListener("click",exportProject);
    $("cadFitBtn").addEventListener("click",()=>{if(!importedRoot)return;const d=dimensions(importedRoot),api=window.Naseej3D;api.objectCenter.copy(d.center);api.maxDim=Math.max(d.x,d.y,d.z,300);api.renderView(api.lastState||{angle:35,pitch:24,zoom:1,panX:0,panY:0});});
    $("cadExplodeRange").addEventListener("input",event=>applyExplode(event.target.value));
    $("cadResetExplodeBtn").addEventListener("click",()=>{$("cadExplodeRange").value="0";applyExplode(0);});
    const wait=()=>{if(window.Naseej3D&&window.Naseej3D.available){activateCanvasPicking();offerRestore();return;}setTimeout(wait,350);};setTimeout(wait,350);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();