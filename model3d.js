"use strict";
(function(){
  const api={available:false,canvas:null,renderer:null,scene:null,camera:null,root:null,raycaster:null,pointer:null,meshes:[],target:null,lastState:null,bounds:null,objectCenter:null,maxDim:600};
  if(typeof THREE==="undefined"||!THREE.WebGLRenderer){window.Naseej3D=api;return;}
  function makeMaterial(color,selected){
    return new THREE.MeshStandardMaterial({color:color||"#c49a55",metalness:.58,roughness:.27,emissive:selected?new THREE.Color("#123c58"):new THREE.Color("#000000"),emissiveIntensity:selected ? .55 : 0});
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
      api.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance",depth:true,stencil:false});
      api.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.75:2));
      api.renderer.setClearColor("#07111e",1);
      api.renderer.outputColorSpace=THREE.SRGBColorSpace;
      api.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      api.renderer.toneMappingExposure=1.15;
      api.scene=new THREE.Scene();
      api.scene.background=new THREE.Color("#07111e");
      api.scene.fog=new THREE.Fog("#07111e",5000,18000);
      api.camera=new THREE.PerspectiveCamera(38,1,1,50000);
      api.target=new THREE.Vector3();
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

  function roundedPlanform(width,depth,corner){
    const s=new THREE.Shape(),x=width/2,z=depth/2,r=Math.min(corner,x,z);
    s.moveTo(-x+r,-z);s.lineTo(x-r,-z);s.quadraticCurveTo(x,-z,x,-z+r);
    s.lineTo(x,z-r);s.quadraticCurveTo(x,z,x-r,z);s.lineTo(-x+r,z);
    s.quadraticCurveTo(-x,z,-x,z-r);s.lineTo(-x,-z+r);s.quadraticCurveTo(-x,-z,-x+r,-z);
    return s;
  }
  function extrudedPlanform(width,depth,thickness,sweep=0){
    const s=new THREE.Shape(),x=width/2,z=depth/2;
    s.moveTo(-x*.82,-z);s.lineTo(x*.82,-z);s.lineTo(x-sweep,z*.72);s.lineTo(-x+sweep,z*.72);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(2,thickness),bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:Math.min(4,thickness*.16),bevelThickness:Math.min(3,thickness*.14),curveSegments:10});
    g.translate(0,0,-thickness/2);g.rotateX(Math.PI/2);g.computeVertexNormals();return g;
  }
  function roundedBodyGeometry(width,depth,height){
    const g=new THREE.ExtrudeGeometry(roundedPlanform(width,depth,Math.min(width,depth)*.13),{depth:height,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:Math.min(12,height*.12),bevelThickness:Math.min(8,height*.1),curveSegments:12});
    g.translate(0,0,-height/2);g.rotateX(Math.PI/2);g.computeVertexNormals();return g;
  }
  function partMaterial(color,metalness=.45,roughness=.3,transparent=false,opacity=1){
    return new THREE.MeshStandardMaterial({color,metalness,roughness,transparent,opacity});
  }
  function buildPart(o){
    const group=new THREE.Group(),label=String(o.label||""),profile=String(o.profile||"");
    const w=Math.max(2,Number(o.w)||20),h=Math.max(2,Number(o.h)||20),d=Math.max(2,Number(o.d)||20);
    const x=Number(o.x)||0,y=Number(o.y)||0,z=Number(o.z)||0;
    const car=/(سيارة|بودي|هيكل خارجي|شاسيه|دريفت|إطار|عجلة)/.test(label);
    const plane=/(طائرة|جناح|ذيل أفقي|ذيل رأسي|جسم الطائرة|مروحة أمامية|مروحة دافعة)/.test(label);
    const body=/بودي|هيكل خارجي/.test(label)&&car;
    const tire=/(عجلة|إطار|إطارات)/.test(label)&&car;
    const fuselage=/جسم الطائرة/.test(label);
    const wing=/جناح/.test(label)||/ذيل أفقي/.test(label);
    const fin=/ذيل رأسي/.test(label);
    const prop=/مروحة/.test(label)&&plane;
    const add=(geometry,material,px=x,py=y+h/2,pz=z,rx=0,ry=0,rz=0)=>{
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(px,py,pz);mesh.rotation.set(rx,ry,rz);
      mesh.userData.objectId=o.id;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);api.meshes.push(mesh);return mesh;
    };
    if(fuselage){
      const length=Math.max(w,d),radius=Math.max(8,Math.min(h,d)*.48);
      const points=[new THREE.Vector2(2,-length/2),new THREE.Vector2(radius*.42,-length*.44),new THREE.Vector2(radius*.82,-length*.30),new THREE.Vector2(radius,-length*.08),new THREE.Vector2(radius*.94,length*.22),new THREE.Vector2(radius*.62,length*.40),new THREE.Vector2(2,length/2)];
      const g=new THREE.LatheGeometry(points,32);g.rotateX(Math.PI/2);
      add(g,partMaterial(o.color||"#e7edf2",.18,.48));
      const canopy=new THREE.SphereGeometry(radius*.62,24,12,0,Math.PI*2,0,Math.PI*.5);
      canopy.scale(.9,.55,Math.max(1,length*.19/radius));add(canopy,partMaterial("#3c7898",.32,.2,.25,.88),x,y+h*.78,z-length*.08);
    }else if(wing){
      add(extrudedPlanform(w,d,h,Math.min(w*.12,d*.28)),partMaterial(o.color||"#e7edf2",.16,.42));
      if(/جناح/.test(label)){
        const ribMat=partMaterial("#b8c7d3",.12,.6);
        for(let n=-2;n<=2;n++)add(new THREE.BoxGeometry(Math.max(2,w*.006),Math.max(2,h*.22),Math.max(3,d*.78)),ribMat,x+n*w*.16,y+h*.53,z);
      }
    }else if(fin){
      const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w*.38,-h/2);s.lineTo(w*.18,h*.48);s.lineTo(-w*.12,h/2);s.closePath();
      const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSegments:2,bevelSize:2,bevelThickness:2});g.translate(0,0,-d/2);
      add(g,partMaterial(o.color||"#e7edf2",.15,.42));
    }else if(prop){
      const hub=add(new THREE.CylinderGeometry(Math.max(4,h*.55),Math.max(4,h*.55),d,24),partMaterial("#aeb9c5",.72,.22),x,y+h/2,z);
      const bladeMat=partMaterial("#202a36",.35,.25);
      for(let n=0;n<2;n++){const blade=new THREE.BoxGeometry(Math.max(4,w*.46),Math.max(3,h*.32),Math.max(5,d*.22));add(blade,bladeMat,x+(n===0?-w*.23:w*.23),y+h/2,z,0,0,n===0?-.18:.18);}
    }else if(body){
      let paint=o.color||"#176db2";if(paint==="#252a31")paint="#176db2";
      add(roundedBodyGeometry(w,d,h),partMaterial(paint,.72,.22));
      const roofW=w*.56,roofD=d*.46,roofH=h*.5;
      add(roundedBodyGeometry(roofW,roofD,roofH),partMaterial("#102d45",.42,.18,.18,.92),x,y+h*.72,z+d*.015);
      const glass=partMaterial("#8dc6e4",.48,.16,true,.48);
      add(new THREE.BoxGeometry(roofW*.86,roofH*.52,roofD*.82),glass,x,y+h*.78,z+d*.015);
      const bumperMat=partMaterial("#aab5c0",.78,.24);
      add(new THREE.BoxGeometry(w*.72,h*.16,Math.max(8,d*.08)),bumperMat,x,y+h*.18,z-d*.48);
      add(new THREE.BoxGeometry(w*.72,h*.16,Math.max(8,d*.08)),bumperMat,x,y+h*.18,z+d*.48);
      const lampMat=partMaterial("#f7e9ba",.25,.18);
      for(const side of [-1,1])add(new THREE.BoxGeometry(w*.12,h*.12,Math.max(4,d*.035)),lampMat,x+side*w*.31,y+h*.47,z-d*.43);
    }else if(tire){
      const radius=Math.max(5,Math.min(w,d)*.49),width=Math.max(5,h);
      const rubber=partMaterial("#171d25",.08,.88);
      add(new THREE.CylinderGeometry(radius,radius,width,48,1,false),rubber,x,y+h/2,z,0,0,Math.PI/2);
      const rimMat=partMaterial("#b8c5d1",.82,.22);
      add(new THREE.CylinderGeometry(radius*.64,radius*.64,width*1.04,40),rimMat,x,y+h/2,z,0,0,Math.PI/2);
      add(new THREE.CylinderGeometry(radius*.23,radius*.23,width*1.1,32),partMaterial("#46596a",.8,.2),x,y+h/2,z,0,0,Math.PI/2);
      const ring=new THREE.TorusGeometry(radius*.79,Math.max(1,radius*.045),8,40);add(ring,partMaterial("#303b47",.12,.78),x,y+h/2,z,0,Math.PI/2,0);
    }else{
      let geometry;
      if(o.type==="cylinder")geometry=new THREE.CylinderGeometry(Math.max(1,Math.min(w,d)/2),Math.max(1,Math.min(w,d)/2),h,48,1,false);
      else geometry=new THREE.BoxGeometry(w,h,d,1,1,1);
      add(geometry,partMaterial(o.color||"#c49a55",.58,.27),x,y+h/2,z,(Number(o.rx)||0)*Math.PI/180,(Number(o.ry)||0)*Math.PI/180,(Number(o.rz)||0)*Math.PI/180);
    }
    group.userData.objectId=o.id;api.root.add(group);return group;
  }
  function render(state){
    if(!api.available||!api.renderer)return false;
    api.lastState=state;
    const objects=Array.isArray(state.objects)?state.objects:[];
    const signature=JSON.stringify({objects,explodedView:!!state.explodedView,explodeOffsets:state.explodeOffsets||{},assemblyGuideOn:!!state.assemblyGuideOn,assemblyStep:state.assemblyStep||0});
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
    if(rebuild)rendered.forEach(o=>{buildPart(o);});
    if(rebuild)api.geometrySignature=signature;
    api.meshes.forEach(mesh=>{const selected=mesh.userData.objectId===state.selectedId;if(mesh.material&&mesh.material.emissive){mesh.material.emissive.set(selected?"#123c58":"#000000");mesh.material.emissiveIntensity=selected?.38:0;}});
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