<template>
  <div class="sidebar" :class="{ open }">
    <div class="sidebar-header">
      <span class="sidebar-title">{{ title }}</span>
      <button class="close-sidebar" @click="$emit('close')">&times;</button>
    </div>
    <div class="sidebar-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
}>()

defineEmits<{
  close: []
}>()
</script>
