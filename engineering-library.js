(() => {
  "use strict";
  const host=document.getElementById("modelView");
  if(!host)return;
  const panel=document.createElement("section");
  panel.className="panel engineering-library";
  panel.id="engineeringLibrary";
  panel.innerHTML='<div class="engineering-library-head"><div><span class="eyebrow">مصادر الشركات والمصانع</span><h3>مكتبة المنتجات الهندسية الأصلية</h3><p>كتالوجات ومصادر ملفات CAD الحقيقية. الصين أولًا، ثم أمريكا، ثم روسيا، مع فصل الملفات القابلة للتنزيل عن الملفات التي تحتاج طلبًا أو ترخيصًا.</p></div><span class="engineering-library-version">المكتبة 1.0</span></div><div class="engineering-library-tools"><input id="engineeringLibrarySearch" type="search" placeholder="ابحث عن شركة أو منتج أو صيغة ملف"><select id="engineeringLibraryRegion" aria-label="تصفية حسب الدولة"><option value="all">كل المصادر</option><option value="china">الصين أولًا</option><option value="usa">الولايات المتحدة</option><option value="russia">روسيا</option><option value="global">مصادر دولية</option></select><select id="engineeringLibraryAccess" aria-label="تصفية حسب طريقة الحصول"><option value="all">كل طرق الحصول</option><option value="download">تنزيل مباشر</option><option value="request">طلب من المصنع</option><option value="account">يتطلب حسابًا</option><option value="license">يتطلب ترخيصًا</option><option value="mixed">حسب الملف</option></select></div><div class="engineering-library-summary" id="engineeringLibrarySummary"></div><div class="engineering-library-grid" id="engineeringLibraryGrid"></div><p class="engineering-library-policy"></p>';
  const modelLayout=host.querySelector(".model-layout");
  if(modelLayout)host.insertBefore(panel,modelLayout);else host.prepend(panel);
  const $=id=>panel.querySelector("#"+id);
  const accessLabels={download:"تنزيل مباشر",request:"طلب CAD من المصنع",account:"يتطلب حسابًا",license:"ترخيص الاستخدام",mixed:"تختلف حسب الملف"};
  const regionLabels={china:"الصين",usa:"الولايات المتحدة",russia:"روسيا",global:"دولي"};
  let data=null;
  function render(){
    if(!data)return;
    const q=$("engineeringLibrarySearch").value.trim().toLowerCase();
    const region=$("engineeringLibraryRegion").value,access=$("engineeringLibraryAccess").value;
    const rows=data.sources.filter(s=>(region==="all"||s.region===region)&&(access==="all"||s.access===access)&&[s.company,s.category,...s.products,...s.formats,s.evidence].join(" ").toLowerCase().includes(q));
    $("engineeringLibrarySummary").textContent="عدد المصادر المعروضة: "+rows.length+" من "+data.sources.length+" — لا تُعتمد أي أبعاد للتصنيع قبل مراجعة ملف الشركة.";
    const grid=$("engineeringLibraryGrid");grid.replaceChildren();
    rows.forEach(s=>{
      const card=document.createElement("article");card.className="engineering-source-card";
      const top=document.createElement("div");top.className="engineering-source-top";
      const regionTag=document.createElement("span");regionTag.className="engineering-source-region";regionTag.textContent=regionLabels[s.region]||s.region;
      const accessTag=document.createElement("span");accessTag.className="engineering-source-access "+s.access;accessTag.textContent=accessLabels[s.access]||s.access;
      top.append(regionTag,accessTag);
      const title=document.createElement("h4");title.textContent=s.company;
      const category=document.createElement("p");category.className="engineering-source-category";category.textContent=s.category;
      const products=document.createElement("p");products.textContent="المنتجات: "+s.products.join("، ");
      const formats=document.createElement("div");formats.className="engineering-source-formats";
      s.formats.forEach(f=>{const chip=document.createElement("span");chip.textContent=f;formats.append(chip);});
      const evidence=document.createElement("p");evidence.className="engineering-source-evidence";evidence.textContent=s.evidence;
      if(Array.isArray(s.models)&&s.models.length){
        const modelWrap=document.createElement("div");modelWrap.className="engineering-model-list";
        const modelTitle=document.createElement("strong");modelTitle.textContent="موديلات منشورة من المصنع — الأبعاد بالملليمتر";modelWrap.append(modelTitle);
        s.models.forEach(m=>{
          const item=document.createElement("div");item.className="engineering-model-item";
          const name=document.createElement("span");name.textContent=m.code+" — "+m.name;
          const dims=document.createElement("span");dims.textContent=m.dimensions_mm.join(" × ")+" مم";
          item.append(name,dims);modelWrap.append(item);
        });
        card.append(modelWrap);
      }
      const link=document.createElement("a");link.className="button button-primary engineering-source-link";link.href=s.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=s.access==="request"?"فتح المصنع وطلب الملفات":"فتح المصدر الأصلي";
      const foot=document.createElement("small");foot.textContent="تم التحقق من صفحة المصدر: "+s.verified;
      card.append(top,title,category,products,formats,evidence,link,foot);grid.append(card);
    });
    if(!rows.length){const empty=document.createElement("p");empty.className="engineering-library-empty";empty.textContent="لا توجد نتائج مطابقة للبحث.";grid.append(empty);}
    $("engineeringLibraryPolicy").textContent=data.policy;
  }
  fetch("engineering-library.json?v=20261119a").then(r=>{if(!r.ok)throw new Error("catalog");return r.json();}).then(json=>{data=json;render();}).catch(()=>{$("engineeringLibrarySummary").textContent="تعذر تحميل فهرس المصادر. أعد فتح الصفحة بعد الاتصال بالإنترنت.";});
  ["engineeringLibrarySearch","engineeringLibraryRegion","engineeringLibraryAccess"].forEach(id=>$(id).addEventListener(id==="engineeringLibrarySearch"?"input":"change",render));
})();