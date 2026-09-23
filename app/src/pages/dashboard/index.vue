<script setup lang="ts">
import DashboardView from '../../views/DashboardView.vue'
import { navigateToView } from '../../utils/navigation'
</script>

<template>
  <DashboardView @navigate="navigateToView" />
</template>
