<template>
    <div v-html="render()"></div>
</template>

<script lang="ts" setup>

import { MarkdownRenderer } from '@/components/markdown';

interface Props {
    value: string
}

const props = defineProps<Props>();

const render = () => {
    const renderer = new MarkdownRenderer(props.value);
    renderer.render();
    return renderer.html();
};
</script>
