/* mech-jelly.js : mechanical jellyfish module (WebGL + 2D glow, transparent background)
   usage:
     MechJelly.load("mech-jelly.jpg", function(){ var j = MechJelly.mount(document.getElementById("jelly")); });
     j.destroy() removes it again.
   the container needs a size (e.g. position:absolute; width:420px; height:560px). pointer movement near the jellyfish pushes the ribbons. */
(function(){
var R=Math.random,PI=Math.PI,S=1024,G=64,T=S/G,SRC="",ready=false,BODY,TENT,ACT=new Uint8Array(G*G),NODES=[],SG=[],BEND=-.39,TH0=-.29;
for(var i=0;i<36;i++){(function(h){var c=document.createElement("canvas");c.width=c.height=64;var g=c.getContext("2d"),q=g.createRadialGradient(32,32,0,32,32,32);q.addColorStop(0,"hsla("+h+",100%,90%,1)");q.addColorStop(.25,"hsla("+h+",100%,66%,.5)");q.addColorStop(1,"hsla("+h+",100%,50%,0)");g.fillStyle=q;g.fillRect(0,0,64,64);SG.push(c)})(i*10)}
function blit(c,h,px,py,s,al){c.globalAlpha=Math.max(0,Math.min(1,al));c.drawImage(SG[((Math.round(h/10)%36)+36)%36],px-s,py-s,s*2,s*2);c.globalAlpha=1}
function hue(r,g,b){var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(d<20)return 205;var h=mx==r?((g-b)/d)%6:mx==g?(b-r)/d+2:(r-g)/d+4;return(h*60+360)%360}
function ss(a,b,v){v=Math.max(0,Math.min(1,(v-a)/(b-a)));return v*v*(3-2*v)}
function mul(M,N){return[M[0]*N[0]+M[2]*N[1],M[1]*N[0]+M[3]*N[1],M[0]*N[2]+M[2]*N[3],M[1]*N[2]+M[3]*N[3],M[0]*N[4]+M[2]*N[5]+M[4],M[1]*N[4]+M[3]*N[5]+M[5]]}
/* body: continuous periodic swim (no impulses) + slow yaw / roll sway; every term is smooth, so the loop is seamless */
var Z={ph:0,x:0,y:0,yaw:0,roll:0,amp:1,i:0},F={c:0,dC:0,vx:0,vy:0},zp={x:0,y:0};
function step(t,dt){var Tc=3.9+.5*Math.sin(.11*t);Z.ph+=dt/Tc;var u=Z.ph%1,c=u<.3?.5-.5*Math.cos(PI*u/.3):.5+.5*Math.cos(PI*(u-.3)/.7),cc=c*(.85+.15*Math.sin(.09*t+1));
Z.amp=.85+.15*Math.sin(.09*t+1);Z.y=-(135*cc+32*Math.sin(.21*t)+18*Math.sin(.37*t+1));Z.x=90*Math.sin(.17*t+.4)+45*Math.sin(.31*t+2)+22*Math.sin(.53*t);Z.yaw=.6*(.6*Math.sin(.13*t)+.2*Math.sin(.31*t+1));Z.roll=.05*Math.sin(.26*t+.7)+.02*Math.sin(.61*t);
if(!Z.i){zp.x=Z.x;zp.y=Z.y;F.c=cc;Z.i=1}
if(dt>0){F.dC+=((cc-F.c)/dt-F.dC)*.3;F.vy+=((Z.y-zp.y)/dt-F.vy)*.15;F.vx+=((Z.x-zp.x)/dt-F.vx)*.15}F.c=cc;zp.x=Z.x;zp.y=Z.y}
/* tentacle motion copied from version 2: root steady, tip free, delayed pull on every pulse, independent phase per tentacle, inertia */
function contr(x){x=x-Math.floor(x);return x<.3?.5-.5*Math.cos(PI*x/.3):.5+.5*Math.cos(PI*(x-.3)/.7)}
function disp(x,y,t){var vx=x-640,vy=y-470,u=(vx*-.62+vy*.78)/420,w=ss(.02,.55,u);if(w<=0)return[0,0];
var p=vx*.78+vy*.62,rr=Math.sqrt(vx*vx+vy*vy),al=Math.atan2(vy,vx)+(vy<0&&vx<0?2*PI:0),na=al+(PI/2+.38*(al+TH0-PI/2)-(al+TH0))*ss(.03,.5,u),
s=Math.min(1,u/1.4),ph=p*.021+1.3,am=.75+.45*Math.sin(p*.037+1.3),f=.9+.25*Math.sin(p*.051),cl=contr(Z.ph-s*.18)*Z.amp,A=88*am*Math.pow(s,1.25),
sw=.11*Math.sin(t*.7*f-s*2.1+ph)*Math.pow(s,1.1);na+=sw;
var rx=rr*Math.cos(na),ry=rr*Math.sin(na),
w1=Math.sin(t*.95*f-s*4.6+ph),w2=Math.sin(t*1.45*f-s*8+ph*1.7+1.3),w3=Math.cos(t*.75*f-s*3.6+ph*.6),
v1=Math.sin(t*.85*f-s*3.2+ph*.8),v2=Math.sin(t*1.3*f-s*6.5+ph*1.3+.6),
lx=Math.max(-160,Math.min(160,F.vx)),ly=Math.max(-160,Math.min(160,F.vy)),
nx=rx*(1-.22*F.c*(1-s)*(1-s)*w)+A*(.8*w1+.3*w2+.35*w3)-lx*.35*s,
ny=ry-80*cl*s+72*am*Math.pow(s,1.1)*(.8*v1+.3*v2)+A*.2*Math.cos(t*1.1*f-s*5+ph)-ly*.35*s;return[640+nx-x,470+ny-y]}
/* glass bell contraction (rim closes, crown lifts); the metal band stays rigid */
function bdef(x,y,c){var yb=300+(x-490)*.264,k=ss(0,1,(y-190)/Math.max(40,yb-190))*(1-ss(0,1,(y-yb)/30)),lift=26*c*(1-ss(190,yb,y));return[700+(x-700)*(1-.09*c*k),y-lift]}
function load(src,cb){if(typeof src=="function"){cb=src;src=null}if(!src&&!SRC){var err=new Error("MechJelly.load requires an image URL");if(cb)cb(err);return}var im=new Image();im.onerror=function(){var err=new Error("MechJelly image failed to load: "+(src||SRC));if(cb)cb(err)};im.onload=function(){
var c=document.createElement("canvas");c.width=c.height=S;var g=c.getContext("2d");g.drawImage(im,0,0,S,S);var d=g.getImageData(0,0,S,S).data;
var mk=document.createElement("canvas");mk.width=mk.height=S;var mg=mk.getContext("2d");mg.shadowColor="#fff";mg.shadowBlur=22;mg.shadowOffsetX=3000;mg.fillStyle="#fff";mg.translate(-3000,0);mg.beginPath();
[[470,300],[484,240],[520,214],[600,188],[700,170],[790,184],[850,224],[902,290],[938,350],[934,396],[906,424],[880,450],[850,474],[790,502],[700,512],[620,506],[560,492],[510,458],[476,404],[462,340]].forEach(function(q,k){k?mg.lineTo(q[0],q[1]):mg.moveTo(q[0],q[1])});mg.closePath();mg.fill();
var md=mg.getImageData(0,0,S,S).data;

BODY=document.createElement("canvas");TENT=document.createElement("canvas");BODY.width=BODY.height=TENT.width=TENT.height=S;
var bg=BODY.getContext("2d"),tg=TENT.getContext("2d"),bi=bg.createImageData(S,S),ti=tg.createImageData(S,S),b=bi.data,tt=ti.data;
for(var i=0;i<S*S;i++){var o=i*4,r=d[o],gg=d[o+1],bl=d[o+2],m=Math.max(r,gg,bl);if(m<1)continue;var k=255/m,a=m/255*ss(12,38,m),mm=md[o+3]/255,at=Math.min(1,m/255*ss(26,52,m)*(.32+.68*ss(60,140,m))*1.22),ab=Math.min(1,a*1.08);
b[o]=r*k;b[o+1]=gg*k;b[o+2]=bl*k;b[o+3]=ab*mm*255;tt[o]=r*k;tt[o+1]=gg*k;tt[o+2]=bl*k;tt[o+3]=at*(1-mm)*255}
bg.putImageData(bi,0,0);tg.putImageData(ti,0,0);
for(var j=0;j<G;j++)for(var ix=0;ix<G;ix++){var s=0;for(var yy=j*T;yy<j*T+T;yy+=4)for(var xx=ix*T;xx<ix*T+T;xx+=4)s+=tt[(yy*S+xx)*4+3];ACT[j*G+ix]=s>600?1:0}
var cand=[];for(var y=2;y<S-2;y+=2)for(var x=2;x<S-2;x+=2){var o2=(y*S+x)*4,r2=d[o2],g2=d[o2+1],b2=d[o2+2],l=(r2+g2+b2)/3;if(l>150&&R()<.2)cand.push({x:x,y:y,h:hue(r2,g2,b2),m:md[o2+3]/255,ph:R()*6.28,f:.7+R()*1.8,sz:.5+R()})}
cand.sort(function(){return R()-.5});NODES=cand.slice(0,300);ready=true;if(cb)cb()};im.src=src||SRC}
/* extra thin nerve-fibre filaments to densify the tentacles */
var TIERS=[{n:22,K:22,L:[430,520],lw:1.6,a:.4},{n:18,K:18,L:[330,440],lw:1.1,a:.34},{n:14,K:14,L:[190,300],lw:.8,a:.28}],HU=[200,188,242],FIB=[],PUL=[];
TIERS.forEach(function(t,ti){for(var i=0;i<t.n;i++){var rx=520+(i+.5)/t.n*260+(R()-.5)*8;FIB.push({t:ti,K:t.K,rx:rx,ry:482+(rx-520)*.06+R()*14,L:t.L[0]+R()*(t.L[1]-t.L[0]),ph:R()*6.28,pp:R()*6.28,f1:.7+R()*.7,f2:.7+R()*.7,hg:i%3,x:new Float32Array(t.K),y:new Float32Array(t.K),ox:new Float32Array(t.K),oy:new Float32Array(t.K),init:false})}});

function mount(host){
if(!host||!host.appendChild)throw new TypeError("MechJelly.mount requires a DOM container");if(!ready||!BODY||!TENT)throw new Error("Call MechJelly.load(imageUrl) successfully before mount()");
var cf=document.createElement("canvas"),cg=document.createElement("canvas"),co=document.createElement("canvas");if(window.getComputedStyle&&getComputedStyle(host).position=="static")host.style.position="relative";[cf,cg,co].forEach(function(c){c.style.cssText="position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none";host.appendChild(c)});co.style.mixBlendMode="screen";
var gl=cg.getContext("webgl",{premultipliedAlpha:true,alpha:true,antialias:false}),x=co.getContext("2d"),xf=cf.getContext("2d"),W,H,DPR,mxp=null,myp=null,Mlast=[1,0,0,1,0,0],fit;if(!gl||!x||!xf){[cf,cg,co].forEach(function(c){if(c.parentNode)c.parentNode.removeChild(c)});throw new Error("MechJelly requires WebGL and 2D canvas support")}
function sh(t,s){var o=gl.createShader(t);if(!o)throw new Error("Unable to create WebGL shader");gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)){var msg=gl.getShaderInfoLog(o)||"Unknown shader compilation error";gl.deleteShader(o);throw new Error(msg)}return o}
var pg=gl.createProgram();if(!pg)throw new Error("Unable to create WebGL program");var vs=sh(gl.VERTEX_SHADER,"attribute vec2 aP;attribute vec2 aT;uniform vec2 uR;uniform vec4 uA;uniform vec2 uB;varying vec2 vT;void main(){vec2 p=vec2(uA.x*aP.x+uA.z*aP.y+uB.x,uA.y*aP.x+uA.w*aP.y+uB.y);gl_Position=vec4(2.*p.x/uR.x-1.,1.-2.*p.y/uR.y,0.,1.);vT=aT;}"),fs=sh(gl.FRAGMENT_SHADER,"precision mediump float;uniform sampler2D uS;varying vec2 vT;void main(){gl_FragColor=texture2D(uS,vT);}");gl.attachShader(pg,vs);gl.attachShader(pg,fs);gl.linkProgram(pg);if(!gl.getProgramParameter(pg,gl.LINK_STATUS)){var msg=gl.getProgramInfoLog(pg)||"Unknown WebGL program link error";gl.deleteProgram(pg);throw new Error(msg)}gl.useProgram(pg);
var aP=gl.getAttribLocation(pg,"aP"),aT=gl.getAttribLocation(pg,"aT"),uR=gl.getUniformLocation(pg,"uR"),uA=gl.getUniformLocation(pg,"uA"),uB=gl.getUniformLocation(pg,"uB");
function tex(cv){var t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
var tB=tex(BODY),tT=tex(TENT),NV=(G+1)*(G+1),pos=new Float32Array(NV*2),uv=new Float32Array(NV*2),idx=new Uint16Array(G*G*6),q=0;
for(var j=0;j<=G;j++)for(var i=0;i<=G;i++){uv[(j*(G+1)+i)*2]=i/G;uv[(j*(G+1)+i)*2+1]=j/G}
for(j=0;j<G;j++)for(i=0;i<G;i++){var a=j*(G+1)+i;idx[q++]=a;idx[q++]=a+1;idx[q++]=a+G+1;idx[q++]=a+1;idx[q++]=a+G+2;idx[q++]=a+G+1}
var bP=gl.createBuffer(),bB=gl.createBuffer(),bU=gl.createBuffer(),bI=gl.createBuffer(),qP=gl.createBuffer(),qU=gl.createBuffer(),posB=new Float32Array(NV*2);
gl.bindBuffer(gl.ARRAY_BUFFER,bU);gl.bufferData(gl.ARRAY_BUFFER,uv,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,bI);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER,qP);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,S,0,0,S,S,S]),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,qU);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);
gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
function computeFit(){var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,c=Math.cos(TH0),s=Math.sin(TH0);function acc(px,py){var dx=px-700,dy=py-420,X=700+dx*c-dy*s,Y=420+dx*s+dy*c;x0=Math.min(x0,X);y0=Math.min(y0,Y);x1=Math.max(x1,X);y1=Math.max(y1,Y)}
var sv=F.c;F.c=0;F.vx=F.vy=0;for(var j=0;j<=G;j++)for(var i=0;i<=G;i++){if(ACT[Math.min(G-1,j)*G+Math.min(G-1,i)]){var d=disp(i*T,j*T,0);acc(i*T+d[0],j*T+d[1])}}F.c=sv;[[480,170],[940,170],[940,500],[480,500]].forEach(function(p){acc(p[0],p[1])});
return{cx:(x0+x1)/2,cy:(y0+y1)/2,w:x1-x0+360,h:y1-y0+300}}
function rs(){DPR=window.devicePixelRatio||1;W=host.clientWidth;H=host.clientHeight;cf.width=cg.width=co.width=W*DPR;cf.height=cg.height=co.height=H*DPR;gl.viewport(0,0,cg.width,cg.height);fit=computeFit();FIB.forEach(function(f){f.init=false})}
rs();window.addEventListener("resize",rs);var ro=window.ResizeObserver?new ResizeObserver(rs):null;if(ro)ro.observe(host);var run=true;
function onPointerMove(e){var r=host.getBoundingClientRect();mxp=e.clientX-r.left;myp=e.clientY-r.top}function onPointerUp(){mxp=null;myp=null}window.addEventListener("pointermove",onPointerMove);window.addEventListener("pointerup",onPointerUp);
var last=0;
function frame(ms){var t=ms/1000,dt=Math.max(0,Math.min(.05,t-last));last=t;step(t,dt);
var Sc=Math.min(W/fit.w,H/fit.h),fx=Z.x*Sc,fy=Z.y*Sc,th=TH0+Z.roll,cs=Math.cos(th),sn=Math.sin(th),cY=Math.cos(Z.yaw),
M=[1,0,0,1,W/2+fx,H/2+fy];M=mul(M,[Sc,0,0,Sc,0,0]);M=mul(M,[1,0,0,1,-fit.cx,-fit.cy]);M=mul(M,[1,0,0,1,700,420]);M=mul(M,[cs,sn,-sn,cs,0,0]);M=mul(M,[cY,0,0,1,0,0]);M=mul(M,[1,0,0,1,-700,-420]);Mlast=M;
var c=F.c,Mb=M;
var px=null,py=null;if(mxp!=null){var dx0=mxp-M[4],dy0=myp-M[5],det=M[0]*M[3]-M[1]*M[2];px=(M[3]*dx0-M[2]*dy0)/det;py=(-M[1]*dx0+M[0]*dy0)/det}
for(var j=0;j<=G;j++)for(var i=0;i<=G;i++){var X=i*T,Y=j*T,d=disp(X,Y,t),nx=X+d[0]-Math.sin(Z.yaw)*45*ss(430,640,Y),ny=Y+d[1];if(px!=null&&d[0]*d[0]+d[1]*d[1]>.01){var ex=nx-px,ey=ny-py,e=Math.sqrt(ex*ex+ey*ey);if(e<130&&e>1){nx+=ex/e*(1-e/130)*28;ny+=ey/e*(1-e/130)*28}}pos[(j*(G+1)+i)*2]=nx;pos[(j*(G+1)+i)*2+1]=ny;var bd=bdef(X,Y,c);posB[(j*(G+1)+i)*2]=bd[0];posB[(j*(G+1)+i)*2+1]=bd[1]}
gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(uR,W,H);
function draw(A,tx,pb,ub,n,mode){gl.uniform4f(uA,A[0],A[1],A[2],A[3]);gl.uniform2f(uB,A[4],A[5]);gl.bindTexture(gl.TEXTURE_2D,tx);gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.enableVertexAttribArray(aP);gl.vertexAttribPointer(aP,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,ub);gl.enableVertexAttribArray(aT);gl.vertexAttribPointer(aT,2,gl.FLOAT,false,0,0);
if(mode)gl.drawElements(gl.TRIANGLES,n,gl.UNSIGNED_SHORT,0);else gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}
gl.bindBuffer(gl.ARRAY_BUFFER,bP);gl.bufferData(gl.ARRAY_BUFFER,pos,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,bI);
draw(M,tT,bP,bU,idx.length,1);gl.bindBuffer(gl.ARRAY_BUFFER,bB);gl.bufferData(gl.ARRAY_BUFFER,posB,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,bI);draw(M,tB,bB,bU,idx.length,1);
var sf=Sc/.6,bcp=Mb[0]*700+Mb[2]*430+Mb[4],wv=.3+.7*F.c,dCv=Math.max(-3,Math.min(3,F.dC)),dtf=Math.max(.2,Math.min(2.5,dt*60)),GP=[];for(var gq=0;gq<9;gq++)GP.push([new Path2D(),new Path2D()]);
FIB.forEach(function(f){var K=f.K,seg=f.L/K*Sc,rx=Mb[0]*f.rx+Mb[2]*f.ry+Mb[4],ry=Mb[1]*f.rx+Mb[3]*f.ry+Mb[5],k;
if(!f.init){for(k=0;k<K;k++){f.x[k]=f.ox[k]=rx;f.y[k]=f.oy[k]=ry+k*seg}f.init=true}
f.x[0]=rx;f.y[0]=ry;f.ox[0]=rx;f.oy[0]=ry;var env=.7+.3*Math.sin(t*.27+f.ph)+.2*Math.sin(t*.43+f.pp);
for(k=1;k<K;k++){var u=k/K,qx0=f.x[k],qy0=f.y[k],vx=(qx0-f.ox[k])*.96,vy=(qy0-f.oy[k])*.96;f.ox[k]=qx0;f.oy[k]=qy0;
var wph=Math.sin(6.283*Z.ph-k*.55+f.pp*.35),ax=sf*.14*Math.sin(t*(.8+.3*f.f1)+k*.32+f.ph)*Math.pow(u,1.1)*env+sf*wv*.35*wph*u-(qx0-bcp)*.0006*dCv*u*sf,ay=sf*.12+sf*.06*Math.cos(t*(.9+.3*f.f2)+k*.4+f.ph*1.7)*u-sf*wv*.25*wph*u,nx2=qx0+vx+ax*dtf,ny2=qy0+vy+ay*dtf;
if(mxp!=null){var ex2=nx2-mxp,ey2=ny2-myp,e2=Math.sqrt(ex2*ex2+ey2*ey2);if(e2<90&&e2>1){var w2=1-e2/90;nx2+=ex2/e2*w2*2.2;ny2+=ey2/e2*w2*2.2}}
var dx3=nx2-f.x[k-1],dy3=ny2-f.y[k-1],l3=Math.sqrt(dx3*dx3+dy3*dy3)||1;f.x[k]=f.x[k-1]+dx3/l3*seg;f.y[k]=f.y[k-1]+dy3/l3*seg;
if(k>1){var sx2=f.x[k-1]-f.x[k-2],sy2=f.y[k-1]-f.y[k-2],sl=Math.sqrt(sx2*sx2+sy2*sy2)||1;f.x[k]+=(f.x[k-1]+sx2/sl*seg-f.x[k])*.5;f.y[k]+=(f.y[k-1]+sy2/sl*seg-f.y[k])*.5;var m3=Math.sqrt((f.x[k]-f.x[k-1])*(f.x[k]-f.x[k-1])+(f.y[k]-f.y[k-1])*(f.y[k]-f.y[k-1]))||1;f.x[k]=f.x[k-1]+(f.x[k]-f.x[k-1])/m3*seg;f.y[k]=f.y[k-1]+(f.y[k]-f.y[k-1])/m3*seg}}
var hh=Math.floor(K*.55),gp=GP[f.t*3+f.hg],A=gp[0],B=gp[1];A.moveTo(f.x[0],f.y[0]);for(k=1;k<=hh;k++)A.quadraticCurveTo(f.x[k-1],f.y[k-1],(f.x[k-1]+f.x[k])/2,(f.y[k-1]+f.y[k])/2);
B.moveTo(f.x[hh],f.y[hh]);for(k=hh+1;k<K;k++)B.quadraticCurveTo(f.x[k-1],f.y[k-1],(f.x[k-1]+f.x[k])/2,(f.y[k-1]+f.y[k])/2)});
xf.setTransform(DPR,0,0,DPR,0,0);xf.clearRect(0,0,W,H);xf.globalCompositeOperation="lighter";xf.lineCap="round";
for(var ti=0;ti<3;ti++)for(var hg=0;hg<3;hg++){var TT=TIERS[ti],gp2=GP[ti*3+hg],h2=HU[hg];xf.lineWidth=TT.lw*5*Math.max(.7,Sc*1.4);xf.strokeStyle="hsla("+h2+",85%,70%,.04)";xf.stroke(gp2[0]);xf.stroke(gp2[1]);xf.lineWidth=TT.lw*Math.max(.7,Sc*1.4);xf.strokeStyle="hsla("+h2+",80%,84%,"+TT.a+")";xf.stroke(gp2[0]);xf.strokeStyle="hsla("+h2+",80%,84%,"+TT.a*.55+")";xf.stroke(gp2[1])}
PUL.forEach(function(p){p.s+=dt*p.v;var f=FIB[p.f];if(p.s>=1){p.s=0;p.f=Math.floor(R()*FIB.length);return}var uu=p.s*(f.K-1),k0=Math.floor(uu),k1=Math.min(f.K-1,k0+1),ff=uu-k0;blit(xf,p.h,f.x[k0]*(1-ff)+f.x[k1]*ff,f.y[k0]*(1-ff)+f.y[k1]*ff,Math.max(3,5*Sc*1.6),.8*(1-p.s*.5))});
/* glow overlay (2D) in the same space */
x.setTransform(DPR,0,0,DPR,0,0);x.clearRect(0,0,W,H);x.globalCompositeOperation="lighter";
x.save();x.setTransform(DPR*Mb[0],DPR*Mb[1],DPR*Mb[2],DPR*Mb[3],DPR*Mb[4],DPR*Mb[5]);
var cp=.85+.15*Math.sin(t*1.6),cr0=bdef(705,293,F.c),l1=bdef(586,375,F.c),l2=bdef(781,433,F.c);blit(x,205,cr0[0]+Math.sin(Z.yaw)*14,cr0[1],130*cp,.2+.1*Math.sin(t*1.6));blit(x,195,cr0[0]+Math.sin(Z.yaw)*14,cr0[1],38,.2*(.5+.5*Math.sin(t*2.4)));
blit(x,190,l1[0],l1[1],26,.28*(.5+.5*Math.sin(t*2)));blit(x,190,l2[0],l2[1],28,.28*(.5+.5*Math.sin(t*2+2)));
[[600,468],[618,486],[660,502],[678,501]].forEach(function(l,k){blit(x,34,l[0],l[1],13,.3+.3*Math.sin(t*2.2+k*1.7))});
NODES.forEach(function(n,k){if(n.m<.5)return;var tw=Math.pow(Math.sin(t*n.f+n.ph)*.5+.5,3),bn=bdef(n.x,n.y,F.c);blit(x,n.h+14*Math.sin(t*.5+n.ph),bn[0],bn[1],2+n.sz*5,.05+.5*tw);
if(k%3==0&&n.y<420){x.strokeStyle="hsla("+n.h+",95%,72%,"+(.015+.07*tw)+")";x.lineWidth=.6;x.beginPath();x.moveTo(cr0[0]+(bn[0]-cr0[0])*.08,cr0[1]+(bn[1]-cr0[1])*.08);x.lineTo(bn[0],bn[1]);x.stroke()}});
x.restore();x.save();x.setTransform(DPR*M[0],DPR*M[1],DPR*M[2],DPR*M[3],DPR*M[4],DPR*M[5]);
NODES.forEach(function(n){if(n.m>=.5)return;var d=disp(n.x,n.y,t),tw=Math.pow(Math.sin(t*n.f+n.ph)*.5+.5,3);blit(x,n.h+14*Math.sin(t*.5+n.ph),n.x+d[0]-Math.sin(Z.yaw)*45*ss(430,640,n.y),n.y+d[1],2+n.sz*4,.05+.45*tw)});
x.restore();x.globalCompositeOperation="source-over";
if(run)raf=requestAnimationFrame(frame)}
var raf=requestAnimationFrame(frame);return{destroy:function(){if(!run)return;run=false;cancelAnimationFrame(raf);window.removeEventListener("resize",rs);window.removeEventListener("pointermove",onPointerMove);window.removeEventListener("pointerup",onPointerUp);if(ro)ro.disconnect();[tB,tT].forEach(function(t){if(t)gl.deleteTexture(t)});[bP,bB,bU,bI,qP,qU].forEach(function(b){if(b)gl.deleteBuffer(b)});if(pg)gl.deleteProgram(pg);[cf,cg,co].forEach(function(c){if(c.parentNode)c.parentNode.removeChild(c)})}}}
window.MechJelly={load:load,mount:mount};
})();