export function enhanceDimFrame(data:Uint8ClampedArray){
  if(!data.length||data.length%4)return {luminance:0,enhanced:false};
  let total=0;for(let i=0;i<data.length;i+=4)total+=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
  const luminance=total/(data.length/4);
  if(luminance>=65)return {luminance,enhanced:false};
  for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,255*((Math.pow(data[i+c]/255,.65)-.5)*1.15+.54)));
  return {luminance,enhanced:true};
}
