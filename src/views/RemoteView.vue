<template>
  <v-container fluid class="remote-view pa-0">
    <ViewerPanel :initial-peer-id="initialPeerId" />
  </v-container>
</template>

<script setup lang="ts">
import ViewerPanel from '@/components/Remote/ViewerPanel.vue';

defineProps<{
  initialPeerId?: string;
}>();
</script>

<style scoped>
.remote-view {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
}
</style>
