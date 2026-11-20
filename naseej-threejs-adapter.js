/*
 * Naseej Phase 2 JSON -> existing Three.js modelObjects adapter.
 * Source axes: X=width, Y=depth, Z=up (millimetres).
 * Viewer axes: X=width, Y=up, Z=depth. Viewer y is the bottom/base position.
 * This adapter preserves source dimensions and transforms for auditability.
 * Preview geometry only; not production CAD or structural verification.
 */
(function (root) {
  "use strict";

  function number(value, fallback=0) {
    const n=Number(value);
    return Number.isFinite(n)?n:fallback;
  }
  function vector(value, fallback=[0,0,0], label="vector") {
    if(value==null)return fallback.slice();
    if(!Array.isArray(value)||value.length!==3||!value.every(v=>Number.isFinite(Number(v))))
      throw new Error("Invalid "+label+"; expected three numeric values");
    return value.map(Number);
  }
  function profileSize(profile) {
    const text=String(profile||"");
    const match=text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/i);
    if(match)return [Number(match[1]),Number(match[2]),Number(match[3]||0)];
    const thickness=text.match(/(?:sheet|board|glass)_(\d+(?:\.\d+)?)\s*mm/i);
    // Levelling feet are simplified as square preview solids using their nominal thread size.
    const foot=text.match(/^M(8|10)_foot$/i);
    if(foot){const nominal=Number(foot[1]);return [nominal,nominal,0];}
    return [0,0,thickness?Number(thickness[1]):0];
  }
  function materialColor(material,finish) {
    const key=String(material||"").toLowerCase(),coat=String(finish||"").toLowerCase();
    if(coat.includes("ral9005")||coat.includes("black"))return "#252a31";
    if(coat.includes("white")||coat.includes("ral9010"))return "#e7e8e5";
    if(key.includes("glass"))return "#8ed7ed";
    if(key.includes("mdf")||key.includes("wood")||key.includes("laminate"))return "#a8794b";
    if(key.includes("aluminium")||key.includes("aluminum")||key.includes("stainless"))return "#b7c2ce";
    if(key.includes("acrylic"))return "#b8e4f2";
    if(key.includes("steel"))return "#9aa8b5";
    return "#c49a55";
  }
  function classifyPart(part) {
    const id=String(part.part_id||"").toUpperCase();
    const name=String(part.name||"");
    if(/^(UPR|LEG|POST|PILLAR|FOOT)/.test(id)||/upright|vertical post|\bleg\b|قائم|رجل/i.test(name))
      return "vertical-profile";
    if(number(part.width)>0 && number(part.height)>0)
      return "sheet-or-panel";
    return "linear-profile";
  }
  function partToViewerObject(part) {
    const id=String(part.part_id||"");
    const name=String(part.name||id||"Part");
    const profile=String(part.profile_or_sheet||"");
    const [a,b,wall]=profileSize(profile);
    const position=vector(part.position,[0,0,0],"position");
    const rotation=vector(part.rotation,[0,0,0],"rotation");
    const orientation=classifyPart(part);
    let w,h,d;
    if(number(part.length)>0){
      if(!(a>0&&b>0))throw new Error("Part "+id+" is missing a confirmed profile section in profile_or_sheet");
      if(orientation==="vertical-profile"){w=a;h=number(part.length);d=b;}
      else{w=number(part.length);h=b;d=a;}
    }else if(number(part.width)>0 && number(part.height)>0){
      if(!(wall>0))throw new Error("Part "+id+" is missing a confirmed sheet thickness in profile_or_sheet");
      const thickness=wall;
      const verticalPanel=/^(BACK|PANEL|KICK)/i.test(id)||/back panel|side panel|kick plate|لوح خلفي/i.test(name);
      w=number(part.width);
      if(verticalPanel){h=number(part.height);d=thickness;}
      else{h=thickness;d=number(part.height);}
    }else{
      throw new Error("Part "+id+" has no usable length or width/height dimensions");
    }
    const cx=position[0],cy=position[1],cz=position[2];
    const mass=Number(part.mass_kg);
    return {
      id:id,label:name,type:"box",profile:profile,
      material:part.material||"unspecified",color:materialColor(part.material,part.finish),
      quantity:number(part.quantity,1)||1,
      massKg:Number.isFinite(mass)?mass:null,
      x:cx,y:cz-h/2,z:cy,w:w,h:h,d:d,
      rx:-rotation[0],ry:-rotation[2],rz:-rotation[1],
      thickness:wall||0,
      cutLength:number(part.length)>0?number(part.length):0,
      componentSpec:String(part.notes||""),
      sourceDimensions:{length:number(part.length),width:number(part.width),height:number(part.height),profileWidth:a,profileHeight:b,wallThickness:wall},
      sourcePosition:position.slice(),sourceRotation:rotation.slice(),
      orientationClass:orientation
    };
  }
  function sourceParts(product) {
    return product&&product.geometry&&Array.isArray(product.geometry.parts)
      ?product.geometry.parts
      :product&&Array.isArray(product.parts)?product.parts:[];
  }
  function auditProduct(product) {
    const parts=sourceParts(product);
    if(!parts.length)throw new Error("No product parts were found in this JSON file");
    const unit=String(product&&product.meta&&product.meta.unit||"mm").toLowerCase();
    if(unit!=="mm"&&unit!=="millimeter"&&unit!=="millimetre")
      throw new Error("Unsupported unit '"+unit+"'; the current viewer expects millimetres (mm)");
    const rows=parts.map(part=>{
      const object=partToViewerObject(part);
      const qty=number(part.quantity,1);
      if(!object.id)throw new Error("Every part must have a non-empty part_id");
      if(!(qty>0))throw new Error("Part "+object.id+" has an invalid quantity");
      if(![object.x,object.y,object.z,object.w,object.h,object.d,...object.sourceRotation].every(Number.isFinite)||object.w<=0||object.h<=0||object.d<=0)
        throw new Error("Invalid dimensions or transform for part "+object.id);
      return {id:object.id,name:object.label,orientation:object.orientationClass,source:object.sourceDimensions,viewer:{width:object.w,height:object.h,depth:object.d},position:object.sourcePosition,rotation:object.sourceRotation,quantity:qty};
    });
    const ids=rows.map(row=>row.id);
    if(new Set(ids).size!==ids.length)throw new Error("Part IDs must be unique; duplicate ID found");
    const parameters=product&&product.parameters||{};
    // Product families use different parameter names; normalize them for the viewer audit.
    const declaredSize={
      width:number(parameters.width,number(parameters.main_width,number(parameters.bay_width))),
      height:number(parameters.height,number(parameters.counter_height)),
      depth:number(parameters.depth,number(parameters.main_depth,number(parameters.shelf_depth)))
    };
    return {
      unit:"mm",partCount:rows.length,quantityTotal:rows.reduce((sum,row)=>sum+row.quantity,0),
      declaredSize,
      rows:rows
    };
  }
  function toViewerObjects(product) {
    const audit=auditProduct(product);
    const objects=sourceParts(product).map(partToViewerObject);
    if(!objects.length)throw new Error("No product parts were found in this JSON file");
    return objects;
  }
  const api={partToViewerObject,toViewerObjects,auditProduct};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.NaseejThreeJSAdapter=api;
})(typeof window!=="undefined"?window:globalThis);
