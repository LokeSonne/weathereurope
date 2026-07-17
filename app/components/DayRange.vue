<script setup lang="ts">
import { dayLabel, longDayLabel } from '../utils/days'

const model = defineModel<{ from: number; to: number }>({ required: true })

const DAY_COUNT = 8
const days = Array.from({ length: DAY_COUNT }, (_, i) => i)

// While `anchor` is set, the first endpoint is chosen and we're waiting for the second click.
const anchor = ref<number | null>(null)
const hoverDay = ref<number | null>(null)

/** Range currently highlighted: the live hover preview mid-selection, else the committed model. */
const activeLo = computed(() =>
  anchor.value !== null && hoverDay.value !== null
    ? Math.min(anchor.value, hoverDay.value)
    : model.value.from,
)
const activeHi = computed(() =>
  anchor.value !== null && hoverDay.value !== null
    ? Math.max(anchor.value, hoverDay.value)
    : model.value.to,
)

function onClick(day: number) {
  if (anchor.value === null) {
    // First click: start a new range anchored on this day.
    anchor.value = day
    model.value = { from: day, to: day }
  } else {
    // Second click: commit the range between the anchor and this day.
    model.value = { from: Math.min(anchor.value, day), to: Math.max(anchor.value, day) }
    anchor.value = null
  }
}

function inRange(day: number): boolean {
  return day >= activeLo.value && day <= activeHi.value
}

function isEndpoint(day: number): boolean {
  return day === activeLo.value || day === activeHi.value
}
</script>

<template>
  <div class="day-range" role="group" aria-label="Forecast date range">
    <div class="day-range__track" @mouseleave="hoverDay = null">
      <button
        v-for="day in days"
        :key="day"
        type="button"
        class="day-range__day"
        :class="{
          'day-range__day--in-range': inRange(day),
          'day-range__day--endpoint': isEndpoint(day),
        }"
        :aria-pressed="inRange(day)"
        :aria-label="longDayLabel(day)"
        @mouseenter="hoverDay = day"
        @click="onClick(day)"
      >
        {{ dayLabel(day) }}
      </button>
    </div>
    <div class="day-range__caption" aria-live="polite">
      <template v-if="anchor !== null">Select end day…</template>
      <template v-else-if="model.from === model.to">{{ dayLabel(model.from) }}</template>
      <template v-else>{{ dayLabel(model.from) }} → {{ dayLabel(model.to) }}</template>
    </div>
  </div>
</template>

<style scoped>
.day-range {
  background: rgba(20, 24, 30, 0.75);
  backdrop-filter: blur(6px);
  border-radius: 8px;
  padding: 4px;
}

.day-range__track {
  display: flex;
  gap: 2px;
}

.day-range__day {
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

.day-range__day:hover {
  background: rgba(255, 255, 255, 0.08);
}

.day-range__day--in-range {
  background: rgba(96, 165, 250, 0.35);
  color: #fff;
}

.day-range__day--endpoint {
  background: #fff;
  color: #14181e;
  font-weight: 700;
}

.day-range__caption {
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  margin-top: 4px;
  min-height: 13px;
}
</style>
