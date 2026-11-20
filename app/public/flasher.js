const field=document.getElementById('backend');field.value=location.origin;
document.getElementById('copy').onclick=async()=>{
  try{await navigator.clipboard.writeText(field.value);document.getElementById('copy-status').textContent='Address copied.';}
  catch{field.focus();field.select();document.getElementById('copy-status').textContent='Select and copy the address above.';}
};
