import { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';

type RitualPhase = 'idle' | 'holding' | 'releasing' | 'done';

type SacredGeometryProps = {
  phase: RitualPhase;
  reducedMotion: boolean;
  label: string;
};

type GeometryRuntime = { setPhase: (phase: RitualPhase) => void };

const circleCenters: [number, number][] = [];
for (let q = -2; q <= 2; q += 1) {
  for (let r = -2; r <= 2; r += 1) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2) {
      circleCenters.push([q + r / 2, (r * Math.sqrt(3)) / 2]);
    }
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

function resolveDarkTheme(element: HTMLElement, systemDark: boolean) {
  const theme = element.closest('.vn-app')?.getAttribute('data-theme');
  return theme === 'dark' || (theme !== 'light' && systemDark);
}

function createStudioEnvironment() {
  const width = 256, height = 128;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width, v = (y + 0.5) / height;
      const panel = (center: number, spread: number, strength: number) => {
        const offset = Math.min(Math.abs(u - center), 1 - Math.abs(u - center));
        return Math.exp(-((offset / spread) ** 4) - (((v - 0.48) / 0.34) ** 6)) * strength;
      };
      const illumination = 0.26 + Math.sin(v * Math.PI) * 0.16 +
        panel(0.17, 0.055, 0.75) + panel(0.62, 0.027, 0.83) + panel(0.85, 0.07, 0.38);
      const value = Math.round(clamp(illumination, 0, 1) * 255);
      const offset = (y * width + x) * 4;
      data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function StaticGeometry({ gradientId, dark }: { gradientId: string; dark: boolean }) {
  const primarySilver = `var(--vn-geometry-wire-1, ${dark ? '#f2f5ef' : '#865a70'})`;
  const secondarySilver = `var(--vn-geometry-wire-2, ${dark ? '#c6d1bb' : '#b982a0'})`;
  const surface = `var(--vn-geometry-surface, ${dark ? '#e3e9dc' : '#f0d5e2'})`;
  const glow = `var(--vn-geometry-glow, ${dark ? '#f1f8e8' : '#f7d7e7'})`;
  const metalGradientId = `${gradientId}-metal`;
  return (
    <svg
      className="vn-canvas vn-canvas-fallback"
      viewBox="0 0 360 360"
      aria-hidden="true"
      style={{ width: '100%', height: '100%', display: 'block', color: primarySilver }}
    >
      <defs>
        <linearGradient id={metalGradientId} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor={secondarySilver} />
          <stop offset="0.25" stopColor={glow} />
          <stop offset="0.48" stopColor={primarySilver} />
          <stop offset="0.68" stopColor="#ffffff" />
          <stop offset="1" stopColor={secondarySilver} />
        </linearGradient>
        <radialGradient id={gradientId}>
          <stop offset="0" stopColor={glow} stopOpacity="0.14" />
          <stop offset="0.6" stopColor={glow} stopOpacity="0.04" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="180" cy="180" r="168" fill={`url(#${gradientId})`} />
      <g fill="none" stroke={secondarySilver} strokeWidth="1.2" opacity="0.7">
        {circleCenters.map(([x, y], index) => (
          <circle key={index} cx={180 + x * 42} cy={180 + y * 42} r="42" />
        ))}
      </g>
      <g fillOpacity="0.12" strokeWidth="2.1">
        <path d="M180 58 75 241 285 241Z" fill={surface} stroke={`url(#${metalGradientId})`} />
        <path d="M180 302 75 119 285 119Z" fill={secondarySilver} stroke={`url(#${metalGradientId})`} />
      </g>
      <g fill="none" stroke={secondarySilver} strokeWidth="1.4" opacity="0.8">
        <path d="M180 180 180 58 M180 180 75 241 M180 180 285 241 M180 180 180 302 M180 180 75 119 M180 180 285 119" />
      </g>
    </svg>
  );
}

/** An artistic 3D interpretation of the flower of life and a star tetrahedron. */
export function SacredGeometry({ phase, reducedMotion, label }: SacredGeometryProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<GeometryRuntime | null>(null);
  const phaseRef = useRef(phase);
  const [fallback, setFallback] = useState(false);
  const [fallbackDark, setFallbackDark] = useState(false);
  const gradientId = `vn-geometry-${useId().replace(/:/g, '')}`;
  phaseRef.current = phase;

  useEffect(() => {
    runtimeRef.current?.setPhase(phase);
  }, [phase]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => setFallbackDark(resolveDarkTheme(wrapper, colorScheme.matches));
    const observer = new MutationObserver(updateTheme);
    observer.observe(wrapper.closest('.vn-app') || wrapper, { attributes: true, attributeFilter: ['data-theme'] });
    colorScheme.addEventListener('change', updateTheme);
    updateTheme();
    return () => { observer.disconnect(); colorScheme.removeEventListener('change', updateTheme); };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch {
      setFallback(true);
      return;
    }
    setFallback(false);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 30);
    const composition = new THREE.Group();
    const flower = new THREE.Group();
    const star = new THREE.Group();
    scene.add(composition);
    composition.add(flower, star);
    flower.rotation.set(-0.23, 0.12, 0.055);
    star.rotation.set(0.2, Math.PI / 4, Math.PI / 12);

    // Small generated studio panels provide silver reflections without image assets.
    const studioTexture = createStudioEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    let studioEnvironment: THREE.WebGLRenderTarget | null = null;
    try {
      studioEnvironment = pmrem.fromEquirectangular(studioTexture);
      scene.environment = studioEnvironment.texture;
    } catch {
      // Direct key/fill lights still give the metal shape if prefiltering is unavailable.
    } finally {
      pmrem.dispose();
      studioTexture.dispose();
    }

    const primarySilver = new THREE.Color('#555555');
    const secondarySilver = new THREE.Color('#909090');
    const silverSurface = new THREE.Color('#dde2d8');
    const geometryAccent = new THREE.Color('#d1e7b5');
    let darkTheme = false;
    const flowerMaterial = new THREE.LineBasicMaterial({
      color: secondarySilver,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      toneMapped: false,
    });
    const wireMaterials = [
      new THREE.MeshPhysicalMaterial({ color: silverSurface, metalness: 0.86, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.5 }),
      new THREE.MeshPhysicalMaterial({ color: silverSurface, metalness: 0.8, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.13, envMapIntensity: 1.35 }),
    ];
    const glassMaterials = [silverSurface, silverSurface].map(
      (color) =>
        new THREE.MeshPhysicalMaterial({
          color,
          metalness: 0.18,
          roughness: 0.17,
          clearcoat: 0.8,
          transparent: true,
          opacity: 0.055,
          envMapIntensity: 0.75,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
    );

    const circleRadius = 0.78;
    for (const [centerX, centerY] of circleCenters) {
      const points: THREE.Vector3[] = [];
      for (let step = 0; step <= 96; step += 1) {
        const angle = (step / 96) * Math.PI * 2;
        const x = (centerX + Math.cos(angle)) * circleRadius;
        const y = (centerY + Math.sin(angle)) * circleRadius;
        // A shallow dome preserves the 19-circle lattice while adding visible depth.
        const z = 0.055 * (x * x + y * y) - 0.26;
        points.push(new THREE.Vector3(x, y, z));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      flower.add(new THREE.Line(geometry, flowerMaterial));
    }

    const vertexGeometry = new THREE.SphereGeometry(0.037, 8, 6);
    const vertexMaterial = new THREE.MeshPhysicalMaterial({ color: silverSurface, metalness: 0.8, roughness: 0.14, clearcoat: 1, envMapIntensity: 1.4 });
    // Instanced tubes give the edges real thickness; WebGL lineWidth stays 1px on phones.
    const edgeGeometry = new THREE.CylinderGeometry(0.022, 0.022, 1, 12, 1, true);
    const contourGeometry = new THREE.CylinderGeometry(0.032, 0.032, 1, 12, 1, true);
    const contourMaterial = new THREE.MeshStandardMaterial({
      color: primarySilver,
      metalness: 0.5,
      roughness: 0.4,
      envMapIntensity: 0.4,
      side: THREE.BackSide,
    });
    const silverContours: THREE.InstancedMesh[] = [];
    const edgePairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    const edgeTransform = new THREE.Object3D();
    const edgeDirection = new THREE.Vector3();
    const edgeUp = new THREE.Vector3(0, 1, 0);
    const vertices = [
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(-1, -1, 1),
      new THREE.Vector3(-1, 1, -1),
      new THREE.Vector3(1, -1, -1),
    ].map((vertex) => vertex.normalize().multiplyScalar(1.76));

    for (let side = 0; side < 2; side += 1) {
      const sign = side === 0 ? 1 : -1;
      const tetrahedron = new THREE.BufferGeometry();
      tetrahedron.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          vertices.flatMap((vertex) => [vertex.x * sign, vertex.y * sign, vertex.z * sign]),
          3,
        ),
      );
      tetrahedron.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
      tetrahedron.computeVertexNormals();
      star.add(new THREE.Mesh(tetrahedron, glassMaterials[side]));
      const edges = new THREE.InstancedMesh(edgeGeometry, wireMaterials[side], edgePairs.length);
      // A narrow back-facing silver shell preserves the outline against a white page.
      const contour = new THREE.InstancedMesh(contourGeometry, contourMaterial, edgePairs.length);
      contour.renderOrder = -1;
      edgePairs.forEach(([start, end], index) => {
        edgeDirection.subVectors(vertices[end], vertices[start]);
        edgeTransform.position.copy(vertices[start]).add(vertices[end]).multiplyScalar(sign / 2);
        edgeTransform.scale.set(1, edgeDirection.length(), 1);
        edgeTransform.quaternion.setFromUnitVectors(edgeUp, edgeDirection.normalize().multiplyScalar(sign));
        edgeTransform.updateMatrix();
        edges.setMatrixAt(index, edgeTransform.matrix);
        contour.setMatrixAt(index, edgeTransform.matrix);
      });
      star.add(contour, edges);
      silverContours.push(contour);
      for (const vertex of vertices) {
        const glimmer = new THREE.Mesh(vertexGeometry, vertexMaterial);
        glimmer.position.copy(vertex).multiplyScalar(sign);
        star.add(glimmer);
      }
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3, 4, 5);
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.25);
    fillLight.position.set(-4, -1, 3);
    const accentRim = new THREE.DirectionalLight(geometryAccent, 0.3);
    accentRim.position.set(4, 1, -3);
    scene.add(keyLight, fillLight, accentRim);

    const particleCount = 280;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSizes = new Float32Array(particleCount);
    const particlePhases = new Float32Array(particleCount);
    const particleSpeeds = new Float32Array(particleCount);
    for (let index = 0; index < particleCount; index += 1) {
      // Deterministic placement keeps the composition stable after resizing/remounts.
      const seed = Math.sin(index * 127.1 + 31.7) * 43758.5453;
      const random = seed - Math.floor(seed);
      const angle = index * 2.399963229728653;
      const y = 1 - (index / (particleCount - 1)) * 2;
      const crossSection = Math.sqrt(Math.max(0, 1 - y * y));
      const radius = 2.3 + random * 0.55;
      particlePositions[index * 3] = Math.cos(angle) * crossSection * radius;
      particlePositions[index * 3 + 1] = y * radius;
      particlePositions[index * 3 + 2] = Math.sin(angle) * crossSection * radius * 0.6;
      particleSizes[index] = 3.8 + random * 5.8;
      particlePhases[index] = (index * 0.61803398875) % 1;
      particleSpeeds[index] = 0.085 + random * 0.06;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(particleSizes, 1));
    particleGeometry.setAttribute('aPhase', new THREE.BufferAttribute(particlePhases, 1));
    particleGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(particleSpeeds, 1));
    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: primarySilver.clone() },
        uAccentColor: { value: secondarySilver.clone() },
        uOpacity: { value: 0.62 },
        uDpr: { value: dpr },
        uTime: { value: 0 },
        uMotion: { value: reducedMotion ? 0 : 1 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        uniform float uDpr;
        uniform float uTime;
        uniform float uMotion;
        varying float vOpacity;
        varying float vTint;
        void main() {
          float progress = fract(aPhase + uTime * aSpeed);
          float inward = mix(1.0, 0.06, smoothstep(0.0, 1.0, progress));
          vec3 flowingPosition = position * mix(1.0, inward, uMotion);
          float twist = progress * 0.8 * uMotion;
          flowingPosition.xy = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * flowingPosition.xy;
          // Fade before wrapping to the edge, so individual particles never flash.
          float envelope = smoothstep(0.0, 0.16, progress) * (1.0 - smoothstep(0.78, 1.0, progress));
          vOpacity = mix(0.7, envelope, uMotion);
          vTint = step(0.55, aPhase);
          vec4 viewPosition = modelViewMatrix * vec4(flowingPosition, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = aSize * uDpr * clamp(6.0 / -viewPosition.z, 0.6, 1.7);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uAccentColor;
        uniform float uOpacity;
        varying float vOpacity;
        varying float vTint;
        void main() {
          float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
          float glow = 1.0 - smoothstep(0.08, 0.5, distanceFromCenter);
          gl_FragColor = vec4(mix(uColor, uAccentColor, vTint), pow(glow, 1.25) * uOpacity * vOpacity);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    composition.add(particles);

    let disposed = false;
    let visible = document.visibilityState !== 'hidden';
    let frameId = 0;
    let previousTime = 0;
    let motionTime = 0;
    const minimumFrameTime = window.matchMedia('(pointer: coarse)').matches ? 1000 / 30 : 1000 / 60;
    let transitionStart = performance.now();
    let currentPhase = phaseRef.current;
    let touchActive = false;
    let pointerX = 0;
    let pointerY = 0;
    let rotationX = 0;
    let rotationY = 0;
    let scale = currentPhase === 'done' ? 1.1 : 1;
    let flowerScale = currentPhase === 'done' ? 1.1 : 1;
    let particleScale = currentPhase === 'done' ? 1.16 : 1;
    let light = currentPhase === 'done' ? 0.72 : 0.62;

    const requestFrame = () => {
      if (!disposed && visible && frameId === 0) frameId = requestAnimationFrame(renderFrame);
    };

    function renderFrame(time: number) {
      frameId = 0;
      if (disposed || !visible) return;
      if (!reducedMotion && previousTime && time - previousTime < minimumFrameTime - 0.5) {
        requestFrame();
        return;
      }
      const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
      previousTime = time;
      if (!reducedMotion) motionTime += dt;
      const progress = clamp((time - transitionStart) / (reducedMotion ? 100 : 2800), 0, 1);
      const releasing = currentPhase === 'releasing';
      const opening = easeOutCubic(progress);
      const releasePulse = releasing ? Math.sin(progress * Math.PI) : 0;
      const targetScale =
        currentPhase === 'holding' ? 0.9 : releasing ? 0.9 + opening * 0.2 : currentPhase === 'done' ? 1.1 : 1;
      const targetFlowerScale =
        currentPhase === 'holding' ? 0.95 : releasing ? 0.95 + opening * 0.15 : currentPhase === 'done' ? 1.1 : 1;
      const targetParticleScale =
        currentPhase === 'holding' ? 0.83 : releasing ? 0.83 + opening * 0.33 + releasePulse * 0.22 : currentPhase === 'done' ? 1.16 : 1;
      const targetLight = currentPhase === 'holding' ? 0.85 : releasing ? 0.72 + releasePulse * 0.28 : currentPhase === 'done' ? 0.72 : 0.62;
      const targetRotationX = reducedMotion ? 0 : -pointerY * 0.2;
      const targetRotationY = reducedMotion ? 0 : pointerX * 0.32;
      const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
      scale += (targetScale - scale) * ease;
      flowerScale += (targetFlowerScale - flowerScale) * ease;
      particleScale += (targetParticleScale - particleScale) * ease;
      light += (targetLight - light) * ease;
      rotationX += (targetRotationX - rotationX) * ease;
      rotationY += (targetRotationY - rotationY) * ease;
      star.scale.setScalar(scale);
      flower.scale.setScalar(flowerScale);
      particles.scale.setScalar(particleScale);
      composition.rotation.set(rotationX, rotationY, 0);
      composition.position.set(rotationY * 0.42, -rotationX * 0.32, 0);
      star.rotation.set(
        0.2 + Math.sin(motionTime * 0.35) * 0.16,
        Math.PI / 4 + motionTime * 0.26,
        Math.PI / 12 + Math.sin(motionTime * 0.21) * 0.085,
      );
      flower.rotation.set(-0.23, 0.12 + Math.sin(motionTime * 0.18) * 0.09, 0.055 - motionTime * 0.045);
      particleMaterial.uniforms.uOpacity.value = light * (darkTheme ? 0.8 : 1);
      particleMaterial.uniforms.uTime.value = motionTime;
      flowerMaterial.opacity = (darkTheme ? 0.28 : 0.4) + light * (darkTheme ? 0.2 : 0.26);
      glassMaterials.forEach((material) => { material.opacity = (darkTheme ? 0.025 : 0.035) + light * 0.035; });
      renderer.render(scene, camera);

      const unsettled =
        Math.abs(targetScale - scale) + Math.abs(targetFlowerScale - flowerScale) +
        Math.abs(targetParticleScale - particleScale) + Math.abs(targetLight - light) +
        Math.abs(targetRotationX - rotationX) + Math.abs(targetRotationY - rotationY) > 0.0005;
      if (!reducedMotion || unsettled || (releasing && progress < 1)) requestFrame();
      else previousTime = 0;
    }

    const updateSize = () => {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      camera.aspect = rect.width / rect.height;
      camera.position.set(0, 0, 6.9 * Math.max(1, 0.94 / camera.aspect));
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
      requestFrame();
    };
    const updatePointer = (event: PointerEvent) => {
      if (reducedMotion || (event.pointerType === 'touch' && !touchActive)) return;
      const rect = wrapper.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      pointerY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
      requestFrame();
    };
    const onPointerDown = (event: PointerEvent) => {
      touchActive = event.pointerType === 'touch';
      updatePointer(event);
    };
    const resetPointer = () => {
      touchActive = false;
      pointerX = 0;
      pointerY = 0;
      requestFrame();
    };
    const onVisibilityChange = () => {
      visible = document.visibilityState !== 'hidden';
      if (!visible && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      previousTime = 0;
      if (visible) requestFrame();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      visible = false;
      setFallback(true);
    };
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onThemeChange = () => {
      const dark = resolveDarkTheme(wrapper, colorScheme.matches);
      darkTheme = dark;
      const styles = getComputedStyle(wrapper.closest('.vn-app') || wrapper);
      const readColor = (token: string, fallback: string, color: THREE.Color) => {
        const value = styles.getPropertyValue(token).trim();
        const supported = /^(#[\da-f]{3}|#[\da-f]{6}|rgba?\([^)]*\))$/i.test(value);
        color.set(supported ? value : fallback);
      };
      readColor('--vn-geometry-wire-1', dark ? '#f2f5ef' : '#865a70', primarySilver);
      readColor('--vn-geometry-wire-2', dark ? '#c6d1bb' : '#b982a0', secondarySilver);
      readColor('--vn-geometry-surface', dark ? '#e3e9dc' : '#f0d5e2', silverSurface);
      readColor(dark ? '--vn-geometry-mint' : '--vn-geometry-accent', dark ? '#cee8ae' : '#e6aec9', geometryAccent);
      flowerMaterial.color.copy(secondarySilver);
      wireMaterials[0].color.copy(silverSurface).lerp(primarySilver, dark ? 0.08 : 0.42);
      wireMaterials[1].color.copy(silverSurface).lerp(secondarySilver, dark ? 0.2 : 0.45);
      wireMaterials.forEach((material) => { material.envMapIntensity = studioEnvironment ? (dark ? 1.55 : 0.95) : 0; });
      contourMaterial.color.copy(primarySilver);
      silverContours.forEach((contour) => { contour.visible = !dark; });
      glassMaterials.forEach((material) => material.color.copy(silverSurface));
      vertexMaterial.color.copy(silverSurface);
      accentRim.color.copy(geometryAccent);
      accentRim.intensity = dark ? 0.3 : 0.2;
      particleMaterial.uniforms.uColor.value.copy(primarySilver);
      particleMaterial.uniforms.uAccentColor.value.copy(secondarySilver).lerp(geometryAccent, 0.22);
      particleMaterial.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      particleMaterial.needsUpdate = true;
      requestFrame();
    };
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(wrapper);
    const themeObserver = new MutationObserver(onThemeChange);
    themeObserver.observe(wrapper.closest('.vn-app') || wrapper, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    colorScheme.addEventListener('change', onThemeChange);
    wrapper.addEventListener('pointermove', updatePointer, { passive: true });
    wrapper.addEventListener('pointerdown', onPointerDown, { passive: true });
    wrapper.addEventListener('pointerleave', resetPointer, { passive: true });
    window.addEventListener('pointerup', resetPointer, { passive: true });
    window.addEventListener('pointercancel', resetPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.addEventListener('webglcontextlost', onContextLost);
    runtimeRef.current = {
      setPhase: (nextPhase) => {
        currentPhase = nextPhase;
        transitionStart = performance.now();
        requestFrame();
      },
    };
    updateSize();
    onThemeChange();

    return () => {
      disposed = true;
      runtimeRef.current = null;
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      colorScheme.removeEventListener('change', onThemeChange);
      wrapper.removeEventListener('pointermove', updatePointer);
      wrapper.removeEventListener('pointerdown', onPointerDown);
      wrapper.removeEventListener('pointerleave', resetPointer);
      window.removeEventListener('pointerup', resetPointer);
      window.removeEventListener('pointercancel', resetPointer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      scene.environment = null;
      studioEnvironment?.dispose();
      scene.clear();
      renderer.dispose();
      // React StrictMode immediately recreates the renderer on this same canvas.
      // Explicit context loss would leave the second mount with an unusable context.
    };
  }, [reducedMotion]);

  return (
    <div ref={wrapperRef} className="vn-canvas-wrap" role="img" aria-label={label}>
      <canvas
        ref={canvasRef}
        className="vn-canvas"
        aria-hidden="true"
        style={{ display: fallback ? 'none' : 'block', width: '100%', height: '100%' }}
      />
      {fallback && <StaticGeometry gradientId={gradientId} dark={fallbackDark} />}
    </div>
  );
}
