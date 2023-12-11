import { expect, test } from 'vitest';
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

test('header test', createMdTest([
    '# heading 1',
    '#heading 1',
    '## heading 2',
    '##heading 2',
    '### heading 3',
    '###heading 3',
    '#### heading 4',
    '####heading 4',
    '##### heading 5',
    '#####heading 5',
    '###### heading 6',
    '######heading 6'
], [
    '<h1>heading 1</h1>',
    '<h1>heading 1</h1>',
    '<h2>heading 2</h2>',
    '<h2>heading 2</h2>',
    '<h3>heading 3</h3>',
    '<h3>heading 3</h3>',
    '<h4>heading 4</h4>',
    '<h4>heading 4</h4>',
    '<h5>heading 5</h5>',
    '<h5>heading 5</h5>',
    '<h6>heading 6</h6>',
    '<h6>heading 6</h6>'
]));

test('paragraph test', createMdTest([
    'This **payload design** has __the__ scientific community as the priority stakeholders. ' +
        'This **design _can_** be used by student clubs designing CubeSats to launch yeast experiments into space. ' +
        'Other research based groups such as AstroYeast will benefit from this design as they will be able to ' +
        'study ***different*** yeast strains in space for an affordable price. Furthermore, the results from these ' +
        'experiments will benefit all of humanity as they may pave the way for better waste management techniques, ' +
        'medicine, and construction materials.\n',
    'Some of the *competitors* for this _project include_: Space Agencies that provide custom space experiment ' +
        'platforms, ___NanoRacks___ which provides a testing platform aboard the International Space Station, and ' +
        'pharmaceutical companies capable of financing the design and development of a space experiment platform for ' +
        'medical solutions.'
], [
    '<p>This <b>payload design</b> has <b>the</b> scientific community as the priority stakeholders. This <b>design ' +
        '<i>can</i></b> be used by student clubs designing CubeSats to launch yeast experiments into space. Other research ' +
        'based groups such as AstroYeast will benefit from this design as they will be able to study <i><b>different</b></i> '+
        'yeast strains in space for an affordable price. Furthermore, the results from these experiments will ' +
        'benefit all of humanity as they may pave the way for better waste management techniques, medicine, and ' +
        'construction materials.</p>',
    '<p>Some of the <i>competitors</i> for this <i>project include</i>: Space Agencies that provide custom space ' +
        'experiment platforms, <i><b>NanoRacks</b></i> which provides a testing platform aboard the International Space Station, ' +
        'and pharmaceutical companies capable of financing the design and development of a space experiment ' +
        'platform for medical solutions.</p>'
]));

test('unoredered list', createMdTest([
    '- First item',
    '- Second item',
    '- Third item',
    '    - Indented item',
    '        - Giga indented item',
    '    - Indented item',
    '- Fourth item'
], [
    '<ul>',
    '  <li>First item</li>',
    '  <li>Second item</li>',
    '  <li>Third item',
    '    <ul>',
    '      <li>Indented item',
    '        <ul>',
    '          <li>Giga indented item</li>',
    '        </ul>',
    '      </li>',
    '      <li>Indented item</li>',
    '    </ul>',
    '  </li>',
    '  <li>Fourth item</li>',
    '</ul>'
]))

test('blockquote', createMdTest([
    '> #### The quarterly results look great!',
    '>> The Witch bade her clean the pots and kettles and sweep the floor and keep the fire fed with wood.',
    '> - Revenue was off the chart.',
    '> - Profits were higher than ever.',
    '>',
    '>  *Everything* is going according to **plan**.'
], [
    '<blockquote>',
    '  <h4>The quarterly results look great!</h4>',
    '  <blockquote>',
    '    <p>The Witch bade her clean the pots and kettles and sweep the floor and keep the fire fed with wood.</p>',
    '  </blockquote>',
    '  <ul>',
    '    <li>Revenue was off the chart.</li>',
    '    <li>Profits were higher than ever.</li>',
    '  </ul>',
    '  <p></p>',
    '  <p><i>Everything</i> is going according to <b>plan</b>.</p>',
    '</blockquote>'
]))

test('checkmark', createMdTest([
    '- [ ] unchecked',
    '- [x] checked'
], [
    '<input type="checkbox" id="input_checkbox_1"/><label for="input_checkbox_1">unchecked</label><br>',
    '<input type="checkbox" id="input_checkbox_2" checked/><label for="input_checkbox_2">checked</label><br>'
]));

