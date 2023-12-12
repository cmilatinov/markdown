import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MarkdownRenderer } from './markdown';
import { compare, normalize } from '../composables/utils';

function createMdTest(md: string | string[], expected: string | string[]) {
    return () => {
        const mdText = Array.isArray(md) ? md.join('\n') : md;
        const expectedText = Array.isArray(expected) ? expected.join('\n') : expected;
        const expectedNode = document.createElement('div');
        expectedNode.innerHTML = expectedText;
        expectedNode.normalize();
        const renderer = new MarkdownRenderer(mdText);
        renderer.render();
        const node = renderer.domNode();
        normalize(node);
        console.log(node.innerHTML);
        console.log('=============');
        normalize(expectedNode);
        console.log(expectedNode.innerHTML);
        console.log(compare(node, expectedNode));
        expect(node.isEqualNode(expectedNode)).toBeTruthy();
    };
}

const TESTS_FOLDER = path.join(__dirname, '__tests__');
fs.readdirSync(TESTS_FOLDER)
    .filter(f => f.endsWith('.md'))
    .forEach(f => {
        const mdFile = path.join(TESTS_FOLDER, f);
        const htmlFile = mdFile.replace(/.md$/, '.html');
        const md = fs.readFileSync(mdFile).toString();
        const html = fs.readFileSync(htmlFile).toString();
        test(`"${f}"`, createMdTest(md, html));
    });
