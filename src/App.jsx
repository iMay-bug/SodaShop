import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/* =========================================
   PARTE 1: EFEITO VISUAL (WEBGL & UTILITÁRIOS)
   =========================================
*/

// --- WebGL Shaders (Fundo Fluido) ---
const vertexShaderSource = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = 0.5 * (position + 1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;
uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538
const int u_line_count = 50;
const float u_line_width = 5.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;
    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);
    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;
    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );
    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;
    float line_start = smoothstep(y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur), y, st.y);
    float line_end = smoothstep(y, y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur), st.y);
    return clamp((line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))), 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }
    float colorVal = 1.0 - line_strength;
    fragColor = vec4(uColor * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

const Threads = ({ color = [1, 1, 1], amplitude = 1, distance = 0, enableMouseInteraction = false }) => {
  const canvasRef = useRef(null);
  const animationFrameId = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const compileShader = (source, type) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
      return shader;
    };

    const vertShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const locs = {
      iTime: gl.getUniformLocation(program, 'iTime'),
      iResolution: gl.getUniformLocation(program, 'iResolution'),
      uColor: gl.getUniformLocation(program, 'uColor'),
      uAmplitude: gl.getUniformLocation(program, 'uAmplitude'),
      uDistance: gl.getUniformLocation(program, 'uDistance'),
      uMouse: gl.getUniformLocation(program, 'uMouse'),
    };

    let startTime = performance.now();
    let currentMouse = [0.5, 0.5];
    let targetMouse = [0.5, 0.5];

    function resize() {
        if (!canvas || !canvas.parentElement) return;
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    function handleMouseMove(e) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      targetMouse = [x, y];
    }
    
    if (enableMouseInteraction) window.addEventListener('mousemove', handleMouseMove);

    function render() {
      const time = (performance.now() - startTime) * 0.001;
      if (enableMouseInteraction) {
        currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
      }
      gl.uniform1f(locs.iTime, time);
      gl.uniform3f(locs.iResolution, canvas.width, canvas.height, canvas.width / canvas.height);
      gl.uniform3f(locs.uColor, color[0], color[1], color[2]);
      gl.uniform1f(locs.uAmplitude, amplitude);
      gl.uniform1f(locs.uDistance, distance);
      gl.uniform2f(locs.uMouse, currentMouse[0], currentMouse[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      animationFrameId.current = requestAnimationFrame(render);
    }
    render();

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      window.removeEventListener('resize', resize);
      if (enableMouseInteraction) window.removeEventListener('mousemove', handleMouseMove);
      if (program) gl.deleteProgram(program);
    };
  }, [color, amplitude, distance, enableMouseInteraction]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

/* =========================================
   PARTE 2: COMPONENTES UI (Incluindo ElectricBorder)
   =========================================
*/

const ElectricBorder = ({
  children,
  color = '#5227FF',
  speed = 1,
  chaos = 0.12,
  borderRadius = 24,
  className,
  style,
  onClick
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  // Noise functions
  const random = useCallback(x => {
    return (Math.sin(x * 12.9898) * 43758.5453) % 1;
  }, []);

  const noise2D = useCallback(
    (x, y) => {
      const i = Math.floor(x);
      const j = Math.floor(y);
      const fx = x - i;
      const fy = y - j;

      const a = random(i + j * 57);
      const b = random(i + 1 + j * 57);
      const c = random(i + (j + 1) * 57);
      const d = random(i + 1 + (j + 1) * 57);

      const ux = fx * fx * (3.0 - 2.0 * fx);
      const uy = fy * fy * (3.0 - 2.0 * fy);

      return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
    },
    [random]
  );

  const octavedNoise = useCallback(
    (x, octaves, lacunarity, gain, baseAmplitude, baseFrequency, time, seed, baseFlatness) => {
      let y = 0;
      let amplitude = baseAmplitude;
      let frequency = baseFrequency;

      for (let i = 0; i < octaves; i++) {
        let octaveAmplitude = amplitude;
        if (i === 0) {
          octaveAmplitude *= baseFlatness;
        }
        y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
        frequency *= lacunarity;
        amplitude *= gain;
      }

      return y;
    },
    [noise2D]
  );

  const getCornerPoint = useCallback((centerX, centerY, radius, startAngle, arcLength, progress) => {
    const angle = startAngle + progress * arcLength;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  }, []);

  const getRoundedRectPoint = useCallback(
    (t, left, top, width, height, radius) => {
      const straightWidth = width - 2 * radius;
      const straightHeight = height - 2 * radius;
      const cornerArc = (Math.PI * radius) / 2;
      const totalPerimeter = 2 * straightWidth + 2 * straightHeight + 4 * cornerArc;
      const distance = t * totalPerimeter;

      let accumulated = 0;

      // Top edge
      if (distance <= accumulated + straightWidth) {
        const progress = (distance - accumulated) / straightWidth;
        return { x: left + radius + progress * straightWidth, y: top };
      }
      accumulated += straightWidth;

      // Top-right corner
      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + width - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      // Right edge
      if (distance <= accumulated + straightHeight) {
        const progress = (distance - accumulated) / straightHeight;
        return { x: left + width, y: top + radius + progress * straightHeight };
      }
      accumulated += straightHeight;

      // Bottom-right corner
      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + width - radius, top + height - radius, radius, 0, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      // Bottom edge
      if (distance <= accumulated + straightWidth) {
        const progress = (distance - accumulated) / straightWidth;
        return { x: left + width - radius - progress * straightWidth, y: top + height };
      }
      accumulated += straightWidth;

      // Bottom-left corner
      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      // Left edge
      if (distance <= accumulated + straightHeight) {
        const progress = (distance - accumulated) / straightHeight;
        return { x: left, y: top + height - radius - progress * straightHeight };
      }
      accumulated += straightHeight;

      // Top-left corner
      const progress = (distance - accumulated) / cornerArc;
      return getCornerPoint(left + radius, top + radius, radius, Math.PI, Math.PI / 2, progress);
    },
    [getCornerPoint]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configuration
    const octaves = 10;
    const lacunarity = 1.6;
    const gain = 0.7;
    const amplitude = chaos;
    const frequency = 10;
    const baseFlatness = 0;
    const displacement = 60;
    const borderOffset = 60;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width + borderOffset * 2;
      const height = rect.height + borderOffset * 2;

      // Use device pixel ratio for sharp rendering
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      return { width, height };
    };

    let { width, height } = updateSize();

    const drawElectricBorder = currentTime => {
      if (!canvas || !ctx) return;

      const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
      timeRef.current += deltaTime * speed;
      lastFrameTimeRef.current = currentTime;

      // Clear canvas
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const scale = displacement;
      const left = borderOffset;
      const top = borderOffset;
      const borderWidth = width - 2 * borderOffset;
      const borderHeight = height - 2 * borderOffset;
      const maxRadius = Math.min(borderWidth, borderHeight) / 2;
      const radius = Math.min(borderRadius, maxRadius);

      const approximatePerimeter = 2 * (borderWidth + borderHeight) + 2 * Math.PI * radius;
      const sampleCount = Math.floor(approximatePerimeter / 2);

      ctx.beginPath();

      for (let i = 0; i <= sampleCount; i++) {
        const progress = i / sampleCount;

        const point = getRoundedRectPoint(progress, left, top, borderWidth, borderHeight, radius);

        const xNoise = octavedNoise(
          progress * 8,
          octaves,
          lacunarity,
          gain,
          amplitude,
          frequency,
          timeRef.current,
          0,
          baseFlatness
        );

        const yNoise = octavedNoise(
          progress * 8,
          octaves,
          lacunarity,
          gain,
          amplitude,
          frequency,
          timeRef.current,
          1,
          baseFlatness
        );

        const displacedX = point.x + xNoise * scale;
        const displacedY = point.y + yNoise * scale;

        if (i === 0) {
          ctx.moveTo(displacedX, displacedY);
        } else {
          ctx.lineTo(displacedX, displacedY);
        }
      }

      ctx.closePath();
      ctx.stroke();

      animationRef.current = requestAnimationFrame(drawElectricBorder);
    };

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      const newSize = updateSize();
      width = newSize.width;
      height = newSize.height;
    });
    resizeObserver.observe(container);

    // Start animation
    animationRef.current = requestAnimationFrame(drawElectricBorder);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [color, speed, chaos, borderRadius, octavedNoise, getRoundedRectPoint]);

  const vars = {
    '--electric-border-color': color,
    borderRadius: borderRadius
  };

  return (
    <div ref={containerRef} className={`electric-border ${className ?? ''}`} style={{ ...vars, ...style }} onClick={onClick}>
      <div className="eb-canvas-container">
        <canvas ref={canvasRef} className="eb-canvas" />
      </div>
      <div className="eb-layers">
        <div className="eb-glow-1" />
        <div className="eb-glow-2" />
        <div className="eb-background-glow" />
      </div>
      <div className="eb-content">{children}</div>
    </div>
  );
};

const ScrollReveal = ({ children, baseOpacity = 0, enableBlur = true, baseRotation = 5, blurStrength = 10, style = {} }) => {
  const elementRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  const words = useMemo(() => {
    const text = typeof children === 'string' ? children : '';
    return text.split(/(\s+)/).filter(w => w.trim().length > 0);
  }, [children]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );
    if (elementRef.current) observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={elementRef} className="scroll-reveal-container" style={style}>
      {words.map((word, index) => (
        <span
          key={index}
          className="reveal-word"
          style={{
            display: 'inline-block',
            marginRight: '0.25em',
            opacity: isVisible ? 1 : baseOpacity,
            transform: isVisible ? 'translateY(0) rotate(0deg)' : `translateY(20px) rotate(${baseRotation}deg)`,
            filter: enableBlur ? (isVisible ? 'blur(0px)' : `blur(${blurStrength}px)`) : 'none',
            transition: `all 0.8s cubic-bezier(0.2, 0.65, 0.3, 0.9) ${index * 0.08}s`
          }}
        >
          {word}
        </span>
      ))}
    </div>
  );
};

const GlitchText = ({ children, speed = 1, enableShadows = true, enableOnHover = true, className = '', onClick }) => {
  const inlineStyles = {
    '--after-duration': `${speed * 3}s`,
    '--before-duration': `${speed * 2}s`,
    '--after-shadow': enableShadows ? '-5px 0 #ff00ea' : 'none',
    '--before-shadow': enableShadows ? '5px 0 #00d0ff' : 'none'
  };
  const hoverClass = enableOnHover ? 'enable-on-hover' : '';
  return (
    <div className={`glitch ${hoverClass} ${className}`} style={inlineStyles} data-text={children} onClick={onClick}>
      {children}
    </div>
  );
};

// --- Ícones SVG ---
const IconNatural = ({ color }) => (
  <svg width="50" height="50" viewBox="0 0 60 60" fill="none">
    <circle cx="30" cy="30" r="30" fill={color} fillOpacity="0.1"/>
    <path d="M30 50C30 50 42 38 42 24C42 16 36 12 30 12C24 12 18 16 18 24C18 38 30 50 30 50Z" fill={color} stroke="white" strokeWidth="2"/>
    <path d="M30 12V35" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M30 25L38 20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M30 30L22 26" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconWater = ({ color }) => (
  <svg width="50" height="50" viewBox="0 0 60 60" fill="none">
    <circle cx="30" cy="30" r="30" fill={color} fillOpacity="0.1"/>
    <path d="M30 10C30 10 16 28 16 38C16 45.732 22.268 52 30 52C37.732 52 44 45.732 44 38C44 28 30 10 30 10Z" fill={color} stroke="white" strokeWidth="2"/>
    <path d="M34 26C36 28 37 31 37 35" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6"/>
  </svg>
);
const IconFizz = ({ color }) => (
  <svg width="50" height="50" viewBox="0 0 60 60" fill="none">
    <circle cx="30" cy="30" r="30" fill={color} fillOpacity="0.1"/>
    <circle cx="30" cy="30" r="8" fill={color} stroke="white" strokeWidth="2"/>
    <circle cx="42" cy="18" r="5" fill={color} stroke="white" strokeWidth="2"/>
    <circle cx="16" cy="40" r="6" fill={color} stroke="white" strokeWidth="2"/>
    <circle cx="40" cy="45" r="3" fill={color} stroke="white" strokeWidth="2"/>
    <path d="M22 18L26 22" stroke={color} strokeWidth="3" strokeLinecap="round"/>
  </svg>
);
const IconSugarFree = ({ color }) => (
  <svg width="50" height="50" viewBox="0 0 60 60" fill="none">
    <circle cx="30" cy="30" r="30" fill={color} fillOpacity="0.1"/>
    <path d="M18 30H42" stroke={color} strokeWidth="4" strokeLinecap="round"/>
    <circle cx="30" cy="30" r="14" stroke={color} strokeWidth="3"/>
    <path d="M20 40L40 20" stroke={color} strokeWidth="3"/>
  </svg>
);
const IconRecycle = ({ color }) => (
  <svg width="50" height="50" viewBox="0 0 60 60" fill="none">
    <circle cx="30" cy="30" r="30" fill={color} fillOpacity="0.1"/>
    <path d="M30 14L34 20H26L30 14Z" fill={color}/>
    <path d="M44 36L40 42L36 36H44Z" fill={color}/>
    <path d="M16 36L20 42L24 36H16Z" fill={color}/>
    <circle cx="30" cy="32" r="10" stroke={color} strokeWidth="2" strokeDasharray="4 4"/>
  </svg>
);
const IconVitamin = ({ color }) => (
  <svg width="50" height="50" viewBox="0 0 60 60" fill="none">
     <circle cx="30" cy="30" r="30" fill={color} fillOpacity="0.1"/>
     <path d="M22 20L30 40L38 20" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
     <path d="M20 16H40" stroke={color} strokeWidth="2" strokeOpacity="0.5"/>
     <circle cx="45" cy="45" r="4" fill={color}/>
  </svg>
);

/* =========================================
   PARTE 3: DADOS
   =========================================
*/
const products = [
  // Clássicos
  { id: 1, name: "Cola Classic", slogan: "Sabor Lendário", desc: "A receita original que refresca gerações. O equilíbrio perfeito entre o doce e o gás.", price: 5.50, hex: "#d90429", rgb: [0.85, 0.02, 0.16], badge: "Best Seller" },
  { id: 2, name: "Lemon Shock", slogan: "Energia Cítrica", desc: "Um choque de limão para despertar seus sentidos. Acidez na medida certa.", price: 4.90, hex: "#70e000", rgb: [0.44, 0.88, 0.0] },
  { id: 3, name: "Blue Berry", slogan: "Onda Profunda", desc: "Mergulhe no sabor intenso de mirtilo selvagem. Uma experiência única.", price: 6.00, hex: "#0096c7", rgb: [0.0, 0.59, 0.78] },
  { id: 4, name: "Grape Galaxy", slogan: "Sabor Espacial", desc: "Viaje para outra dimensão com o sabor da uva. Doçura de outro mundo.", price: 5.80, hex: "#7209b7", rgb: [0.45, 0.04, 0.72] },
  { id: 5, name: "Orange Sun", slogan: "Verão Líquido", desc: "O gosto do sol em cada gole. Vitamina C e refrescância pura.", price: 5.20, hex: "#fb8500", rgb: [0.98, 0.52, 0.0] },
  { id: 6, name: "Pink Lychee", slogan: "Doce Mistério", desc: "O sabor exótico da lichia com um toque de água de rosas.", price: 7.00, hex: "#ff006e", rgb: [1.0, 0.0, 0.43], badge: "Novo" },

  // Novos Sabores
  { id: 7, name: "Vanilla Sky", slogan: "Suavidade Pura", desc: "O toque cremoso da baunilha de Madagascar em uma soda leve.", price: 6.50, hex: "#f4a261", rgb: [0.96, 0.63, 0.38] },
  { id: 8, name: "Cherry Bomb", slogan: "Explosão Vermelha", desc: "Cereja intensa com um final picante. Para quem tem atitude.", price: 6.20, hex: "#9e0059", rgb: [0.62, 0.0, 0.35] },
  { id: 9, name: "Mint Breeze", slogan: "Refresco Glacial", desc: "Hortelã fresca com limão siciliano. O mais refrescante de todos.", price: 5.00, hex: "#00b4d8", rgb: [0.0, 0.7, 0.85] },
  { id: 10, name: "Green Apple", slogan: "Mordida Crocante", desc: "A acidez perfeita da maçã verde em forma líquida.", price: 5.50, hex: "#38b000", rgb: [0.22, 0.69, 0.0] },
  { id: 11, name: "Peach Paradise", slogan: "Néctar Divino", desc: "Doce como um pêssego maduro colhido na hora.", price: 5.90, hex: "#ff9f1c", rgb: [1.0, 0.62, 0.11] },
  { id: 12, name: "Watermelon Wave", slogan: "Splash de Verão", desc: "O sabor inconfundível da melancia gelada.", price: 5.50, hex: "#ff4d6d", rgb: [1.0, 0.3, 0.43] },
  { id: 13, name: "Coconut Chill", slogan: "Vibe Tropical", desc: "Água de coco gaseificada com um toque de creme.", price: 6.80, hex: "#ced4da", rgb: [0.8, 0.83, 0.85] },
  { id: 14, name: "Ginger Gold", slogan: "Toque Picante", desc: "Gengibre real com mel. Perfeito para digestão e sabor.", price: 6.00, hex: "#dda15e", rgb: [0.86, 0.63, 0.37] },
  { id: 15, name: "Tropical Punch", slogan: "Festa de Frutas", desc: "Mix de manga, maracujá e abacaxi. Uma festa na boca.", price: 6.50, hex: "#ffbe0b", rgb: [1.0, 0.75, 0.04], badge: "Favorito" },
  { id: 16, name: "Black Currant", slogan: "Sabor da Noite", desc: "Cassis profundo e sofisticado. Menos doce, mais sabor.", price: 7.50, hex: "#3c096c", rgb: [0.23, 0.03, 0.42] },
  { id: 17, name: "Root Beer Retro", slogan: "Clássico Americano", desc: "Especiarias e raízes em uma receita vintage.", price: 6.00, hex: "#583101", rgb: [0.34, 0.19, 0.0] },
  { id: 18, name: "Guava Glow", slogan: "Doçura Tropical", desc: "Goiaba vermelha suculenta. O sabor do Brasil.", price: 5.50, hex: "#f25c54", rgb: [0.95, 0.36, 0.33] },
  { id: 19, name: "Kiwi Kick", slogan: "Verde Elétrico", desc: "Kiwi ácido com morango doce. O equilíbrio perfeito.", price: 5.80, hex: "#70e000", rgb: [0.44, 0.88, 0.0] },
  { id: 20, name: "Acai Power", slogan: "Energia da Amazônia", desc: "Açaí puro com guaraná. Energia natural.", price: 7.00, hex: "#240046", rgb: [0.14, 0.0, 0.27] },
  { id: 21, name: "Pineapple Pop", slogan: "Rei das Frutas", desc: "Abacaxi com hortelã. Refrescância tropical.", price: 5.50, hex: "#ffea00", rgb: [1.0, 0.92, 0.0] },
  { id: 22, name: "Strawberry Spark", slogan: "Doce Paixão", desc: "Morangos silvestres com um toque de pimenta rosa.", price: 6.20, hex: "#d00000", rgb: [0.81, 0.0, 0.0] },
  { id: 23, name: "Lime Twist", slogan: "Citrino Duplo", desc: "Limão Taiti e Siciliano juntos. Acidez máxima.", price: 5.00, hex: "#ccff33", rgb: [0.8, 1.0, 0.2] },
  { id: 24, name: "Melon Mist", slogan: "Orvalho Doce", desc: "Melão cantaloupe suave e aromático.", price: 5.80, hex: "#9ef01a", rgb: [0.62, 0.94, 0.1] },
  { id: 25, name: "Dragon Fire", slogan: "Beleza Exótica", desc: "Pitaya rosa com limão. Lindo e delicioso.", price: 7.50, hex: "#ff0a54", rgb: [1.0, 0.04, 0.33], badge: "Limitado" },
  { id: 26, name: "Coffee Buzz", slogan: "Despertar Gelado", desc: "Cold brew coffee com gás e um toque de caramelo.", price: 6.50, hex: "#6f4e37", rgb: [0.43, 0.3, 0.21] }
];

/* =========================================
   PARTE 4: COMPONENTES DE PÁGINA
   =========================================
*/

// --- Mini Can for Catalog/Cart ---
const MiniCan = ({ color, scale = 1 }) => (
  <div className="mini-can-wrapper" style={{ transform: `scale(${scale})` }}>
    <div className="soda-can-3d mini" style={{ '--can-color': color }}>
        <div className="can-logo">SODA</div>
    </div>
  </div>
);

// --- Cart View (Nova) ---
const CartView = ({ items, onClose, onRemove }) => {
    const total = items.reduce((acc, item) => acc + item.price, 0);

    return (
        <div className="cart-overlay fade-in">
            <div className="cart-content">
                <div className="cart-header">
                    <h2>Seu Carrinho</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                {items.length === 0 ? (
                    <div className="empty-cart">
                        <p>Seu carrinho está vazio.</p>
                        <button className="back-btn" onClick={onClose}>Continuar Comprando</button>
                    </div>
                ) : (
                    <>
                        <div className="cart-items">
                            {items.map((item, index) => (
                                <div key={`${item.id}-${index}`} className="cart-item">
                                    <div className="cart-item-visual">
                                        <MiniCan color={item.hex} scale={0.6} />
                                    </div>
                                    <div className="cart-item-info">
                                        <h3>{item.name}</h3>
                                        <span>R$ {item.price.toFixed(2)}</span>
                                    </div>
                                    <button className="remove-btn" onClick={() => onRemove(index)}>Remover</button>
                                </div>
                            ))}
                        </div>
                        <div className="cart-footer">
                            <div className="total-row">
                                <span>Total</span>
                                <span className="total-price">R$ {total.toFixed(2)}</span>
                            </div>
                            <button className="checkout-btn" onClick={() => alert("Checkout iniciado!")}>
                                Finalizar Compra
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// --- Catalog View (Atualizada com ElectricBorder) ---
const CatalogView = ({ onBack, onAddToCart }) => {
    const [filter, setFilter] = useState('');
    
    const filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="catalog-container fade-in">
            <div className="catalog-header">
                <div>
                    <h2>Catálogo Completo</h2>
                    <p style={{opacity: 0.6}}>Descubra nossa coleção de 26 sabores únicos.</p>
                </div>
                <input 
                    type="text" 
                    placeholder="Buscar sabor..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="products-grid">
                {filteredProducts.map(product => {
                    // Lógica para ElectricBorder
                    const isBestSeller = product.badge === 'Best Seller';
                    const isLimited = product.badge === 'Limitado';
                    const isSpecial = isBestSeller || isLimited;
                    
                    // Cores do efeito: Dourado para Best Seller, Magenta para Limitado
                    const borderColor = isBestSeller ? '#FFC107' : (isLimited ? '#D500F9' : '#fff');

                    const CardContent = (
                        <>
                            {product.badge && <span className="card-badge" style={{ background: isLimited ? '#D500F9' : '#111' }}>{product.badge}</span>}
                            <div className="card-visual">
                                 <MiniCan color={product.hex} />
                            </div>
                            <div className="card-info">
                                <h3>{product.name}</h3>
                                <p className="card-slogan">{product.slogan}</p>
                                <div className="card-bottom">
                                    <span className="price">R$ {product.price.toFixed(2)}</span>
                                    <button className="add-btn-small">
                                        +
                                    </button>
                                </div>
                            </div>
                        </>
                    );

                    if (isSpecial) {
                         return (
                            <ElectricBorder 
                                key={product.id} 
                                color={borderColor} 
                                className="product-card special-card"
                                onClick={() => onAddToCart(product)}
                            >
                                {CardContent}
                            </ElectricBorder>
                         );
                    }

                    return (
                        <div key={product.id} className="product-card group" onClick={() => onAddToCart(product)}>
                            {CardContent}
                        </div>
                    );
                })}
            </div>
            
            <div className="catalog-footer">
                <button className="back-btn" onClick={onBack}>← Voltar para Home</button>
            </div>
        </div>
    );
};

// --- Home View ---
const HomeView = ({ activeProduct, setActiveProduct, onAddToCart, onOpenCatalog }) => {
    return (
        <div className="main-layout fade-in">
        
        {/* ESQUERDA: CONTEÚDO SCROLLÁVEL */}
        <div className="content-column">
          
          {/* SEÇÃO 1: HERO TEXT */}
          <section className="section-block" id="sabores">
            <div className="hero-title-wrapper">
              <ScrollReveal baseOpacity={0} enableBlur={true} baseRotation={5} blurStrength={10}>
                {activeProduct.name}
              </ScrollReveal>
            </div>
            
            <ScrollReveal baseOpacity={0.5} enableBlur={false} baseRotation={0}>
               {activeProduct.slogan}
            </ScrollReveal>
            
            <p className="hero-desc">{activeProduct.desc}</p>
            <div style={{ marginBottom: '1rem', fontSize: '2rem', fontWeight: 'bold', color: activeProduct.hex }}>
              R$ {activeProduct.price.toFixed(2)}
            </div>

            <div className="glitch-btn-wrapper">
              <GlitchText 
                speed={0.5} 
                enableShadows={true} 
                enableOnHover={true}
                onClick={() => onAddToCart(activeProduct)}
              >
                ADICIONAR AO CARRINHO
              </GlitchText>
            </div>
          </section>

          {/* SEÇÃO 2: INGREDIENTES */}
          <section className="section-block" id="ingredientes">
            <div className="section-title">
              <ScrollReveal baseOpacity={0} enableBlur={true} baseRotation={3} blurStrength={5}>
                O Que Tem Dentro?
              </ScrollReveal>
            </div>
            <div className="ingredients-grid">
              
              <div className="ingredient-card">
                <div className="icon-wrapper">
                  <IconNatural color={activeProduct.hex} />
                </div>
                <div>
                  <h3>100% Natural</h3>
                  <p>Fruta de verdade.</p>
                </div>
              </div>

              <div className="ingredient-card">
                <div className="icon-wrapper">
                  <IconWater color="#03a9f4" />
                </div>
                <div>
                  <h3>Água Pura</h3>
                  <p>Filtragem tripla.</p>
                </div>
              </div>

              <div className="ingredient-card">
                <div className="icon-wrapper">
                  <IconFizz color="#ff9800" />
                </div>
                <div>
                  <h3>Gás Ideal</h3>
                  <p>Bolhas perfeitas.</p>
                </div>
              </div>

               <div className="ingredient-card">
                <div className="icon-wrapper">
                  <IconSugarFree color="#e91e63" />
                </div>
                <div>
                  <h3>Baixo Açúcar</h3>
                  <p>Apenas cana orgânica.</p>
                </div>
              </div>

               <div className="ingredient-card">
                <div className="icon-wrapper">
                  <IconVitamin color="#ffc107" />
                </div>
                <div>
                  <h3>Vitaminas</h3>
                  <p>Rico em Vitamina C.</p>
                </div>
              </div>

               <div className="ingredient-card">
                <div className="icon-wrapper">
                  <IconRecycle color="#4caf50" />
                </div>
                <div>
                  <h3>Eco-Friendly</h3>
                  <p>Lata 100% reciclável.</p>
                </div>
              </div>

            </div>
          </section>

          {/* SEÇÃO 3: CHAMADA PARA O CATÁLOGO */}
          <section className="section-block">
            <div className="catalog-box">
              <h2>Explore o Universo</h2>
              <p>Temos 26 sabores esperando por você. Do clássico ao exótico.</p>
              <button className="catalog-btn" onClick={onOpenCatalog}>
                Ver Todos os 26 Sabores
              </button>
            </div>
          </section>

          <footer className="footer">
            © 2025 SodaPop Inc. Todos os direitos reservados.
          </footer>
        </div>

        {/* DIREITA: VISUAL FIXO (STICKY) */}
        <div className="visual-column">
          <div className="soda-can-3d" style={{ '--can-color': activeProduct.hex }}>
            <div className="can-logo">SODA</div>
          </div>

          <div className="selector">
             {/* Mostra apenas os 5 primeiros para não poluir a home */}
            {products.slice(0, 5).map(p => (
              <button
                key={p.id}
                className={`product-btn ${activeProduct.id === p.id ? 'active' : ''}`}
                style={{ backgroundColor: p.hex }}
                onClick={() => setActiveProduct(p)}
                title={p.name}
              />
            ))}
             <button className="product-btn more-btn" onClick={onOpenCatalog} title="Ver Mais">
                +
             </button>
          </div>
        </div>
      </div>
    );
};

/* =========================================
   PARTE 5: APLICAÇÃO PRINCIPAL (APP)
   =========================================
*/
export default function App() {
  const [activeProduct, setActiveProduct] = useState(products[0]);
  const [cartItems, setCartItems] = useState([]); // Array de objetos
  const [cartAnimate, setCartAnimate] = useState(false);
  const [view, setView] = useState('home'); // 'home', 'catalog', 'cart'

  // Animação do carrinho ao adicionar
  const addToCart = (product) => {
      setCartItems(prev => [...prev, product]);
      setCartAnimate(true);
      setTimeout(() => setCartAnimate(false), 300);
  };

  const removeFromCart = (indexToRemove) => {
      setCartItems(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const themeStyles = {
    '--bg-color': '#f8f9fa',
    '--text-color': '#212529',
    '--card-bg': '#ffffff',
    '--shadow-color': 'rgba(0,0,0,0.06)',
    '--border-color': 'rgba(0,0,0,0.04)'
  };

  return (
    <div className="app-container" style={themeStyles}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,700;0,900;1,900&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
          font-family: 'Montserrat', sans-serif;
          background-color: var(--bg-color);
          color: var(--text-color);
          overflow-x: hidden;
        }

        /* --- ELECTRIC BORDER CSS --- */
        .electric-border {
          --electric-light-color: white; /* Fallback simples se oklch falhar */
          position: relative;
          border-radius: inherit;
          overflow: visible; /* Importante para o brilho vazar */
          isolation: isolate;
          cursor: pointer;
          transition: transform 0.3s;
          background: white; /* Fundo do card */
          border-radius: 24px; /* Igual ao card normal */
        }
        .electric-border:hover { transform: scale(1.02); z-index: 10; }

        .eb-canvas-container {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%); pointer-events: none; z-index: 2;
        }
        .eb-canvas { display: block; }
        .eb-content { position: relative; border-radius: inherit; z-index: 1; height: 100%; display: flex; flex-direction: column; }
        .eb-layers { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 0; }
        .eb-glow-1, .eb-glow-2, .eb-background-glow {
          position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-sizing: border-box;
        }
        .eb-glow-1 { border: 2px solid var(--electric-border-color); filter: blur(2px); opacity: 0.6; }
        .eb-glow-2 { border: 1px solid var(--electric-border-color); filter: blur(1px); }
        .eb-background-glow {
          z-index: -1; transform: scale(1.1); filter: blur(20px); opacity: 0.2;
          background: linear-gradient(-30deg, var(--electric-border-color), transparent, var(--electric-border-color));
        }

        /* TEXTURA DE GRANULAÇÃO (NOISE) */
        .noise-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none; z-index: 9999; opacity: 0.02;
            background: url('data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E');
        }

        .app-container { width: 100vw; min-height: 100vh; position: relative; }

        .background-layer {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 0; opacity: 0.15;
          pointer-events: none; 
        }

        /* --- NAVBAR --- */
        .navbar {
          position: fixed; top: 0; width: 100%; padding: 1.5rem 5%;
          display: flex; justify-content: space-between; align-items: center;
          z-index: 1000; backdrop-filter: blur(12px);
          background: rgba(255,255,255,0.85);
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        .logo { font-weight: 900; font-size: 1.5rem; letter-spacing: -1px; cursor: pointer; }
        .logo span { color: ${activeProduct.hex}; transition: color 0.5s; }
        
        .nav-right { display: flex; align-items: center; gap: 20px; }
        .nav-links { display: flex; gap: 20px; }
        .nav-links button, .nav-links a { 
          color: var(--text-color); opacity: 0.7; 
          text-decoration: none; font-size: 0.9rem; font-weight: 600;
          transition: 0.3s; background: none; border: none; cursor: pointer; font-family: inherit;
        }
        .nav-links button:hover, .nav-links a:hover { opacity: 1; color: ${activeProduct.hex}; }

        .cart-icon { width: 20px; height: 20px; fill: currentColor; }

        .cart-btn {
          background: #111; color: white;
          border: none; padding: 10px 20px; border-radius: 30px; 
          font-weight: 700; cursor: pointer; transition: transform 0.2s;
          display: flex; align-items: center; gap: 10px; font-size: 0.9rem;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .cart-btn.pop { animation: pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .cart-btn:hover { transform: scale(1.05); background: #000; }
        
        @keyframes pop {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }

        /* --- CART OVERLAY CSS --- */
        .cart-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 2000;
            display: flex; justify-content: flex-end;
            backdrop-filter: blur(5px);
        }
        .cart-content {
            width: 100%; max-width: 450px; background: white; height: 100%;
            padding: 2rem; display: flex; flex-direction: column;
            box-shadow: -10px 0 30px rgba(0,0,0,0.1);
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        
        .cart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
        .cart-header h2 { font-size: 1.5rem; font-weight: 800; text-transform: uppercase; }
        .close-btn { background: none; border: none; font-size: 2rem; cursor: pointer; opacity: 0.5; }
        .close-btn:hover { opacity: 1; }

        .cart-items { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; }
        .cart-item { display: flex; align-items: center; gap: 1rem; padding: 1rem; border: 1px solid #eee; border-radius: 12px; }
        .cart-item-visual { width: 50px; height: 80px; position: relative; }
        .cart-item-info { flex: 1; }
        .cart-item-info h3 { font-size: 1rem; font-weight: 700; margin-bottom: 0.2rem; }
        .cart-item-info span { font-size: 0.9rem; color: #666; font-weight: 600; }
        .remove-btn { background: #fee; color: red; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
        
        .cart-footer { margin-top: 2rem; border-top: 2px solid #111; padding-top: 1rem; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 1.5rem; font-size: 1.2rem; font-weight: 800; }
        .checkout-btn { width: 100%; background: #111; color: white; border: none; padding: 15px; border-radius: 30px; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; }
        .checkout-btn:hover { background: #333; }

        /* --- HOME LAYOUT --- */
        .main-layout {
          position: relative; z-index: 10;
          display: flex; width: 100%; min-height: 100vh;
          padding-top: 80px;
        }
        .content-column {
          width: 50%; padding: 2rem 5% 5rem 10%;
          display: flex; flex-direction: column; gap: 8rem;
        }
        .visual-column {
          width: 50%; height: calc(100vh - 80px);
          position: sticky; top: 80px;
          display: flex; align-items: center; justify-content: center;
          perspective: 1200px;
        }

        /* --- CATALOG LAYOUT --- */
        .catalog-container {
            position: relative; z-index: 10;
            padding: 120px 8% 4rem;
            min-height: 100vh;
            width: 100%;
        }
        .catalog-header { 
            display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4rem; flex-wrap: wrap; gap: 20px;
        }
        .catalog-header h2 { font-size: 3rem; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; margin-bottom: 0.5rem; }
        .search-input {
            padding: 15px 25px; border-radius: 50px; border: 1px solid var(--border-color);
            background: white; color: var(--text-color); font-family: inherit; font-size: 1rem;
            width: 350px; box-shadow: 0 10px 30px -5px var(--shadow-color); outline: none; transition: 0.3s;
        }
        .search-input:focus { box-shadow: 0 10px 30px -5px rgba(0,0,0,0.12); border-color: #ddd; }
        
        .products-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 2.5rem;
        }
        
        /* CARD PADRÃO */
        .product-card {
            position: relative;
            background: white; border-radius: 24px; overflow: hidden;
            border: 1px solid var(--border-color);
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer; display: flex; flex-direction: column;
            box-shadow: 0 10px 20px var(--shadow-color);
            height: 100%;
        }
        .product-card.group:hover { opacity: 1; scale: 1.02; z-index: 2; box-shadow: 0 20px 40px rgba(0,0,0,0.1); border-color: ${activeProduct.hex}; }
        
        .card-badge {
            position: absolute; top: 15px; left: 15px; z-index: 5;
            background: #111; color: white; padding: 5px 12px; border-radius: 20px;
            font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
        }

        .card-visual { 
            height: 220px; display: flex; align-items: center; justify-content: center; 
            background: radial-gradient(circle at center, #f8f9fa 0%, #ffffff 70%); 
            position: relative; overflow: hidden;
        }
        .card-visual::after {
             content: ''; position: absolute; width: 100%; height: 100%;
             background: linear-gradient(0deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 40%);
        }
        
        .card-info { padding: 1.5rem; flex: 1; display: flex; flex-direction: column; }
        .card-info h3 { font-size: 1.4rem; margin-bottom: 0.3rem; font-weight: 800; letter-spacing: -0.5px; }
        .card-slogan { font-size: 0.85rem; color: #666; margin-bottom: 1.5rem; flex: 1; font-weight: 500; }
        .card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 1rem; border-top: 1px solid #f0f0f0; }
        .price { font-weight: 800; font-size: 1.1rem; }
        .add-btn-small { 
            background: #f0f0f0; color: #333; border: none; 
            width: 40px; height: 40px; border-radius: 50%; font-size: 1.4rem; cursor: pointer;
            transition: 0.2s; display: flex; align-items: center; justify-content: center;
        }
        .product-card:hover .add-btn-small { background: #111; color: white; }

        .catalog-footer { margin-top: 5rem; text-align: center; padding-bottom: 2rem; }
        .back-btn { background: white; color: var(--text-color); border: 2px solid #eee; padding: 12px 35px; border-radius: 30px; font-weight: 700; cursor: pointer; transition: 0.3s; font-size: 1rem; }
        .back-btn:hover { border-color: #111; transform: translateY(-3px); }

        /* --- COMPONENTES GERAIS --- */
        .hero-title-wrapper {
          font-size: clamp(3.5rem, 6vw, 7rem); 
          line-height: 0.9; text-transform: uppercase;
          margin-bottom: 0.5rem; color: ${activeProduct.hex};
          font-weight: 900; font-style: italic;
          text-shadow: 3px 3px 0px rgba(0,0,0,0.03);
          transition: color 0.5s; letter-spacing: -2px;
        }
        .hero-desc { 
          max-width: 420px; color: var(--text-color); 
          opacity: 0.75; margin-bottom: 2rem; line-height: 1.7; font-weight: 500; font-size: 1.1rem;
        }

        /* GLITCH BUTTON */
        .glitch-btn-wrapper { display: inline-block; margin-top: 1rem; }
        .glitch {
          color: #fff; font-size: 1.2rem; white-space: nowrap; font-weight: 800; letter-spacing: 1px;
          position: relative; user-select: none; cursor: pointer;
          background: ${activeProduct.hex}; padding: 18px 45px; border-radius: 40px;
          box-shadow: 0 10px 30px ${activeProduct.hex}55; transition: transform 0.2s;
        }
        .glitch:hover { transform: scale(1.05); }
        .glitch::after, .glitch::before {
          content: attr(data-text); position: absolute; top: 0; left: 0;
          width: 100%; height: 100%; color: #fff; background-color: var(--bg-color);
          overflow: hidden; clip-path: inset(0 0 0 0); border-radius: 40px;
          display: flex; align-items: center; justify-content: center; z-index: -1;
        }
        .glitch.enable-on-hover::after, .glitch.enable-on-hover::before { content: ''; opacity: 0; animation: none; }
        .glitch.enable-on-hover:hover::after {
          content: attr(data-text); opacity: 1; left: 4px; text-shadow: var(--after-shadow);
          background-color: ${activeProduct.hex};
          animation: animate-glitch var(--after-duration) infinite linear alternate-reverse;
        }
        .glitch.enable-on-hover:hover::before {
          content: attr(data-text); opacity: 1; left: -4px; text-shadow: var(--before-shadow);
          background-color: ${activeProduct.hex};
          animation: animate-glitch var(--before-duration) infinite linear alternate-reverse;
        }
        @keyframes animate-glitch {
          0% { clip-path: inset(20% 0 50% 0); }
          50% { clip-path: inset(60% 0 10% 0); }
          100% { clip-path: inset(10% 0 70% 0); }
        }

        /* LATA 3D */
        .soda-can-3d {
          position: relative; width: 240px; height: 420px;
          background: linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(255,255,255,0.1) 15%, rgba(255,255,255,0.5) 30%, var(--can-color) 40%, rgba(255,255,255,0.8) 50%, var(--can-color) 60%, rgba(0,0,0,0.5) 85%, rgba(0,0,0,0.8) 100%);
          background-color: var(--can-color); background-size: 200% 100%;
          border-radius: 34px / 18px;
          transform: rotateY(-25deg) rotateX(5deg) rotateZ(10deg);
          transform-style: preserve-3d;
          box-shadow: -40px 40px 80px rgba(0,0,0,0.15), inset 0px 5px 20px rgba(255,255,255,0.3);
          transition: background-color 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
          animation: floatCan 6s ease-in-out infinite;
        }
        .soda-can-3d.mini {
             width: 80px; height: 140px;
             border-radius: 12px / 6px;
             animation: floatCan 8s ease-in-out infinite reverse;
             box-shadow: -15px 15px 30px rgba(0,0,0,0.08);
        }
        .soda-can-3d::before {
          content: ''; position: absolute; top: -16px; left: 0; width: 100%; height: 48px;
          background: radial-gradient(circle at 50% 50%, #f0f0f0 20%, #ccc 30%, #f0f0f0 40%, #999 60%);
          border-radius: 50%; border: 1px solid #999; border-bottom: 4px solid #666;
        }
        .soda-can-3d.mini::before { top: -6px; height: 16px; border-bottom: 2px solid #666; }
        
        .can-logo {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%) rotate(-90deg);
          font-size: 5rem; font-weight: 900; color: rgba(255,255,255,0.95);
          text-shadow: 0 4px 10px rgba(0,0,0,0.2); letter-spacing: 4px; z-index: 3; white-space: nowrap;
        }
        .soda-can-3d.mini .can-logo { font-size: 1.6rem; letter-spacing: 2px; }
        
        @keyframes floatCan {
          0%, 100% { transform: translateY(0) rotateY(-25deg) rotateX(5deg) rotateZ(10deg); }
          50% { transform: translateY(-25px) rotateY(-20deg) rotateX(5deg) rotateZ(8deg); }
        }

        .selector {
          position: absolute; bottom: 50px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 0.8rem; z-index: 10;
          background: rgba(255,255,255,0.9); padding: 12px 25px; border-radius: 60px;
          border: 1px solid rgba(0,0,0,0.05); backdrop-filter: blur(15px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.08);
        }
        .product-btn { 
            width: 45px; height: 45px; border-radius: 50%; border: 3px solid white; 
            cursor: pointer; transition: all 0.3s; box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .product-btn.active { border-color: #111; transform: scale(1.2); z-index: 2; }
        .more-btn { background: #f0f0f0; color: #333; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 300; border: none; }
        .more-btn:hover { background: #111; color: white; transform: rotate(90deg); }

        /* INGREDIENTS GRID 2.0 */
        .ingredients-grid { 
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 1.5rem; margin-top: 2rem; 
        }
        .ingredient-card {
          background: white; padding: 1.5rem; border-radius: 20px; text-align: left;
          box-shadow: 0 10px 20px rgba(0,0,0,0.03); border: 1px solid var(--border-color);
          transition: transform 0.3s, box-shadow 0.3s; display: flex; align-items: center; gap: 15px;
        }
        .ingredient-card:hover { transform: translateY(-5px); box-shadow: 0 15px 30px rgba(0,0,0,0.08); }
        .icon-wrapper { 
            width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            background: #f8f9fa; border-radius: 50%; padding: 10px; transition: background 0.3s;
        }
        .ingredient-card:hover .icon-wrapper { background: white; border: 2px solid ${activeProduct.hex}; }
        .ingredient-card h3 { font-size: 1rem; font-weight: 700; margin-bottom: 2px; }
        .ingredient-card p { font-size: 0.85rem; color: #666; margin: 0; }

        .catalog-box {
          background: white; padding: 4rem; border-radius: 40px; text-align: center;
          border: 1px solid var(--border-color); box-shadow: 0 20px 60px rgba(0,0,0,0.05);
          position: relative; overflow: hidden;
        }
        .catalog-btn {
          margin-top: 2.5rem; background: transparent; border: 2px solid ${activeProduct.hex};
          color: var(--text-color); padding: 18px 50px; font-size: 1.1rem; font-weight: 800;
          border-radius: 50px; cursor: pointer; transition: 0.3s; text-transform: uppercase; letter-spacing: 1px;
        }
        .catalog-btn:hover { background: ${activeProduct.hex}; color: white; box-shadow: 0 10px 30px ${activeProduct.hex}44; }

        .footer { text-align: center; padding: 2rem; opacity: 0.4; font-size: 0.8rem; font-weight: 600; }
        
        .fade-in { animation: fadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        
        @media(max-width: 900px) {
          .main-layout { flex-direction: column-reverse; }
          .content-column { width: 100%; padding-top: 480px; gap: 5rem; }
          .visual-column { 
            width: 100%; height: 450px; position: fixed; top: 80px; left: 0; z-index: -1;
            opacity: 1; pointer-events: none; mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
          }
          .soda-can-3d { width: 160px; height: 280px; }
          .hero-title-wrapper { font-size: 4rem; }
          .nav-links { display: none; }
          .catalog-container { padding: 100px 5% 4rem; }
          .catalog-header { flex-direction: column; align-items: flex-start; }
          .search-input { width: 100%; }
        }
      `}</style>

      {/* OVERLAY DE GRANULAÇÃO */}
      <div className="noise-overlay" />

      {/* WEBGL BACKGROUND (PERSISTENTE) */}
      <div className="background-layer">
        <Threads color={activeProduct.rgb} amplitude={1.5} distance={0.3} enableMouseInteraction={true} />
      </div>

      {/* NAVBAR FIXA */}
      <nav className="navbar">
        <div className="logo" onClick={() => setView('home')}>SODA<span>.</span>POP</div>
        <div className="nav-right">
          {view === 'home' && (
            <div className="nav-links">
                <a href="#sabores">Sabores</a>
                <a href="#ingredientes">Ingredientes</a>
                <button onClick={() => setView('catalog')}>Catálogo</button>
            </div>
          )}
          
          <button className={`cart-btn ${cartAnimate ? 'pop' : ''}`} onClick={() => setView('cart')}>
            Carrinho ({cartItems.length})
            <svg className="cart-icon" viewBox="0 0 24 24">
              <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* RENDERIZAÇÃO CONDICIONAL DAS VIEWS */}
      {view === 'home' ? (
        <HomeView 
            activeProduct={activeProduct} 
            setActiveProduct={setActiveProduct} 
            onAddToCart={addToCart}
            onOpenCatalog={() => setView('catalog')}
        />
      ) : view === 'catalog' ? (
        <CatalogView 
            onBack={() => setView('home')} 
            onAddToCart={addToCart}
        />
      ) : (
        <CartView 
            items={cartItems}
            onClose={() => setView('home')}
            onRemove={removeFromCart}
        />
      )}

    </div>
  );
}