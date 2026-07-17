<script setup lang="ts">
const active = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    class="tshirt-toggle"
    :class="{ 'tshirt-toggle--active': active }"
    :aria-pressed="active"
    @click="active = !active"
  >
    <span class="tshirt-toggle__icon" aria-hidden="true">👕</span>
    T-shirt weather
  </button>
</template>

<style scoped>
.tshirt-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(20, 24, 30, 0.75);
  backdrop-filter: blur(6px);
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.tshirt-toggle:hover {
  background: rgba(20, 24, 30, 0.9);
}

.tshirt-toggle--active {
  background: #10b981;
  border-color: #10b981;
  color: #fff;
}

.tshirt-toggle__icon {
  font-size: 15px;
  line-height: 1;
}
</style>
