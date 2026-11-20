/*
 * Naseej Phase 2 JSON -> existing Three.js modelObjects adapter.
 * Source axes: X=width, Y=depth, Z=up (millimetres).
 * Viewer axes: X=width, Y=up, Z=depth. Viewer y is the bottom/base position.
 * Preview geometry only; not production CAD or structural verification.
 */
(function (root) {
  "use strict";

  function profileSize(profile) {
    const text=String(profile||"");
    const match=text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/i);
    if(match)return [Number(match[1]),Number(match[2]),Number(match[3]||0)];
    const thickness=text.match(/(?:sheet|board|glass)_(\d+(?:\.\d+)?)\s*mm/i);
    return [0,0,thickness?Number(thickness[1]):0];
  }

  function materialColor(material) {
    const key=String(material||"").toLowerCase();
    if(key.includes("glass"))return "#8ed7ed";
    if(key.includes("mdf")||key.includes("wood")||key.includes("laminate"))return "#a8794b";
    if(key.includes("aluminium")||key.includes("aluminum"))return "#b7c2ce";
    if(key.includes("acrylic"))return "#b8e4f2";
    if(key.includes("stainless"))return "#c3ccd5";
    return "#c49a55";
  }

  function partToViewerObject(part) {
    const id=String(part.part_id||"");
    const name=String(part.name||id||"Part");
    const profile=String(part.profile_or_sheet||"");
    const [a,b,wall]=profileSize(profile);
    const position=Array.isArray(part.position)?part.position:[0,0,0];
    const rotation=Array.isArray(part.rotation)?part.rotation:[0,0,0];
    let w,h,d;

    if(Number(part.length)>0){
      const vertical=/^(UPR|LEG|FOOT)/i.test(id)||/upright|\bleg\b|قائم/i.test(name);
      if(vertical){w=a||20;h=Number(part.length);d=b||20;}
      else{w=Number(part.length);h=b||20;d=a||20;}
      if(/^FOOT/i.test(id)){w=Math.max(w,18);d=Math.max(d,18);}
    }else if(Number(part.width)>0){
      const thickness=wall||2;
      const verticalPanel=/^(BACK|PANEL|KICK)/i.test(id)||/back panel|side panel|kick plate|لوح خلفي/i.test(name);
      w=Number(part.width);
      if(verticalPanel){h=Number(part.height)||20;d=thickness;}
      else{h=thickness;d=Number(part.height)||20;}
    }else{
      w=20;h=20;d=20;
    }

    const cx=Number(position[0])||0;
    const cy=Number(position[1])||0;
    const cz=Number(position[2])||0;
    const mass=Number(part.mass_kg);
    return {
      id:id,label:name,type:"box",profile:profile,
      material:part.material||"unspecified",color:materialColor(part.material),
      quantity:Number(part.quantity)||1,
      massKg:Number.isFinite(mass)?mass:null,
      x:cx,y:cz-h/2,z:cy,w:w,h:h,d:d,
      rx:-(Number(rotation[0])||0),
      ry:-(Number(rotation[2])||0),
      rz:-(Number(rotation[1])||0),
      thickness:wall||0,
      cutLength:Number(part.length)>0?Number(part.length):0,
      componentSpec:String(part.notes||"")
    };
  }

  function toViewerObjects(product) {
    const source=product&&product.geometry&&Array.isArray(product.geometry.parts)
      ? product.geometry.parts
      : product&&Array.isArray(product.parts)?product.parts:[];
    const objects=source.map(partToViewerObject);
    const ids=objects.map(item=>item.id);
    if(!objects.length)throw new Error("No product parts were found in this JSON file");
    if(ids.some(id=>!id)||new Set(ids).size!==ids.length)throw new Error("Every part must have a unique, non-empty part_id");
    for(const item of objects){
      if(![item.x,item.y,item.z,item.w,item.h,item.d].every(Number.isFinite)||item.w<=0||item.h<=0||item.d<=0)
        throw new Error("Invalid preview geometry for part "+item.id);
    }
    return objects;
  }

  const api={partToViewerObject,toViewerObjects};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.NaseejThreeJSAdapter=api;
})(typeof window!=="undefined"?window:globalThis);
