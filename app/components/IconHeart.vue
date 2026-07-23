<script setup lang="ts">
// Flat, screen-printed heart in "ink" — filled with currentColor so it takes on the
// toggle's cream/white text colour. See DESIGN.md (flat, printed icons). The shape is shared
// with the favorite mark on city chips (see app/utils/heartIcon.ts).
import { HEART_PATH } from '../utils/heartIcon'
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path :d="HEART_PATH" />
  </svg>
</template>

<style scoped>
.icon {
  display: block;
  width: 16px;
  height: 16px;
  fill: currentColor;
}
</style>
