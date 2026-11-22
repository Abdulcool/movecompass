import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('../assets/illustrations/',import.meta.url));await mkdir(dir,{recursive:true});
const line=(points,color='#2D765A',width=7)=>`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const head=(x,y)=>`<circle cx="${x}" cy="${y}" r="16" fill="#D8B69B" stroke="#13231F" stroke-width="3"/>`;
const chair=()=>line('35,100 35,245 40,180 105,180 105,245','#66736E',5);
const counter=(x=155,y=115)=>line(`${x},245 ${x},${y} 235,${y} 235,245`,'#66736E',5);
const wall=()=>'<rect x="20" y="22" width="220" height="225" rx="10" fill="#E5F3EB" stroke="#AABBB0"/>';
const floor=line('20,250 240,250','#AABBB0',2);
const text=(s,x=130,y=274)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="14" fill="#13231F">${s}</text>`;
const panel=(x,content)=>`<g transform="translate(${x},0)">${floor}${content}</g>`;
const standing=(hip=130)=>head(130,50)+line(`130,70 130,105 ${hip},155`)+line(`100,92 70,117 55,117`)+line('160,92 190,117 205,117')+line(`100,92 160,92`)+line(`${hip},155 105,200 100,247 83,247`)+line(`${hip},155 155,200 160,247 177,247`);
const calf=raised=>{
  const d=raised?12:0;
  return counter(155,105)+head(90,45-d)+line(`90,65 ${90},${145-d} 92,${195-d} 90,${235-d} ${raised?88:85},${raised?237:248} 116,248`)+line(`90,${83-d} 120,100 155,105`)+line(`103,${145-d} 105,${195-d} 103,${235-d} ${raised?101:98},${raised?237:248} 128,248`,'#71A68E',5);
};
const sit=standingUp=>chair()+counter(170,135)+(standingUp?
  head(115,40)+line('115,60 115,145 122,195 122,247 145,247')+line('115,85 145,115 170,135'):
  head(80,80)+line('80,100 85,180 130,180 130,247 150,247')+line('80,120 120,145 170,135'));
const angel=up=>wall()+head(130,55)+line('130,75 130,155')+line('100,95 160,95')+line('130,155 105,247 90,247')+line('130,155 155,247 170,247')+(up?line('100,95 65,80 65,40')+line('160,95 195,80 195,40'):line('100,95 70,135 50,90')+line('160,95 190,135 210,90'));
const row=pull=>chair()+head(95,55)+line('95,75 95,180 150,180 150,247 175,247')+line('230,65 230,185','#66736E',8)+(pull?
  line('95,95 72,130 125,115')+line('125,115 230,105 230,118 125,122','#E78367',4):
  line('95,95 145,108 185,112')+line('185,112 230,105 230,118 185,120','#E78367',4));
const pendulum=()=>counter(180,120)+head(115,55)+line('106,73 68,145 60,195 40,247 20,247')+line('68,145 90,197 110,247 130,247')+line('99,88 145,108 180,120')+line('99,88 90,145 85,192')+'<path d="M65 205 C50 225 120 225 110 205" fill="none" stroke="#E78367" stroke-width="4" marker-end="url(#arrow)"/>';
const items={
  'wall-angels':{title:'Wall angels',equipment:'wall',left:angel(false)+text('Relaxed W'),right:angel(true)+text('Slide up only as comfortable')},
  'seated-row':{title:'Seated band row',equipment:'chair-band',left:row(false)+text('Light band, sturdy anchor'),right:row(true)+text('Pull elbows back, then release')},
  pendulum:{title:'Shoulder pendulum',equipment:'table',left:pendulum()+text('One hand supported'),right:pendulum()+text('Small relaxed circles')},
  'sit-to-stand':{title:'Supported sit-to-stand',equipment:'chair-counter',left:sit(false)+text('Firm chair, support nearby'),right:sit(true)+text('Stand, then sit with control')},
  'hip-shift':{title:'Counter hip shift',equipment:'counter',left:standing()+counter(35,122)+text('Both feet stay on the floor'),right:standing(145)+counter(35,122)+text('Small shift, then return')},
  'calf-raise':{title:'Counter calf raise',equipment:'counter',left:calf(false)+text('Hands supported, heels down'),right:calf(true)+text('Lift heels, then lower slowly')},
};
for(const [id,i] of Object.entries(items))await writeFile(`${dir}${id}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 325" role="img" aria-labelledby="title" data-equipment="${i.equipment}"><title id="title">Illustration: ${i.title}</title><rect width="600" height="325" rx="18" fill="#F7F6F1"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#E78367"/></marker></defs><g transform="translate(0,24)" font-family="sans-serif">${panel(15,i.left)}${panel(325,i.right)}<path d="M280 130H315" stroke="#E78367" stroke-width="4" marker-end="url(#arrow)"/></g>${text('Illustration — move within your own comfortable range',300,318)}</svg>\n`);
console.log('Built six original supported, weight-free exercise illustrations');
