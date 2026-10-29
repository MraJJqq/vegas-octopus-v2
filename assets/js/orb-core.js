/* 第二层：中央发光球模块。 */

var R=Math.random,PI=Math.PI,cv=document.getElementById("orb-core-canvas"),x=cv.getContext("2d"),W,H,i;
var resizeFrame=0,lastPixelW=0,lastPixelH=0,lastDpr=0;
function rs(){var d=Math.min(1.5,Math.max(1,window.devicePixelRatio||1)),r=cv.getBoundingClientRect(),nw=Math.max(1,r.width),nh=Math.max(1,r.height),pw=Math.round(nw*d),ph=Math.round(nh*d);W=nw;H=nh;if(pw!==lastPixelW||ph!==lastPixelH||d!==lastDpr){lastPixelW=pw;lastPixelH=ph;lastDpr=d;if(cv.width!==pw)cv.width=pw;if(cv.height!==ph)cv.height=ph;x.setTransform(d,0,0,d,0,0)}}
function scheduleResize(){if(resizeFrame)return;resizeFrame=requestAnimationFrame(function(){resizeFrame=0;rs()})}
rs();window.addEventListener("resize",scheduleResize,{passive:true});if(window.ResizeObserver)new ResizeObserver(scheduleResize).observe(cv.parentElement);
var V={spd:.13,zm:.83,ln:2.5,ps:1.6,fl:3};
/* 发光粒子纹理 */
var SG=[];
for(i=0;i<36;i++){(function(h){var c=document.createElement("canvas");c.width=c.height=64;var g=c.getContext("2d"),q=g.createRadialGradient(32,32,0,32,32,32);q.addColorStop(0,"hsla("+h+",100%,85%,1)");q.addColorStop(.25,"hsla("+h+",100%,62%,.5)");q.addColorStop(1,"hsla("+h+",100%,50%,0)");g.fillStyle=q;g.fillRect(0,0,64,64);SG.push(c)})(i*10)}
function blit(h,px,py,s,al){x.globalAlpha=Math.max(0,Math.min(1,al));x.drawImage(SG[((Math.round(h/10)%36)+36)%36],px-s,py-s,s*2,s*2)}
function hrgb(h){h/=360;var q=.62+1-.62,p2=2*.62-q;function f(t){t=((t%1)+1)%1;return t<1/6?p2+(q-p2)*6*t:t<.5?q:t<2/3?p2+(q-p2)*(2/3-t)*6:p2}return[f(h+1/3)*255,f(h)*255,f(h-1/3)*255]}
/* 发光球粒子与颜色模型 */
var PAL=[0,28,52,150,190,245,320,280,170],PR=PAL.map(hrgb),N=900,P=[];
for(i=0;i<N;i++){var y=1-2*(i+.5)/N,r=Math.sqrt(1-y*y),th=i*2.399963;P.push({x:r*Math.cos(th),y:y,z:r*Math.sin(th),k:R(),c:Math.floor(R()*PAL.length),m:R()<.2?0:.5+R()*.4})}
function pj(v,cs,sn,cp,spp,cx,cy,Rr,out){var x1=v.x*cs+v.z*sn,z1=-v.x*sn+v.z*cs,y2=v.y*cp-z1*spp,z2=v.y*spp+z1*cp,f=1+z2*.12,q=out||[0,0,0];q[0]=cx+x1*Rr*f;q[1]=cy+y2*Rr*f;q[2]=z2;return q}

/* drag */
var rot=0,pitB=.32,dn=false,lx=0,ly=0;
cv.addEventListener("pointerdown",function(e){dn=true;lx=e.clientX;ly=e.clientY;try{cv.setPointerCapture(e.pointerId)}catch(_){} });
window.addEventListener("pointerup",function(){dn=false});
cv.addEventListener("pointermove",function(e){if(!dn)return;rot+=(e.clientX-lx)*.008;pitB=Math.max(-1.2,Math.min(1.2,pitB+(e.clientY-ly)*.006));lx=e.clientX;ly=e.clientY});
var projectedPoints=Array.from({length:N},function(){return[0,0,0,0,0]});
var last=0,orbFrame=0,frameTimer=0;
var FRAME_INTERVAL=1000/30;
/* 按目标帧率调度 RAF，避免每个显示器刷新周期都执行无效回调。 */
function scheduleOrbFrame(){if(document.hidden||orbFrame||frameTimer)return;frameTimer=window.setTimeout(function(){frameTimer=0;if(!document.hidden)orbFrame=requestAnimationFrame(frame)},FRAME_INTERVAL)}
function frame(ms){orbFrame=0;if(document.hidden)return;var t=ms/1000,dt=Math.max(0,Math.min(.05,t-last));last=t;if(!dn)rot+=dt*V.spd;
var cx=W*.66,cy=H*.5,roomX=Math.min(cx-8,W-cx-8),roomY=Math.max(1,H*.46),Rr=Math.max(1,Math.min(roomX,roomY)*V.zm),pit=pitB+.1*Math.sin(t*.17),cp=Math.cos(pit),spp=Math.sin(pit);
x.clearRect(0,0,W,H);
var pr=projectedPoints;
for(var n=0;n<N;n++){var p=P[n],yw=rot*(.8+.4*p.k),q=pj(p,Math.cos(yw),Math.sin(yw),cp,spp,cx,cy,Rr,pr[n]),u=(q[0]-(cx-Rr))/(2*Rr);q[3]=Math.max(0,Math.min(1,(.6-u)/.22));q[4]=(q[2]+1)/2}
window.VegasOrbProjectedPoints=pr;
x.globalCompositeOperation="lighter";x.globalAlpha=1;
var g=x.createRadialGradient(cx,cy,0,cx,cy,Rr*.22);g.addColorStop(0,"rgba(255,225,160,.45)");g.addColorStop(1,"rgba(255,200,100,0)");x.fillStyle=g;x.fillRect(cx-Rr*.22,cy-Rr*.22,Rr*.44,Rr*.44);
x.lineWidth=.6;
pr.forEach(function(q,k){var gw=q[3],tw=Math.pow(Math.sin(t*1.1+k*13.7)*.5+.5,3),a=(.012+.11*tw)*(.35+.65*q[4])*(.45+.55*gw)*V.ln;if(a<.012)return;x.strokeStyle="rgba("+(140+115*gw|0)+","+(185+5*gw|0)+","+(255-185*gw|0)+","+Math.min(a,.5)+")";x.beginPath();x.moveTo(cx+(q[0]-cx)*.1,cy+(q[1]-cy)*.1);x.lineTo(q[0],q[1]);x.stroke()});

/* dots */
x.globalAlpha=1;
pr.forEach(function(q,n){var p=P[n],gw=q[3],k=p.k,a=(.25+.5*gw)*(.5+.5*q[4]),b0=140+115*gw,b1=185+5*gw+k*50*gw,b2=255-185*gw,pc=PR[p.c],m=p.m;
x.globalAlpha=1;x.fillStyle="rgba("+(b0+(pc[0]-b0)*m|0)+","+(b1+(pc[1]-b1)*m|0)+","+(b2+(pc[2]-b2)*m|0)+","+a+")";x.beginPath();x.arc(q[0],q[1],(.8+k*2*gw+.5*q[4])*V.ps,0,PI*2);x.fill();
if(k>.45)blit(m>.3?PAL[p.c]:(gw>.5?40:215),q[0],q[1],(4+k*7)*V.ps,.22*(.5+.5*q[4]));
if(n%11==0&&gw>.4){x.globalAlpha=1;x.strokeStyle="rgba(255,200,80,"+(.6*gw)+")";x.lineWidth=.8;x.beginPath();x.arc(q[0],q[1],(4+k*3)*V.ps,0,PI*2);x.stroke()}
});
x.globalAlpha=1;x.globalCompositeOperation="source-over";
 scheduleOrbFrame()}
scheduleOrbFrame();
document.addEventListener("visibilitychange",function(){
if(document.hidden){if(orbFrame){cancelAnimationFrame(orbFrame);orbFrame=0}if(frameTimer){clearTimeout(frameTimer);frameTimer=0}}
else{last=0;scheduleOrbFrame()}
});
