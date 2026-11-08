const canvas=document.getElementById("screen");
const ctx=canvas.getContext("2d");

const FONT=10;
const CHARS=" .,:-~=+*itfLCJYVXOZ2S5A8#%@";

let W,H,COLS,ROWS,dpr;
let time=0,sceneTime=0,sceneDuration=8;
let current=-1,previous=-1,transition=0;
let mouseX=0,mouseY=0,targetX=0,targetY=0;
let ambientNoise=[];
let inIntermission=false;
const INTERMISSION_DURATION=2.6;

function buildAmbientNoise(){
 ambientNoise=[];
 const amount=Math.min(1800,Math.max(220,Math.floor(W*H/1650)));
 for(let i=0;i<amount;i++){
  // Bias some characters toward the perimeter, while retaining a faint
  // presence behind the central composition.
  let x=Math.random(),y=Math.random();
  if(Math.random()<.68){
   const edge=Math.floor(Math.random()*4);
   if(edge===0)x*=.22;
   if(edge===1)x=.78+x*.22;
   if(edge===2)y*=.22;
   if(edge===3)y=.78+y*.22;
  }
  ambientNoise.push({
   x,y,
   char:CHARS[1+Math.floor(Math.random()*(CHARS.length-1))],
   phase:Math.random()*Math.PI*2,
   speed:.25+Math.random()*1.2,
   alpha:.07+Math.random()*.19,
   drift:(Math.random()-.5)*5
  });
 }
}

function resize(){
 W=innerWidth;H=innerHeight;
 dpr=Math.min(devicePixelRatio||1,1.5);
 canvas.width=W*dpr;
 canvas.height=H*dpr;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 COLS=Math.ceil(W/FONT);
 ROWS=Math.ceil(H/FONT);
 buildAmbientNoise();
}
addEventListener("resize",resize);
resize();

addEventListener("mousemove",e=>{
 targetX=(e.clientX/W-.5)*.35;
 targetY=(e.clientY/H-.5)*.35;
});

// ------------------------------------------------
// SCENE SYSTEM
// ------------------------------------------------

const scenes=[
 "alien","type","rotate","propagate","rotate44"
];

// A normal scene always gives way to a short signal-corruption interlude.
// The next normal scene is selected only after that interlude has played.
function nextScene(){
 if(current===-1 || inIntermission){
  previous=current;
  let next;
  do{
   next=Math.floor(Math.random()*scenes.length);
  }while(next===current);
  current=next;
  inIntermission=false;
  sceneTime=0;
  sceneDuration=scenes[current]==="propagate"
 ? 3+Math.random()*2
 : 7+Math.random()*8;
  transition=0;
  return;
 }
 inIntermission=true;
 sceneTime=0;
 sceneDuration=INTERMISSION_DURATION;
 transition=0;
}

// ------------------------------------------------
// ASCII TEXT GENERATOR
// ------------------------------------------------

const cloudCache=new Map();

function createCloud(word,fontSize=180){
 const key=word+"_"+fontSize;
 if(cloudCache.has(key))return cloudCache.get(key);

 const off=document.createElement("canvas");
 const o=off.getContext("2d");

 off.width=word.length*fontSize*.78+40;
 off.height=fontSize*1.5;

 o.font=`bold ${fontSize}px monospace`;
 o.textBaseline="middle";
 o.textAlign="center";
 o.fillStyle="#fff";
 o.fillText(word,off.width/2,off.height/2);

 const data=o.getImageData(0,0,off.width,off.height).data;
 const points=[];
 const step=5;

 for(let y=0;y<off.height;y+=step){
  for(let x=0;x<off.width;x+=step){
   const alpha=data[(y*off.width+x)*4+3];
   if(alpha<100)continue;

   const nx=(x-off.width/2)/fontSize;
   const ny=(y-off.height/2)/fontSize;

   points.push([nx,ny,.20,alpha/255]);
   points.push([nx,ny,-.20,alpha/255]);

   if((x+y)%3===0)
    points.push([nx,ny,0,alpha/255]);
  }
 }

 const cloud={
  points,
  width:off.width/fontSize,
  height:off.height/fontSize
 };

 cloudCache.set(key,cloud);
 return cloud;
}

function rotate3D(p,ax,ay,az){
 let [x,y,z]=p;
 let c=Math.cos(ax),s=Math.sin(ax);
 [y,z]=[y*c-z*s,y*s+z*c];
 c=Math.cos(ay);s=Math.sin(ay);
 [x,z]=[x*c+z*s,-x*s+z*c];
 c=Math.cos(az);s=Math.sin(az);
 [x,y]=[x*c-y*s,x*s+y*c];
 return [x,y,z];
}

// [OTTIMIZZATO] Stesso risultato grafico di prima, ma più leggero:
// - seno/coseno calcolati una volta per chiamata, non per ogni punto
// - niente array/oggetti creati per ogni punto (meno lavoro per il garbage collector)
// - i punti troppo deboli (carattere " ") non vengono disegnati
// - i colori rgba vengono riusati da una cache invece di essere ricostruiti ogni volta
const ASCII_STYLES=[];
let projX=new Float64Array(4096),projY=new Float64Array(4096),
    projZ=new Float64Array(4096),projB=new Float64Array(4096);

function drawAsciiText(word,options={}){
 const {
  x=W/2,y=H/2,
  size=Math.min(W*.16,145),
  angleX=0,angleY=0,angleZ=0,
  scaleY=1,
  intensity=1,
  distortion=0,
  detail=1
 }=options;

 const cloud=createCloud(word);
 const points=cloud.points;
 const scale=size/cloud.width;
 const camera=5;

 const cX=Math.cos(angleX),sX=Math.sin(angleX);
 const cY=Math.cos(angleY),sY=Math.sin(angleY);
 const cZ=Math.cos(angleZ),sZ=Math.sin(angleZ);

 const maxPoints=Math.ceil(points.length/detail);
 if(projX.length<maxPoints){
  const n=Math.max(maxPoints,projX.length*2);
  projX=new Float64Array(n);projY=new Float64Array(n);
  projZ=new Float64Array(n);projB=new Float64Array(n);
 }

 let count=0;
 for(let i=0;i<points.length;i+=detail){
  const p=points[i];
  const px=p[0]*scale/size*2,py=p[1]*scale/size*2,pz=p[2]*1.5;

  // stessa sequenza di rotazioni di rotate3D (X, poi Y, poi Z)
  const y1=py*cX-pz*sX,z1=py*sX+pz*cX;
  const x2=px*cY+z1*sY,z2=-px*sY+z1*cY;
  const x3=x2*cZ-y1*sZ,y3=x2*sZ+y1*cZ;

  const perspective=camera/(camera-z2);
  let sx=x+x3*size*perspective;
  let sy=y+y3*size*perspective*scaleY;

  if(distortion>0&&Math.random()<distortion){
   sx+=(Math.random()-.5)*size*.18;
   sy+=(Math.random()-.5)*size*.08;
  }

  projX[count]=sx;projY[count]=sy;projZ[count]=z2;projB[count]=p[3];
  count++;
 }

 // Ordine di disegno dal fondo verso il davanti, come prima
 const order=new Array(count);
 for(let i=0;i<count;i++)order[i]=i;
 order.sort((a,b)=>projZ[a]-projZ[b]);

 ctx.font=`${FONT}px monospace`;
 ctx.textBaseline="middle";
 ctx.textAlign="center";

 let lastLevel=-1;
 for(let k=0;k<count;k++){
  const i=order[k];
  const px=projX[i],py=projY[i],pz=projZ[i];
  if(px<0||px>W||py<0||py>H)continue;

  const depth=Math.max(.12,Math.min(1,(pz+2)/4));
  const light=Math.max(.12,Math.min(1,
   (.55+pz*.13)*projB[i]
  ));

  const brightness=light*depth*intensity;
  const index=Math.floor(brightness*(CHARS.length-1));
  if(index<=0)continue; // " " non disegna nulla

  const level=Math.round(brightness*64);
  if(level!==lastLevel){
   let style=ASCII_STYLES[level];
   if(!style)style=ASCII_STYLES[level]=`rgba(245,245,245,${level/64})`;
   ctx.fillStyle=style;
   lastLevel=level;
  }
  ctx.fillText(CHARS[index],px,py);
 }
}

// ------------------------------------------------
// GLOBAL AMBIENT ASCII NOISE
// ------------------------------------------------

function drawAmbientNoise(t){
 ctx.save();
 ctx.font=FONT+"px monospace";
 ctx.textBaseline="middle";
 ctx.textAlign="center";

 // Low-luminance organic character field, kept behind the main artwork.
 for(const p of ambientNoise){
  const wave=.5+.5*Math.sin(t*p.speed+p.phase);
  const modulation=.68+.32*Math.sin(t*.31+p.phase*1.7);
  const flicker=wave*modulation;
  if(flicker<.16)continue;
  const x=p.x*W+Math.sin(t*.18+p.phase)*p.drift;
  const y=p.y*H+Math.cos(t*.15+p.phase)*p.drift;
  const alpha=Math.min(.19,p.alpha*.42*flicker);
  ctx.fillStyle=`rgba(145,145,145,${alpha})`;
  ctx.fillText(p.char,x,y);
 }

 // Sparse, restrained horizontal signal jitter, like the transition glitch.
 const bandCount=Math.max(3,Math.min(9,Math.floor(H/150)));
 for(let i=0;i<bandCount;i++){
  if(Math.sin(t*1.35+i*8.17)<.30)continue;
  const y=((i*.61803398875+(t*.027)%1)%1)*H;
  const shift=Math.sin(t*2.1+i*3.7)*Math.min(13,W*.012);
  const alpha=.025+.025*(.5+.5*Math.sin(t*2.8+i));
  ctx.fillStyle=`rgba(155,155,155,${alpha})`;
  ctx.fillRect(shift,y,W*.72,1);
  if(i%3===0){
   const x=((i*137+t*9)%Math.max(1,W));
   ctx.fillStyle=`rgba(165,165,165,${alpha*1.5})`;
   ctx.fillRect(x,y+FONT*.4,Math.min(W*.08,48),1);
  }
 }
 ctx.restore();
}

// ------------------------------------------------
// ALIEN STRUCTURE
// ------------------------------------------------

function alienPoint(u,v,layer,t){
 const phase=layer*2.094;
 const twist=v+2.5*u+Math.sin(u*3+t*.4+phase)*.5;
 const wave=Math.sin(u*5+v*3+t*.7+phase)*.13+
 Math.cos(u*3-v*4-t*.5)*.10;
 const r=.37+wave+.09*Math.sin(u*7+t*.35+phase);
 const radius=1.05+layer*.12+r*Math.cos(twist);

 let x=radius*Math.cos(u);
 let z=radius*Math.sin(u);
 let y=r*Math.sin(twist)+.3*Math.sin(u*3+phase)+
 .13*Math.cos(u*7+t*.3);

 x+=.1*Math.sin(v*5+u*4+t+phase);
 z+=.12*Math.cos(u*6-v*3+t*.4);
 y+=.1*Math.sin(u*4+v*2+t*.6);

 return [x,y,z];
}

function drawAlien(t){
 const depth=new Float32Array(COLS*ROWS);
 depth.fill(-Infinity);
 const buffer=new Array(COLS*ROWS);

 for(let layer=0;layer<3;layer++){
  for(let i=0;i<150;i++){
   const u=i/150*Math.PI*2;
   for(let j=0;j<60;j++){
    const v=j/60*Math.PI*2;
    const p=rotate3D(
     alienPoint(u,v,layer,t),
     .25+mouseY+Math.sin(t*.19)*.16,
     t*.22+mouseX,
     Math.sin(t*.13)*.18
    );

    const perspective=5.3/(5.3-p[2]);
    const scale=Math.min(W,H)*.30;
    const sx=Math.floor((W/2+p[0]*scale*perspective)/FONT);
    const sy=Math.floor((H/2+p[1]*scale*perspective)/FONT);

    if(sx<0||sx>=COLS||sy<0||sy>=ROWS)continue;

    const index=sy*COLS+sx;
    if(p[2]<depth[index])continue;
    depth[index]=p[2];

    const light=.5+.25*Math.sin(v+t*.3)+.2*Math.cos(u*3+t*.2);
    const a=Math.max(.08,Math.min(1,light*.7+(p[2]+2.5)/5*.3));

    buffer[index]={
     char:CHARS[Math.floor(a*(CHARS.length-1))],a
    };
   }
  }
 }

 ctx.font=FONT+"px monospace";
 ctx.textBaseline="top";

 for(let i=0;i<buffer.length;i++){
  const p=buffer[i];
  if(!p||p.char===" ")continue;
  ctx.fillStyle=`rgba(245,245,245,${p.a*.85})`;
  ctx.fillText(p.char,(i%COLS)*FONT,Math.floor(i/COLS)*FONT);
 }
}

// ------------------------------------------------
// TYPEWRITER — LARGER
// ------------------------------------------------

function fittedTextSize(word, widthFill=.92, heightFill=.78){
 const cloud=createCloud(word);
 // drawAsciiText's size parameter represents the rendered word width.
 // The projected cloud extends roughly one "size" unit to either side.
 // Halve the fitted width so the rendered word fills, rather than exceeds,
 // the requested viewport fraction.
 return Math.max(12,Math.min(W*widthFill*.5,H*heightFill*(cloud.width/cloud.height)*.5));
}

function drawType(t){
 const word="4NOM4LY";
 const count=Math.min(word.length,Math.floor(t/.65));
 const visible=word.substring(0,count);
 const size=fittedTextSize(word,.91,.76);
 const shake=Math.random()<.04?(Math.random()-.5)*24:0;

 if(visible){
  drawAsciiText(visible,{
   x:W/2+shake,y:H/2,
   size,
   angleY:Math.sin(t*2)*.025,
   intensity:1,
   distortion:Math.random()<.12?.18:0
  });
 }

 if(Math.random()<.035){
  ctx.fillStyle="rgba(255,255,255,.8)";
  ctx.fillRect(0,Math.random()*H,W,1+Math.random()*4);
 }
}

// ------------------------------------------------
// ROTATING TEXT — LARGE, VIEWPORT-FITTED
// ------------------------------------------------

function drawRotation(t,word){
 const glitch=Math.random()<.12;
 const size=fittedTextSize(word,word==="44"?.94:.93,.84);

 drawAsciiText(word,{
  x:W/2+(glitch?(Math.random()-.5)*55:0),
  y:H/2,
  size,
  angleX:t*.55,
  angleY:t*.75,
  angleZ:Math.sin(t*.7)*.3,
  scaleY:.25+Math.abs(Math.sin(t*.8))*.75,
  intensity:1,
  distortion:glitch?.25:.015,
  detail:1
 });

 if(glitch){
  drawAsciiText(word,{
   x:W/2+(Math.random()-.5)*65,
   y:H/2+(Math.random()-.5)*28,
   size,
   angleX:t*.55,
   angleY:t*.75+.1,
   intensity:.22,
   detail:3
  });
 }
}

// [OTTIMIZZAZIONE] Regolazioni della scena dei "44"
const PROP_DETAIL=10;    // prima 5. Più alto = meno punti per ogni "44" = più leggero
const PROP_MIN_CELL=62;  // prima 46. Più alto = "44" più grandi e meno numerosi su schermi piccoli

// ------------------------------------------------
// 44 PROPAGATION — FULL-VIEWPORT RESPONSIVE FIELD — RESTORED GRID STYLE
// ------------------------------------------------

function drawPropagation(t){
 const progress=Math.min(1,t/5);
 const ease=progress*progress*(3-2*progress);

 // Cell size is derived from the shorter viewport dimension, so the
 // pattern remains dense in both portrait and landscape orientations.
 const cell=Math.max(PROP_MIN_CELL,Math.min(118,Math.min(W,H)*.115));
 const stepX=cell*1.02;
 const stepY=cell*.82;
 const cols=Math.ceil(W/stepX)+2;
 const rows=Math.ceil(H/stepY)+2;
 const startX=-stepX*.55;
 const startY=-stepY*.45;
 const total=cols*rows;

 for(let row=0;row<rows;row++){
  for(let col=0;col<cols;col++){
   const x=startX+col*stepX+(row%2)*stepX*.5;
   const y=startY+row*stepY;

   // A radial wave spreads from the upper-left corner. Every cell has
   // a normalized arrival time, avoiding uncovered bands at any ratio.
   const distance=Math.hypot(x,y);
   const maxDistance=Math.hypot(W,H);
   const delay=(distance/maxDistance)*.78;
   if(ease<delay)continue;

   const local=Math.min(1,(ease-delay)*5.5);
   const alpha=Math.min(1,local);
   const phase=(row*cols+col)*.037;

   drawAsciiText("44",{
    x,y,
    size:cell*.43,
    angleY:time*.3+phase,
    angleZ:Math.sin(time+phase)*.09,
    intensity:alpha*.9,
    detail:PROP_DETAIL
   });
  }
 }

 // Expanding propagation wave, kept subtle so it doesn't obscure the field.
 ctx.beginPath();
 ctx.arc(0,0,ease*Math.max(W,H)*1.35,0,Math.PI*2);
 ctx.strokeStyle=`rgba(255,255,255,${(1-ease)*.22})`;
 ctx.lineWidth=1;
 ctx.stroke();
}

// ------------------------------------------------
// SIGNAL CORRUPTION
// ------------------------------------------------

function drawCorruption(t){
 ctx.font=FONT+"px monospace";
 ctx.textBaseline="top";

 for(let y=0;y<ROWS;y++){
  for(let x=0;x<COLS;x++){
   if(Math.random()>.24)continue;

   const char=CHARS[Math.floor(Math.random()*CHARS.length)];
   ctx.fillStyle=`rgba(245,245,245,${Math.random()*.8})`;
   ctx.fillText(char,x*FONT,y*FONT);
  }
 }

 for(let i=0;i<12;i++){
  if(Math.random()>.5)continue;
  const y=Math.random()*H;
  const h=2+Math.random()*25;
  const shift=(Math.random()-.5)*100;

  ctx.drawImage(canvas,0,y*dpr,W*dpr,h*dpr,
   shift,y,W,h);
 }

 if(Math.random()<.025){
  drawAsciiText("44",{
   x:Math.random()*W,
   y:Math.random()*H,
   size:Math.min(W*.3,240),
   angleY:time,
   angleX:time*.7,
   intensity:.7
  });
 }
}

// ------------------------------------------------
// TRANSITIONS
// ------------------------------------------------

function drawTransition(){
 if(transition<=0)return;

 for(let i=0;i<12;i++){
  if(Math.random()>.55)continue;

  const y=Math.random()*H;
  const h=2+Math.random()*30;
  const shift=(Math.random()-.5)*transition*180;

  ctx.drawImage(canvas,0,y*dpr,W*dpr,h*dpr,
   shift,y,W,h);
 }

 if(Math.random()<.35*transition){
  ctx.fillStyle=`rgba(255,255,255,${Math.random()*.55*transition})`;
  ctx.fillRect(0,0,W,H);
 }
}

// ------------------------------------------------
// BACKGROUND CORRUPTION — AGGIUNTO
// Versione scura e costante dell'effetto di transizione.
// Regolazioni rapide: modifica le quattro costanti qui sotto.
// ------------------------------------------------

const BG_GREY=145;        // grigio dei caratteri (0 = nero, 255 = bianco)
const BG_ALPHA_MAX=.32;   // opacità massima: più basso = più discreto
const BG_DENSITY=.14;     // quota di celle con un carattere (0-1)
const BG_REFRESH=1/14;    // secondi tra un rimescolamento e l'altro

let bgCells=[],bgNext=0;

function rebuildBgCells(){
 bgCells=[];
 for(let y=0;y<ROWS;y++){
  for(let x=0;x<COLS;x++){
   if(Math.random()>BG_DENSITY)continue;
   const a=BG_ALPHA_MAX*(.2+Math.random()*.8);
   bgCells.push({
    x:x*FONT,y:y*FONT,
    char:CHARS[1+Math.floor(Math.random()*(CHARS.length-1))],
    style:`rgba(${BG_GREY},${BG_GREY},${BG_GREY},${a})`
   });
  }
 }
}

function drawBackgroundCorruption(t){
 if(t>=bgNext){
  bgNext=t+BG_REFRESH;
  rebuildBgCells();
 }

 ctx.font=FONT+"px monospace";
 ctx.textBaseline="top";
 ctx.textAlign="left";

 for(const c of bgCells){
  ctx.fillStyle=c.style;
  ctx.fillText(c.char,c.x,c.y);
 }

 // Fasce orizzontali spostate, come nella transizione ma più contenute.
 // Qui lo sfondo contiene solo ciò che è già stato disegnato (nero + rumore),
 // quindi la scena principale non viene toccata.
 for(let i=0;i<6;i++){
  if(Math.random()>.45)continue;
  const y=Math.random()*H;
  const h=2+Math.random()*22;
  const shift=(Math.random()-.5)*60;
  ctx.drawImage(canvas,0,y*dpr,W*dpr,h*dpr,shift,y,W,h);
 }
}

// ------------------------------------------------
// MAIN LOOP
// ------------------------------------------------

nextScene();

function animate(){
 requestAnimationFrame(animate);

 const dt=Math.min(.04,1/60);
 time+=dt;
 sceneTime+=dt;

 mouseX+=(targetX-mouseX)*.025;
 mouseY+=(targetY-mouseY)*.025;

 ctx.fillStyle="#000";
 ctx.fillRect(0,0,W,H);

 // Persistent ambient texture is rendered first, never over the scene art.
 drawAmbientNoise(time);
 // Effetto di fondo costante, spento durante l'interludio di corruzione.
 if(!inIntermission)drawBackgroundCorruption(time);

 if(inIntermission){
  drawCorruption(sceneTime);
 }else{
  switch(scenes[current]){
   case "alien":drawAlien(time);break;
   case "type":drawType(sceneTime);break;
   case "rotate":drawRotation(sceneTime,"4NOM4LY");break;
   case "propagate":drawPropagation(sceneTime);break;
   case "rotate44":drawRotation(sceneTime,"44");break;
  }

  const remaining=sceneDuration-sceneTime;
  if(remaining<.7){
   transition=1-remaining/.7;
   drawTransition();
  }
 }

 if(!inIntermission && Math.random()<.012){
  ctx.fillStyle="rgba(255,255,255,.7)";
  ctx.fillRect(0,Math.random()*H,W,1+Math.random()*8);
 }

 if(!inIntermission && Math.random()<.002){
  ctx.fillStyle=`rgba(255,255,255,${Math.random()*.8})`;
  ctx.fillRect(0,0,W,H);
 }

 if(sceneTime>=sceneDuration)nextScene();
}

animate();
