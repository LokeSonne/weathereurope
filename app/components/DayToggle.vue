<script setup lang="ts">
const dayOffset = defineModel<number>({ required: true })

const labels = ['Today', '+1', '+2', '+3', '+4', '+5', '+6', '+7']
</script>

<template>
  <div class="day-toggle">
    <button
      v-for="(label, day) in labels"
      :key="day"
      type="button"
      class="day-toggle__button"
      :class="{ 'day-toggle__button--active': dayOffset === day }"
      @click="dayOffset = day"
    >
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
.day-toggle {
  display: flex;
  gap: 2px;
  background: rgba(20, 24, 30, 0.75);
  backdrop-filter: blur(6px);
  border-radius: 8px;
  padding: 4px;
}

.day-toggle__button {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.day-toggle__button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.day-toggle__button--active {
  background: #fff;
  color: #14181e;
}
</style>
