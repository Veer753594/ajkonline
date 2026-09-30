const services=[
 {name:"Income Certificate",category:"Government",icon:"📄",price:"₹100",desc:"Apply for an income certificate through the centre."},
 {name:"Caste Certificate",category:"Government",icon:"🪪",price:"₹100",desc:"Assistance with caste certificate application."},
 {name:"Residence Certificate",category:"Government",icon:"🏠",price:"₹100",desc:"Apply for a residence/domicile certificate."},
 {name:"PAN Services",category:"Documents",icon:"💳",price:"From ₹150",desc:"PAN application and related assistance."},
 {name:"Online Form Filling",category:"Online Services",icon:"📝",price:"From ₹100",desc:"Professional online form filling assistance."},
 {name:"Education Forms",category:"Education",icon:"🎓",price:"From ₹150",desc:"Online education and examination form assistance."},
 {name:"Banking Assistance",category:"Banking",icon:"🏦",price:"As applicable",desc:"Digital banking and citizen-service assistance."},
 {name:"Photo & Document Printing",category:"Printing",icon:"🖨️",price:"From ₹5",desc:"Photo state, photo print and document print."},
 {name:"Transport Services",category:"Other",icon:"🚗",price:"As applicable",desc:"Online transport-related application assistance."}
];

const $=s=>document.querySelector(s);
const grid=$("#serviceGrid"), filters=$("#filters"), search=$("#serviceSearch"), toast=$("#toast");
const API_BASE=(window.AJK_CONFIG?.API_BASE||window.API_BASE||"/api").replace(/\/$/,"");
let backendAvailable=false;
let serviceCatalog=[];

function showToast(msg){
 toast.textContent=msg; toast.classList.add("show");
 clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove("show"),3000);
}
function populateApplicationServices(){
 const select=$("#applicationService");
 if(!select) return;
 select.innerHTML='<option value="">Select Service</option>'+serviceCatalog.map(s=>`<option value="${s.id}">${s.name}</option>`).join("");
}

async function loadServices(){
 // The public Netlify frontend must still show the service catalogue even when
 // the separate Node/PostgreSQL backend is not connected yet.
 try{
   const r=await fetch(`${API_BASE}/services`);
   const data=await r.json();
   if(!r.ok) throw new Error(data.error||"SERVICE_LOAD_FAILED");
   serviceCatalog=data.data||[];
   if(!serviceCatalog.length) throw new Error("EMPTY_SERVICE_CATALOG");
   backendAvailable=true;
   populateApplicationServices();
 }catch(err){
   // Fallback catalogue for the public website. These are display/demo IDs;
   // real application submission uses database service IDs when the backend is connected.
   backendAvailable=false;
   serviceCatalog=services.map((s,i)=>({
     id:`catalog-${i+1}`,
     name:s.name,
     description:s.desc,
     base_price:Number((s.price.match(/\d+/)||[0])[0]),
     status:"ACTIVE"
   }));
   populateApplicationServices();
 }
}

function renderFilters(){
 const cats=["All",...new Set(services.map(s=>s.category))];
 filters.innerHTML=cats.map((c,i)=>`<button class="filter-btn ${i===0?"active":""}" data-filter="${c}">${c}</button>`).join("");
 filters.addEventListener("click",e=>{
   const b=e.target.closest("[data-filter]"); if(!b)return;
   document.querySelectorAll(".filter-btn").forEach(x=>x.classList.remove("active")); b.classList.add("active");
   renderServices(b.dataset.filter,search.value);
 });
}
function renderServices(category="All",query=""){
 const q=query.trim().toLowerCase();
 const list=services.filter(s=>(category==="All"||s.category===category)&&(!q||`${s.name} ${s.category} ${s.desc}`.toLowerCase().includes(q)));
 grid.innerHTML=list.map(s=>`<article class="service-card"><span class="service-icon">${s.icon}</span><h3>${s.name}</h3><p>${s.desc}</p><div class="service-meta"><span class="price">${s.price}</span><button class="small-btn" data-service="${s.name}">Apply Now</button></div></article>`).join("");
 $("#serviceEmpty").hidden=list.length!==0;
}
renderFilters(); renderServices();

search.addEventListener("input",()=>{
 const active=$(".filter-btn.active")?.dataset.filter||"All"; renderServices(active,search.value);
});
grid.addEventListener("click",e=>{
 const b=e.target.closest("[data-service]");
 if(b){ const match=serviceCatalog.find(s=>s.name===b.dataset.service); if(match){$("#applicationService").value=match.id; document.querySelector("#apply")?.scrollIntoView({behavior:"smooth"});} else showToast(`${b.dataset.service} selected.`); }
});

function savePrintApplication(a){
  localStorage.setItem("AJK_PRINT_APPLICATION",JSON.stringify({service_number:a.service_number,token_number:a.token_number,customer_name:a.customer_name,customer_mobile:a.customer_mobile}));
  setPrintApplication(a.service_number,a.token_number);
}
function setPrintApplication(serviceNumber,tokenNumber){
  if(!serviceNumber||!tokenNumber)return;
  $("#printServiceNumber").value=serviceNumber;
  $("#printTokenNumber").value=tokenNumber;
  $("#printServiceNumberDisplay").textContent=serviceNumber;
  $("#printTokenNumberDisplay").textContent=tokenNumber;
  $("#printStartPanel").hidden=true;
  $("#printSessionBox").hidden=false;
}
function restorePrintApplication(){
  try{const saved=JSON.parse(localStorage.getItem("AJK_PRINT_APPLICATION")||"null");if(saved?.service_number&&saved?.token_number)setPrintApplication(saved.service_number,saved.token_number);}catch{}
}
$("#startPrintApplication").addEventListener("click",()=>{
  $("#applicationService").value=serviceCatalog.find(s=>s.name==="Photo & Document Printing")?.id||"";
  document.querySelector("#apply")?.scrollIntoView({behavior:"smooth",block:"start"});
  $("#customerName")?.focus();
});
$("#loadApprovedDocuments").addEventListener("click",async()=>{
  const {service_number,token_number}=printDetails(), msg=$("#printLookupMessage");
  if(!service_number||!token_number){msg.textContent="पहले Print Application submit करें।";return;}
  if(!backendAvailable){msg.textContent="Backend API connected नहीं है। पहले API connection configure करें।";return;}
  msg.textContent="Approved documents check हो रहे हैं...";
  try{
    const r=await fetch(`${API_BASE}/print-orders/available-documents`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service_number,token_number})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"LOOKUP_FAILED");
    const approved=(data.documents||[]).filter(d=>d.review_status==="APPROVED"), sel=$("#printFileId");
    sel.innerHTML=approved.length?'<option value="">Select approved document</option>'+approved.map(d=>`<option value="${d.id}">${d.original_name} • ${(d.file_size/1024/1024).toFixed(2)} MB</option>`).join(""):'<option value="">No approved document available</option>';
    $("#printOrderForm").hidden=!approved.length;$("#paymentBox").hidden=true;
    msg.textContent=approved.length?`${approved.length} approved document(s) available.`:"अभी कोई approved document नहीं है। Admin review के बाद फिर Load Approved Documents दबाएँ।";
  }catch(err){$("#printOrderForm").hidden=true;msg.textContent=err.message==="APPLICATION_NOT_FOUND"?"Application नहीं मिली। Saved Service Number/Token Number जाँचें।":"Documents load नहीं हुए। Backend connection जाँचें.";}
});

$("#applicationForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const msg=$("#applicationMessage"), out=$("#applicationResult"), upload=$("#documentUpload");
 const service_id=$("#applicationService").value, customer_name=$("#customerName").value.trim(), customer_mobile=$("#customerMobile").value.trim();
 if(!service_id||!customer_name||!/^[6-9]\d{9}$/.test(customer_mobile)){msg.textContent="Service, नाम और valid 10-digit mobile number दर्ज करें।";return;}
 if(!backendAvailable){msg.textContent="Backend API connected नहीं है। पहले API connection configure करें।";return;}
 msg.textContent="Application submit हो रही है...";
 try{
   const r=await fetch(`${API_BASE}/applications`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service_id,customer_name,customer_mobile})});
   const data=await r.json(); if(!r.ok) throw new Error(data.error||"SUBMIT_FAILED");
   const a=data.application;
   msg.textContent="Application successfully submitted.";
   out.hidden=false;
   out.innerHTML=`<strong>Application Submitted ✓</strong><p>Service Number: <b>${a.service_number}</b><br>Token Number: <b>${a.token_number}</b><br>Status: <b>${a.status}</b></p><small>इन दोनों numbers को सुरक्षित रखें। इन्हीं से Track Your Service और Document Upload किया जा सकता है।</small>`;
   $("#uploadServiceNumber").value=a.service_number;
   $("#uploadTokenNumber").value=a.token_number;
   if(a.service_name==="Photo & Document Printing") savePrintApplication(a);
   upload.hidden=false;
   $("#applicationForm").reset();
   upload.scrollIntoView({behavior:"smooth",block:"center"});
 }catch(err){msg.textContent=err.message==="SERVICE_NOT_FOUND"?"Selected service उपलब्ध नहीं है।":"Application submit नहीं हुई। कृपया दोबारा प्रयास करें।";}
});

$("#documentUploadForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const input=$("#documentFiles"), msg=$("#documentUploadMessage");
 const files=Array.from(input.files||[]);
 if(!files.length){msg.textContent="कम से कम एक document चुनें।";return;}
 if(files.length>5){msg.textContent="एक बार में अधिकतम 5 files upload करें।";return;}
 if(!backendAvailable){msg.textContent="Backend API connected नहीं है। पहले API connection configure करें।";return;}
 if(files.some(f=>f.size>10*1024*1024)){msg.textContent="हर file का size 10 MB या उससे कम होना चाहिए।";return;}
 msg.textContent="Documents upload हो रहे हैं...";
 const form=new FormData();
 form.append("service_number",$("#uploadServiceNumber").value);
 form.append("token_number",$("#uploadTokenNumber").value);
 files.forEach(f=>form.append("files",f));
 try{
   const r=await fetch(`${API_BASE}/documents`,{method:"POST",body:form});
   const data=await r.json(); if(!r.ok) throw new Error(data.error||"UPLOAD_FAILED");
   msg.textContent=`${data.documents.length} document(s) successfully uploaded. Centre team review करेगी.`;
   input.value="";
 }catch(err){msg.textContent=err.message==="APPLICATION_NOT_FOUND"?"Application नहीं मिली। Service Number और Token Number जाँचें।":"Document upload नहीं हुआ। File type/size जाँचें और दोबारा प्रयास करें।";}
});

$("#trackForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const serviceNumber=$("#serviceNumber").value.trim().toUpperCase();
 const token=$("#tokenNumber").value.trim();
 const msg=$("#trackMessage"), result=$("#trackingResult");
 if(!serviceNumber||!token){msg.textContent="Please enter both Service Number and Token Number."; return;}
 if(!/^AJK-\d{4}-[A-Z0-9]{5,}$/i.test(serviceNumber)){
   msg.textContent="Please enter a valid Service Number format, e.g. AJK-2026-12345."; result.hidden=true; return;
 }
 msg.textContent="Status check हो रहा है...";
 try{ const r=await fetch(`${API_BASE}/track`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service_number:serviceNumber,token_number:token})}); const data=await r.json(); if(!r.ok) throw new Error(data.error||"TRACK_FAILED");
   const a=data.application; result.hidden=false; result.innerHTML=`<strong>${a.service_name}</strong><p>Service Number: <b>${a.service_number}</b><br>Token Number: <b>${a.token_number}</b><br>Current Status: <b>${a.status.replaceAll("_"," ")}</b></p><div class="status-timeline">${a.history.map(h=>`<div><b>${h.new_status.replaceAll("_"," ")}</b><span>${new Date(h.created_at).toLocaleString("en-IN")}</span>${h.note?`<small>${h.note}</small>`:""}</div>`).join("")}</div>`; msg.textContent="Status updated.";
 }catch(err){ result.hidden=true; msg.textContent=err.message==="APPLICATION_NOT_FOUND"?"Application नहीं मिली। Service Number और Token Number जाँचें।":"Tracking service अभी उपलब्ध नहीं है।"; }
});


const printOrderForm=$("#printOrderForm"), paymentBox=$("#paymentBox");
let activePrintOrder=null;
function printDetails(){return {service_number:$("#printServiceNumber").value.trim().toUpperCase(),token_number:$("#printTokenNumber").value.trim()};}
printOrderForm.addEventListener("submit",async e=>{
 e.preventDefault();const msg=$("#printOrderMessage"), {service_number,token_number}=printDetails();const file_id=$("#printFileId").value;
 if(!file_id){msg.textContent="Approved document select करें।";return;} msg.textContent="Print order बनाया जा रहा है...";
 try{const body={service_number,token_number,file_id,print_type:$("#printType").value,color_mode:$("#printColor").value,copies:Number($("#printCopies").value),paper_size:$("#printPaper").value,paper_type:"Plain",duplex:$("#printDuplex").checked};const r=await fetch(`${API_BASE}/print-orders`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||"ORDER_FAILED");activePrintOrder=data.print_order;$("#printAmount").textContent=`₹${Number(activePrintOrder.amount).toFixed(2)}`;paymentBox.hidden=false;msg.textContent=`Print Order ${activePrintOrder.id.slice(0,8)}… created. अब payment submit करें.`;paymentBox.scrollIntoView({behavior:"smooth",block:"center"});}catch(err){msg.textContent=err.message==="DOCUMENT_NOT_APPROVED"?"Document अभी approved नहीं है।":"Print order create नहीं हुआ। Details जाँचें.";}
});
$("#paymentMethod").addEventListener("change",()=>{$("#transactionWrap").hidden=$("#paymentMethod").value!=="UPI";});
$("#paymentForm").addEventListener("submit",async e=>{
 e.preventDefault();

 const msg=$("#paymentMessage");

 if(!activePrintOrder){
   msg.textContent="पहले print order बनाएं।";
   return;
 }

 const method=$("#paymentMethod").value;

 if(method==="GATEWAY"){
   msg.textContent="Razorpay payment शुरू हो रहा है...";

   try{
     const r=await fetch(`${API_BASE}/payments/razorpay/order`,{
       method:"POST",
       headers:{"Content-Type":"application/json"},
       body:JSON.stringify({
         print_order_id:activePrintOrder.id
       })
     });

     const data=await r.json();

     if(!r.ok){
       throw new Error(data.error||"RAZORPAY_ORDER_FAILED");
     }

     if(typeof Razorpay==="undefined"){
       throw new Error("RAZORPAY_CHECKOUT_NOT_LOADED");
     }

     const options={
       key:data.razorpay.key_id,
       amount:data.razorpay.amount,
       currency:data.razorpay.currency,
       name:"Ayush Janseva Kendra",
       description:"Print Order Payment",
       order_id:data.razorpay.order_id,

       handler:async function(response){
         msg.textContent="Payment verify हो रहा है...";

         try{
           const verifyResponse=await fetch(`${API_BASE}/payments/razorpay/verify`,{
             method:"POST",
             headers:{"Content-Type":"application/json"},
             body:JSON.stringify({
               print_order_id:activePrintOrder.id,
               razorpay_order_id:response.razorpay_order_id,
               razorpay_payment_id:response.razorpay_payment_id,
               razorpay_signature:response.razorpay_signature
             })
           });

           const verifyData=await verifyResponse.json();

           if(!verifyResponse.ok){
             throw new Error(verifyData.error||"RAZORPAY_VERIFY_FAILED");
           }

           msg.textContent="Payment verified ✓. Print order queue में चला गया है.";
           startPaymentPolling();

         }catch(err){
           msg.textContent="Payment verify नहीं हुआ। कृपया Admin से संपर्क करें.";
         }
       },

       modal:{
         ondismiss:function(){
           msg.textContent="Payment window बंद कर दी गई.";
         }
       },

       theme:{
         color:"#d4af37"
       }
     };

     const checkout=new Razorpay(options);

     checkout.on("payment.failed",function(response){
       msg.textContent="Payment failed. कृपया दोबारा प्रयास करें.";
     });

     checkout.open();

   }catch(err){
     if(err.message==="PRINT_ORDER_ALREADY_PAID"){
       msg.textContent="इस order का payment पहले ही हो चुका है.";
     }else if(err.message==="RAZORPAY_NOT_CONFIGURED"){
       msg.textContent="Razorpay अभी configure नहीं हुआ है.";
     }else if(err.message==="RAZORPAY_CHECKOUT_NOT_LOADED"){
       msg.textContent="Razorpay Checkout load नहीं हुआ. अगला step required है.";
     }else{
       msg.textContent="Razorpay payment शुरू नहीं हुआ. कृपया दोबारा प्रयास करें.";
     }
   }

   return;
 }

 const transaction_id=$("#transactionId").value.trim();

 if(method==="UPI"&&!transaction_id){
   msg.textContent="UPI Transaction ID दर्ज करें।";
   return;
 }

 msg.textContent="Payment submit हो रहा है...";

 try{
   const r=await fetch(`${API_BASE}/payments`,{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
       print_order_id:activePrintOrder.id,
       payment_method:method,
       transaction_id
     })
   });

   const data=await r.json();

   if(!r.ok){
     throw new Error(data.error||"PAYMENT_FAILED");
   }

   msg.textContent=data.message;
   startPaymentPolling();

 }catch(err){
   msg.textContent=err.message==="PAYMENT_ALREADY_EXISTS"
     ?"इस order का payment पहले से submit है।"
     :"Payment submit नहीं हुआ। दोबारा प्रयास करें.";
 }
});
async function pollPrintStatus(){if(!activePrintOrder)return;const {service_number,token_number}=printDetails();try{const r=await fetch(`${API_BASE}/print-orders/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service_number,token_number,print_order_id:activePrintOrder.id})});const data=await r.json();if(!r.ok)return;const p=data.payment;$("#paymentStatus").hidden=false;$("#paymentStatus").innerHTML=`<b>Payment:</b> ${p?p.status:"NOT SUBMITTED"} &nbsp; <b>Print:</b> ${data.print_order.print_status}`;if(p?.status==="SUCCESS"){$("#paymentMessage").textContent="Payment verified ✓. Order print queue में चला गया है. Browser auto-print अगली phase में activate होगा.";return true;}}catch{}return false;}
function startPaymentPolling(){clearInterval(startPaymentPolling.timer);pollPrintStatus();startPaymentPolling.timer=setInterval(async()=>{if(await pollPrintStatus())clearInterval(startPaymentPolling.timer);},5000);}

document.querySelectorAll("[data-print]").forEach(btn=>btn.addEventListener("click",()=>{
  const type=btn.dataset.print;
  $("#printType").value=type==="Photo Print"?"PHOTO_PRINT":type==="Photo State"?"PHOTOSTATE":"DOCUMENT_PRINT";
  const saved=(()=>{try{return JSON.parse(localStorage.getItem("AJK_PRINT_APPLICATION")||"null")}catch{return null}})();
  if(saved?.service_number&&saved?.token_number){setPrintApplication(saved.service_number,saved.token_number);document.querySelector("#print-order")?.scrollIntoView({behavior:"smooth",block:"start"});}
  else{
    $("#applicationService").value=serviceCatalog.find(s=>s.name==="Photo & Document Printing")?.id||"";
    document.querySelector("#apply")?.scrollIntoView({behavior:"smooth",block:"start"});
    showToast("पहले Print Application submit करें। Service Number और Token Number system खुद generate करेगा।");
  }
}));

restorePrintApplication();

const toggle=$("#menuToggle"), nav=$("#mainNav");
toggle.addEventListener("click",()=>{const open=nav.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open));});
nav.addEventListener("click",e=>{if(e.target.matches("a"))nav.classList.remove("open");});

loadServices();
