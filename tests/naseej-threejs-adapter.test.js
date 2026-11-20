"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {partToViewerObject,toViewerObjects}=require("../naseej-threejs-adapter.js");

test("maps Phase 2 centre coordinates into Naseej viewer base coordinates",()=>{
  const part=partToViewerObject({
    part_id:"UPR-FL",name:"Upright FL",profile_or_sheet:"30x30x1.5",
    length:1000,quantity:1,material:"S235_steel",mass_kg:1.23,
    position:[50,20,500],rotation:[0,0,0]
  });
  assert.equal(part.x,50);
  assert.equal(part.y,0);
  assert.equal(part.z,20);
  assert.equal(part.w,30);
  assert.equal(part.h,1000);
  assert.equal(part.d,30);
  assert.equal(part.massKg,1.23);
});

test("converts source Z rotation into the viewer Y rotation with the correct sign",()=>{
  const part=partToViewerObject({
    part_id:"BASE-X-L",name:"Base cross L",profile_or_sheet:"30x20x1.5",
    length:360,position:[-385,0,12.5],rotation:[0,0,90]
  });
  assert.equal(part.x,-385);
  assert.equal(part.y,2.5);
  assert.equal(part.z,0);
  assert.equal(part.ry,-90);
});

test("maps sheet thickness and dimensions without treating sheet length as a tube cut",()=>{
  const part=partToViewerObject({
    part_id:"SHELF-01",name:"Shelf plate",profile_or_sheet:"sheet_1.5mm",
    length:0,width:770,height:370,position:[0,0,200],rotation:[0,0,0]
  });
  assert.equal(part.w,770);
  assert.equal(part.h,1.5);
  assert.equal(part.d,370);
  assert.equal(part.cutLength,0);
  assert.equal(part.thickness,1.5);
});

test("rejects empty and duplicate part IDs",()=>{
  assert.throws(()=>toViewerObjects({parts:[{name:"No ID",length:100}]}),/unique, non-empty/);
  assert.throws(()=>toViewerObjects({parts:[
    {part_id:"A",length:100},{part_id:"A",length:100}
  ]}),/unique, non-empty/);
});

test("accepts the normalized frontend payload shape",()=>{
  const result=toViewerObjects({geometry:{parts:[
    {part_id:"A",name:"Part A",length:100,profile_or_sheet:"20x20x1.2",position:[0,0,50]}
  ]}});
  assert.equal(result.length,1);
  assert.equal(result[0].h,100);
});
