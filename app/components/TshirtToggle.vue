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

.tshirt-toggle:hover {
  color: #fff;
  background: rgba(17, 20, 26, 0.92);
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
