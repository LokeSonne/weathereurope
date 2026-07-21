<script setup lang="ts">
const props = withDefaults(
  defineProps<{ icon: string; label: string; activeColor?: string }>(),
  { activeColor: '#10b981' },
)
const active = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    class="map-toggle"
    :class="{ 'map-toggle--active': active }"
    :style="{ '--toggle-active': props.activeColor }"
    :aria-pressed="active"
    @click="active = !active"
  >
    <span class="map-toggle__icon" aria-hidden="true">{{ icon }}</span>
    {{ label }}
  </button>
</template>

<style scoped>
.map-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(17, 20, 26, 0.82);
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}

.map-toggle:hover {
  color: #fff;
  background: rgba(17, 20, 26, 0.92);
}

.map-toggle--active {
  background: var(--toggle-active);
  border-color: var(--toggle-active);
  color: #fff;
}

.map-toggle__icon {
  font-size: 15px;
  line-height: 1;
}
</style>
