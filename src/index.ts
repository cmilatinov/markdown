import { createApp } from 'vue';

import App from '@/App.vue';

createApp(App)
    .mount('#app');

import VueMarkdown from '@/components/markdown.vue';
export { MarkdownRenderer } from '@/components/markdown';
export { VueMarkdown };
