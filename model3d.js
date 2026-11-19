"use strict";
(function(){
  const api={available:false,canvas:null,renderer:null,scene:null,camera:null,root:null,raycaster:null,pointer:null,meshes:[],target:null,lastState:null,bounds:null,objectCenter:null,maxDim:600};
  if(typeof THREE==="undefined"||!THREE.WebGLRenderer){window.Naseej3D=api;return;}
  function makeMaterial(color,selected){
    return new THREE.MeshStandardMaterial({color:color||"#c49a55",metalness:.58,roughness:.34,emissive:selected?new THREE.Color("#123c58"):new THREE.Color("#000000"),emissiveIntensity:selected ? .55 : 0});
  }
  function clearGroup(group){
    while(group.children.length){
      const child=group.children[group.children.length-1];
      group.remove(child);
      child.traverse?.(node=>{if(node.geometry)node.geometry.dispose();if(node.material){if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());else node.material.dispose();}});
    }
  }
  function init(canvas){
    try{
      api.canvas=canvas;
      const mobile=window.matchMedia&&window.matchMedia("(max-width: 900px)").matches;
      api.renderer=new THREE.WebGLRenderer({canvas,antialias:!mobile,alpha:false,powerPreference:"high-performance",depth:true,stencil:false});
      api.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1:1.5));
      api.renderer.setClearColor("#07111e",1);
      api.renderer.outputColorSpace=THREE.SRGBColorSpace;
      api.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      api.renderer.toneMappingExposure=1.15;
      api.scene=new THREE.Scene();
      api.scene.background=new THREE.Color("#07111e");
      api.scene.fog=new THREE.Fog("#07111e",5000,18000);
      api.camera=new THREE.PerspectiveCamera(38,1,1,50000);
      api.root=new THREE.Group();api.scene.add(api.root);
      api.raycaster=new THREE.Raycaster();api.pointer=new THREE.Vector2();
      api.scene.add(new THREE.HemisphereLight("#d9ecff","#182638",2.0));
      const key=new THREE.DirectionalLight("#fff0d4",3.2);key.position.set(1800,2600,1800);api.scene.add(key);
      const fill=new THREE.DirectionalLight("#5bbcff",1.8);fill.position.set(-1800,900,-1200);api.scene.add(fill);
      const rim=new THREE.PointLight("#238bd1",900000,9000);rim.position.set(0,1200,-1600);api.scene.add(rim);
      const grid=new THREE.GridHelper(8000,32,"#4c9bd4","#31516f");grid.position.y=-1;grid.material.transparent=true;grid.material.opacity=.28;api.scene.add(grid);
      const axes=new THREE.AxesHelper(1100);axes.position.set(0,2,0);api.scene.add(axes);
      api.available=true;
      const resize=()=>{if(!api.renderer||!api.canvas)return;const rect=api.canvas.getBoundingClientRect();const w=Math.max(1,rect.width),h=Math.max(1,rect.height);api.renderer.setSize(w,h,false);api.camera.aspect=w/h;api.camera.updateProjectionMatrix();if(api.lastState)render(api.lastState);};
      if(typeof ResizeObserver!=="undefined"){api.resizeObserver=new ResizeObserver(resize);api.resizeObserver.observe(canvas);}else window.addEventListener("resize",resize);
      resize();
      return true;
    }catch(error){console.warn("Naseej 3D renderer unavailable; using the drawing fallback.",error);api.available=false;return false;}
  }
  function render(state){
    if(!api.available||!api.renderer)return false;
    api.lastState=state;
    const objects=Array.isArray(state.objects)?state.objects:[];
    const signature=JSON.stringify({objects,explodedView:!!state.explodedView,explodeOffsets:state.explodeOffsets||{},assemblyGuideOn:!!state.assemblyGuideOn,assemblyStep:state.assemblyStep||0,selectedId:state.selectedId||null});
    const rebuild=signature!==api.geometrySignature;
    if(rebuild){clearGroup(api.root);api.meshes=[];}
    const center=objects.length?objects.reduce((v,o)=>[v[0]+Number(o.x||0)/objects.length,v[1]+(Number(o.y||0)+Number(o.h||0)/2)/objects.length,v[2]+Number(o.z||0)/objects.length],[0,0,0]):[0,0,0];
    const visible=state.assemblyGuideOn?objects.slice(0,Math.max(1,Math.min(objects.length,state.assemblyStep+1))):objects;
    const rendered=visible.map((o,index)=>{
      if(!state.explodedView)return o;
      let dx=o.x-center[0],dy=o.y+o.h/2-center[1],dz=o.z-center[2],len=Math.hypot(dx,dy,dz);
      if(len<1){dx=(index%3)-1;dy=Math.floor(index/3)%2?.6:0;dz=1;len=Math.hypot(dx,dy,dz);}
      const gap=Math.max(90,Math.min(260,Math.max(o.w,o.h,o.d)*.22)),extra=state.explodeOffsets?.[o.id]||{x:0,y:0,z:0};
      return {...o,x:o.x+dx/len*gap+(extra.x||0),y:o.y+dy/len*gap+(extra.y||0),z:o.z+dz/len*gap+(extra.z||0)};
    });
    if(rebuild)rendered.forEach(o=>{
      const w=Math.max(1,Number(o.w)||1),h=Math.max(1,Number(o.h)||1),d=Math.max(1,Number(o.d)||1);
      let geometry;
      if(o.type==="cylinder"){
        const radius=Math.max(1,Math.min(w,d)/2);
        geometry=new THREE.CylinderGeometry(radius,radius,h,64,1,false);
      }else{
        geometry=new THREE.BoxGeometry(w,h,d,1,1,1);
      }
      const selected=o.id===state.selectedId;
      const mesh=new THREE.Mesh(geometry,makeMaterial(o.color,selected));
      mesh.position.set(Number(o.x)||0,(Number(o.y)||0)+h/2,Number(o.z)||0);
      mesh.rotation.set((Number(o.rx)||0)*Math.PI/180,(Number(o.ry)||0)*Math.PI/180,(Number(o.rz)||0)*Math.PI/180,"XYZ");
      mesh.userData.objectId=o.id;
      mesh.castShadow=true;mesh.receiveShadow=true;
      api.root.add(mesh);api.meshes.push(mesh);
      const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:selected?"#8bdcff":"#a9c9e7",transparent:true,opacity:selected ? .95 : .55}));
      edge.position.copy(mesh.position);edge.rotation.copy(mesh.rotation);edge.userData.objectId=o.id;api.root.add(edge);
    });
    if(rebuild)api.geometrySignature=signature;
    if(rebuild||!api.bounds){
      api.bounds=new THREE.Box3().setFromObject(api.root);
      const size=api.bounds.isEmpty()?new THREE.Vector3(600,300,400):api.bounds.getSize(new THREE.Vector3());
      api.objectCenter=api.bounds.isEmpty()?new THREE.Vector3(0,150,0):api.bounds.getCenter(new THREE.Vector3());
      api.maxDim=Math.max(size.x,size.y,size.z,300);
    }
    return renderView(state);
  }
  function renderView(state){
    if(!api.available||!api.renderer||!api.camera||!api.objectCenter)return false;
    const objectCenter=api.objectCenter,maxDim=api.maxDim;
    const panX=Number(state.panX)||0,panY=Number(state.panY)||0;
    const target=new THREE.Vector3(objectCenter.x-panX*maxDim/500,objectCenter.y+panY*maxDim/500,objectCenter.z);
    api.target.copy(target);
    const angle=(Number.isFinite(Number(state.angle))?Number(state.angle):35)*Math.PI/180;
    const pitch=Math.max(5,Math.min(85,Number.isFinite(Number(state.pitch))?Number(state.pitch):24))*Math.PI/180;
    const zoom=Math.max(.35,Math.min(5,Number.isFinite(Number(state.zoom))?Number(state.zoom):1));
    const distance=maxDim*2.25/zoom;
    api.camera.position.set(target.x+Math.cos(angle)*Math.cos(pitch)*distance,target.y+Math.sin(pitch)*distance,target.z+Math.sin(angle)*Math.cos(pitch)*distance);
    api.camera.lookAt(target);
    api.renderer.render(api.scene,api.camera);
    return true;
  }
  function pickTarget(event,canvas){
    if(!api.available||!api.camera||!api.meshes.length)return null;
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    api.pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
    api.raycaster.setFromCamera(api.pointer,api.camera);
    const hits=api.raycaster.intersectObjects(api.meshes,false);
    if(!hits.length)return null;
    const id=hits[0].object.userData.objectId;
    return {getAttribute:name=>name==="data-object-id"?id:null};
  }
  api.init=init;api.render=render;api.renderView=renderView;api.pickTarget=pickTarget;
  window.Naseej3D=api;
})();