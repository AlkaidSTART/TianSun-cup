<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'

onLaunch(() => {
  console.info('Smart pasture app launched')
})

onShow(() => {
  console.info('Smart pasture app shown')
})
</script>

<style>
@import './styles.css';
@import './design-source.css';
@import './secondary-source.css';
</style>
