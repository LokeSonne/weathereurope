<script setup lang="ts">
import type * as THREE from 'three'
import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * A real 3D flock of birds, rendered as a transparent WebGL overlay above the map (three.js).
 *
 * The map itself stays flat and north-up (DESIGN.md), so the flock lives in its *own* perspective
 * scene layered on top — that's where the "3D" comes from: a perspective camera looking slightly
 * down on a boids simulation, so birds nearer the camera are larger and the flock reads with real
 * depth as it crosses. Birds are small, white gulls with flapping wings.
 *
 * Behaviour:
 * - **Only when zoomed in.** A whole-world view stays a clean poster; flocks appear from about
 *   city/regional zoom (`ZOOM_MIN`) and are cleared when you zoom back out.
 * - **Infrequent.** A small flock drifts in from one edge, crosses, and leaves; then there's a
 *   long, random gap before the next one — never a permanent flock milling on screen.
 * - Disabled under `prefers-reduced-motion`; the canvas never intercepts pointer events.
 */
const props = defineProps<{ map: MapLibreMap }>()

const canvasEl = ref<HTMLCanvasElement>()
let dispose: (() => void) | undefined

const GULL = 0xffffff // white gulls

// Appear only from roughly city/regional zoom up; the whole-world view stays a clean poster.
const ZOOM_MIN = 5

// Gaps between flocks (ms): a short wait after zooming in so one shows up soon, long waits after.
const FIRST_DELAY = [3_000, 11_000] as const
const NEXT_DELAY = [28_000, 75_000] as const

// Half-extents of the flight volume (world units, centered on the origin). Birds enter/exit on X.
const BOUND = { x: 22, y: 6, z: 10 }
const EXIT_X = BOUND.x + 9

onMounted(async () => {
  const el = canvasEl.value
  if (!el) return
  // The still poster is the default for anyone who asked their system to reduce motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const T = await import('three')

  const parent = el.parentElement ?? el
  const width = () => parent.clientWidth || 1
  const height = () => parent.clientHeight || 1

  const renderer = new T.WebGLRenderer({ canvas: el, alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width(), height(), false)

  const scene = new T.Scene()
  const camera = new T.PerspectiveCamera(42, width() / height(), 0.1, 200)
  // Look down on the flock at a steep angle: a gull's top-down planform is an unmistakable "M",
  // and this avoids a near-horizontal view where flat wings vanish edge-on or fold to a slab.
  camera.position.set(0, 26, 17)
  camera.lookAt(0, 0, 0)

  // ---- Bird mesh: two swept, pointed wings + a slim body, forward = +Z, flap (dihedral) about Z.
  const wingGeo = new T.BufferGeometry()
  wingGeo.setAttribute(
    'position',
    new T.BufferAttribute(
      // root-leading, root-trailing, swept-back pointed tip (the +X / left wing; right is mirrored)
      new Float32Array([0.04, 0, 0.08, 0.04, 0, -0.12, 0.82, 0, -0.34]),
      3,
    ),
  )
  wingGeo.computeVertexNormals()

  const bodyGeo = new T.ConeGeometry(0.045, 0.62, 6)
  bodyGeo.rotateX(Math.PI / 2) // point the cone forward (+Z)
  bodyGeo.translate(0, 0, 0.06)

  const material = new T.MeshBasicMaterial({ color: GULL, side: T.DoubleSide })

  interface Bird {
    group: THREE.Group
    leftWing: THREE.Mesh
    rightWing: THREE.Mesh
    pos: THREE.Vector3
    vel: THREE.Vector3
    flapPhase: number
    flapSpeed: number
  }

  const rand = (a: number, b: number) => a + Math.random() * (b - a)

  // ---- Current flock (empty between flyovers).
  let birds: Bird[] = []
  let travelDir = 1
  let flockCenterY = 0
  let flockCenterZ = 0
  let flockStart = 0
  let spawnTimer: ReturnType<typeof setTimeout> | undefined

  function spawnFlock() {
    spawnTimer = undefined
    if (props.map.getZoom() < ZOOM_MIN) return // gated — reconcile() will reschedule on zoom-in

    travelDir = Math.random() < 0.5 ? 1 : -1
    flockCenterY = rand(-BOUND.y * 0.3, BOUND.y * 0.6)
    flockCenterZ = rand(-BOUND.z * 0.4, BOUND.z * 0.4)
    const startX = -travelDir * EXIT_X
    const count = Math.round(rand(4, 9))

    for (let i = 0; i < count; i++) {
      const group = new T.Group()
      const leftWing = new T.Mesh(wingGeo, material)
      const rightWing = new T.Mesh(wingGeo, material)
      rightWing.scale.x = -1 // mirror to the -X side
      const body = new T.Mesh(bodyGeo, material)
      group.add(leftWing, rightWing, body)
      group.scale.setScalar(rand(0.42, 0.72)) // small gulls; the spread reinforces depth
      scene.add(group)

      birds.push({
        group,
        leftWing,
        rightWing,
        pos: new T.Vector3(
          startX + rand(-5, 5),
          flockCenterY + rand(-2.5, 2.5),
          flockCenterZ + rand(-4, 4),
        ),
        vel: new T.Vector3(travelDir * rand(7, 9), rand(-0.6, 0.6), rand(-1, 1)),
        flapPhase: rand(0, Math.PI * 2),
        flapSpeed: rand(9, 13),
      })
    }
    flockStart = elapsed
  }

  function clearFlock() {
    for (const b of birds) scene.remove(b.group)
    birds = []
  }

  function scheduleNext(range: readonly [number, number]) {
    if (spawnTimer !== undefined) return
    if (props.map.getZoom() < ZOOM_MIN) return
    spawnTimer = setTimeout(spawnFlock, rand(range[0], range[1]))
  }

  /** Keep the flock in sync with the current zoom: clear + pause when zoomed out, arm when in. */
  function reconcile() {
    if (props.map.getZoom() < ZOOM_MIN) {
      clearTimeout(spawnTimer)
      spawnTimer = undefined
      clearFlock()
    } else if (!birds.length) {
      scheduleNext(FIRST_DELAY)
    }
  }

  // ---- Boids parameters (units per second).
  const NEIGHBOR = 6
  const SEPARATION = 2.6
  const MAX_SPEED = 5
  const MIN_SPEED = 5
  const MAX_FORCE = 18
  const CRUISE = 8.5

  const FORWARD = new T.Vector3(0, 0, 1)
  const tmp = new T.Vector3()
  const sep = new T.Vector3()
  const ali = new T.Vector3()
  const coh = new T.Vector3()
  const steer = new T.Vector3()
  const dir = new T.Vector3()
  const quat = new T.Quaternion()

  function step(dt: number, time: number) {
    if (!birds.length) return

    let centroidX = 0
    for (const b of birds) {
      sep.set(0, 0, 0)
      ali.set(0, 0, 0)
      coh.set(0, 0, 0)
      let neighbors = 0
      let close = 0

      for (const o of birds) {
        if (o === b) continue
        const d = b.pos.distanceTo(o.pos)
        if (d < NEIGHBOR) {
          ali.add(o.vel)
          coh.add(o.pos)
          neighbors++
          if (d < SEPARATION && d > 0) {
            tmp.subVectors(b.pos, o.pos).divideScalar(d * d)
            sep.add(tmp)
            close++
          }
        }
      }

      steer.set(0, 0, 0)
      if (close > 0) steer.addScaledVector(sep, 2.2)
      if (neighbors > 0) {
        ali.divideScalar(neighbors)
        steer.addScaledVector(ali.sub(b.vel).multiplyScalar(0.1), 1.0)
        coh.divideScalar(neighbors).sub(b.pos)
        steer.addScaledVector(coh.multiplyScalar(0.02), 0.9)
      }

      // Migrate steadily across (X) and hold the flock's altitude / depth line.
      steer.x += (travelDir * CRUISE - b.vel.x) * 0.9
      steer.y += (flockCenterY - b.pos.y) * 0.6
      steer.z += (flockCenterZ - b.pos.z) * 0.6

      if (steer.lengthSq() > MAX_FORCE * MAX_FORCE) steer.setLength(MAX_FORCE)
      b.vel.addScaledVector(steer, dt)
      const speed = b.vel.length()
      if (speed > MAX_SPEED) b.vel.setLength(MAX_SPEED)
      else if (speed < MIN_SPEED) b.vel.setLength(MIN_SPEED)
      b.pos.addScaledVector(b.vel, dt)

      // Orient the bird along its heading, then flap the wings about the travel axis.
      dir.copy(b.vel).normalize()
      quat.setFromUnitVectors(FORWARD, dir)
      b.group.quaternion.copy(quat)
      b.group.position.copy(b.pos)

      // Gentle flap around a shallow resting dihedral, so the wings keep their gull "M" instead
      // of folding flat (edge-on, invisible) or into a steep tent.
      const flap = 0.24 + Math.sin(time * b.flapSpeed + b.flapPhase) * 0.42
      b.leftWing.rotation.z = flap
      b.rightWing.rotation.z = -flap

      centroidX += b.pos.x
    }

    // End the flyover once the flock has crossed off the far edge (or after a safety timeout).
    centroidX /= birds.length
    const crossed = travelDir > 0 ? centroidX > EXIT_X : centroidX < -EXIT_X
    if (crossed || time - flockStart > 40) {
      clearFlock()
      scheduleNext(NEXT_DELAY)
    }
  }

  // ---- Render loop (paused while the tab is hidden).
  const clock = new T.Clock()
  let raf = 0
  let elapsed = 0

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05) // clamp so a restored background tab doesn't jump
    elapsed += dt
    step(dt, elapsed)
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  frame()

  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf) {
      clock.getDelta() // discard the long hidden gap
      frame()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  const ro = new ResizeObserver(() => {
    const w = width()
    const h = height()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  })
  ro.observe(parent)

  props.map.on('zoomend', reconcile)
  reconcile() // handles opening already zoomed in (e.g. a shared link)

  dispose = () => {
    cancelAnimationFrame(raf)
    clearTimeout(spawnTimer)
    document.removeEventListener('visibilitychange', onVisibility)
    props.map.off('zoomend', reconcile)
    ro.disconnect()
    clearFlock()
    wingGeo.dispose()
    bodyGeo.dispose()
    material.dispose()
    renderer.dispose()
  }
})

onBeforeUnmount(() => dispose?.())
</script>

<template>
  <canvas ref="canvasEl" class="birds-3d" aria-hidden="true" />
</template>

<style scoped>
/* Sits above the map and the print grain (so the white gulls stay crisp), below the poster frame
   and controls. Never intercepts map gestures. */
.birds-3d {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
