<template>
    <div v-html="render()"></div>
</template>

<script lang="ts" setup>
import { MarkdownRenderer } from '@/components/markdown';

interface Props {
    value: string
}

const emit = defineEmits(['finishRender']);
const props = defineProps<Props>();

const render = () => {
    const renderer = new MarkdownRenderer(props.value);
    renderer.render();
    emit('finishRender');
    return renderer.html();
};
</script>
