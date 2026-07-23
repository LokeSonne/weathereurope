<script setup lang="ts">
const props = withDefaults(
  defineProps<{ label: string; icon?: string; activeColor?: string }>(),
  { icon: '', activeColor: '#10b981' },
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
    <span class="map-toggle__icon" aria-hidden="true">
      <!-- Prefer a custom flat icon passed via the slot; fall back to the string prop. -->
      <slot name="icon">{{ icon }}</slot>
    </span>
    {{ label }}
  </button>
</template>

<style scoped>
.map-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(246, 239, 218, 0.14);
  background: var(--miami-shell, rgba(28, 59, 82, 0.9));
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px rgba(20, 40, 60, 0.3);
  color: rgba(251, 243, 226, 0.82);
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}

.map-toggle:hover {
  color: #fff;
  background: rgba(28, 59, 82, 0.98);
}

.map-toggle--active {
  background: var(--toggle-active);
  border-color: var(--toggle-active);
  color: #fff;
}

.map-toggle__icon {
  display: inline-flex;
  align-items: center;
  font-size: 15px;
  line-height: 1;
}
</style>
