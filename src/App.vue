<template>
    <main style="position: relative; display: flex; height: 100vh;">
        <textarea style="flex: 1; max-height: 100%; overflow: auto" v-model="md" />
        <markdown style="flex: 1; padding: 0 1rem; max-height: 100%; overflow: auto"  :value="md" />
    </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Markdown from '@/components/markdown.vue';
const md = ref('');
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');

html, body {
    padding: 0;
    margin: 0;
}

html {
    font-family: 'Montserrat', sans-serif;
}
</style>
