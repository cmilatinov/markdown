<template>
    <main class="flex h-[100vh]">
        <textarea class="flex-1 max-h-full overflow-auto font-mono p-3" v-model="md" />
        <markdown class="flex-1 px-4 max-h-full overflow-auto prose p-3" :value="md" />
    </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Markdown from '@/components/markdown.vue';
const md = ref('');
</script>

<style>
@import "@/assets/style/global.scss";
</style>
