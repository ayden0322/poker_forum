'use client';

import { useEffect, useRef } from 'react';

/**
 * WebGL 即時擬真火焰特效（noise 流體，無接縫循環、原創零授權）。
 * 用於頭像特效層；僅 profile 情境。尊重 prefers-reduced-motion(降為靜態低幀)。
 * kind 目前支援 'fire'。
 */
const FIRE_FRAG = `
precision highp float;
uniform float u_time;
uniform vec2 u_res;

// --- value noise + fbm ---
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v=0., a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; }
  return v;
}
vec3 firePalette(float t){
  vec3 c=mix(vec3(0.35,0.0,0.0), vec3(0.85,0.12,0.0), smoothstep(0.0,0.35,t));
  c=mix(c, vec3(1.0,0.45,0.05), smoothstep(0.35,0.58,t));
  c=mix(c, vec3(1.0,0.82,0.18), smoothstep(0.58,0.82,t));
  c=mix(c, vec3(1.0,0.98,0.85), smoothstep(0.82,1.0,t));
  return c;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;          // 0..1, y 由下往上
  float t = u_time;
  // 往上捲動的域扭曲 noise → 火舌竄動
  vec2 q = vec2(uv.x*3.0, uv.y*3.4 - t*1.6);
  vec2 warp = vec2(fbm(q+vec2(0.0,t*0.6)), fbm(q+vec2(5.2,t*0.6)));
  float n = fbm(q + warp*1.4);
  // 火源在底部、往上遞減(火往上竄)
  float rise = pow(1.0 - uv.y, 1.5);
  // 水平：中間旺、兩側收
  float horiz = smoothstep(0.0,0.22,uv.x)*smoothstep(1.0,0.78,uv.x);
  // 底部更旺一點
  float base = mix(1.0, 1.35, smoothstep(0.5,0.0,uv.y));
  float flame = n * rise * horiz * base * 1.7;
  flame = clamp(flame,0.0,1.0);
  float alpha = smoothstep(0.18,0.42,flame);
  vec3 col = firePalette(flame);
  gl_FragColor = vec4(col, alpha);
}
`;

const VERT = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.,1.); }`;

export default function ShaderEffect({ kind = 'fire', size }: { kind?: string; size: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
    if (!gl) return;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, kind === 'fire' ? FIRE_FRAG : FIRE_FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, 'u_time'), uRes = gl.getUniformLocation(prog, 'u_res');
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0; const start = performance.now();
    const render = (now: number) => { gl.uniform1f(uTime, (now - start) / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    render(reduced ? start + 2000 : start); // 先同步畫第一幀(保證有畫面，不靠 rAF 首觸)
    if (!reduced) { const loop = (now: number) => { render(now); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
    return () => { cancelAnimationFrame(raf); const ext = gl.getExtension('WEBGL_lose_context'); ext?.loseContext(); };
  }, [kind, size]);

  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, pointerEvents: 'none' }} />;
}
