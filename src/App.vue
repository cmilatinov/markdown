<template>
    <textarea v-model="md" />
    <markdown :value="md" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Markdown from '@/components/markdown.vue';
const md = ref('');
</script>
