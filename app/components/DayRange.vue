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
          'day-range__day--start': day === activeLo,
          'day-range__day--end': day === activeHi,
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
  width: 100%;
  max-width: 384px;
  box-sizing: border-box;
  background: rgba(17, 20, 26, 0.82);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 5px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
}

/* No gaps, so the selected days read as one continuous band. */
.day-range__track {
  display: flex;
}

.day-range__day {
  /* Equal-width segments that shrink to fit narrow screens. */
  flex: 1 1 0;
  min-width: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
  font-weight: 500;
  padding: 7px 6px;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

@media (max-width: 360px) {
  .day-range__day {
    font-size: 12px;
    padding: 7px 3px;
  }
}

/* Hover only affects days that aren't part of the selection. */
.day-range__day:not(.day-range__day--in-range):hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.09);
  border-radius: 7px;
}

.day-range__day--in-range {
  background: rgba(59, 130, 246, 0.3);
  color: #fff;
}

.day-range__day--endpoint {
  background: #2563eb;
  color: #fff;
  font-weight: 700;
}

/* Round only the outer edges of the band. */
.day-range__day--start {
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
}

.day-range__day--end {
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
}

.day-range__caption {
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  margin-top: 6px;
  min-height: 13px;
}
</style>
